import assert from 'node:assert/strict'
import { inflateRawSync } from 'node:zlib'

import { buildHistoryWindow } from '../lib/history-service.js'
import { archiveHistoryJson } from '../lib/history-archive.js'

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

console.log('history service tests passed')
