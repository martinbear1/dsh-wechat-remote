import test from 'node:test'
import assert from 'node:assert/strict'
import { buildBoundedHistoryWindow, buildHistoryWindow } from '../lib/history-service.js'
import { HistoryRecords, HISTORY_DETAIL_CHUNK_BYTES } from '../lib/history-records.js'
import { historyDetailDocument, historyRecordPreview } from '../lib/history-record-presentation.js'
import { assistantRecordPresentation } from '../lib/assistant-stream-compat.js'

const signal = new AbortController().signal
const event = (seq, type, data = {}) => ({ event: { seq, type, time: seq * 100, data } })
const large = (seq, text = '汉🙂'.repeat(160000)) => event(seq, 'tool/result', {
  turn: 1, message: { id: 'result-' + seq, source: { kind: 'tool', callId: 'call-' + seq },
    content: [{ type: 'text', text }] }, error: { name: 'ToolError', code: 'failed', message: '真实错误' },
})
const builder = (records, entries, extra = {}) => buildBoundedHistoryWindow({ sessionId: 's', ...extra.request },
  async () => ({ ok: true, value: { events: entries, hasMore: false, ...extra.value } }), signal,
  undefined, (original, displayed, call) => records.present('s', original, displayed, call))

test('short visible replies stay complete even when retained native token samples are large', async () => {
  const text = '完整正文，不能按隐藏数据大小截断。'.repeat(180)
  const source = event(3, 'assistant/message', { turn: 1, step: 1,
    message: { id: 'reply', role: 'assistant', content: [{ type: 'reasoning', text: '简短思考' }, { type: 'text', text }] },
    stream: [{ type: 'text-chunks', index: 1, time0: 1000, texts: Array(20000).fill('x'), dt: Array(19999).fill(1) }],
  })
  const before = JSON.stringify(source)
  const result = await builder(new HistoryRecords(), [event(0, 'turn/start', { turn: 1 }), source,
    event(4, 'turn/end', { turn: 1, reason: { kind: 'completed' } })])
  assert(result.ok)
  const row = result.value.events.find(row => row.event.seq === 3)
  assert.equal(row.detail, undefined, 'native stream size is not visible reply size')
  assert.equal(row.event.data.stream, undefined)
  assert.deepEqual(row.event.data.message, source.event.data.message)
  assert.equal(JSON.stringify(source), before, 'native records must not be changed')
})

test('ordinary 40 KiB inline tool body uses the page budget, not the detail chunk size', async () => {
  const source = event(3, 'tool/result', { message: { id: 'r', source: { kind: 'tool', callId: 'c' },
    content: [{ type: 'tool-result', content: 'visible line\n'.repeat(3500) }] } })
  const built = await builder(new HistoryRecords(), [source])
  assert(built.ok)
  assert.equal(built.value.events[0].detail, undefined)
  assert.deepEqual(built.value.events[0].event.data.message, source.event.data.message)
  assert(Buffer.byteLength(JSON.stringify(built.value)) <= 128 * 1024)
})

test('hidden tool metadata cannot force short output into a preview, known central-card metadata stays intact', async () => {
  const source = event(3, 'tool/result', { message: { id: 'r', source: { kind: 'tool', callId: 'c' },
    content: [{ type: 'text', text: 'visible' }] }, meta: {
      internalTrace: 'x'.repeat(200000), path: '/w/a', offset: 1, totalLines: 1,
      lines: [{ number: 1, text: 'visible', internal: 'x'.repeat(200000) }],
  } })
  const original = JSON.stringify(source)
  const built = await builder(new HistoryRecords(), [source])
  assert(built.ok)
  const rendered = built.value.events[0]
  assert.equal(rendered.detail, undefined)
  assert.deepEqual(rendered.event.data.meta, { path: '/w/a', offset: 1, totalLines: 1, lines: [{ number: 1, text: 'visible' }] })
  assert.equal(JSON.stringify(source), original)
})

test('interrupted attempt projection preserves all visible text and views before dropping samples', async () => {
  const source = event(3, 'assistant/attempt', { turn: 1, step: 1,
    stream: [{ type: 'reasoning-chunks', index: 0, time0: 1000, texts: ['思考中'] },
      { type: 'text-chunks', index: 1, time0: 2000, texts: Array(1200).fill('字'), dt: Array(1199).fill(10000000) }],
  })
  source.view = { agentResources: { schema: 'agent.resources.v1' } }
  const before = JSON.stringify(source)
  const presented = assistantRecordPresentation(source)
  assert(Buffer.byteLength(before) > 16 * 1024)
  assert.equal(presented.event.data.stream, undefined)
  assert.deepEqual(presented.view.agentResources, source.view.agentResources)
  assert.deepEqual(presented.view.agentTranscript.message.content,
    [{ type: 'reasoning', text: '思考中' }, { type: 'text', text: '字'.repeat(1200) }])
  assert.equal(assistantRecordPresentation(presented), presented, 'presentation is idempotent')
  const result = await builder(new HistoryRecords(), [source])
  assert(result.ok)
  assert.equal(result.value.events[0].detail, undefined)
  assert.deepEqual(result.value.events[0].view.agentTranscript, presented.view.agentTranscript)
  assert.equal(JSON.stringify(source), before)
})

test('presentation does not remove live chunks, tool data, or unfamiliar stream structures', () => {
  const examples = [event(1, 'assistant/chunk', { chunk: { type: 'text-delta', text: 'hello' } }),
    event(2, 'tool/result', { stream: ['tool-owned'] }),
    event(3, 'assistant/message', { stream: { future: true } })]
  for (const source of examples) assert.equal(assistantRecordPresentation(source), source)
})

test('large native record keeps its identity/outcome, bounded preview and unchanged source', async () => {
  const records = new HistoryRecords(), source = large(3), before = JSON.stringify(source)
  const result = await builder(records, [event(0, 'turn/start', { turn: 1 }), source, event(4, 'turn/end', { turn: 1, reason: { kind: 'completed' } })])
  assert(result.ok)
  assert(Buffer.byteLength(JSON.stringify(result.value)) <= 128 * 1024)
  const row = result.value.events.find(e => e.event.seq === 3)
  assert.equal(row.event.type, 'tool/result')
  assert.equal(row.event.data.error.code, 'failed')
  assert.equal(row.event.data.message.source.callId, 'call-3')
  assert.equal(row.detail.schema, 'agent.history-detail.v1')
  assert.equal(JSON.stringify(source), before)
})

test('details are byte-bounded, Unicode safe, continuous and only loaded on demand', async () => {
  const records = new HistoryRecords(), source = large(3), row = records.present('s', source)
  let loads = 0, text = '', offset = 0
  do {
    const page = await records.read({ sessionId: 's', reference: row.detail.reference, offset }, async () => { loads++; return source }, signal)
    assert(Buffer.byteLength(page.text) <= HISTORY_DETAIL_CHUNK_BYTES)
    assert.equal(page.text.includes('\uFFFD'), false)
    assert.equal(page.offset, offset)
    assert.equal(page.nextOffset - offset, Buffer.byteLength(page.text))
    text += page.text; offset = page.nextOffset
    if (page.eof) break
  } while (true)
  assert.equal(text, historyDetailDocument(source).parts[0].text)
  assert.equal(loads, 0, 'a bounded immutable snapshot is not re-read once per 16 KiB segment')
})

test('forged, cross-session, non-boundary and cancelled details fail before native read', async () => {
  const records = new HistoryRecords(), row = records.present('s', large(3))
  const noRead = async () => assert.fail('must not read native data')
  for (const request of [
    { sessionId: 'other', reference: row.detail.reference },
    { sessionId: 's', reference: row.detail.reference + 'x' },
    { sessionId: 's', reference: row.detail.reference, offset: -1 },
    { sessionId: 's', reference: row.detail.reference, offset: 2 },
  ]) await assert.rejects(records.read(request, noRead, signal))
  await assert.rejects(records.read({ sessionId: 's', reference: row.detail.reference }, noRead, AbortSignal.abort()), { name: 'AbortError' })
})

test('evicted snapshots reload only the pinned record; altered bytes never continue an old detail', async () => {
  const records = new HistoryRecords(), source = large(5), row = records.present('s', source)
  records.clear()
  const page = await records.read({ sessionId: 's', reference: row.detail.reference }, async seq => { assert.equal(seq, 5); return source }, signal)
  assert.equal(page.offset, 0)
  records.clear()
  await assert.rejects(records.read({ sessionId: 's', reference: row.detail.reference }, async () => large(5, 'changed'), signal), /变化/)
  await assert.rejects(records.read({ sessionId: 's', reference: row.detail.reference }, async () => undefined, signal), /不可读取/)
})

test('detail cache expiry reloads an unchanged record, reference expiry and restart never bypass it', async () => {
  const realNow = Date.now
  let now = realNow(), loads = 0
  Date.now = () => now
  try {
    const records = new HistoryRecords(), source = large(9), reference = records.present('s', source).detail.reference
    const request = { sessionId: 's', reference }
    const load = async seq => { loads++; assert.equal(seq, 9); return source }
    now += 4 * 60_000
    await records.read(request, load, signal); assert.equal(loads, 0)
    now += 2 * 60_000
    await records.read(request, load, signal); assert.equal(loads, 1)
    await records.read({ ...request, offset: 7 }, load, signal); assert.equal(loads, 1)
    const restarted = new HistoryRecords()
    await assert.rejects(restarted.read(request, load, signal), /引用无效/)
    assert.equal(loads, 1)
    now += 25 * 60_000
    await assert.rejects(records.read(request, load, signal), /失效/)
    assert.equal(loads, 1, 'expired reference must not even read native history')
  } finally { Date.now = realNow }
})

test('detail presentation excludes provider configuration, opaque metadata and image bytes', () => {
  const header = event(7, 'request/header', { model: 'model', provider: 'provider', apiKey: 'secret-key', config: { authorization: 'secret' } })
  assert.deepEqual(historyDetailDocument(header).parts.map(p => p.text), ['model', 'provider'])
  const result = large(3, 'public text')
  result.event.data.message.content.push({ type: 'image', data: 'binary-secret', url: 'credential-url' })
  result.event.data.meta = { token: 'never-render' }
  const text = JSON.stringify(historyDetailDocument(result))
  assert.match(text, /public text/)
  assert(!/binary-secret|credential-url|never-render/.test(text))
})

const call = (seq, name, args, callId = 'native-call') => event(seq, 'tool/call', { callId, name, arguments: JSON.stringify(args) })
const nativeResult = (seq, text, meta, isError = false) => event(seq, 'tool/result', {
  message: { id: 'native-result', source: { kind: 'tool', callId: 'native-call' },
    content: [{ type: 'tool-result', isError, content: [{ type: 'text', text }] }] }, meta,
})
test('native wrapped result preview preserves failure, opaque image identity and projection references', () => {
  const source = nativeResult(5, 'x'.repeat(100000), {}, true)
  const attachment = { attachmentId: 'provider/中文/' + 'a'.repeat(1800), mediaType: 'image/png', bytes: 200, width: 10, height: 10 }
  source.event.data.message.content[0].content.push({ type: 'image', attachment })
  source.view = { agentResources: { schema: 'agent.resources.v1', reference: 'https://example.test/' + 'x'.repeat(1500) } }
  const preview = new HistoryRecords().present('s', source)
  assert.equal(preview.event.data.message.content[0].isError, true)
  assert.deepEqual(preview.event.data.message.content[0].content[1].attachment, attachment)
  assert.deepEqual(preview.view, source.view)
  assert.equal(JSON.parse(historyDetailDocument(source).parts[1].text).attachmentId, attachment.attachmentId)
})

test('native string-valued tool results retain their body in previews and full detail', () => {
  const source = nativeResult(5, '', {}, true)
  const text = '汉🙂'.repeat(50000)
  source.event.data.message.content[0].content = text
  const before = JSON.stringify(source)
  assert.equal(historyDetailDocument(source).parts[0].text, text)
  const preview = historyRecordPreview(source).event.data.message.content[0]
  assert.equal(preview.isError, true)
  assert.equal(typeof preview.content, 'string')
  assert(text.startsWith(preview.content)); assert(preview.content.length <= 1200)
  assert(!/[\uD800-\uDBFF]$/.test(preview.content), 'do not cut a Unicode pair')
  assert.equal(JSON.stringify(source), before)
})

test('large native nested dispatch has a bounded preview, original identities and readable detail', async () => {
  const records = new HistoryRecords(), text = 'nested output\n'.repeat(12000)
  const original = event(8, 'tool/ptc-dispatch', { rootCallId: 'root', parentCallId: 'parent', subCallId: 'child',
    name: 'pwsh', arguments: { command: 'test' }, isError: true, content: [{ type: 'text', text }] })
  const before = JSON.stringify(original), row = records.present('s', original)
  assert.equal(row.event.type, 'tool/ptc-dispatch')
  assert.equal(row.event.data.subCallId, 'child'); assert.equal(row.event.data.parentCallId, 'parent')
  assert.equal(row.event.data.isError, true)
  assert(Buffer.byteLength(JSON.stringify(row)) < 17000)
  const detail = await records.read({ sessionId: 's', reference: row.detail.reference, part: 2 }, async () => assert.fail(), signal)
  assert.equal(detail.label, '输出'); assert(text.startsWith(detail.text)); assert.equal(detail.eof, false)
  assert.equal(JSON.stringify(original), before)
})
test('detail is plain native text and JSON regardless of the tool name; rich cards remain inline only', () => {
  const source = nativeResult(5, '<path>/w/中文.txt</path>\n<type>file</type>\n<content>\nhello\n</content>',
    { path: '/w/中文.txt', offset: 7, totalLines: 20, lines: [{ number: 7, text: 'hello' }] })
  const readCall = call(3, 'read', { file_path: '/w/中文.txt' })
  const plain = historyDetailDocument(source)
  assert.deepEqual(historyDetailDocument(source, readCall), plain)
  assert.deepEqual(historyDetailDocument(source, call(3, 'custom', {})), plain)
  assert.match(plain.parts[0].text, /<path>/)
  assert.equal(JSON.parse(plain.parts[1].text).lines[0].number, 7)
  source.event.data.meta.lines.push({ number: 2, text: 'bad order' })
  assert.equal(JSON.parse(historyDetailDocument(source).parts[1].text).lines[1].number, 2, 'raw data is not reinterpreted as a line renderer')
  const diff = nativeResult(6, 'success', { diffs: [{ path: '/w/a', oldText: 'old', newText: '' }] })
  const edit = call(4, 'edit', { file_path: '/w/a', old_string: 'old', new_string: '' })
  assert.deepEqual(JSON.parse(historyDetailDocument(diff, edit).parts[1].text).diffs, diff.event.data.meta.diffs)
  diff.event.data.message.content[0].isError = true
  assert(historyDetailDocument(diff, edit).parts.every(part => ['text', 'code', 'notice'].includes(part.kind)))
})
test('metadata as well as text is pinned; a changed diff cannot continue an evicted snapshot', async () => {
  const records = new HistoryRecords()
  const source = nativeResult(5, 'success', { diffs: [{ path: '/w/a', oldText: 'old', newText: 'x'.repeat(100000) }] })
  const edit = call(3, 'edit', { file_path: '/w/a', old_string: 'old', new_string: 'new' })
  const row = records.present('s', source, source, edit)
  const page = await records.read({ sessionId: 's', reference: row.detail.reference, part: 1 }, async () => assert.fail(), signal)
  assert.equal(page.kind, 'code'); assert.equal(page.partCount, 2)
  records.clear(); source.event.data.meta.diffs[0].newText = 'y'.repeat(100000)
  await assert.rejects(records.read({ sessionId: 's', reference: row.detail.reference, part: 1 }, async seq => seq === 3 ? edit : source, signal), /变化/)
})
test('unsupported mixed blocks are explicit and no arbitrary view/config becomes a detail document', () => {
  const source = nativeResult(5, 'visible', { password: 'hidden' })
  source.event.data.message.content[0].content.push({ type: 'custom-binary', data: 'hidden' })
  source.view = { custom: { secret: 'hidden' } }
  const document = historyDetailDocument(source)
  assert(document.parts.some(p => p.kind === 'notice'))
  assert(!JSON.stringify(document).includes('hidden'))
  assert(!JSON.stringify(historyRecordPreview(source)).includes('hidden'))
})

test('large single turn pages without extra reads or OSS, continuous backwards cursors', async () => {
  const records = new HistoryRecords()
  const entries = [event(0, 'turn/start', { turn: 1 }), ...Array.from({ length: 600 }, (_, i) =>
    event(i + 1, 'tool/call', { turn: 1, callId: 'c' + i, name: 'read', arguments: 'x'.repeat(900) })),
    event(601, 'turn/end', { turn: 1, reason: { kind: 'completed' } })]
  const seen = [], reads = []
  let beforeSeq
  for (;;) {
    const result = await buildBoundedHistoryWindow({ sessionId: 's', beforeSeq }, async request => {
      reads.push(request)
      return { ok: true, value: { events: entries.filter(e => beforeSeq === undefined || e.event.seq < beforeSeq), hasMore: false } }
    }, signal, undefined, (original, displayed) => records.present('s', original, displayed))
    assert(result.ok)
    assert(Buffer.byteLength(JSON.stringify(result.value)) <= 128 * 1024)
    assert(result.value.events.length <= 256)
    const from = result.value.historyStartSeq
    if (beforeSeq !== undefined) assert.equal(result.value.historyEndSeq, beforeSeq - 1)
    seen.unshift(...result.value.events.map(e => e.event.seq))
    beforeSeq = from
    if (!result.value.hasMore) break
  }
  assert(reads.length > 1)
  assert.deepEqual(seen, entries.map(e => e.event.seq))
})

test('sourceEventSeqs groups are not cut apart when selecting a page', async () => {
  const entries = Array.from({ length: 20 }, (_, i) => event(i, 'tool/call', { name: 'read', arguments: 'x'.repeat(12000), callId: 'c' + i }))
  entries[19].event.sourceEventSeqs = [17, 18]
  const result = await builder(new HistoryRecords(), entries)
  assert(result.ok)
  assert(result.value.events.some(e => e.event.seq === 17))
  assert(result.value.events.some(e => e.event.seq === 18))
  assert(result.value.historyStartSeq <= 17)
})

test('model-only replacements may cite earlier pages without blocking the latest reply', async () => {
  for (const type of ['system/message', 'user/message', 'tool/result']) {
    for (const surfaceOp of [{ op: 'replace', startSeq: 8, endSeq: 8 }, 'replace']) {
      const replacement = event(131, type, { turn: 2, message: { id: 'context', content: [{ type: 'text', text: 'updated context' }] } })
      Object.assign(replacement.event, { surfaceOp, sourceEventSeqs: [8] })
      const entries = [event(111, 'step/start', { turn: 1 }),
        event(125, 'turn/end', { turn: 1, reason: { kind: 'interrupted' } }),
        event(128, 'turn/start', { turn: 2 }), replacement,
        event(155, 'assistant/message', { turn: 2, message: { id: 'final', content: [{ type: 'text', text: 'final reply' }] } }),
        event(157, 'turn/end', { turn: 2, reason: { kind: 'completed' } })]
      const before = JSON.stringify(entries)
      let reads = 0
      const result = await buildBoundedHistoryWindow({ sessionId: 's', maxMessages: 8 }, async request => {
        assert.equal(request.maxMessages, 8)
        reads++
        return { ok: true, value: { events: entries, hasMore: true } }
      }, signal)
      assert(result.ok, JSON.stringify(result))
      assert.equal(reads, 1, 'do not backfill model context or expand the requested page')
      assert.equal(result.value.historyStartSeq, 111)
      assert.equal(result.value.historyEndSeq, 157)
      assert.equal(result.value.hasMore, true)
      assert.deepEqual(result.value.events.find(e => e.event.seq === 131).event, replacement.event, 'retain the native reference')
      assert.equal(result.value.events.find(e => e.event.seq === 155).event.data.message.content[0].text, 'final reply')
      assert.equal(JSON.stringify(entries), before, 'do not repair or mutate native history')
    }
  }
})

test('append and pre-surface-marker source groups still reject missing native sources', async () => {
  for (const surfaceOp of ['append', undefined]) {
    const result = event(20, 'tool/result', { turn: 1 })
    Object.assign(result.event, { sourceEventSeqs: [8], ...(surfaceOp ? { surfaceOp } : {}) })
    const built = await builder(new HistoryRecords(), [event(10, 'step/start', { turn: 1 }), result], { value: { hasMore: true } })
    assert.equal(built.ok, false, 'replacement handling must not disable source validation')
    assert.equal(built.error.code, 'history-pagination-invalid')
  }
})

test('an append group includes its sources but does not recursively pull a replacement into old model context', async () => {
  const replacement = event(12, 'system/message', { turn: 2 })
  Object.assign(replacement.event, { surfaceOp: { op: 'replace', startSeq: 1, endSeq: 1 }, sourceEventSeqs: [1] })
  const result = event(15, 'tool/result', { turn: 2 })
  Object.assign(result.event, { surfaceOp: 'append', sourceEventSeqs: [12, 14] })
  const entries = [event(10, 'step/start', { turn: 2 }), replacement, event(14, 'tool/call', { turn: 2 }), result]
  const built = await builder(new HistoryRecords(), entries, { value: { hasMore: true } })
  assert(built.ok, JSON.stringify(built))
  assert.deepEqual(built.value.events.map(e => e.event.seq), [10, 12, 14, 15])
})

test('replacement references do not defeat byte/event budgets or continuous backwards coverage', async () => {
  const entries = Array.from({ length: 340 }, (_, seq) => event(seq, 'step/start', { turn: 1, retained: 'x'.repeat(900) }))
  entries[0] = event(0, 'system/message', { turn: 1 })
  for (const seq of [270, 310, 338]) {
    entries[seq] = event(seq, 'system/message', { turn: 2 })
    Object.assign(entries[seq].event, { surfaceOp: { op: 'replace', startSeq: 0, endSeq: 0 }, sourceEventSeqs: [0] })
  }
  entries[339] = event(339, 'assistant/message', { turn: 2, message: { id: 'final', content: [{ type: 'text', text: 'final reply' }] } })
  const before = JSON.stringify(entries), seen = []
  let beforeSeq, reads = 0, pages = 0
  do {
    const result = await buildBoundedHistoryWindow({ sessionId: 's', beforeSeq }, async () => {
      reads++
      return { ok: true, value: { events: entries.filter(e => beforeSeq === undefined || e.event.seq < beforeSeq), hasMore: false } }
    }, signal)
    assert(result.ok, JSON.stringify(result)); pages++
    assert(Buffer.byteLength(JSON.stringify(result.value)) <= 128 * 1024)
    assert(result.value.events.length <= 256)
    if (beforeSeq !== undefined) assert.equal(result.value.coverage.throughSeq, beforeSeq - 1)
    else assert.equal(result.value.events.at(-1).event.seq, 339)
    seen.unshift(...result.value.events.map(e => e.event.seq))
    beforeSeq = result.value.historyStartSeq
    if (!result.value.hasMore) break
    assert(pages < 10, 'pagination must advance')
  } while (true)
  assert(pages > 1); assert.equal(reads, pages)
  assert.deepEqual(seen, entries.map(e => e.event.seq), 'no duplicate or missing records across page cuts')
  assert.equal(JSON.stringify(entries), before)
})

test('cancelled bounded reads cannot publish replacement-bearing history', async () => {
  const controller = new AbortController()
  const replacement = event(131, 'system/message', { turn: 2 })
  Object.assign(replacement.event, { surfaceOp: { op: 'replace', startSeq: 8, endSeq: 8 }, sourceEventSeqs: [8] })
  await assert.rejects(buildBoundedHistoryWindow({ sessionId: 's' }, async () => {
    controller.abort()
    return { ok: true, value: { events: [replacement], hasMore: true } }
  }, controller.signal), { name: 'AbortError' })
})

test('a partial native prefix is not completed by hidden extra reads', async () => {
  let reads = 0
  const result = await buildBoundedHistoryWindow({ sessionId: 's' }, async () => {
    reads++; return { ok: true, value: { events: [event(50, 'tool/call', { turn: 9, name: 'read', callId: 'x' })], hasMore: true } }
  }, signal)
  assert(result.ok)
  assert.equal(reads, 1)
  assert.equal(result.value.hasMore, true)
  assert.equal(result.value.historyStartSeq, 50)
})

test('legacy complete-turn behavior stays separate from the bounded contract', async () => {
  let reads = 0
  const result = await buildHistoryWindow({ sessionId: 's' }, async request => {
    reads++
    return { ok: true, value: { hasMore: request.beforeSeq === undefined, events: request.beforeSeq === undefined
      ? [event(1, 'tool/call', { turn: 1 })] : [event(0, 'turn/start', { turn: 1 })] } }
  }, signal)
  assert(result.ok); assert.equal(reads, 2); assert.equal(result.value.historyStartSeq, 0)
})
