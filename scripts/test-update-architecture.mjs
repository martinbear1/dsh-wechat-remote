/** Architecture evidence is not an update admission rule.
 * This unit test does NOT claim hardware restart coverage; native integration
 * tests exercise the actual host and worker separately. */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-update-architecture-'))
const previousHome = process.env.DSH_HOME
process.env.DSH_HOME = directory
const { PluginUpdateService } = await import('../lib/update-service.js')
const { assessUpdate, validateCatalog, releaseMatches } = await import('../lib/update-policy.js')
const arch = Object.getOwnPropertyDescriptor(process, 'arch')
const electron = Object.getOwnPropertyDescriptor(process.versions, 'electron')
try {
  const now = Date.now()
  const release = { version: '1.7.6', channel: 'stable', dsh: ['0.1.2-rc.1', '0.1.5-rc.1'],
    platforms: ['windows', 'macos', 'linux'], architectures: ['x64', 'arm64'],
    targets: [{ platform: 'windows', arch: 'x64', dsh: ['0.1.2-rc.1', '0.1.5-rc.1'] },
      { platform: 'macos', arch: 'x64', dsh: ['0.1.2-rc.1', '0.1.5-rc.1'] },
      { platform: 'linux', arch: 'x64', dsh: ['0.1.2-rc.1', '0.1.5-rc.1'] },
      { platform: 'linux', arch: 'arm64', dsh: ['0.1.5-rc.1'] }] }
  const catalog = { schemaVersion: 1, revision: 'architecture-fixture', issuedAt: now - 1000,
    expiresAt: now + 60000, releases: [release], blocked: [], retiredDsh: [] }
  const current = { agentKind: 'dsh', agentVersion: '0.1.5-rc.1', pluginVersion: '1.7.5', platform: 'linux', arch: 'arm64' }
  assert.equal(assessUpdate(catalog, current, now).targetVersion, '1.7.6')
  for (const change of [{ platform: 'macos' }, { platform: 'windows' }, { agentVersion: '0.1.2-rc.1' }]) {
    assert.equal(assessUpdate(catalog, { ...current, ...change }, now).targetVersion, '1.7.6')
    assert.equal(releaseMatches(release, { ...current, ...change }), false)
  }
  for (const platform of ['windows', 'macos', 'linux']) assert.equal(assessUpdate(catalog, { ...current, platform, arch: 'x64' }, now).targetVersion, '1.7.6')
  assert.throws(() => validateCatalog({ ...catalog, releases: [{ ...release, targets: [] }] }))
  assert.throws(() => validateCatalog({ ...catalog, releases: [{ ...release, targets: [{ platform: 'linux', arch: 'arm64', dsh: ['0.0.0'] }] }] }))
  assert.throws(() => validateCatalog({ ...catalog, releases: [{ ...release, targets: [release.targets[0], release.targets[0]] }] }))
  console.log('PASS evidence distinguishes tested Linux ARM64 without blocking other combinations')
  const service = new PluginUpdateService({ get: () => undefined }, { web: 7280, gate: 7292, local: 7293 })
  for (const cpu of ['x64', 'arm64', 'riscv64', 'futurecpu']) {
    Object.defineProperty(process, 'arch', { ...arch, value: cpu })
    const result = service.eligibility()
    assert.equal(result.eligible, false, 'This test runner is not a native DSH host')
    assert(!/架构/.test(result.reason), 'CPU alone must not reject an update')
    Object.defineProperty(process.versions, 'electron', { configurable: true, value: 'fixture' })
    assert.match(service.eligibility().reason, /启动方式尚不支持自动重启/)
    delete process.versions.electron
  }
  console.log('PASS ARM64 and x64 share native host checks; unsupported launcher is still refused')
} finally {
  Object.defineProperty(process, 'arch', arch)
  if (electron) Object.defineProperty(process.versions, 'electron', electron)
  else delete process.versions.electron
  if (previousHome === undefined) delete process.env.DSH_HOME
  else process.env.DSH_HOME = previousHome
  assert(path.dirname(directory) === os.tmpdir() && path.basename(directory).startsWith('dsh-update-architecture-'))
  fs.rmSync(directory, { recursive: true })
}
