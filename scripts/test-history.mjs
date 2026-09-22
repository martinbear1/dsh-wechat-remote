import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { inflateRawSync } from 'node:zlib'

import { buildHistoryWindow } from '../lib/history-service.js'
import { archiveHistoryJson, archiveHistoryJsonAsync } from '../lib/history-archive.js'
import WechatHistoryService from '../lib/history-service.js'
import { HistoryReadBudget } from '../lib/history-read-budget.js'

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
assert.deepEqual(await archiveHistoryJsonAsync(archiveSource, signal), archive,
  'async compression must preserve the released native-unzip ZIP format byte for byte')
await assert.rejects(archiveHistoryJsonAsync(archiveSource, AbortSignal.abort()), { name: 'AbortError' })
let eventLoopRan = false
const yieldCheck = archiveHistoryJsonAsync(archiveSource.repeat(8), signal)
setImmediate(() => { eventLoopRan = true })
await yieldCheck
assert.equal(eventLoopRan, true, 'large compression must release the JS event loop')
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

// The first page contains an older partial turn AND a fully closed latest
// turn. Completing only the latest one silently loses older usage/activity.
const h=(type,seq,turn,extra={})=>({event:{type,seq,time:seq*100,data:{turn,...extra}}})
const splitCalls=[]
const split=await buildHistoryWindow({sessionId:'older-partial'},async payload=>{
  splitCalls.push(payload.beforeSeq)
  return {ok:true,value:{hasMore:true,events:payload.beforeSeq===12?[
    h('assistant/message',3,0,{step:1,message:{id:'older',content:[{type:'text',text:'older'}]}}),
    h('turn/end',4,0,{reason:{kind:'completed'}}),h('turn/start',10,1),h('step/start',11,1,{step:1})
  ]:[
    h('deliverables/presented',12,1,{files:[{path:'a.pdf'}]}),
    h('assistant/message',13,1,{step:1,message:{id:'first',content:[{type:'reasoning',text:'think'},{type:'text',text:'first'}]}}),
    h('turn/end',14,1,{reason:{kind:'completed'}}),h('turn/start',20,2),h('step/start',21,2,{step:1}),
    h('assistant/message',22,2,{step:1,message:{id:'second',content:[{type:'text',text:'second'}]}}),h('turn/end',23,2,{reason:{kind:'completed'}})
  ]}}
},signal,()=>({totalTokens:12,outputTokens:3}))
assert.deepEqual(splitCalls,[undefined,12])
assert.equal(split.value.historyStartSeq,10,'overshot older prefix left behind the next cursor')
assert.equal(split.value.hasMore,true)
assert.deepEqual(split.value.facets['agent.turn-details.v1'].map(x=>x.messageId),['first','second'])
assert.equal(split.value.events.find(e=>e.event.seq===12).view.agentResources.files.length,1)
assert.deepEqual(split.value.events.find(e=>e.event.seq===14).view.agentActivity.process.answerParts,['reasoning'])

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

// The latest Session window is a mutable pointer, not cacheable content. Every
// read must consult native DSH history; only the immutable payload digest may
// be reused later by the encrypted object layer.
let latestRevision = 0
let latestFetches = 0
const alwaysFreshService = {
  reads: new HistoryReadBudget(),
  createPageReader() { return this.fetchNativePage },
  snapshotThresholdBytes: Number.MAX_SAFE_INTEGER,
  storeSnapshot: undefined,
  fetchNativePage: async () => {
    latestFetches += 1
    return {
      ok: true,
      value: {
        hasMore: false,
        events: [{
          event: {
            type: 'assistant/message',
            seq: latestRevision,
            data: { message: { id: `message-${latestRevision}` } },
          },
        }],
      },
    }
  },
}
const latestRequest = { sessionId: 'session-always-fresh', maxMessages: 30 }
const firstLatest = await WechatHistoryService.prototype.window.call(alwaysFreshService, latestRequest, signal)
latestRevision = 1
const secondLatest = await WechatHistoryService.prototype.window.call(alwaysFreshService, latestRequest, signal)
assert.equal(latestFetches, 2, 'latest history must never be served from a mutable process cache')
assert.notEqual(firstLatest.value.payloadJson, secondLatest.value.payloadJson,
  'a completed native turn must be observable on the next history read')

// History owns pagination, compression and transport budgeting as one policy.
// The object gateway receives an already-planned archive and never decides how
// a failed upload should alter the logical history window.
function transportService(fetchNativePage, storeSnapshot) {
  return {
    reads: new HistoryReadBudget(),
    createPageReader() { return this.fetchNativePage },
    snapshotThresholdBytes: 32 * 1024,
    storeSnapshot,
    fetchNativePage,
  }
}

function historyValue(text, hasMore = true) {
  return {
    ok: true,
    value: {
      hasMore,
      events: [{
        event: {
          type: 'assistant/message',
          seq: 100,
          data: { message: { id: 'transport-message', content: [{ type: 'text', text }] } },
        },
      }],
    },
  }
}

let smallStoreCalls = 0
const smallTransport = transportService(
  async () => historyValue('small'),
  async () => { smallStoreCalls += 1; throw new Error('small response must not use object storage') },
)
const smallResult = await WechatHistoryService.prototype.window.call(
  smallTransport,
  { sessionId: 'session-small-transport', maxMessages: 8 },
  signal,
)
assert.equal(typeof smallResult.value.payloadJson, 'string')
assert.equal(smallStoreCalls, 0)

let compactStoreCalls = 0
const compactTransport = transportService(
  async () => historyValue('repeatable history '.repeat(12_000)),
  async () => { compactStoreCalls += 1; throw new Error('compact ZIP must stay inline') },
)
const compactResult = await WechatHistoryService.prototype.window.call(
  compactTransport,
  { sessionId: 'session-compact-transport', maxMessages: 8 },
  signal,
)
const compactDescriptor = JSON.parse(compactResult.value.snapshotJson)
assert.equal(typeof compactDescriptor.archiveBase64, 'string')
assert.equal(compactDescriptor.objectId, undefined)
assert.equal(compactStoreCalls, 0)
assert.equal(unzipSingleEntry(Buffer.from(compactDescriptor.archiveBase64, 'base64'))
  .includes('repeatable history'), true)

const mediumText = randomBytes(160 * 1024).toString('base64')
let storedArchive
const objectTransport = transportService(
  async () => historyValue(mediumText),
  async (payloadJson, archiveBytes) => {
    storedArchive = Buffer.from(archiveBytes)
    assert.equal(unzipSingleEntry(storedArchive), payloadJson)
    return { contentKind: 'history-json', objectId: 'object-transport-test' }
  },
)
const objectResult = await WechatHistoryService.prototype.window.call(
  objectTransport,
  { sessionId: 'session-object-transport', maxMessages: 8 },
  signal,
)
assert.equal(JSON.parse(objectResult.value.snapshotJson).objectId, 'object-transport-test')
assert.ok(storedArchive.length > 96 * 1024)

let unavailableStoreCalls = 0
const unavailableTransport = transportService(
  async () => historyValue(mediumText),
  async () => { unavailableStoreCalls += 1; throw new Error('object storage unavailable') },
)
const unavailableResult = await WechatHistoryService.prototype.window.call(
  unavailableTransport,
  { sessionId: 'session-unavailable-transport', maxMessages: 8 },
  signal,
)
const unavailableDescriptor = JSON.parse(unavailableResult.value.snapshotJson)
assert.equal(unavailableStoreCalls, 1)
assert.equal(typeof unavailableDescriptor.archiveBase64, 'string')
assert.equal(unzipSingleEntry(Buffer.from(unavailableDescriptor.archiveBase64, 'base64'))
  .includes('transport-message'), true)

const adaptiveText = randomBytes(600 * 1024).toString('base64')
const adaptivePageSizes = []
let adaptiveStoreCalls = 0
const adaptiveTransport = transportService(
  async payload => {
    adaptivePageSizes.push(payload.maxMessages)
    const chars = Math.ceil(adaptiveText.length * payload.maxMessages / 30)
    return historyValue(adaptiveText.slice(0, chars), true)
  },
  async () => { adaptiveStoreCalls += 1; throw new Error('object storage unavailable') },
)
const adaptiveResult = await WechatHistoryService.prototype.window.call(
  adaptiveTransport,
  { sessionId: 'session-adaptive-transport', maxMessages: 30 },
  signal,
)
assert.equal(adaptiveStoreCalls, 1, 'an unavailable object backend is probed once per request')
assert.deepEqual(adaptivePageSizes, [30, 15], 'oversized history must shrink through normal pagination')
const adaptiveDescriptor = JSON.parse(adaptiveResult.value.snapshotJson)
const adaptiveValue = JSON.parse(unzipSingleEntry(Buffer.from(adaptiveDescriptor.archiveBase64, 'base64')))
assert.equal(adaptiveValue.hasMore, true, 'adaptive transport must preserve the native older-history cursor')
assert.ok(Buffer.from(adaptiveDescriptor.archiveBase64, 'base64').length <= 384 * 1024)

let explicitStoreCalls = 0
const explicitTransport = transportService(
  async () => historyValue(mediumText),
  async () => { explicitStoreCalls += 1; throw new Error('explicit inline must not touch object storage') },
)
const explicitResult = await WechatHistoryService.prototype.window.call(
  explicitTransport,
  { sessionId: 'session-explicit-inline', maxMessages: 8, delivery: 'inline' },
  signal,
)
assert.equal(typeof explicitResult.value.payloadJson, 'string')
assert.equal(explicitStoreCalls, 0)

const negotiatedInlineResult = await WechatHistoryService.prototype.window.call(
  explicitTransport,
  {
    sessionId: 'session-negotiated-inline',
    maxMessages: 8,
    delivery: 'inline',
    acceptInlineArchive: true,
  },
  signal,
)
assert.equal(typeof JSON.parse(negotiatedInlineResult.value.snapshotJson).archiveBase64, 'string')
assert.equal(explicitStoreCalls, 0, 'negotiated inline retries must never probe object storage again')

let giantStoreCalls = 0
const giantTransport = transportService(
  async () => historyValue(adaptiveText),
  async () => { giantStoreCalls += 1; throw new Error('object storage unavailable') },
)
const giantResult = await WechatHistoryService.prototype.window.call(
  giantTransport,
  { sessionId: 'session-giant-single-message', maxMessages: 1 },
  signal,
)
assert.equal(giantResult.ok, false, 'one irreducible oversized message must fail instead of flooding the relay')
assert.equal(giantResult.error.code, 'history-unavailable')
assert.equal(giantStoreCalls, 1)


console.log('history service tests passed')
