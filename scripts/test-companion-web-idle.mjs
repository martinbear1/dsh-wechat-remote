import assert from 'node:assert/strict'
import { test } from 'node:test'
import { waitForWebIdle } from '../installer/bin/native-control.mjs'
import { quiesceNativeHost } from '../lib/install-control.js'
import { looksLikeDshProcess } from '../installer/bin/dsh-discovery.mjs'

test('retired Web transaction does not wait for tasks or dispose an idle/busy host', async () => {
  const noCallback = () => assert.fail('native host must remain untouched')
  await assert.rejects(waitForWebIdle(noCallback, { onBusy: noCallback, wait: noCallback }),
    { code: 'NATIVE_MANUAL_UPDATE_REQUIRED' })
  await assert.rejects(quiesceNativeHost({ get: noCallback, fiber: { dispose: noCallback } },
    noCallback, noCallback), { code: 'NATIVE_MANUAL_UPDATE_REQUIRED' })
})

test('Desktop backend is not mistaken for the CLI Web process', () => {
  for (const command of [
    '"C:\\Apps\\DeepSeek Harness.exe" "C:\\Apps\\resources\\app.asar\\out\\backend.js"',
    '/Applications/DeepSeek Harness.app/Contents/MacOS/DeepSeek Harness /app/desktop/backend.js',
  ]) assert.equal(looksLikeDshProcess(command), false)
  assert.equal(looksLikeDshProcess('node C:\\npm\\node_modules\\@deepseek-ai\\dsh\\lib\\bin.js web'), true)
})
