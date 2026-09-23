import assert from 'node:assert/strict'
import { test } from 'node:test'
import { TYPERT } from '../lib/typert.host.js'
import { attachLegacySchemaAccess } from '../lib/typert-schema-compat.js'
import { usesDuplexEvents, workspaceReadArguments, nativeFileBytes, projectedSubagentCatalog } from '../lib/dsh-host-contract.js'
import { presentToolResult, toolResultFailed } from '../lib/tool-result-compat.js'
import { toolRecordPresentation } from '../lib/tool-record-presentation.js'
import { historyDetailDocument, historyRecordPreview } from '../lib/history-record-presentation.js'
import { TurnActivityCompatibility } from '../lib/turn-activity.js'
import { nativeInstallSessions, quiesceNativeHost } from '../lib/install-control.js'

test('final generated manifest exposes identical strict schemas to old and new loaders', () => {
  assert.equal(TYPERT.invocations.length, 17)
  for (const i of TYPERT.invocations) for (const c of [...i.parameters.map(p => p.codec), i.result, i.receiver?.codec]) {
    if (c?.mode !== 'strict') continue
    assert.equal(typeof c.create, 'function')
    assert.equal(c.schema, c.create())
    assert.equal(typeof c.schema.safeParse, 'function')
  }
  let calls = 0
  const schema = {}, codec = { create: () => { calls++; return schema } }
  attachLegacySchemaAccess({ schemas: [codec], invocations: [] })
  assert.equal(calls, 0, 'new host import must not materialize legacy schemas')
  assert.equal(codec.schema, schema)
})

test('all eight host versions select the correct carrier generation', () => {
  for (const v of ['0.1.5-rc.1', '0.1.5-rc.2', '0.1.5-rc.3', '0.1.6-alpha.1', '0.1.6-alpha.2']) assert.equal(usesDuplexEvents(v), false)
  for (const v of ['0.1.7-alpha.1', '0.1.7-alpha.2', '0.1.7-rc.1']) assert.equal(usesDuplexEvents(v), true)
  assert.throws(() => usesDuplexEvents('not-a-version'))
})

test('file arguments follow live descriptors; withdrawn/unknown contracts fail closed', () => {
  const input = { path: 'a.png', range: { offset: 0, length: 3 } }
  const ctx = fields => ({ get: () => ({ local: { get: () => ({ parameters: fields.map(wire => ({ wire })) }) } }) })
  assert.equal(workspaceReadArguments(ctx(['range']), input), input)
  assert.deepEqual(workspaceReadArguments(ctx(['options']), input), { path: 'a.png', options: { range: input.range } })
  assert.throws(() => workspaceReadArguments(ctx(['unknown']), input))
  assert.throws(() => workspaceReadArguments({ get: () => ({ local: { get: () => undefined, hasSeen: () => true } }) }, input))
  const bytes = Buffer.from([0, 128, 255])
  assert.deepEqual(nativeFileBytes(new Uint8Array(bytes)), bytes)
  assert.deepEqual(nativeFileBytes(bytes.toString('base64')), bytes)
  assert.throws(() => nativeFileBytes({ data: 'not bytes' }))
})

test('native parent projections preserve child mode, status and authority in the mobile catalog', () => {
  const projection = { values: { subagentCatalog: [{ id: 'child', mode: 'continuable', label: 'worker' }, { id: 'future', mode: 'unknown' }] } }
  const rows = [{ sessionId: 'parent', agentAvailable: true }, { sessionId: 'child', parentSessionId: 'parent', origin: 'subagent', running: true }, { sessionId: 'nested', parentSessionId: 'child', origin: 'subagent' }]
  const result = projectedSubagentCatalog('parent', projection, rows)
  assert.equal(result.parentAvailable, true)
  assert.deepEqual(result.entries[0], { id: 'child', kind: 'child', mode: 'continuable', label: 'worker', activity: 'running', hasChildren: true })
  assert.equal(result.entries[1].kind, 'diagnostic')
  assert.throws(() => projectedSubagentCatalog('parent', null, rows))
  assert.throws(() => projectedSubagentCatalog('wrong-parent', projection, rows), /归属/)
  assert.throws(() => projectedSubagentCatalog('parent', { values: { subagentCatalog: [projection.values.subagentCatalog[0], projection.values.subagentCatalog[0]] } }, rows), /不完整/)
  assert.equal(projectedSubagentCatalog('parent', projection, []).parentAvailable, false)
})

function result(isError = true) {
  return { event: { type: 'tool/result', seq: 2, surfaceOp: 'append', data: { turn: 1,
    message: { id: 'r1', role: 'tool', source: { kind: 'tool', callId: 'c1' }, toolCallId: 'c1', isError,
      content: [{ type: 'text', text: 'result' }, { type: 'image', attachment: { attachmentId: 'img1' } }] } } } }
}
test('V4 mobile projection preserves failed status, content and identities without mutating native records', () => {
  const native = result(), before = JSON.stringify(native)
  const projected = toolRecordPresentation(native)
  assert.equal(projected.event.data.message.content[0].type, 'tool-result')
  assert.equal(toolResultFailed(projected.event.data.message), true)
  assert.equal(projected.event.data.message.id, 'r1')
  assert.equal(projected.event.seq, 2)
  assert.deepEqual(projected.event.data.message.content[0].content, native.event.data.message.content)
  assert.equal(JSON.stringify(native), before)
  assert.equal(presentToolResult(projected), projected)
  assert.equal(toolResultFailed(historyRecordPreview(projected).event.data.message), true)
  assert(historyDetailDocument(native).parts.some(p => p.kind === 'notice' && /未成功/.test(p.text)))
  assert.equal(toolResultFailed(presentToolResult(result(false)).event.data.message), false)
})
test('failed V4 file tools never create success/change facts', () => {
  const activity = new TurnActivityCompatibility()
  activity.accept({ type: 'turn/start', seq: 0, data: { turn: 1 } })
  activity.accept({ type: 'tool/call', seq: 1, data: { turn: 1, callId: 'c1', name: 'write', arguments: JSON.stringify({ file_path: 'never-created', content: 'x' }) } })
  assert.equal(activity.accept(result().event), undefined)
  assert.deepEqual(activity.accept(result(false).event)?.changedFiles, [{ reference: 'never-created' }])
})
test('installer native read works independently of a broken gateway and never assumes an unreadable host is idle', async () => {
  const items = [{ sessionId: 's1', running: false }]
  const controller = { async list(request, signal) { assert.deepEqual(request, {}); signal.throwIfAborted(); return { items } } }
  const ctx = { get: name => { if (name === 'sessionController') return controller; throw Error('broken gateway must not be touched') } }
  assert.deepEqual(await nativeInstallSessions(ctx, new AbortController().signal), { items })
  items[0].running = true
  assert.equal((await nativeInstallSessions(ctx, new AbortController().signal)).items[0].running, true)
  items[0].running = undefined
  await assert.rejects(nativeInstallSessions(ctx, new AbortController().signal), /不完整/)
  await assert.rejects(nativeInstallSessions({ get: () => undefined }, new AbortController().signal), /不可用/)
  await assert.rejects(nativeInstallSessions(ctx, AbortSignal.abort()))
})
test('repair keeps mandatory idle checks on both sides of durable flush', async () => {
  let disposed = 0, flushed = 0, checks = 0
  const ctx = { get: () => ({ list: () => [{}], flush: async () => { flushed++; return true } }), fiber: { dispose: async () => { disposed++ } } }
  await assert.rejects(quiesceNativeHost(ctx, async () => ({ items: [{ running: true }] }), () => {}), /等待/)
  assert.equal(flushed, 0); assert.equal(disposed, 0)
  await assert.rejects(quiesceNativeHost(ctx, async () => ({ items: [{ running: ++checks > 1 }] }), () => {}), /新会话/)
  assert.equal(flushed, 1); assert.equal(disposed, 0)
  await quiesceNativeHost(ctx, async () => ({ items: [{ running: false }] }), () => {})
  assert.equal(disposed, 1)
})
