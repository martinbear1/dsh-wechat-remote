import assert from 'node:assert/strict'
import { assessUpdate, validateCatalog, compareVersions, trustedReleaseAsset } from '../lib/update-policy.js'
import { previewUpdatesEnabled } from '../lib/update-service.js'
const now = Date.now()
const release = (version, dsh, extra = {}) => ({ version, dsh, platforms: ['windows', 'macos', 'linux'], architectures: ['x64', 'arm64'], channel: 'stable', ...extra })
const catalog = { schemaVersion: 1, revision: 'test-1', issuedAt: now - 1000, expiresAt: now + 86400000,
  releases: [release('1.5.5', ['0.1.1-rc.2']), release('1.7.0', ['0.1.1-rc.2', '0.1.2-rc.1']),
    release('1.8.0', ['0.2.0']), release('1.9.0-rc.1', ['0.1.2-rc.1'], { channel: 'preview' })], blocked: [], retiredDsh: ['0.0.1'] }
const current = { agentKind: 'deepseek-harness', agentVersion: '0.1.2-rc.1', pluginVersion: '1.5.5', platform: 'windows', arch: 'x64' }
let count = 0
const test = (label, fn) => { fn(); count++; console.log('PASS ' + label) }
test('new DSH + old plugin recommends plugin, not DSH or global latest', () => {
  const a = assessUpdate(catalog, current, now)
  assert.equal(a.targetVersion, '1.7.0'); assert.equal(a.component, 'plugin'); assert.equal(a.severity, 'required')
})
test('same supported pair upgrade optional', () => assert.equal(assessUpdate(catalog, { ...current, agentVersion: '0.1.1-rc.2' }, now).severity, 'info'))
test('compatible latest for old DSH does not chase 1.8', () => assert.equal(assessUpdate(catalog, { ...current, pluginVersion: '1.7.0' }, now).code, 'compatible'))
test('future DSH is not retired or forced down', () => assert.equal(assessUpdate(catalog, { ...current, agentVersion: '99.0.0' }, now).code, 'unverified'))
test('unlisted RC between tested endpoints not presumed compatible', () => assert.equal(assessUpdate(catalog, { ...current, agentVersion: '0.1.2-alpha.1' }, now).code, 'unverified'))
test('preview requires opt in', () => assert.equal(assessUpdate(catalog, current, now, true).targetVersion, '1.9.0-rc.1'))
test('host preview needs both local operator switches; default is stable', () => {
  assert.equal(previewUpdatesEnabled({}), false)
  assert.equal(previewUpdatesEnabled({ HARNESS_REMOTE_UPDATE_CHANNEL: 'preview' }), false)
  assert.equal(previewUpdatesEnabled({ HARNESS_REMOTE_UPDATE_CATALOG: 'local.json' }), false)
  assert.equal(previewUpdatesEnabled({ HARNESS_REMOTE_UPDATE_CATALOG: 'local.json', HARNESS_REMOTE_UPDATE_CHANNEL: 'preview' }), true)
})
test('legacy 1.5.5 without updater or architecture still receives an actionable plugin badge', () => {
  const legacyCatalog = { ...catalog, manualUpgradePlugins: ['1.5.5'] }
  for (const platform of ['windows', 'macos', 'linux']) {
    const advice = assessUpdate(legacyCatalog, { ...current, platform, arch: '' }, now)
    assert.equal(advice.label, '插件可更新'); assert.equal(advice.component, 'plugin')
    assert.match(advice.manualUpdate, /首次.*手工升级/)
    assert.match(advice.manualUpdate, /不要删除节点或重新配对/)
    assert.equal(advice.targetVersion, '1.7.0', 'never recommends the preview to ordinary users')
  }
  assert.equal(assessUpdate({ ...legacyCatalog, releases: [catalog.releases[0], catalog.releases[3]] }, current, now).targetVersion, undefined)
})
test('no downgrade from preview', () => assert.equal(assessUpdate(catalog, { ...current, pluginVersion: '1.9.0-rc.1' }, now).code, 'compatible'))
test('unknown current version with known target not automatically required', () => assert.equal(assessUpdate(catalog, { ...current, pluginVersion: '1.4.0' }, now).severity, 'recommended'))
test('unsupported architecture not installable', () => assert.equal(assessUpdate(catalog, { ...current, arch: 'riscv64' }, now).code, 'unverified'))
test('missing architecture never claims verified compatibility or a mandatory matching install', () => {
  const advice = assessUpdate(catalog, { ...current, arch: '' }, now)
  assert.equal(advice.code, 'plugin-check-host'); assert.equal(advice.severity, 'recommended')
  assert.equal(assessUpdate(catalog, { ...current, arch: '', pluginVersion: '1.7.0' }, now).code, 'unverified')
})
test('malformed semver and nested release asset paths rejected', () => {
  for (const version of ['1.2.3-01', '1.2.3+a..b', '1.2.3+', '1'.repeat(81) + '.2.3']) assert.throws(() => compareVersions(version, '1.2.3'))
  assert(!trustedReleaseAsset({ url: 'https://github.com/martinbear1/dsh-wechat-remote/releases/download/v1.7.0/nested/plugin.tgz', sha256: 'a'.repeat(64), bytes: 100 }, '1.7.0'))
})
test('retired DSH only when explicitly listed', () => assert.equal(assessUpdate(catalog, { ...current, agentVersion: '0.0.1' }, now).component, 'agent'))
test('withdrawn target excluded', () => assert.equal(assessUpdate({ ...catalog, blocked: [{ pluginVersion: '1.7.0', reason: 'Withdrawn' }] }, current, now).targetVersion, undefined))
test('withdrawn current no safe replacement stays visible', () => assert.equal(assessUpdate({ ...catalog, releases: [], blocked: [{ pluginVersion: '1.5.5', reason: '安全撤回' }] }, current, now).code, 'blocked-no-target'))
test('expired and future policy cannot authorize install', () => {
  assert.equal(assessUpdate(catalog, current, now + 86400001).code, 'stale')
  assert.equal(assessUpdate({ ...catalog, issuedAt: now + 400000 }, current, now).code, 'stale')
})
test('missing or invalid catalog safe fallback', () => { for (const value of [null, {}, { ...catalog, schemaVersion: 2 }]) assert.equal(assessUpdate(value, current, now).severity, 'unknown') })
test('other agents additive unknown', () => assert.equal(assessUpdate(catalog, { ...current, agentKind: 'claude' }, now).code, 'unknown-agent'))
test('asset must be exact own GitHub release, HTTPS, bounded and hashed', () => {
  const asset = { url: 'https://github.com/martinbear1/dsh-wechat-remote/releases/download/v1.7.0/plugin.tgz', sha256: 'a'.repeat(64), bytes: 2048 }
  assert(trustedReleaseAsset(asset, '1.7.0'))
  for (const url of [asset.url.replace('https:', 'http:'), asset.url.replace('github.com', 'github.com.evil.test'), asset.url + '?redirect=evil', asset.url.replace('/v1.7.0/', '/v1.8.0/'), asset.url.replace('/plugin.tgz', '/../evil.tgz')]) assert(!trustedReleaseAsset({ ...asset, url }, '1.7.0'))
  assert(!trustedReleaseAsset({ ...asset, bytes: 1e10 }, '1.7.0'))
})
test('malformed catalog rejected', () => {
  for (const r of [{ ...catalog.releases[0], channel: 'nightly' }, { ...catalog.releases[0], dsh: ['*'] }, catalog.releases[3] && { ...catalog.releases[3], channel: 'stable' }]) assert.throws(() => validateCatalog({ ...catalog, releases: [r] }))
})
test('semantic comparison RC 10 > RC 2, stable > RC, numeric < text', () => {
  assert(compareVersions('0.1.2-rc.10', '0.1.2-rc.2') > 0)
  assert(compareVersions('0.1.2', '0.1.2-rc.10') > 0)
  assert(compareVersions('0.1.2-1', '0.1.2-alpha') < 0)
})
console.log(JSON.stringify({ ok: true, cases: count }))
