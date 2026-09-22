import test from 'node:test'
import assert from 'node:assert/strict'
import { HistoryReadBudget } from '../lib/history-read-budget.js'
import WechatHistoryService from '../lib/history-service.js'

test('history slots are bounded, FIFO and released exactly once', async () => {
  const budget = new HistoryReadBudget(2, 2), signal = new AbortController().signal
  const a = await budget.acquire(signal), b = await budget.acquire(signal)
  const order = []
  const c = budget.acquire(signal).then(release => { order.push('c'); return release })
  const d = budget.acquire(signal).then(release => { order.push('d'); return release })
  await assert.rejects(budget.acquire(signal), { code: 'history-busy' })
  assert.deepEqual(order, [])
  a(); a()
  const releaseC = await c
  assert.deepEqual(order, ['c'])
  b()
  const releaseD = await d
  assert.deepEqual(order, ['c', 'd'])
  releaseC(); releaseD()
  const release = await budget.acquire(signal); release()
})

test('cancelled queued history frees queue space and never claims an active slot', async () => {
  const budget = new HistoryReadBudget(1, 1), controller = new AbortController()
  const signal = new AbortController().signal, a = await budget.acquire(signal)
  const cancelled = budget.acquire(controller.signal)
  const rejected = assert.rejects(cancelled, { name: 'AbortError' })
  controller.abort(); await rejected
  await assert.rejects(budget.acquire(controller.signal), { name: 'AbortError' })
  const b = budget.acquire(signal)
  a(); (await b)()
})

test('the service cancels queued work and holds a running slot until native work settles', async () => {
  const reads = new HistoryReadBudget(1, 1), waits = []
  const service = {
    reads, timeoutMs: 10000, snapshotThresholdBytes: 32768,
    createPageReader() { return () => new Promise(resolve => waits.push(resolve)) },
  }
  const run = signal => WechatHistoryService.prototype.window.call(service, { sessionId: 's' }, signal)
  const controller = new AbortController(), first = run(controller.signal)
  const tick = () => new Promise(resolve => setImmediate(resolve))
  while (!waits.length) await tick()
  const queuedController = new AbortController(), queued = run(queuedController.signal)
  queuedController.abort()
  await assert.rejects(queued, { name: 'AbortError' })
  controller.abort()
  const firstRejected = assert.rejects(first, { name: 'AbortError' })
  const second = run(new AbortController().signal)
  await tick()
  assert.equal(waits.length, 1, 'abort must not oversubscribe a native reader that is still running')
  waits[0]({ ok: true, value: { events: [], hasMore: false } })
  await firstRejected
  while (waits.length < 2) await tick()
  waits[1]({ ok: true, value: { events: [], hasMore: false } })
  assert.equal((await second).ok, true)
})

test('waiting consumes the same overall deadline and timeout cannot run a native read', async () => {
  const reads = new HistoryReadBudget(1, 1), release = await reads.acquire(new AbortController().signal)
  const keepAlive = setInterval(() => {}, 100)
  const service = {
    reads, timeoutMs: 10,
    createPageReader() { assert.fail('timed-out queued request reached the native reader') },
  }
  try {
    await assert.rejects(WechatHistoryService.prototype.window.call(service,
      { sessionId: 'queued-timeout' }, new AbortController().signal), { name: 'TimeoutError' })
  } finally { clearInterval(keepAlive); release() }
  const next = await reads.acquire(new AbortController().signal); next()
})
