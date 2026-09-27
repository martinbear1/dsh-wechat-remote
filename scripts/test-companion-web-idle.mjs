import assert from 'node:assert/strict'
import { test } from 'node:test'
import { waitForWebIdle } from '../installer/bin/native-control.mjs'
import { quiesceNativeHost } from '../lib/install-control.js'
import { looksLikeDshProcess } from '../installer/bin/dsh-discovery.mjs'

test('an idle Web needs no waiting or busy notification', async () => {
  await waitForWebIdle(async () => ({ items: [{ running: false }] }), {
    onBusy: () => assert.fail('idle'), wait: () => assert.fail('idle'),
  })
})

test('old Web continues its task, then becomes eligible without another install command', async () => {
  let reads = 0, notices = 0, clock = 0
  await waitForWebIdle(async () => ({ items: [{ running: ++reads < 4 }] }), {
    onBusy: () => notices++, now: () => clock,
    wait: async ms => { clock += ms }, timeoutMs: 100, intervalMs: 20,
  })
  assert.equal(reads, 4); assert.equal(notices, 1); assert.equal(clock, 60)
})

test('long-running tasks end the wait without claiming an upgrade or forcing a stop', async () => {
  let clock = 0, reads = 0
  await assert.rejects(waitForWebIdle(async () => { reads++; return { items: [{ running: true }] } }, {
    now: () => clock, wait: async ms => { clock += ms }, timeoutMs: 45, intervalMs: 20,
  }), error => error.code === 'DSH_COMPANION_BUSY')
  assert.equal(reads, 4); assert.equal(clock, 45)
})

test('unknown status, disconnected host and changed installation stop safely, not as idle', async () => {
  for (const value of [{}, { items: [{}] }, { items: [{ running: null }] }]) {
    await assert.rejects(waitForWebIdle(async () => value), /无法确认/)
  }
  for (const reason of ['host stopped', 'owner changed', 'manual downgrade']) {
    await assert.rejects(waitForWebIdle(async () => { throw Error(reason) }), new RegExp(reason))
  }
})

test('a new task after the initial idle wait is caught by the final native guard', async () => {
  let running = false, disposed = false
  const read = async () => ({ items: [{ running }] })
  await waitForWebIdle(read)
  running = true
  await assert.rejects(quiesceNativeHost({ get: () => assert.fail(), fiber: { dispose: () => { disposed = true } } },
    read, () => { disposed = true }))
  assert.equal(disposed, false)
})

test('Desktop backend is not mistaken for the CLI Web process', () => {
  for (const command of [
    '"C:\\Apps\\DeepSeek Harness.exe" "C:\\Apps\\resources\\app.asar\\out\\backend.js"',
    '/Applications/DeepSeek Harness.app/Contents/MacOS/DeepSeek Harness /app/desktop/backend.js',
  ]) assert.equal(looksLikeDshProcess(command), false)
  assert.equal(looksLikeDshProcess('node C:\\npm\\node_modules\\@deepseek-ai\\dsh\\lib\\bin.js web'), true)
})
