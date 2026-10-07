import assert from 'node:assert/strict'
import { waitForJson, waitForInstallControl } from '../installer/bin/native-control.mjs'
const noCallback = () => assert.fail('retired handshake must not invoke host operations')
for (const file of ['missing.json', '/old/control-ready.json']) {
  await assert.rejects(waitForJson(file, noCallback), { code: 'NATIVE_MANUAL_UPDATE_REQUIRED' })
  await assert.rejects(waitForInstallControl(file, { accept: noCallback, ensureRunning: noCallback, onWaiting: noCallback }),
    { code: 'NATIVE_MANUAL_UPDATE_REQUIRED' })
}
console.log('PASS retired installer handshake never polls or restarts DSH')
