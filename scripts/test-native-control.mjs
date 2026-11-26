/** Retired online installer entry: no real DSH process or profile is used. */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { attachControl } from '../installer/bin/native-control.mjs'
import { createInstallControl, quiesceNativeHost } from '../lib/install-control.js'
import { executeUpdate } from '../lib/update-worker.js'

test('alpha Cordis symbol root preserves the retired installer refusal without reading removed root', async () => {
  const root = { get: () => undefined }
  const context = new Proxy({}, { get(_target, key) {
    if (key === Symbol.for('cordis.root')) return root
    if (key === 'root') assert.fail('alpha removed the root property')
    assert.fail('unexpected host operation: ' + String(key))
  } })
  await assert.rejects(createInstallControl(context, {}), { code: 'NATIVE_MANUAL_UPDATE_REQUIRED' })
})
test('legacy native-control entry cannot patch or take over a host', async () => {
  const untouched = new Proxy({}, { get() { assert.fail('no obsolete transaction input may be read') } })
  assert.throws(() => attachControl(untouched, untouched, untouched), { code: 'NATIVE_MANUAL_UPDATE_REQUIRED' })
  await assert.rejects(createInstallControl({ get: () => undefined }, untouched), { code: 'NATIVE_MANUAL_UPDATE_REQUIRED' })
  await assert.rejects(quiesceNativeHost(untouched, () => assert.fail(), () => assert.fail()), { code: 'NATIVE_MANUAL_UPDATE_REQUIRED' })
  await assert.rejects(executeUpdate(untouched, () => assert.fail(), () => assert.fail()), { code: 'NATIVE_MANUAL_UPDATE_REQUIRED' })
})
