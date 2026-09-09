import assert from 'node:assert/strict'
import { updateAction, resumedWebUrl } from '../lib/update-service.js'
const release = { version: '1.7.0', channel: 'stable', dsh: ['0.1.2-rc.1'], platforms: ['windows'], architectures: ['x64'],
  asset: { url: 'https://github.com/martinbear1/dsh-wechat-remote/releases/download/v1.7.0/plugin.tgz', bytes: 123, sha256: 'a'.repeat(64) } }
const advice = { severity: 'info', targetVersion: '1.7.0', expiresAt: Date.now() + 60000 }
const eligible = { eligible: true, reason: '' }, missing = { eligible: false, reason: 'Managed process' }
assert.equal(updateAction(advice, release, eligible, false).mode, 'automatic')
assert.equal(updateAction(advice, release, eligible, true).mode, 'busy')
assert.equal(updateAction(advice, release, missing, false).mode, 'manual')
assert.equal(updateAction({ ...advice, targetVersion: undefined, severity: 'none' }, undefined, missing, false).reason, '')
assert.equal(updateAction({ ...advice, expiresAt: 0 }, release, eligible, false).canInstall, false)
assert.equal(updateAction({ ...advice, severity: 'unknown' }, release, eligible, false).canInstall, false)
assert.equal(updateAction(advice, { ...release, version: '1.8.0' }, eligible, false).canInstall, false)
assert.equal(updateAction(advice, { ...release, asset: undefined }, eligible, false).canInstall, false)
assert.equal(resumedWebUrl(null, 'http://localhost:3080', 3080), 'http://localhost:3080/')
assert.equal(resumedWebUrl({ authenticatedUrl: origin => origin + '/?fixture=new-launch' }, 'http://localhost:3080', 3080), 'http://localhost:3080/?fixture=new-launch')
for (const value of ['https://example.com/', 'http://localhost:3080/other', 'http://user:secret@localhost:3080/', 'http://localhost:3080/#unexpected']) {
  assert.throws(() => resumedWebUrl({ authenticatedUrl: () => value }, 'http://localhost:3080', 3080))
}
assert.throws(() => resumedWebUrl(null, 'http://localhost:4180', 3080))
console.log(JSON.stringify({ ok: true, cases: 15 }))
