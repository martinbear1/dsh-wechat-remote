import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { assertNativeUpdateCapabilities } from '../lib/install-capabilities.js'
import { assessUpdate } from '../lib/update-policy.js'
import { updateAction } from '../lib/update-service.js'

const fixture = () => {
  const services = { webServer: { server: new EventEmitter() }, sessions: {
    get() {}, list() { throw Error('read-only probe must not list sessions') },
    flush() { throw Error('read-only probe must not flush') },
  } }
  const context = { get: name => services[name], fiber: { dispose() { throw Error('probe must not dispose') } } }
  return { services, context }
}
for (const version of ['0.1.2-rc.1', '0.1.5-rc.1', '0.1.6-rc.1', '0.1.7-rc.1']) {
  const { context } = fixture()
  Object.defineProperty(context, 'agentVersion', { get() { throw Error('capability probe must not inspect version') } })
  assertNativeUpdateCapabilities(context)
  assertNativeUpdateCapabilities({ get() { throw Error('use root services') }, root: context })
  const now = Date.now()
  const release = { version: '1.7.3', channel: 'stable', dsh: [version], platforms: ['windows'], architectures: ['x64'],
    asset: { url: 'https://github.com/martinbear1/dsh-wechat-remote/releases/download/v1.7.3/plugin.tgz', bytes: 100, sha256: 'a'.repeat(64) } }
  const catalog = { schemaVersion: 1, revision: 'future-target-fixture', issuedAt: now - 1000, expiresAt: now + 60000,
    releases: [release], blocked: [], retiredDsh: [] }
  const advice = assessUpdate(catalog, { agentKind: 'dsh', agentVersion: version, pluginVersion: '1.7.2', platform: 'windows', arch: 'x64' }, now)
  assert.equal(advice.targetVersion, '1.7.3')
  assert.equal(updateAction(advice, release, { eligible: true, reason: '' }, false).canInstall, true)
  const untested = assessUpdate({ ...catalog, releases: [{ ...release, dsh: ['0.1.1-rc.2'] }] }, advice.current, now)
  assert.equal(untested.targetVersion, '1.7.3', 'test evidence is not an admission list')
  assert.equal(updateAction(untested, release, { eligible: true, reason: '' }, false).canInstall, true)
  assert.equal(updateAction(untested, release, { eligible: false, reason: '缺少原生保存能力' }, false).canInstall, false)
  assert.equal(assessUpdate({ ...catalog, blocked: [{ pluginVersion: release.version, reason: 'known broken release' }] }, advice.current, now).targetVersion, undefined)
}
for (const service of ['get', 'list', 'flush']) {
  const { services, context } = fixture(); services.sessions[service] = true
  assert.throws(() => assertNativeUpdateCapabilities(context), new RegExp('sessions.' + service))
}
for (const method of ['on', 'listeners', 'removeAllListeners', 'removeListener']) {
  const { services, context } = fixture(); services.webServer.server[method] = null
  assert.throws(() => assertNativeUpdateCapabilities(context), new RegExp('webServer.' + method))
}
const { context } = fixture(); context.fiber.dispose = null
assert.throws(() => assertNativeUpdateCapabilities(context), /lifecycle.dispose/)
console.log('PASS version-independent native probes; untested hosts offered updates; missing capabilities and known broken releases stay protected')
