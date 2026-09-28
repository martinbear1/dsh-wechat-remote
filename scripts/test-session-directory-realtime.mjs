import assert from 'node:assert/strict'
import test from 'node:test'
import { Readable } from 'node:stream'
import { DshRealtimeCompatibility, legacyHostPayload } from '../lib/dsh-realtime-compat.js'

const tick = async () => { for (let i = 0; i < 40; i++) await new Promise(resolve => setImmediate(resolve)) }
function fixture(t) {
  const sources = new Map()
  const open = (key, signal) => {
    const source = new Readable({ objectMode: true, read() {} })
    const abort = () => source.destroy()
    signal.addEventListener('abort', abort, { once: true })
    source.once('close', () => signal.removeEventListener('abort', abort))
    sources.set(key, source)
    return source
  }
  const gateway = {
    invoke: async () => ({ items: [] }),
    stream: async ({ namespace, method, signal }) => open(namespace + '/' + method, signal),
    wireStream: { open: async (_endpoint, _payload, signal) => open('$events', signal) },
  }
  const adapter = new DshRealtimeCompatibility({ get: key => key === 'typertGateway' ? gateway : undefined })
  const peer = () => ({ readyState: 1, bufferedAmount: 0, frames: [], closes: [],
    send(value) { this.frames.push(JSON.parse(value).payload) },
    close(...args) { this.closes.push(args) },
  })
  const mux = peer(), host = peer()
  adapter.connect('/api/events.mux', mux)
  adapter.connect('/api/events.host', host)
  t.after(() => adapter.dispose())
  return { adapter, sources, mux, host }
}
const changed = peer => peer.frames.filter(frame => frame.type === 'host/session-added')

test('native activity invalidates the released client directory without inventing a row', () => {
  assert.deepEqual(legacyHostPayload({ type: 'emit', event: 'api-session/activity', args: ['desktop-new', 123] }),
    { type: 'host/session-added', sessionId: 'desktop-new' })
})

test('blank-to-visible and generated title reach the directory, not just open transcript state', async t => {
  const f = fixture(t), control = f.sources.get('session/control')
  control.push({ type: 'baseline', value: { projections: {} } })
  await tick()
  assert.equal(changed(f.mux).length, 0)
  control.push({ type: 'projection', sessionId: 'desktop-new', key: 'sessionListMetadata',
    seq: 8, value: { blank: false, lastPromptAt: 123 } })
  await tick()
  assert.equal(changed(f.mux).length, 1, 'old client must reload blank=true list row after first turn')
  control.push({ type: 'projection', sessionId: 'desktop-new', key: 'title', seq: 20, value: '公网测试' })
  await tick()
  assert.equal(changed(f.mux).length, 2, 'directory title must update without switching nodes')
  assert(f.mux.frames.some(frame => frame.type === 'session/projection' && frame.key === 'title'))
  assert.equal(changed(f.host).length, 0, 'one control frame must not fan out duplicate invalidations')
  for (let seq = 21; seq < 121; seq++) control.push({ type: 'projection', sessionId: 'desktop-new', key: 'tokenUsage', seq, value: {} })
  await tick()
  assert.equal(changed(f.mux).length, 2, 'do not reload the directory on token/streaming updates')
})

test('control reconnect baseline reconciles missed directory changes once', async t => {
  const f = fixture(t)
  f.sources.get('session/control').push({ type: 'baseline', value: { projections: {
    'web-old': { asOfSeq: 35, values: { title: '旧会话' } },
    'desktop-new': { asOfSeq: 20, values: { title: '新会话', sessionListMetadata: { blank: false } } },
  } } })
  await tick()
  assert.equal(changed(f.mux).length, 1, 'baseline invalidates once, not once per row or projection')
})

test('a native old-session ownership error does not stop updates for a new session', async t => {
  const f = fixture(t)
  const message = 'session "web-old" is already owned by an active write handle'
  f.sources.get('$events').push({ type: 'emit', event: 'api-session/error', args: ['web-old', message] })
  f.sources.get('$events').push({ type: 'emit', event: 'api-session/activity', args: ['desktop-new', 123] })
  await tick()
  assert.deepEqual(f.host.frames.find(frame => frame.type === 'host/agent-error'),
    { type: 'host/agent-error', sessionId: 'web-old', message }, 'do not hide or relabel native failures as the new session')
  assert.equal(changed(f.host).length, 1)
  assert.deepEqual(f.host.closes, [])
  assert.deepEqual(f.mux.closes, [])
})
