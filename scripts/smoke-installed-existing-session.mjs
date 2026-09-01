import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { WebSocket } from 'ws'

const options = parseArgs(process.argv.slice(2))
const baseUrl = new URL(options['base-url'] || 'http://127.0.0.1:3092')
const stateFile = options['state-file']
const sessionId = options['session-id']
const prompt = options.prompt || '只回复 EXISTING_STREAM_OK'
if (!stateFile) throw new Error('--state-file is required')
if (!sessionId) throw new Error('--session-id is required')

const state = JSON.parse(await readFile(stateFile, 'utf8'))
assert.equal(typeof state.token, 'string', 'gate state does not contain a token')
const authorization = `Bearer ${state.token}`
const events = createEventCollector('/api/events.mux')

try {
  await events.opened
  const listed = valueOf('session.list', await rpc('session.list', {}))
  assert.ok(listed.items?.some(item => item.sessionId === sessionId), 'existing session is missing')

  const history = valueOf('session.history', await rpc('session.history', {
    sessionId,
    maxMessages: 16,
  }))
  const subscribed = await events.waitFor(frame => frame?.payload?.type === 'session/subscribed'
    && frame.payload.sessionId === sessionId)
  const openingCursor = Number(subscribed.payload.lastSeq)

  assertOk('session.prompt', await rpc('session.prompt', {
    sessionId,
    mode: 'queue',
    content: [{ type: 'text', text: prompt }],
  }))

  await events.waitFor(frame => isNewSessionEvent(frame, openingCursor)
    && frame.payload.event?.type === 'assistant/chunk', 45_000)
  await events.waitFor(frame => isNewSessionEvent(frame, openingCursor)
    && frame.payload.event?.type === 'turn/end', 60_000)

  const live = events.matching(frame => isNewSessionEvent(frame, openingCursor))
  const deltas = live.filter(frame => {
    const chunk = frame.payload.event?.data?.chunk
    return frame.payload.event?.type === 'assistant/chunk'
      && ['text-delta', 'reasoning-delta', 'tool-call-delta'].includes(chunk?.type)
  })
  assert.ok(deltas.length > 0, 'existing session produced no realtime delta')
  console.log(JSON.stringify({
    ok: true,
    sessionId,
    openingCursor,
    historyEvents: Array.isArray(history.events) ? history.events.length : 0,
    realtimeEvents: live.length,
    deltaFrames: deltas.length,
    rangedDeltaFrames: deltas.filter(frame => Number(frame.payload.event.seqEnd)
      > Number(frame.payload.event.seq)).length,
  }))
} finally {
  events.close()
}

function isNewSessionEvent(frame, cursor) {
  return frame?.payload?.type === 'session/event'
    && frame.payload.sessionId === sessionId
    && Number(frame.payload.event?.seq) > cursor
}

function createEventCollector(eventPath) {
  const target = new URL(eventPath, baseUrl)
  target.protocol = target.protocol === 'https:' ? 'wss:' : 'ws:'
  const frames = []
  const waiters = new Set()
  const socket = new WebSocket(target, { headers: { authorization } })
  const opened = new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(`${eventPath}: open timeout`)), 8_000)
    socket.once('open', () => { clearTimeout(timeout); resolve() })
    socket.once('error', error => { clearTimeout(timeout); reject(error) })
  })
  socket.on('message', data => {
    try {
      frames.push(JSON.parse(Buffer.from(data).toString('utf8')))
      for (const waiter of waiters) waiter()
    } catch {}
  })
  return {
    opened,
    async waitFor(predicate, timeoutMs = 8_000) {
      const existing = frames.find(predicate)
      if (existing) return existing
      return await new Promise((resolve, reject) => {
        const inspect = () => {
          const frame = frames.find(predicate)
          if (!frame) return
          cleanup()
          resolve(frame)
        }
        const timeout = setTimeout(() => {
          cleanup()
          reject(new Error(`${eventPath}: expected realtime event was not observed`))
        }, timeoutMs)
        const cleanup = () => { clearTimeout(timeout); waiters.delete(inspect) }
        waiters.add(inspect)
      })
    },
    matching(predicate) { return frames.filter(predicate) },
    close() { try { socket.terminate() } catch {} },
  }
}

async function rpc(method, payload) {
  const response = await fetch(new URL(`/api/${method}`, baseUrl), {
    method: 'POST',
    headers: { authorization, 'content-type': 'application/json' },
    body: JSON.stringify({
      type: 'client-request',
      rpcId: `existing-${randomUUID()}`,
      method,
      payload,
    }),
  })
  assert.equal(response.status, 200, `${method}: HTTP ${response.status}`)
  return (await response.json()).result
}

function assertOk(label, result) {
  assert.equal(result?.ok, true, `${label}: ${result?.error?.code || 'failed'} ${result?.error?.message || ''}`)
}

function valueOf(label, result) {
  assertOk(label, result)
  return result.value || {}
}

function parseArgs(argv) {
  const parsed = {}
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index]
    if (!key?.startsWith('--')) throw new Error(`invalid argument ${key || ''}`)
    parsed[key.slice(2)] = argv[index + 1]
  }
  return parsed
}
