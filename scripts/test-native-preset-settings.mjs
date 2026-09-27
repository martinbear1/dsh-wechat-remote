/** Official Settings/ConfigEditor/AgentPresetRegistry over isolated real profile
 * files. No model, user credentials, live DSH process or production data.
 * HARNESS_DSH_SOURCE must be the pinned upstream source being qualified. */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { createRequire } from 'node:module'
import { execFileSync } from 'node:child_process'
import { build } from 'esbuild'
import { invokeLegacyRpc, resolveTypertGateway } from '../lib/dsh-protocol-compat.js'

const source = process.env.HARNESS_DSH_SOURCE
assert(source, 'HARNESS_DSH_SOURCE is required; no silently skipped upstream test')
const sha = execFileSync('git', ['-C', source, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()
const require = createRequire(import.meta.url), packages = new Map()
// Optional already installed DSH supplies its own third-party dependencies;
// no CLI is executed and its files/configuration are never modified.
const dependencies = process.env.HARNESS_DSH_DEPENDENCIES
  ? createRequire(path.join(process.env.HARNESS_DSH_DEPENDENCIES, 'package.json')) : require
for (const file of execFileSync('git', ['-C', source, 'ls-files', 'packages/**/package.json', 'vendor/**/package.json'], { encoding: 'utf8' }).trim().split(/\r?\n/)) {
  const full = path.join(source, file), manifest = JSON.parse(fs.readFileSync(full, 'utf8'))
  packages.set(manifest.name, path.dirname(full))
}
const work = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-preset-native-')))
const contexts = []
try {
  const artifact = path.join(work, 'lib/upstream.mjs')
  // The official bundled runtime resolves its own package version relative
  // to import.meta.url. Preserve that layout without changing source code.
  fs.copyFileSync(path.join(packages.get('@deepseek-ai/dsh-app-boot'), 'package.json'), path.join(work, 'package.json'))
  await build({ stdin: { contents: `
    export {boot,initProfile,readProfilePatches} from '@deepseek-ai/dsh-app-boot';
    export {default as ConfigEditor} from '@deepseek-ai/dsh-config-editor';
    export {default as Settings} from '@deepseek-ai/dsh-settings';
    export {default as SettingsController} from '@deepseek-ai/dsh-api-settings-controller';
    export {AgentPresetRegistry} from '@deepseek-ai/dsh-agent-preset-registry';
  `, resolveDir: process.cwd() }, bundle: true, platform: 'node', format: 'esm', target: 'es2022', outfile: artifact,
    plugins: [{ name: 'pinned-host-source', setup(builder) {
      builder.onResolve({ filter: /^[^./]/ }, args => {
        if (args.path.startsWith('node:') || path.isAbsolute(args.path)) return
        const name = args.path.startsWith('@') ? args.path.split('/').slice(0, 2).join('/') : args.path.split('/')[0]
        const directory = packages.get(name)
        if (directory) {
          const suffix = args.path.slice(name.length + 1) || 'index'
          const file = path.join(directory, 'src', suffix + '.ts')
          assert(fs.existsSync(file), `unresolved pinned source: ${args.path}`)
          return { path: file }
        }
        // Reuse only the already installed external/vendor dependencies.
        let file
        try { file = dependencies.resolve(args.path) } catch { file = require.resolve(args.path) }
        return { path: pathToFileURL(file).href, external: true }
      })
    } }], logLevel: 'warning' })
  const { boot, initProfile, readProfilePatches, ConfigEditor, Settings, SettingsController, AgentPresetRegistry } = await import(pathToFileURL(artifact))
  const home = path.join(work, 'home'); fs.mkdirSync(home)
  const put = (file, value) => { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, JSON.stringify(value)) }
  put(path.join(home, 'package.json'), { name: 'isolated-settings-test' })
  async function host(name) {
    const dir = path.join(home, 'profiles', name)
    initProfile(dir, ['fixture-preset'])
    put(path.join(dir, 'node_modules/fixture-preset/package.json'), { name: 'fixture-preset', version: '1.0.0', dsh: { bundle: { patch: 'cordis.patch.yml' } } })
    put(path.join(dir, 'node_modules/fixture-preset/cordis.patch.yml'), [{ insert: [
      { id: 'config-editor', name: 'cordis:editor' }, { id: 'settings', name: 'cordis:settings' },
      { id: 'agent-preset-registry', name: 'cordis:presets', config: { default: 'standard' } },
    ] }])
    put(path.join(dir, 'cordis.yml'), [])
    const profile = { name, startedBundles: ['fixture-preset'], dir, patchPath: path.join(dir, 'cordis.patch.yml'),
      installAnchor: path.join(home, 'package.json'), cwd: home, home, overlays: [], telemetryDisabledEnv: undefined }
    const ctx = await boot(name, path.join(dir, 'cordis.yml'), readProfilePatches(name, profile), owner => {
      owner.provide('profileContext', profile)
      owner.provide('appReady', { onReady(listener) { listener(); return () => {} } })
      owner.provide('sessionProjections', { register() { return () => {} } })
      Object.assign(owner.loader.builtins, { editor: ConfigEditor, settings: Settings, presets: AgentPresetRegistry })
    })
    contexts.push(ctx)
    await ctx.plugin(SettingsController)
    assert(ctx.get('agentPresets'), JSON.stringify([...ctx.loader.entries()].map(e => ({ id: e.options.id, name: e.options.name, state: e.fiber?.state, error: String(e.fiber?.error ?? '') }))))
    // Empty preset declarations isolate selection/persistence from tools/LLMs.
    await ctx.agentPresets.register({ id: 'standard', plugins: [] })
    await ctx.agentPresets.register({ id: 'minimal', plugins: [] })
    const calls = []
    ctx.provide('typertGateway', { async stream() { assert.fail('no stream used for settings') }, async invoke(r) {
      calls.push(r)
      if (r.namespace === 'settings' && r.method === 'describe') return ctx.settingsController.describe()
      if (r.namespace === 'settings' && r.method === 'update') return ctx.settingsController.update(r.args.ns, r.args.patch, r.args.expectedRevision)
      if (r.namespace === 'agentPresets' && r.method === 'list') return ctx.agentPresets.remoteExportList()
      assert.fail(`unexpected gateway endpoint: ${r.namespace}/${r.method}`)
    } })
    return { ctx, profile, calls, gateway: resolveTypertGateway(ctx) }
  }
  const web = await host('web'), desktop = await host('desktop')
  for (const h of [web, desktop]) {
    // Reproduce the reported rejection in the unchanged native implementation.
    await assert.rejects(h.ctx.settingsController.update('agent-presets', { default: 'minimal' }), /No configurable plugin entry/)
    await assert.rejects(h.ctx.settingsController.update('agent-preset-registry', { default: 'minimal' }), /not volatile/)
    const request = { type: 'client-request', rpcId: 'preset-test', method: 'settings.update', payload: { ns: 'agent-presets', patch: { default: 'minimal' } } }
    const result = await invokeLegacyRpc(h.gateway, request, { signal: new AbortController().signal, describeHost: () => ({}) })
    assert.equal(result.result.ok, true, JSON.stringify(result))
    assert.equal(h.ctx.agentPresets.defaultId, 'minimal', 'the native consumer must observe the changed live setting')
    assert.equal(h.calls.filter(r => r.method === 'update').length, 1)
    const roster = await h.ctx.agentPresets.remoteExportList()
    assert.equal(roster.presets.find(r => r.id === 'minimal').isDefault, true)
    assert.match(fs.readFileSync(h.profile.patchPath, 'utf8'), /selectedDefault: minimal/)
    if (h === web) assert.equal(desktop.ctx.agentPresets.defaultId, 'standard', 'Web settings must not mutate Desktop')
  }
  // Native optimistic concurrency is preserved: no mutation replay on conflict.
  const revision = web.ctx.settingsController.describe().namespaces.find(r => r.ns === 'agent-preset-registry').revision
  await web.ctx.settingsController.update('agent-preset-registry', { selectedDefault: 'standard' }, revision)
  await assert.rejects(web.ctx.settingsController.update('agent-preset-registry', { selectedDefault: 'minimal' }, revision), e => e.code === 'settings/conflict')
  assert.equal(web.ctx.agentPresets.defaultId, 'standard')
  assert.equal(desktop.ctx.agentPresets.defaultId, 'minimal')
  await web.ctx.fiber.dispose(); await desktop.ctx.fiber.dispose()
  contexts.splice(0)
  const reopenedWeb = await host('web'), reopenedDesktop = await host('desktop')
  assert.equal(reopenedWeb.ctx.agentPresets.defaultId, 'standard')
  assert.equal(reopenedDesktop.ctx.agentPresets.defaultId, 'minimal')
  console.log(`PASS native settings ${sha}: original error reproduced, released phone translation, real profile persistence/live consumer, Web/Desktop isolation, revision conflict, restart persistence`)
} finally {
  for (const ctx of contexts.reverse()) await ctx.fiber.dispose()
  assert.equal(path.dirname(work), fs.realpathSync(os.tmpdir()))
  assert(path.basename(work).startsWith('dsh-preset-native-'))
  fs.rmSync(work, { recursive: true, force: true })
}
