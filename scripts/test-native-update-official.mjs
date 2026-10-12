/** Official DSH PluginManager + real pnpm + unchanged baseline updater.
 * Uses disposable profiles, actual release archives and a loopback npm mirror.
 * Never loads the connection gate, user identities, sessions or a real profile.
 * This verifies installation/API behavior, not a full app/phone acceptance run.
 * Required: HARNESS_DSH_ROOT or HARNESS_DSH_ASAR,
 * HARNESS_UPDATE_OLD_ARCHIVE and HARNESS_UPDATE_TARGET_ARCHIVE (outer .tgz).
 * Optional: HARNESS_UPDATE_PLUGIN_LIB (built candidate lib directory).
 * HARNESS_UPDATE_TRANSITION_ARCHIVE adds a same-owner native Add first hop,
 * then tests the updater actually installed by that hop against the target.
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import http from 'node:http'
import { gunzipSync } from 'node:zlib'
import { createHash } from 'node:crypto'
import { createRequire } from 'node:module'
import { pathToFileURL, fileURLToPath } from 'node:url'
import { execFile, execFileSync } from 'node:child_process'
import { promisify } from 'node:util'

const script = fileURLToPath(import.meta.url)
const stage = process.env.HARNESS_OFFICIAL_UPDATE_STAGE || fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-native-update-official-'))
const cleanup = () => {
  assert(path.dirname(path.resolve(stage)) === path.resolve(os.tmpdir()) && path.basename(stage).startsWith('dsh-native-update-official-'))
  fs.rmSync(stage, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
}
if (process.env.HARNESS_OFFICIAL_UPDATE_RECOVERY || process.env.HARNESS_OFFICIAL_UPDATE_CONTINUATION) {
  // A separate process has no prior Cordis/module cache. Recover through the
  // official boot/manager and the updater actually installed in this profile.
  // This deliberately does not start the connection gate or a real app window.
  const continuation = Boolean(process.env.HARNESS_OFFICIAL_UPDATE_CONTINUATION)
  const recoveryFile = path.resolve(process.env.HARNESS_OFFICIAL_UPDATE_RECOVERY || process.env.HARNESS_OFFICIAL_UPDATE_CONTINUATION)
  assert(recoveryFile.startsWith(path.resolve(stage) + path.sep))
  const { profile, nativeRoot, config, owner, version, release, registry } = JSON.parse(fs.readFileSync(recoveryFile, 'utf8'))
  assert(path.resolve(profile.dir).startsWith(path.resolve(stage) + path.sep))
  process.env.DSH_HOME = stage
  const nativeRequire = createRequire(path.join(nativeRoot, 'package.json'))
  const { boot } = await import(pathToFileURL(nativeRequire.resolve('@deepseek-ai/dsh-app-boot')).href)
  const { PluginManager } = await import(pathToFileURL(nativeRequire.resolve('@deepseek-ai/dsh-plugin-manager')).href)
  const installedRoot = path.join(profile.dir, 'node_modules', ...owner.split('/'))
  const installed = JSON.parse(fs.readFileSync(path.join(installedRoot, 'package.json'), 'utf8'))
  assert.equal(installed.name, owner); assert.equal(installed.version, version)
  const updaterModule = owner === 'dsh-wechat-remote' ? 'native/lib/native-update-service.js' : 'lib/native-update-service.js'
  const { NativeUpdateService } = await import(pathToFileURL(path.join(installedRoot, updaterModule)).href)
  const manifestPath = path.join(profile.dir, 'package.json'), before = fs.readFileSync(manifestPath)
  let host, recovered
  try {
    host = await boot('native-update-recovery-test', config, [], async ctx => { ctx.provide('profileContext', profile) })
    await host.plugin(PluginManager, { idleTimeoutMs: 60000, ...(registry ? { registry, fallbackRegistries: [] } : {}) })
    const manager = host.get('pluginManager')
    recovered = new NativeUpdateService({ home: profile.home, scope: profile.name, runningVersion: installed.version,
      manager: () => manager,
      sessions: () => { assert(continuation, 'recovery must not inspect sessions'); return { list: async () => ({ items: [] }) } },
      release: async () => { assert(continuation, 'recovery must not check the network'); return {
        release, channel: 'preview', advice: { revision: 'after-native-transition', component: 'plugin', targetVersion: release.version },
      } } })
    if (continuation) {
      const check = await recovered.check()
      assert.equal(check.canInstall, true, JSON.stringify(check))
      recovered.start(check.ticket)
      const deadline = Date.now() + 90000
      while (recovered.isBusy() && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 100))
      assert.equal(recovered.isBusy(), false)
    }
    const status = await recovered.status()
    const expectedVersion = continuation ? release.version : installed.version
    assert.equal(status.phase, continuation ? 'restart-required' : 'complete', JSON.stringify(status))
    assert.equal(status.targetVersion, expectedVersion)
    assert.equal(recovered.isBusy(), false)
    const rows = (await manager.listBundles()).filter(row => ['dsh-wechat-remote', '@harness-remote/dsh-wechat-remote'].includes(row.name))
    assert.equal(rows.length, 1); assert.equal(rows[0].name, owner); assert.equal(rows[0].version, expectedVersion)
    if (continuation) assert.equal(JSON.parse(fs.readFileSync(manifestPath)).dependencies[owner], expectedVersion, 'file first hop must return to the same native registry owner')
    else assert.deepEqual(fs.readFileSync(manifestPath), before, 'recovery must not reinstall or change the profile')
    console.log(JSON.stringify({ check: `${path.basename(profile.home)}-${continuation ? 'followup-update' : 'cold-recovery'}`, nativeResult: status.phase,
      baseline: installed.version, target: expectedVersion, separateProcess: true, actualInstalledUpdater: true,
      bundleCount: rows.length, gateStarted: false, appWindowStarted: false }))
  } finally { recovered?.dispose(); await host?.fiber.dispose() }
} else if (process.env.HARNESS_DSH_ASAR && !process.env.HARNESS_OFFICIAL_UPDATE_STAGE) {
  const asar = process.env.HARNESS_DSH_ASAR, fd = fs.openSync(asar, 'r')
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
      if (entry.unpacked) fs.copyFileSync(path.join(asar + '.unpacked', relative), target)
      else { const bytes = Buffer.alloc(entry.size); fs.readSync(fd, bytes, 0, bytes.length, offset + Number(entry.offset)); fs.writeFileSync(target, bytes) }
    }
    materialize(tree.files.dsh, 'dsh')
    execFileSync(process.execPath, [script], { env: { ...process.env, HARNESS_OFFICIAL_UPDATE_STAGE: stage,
      HARNESS_DSH_ROOT: path.join(stage, 'dsh/node_modules/@deepseek-ai/dsh') }, stdio: 'inherit', windowsHide: true, timeout: 240000 })
  } finally { fs.closeSync(fd); cleanup() }
} else {
  let server, current, updater
  try {
    assert(process.env.HARNESS_DSH_ROOT, 'set HARNESS_DSH_ROOT or HARNESS_DSH_ASAR; no silent skip')
    const oldArchive = path.resolve(process.env.HARNESS_UPDATE_OLD_ARCHIVE || '')
    const targetArchive = path.resolve(process.env.HARNESS_UPDATE_TARGET_ARCHIVE || '')
    assert(fs.statSync(oldArchive).isFile() && fs.statSync(targetArchive).isFile(), 'two actual outer archives are required')
    const oldBytes = fs.readFileSync(oldArchive), targetBytes = fs.readFileSync(targetArchive)
    const entry = (archive, wanted) => {
      const tar = gunzipSync(archive, { maxOutputLength: 128 * 1024 * 1024 })
      for (let offset = 0; offset + 512 <= tar.length;) {
        const header = tar.subarray(offset, offset + 512)
        if (header.every(byte => !byte)) break
        const field = (at, size) => header.subarray(at, at + size).toString('utf8').replace(/\0.*$/s, '')
        const name = (field(345, 155) ? field(345, 155) + '/' : '') + field(0, 100)
        const size = Number.parseInt(field(124, 12).trim(), 8)
        assert(Number.isSafeInteger(size) && size >= 0 && offset + 512 + size <= tar.length)
        if (name === wanted) return Buffer.from(tar.subarray(offset + 512, offset + 512 + size))
        offset += 512 + Math.ceil(size / 512) * 512
      }
      throw Error(`archive is missing ${wanted}`)
    }
    const oldManifest = JSON.parse(entry(oldBytes, 'package/package.json'))
    const targetManifest = JSON.parse(entry(targetBytes, 'package/package.json'))
    const transitionArchive = process.env.HARNESS_UPDATE_TRANSITION_ARCHIVE
      ? path.resolve(process.env.HARNESS_UPDATE_TRANSITION_ARCHIVE) : undefined
    const transitionBytes = transitionArchive ? fs.readFileSync(transitionArchive) : undefined
    const transitionManifest = transitionBytes ? JSON.parse(entry(transitionBytes, 'package/package.json')) : undefined
    const outer = 'dsh-wechat-remote'
    assert.equal(oldManifest.name, outer); assert.equal(targetManifest.name, outer)
    assert.notEqual(oldManifest.version, targetManifest.version)
    if (transitionManifest) {
      assert.equal(transitionManifest.name, outer)
      assert.notEqual(transitionManifest.version, oldManifest.version)
      assert.notEqual(transitionManifest.version, targetManifest.version)
    }
    console.log(JSON.stringify({ baseline: oldManifest.version, target: targetManifest.version,
      oldSha256: createHash('sha256').update(oldBytes).digest('hex'), targetSha256: createHash('sha256').update(targetBytes).digest('hex') }))

    // The published package supplies the exact bundled pnpm executable. Extract
    // only in our stage; no install script, npm publish or global installation.
    const tooling = path.join(stage, 'published-tooling'); fs.mkdirSync(tooling)
    execFileSync('tar', ['-xzf', oldArchive, '-C', tooling], { windowsHide: true })
    const pnpm = path.join(tooling, 'package/node_modules/pnpm/bin/pnpm.cjs')
    assert(fs.existsSync(pnpm), 'published baseline must contain its actual pnpm')
    process.env.DSH_HOME = stage
    const nativeRoot = process.env.HARNESS_DSH_ROOT
    const nativeRequire = createRequire(path.join(nativeRoot, 'package.json'))
    const { boot } = await import(pathToFileURL(nativeRequire.resolve('@deepseek-ai/dsh-app-boot')).href)
    const { PluginManager } = await import(pathToFileURL(nativeRequire.resolve('@deepseek-ai/dsh-plugin-manager')).href)
    // Public updater modules need the host's actual Cordis peer, not a fake API.
    const peers = path.join(stage, 'node_modules/@deepseek-ai'); fs.mkdirSync(peers, { recursive: true })
    fs.symlinkSync(path.dirname(path.dirname(nativeRequire.resolve('@deepseek-ai/cordis'))), path.join(peers, 'cordis'), 'junction')
    const library = process.env.HARNESS_UPDATE_PLUGIN_LIB || path.resolve(path.dirname(script), '../lib')
    const candidate = path.join(stage, 'candidate'); fs.mkdirSync(candidate)
    fs.writeFileSync(path.join(candidate, 'package.json'), '{"type":"module"}\n')
    for (const file of ['native-update-service.js', 'update-policy.js', 'update-download.js', 'secure-file.js']) fs.copyFileSync(path.join(library, file), path.join(candidate, file))
    const { NativeUpdateService: CurrentUpdater } = await import(pathToFileURL(path.join(candidate, 'native-update-service.js')).href)
    const { NativeUpdateService: BaselineUpdater } = await import(pathToFileURL(path.join(tooling, 'package/native/lib/native-update-service.js')).href)
    const requests = []
    let origin
    const metadata = (manifest, bytes) => ({ ...manifest, dist: {
      tarball: `${origin}/${outer}/-/${outer}-${manifest.version}.tgz`,
      shasum: createHash('sha1').update(bytes).digest('hex'), integrity: `sha512-${createHash('sha512').update(bytes).digest('base64')}`,
    } })
    server = http.createServer((req, res) => {
      requests.push(req.url)
      for (const [manifest, bytes] of [[oldManifest, oldBytes], [targetManifest, targetBytes]]) {
        if (req.url === `/${outer}/-/${outer}-${manifest.version}.tgz`) { res.writeHead(200, { 'content-type': 'application/octet-stream', 'content-length': bytes.length }); res.end(bytes); return }
        if (req.url === `/${outer}/${manifest.version}`) { res.setHeader('content-type', 'application/json'); res.end(JSON.stringify(metadata(manifest, bytes))); return }
      }
      if (req.url === `/${outer}`) {
        res.setHeader('content-type', 'application/json')
        res.end(JSON.stringify({ name: outer, 'dist-tags': { latest: targetManifest.version }, versions: {
          [oldManifest.version]: metadata(oldManifest, oldBytes), [targetManifest.version]: metadata(targetManifest, targetBytes),
        } })); return
      }
      res.writeHead(404); res.end(JSON.stringify({ error: 'not found', path: req.url }))
    })
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
    origin = `http://127.0.0.1:${server.address().port}`
    const installAnchor = path.join(stage, 'installation/package.json')
    fs.mkdirSync(path.dirname(installAnchor)); fs.writeFileSync(installAnchor, '{"dependencies":{}}\n')
    const config = path.join(stage, 'root.yml'); fs.writeFileSync(config, '[]\n')
    const release = { version: targetManifest.version, channel: 'preview', asset: {
      url: `https://github.com/martinbear1/dsh-wechat-remote/releases/download/v${targetManifest.version}/plugin.tgz`,
      ...(() => { const bytes = entry(targetBytes, 'package/assets/plugin.tgz'); return { bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') } })(),
    }, npmInstaller: { version: targetManifest.version, url: `https://registry.npmjs.org/${outer}/-/${outer}-${targetManifest.version}.tgz`,
      bytes: targetBytes.length, sha256: createHash('sha256').update(targetBytes).digest('hex') } }
    const core = '@harness-remote/dsh-wechat-remote'
    const targetCore = entry(targetBytes, 'package/assets/plugin.tgz')
    for (const [name, scope, Updater, owner] of [
      ['released-desktop', 'desktop', BaselineUpdater, outer],
      ['current-desktop', 'desktop', CurrentUpdater, outer], ['current-web', 'web', CurrentUpdater, outer],
      ['current-desktop-core', 'desktop', CurrentUpdater, core], ['current-web-core', 'web', CurrentUpdater, core],
      ...(transitionArchive ? [['native-web-add-first-hop', 'web', undefined, outer], ['native-web-add-disabled', 'web', undefined, outer]] : []),
    ]) {
      const home = path.join(stage, name), dir = path.join(home, 'profiles', scope)
      fs.mkdirSync(dir, { recursive: true }); fs.writeFileSync(path.join(dir, 'package.json'), '{"private":true,"dependencies":{},"dsh":{"profile":{"bundles":[]}}}\n')
      const npmConfig = path.join(home, '.npmrc'); fs.writeFileSync(npmConfig, `registry=${origin}\nstore-dir=${path.join(stage, 'pnpm-store').replace(/\\/g, '/')}\n`)
      const profile = { name: scope, dir, home, cwd: dir, installAnchor, patchPath: path.join(dir, 'cordis.patch.yml'), startedBundles: [],
        packageManager: { command: process.execPath, args: [pnpm], env: { npm_config_userconfig: npmConfig,
          npm_config_cache: path.join(stage, 'npm-cache'), PNPM_HOME: path.join(stage, 'pnpm-home'), XDG_CACHE_HOME: path.join(stage, 'xdg-cache') } } }
      current = await boot('native-update-test', config, [], async ctx => { ctx.provide('profileContext', profile) })
      await current.plugin(PluginManager, { registry: origin, fallbackRegistries: [], idleTimeoutMs: 60000 })
      const manager = current.get('pluginManager')
      assert(manager, 'actual PluginManager service must activate')
      const baselineArchive = owner === core ? path.join(tooling, 'package/assets/plugin.tgz') : oldArchive
      const installed = await manager.installBundle(baselineArchive, { enabled: true, requestId: `${name}-baseline` })
      assert.equal(installed.error, undefined, JSON.stringify(installed))
      assert.equal(installed.bundle, owner)
      assert.equal((await manager.listBundles()).find(row => row.name === owner)?.version, oldManifest.version)
      assert.equal((await manager.inspect(`${owner}@${targetManifest.version}`)).problem, 'already-installed', 'native Add preflight differs from updater API')
      const runningVersion = oldManifest.version
      const preserved = new Map([
        [path.join(dir, 'fixture-user-settings.json'), '{"fixture":"unchanged settings"}\n'],
        [path.join(home, 'sessions/fixture.jsonl'), '{"fixture":"unchanged session"}\n'],
        [path.join(home, 'profiles', scope === 'web' ? 'desktop' : 'web', 'package.json'), '{"fixture":"separate node"}\n'],
      ])
      for (const [file, contents] of preserved) { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, contents) }
      if (!Updater) {
        const originallyEnabled = name !== 'native-web-add-disabled'
        if (!originallyEnabled) {
          const disabled = await manager.setBundleEnabled(outer, false)
          assert.equal(disabled.error, undefined, JSON.stringify(disabled))
        }
        // DSH 0.1.7-rc.2's actual Add UI calls inspect then installBundle with
        // enabled:false. Do not skip preflight or pretend the frozen button ran.
        const inspected = await manager.inspect(transitionArchive)
        assert.equal(inspected.status, 'accepted', JSON.stringify(inspected))
        assert.equal(inspected.kind, 'tarball')
        const firstHop = await manager.installBundle(transitionArchive, { enabled: false, requestId: `${name}-transition` })
        assert.equal(firstHop.error, undefined, JSON.stringify(firstHop))
        assert.equal(firstHop.application, 'restart-required', JSON.stringify(firstHop))
        const rows = (await manager.listBundles()).filter(row => [outer, core].includes(row.name))
        assert.equal(rows.length, 1); assert.equal(rows[0].version, transitionManifest.version)
        assert.equal(rows[0].enabled, originallyEnabled, 'Add must preserve the existing enablement')
        const transitioned = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'))
        assert.deepEqual(Object.keys(transitioned.dependencies), [outer])
        assert.deepEqual(transitioned.dsh.profile.bundles, originallyEnabled ? [outer] : [])
        for (const [file, contents] of preserved) assert.equal(fs.readFileSync(file, 'utf8'), contents)
        console.log(JSON.stringify({ check: name, from: oldManifest.version, to: transitionManifest.version,
          sha256: createHash('sha256').update(transitionBytes).digest('hex'), nativeInspect: inspected.status,
          nativeResult: firstHop.application, sameUiOptions: true, bundleCount: rows.length,
          enabledPreserved: true, originallyEnabled, fixtureDataPreserved: true, oldButtonUsed: false }))
        await current.fiber.dispose()
        current = undefined
        if (!originallyEnabled) continue
        // Recreating Cordis in this process is NOT a cold restart: Node retains
        // module/symlink resolution for the old installed path. Use a genuinely
        // new process and keep this process's loopback registry serving it.
        const continuationFile = path.join(home, 'first-hop-followup.json')
        fs.writeFileSync(continuationFile, JSON.stringify({ profile, nativeRoot, config, owner,
          version: transitionManifest.version, release, registry: origin }))
        const followed = await promisify(execFile)(process.execPath, [script], { env: { ...process.env,
          HARNESS_OFFICIAL_UPDATE_STAGE: stage, HARNESS_OFFICIAL_UPDATE_CONTINUATION: continuationFile },
          windowsHide: true, timeout: 120000, maxBuffer: 1024 * 1024 })
        process.stdout.write(followed.stdout); process.stderr.write(followed.stderr)
        for (const [file, contents] of preserved) assert.equal(fs.readFileSync(file, 'utf8'), contents)
        const recoveryFile = path.join(home, 'cold-recovery.json')
        fs.writeFileSync(recoveryFile, JSON.stringify({ profile, nativeRoot, config, owner, version: targetManifest.version }))
        execFileSync(process.execPath, [script], { env: { ...process.env, HARNESS_OFFICIAL_UPDATE_STAGE: stage,
          HARNESS_OFFICIAL_UPDATE_RECOVERY: recoveryFile }, stdio: 'inherit', windowsHide: true, timeout: 60000 })
        continue
      }
      if (owner === core) {
        // The updater still performs its real SHA/name/version audit. This
        // preloaded immutable cache isolates native installation from GitHub
        // publication; the download/fallback itself has separate regressions.
        const cache = path.join(home, 'harness-remote-updates', `native-${scope}`)
        fs.mkdirSync(cache, { recursive: true })
        fs.writeFileSync(path.join(cache, `core-${release.version}-${release.asset.sha256}.tgz`), targetCore)
      }
      const options = { home, scope, runningVersion, manager: () => current.get('pluginManager'),
        sessions: () => ({ list: async () => ({ items: [] }) }),
        release: async () => ({ channel: 'preview', release, advice: { revision: 'official-test', component: 'plugin', targetVersion: targetManifest.version } }) }
      updater = new Updater(options)
      const check = await updater.check()
      assert.equal(check.canInstall, true, JSON.stringify(check))
      updater.start(check.ticket)
      const deadline = Date.now() + 90000
      while (updater.isBusy() && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 100))
      assert.equal(updater.isBusy(), false, 'native installation did not settle')
      const status = await updater.status()
      assert.equal(status.phase, 'restart-required', JSON.stringify(status))
      const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'))
      assert.deepEqual(Object.keys(manifest.dependencies), [owner])
      assert.deepEqual(manifest.dsh.profile.bundles, [owner])
      const installedBundles = (await manager.listBundles()).filter(row => [outer, core].includes(row.name))
      assert.equal(installedBundles.length, 1); assert.equal(installedBundles[0].version, targetManifest.version)
      assert(manifest.dependencies[owner].includes(targetManifest.version), 'confirmed version must replace baseline spec')
      if (owner === core) assert(fs.existsSync(path.resolve(dir, manifest.dependencies[owner].replace(/^file:/, ''))), 'native file reference must survive completion')
      for (const [file, contents] of preserved) assert.equal(fs.readFileSync(file, 'utf8'), contents)
      console.log(JSON.stringify({ check: name, baseline: runningVersion, target: targetManifest.version,
        nativeResult: status.phase, dependency: manifest.dependencies[owner], bundleCount: installedBundles.length,
        realNativeManager: true, realPnpm: true, untouchedBaselineUpdater: Updater === BaselineUpdater }))
      updater.dispose(); updater = undefined
      await current.fiber.dispose(); current = undefined
      const recoveryFile = path.join(home, 'cold-recovery.json')
      fs.writeFileSync(recoveryFile, JSON.stringify({ profile, nativeRoot, config, owner, version: targetManifest.version }))
      execFileSync(process.execPath, [script], { env: { ...process.env, HARNESS_OFFICIAL_UPDATE_STAGE: stage,
        HARNESS_OFFICIAL_UPDATE_RECOVERY: recoveryFile }, stdio: 'inherit', windowsHide: true, timeout: 60000 })
    }
    assert(requests.some(url => url === `/${outer}/-/${outer}-${targetManifest.version}.tgz`), 'native npm transport must actually obtain the candidate archive')
    console.log(JSON.stringify({ hostVersion: JSON.parse(fs.readFileSync(path.join(nativeRoot, 'package.json'), 'utf8')).version,
      source: 'official manager + released baseline updater + candidate updater', realProfileRead: false,
      realProfileWrite: false, tests: transitionArchive ? 7 : 5, isolatedColdRecoveries: transitionArchive ? 6 : 5,
      fixtureRegistryRequests: requests.length, applicationRestart: false }))
  } finally {
    updater?.dispose(); await current?.fiber.dispose()
    await new Promise(resolve => server ? server.close(resolve) : resolve())
    if (!process.env.HARNESS_OFFICIAL_UPDATE_STAGE) cleanup()
  }
}
