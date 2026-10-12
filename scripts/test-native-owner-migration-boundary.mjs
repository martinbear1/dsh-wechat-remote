/** Real DSH manager methods against disposable manifests and inert bundles.
 * No real profile, package installation, gateway, network, or model is used.
 * Run with HARNESS_DSH_ROOT, or HARNESS_DSH_ASAR for the installed Desktop.
 * These are API boundary tests, not full installation/UI acceptance. */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { pathToFileURL, fileURLToPath } from 'node:url'
import { execFileSync } from 'node:child_process'
import { createRequire } from 'node:module'

const archive = process.env.HARNESS_DSH_ASAR
if (archive && !process.env.HARNESS_OWNER_TEST_STAGE) {
  const stage = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-owner-native-'))
  const fd = fs.openSync(archive, 'r')
  try {
    const prefix = Buffer.alloc(16); fs.readSync(fd, prefix, 0, 16, 0)
    const header = Buffer.alloc(prefix.readUInt32LE(12)); fs.readSync(fd, header, 0, header.length, 16)
    const tree = JSON.parse(header), offset = 8 + prefix.readUInt32LE(4)
    const materialize = (entry, relative) => {
      const target = path.resolve(stage, relative)
      assert(target.startsWith(stage + path.sep)); assert(!entry.link, 'archive links need review')
      if (entry.files) { for (const [name, child] of Object.entries(entry.files)) materialize(child, path.join(relative, name)); return }
      if (!/\.(?:[mc]?js|json|node|wasm|ya?ml)$/.test(relative)) return
      fs.mkdirSync(path.dirname(target), { recursive: true })
      if (entry.unpacked) fs.copyFileSync(path.join(archive + '.unpacked', relative), target)
      else { const bytes = Buffer.alloc(entry.size); fs.readSync(fd, bytes, 0, bytes.length, offset + Number(entry.offset)); fs.writeFileSync(target, bytes) }
    }
    materialize(tree.files.dsh, 'dsh')
    process.stdout.write(execFileSync(process.execPath, [fileURLToPath(import.meta.url)], {
      env: { ...process.env, HARNESS_OWNER_TEST_STAGE: stage, HARNESS_DSH_ROOT: path.join(stage, 'dsh/node_modules/@deepseek-ai/dsh') },
      windowsHide: true, encoding: 'utf8', timeout: 60000,
    }))
  } finally {
    fs.closeSync(fd)
    assert(path.dirname(path.resolve(stage)) === path.resolve(os.tmpdir()) && path.basename(stage).startsWith('dsh-owner-native-'))
    fs.rmSync(stage, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
  }
} else {
  assert(process.env.HARNESS_DSH_ROOT, 'HARNESS_DSH_ROOT or HARNESS_DSH_ASAR is required; no silent skip')
  const stage = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-owner-boundary-'))
  process.env.DSH_HOME = stage
  const require = createRequire(path.join(process.env.HARNESS_DSH_ROOT, 'package.json'))
  const { PluginManager } = await import(pathToFileURL(require.resolve('@deepseek-ai/dsh-plugin-manager')).href)
  const { composeEntries } = await import(pathToFileURL(require.resolve('@deepseek-ai/dsh-app-boot')).href)
  const outer = 'dsh-wechat-remote', core = '@harness-remote/dsh-wechat-remote'
  const dir = path.join(stage, 'profile'), installAnchor = path.join(stage, 'installation/package.json')
  fs.mkdirSync(dir); fs.mkdirSync(path.dirname(installAnchor)); fs.writeFileSync(installAnchor, '{"dependencies":{}}\n')
  const profileFile = path.join(dir, 'package.json')
  const manifest = () => JSON.parse(fs.readFileSync(profileFile, 'utf8'))
  const writeProfile = (dependencies, bundles) => fs.writeFileSync(profileFile, JSON.stringify({ private: true, dependencies, dsh: { profile: { bundles } } }))
  for (const name of [core, outer]) {
    const packageDir = path.join(dir, 'node_modules', name); fs.mkdirSync(packageDir, { recursive: true })
    fs.writeFileSync(path.join(packageDir, 'package.json'), JSON.stringify({ name, version: '1.7.13', exports: { './package.json': './package.json' }, dsh: { bundle: { patch: './cordis.patch.yml' } } }))
    fs.writeFileSync(path.join(packageDir, 'cordis.patch.yml'), `- insert:\n    - id: gate\n      name: ${name}\n`)
  }
  // These methods do not require a live pluginManager service. Supply only its
  // fixture filesystem context; all inspected/select logic remains native.
  const manager = Object.create(PluginManager.prototype)
  manager.profile = { dir, installAnchor, startedBundles: [] }
  manager.managementBundles = new Set()
  manager.ownerEntryId = 'test-plugin-manager'
  manager.ctx = { loader: { entries: () => [] } }
  manager.registries = async () => ({ registry: null, fallbackRegistries: [], resolved: null })
  try {
    writeProfile({ [outer]: '1.7.13' }, [outer])
    for (const spec of [`${outer}@latest`, `${outer}@1.7.14`]) {
      const result = await manager.inspect(spec)
      assert.equal(result.status, 'refused'); assert.equal(result.problem, 'already-installed')
    }
    console.log('PASS native registry Add refuses same owner before package metadata lookup (latest and exact version)')

    writeProfile({ [core]: '1.7.13' }, [core])
    const result = await manager.inspect(path.join(dir, 'node_modules', outer))
    assert.equal(result.status, 'accepted'); assert.equal(result.name, outer)
    assert.equal(result.bundle, true)
    console.log('PASS native different-owner inspection accepts outer even with historical core registered')

    writeProfile({ [outer]: '1.7.13' }, [outer])
    const archiveFixture = path.join(stage, 'same-owner.tgz'); fs.writeFileSync(archiveFixture, '')
    const tarball = await manager.inspect(archiveFixture)
    assert.equal(tarball.status, 'accepted'); assert.equal(tarball.kind, 'tarball')
    console.log('PASS native tarball inspection defers identity; no actual archive installation claimed')

    writeProfile({ [core]: '1.7.13', [outer]: '1.7.14' }, [core])
    await manager.selectBundle(outer, true)
    assert.deepEqual(manifest().dsh.profile.bundles, [core, outer])
    assert.equal((await manager.listBundles()).filter(row => [core, outer].includes(row.name)).length, 2)
    console.log('PASS selecting a different owner appends, and native listBundles exposes both cards')

    await manager.selectBundle(core, false)
    assert.deepEqual(manifest().dsh.profile.bundles, [outer])
    assert.deepEqual(Object.keys(manifest().dependencies), [core, outer])
    const disabled = (await manager.listBundles()).find(row => row.name === core)
    assert.equal(disabled.enabled, false); assert.equal(disabled.installed, true)
    console.log('PASS deselection does not remove old dependency/card; activation changes are not owner migration')

    const oldPatch = { insert: [{ id: 'gate', name: core }] }
    const nextPatch = { id: 'gate', name: outer }
    const warnings = []
    const entries = composeEntries([[oldPatch, nextPatch]], warning => warnings.push(warning))
    assert.equal(entries.filter(row => row.id === 'gate').length, 1)
    assert.equal(entries.find(row => row.id === 'gate').name, core)
    assert(warnings.some(warning => warning.includes('name mismatch')))
    const inserted = composeEntries([[oldPatch, { insert: [{ id: 'gate', name: outer }] }]])
    assert.equal(inserted.filter(row => row.id === 'gate').length, 2)
    assert.deepEqual(Object.keys(manifest().dependencies), [core, outer])
    console.log('PASS native patch name is a matching guard, not owner replacement; insert retains both declarations')

    // The genuine removal operation refuses an active startup-only owner. This
    // explicitly demonstrates why a plugin cannot silently chain an uninstall
    // into the running host's Add operation as an atomic migration.
    manager.abort = new AbortController()
    manager.ownerContext = { get: () => undefined, emit: () => {} }
    manager.profile.startedBundles = [core]
    manager.lockWaitMs = 1000
    manager.runPnpm = () => assert.fail('a refused removal must never execute pnpm')
    const beforeRemoval = fs.readFileSync(profileFile, 'utf8')
    const removal = await manager.removeBundle(core)
    assert.equal(removal.application, 'failed')
    assert.equal(removal.error?.code, 'stop-profile')
    assert.equal(fs.readFileSync(profileFile, 'utf8'), beforeRemoval)
    console.log('PASS native removal refuses a started bundle without HMR and does not alter its manifest')
    const hostVersion = JSON.parse(fs.readFileSync(path.join(process.env.HARNESS_DSH_ROOT, 'package.json'), 'utf8')).version
    console.log(JSON.stringify({ hostVersion, tests: 7, realProfileRead: false, realProfileWrite: false, packageInstallation: false, network: false }))
  } finally {
    assert(path.dirname(path.resolve(stage)) === path.resolve(os.tmpdir()) && path.basename(stage).startsWith('dsh-owner-boundary-'))
    fs.rmSync(stage, { recursive: true, force: true })
  }
}
