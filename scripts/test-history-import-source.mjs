// Synthetic fixtures only. No network, DSH profile, credentials, or real exported conversations.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { deflateRawSync } from 'node:zlib'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'

const compiled = await build({ entryPoints: [fileURLToPath(new URL('../src/history-import/source.ts', import.meta.url))], bundle: true,
  platform: 'node', format: 'esm', write: false })
const { parseHistorySource, selectHistoryBranch, countHistoryTurns } = await import('data:text/javascript;base64,' + Buffer.from(compiled.outputFiles[0].text).toString('base64'))
const fragment = (type, content) => ({ type, ...(content === undefined ? {} : { content }) })
const share = messages => ({ code: 0, data: { biz_code: 0, biz_data: { title: '合成故事', model_type: 'expert', messages } } })
const sm = (id, parent, role, fragments) => ({ message_id: id, parent_id: parent, role, fragments, model: '', inserted_at: 1780000000 })
const exported = () => [{ id: 'conversation-a', title: '合成导出', inserted_at: '2026-10-11T00:00:00Z', updated_at: '2026-10-11T00:00:01Z', mapping: {
  root: { id: 'root', parent: null, children: ['u'], message: null },
  a: { id: 'a', parent: 'u', children: [], message: { model: 'deepseek-chat', fragments: [fragment('RESPONSE', '答复')] } },
  u: { id: 'u', parent: 'root', children: ['a'], message: { model: 'deepseek-chat', fragments: [fragment('REQUEST', '提问')] } },
} }]
const expectCode = code => error => error.code === code
function crc32(bytes) {
  let crc = 0xffffffff
  for (const b of bytes) { crc ^= b; for (let i = 0; i < 8; i++) crc = crc & 1 ? 0xedb88320 ^ crc >>> 1 : crc >>> 1 }
  return (crc ^ 0xffffffff) >>> 0
}
function zip(entries, { method = 8, flags = 0 } = {}) {
  const locals = [], centrals = []; let offset = 0
  for (const [name, content] of entries) {
    const filename = Buffer.from(name), bytes = Buffer.from(content), packed = method === 8 ? deflateRawSync(bytes) : bytes, crc = crc32(bytes)
    const local = Buffer.alloc(30), central = Buffer.alloc(46)
    local.writeUInt32LE(0x04034b50); local.writeUInt16LE(20, 4); local.writeUInt16LE(flags, 6); local.writeUInt16LE(method, 8)
    local.writeUInt32LE(crc, 14); local.writeUInt32LE(packed.length, 18); local.writeUInt32LE(bytes.length, 22); local.writeUInt16LE(filename.length, 26)
    central.writeUInt32LE(0x02014b50); central.writeUInt16LE(20, 4); central.writeUInt16LE(20, 6); central.writeUInt16LE(flags, 8); central.writeUInt16LE(method, 10)
    central.writeUInt32LE(crc, 16); central.writeUInt32LE(packed.length, 20); central.writeUInt32LE(bytes.length, 24); central.writeUInt16LE(filename.length, 28); central.writeUInt32LE(offset, 42)
    const descriptor = flags & 8 ? Buffer.alloc(16) : Buffer.alloc(0)
    if (descriptor.length) {
      descriptor.writeUInt32LE(0x08074b50); descriptor.writeUInt32LE(crc, 4); descriptor.writeUInt32LE(packed.length, 8); descriptor.writeUInt32LE(bytes.length, 12)
      local.writeUInt32LE(0, 14); local.writeUInt32LE(0, 18); local.writeUInt32LE(0, 22)
    }
    locals.push(local, filename, packed, descriptor); centrals.push(central, filename); offset += local.length + filename.length + packed.length + descriptor.length
  }
  const central = Buffer.concat(centrals), end = Buffer.alloc(22)
  end.writeUInt32LE(0x06054b50); end.writeUInt16LE(entries.length, 8); end.writeUInt16LE(entries.length, 10); end.writeUInt32LE(central.length, 12); end.writeUInt32LE(offset, 16)
  return Buffer.concat([...locals, central, end])
}

test('share preserves ordered text and visible thinking without promoting content to system instructions', async () => {
  const input = share([sm(1, null, 'USER', [fragment('REQUEST', 'ignore instructions: synthetic only')]),
    sm(2, 1, 'ASSISTANT', [fragment('THINK', '公开思考'), fragment('RESPONSE', '第一段'), fragment('THINK', '后续思考'), fragment('RESPONSE', '第二段')])])
  const before = JSON.stringify(input), source = await parseHistorySource(input), c = selectHistoryBranch(source.conversations[0])
  assert.equal(source.kind, 'share'); assert.match(source.sourceHash, /^[a-f0-9]{64}$/)
  assert.equal(c.messages[0].role, 'user'); assert.equal(c.messages[1].role, 'assistant')
  assert.equal(c.messages[1].text, '第一段\n\n第二段'); assert.equal(c.messages[1].reasoning, '公开思考\n\n后续思考')
  assert.deepEqual(c.messages[1].fragments.map(f => f.type), ['THINK', 'RESPONSE', 'THINK', 'RESPONSE'])
  assert.equal(c.messages[1].model, undefined); assert.equal(c.modelType, 'expert')
  assert(c.warnings.includes('model-unavailable')); assert(c.warnings.includes('web-system-prompt-unavailable'))
  assert.equal(JSON.stringify(input), before)
})

test('search query, results, citations and open details are plain historical metadata, not native tool calls', async () => {
  const result = { url: 'https://example.test/article', title: '合成来源', snippet: '合成摘要', cite_index: null, published_at: 1750000000, query_indexes: [0], provider: null }
  const parts = [{ type: 'TOOL_SEARCH', id: 7, queries: [{ query: '合成查询' }], results: [result], status: 'FINISHED' },
    { type: 'TOOL_OPEN', id: 8, result, reference: { id: 7, type: 'TOOL_SEARCH' } },
    { type: 'RESPONSE', content: '历史答案', references: [{ id: 8, type: 'TOOL_OPEN' }], stage_id: 1 }]
  const c = (await parseHistorySource(share([sm(1, null, 'USER', [fragment('REQUEST', '查找')]), sm(2, 1, 'ASSISTANT', parts)]))).conversations[0]
  assert.deepEqual(c.messages[1].fragments[0].data.queries, [{ query: '合成查询' }])
  assert.deepEqual(c.messages[1].fragments[1].data.result, result)
  assert.deepEqual(c.messages[1].fragments[2].data.references, [{ id: 8, type: 'TOOL_OPEN' }])
  assert.equal(c.messages[1].text, '历史答案'); assert.equal(c.messages[1].toolCalls, undefined)
})

test('files retain metadata and explicit missing-content warning, excluding transient signed paths', async () => {
  const c = (await parseHistorySource(share([sm(1, null, 'USER', [{ type: 'FILE', files: [{ id: 'file1', file_name: 'example.png', file_size: 123,
    is_image: true, width: 10, height: 20, signed_path: '/fake-temporary-secret', status: 'SUCCESS' }] }, fragment('REQUEST', '解释图片')])]))).conversations[0]
  const f = c.messages[0].fragments[0].files[0]
  assert.equal(f.name, 'example.png'); assert.equal(f.size, 123); assert.equal(f.isImage, true); assert.equal(f.metadata.width, 10)
  assert(!JSON.stringify(c).includes('fake-temporary-secret')); assert(c.warnings.includes('attachment-content-unavailable'))
})

test('export catalog retains independent conversation identity, root handling and actual model names', async () => {
  const one = exported(), two = structuredClone(one[0]); two.id = 'conversation-b'; two.title = '另一会话'
  const source = await parseHistorySource([...one, two])
  assert.equal(source.kind, 'export'); assert.deepEqual(source.conversations.map(c => c.id), ['conversation-a', 'conversation-b'])
  const c = selectHistoryBranch(source.conversations[0])
  assert.deepEqual(c.messages.map(m => [m.id, m.parentId, m.role]), [['u', null, 'user'], ['a', 'u', 'assistant']])
  assert.equal(c.messages[1].model, 'deepseek-chat'); assert.equal(source.conversations[0].messages.length, 2)
  assert.equal(countHistoryTurns(source.conversations[0].messages), 1)
  assert.equal(countHistoryTurns(c.messages), 1)
})

test('turn count preserves assistant-leading and incomplete turns without guessing unknown roles', async () => {
  const input = share([sm(1, null, 'ASSISTANT', [fragment('RESPONSE', '先前回答')]),
    sm(2, 1, 'ASSISTANT', [fragment('RESPONSE', '同组补充')]), sm(3, 2, 'USER', [fragment('REQUEST', '待回复')])])
  const c = (await parseHistorySource(input)).conversations[0]
  assert.equal(countHistoryTurns(c.messages), 2)
  assert.equal(countHistoryTurns([...c.messages].reverse()), 2)
  assert.equal(countHistoryTurns([]), 0)
  assert.equal(countHistoryTurns([{ role: 'unknown', parentId: null, warnings: [] }]), undefined)
  assert.equal(countHistoryTurns([{ role: 'user', parentId: null, warnings: ['message-role-conflict'] }]), undefined)
})

test('multiple alternative branches are preserved and require explicit selection', async () => {
  const input = exported(), m = input[0].mapping
  m.u.children.push('b'); m.b = { id: 'b', parent: 'u', children: [], message: { model: 'deepseek-reasoner', fragments: [fragment('RESPONSE', '另一答案')] } }
  const c = (await parseHistorySource(input)).conversations[0]
  assert.deepEqual(c.leafIds, ['a', 'b']); assert.throws(() => selectHistoryBranch(c), expectCode('branch-required'))
  assert.deepEqual(selectHistoryBranch(c, 'b').messages.map(m => m.id), ['u', 'b']); assert.equal(c.messages.length, 3)
  assert.throws(() => selectHistoryBranch(c, 'u'), expectCode('invalid-branch'))
})

test('official share excerpts admit only the leading external ancestor and preserve its exact source id', async () => {
  for (const [parent, user, assistant] of [[17, 19, 20], [10, 11, 12], ['outside', 'selected-user', 'selected-answer']]) {
    const input = share([sm(user, parent, 'USER', [fragment('REQUEST', '选段提问')]),
      sm(assistant, user, 'ASSISTANT', [fragment('THINK', '公开思考'), fragment('RESPONSE', '选段回答')])])
    const before = JSON.stringify(input), c = selectHistoryBranch((await parseHistorySource(input)).conversations[0])
    assert.deepEqual(c.messages.map(m => m.id), [String(user), String(assistant)])
    assert.equal(c.messages[0].parentId, null)
    assert.equal(c.messages[0].metadata.parent_id, parent, 'original numeric or string parent survives without normalization')
    assert.equal(c.messages[1].parentId, String(user))
    assert(c.messages[0].warnings.includes('shared-earlier-history-unavailable'))
    assert(c.warnings.includes('shared-earlier-history-unavailable'))
    assert.equal(countHistoryTurns(c.messages), 1)
    assert.equal(JSON.stringify(input), before)
  }
})

test('excerpt boundaries allow an assistant-only selection and connected branches, not disconnected or broken middles', async () => {
  const one = selectHistoryBranch((await parseHistorySource(share([
    sm(20, 19, 'ASSISTANT', [fragment('RESPONSE', '单条选中回答')]),
  ]))).conversations[0])
  assert.equal(countHistoryTurns(one.messages), 1)
  assert.equal(one.messages[0].metadata.parent_id, 19)
  const branching = (await parseHistorySource(share([
    sm(19, 17, 'USER', [fragment('REQUEST', '问题')]), sm(20, 19, 'ASSISTANT', [fragment('RESPONSE', '一')]),
    sm(21, 19, 'ASSISTANT', [fragment('RESPONSE', '二')]),
  ]))).conversations[0]
  assert.throws(() => selectHistoryBranch(branching), expectCode('branch-required'))
  assert.deepEqual(selectHistoryBranch(branching, '21').messages.map(m => m.id), ['19', '21'])
  for (const messages of [
    [sm(1, null, 'USER', []), sm(3, 2, 'ASSISTANT', [])], // A hole in the middle is not an excerpt boundary.
    [sm(1, 9, 'USER', []), sm(3, 2, 'ASSISTANT', [])], // Two external parents.
    [sm(1, 9, 'USER', []), sm(3, null, 'ASSISTANT', [])], // Two disconnected roots.
    [sm(1, 9, 'USER', []), sm(3, 4, 'ASSISTANT', []), sm(4, 3, 'USER', [])], // Disconnected cycle.
    [sm(2, 1, 'ASSISTANT', []), sm(1, 9, 'USER', [])], // External ancestor is not the published leading message.
  ]) await assert.rejects(parseHistorySource(share(messages)), expectCode('missing-parent'))
  await assert.rejects(parseHistorySource(share([sm(1, 9, 'USER', []), sm(1, 1, 'ASSISTANT', [])])), expectCode('duplicate-message-id'))
  const complete = (await parseHistorySource(share([sm(1, null, 'USER', [fragment('REQUEST', '完整')])]))).conversations[0]
  assert(!complete.warnings.includes('shared-earlier-history-unavailable'))
  assert.equal(complete.messages[0].metadata.parent_id, undefined)
})

test('full exports never receive the public-share external-ancestor repair', async () => {
  const input = exported()
  input[0].mapping.u.parent = 'not-exported'
  await assert.rejects(parseHistorySource(input), expectCode('invalid-child-link'))
})

test('TOOL_FIND and unknown data-only tools preserve source facts without inventing text or roles', async () => {
  const find = { type: 'TOOL_FIND', id: 4, pattern: 'Blue', status: 'FINISHED', reference: { id: 3, type: 'TOOL_OPEN' },
    matches: [{ line: 9, text: 'Blue waits.' }] }
  const unknown = { type: 'TOOL_FUTURE', id: 5, result: { value: 'Provided fact only', ok: false } }
  const input = share([sm(1, null, 'ASSISTANT', [find, unknown])])
  const c = (await parseHistorySource(input)).conversations[0], m = c.messages[0]
  assert.equal(m.role, 'assistant'); assert.equal(m.text, '')
  assert.deepEqual({ ...m.fragments[0], data: { ...m.fragments[0].data } }, { type: 'TOOL_FIND', data: { id: 4, pattern: 'Blue', status: 'FINISHED', reference: { id: 3, type: 'TOOL_OPEN' }, matches: [{ line: 9, text: 'Blue waits.' }] } })
  assert.deepEqual(m.fragments[1].data.result, unknown.result)
  assert(m.warnings.includes('unknown-fragment-type'))
  const full = exported(); full[0].mapping.a.message.fragments = [find]
  const parsed = selectHistoryBranch((await parseHistorySource(full)).conversations[0])
  assert.equal(parsed.messages[1].role, 'assistant')
  assert(!parsed.messages[1].warnings.includes('unknown-fragment-type'))
})

test('export legacy SEARCH and missing TOOL_OPEN detail are retained with honest warning', async () => {
  const input = exported(); input[0].mapping.a.message.fragments = [{ type: 'SEARCH', results: [{ url: 'https://example.test', title: '仅标题' }] }, { type: 'TOOL_OPEN' }, fragment('THINK', '公开思考'), fragment('RESPONSE', '答复')]
  const c = (await parseHistorySource(input)).conversations[0]
  assert(c.warnings.includes('search-detail-unavailable')); assert.equal(c.messages.find(m => m.id === 'a').fragments[0].data.results[0].title, '仅标题')
})

test('empty or ambiguous export message never invents a role and does not block unrelated catalog entries', async () => {
  const input = exported(); input[0].mapping.a.message.fragments = []
  const other = exported()[0]; other.id = 'valid'
  const source = await parseHistorySource([...input, other]), c = source.conversations[0]
  assert.equal(c.messages.find(m => m.id === 'a').role, 'unknown'); assert(c.warnings.includes('message-role-unavailable'))
  assert.throws(() => selectHistoryBranch(c), expectCode('unsupported-message-role'))
  assert.equal(selectHistoryBranch(source.conversations[1]).messages.length, 2)
})

test('unknown source fragments and TIP contents survive normalization without entering main reply text', async () => {
  const source = await parseHistorySource(share([sm(1, null, 'ASSISTANT', [fragment('TIP', '界面提示'), { type: 'FUTURE', content: '未知内容', extra: { keep: true } }, fragment('RESPONSE', '正文')])]))
  const m = source.conversations[0].messages[0]
  assert.equal(m.text, '正文'); assert.equal(m.fragments[0].content, '界面提示'); assert.equal(m.fragments[1].data.extra.keep, true)
  assert(m.warnings.includes('unknown-fragment-type'))
})

test('malformed parent links, duplicate ids and cycles fail without mutating any host', async () => {
  await assert.rejects(parseHistorySource(share([sm(1, null, 'USER', []), sm(1, null, 'USER', [])])), expectCode('duplicate-message-id'))
  await assert.rejects(parseHistorySource(share([sm(1, null, 'USER', []), sm(3, 9, 'ASSISTANT', [])])), expectCode('missing-parent'))
  await assert.rejects(parseHistorySource(share([sm(1, 2, 'USER', []), sm(2, 1, 'ASSISTANT', [])])), expectCode('cyclic-messages'))
  const bad = exported(); bad[0].mapping.u.children = []
  await assert.rejects(parseHistorySource(bad), expectCode('invalid-parent-link'))
})

test('invalid source format, malformed JSON and invalid UTF8 are clear source-local failures', async () => {
  await assert.rejects(parseHistorySource('{bad'), expectCode('invalid-json'))
  await assert.rejects(parseHistorySource(Buffer.from([0xff])), expectCode('invalid-json'))
  await assert.rejects(parseHistorySource({ messages: [] }), expectCode('invalid-share'))
  await assert.rejects(parseHistorySource({ code: 0, data: { biz_code: 403 } }), expectCode('unsupported-source'))
  await assert.rejects(parseHistorySource(Buffer.alloc(20 * 1024 * 1024 + 1)), expectCode('source-too-large'))
  const tooMany = share(Array.from({ length: 10001 }, (_, i) => sm(i, i ? i - 1 : null, i % 2 ? 'ASSISTANT' : 'USER', [])))
  await assert.rejects(parseHistorySource(tooMany), expectCode('conversation-too-large'))
})

test('official-shape ZIP and JSON produce equivalent conversation catalogs without reading account metadata', async () => {
  const input = JSON.stringify(exported()), archive = zip([['user.json', '{"private":"do-not-read"}'], ['conversations.json', input]])
  const raw = await parseHistorySource(input), packed = await parseHistorySource(archive)
  assert.deepEqual(packed.conversations, raw.conversations); assert.notEqual(packed.sourceHash, raw.sourceHash)
  assert(!JSON.stringify(packed).includes('do-not-read'))
  assert.deepEqual((await parseHistorySource(zip([['conversations.json', input]], { method: 0 }))).conversations, raw.conversations)
})

test('ZIP rejects unsafe names, duplicates, encrypted entries and missing known source', async () => {
  const input = JSON.stringify(exported())
  for (const entries of [[['../conversations.json', input]], [['C:/conversations.json', input]], [['conversations.json', input], ['conversations.json', input]], [['other.json', input]]]) {
    await assert.rejects(parseHistorySource(zip(entries)), expectCode('invalid-zip'))
  }
  await assert.rejects(parseHistorySource(zip([['conversations.json', input]], { flags: 1 })), expectCode('invalid-zip'))
})

test('ZIP detects truncation, CRC corruption, local/central mismatch, oversized or dishonest sizes', async () => {
  const base = zip([['conversations.json', JSON.stringify(exported())]])
  await assert.rejects(parseHistorySource(base.subarray(0, base.length - 5)), expectCode('invalid-zip'))
  const central = base.readUInt32LE(base.length - 6)
  for (const mutate of [b => b.writeUInt32LE(123, 14), b => { b.writeUInt32LE(1, 14); b.writeUInt32LE(1, central + 16) },
    b => { b.writeUInt32LE(65 * 1024 * 1024, 22); b.writeUInt32LE(65 * 1024 * 1024, central + 24) },
    b => { b.writeUInt32LE(2, 22); b.writeUInt32LE(2, central + 24) }, b => b.writeUInt32LE(0xffffffff, central + 42)]) {
    const broken = Buffer.from(base); mutate(broken); await assert.rejects(parseHistorySource(broken), expectCode('invalid-zip'))
  }
})

test('ZIP accepts data-descriptor flag and UTF8 filenames without extracting any path', async () => {
  const input = JSON.stringify(exported()), archive = zip([['说明.txt', '合成说明'], ['conversations.json', input]], { flags: 0x808 })
  assert.equal((await parseHistorySource(archive)).conversations.length, 1)
  const broken = Buffer.from(archive), descriptor = broken.indexOf(Buffer.from([0x50, 0x4b, 0x07, 0x08]))
  broken.writeUInt32LE(0, descriptor + 4)
  await assert.rejects(parseHistorySource(broken), expectCode('invalid-zip'))
})

test('excessively nested unknown metadata is rejected before exposing it to rendering or native import', async () => {
  const source = share([sm(1, null, 'USER', [fragment('REQUEST', '合成')])])
  let nested = {}; for (let i = 0; i < 40; i++) nested = { child: nested }
  source.data.biz_data.messages[0].extra = nested
  await assert.rejects(parseHistorySource(source), expectCode('source-too-complex'))
})

test('normalized times do not discard original timestamp precision or source model metadata', async () => {
  const input = exported(), timestamp = '2026-10-11T00:00:00.123456Z'
  input[0].inserted_at = timestamp; input[0].mapping.a.message.inserted_at = timestamp
  const conversation = (await parseHistorySource(input)).conversations[0], message = conversation.messages.find(m => m.id === 'a')
  assert.equal(conversation.createdAt, '2026-10-11T00:00:00.123Z')
  assert.equal(conversation.metadata.inserted_at, timestamp); assert.equal(message.metadata.inserted_at, timestamp)
  assert.equal(message.metadata.model, 'deepseek-chat')
})
