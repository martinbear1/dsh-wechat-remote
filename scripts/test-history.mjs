import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { inflateRawSync } from 'node:zlib'

import { buildHistoryWindow, LatestHistoryWindowCache } from '../lib/history-service.js'
import { archiveHistoryJson } from '../lib/history-archive.js'
import { Context } from '@deepseek-ai/cordis'
import WechatHistoryService from '../lib/history-service.js'
import {
  bindHistorySnapshotPrewarmer,
  HistorySnapshotPrewarmer,
} from '../lib/history-prewarmer.js'

function unzipSingleEntry(archive) {
  const value = Buffer.from(archive)
  assert.equal(value.readUInt32LE(0), 0x04034b50)
  assert.equal(value.readUInt16LE(8), 8)
  const nameBytes = value.readUInt16LE(26)
  const extraBytes = value.readUInt16LE(28)
  const compressedBytes = value.readUInt32LE(18)
  const dataOffset = 30 + nameBytes + extraBytes
  assert.equal(value.subarray(30, 30 + nameBytes).toString('utf8'), 'history.json')
  return inflateRawSync(value.subarray(dataOffset, dataOffset + compressedBytes)).toString('utf8')
}

const archiveSource = JSON.stringify({
  events: Array.from({ length: 800 }, (_, index) => ({
    event: { seq: index, type: 'assistant/message', data: { message: '重复的历史内容 '.repeat(8) } },
  })),
})
const archive = archiveHistoryJson(archiveSource)
assert.equal(unzipSingleEntry(archive), archiveSource)
assert.ok(archive.length < Buffer.byteLength(archiveSource) / 5, 'history ZIP should materially reduce the encrypted payload')

const signal = new AbortController().signal
const calls = []
const completed = await buildHistoryWindow({
  sessionId: 'session-split',
  maxMessages: 8,
}, async payload => {
  calls.push(payload)
  if (payload.beforeSeq === 10) {
    return {
      ok: true,
      value: {
        hasMore: false,
        events: [
          { event: { type: 'turn/start', seq: 0, data: { turn: 7 } } },
          { event: { type: 'assistant/chunk', seq: 1, data: { turn: 7, chunk: { type: 'text-delta', text: 'discard' } } } },
          {
            event: { type: 'tool/result', seq: 2, data: { turn: 7 } },
            view: { view: { card: 'diff', diffs: [{ path: 'E:\\Project\\report.docx' }] } },
          },
        ],
      },
    }
  }
  return {
    ok: true,
    value: {
      hasMore: true,
      projections: { asOfSeq: 11, values: { title: '完整轮次' } },
      events: [
        { event: { type: 'assistant/chunk', seq: 10, data: { turn: 7, chunk: { type: 'text-delta', text: 'discard too' } } } },
        { event: { type: 'assistant/message', seq: 11, data: { turn: 7, message: { id: 'final' } } } },
        { event: { type: 'turn/end', seq: 12, data: { turn: 7, reason: { kind: 'completed' } } } },
      ],
    },
  }
}, signal)

assert.equal(completed.ok, true)
assert.equal(calls.length, 2)
assert.equal(calls[1].beforeSeq, 10)
assert.equal(completed.value.historyStartSeq, 0)
assert.equal(completed.value.historyEndSeq, 12)
assert.equal(completed.value.rawEvents, 6)
assert.equal(completed.value.pages, 2)
assert.equal(completed.value.events.some(entry => entry.event.type === 'assistant/chunk'), false)
assert.equal(completed.value.events.some(entry => entry.view?.view?.diffs?.[0]?.path === 'E:\\Project\\report.docx'), true)
assert.equal(completed.value.projections.values.title, '完整轮次')

const interrupted = await buildHistoryWindow({ sessionId: 'session-error' }, async () => ({
  ok: true,
  value: {
    hasMore: false,
    events: [
      { event: { type: 'turn/start', seq: 20, data: { turn: 8 } } },
      { event: { type: 'assistant/chunk', seq: 21, data: { turn: 8, chunk: { type: 'text-delta', text: 'must remain' } } } },
      { event: { type: 'turn/end', seq: 22, data: { turn: 8, reason: { kind: 'error' } } } },
    ],
  },
}), signal)

assert.equal(interrupted.ok, true)
assert.equal(interrupted.value.events.some(entry => entry.event.type === 'assistant/chunk'), true)

const completedWithoutDurableMessage = await buildHistoryWindow({ sessionId: 'session-no-final' }, async () => ({
  ok: true,
  value: {
    hasMore: false,
    events: [
      { event: { type: 'turn/start', seq: 30, data: { turn: 9 } } },
      { event: { type: 'assistant/chunk', seq: 31, data: { turn: 9, chunk: { type: 'text-delta', text: 'only durable copy' } } } },
      { event: { type: 'turn/end', seq: 32, data: { turn: 9, reason: { kind: 'completed' } } } },
    ],
  },
}), signal)

assert.equal(completedWithoutDurableMessage.ok, true)
assert.equal(
  completedWithoutDurableMessage.value.events.some(entry => entry.event.type === 'assistant/chunk'),
  true,
  'completed turns without assistant/message must retain their only output',
)

const invalid = await buildHistoryWindow({ sessionId: '', maxMessages: 1000 }, async () => {
  throw new Error('invalid request must not hit DSH')
}, signal)
assert.equal(invalid.ok, false)
assert.equal(invalid.error.code, 'invalid-history-request')

const latestCache = new LatestHistoryWindowCache({ maxEntries: 2, maxBytes: 128, maxEntryBytes: 96 })
const latestA = { sessionId: 'session-cache-a', maxMessages: 30 }
assert.equal(latestCache.capture(latestA), null, 'cache must fail closed before Host tracking opens')
latestCache.setTracking(true)
const stableA = latestCache.capture(latestA)
assert.ok(stableA)
assert.equal(latestCache.write(latestA, '{"events":[]}', stableA), true)
assert.equal(latestCache.read(latestA), '{"events":[]}')
latestCache.invalidateSession(latestA.sessionId)
assert.equal(latestCache.read(latestA), null, 'any native Session event must invalidate its latest window')
assert.equal(latestCache.write(latestA, '{"stale":true}', stableA), false,
  'a window built across a native event must never enter the cache')
const olderRequest = { sessionId: latestA.sessionId, maxMessages: 30, beforeSeq: 10 }
assert.equal(latestCache.capture(olderRequest), null, 'cursor history must remain uncached')
const stableAfterEvent = latestCache.capture(latestA)
assert.ok(stableAfterEvent)
latestCache.setTracking(false)
assert.equal(latestCache.write(latestA, '{"stale":true}', stableAfterEvent), false)
assert.equal(latestCache.read(latestA), null, 'a Host monitor gap must clear all clear-text history')
latestCache.setTracking(true)
for (const id of ['session-cache-a', 'session-cache-b', 'session-cache-c']) {
  const request = { sessionId: id, maxMessages: 30 }
  latestCache.write(request, JSON.stringify({ id }), latestCache.capture(request))
}
assert.equal(latestCache.read({ sessionId: 'session-cache-a', maxMessages: 30 }), null,
  'bounded LRU must evict its oldest latest window')
const oversized = { sessionId: 'session-cache-large', maxMessages: 30 }
assert.equal(latestCache.write(oversized, 'x'.repeat(97), latestCache.capture(oversized)), false,
  'one large transcript must not consume the process cache')

class FakeSocket extends EventEmitter {
  close() { this.emit('close') }
  terminate() { this.emit('close') }
}

function hostStatus(sessionId, running) {
  return Buffer.from(JSON.stringify({
    payload: { type: 'host/session-status', sessionId, running },
  }))
}

async function waitFor(predicate, timeoutMs = 500, label = 'history prewarmer') {
  const deadline = Date.now() + timeoutMs
  while (!predicate()) {
    if (Date.now() >= deadline) throw new Error(`timed out waiting for ${label}`)
    await new Promise(resolve => setTimeout(resolve, 2))
  }
}

const fakeSocket = new FakeSocket()
const warmed = []
const trackingStates = []
const changedSessions = []
const prewarmer = new HistorySnapshotPrewarmer({
  dshPort: 3080,
  socketFactory: url => {
    assert.equal(url, 'ws://127.0.0.1:3080/api/events.host')
    return fakeSocket
  },
  settleDelayMs: 0,
  retryDelayMs: 5,
  warm: async (sessionId) => {
    warmed.push(sessionId)
    return 'object'
  },
  onTrackingState: ready => trackingStates.push(ready),
  onSessionChanged: sessionId => changedSessions.push(sessionId),
})
prewarmer.start()
fakeSocket.emit('open')
fakeSocket.emit('message', hostStatus('session-prewarm1234', true), false)
fakeSocket.emit('message', hostStatus('session-prewarm1234', false), false)
await waitFor(() => warmed.length === 1)
fakeSocket.emit('message', hostStatus('session-prewarm1234', false), false)
await new Promise(resolve => setTimeout(resolve, 10))
assert.equal(warmed.length, 1, 'only a true-to-false native edge should prewarm')
fakeSocket.emit('message', hostStatus('session-prewarm1234', true), false)
fakeSocket.emit('message', hostStatus('session-prewarm1234', false), false)
await waitFor(() => warmed.length === 2)
prewarmer.stop()
assert.deepEqual(trackingStates, [true, false], 'Host monitor continuity must gate cache reads')
assert.ok(changedSessions.length >= 4 && changedSessions.every(id => id === 'session-prewarm1234'))

// Production wiring must capture the Cordis service inside an inject fiber.
// Reading a sibling service later from the parent plugin context is rejected by
// Cordis and used to terminate DSH when the Host socket opened.
const lifecycleCtx = new Context()
const historyFiber = await lifecycleCtx.plugin(WechatHistoryService, {})
const lifecycleSocket = new FakeSocket()
let lifecycleWarmCalls = 0
const bindingFiber = await bindHistorySnapshotPrewarmer(lifecycleCtx, {
  socketFactory: () => lifecycleSocket,
  settleDelayMs: 0,
  warm: async (service, sessionId) => {
    assert.equal(typeof service.setCacheTracking, 'function')
    assert.equal(typeof service.invalidateSession, 'function')
    assert.equal(sessionId, 'session-lifecycle1234')
    lifecycleWarmCalls += 1
    return 'inline'
  },
})
assert.equal(lifecycleSocket.listenerCount('open'), 1,
  'Cordis inject fiber must start exactly one Host observer')
lifecycleSocket.emit('open')
lifecycleSocket.emit('message', hostStatus('session-lifecycle1234', true), false)
lifecycleSocket.emit('message', hostStatus('session-lifecycle1234', false), false)
await waitFor(() => lifecycleWarmCalls === 1, 500, 'Cordis-injected history prewarmer')
await historyFiber.dispose()
lifecycleSocket.emit('message', hostStatus('session-lifecycle1234', true), false)
lifecycleSocket.emit('message', hostStatus('session-lifecycle1234', false), false)
await new Promise(resolve => setTimeout(resolve, 10))
assert.equal(lifecycleWarmCalls, 1, 'service disposal must stop its injected Host observer')
await bindingFiber.dispose()

const hostileSocket = new FakeSocket()
const hostileDiagnostics = []
const hostilePrewarmer = new HistorySnapshotPrewarmer({
  socketFactory: () => hostileSocket,
  settleDelayMs: 0,
  warm: async () => 'inline',
  onTrackingState: () => { throw new Error('optional tracking observer') },
  onSessionChanged: () => { throw new Error('optional invalidation observer') },
  onDiagnostic: (level, message) => {
    hostileDiagnostics.push({ level, message })
    if (hostileDiagnostics.length === 1) throw new Error('optional logger')
  },
})
hostilePrewarmer.start()
assert.doesNotThrow(() => hostileSocket.emit('open'),
  'an optional tracking observer must not escape the Host socket callback')
assert.doesNotThrow(() => hostileSocket.emit('message', hostStatus('session-hostile1234', true), false),
  'an optional invalidation observer must not escape the Host socket callback')
hostilePrewarmer.stop()

const retrySocket = new FakeSocket()
let retryCalls = 0
const retryPrewarmer = new HistorySnapshotPrewarmer({
  socketFactory: () => retrySocket,
  settleDelayMs: 0,
  retryDelayMs: 5,
  warm: async () => {
    retryCalls += 1
    if (retryCalls === 1) throw new Error('temporary object transport failure')
    return 'object'
  },
})
retryPrewarmer.start()
retrySocket.emit('message', hostStatus('session-retry123456', true), false)
retrySocket.emit('message', hostStatus('session-retry123456', false), false)
await waitFor(() => retryCalls === 2)
retryPrewarmer.stop()

const overlapSocket = new FakeSocket()
let overlapCalls = 0
let releaseFirstWarm
const firstWarmGate = new Promise(resolve => { releaseFirstWarm = resolve })
const overlapPrewarmer = new HistorySnapshotPrewarmer({
  socketFactory: () => overlapSocket,
  settleDelayMs: 0,
  warm: async () => {
    overlapCalls += 1
    if (overlapCalls === 1) await firstWarmGate
    return 'object'
  },
})
overlapPrewarmer.start()
overlapSocket.emit('message', hostStatus('session-overlap1234', true), false)
overlapSocket.emit('message', hostStatus('session-overlap1234', false), false)
await waitFor(() => overlapCalls === 1)
overlapSocket.emit('message', hostStatus('session-overlap1234', true), false)
overlapSocket.emit('message', hostStatus('session-overlap1234', false), false)
await new Promise(resolve => setTimeout(resolve, 5))
releaseFirstWarm()
await waitFor(() => overlapCalls === 2)
overlapPrewarmer.stop()

const removedSocket = new FakeSocket()
let removedWarmCalls = 0
const removedPrewarmer = new HistorySnapshotPrewarmer({
  socketFactory: () => removedSocket,
  settleDelayMs: 15,
  warm: async () => { removedWarmCalls += 1; return 'object' },
})
removedPrewarmer.start()
removedSocket.emit('message', hostStatus('session-removed1234', true), false)
removedSocket.emit('message', hostStatus('session-removed1234', false), false)
removedSocket.emit('message', Buffer.from(JSON.stringify({
  payload: { type: 'host/session-removed', sessionId: 'session-removed1234' },
})), false)
await new Promise(resolve => setTimeout(resolve, 25))
assert.equal(removedWarmCalls, 0, 'removed sessions must leave no queued prewarm work')
removedPrewarmer.stop()

const abortSocket = new FakeSocket()
let activeStarted = false
let activeAborted = false
const abortPrewarmer = new HistorySnapshotPrewarmer({
  socketFactory: () => abortSocket,
  settleDelayMs: 0,
  warm: async (_sessionId, activeSignal) => await new Promise((resolve, reject) => {
    activeStarted = true
    activeSignal.addEventListener('abort', () => {
      activeAborted = true
      reject(activeSignal.reason)
    }, { once: true })
  }),
})
abortPrewarmer.start()
abortSocket.emit('message', hostStatus('session-abort123456', true), false)
abortSocket.emit('message', hostStatus('session-abort123456', false), false)
await waitFor(() => activeStarted)
abortPrewarmer.stop()
await waitFor(() => activeAborted)

console.log('history service tests passed')
