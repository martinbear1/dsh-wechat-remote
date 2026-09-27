import assert from 'node:assert/strict'
import { test } from 'node:test'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'
import { applyEntryPatches } from '@deepseek-ai/cordis-plugin-include'
import { assertCliInstallOwner, installProfile, PLUGIN_PACKAGE, NATIVE_PLUGIN_PACKAGE } from '../lib/install-profile.js'
import { updateAction, PluginUpdateService } from '../lib/update-service.js'
import { install } from '../installer/bin/setup.mjs'
const { parse } = createRequire(new URL('../installer/package.json', import.meta.url))('yaml')

function fixture(t) {
  const home = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-install-owner-')))
  t.after(() => {
    assert(path.basename(home).startsWith('dsh-install-owner-') && path.dirname(home) === fs.realpathSync(os.tmpdir()))
    fs.rmSync(home, { recursive: true, force: true })
  })
  return { home, profile: path.join(home, 'profiles/web') }
}
function register(profile, names, enabled = names) {
  fs.mkdirSync(profile, { recursive: true })
  fs.writeFileSync(path.join(profile, 'package.json'), JSON.stringify({
    dependencies: Object.fromEntries(names.map(name => [name, '1.7.10'])), dsh: { profile: { bundles: enabled } },
  }))
}
function snapshot(home) {
  const out = {}
  for (const name of fs.readdirSync(home, { recursive: true })) {
    const file = path.join(home, name)
    out[name] = fs.statSync(file).isFile() ? fs.readFileSync(file).toString('base64') : '<directory>'
  }
  return out
}

test('official patch composition retains both gate rows: mixed packages are not an upgrade', () => {
  const layers = ['../cordis.patch.yml', '../installer/cordis.patch.yml'].map(name => parse(fs.readFileSync(new URL(name, import.meta.url), 'utf8')))
  for (const order of [layers, layers.toReversed()]) {
    const rows = applyEntryPatches([], structuredClone(order.flat()), () => {})
    assert.equal(rows.filter(row => row.id === 'gate').length, 2)
    assert.equal(new Set(rows.map(row => row.name)).size, 2)
  }
})
test('fresh and existing legacy Web remain eligible; Desktop installation is a separate owner', t => {
  const { home, profile } = fixture(t)
  assertCliInstallOwner(profile)
  register(profile, [PLUGIN_PACKAGE, 'unrelated-plugin'])
  register(path.join(home, 'profiles/desktop'), [NATIVE_PLUGIN_PACKAGE])
  fs.writeFileSync(path.join(home, 'gate-wechat-state.json'), 'fixture-pairing')
  const before = snapshot(home)
  assertCliInstallOwner(profile)
  assert.deepEqual(snapshot(home), before)
})
test('native-only, disabled native, mixed and unreadable native packages cannot trigger a second install', async t => {
  const { home, profile } = fixture(t)
  for (const names of [[NATIVE_PLUGIN_PACKAGE], [NATIVE_PLUGIN_PACKAGE, PLUGIN_PACKAGE]]) {
    for (const enabled of [names, []]) {
      register(profile, names, enabled)
      const before = snapshot(home)
      assert.throws(() => assertCliInstallOwner(profile), /原生插件管理页/)
      await assert.rejects(install({ home }), /原生插件管理页/)
      // No archive exists; refusal must happen before staging, tool startup or native CLI.
      await assert.rejects(installProfile({ profile, directory: path.join(home, 'absent-job'), targetVersion: '1.7.12-rc.4' }), /原生插件管理页/)
      assert.deepEqual(snapshot(home), before, 'no helper, lock, archive, network selection or profile edit')
    }
  }
})
test('unregistered native leftovers do not prevent repairing the registered legacy owner', t => {
  const { profile } = fixture(t)
  register(profile, [PLUGIN_PACKAGE])
  const leftover = path.join(profile, 'node_modules', NATIVE_PLUGIN_PACKAGE)
  fs.mkdirSync(leftover, { recursive: true })
  fs.writeFileSync(path.join(leftover, 'package.json'), '{invalid')
  assertCliInstallOwner(profile)
})
test('invalid registration never silently becomes an empty installation', async t => {
  const { home, profile } = fixture(t)
  fs.mkdirSync(profile, { recursive: true })
  for (const value of ['{invalid', 'null', '[]', '{"dependencies":[]}', '{"dsh":[]}', '{"dsh":{"profile":[]}}', '{"dsh":{"profile":{"bundles":"bad"}}}', '{"dsh":{"profile":{"bundles":[null]}}}']) {
    fs.writeFileSync(path.join(profile, 'package.json'), value)
    const before = snapshot(home)
    await assert.rejects(install({ home }), /安装归属|插件列表/)
    assert.deepEqual(snapshot(home), before)
  }
})
test('active runtime must be the actual registered CLI package, including symlink resolution', t => {
  const { home, profile } = fixture(t)
  register(profile, [PLUGIN_PACKAGE])
  const actual = path.join(profile, 'node_modules', PLUGIN_PACKAGE)
  fs.mkdirSync(actual, { recursive: true })
  assertCliInstallOwner(profile, actual)
  const linked = path.join(home, 'runtime-link')
  fs.symlinkSync(actual, linked, process.platform === 'win32' ? 'junction' : 'dir')
  assertCliInstallOwner(profile, linked)
  assert.throws(() => assertCliInstallOwner(profile, path.join(profile, 'node_modules', NATIVE_PLUGIN_PACKAGE, 'native')), /运行中的插件/)
  register(profile, [])
  assert.throws(() => assertCliInstallOwner(profile, actual), /运行中的插件/)
})
test('Desktop CLI requests are refused without touching either host', async t => {
  const { home, profile } = fixture(t)
  register(profile, [PLUGIN_PACKAGE])
  const before = snapshot(home)
  for (const name of ['desktop', 'Desktop', 'DESKTOP']) {
    await assert.rejects(install({ home, profileName: name }), /桌面应用管理/)
    assert.throws(() => assertCliInstallOwner(path.join(home, 'profiles', name)), /桌面应用管理/)
  }
  assert.deepEqual(snapshot(home), before)
})
test('native Web updater never recommends the CLI command which would add the wrong package', t => {
  const { home, profile } = fixture(t)
  register(profile, [NATIVE_PLUGIN_PACKAGE])
  const ctx = { get: key => key === 'profileContext' ? { name: 'web', home, dir: profile,
    installAnchor: path.join(home, 'runtime/package.json') } : undefined }
  const service = new PluginUpdateService(ctx, { web: 7280, gate: 7292, local: 7293 })
  const eligibility = service.eligibility()
  assert.equal(eligibility.eligible, false)
  assert.equal(eligibility.manualInstallAllowed, false)
  const release = { version: '1.8.0', channel: 'stable' }
  const advice = { severity: 'recommended', targetVersion: release.version, expiresAt: Date.now() + 60000 }
  assert.deepEqual(updateAction(advice, release, eligibility, false), {
    canInstall: false, mode: 'manual', reason: eligibility.reason, manualCommand: '',
  })
})
