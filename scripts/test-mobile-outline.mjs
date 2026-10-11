import test from 'node:test'
import assert from 'node:assert/strict'
import { Readable } from 'node:stream'
import { readFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import path from 'node:path'
import { withPresentationProjections, mobileProjectionAllowed } from '../lib/session-presentation.js'
import { buildBoundedHistoryWindow } from '../lib/history-service.js'
import { createHistoryPageReader } from '../lib/dsh-protocol-compat.js'
import { DshRealtimeCompatibility } from '../lib/dsh-realtime-compat.js'

// Synthetic data only: this regression never opens or writes a DSH profile.
const outline = Array.from({ length: 386 }, (_, i) => ({ turn: i + 1, seq: i * 6,
  prompt: '问'.repeat(50), response: '答'.repeat(120) }))
const block = { asOfSeq: 2315, futureMetadata: { retain: true }, values: { turnOutline: outline,
  permissions: { currentValue: 'read-only', options: [] }, title: '合成测试',
  sessionStats: { turns: 386 }, futurePluginState: { retain: true } } }
const row = { event: { seq: 2315, time: 10, type: 'turn/end', data: { turn: 386, reason: { kind: 'completed' } } } }
const page = projections => buildBoundedHistoryWindow({ sessionId: 'synthetic' },
  async () => ({ ok: true, value: { events: [row], hasMore: true, projections } }), new AbortController().signal)
function freeze(value) {
  if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value) }
  return value
}

test('without compact, the full turn index alone exceeds budget; the mobile copy retains all other state', async () => {
  const source = freeze(structuredClone(block)), before = JSON.stringify(source)
  assert(Buffer.byteLength(JSON.stringify(source.values.turnOutline)) > 128 * 1024)
  const old = await page(source)
  assert.equal(old.ok, false)
  assert.match(old.error.message, /原生历史分组或状态信息超过单页预算/)
  const filtered = withPresentationProjections(source)
  assert(!Object.hasOwn(filtered.values, 'turnOutline'))
  for (const key of ['permissions', 'title', 'sessionStats', 'futurePluginState']) {
    assert.deepEqual(filtered.values[key], source.values[key])
  }
  assert.deepEqual(filtered.values['agent.metrics.v1'], { turns: 386 })
  assert.equal(filtered.futureMetadata, source.futureMetadata)
  assert.equal(filtered.asOfSeq, source.asOfSeq)
  assert.equal(JSON.stringify(source), before)
  const fixed = await page(filtered)
  assert.equal(fixed.ok, true)
  assert(Buffer.byteLength(JSON.stringify(fixed.value)) <= 128 * 1024)
  assert.equal(fixed.value.events.at(-1).event.seq, 2315)
  assert.equal(fixed.value.hasMore, true)
})

test('filter is exact; existing permission catalog compatibility and unknown oversized-state guard survive', async () => {
  assert.equal(mobileProjectionAllowed('turnOutline'), false)
  for (const key of ['TurnOutline', 'turnOutline.v2', 'future', '', null, undefined]) assert(mobileProjectionAllowed(key))
  for (const absent of [null, undefined, {}, { asOfSeq: 0 }]) assert.equal(withPresentationProjections(absent), absent)
  assert.deepEqual(withPresentationProjections({ asOfSeq: 0, values: {} }), { asOfSeq: 0, values: {} })
  const catalog = { options: [{ value: 'read-only', name: '只读' }] }
  const native = freeze({ values: { turnOutline: outline, permissions: { currentValue: 'read-only' }, future: { a: 1 } } })
  const copy = withPresentationProjections(native, catalog)
  assert.deepEqual(copy.values.permissions, { currentValue: 'read-only', options: catalog.options })
  assert.equal(copy.values.future, native.values.future)
  assert(!Object.hasOwn(native.values.permissions, 'options'))
  const result = await page(withPresentationProjections({ values: { future: 'x'.repeat(200000) } }))
  assert.equal(result.ok, false, 'unknown state must not be silently deleted or the budget enlarged')
})

test('latest snapshot and reduced-tail reader paths filter the index; earlier pages retain native cursor semantics', async () => {
  const native = freeze(structuredClone(block)), calls = []
  const gateway = {
    async invoke(call) {
      calls.push(call)
      if (call.method === 'list') return { items: [{ sessionId: 'synthetic' }] }
      assert.equal(call.method, 'page')
      return { records: [{ type: 'event', event: row.event }], hasMore: true }
    },
    async *stream(call) {
      calls.push(call); assert.equal(call.method, 'follow')
      yield { type: 'snapshot', cursor: 2315, hasMore: true,
        records: [{ type: 'event', event: row.event }], projections: native }
    },
  }
  const reader = createHistoryPageReader(gateway, 'synthetic', new AbortController().signal)
  const first = await reader({ maxMessages: 30 }), reduced = await reader({ maxMessages: 4 })
  for (const result of [first, reduced]) {
    assert(!Object.hasOwn(result.projections.values, 'turnOutline'))
    assert.equal(result.projections.values.futurePluginState, native.values.futurePluginState)
    assert.equal(result.historyEndSeq, 2315)
  }
  assert.deepEqual(first.projections, reduced.projections)
  const earlier = await reader({ maxMessages: 4, beforeSeq: 20 })
  assert(!Object.hasOwn(earlier, 'projections'))
  assert.equal(calls.filter(c => c.method === 'follow').length, 1)
  assert(calls.filter(c => c.method === 'page').every(c => c.args.request.throughSeq === 2315))
  assert.equal(calls.at(-1).args.request.beforeSeq, 20)
  assert.deepEqual(native, block)
})

function realtime(t) {
  const sources = new Map()
  const open = (key, signal) => {
    const stream = new Readable({ objectMode: true, read() {} })
    signal.addEventListener('abort', () => stream.destroy(), { once: true })
    sources.set(key, stream)
    return stream
  }
  const gateway = { invoke: async () => assert.fail('must not mutate or load sessions'),
    stream: async ({ namespace, method, signal }) => open(namespace + '/' + method, signal),
    wireStream: { open: async (_e, _p, signal) => open('$events', signal) } }
  const adapter = new DshRealtimeCompatibility({ get: key => key === 'typertGateway' ? gateway : undefined })
  t.after(() => adapter.dispose())
  const peer = { readyState: 1, bufferedAmount: 0, frames: [], closes: [],
    send(raw) { this.frames.push(JSON.parse(raw).payload) },
    close(...args) { this.readyState = 3; this.closes.push(args) } }
  const detach = adapter.connect('/api/events.mux', peer)
  return { sources, adapter, peer, detach }
}
async function until(predicate) {
  for (let i = 0; i < 100; i++) { if (predicate()) return; await new Promise(r => setTimeout(r, 5)) }
  assert.fail('realtime condition did not become true')
}

test('baseline, incremental and reconnect realtime omit only turnOutline; native frames and queues stay intact', async t => {
  const { sources, adapter, peer, detach } = realtime(t)
  const baseline = freeze({ type: 'baseline', value: { projections: { s: block }, queues: { s: [{ key: 'turnOutline', text: 'retained queue item' }] } } })
  const before = JSON.stringify(baseline)
  sources.get('session/control').push(baseline)
  sources.get('session/control').push({ type: 'projection', sessionId: 's', key: 'turnOutline', seq: 2316, value: outline })
  sources.get('session/control').push({ type: 'projection', sessionId: 's', key: 'futurePluginState', seq: 2317, value: { retain: 'updated' } })
  await until(() => peer.frames.some(f => f.seq === 2317))
  assert(!peer.frames.some(f => f.type === 'session/projection' && f.key === 'turnOutline'))
  assert(peer.frames.some(f => f.key === 'sessionStats' && f.value.turns === 386))
  assert(peer.frames.some(f => f.key === 'agent.metrics.v1' && f.value.turns === 386))
  assert(peer.frames.some(f => f.type === 'session/queue' && f.items[0].key === 'turnOutline'))
  assert.deepEqual(peer.closes, [])
  assert.equal(JSON.stringify(baseline), before)
  detach()
  peer.frames.length = 0
  adapter.connect('/api/events.mux', peer)
  sources.get('session/control').push(baseline)
  await until(() => peer.frames.some(f => f.key === 'futurePluginState'))
  assert(!peer.frames.some(f => f.key === 'turnOutline'))
})

test('realtime filtering does not remove the slow-consumer guard', async t => {
  const { sources, peer } = realtime(t)
  peer.bufferedAmount = 1024 * 1024 * 16
  sources.get('session/control').push({ type: 'projection', sessionId: 's', key: 'futurePluginState', seq: 1, value: {} })
  await until(() => peer.closes.length > 0)
  assert.deepEqual(peer.closes, [[1009, 'realtime consumer is too slow']])
  assert.equal(peer.frames.length, 0)
})

// Optional native-source contract. Pin the reviewed rc.1/rc.2 outline source,
// rather than silently using another workspace or fetching mutable upstream.
// No actual LLM compact, user data or native session writes are performed.
test('reviewed native outline fold is unchanged by manual compact events', {
  skip: !process.env.HARNESS_DSH_SOURCE_DIR && 'set HARNESS_DSH_SOURCE_DIR to a reviewed official source archive',
}, async () => {
  const source = (await readFile(path.join(process.env.HARNESS_DSH_SOURCE_DIR,
    'packages/session/session-turn-outline/src/projection.ts'), 'utf8')).replaceAll('\r\n', '\n')
  assert.equal(createHash('sha256').update(source).digest('hex'), 'f665285cdaf35102e0b0b823eb4f47ba75bf86a23974ea5ebcf3130ca1fdec9e',
    'review the native contract before accepting a changed source version')
  const ts = (await import('typescript')).default
  const tree = ts.createSourceFile('projection.ts', source, ts.ScriptTarget.Latest, true)
  const preview = tree.statements.find(n => ts.isFunctionDeclaration(n) && n.name?.text === 'preview')
  const declaration = tree.statements.filter(ts.isVariableStatement).flatMap(n => [...n.declarationList.declarations])
    .find(n => n.name.getText(tree) === 'turnOutlineProjectionDefinition')
  let expression = declaration.initializer
  while (ts.isSatisfiesExpression(expression) || ts.isAsExpression(expression)) expression = expression.expression
  const apply = expression.properties.find(n => n.name?.getText(tree) === 'apply').initializer
  const js = ts.transpileModule(`${preview.getText(tree)}\nconst fold = ${apply.getText(tree)};`,
    { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText
  const fold = new Function('PROMPT_PREVIEW_LIMIT', 'RESPONSE_PREVIEW_LIMIT', `${js}\nreturn fold`)(50, 120)
  const state = freeze({ turns: structuredClone(outline), draft: '' })
  const events = [
    { type: 'command/run', data: { name: 'compact', args: '' } },
    { type: 'compaction/start', data: { turn: null } },
    { type: 'user/message', data: { source: { kind: 'compact-checkpoint' }, content: [{ type: 'text', text: '摘要' }] } },
    { type: 'compaction/end', data: { turn: null } },
    { type: 'command/done', data: { kind: 'completed' } },
  ]
  assert.equal(events.reduce(fold, state), state)
  for (const values of [state.turns, events.reduce(fold, state).turns]) {
    assert.equal((await page({ values: { turnOutline: values } })).ok, false)
    assert.equal((await page(withPresentationProjections({ values: { turnOutline: values } }))).ok, true)
  }
})
