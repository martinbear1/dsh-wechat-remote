/** Actual installed Settings + ConfigEditor integration in disposable profiles.
 * Called only from the isolated app.asar extraction test, never a live profile. */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

export async function verifyNativePresetSettings({ load, work, invokeHostRemote }) {
  const { boot, initProfile, readProfilePatches } = await load('@deepseek-ai/dsh-app-boot')
  const { default: ConfigEditor } = await load('@deepseek-ai/dsh-config-editor')
  const { default: Settings } = await load('@deepseek-ai/dsh-settings')
  const { default: SettingsController } = await load('@deepseek-ai/dsh-api-settings-controller')
  const { AgentPresetRegistry } = await load('@deepseek-ai/dsh-agent-preset-registry')
  const home = path.join(work, 'settings-fixture-home'), contexts = []
  const put = (file, value) => { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, JSON.stringify(value)) }
  put(path.join(home, 'package.json'), { name: 'isolated-native-settings-fixture' })
  const signal = new AbortController().signal
  async function host(name) {
    const dir = path.join(home, 'profiles', name)
    if (!fs.existsSync(dir)) {
      initProfile(dir, ['fixture-preset'])
      put(path.join(dir, 'node_modules/fixture-preset/package.json'), { name: 'fixture-preset', version: '1.0.0', dsh: { bundle: { patch: 'cordis.patch.yml' } } })
      put(path.join(dir, 'node_modules/fixture-preset/cordis.patch.yml'), [{ insert: [
        { id: 'config-editor', name: 'cordis:editor' }, { id: 'settings', name: 'cordis:settings' },
        { id: 'agent-preset-registry', name: 'cordis:presets', config: { default: 'standard' } },
      ] }])
      put(path.join(dir, 'cordis.yml'), [])
    }
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
    assert(ctx.get('agentPresets'), 'actual native registry must activate')
    await ctx.agentPresets.register({ id: 'standard', plugins: [] })
    await ctx.agentPresets.register({ id: 'minimal', plugins: [] })
    const calls = [], gateway = { async invoke(request) {
      calls.push(request)
      if (request.namespace === 'settings' && request.method === 'describe') return ctx.settingsController.describe()
      if (request.namespace === 'settings' && request.method === 'update') return ctx.settingsController.update(request.args.ns, request.args.patch, request.args.expectedRevision)
      if (request.namespace === 'agentPresets' && request.method === 'list') return ctx.agentPresets.remoteExportList()
      assert.fail(`unexpected native endpoint ${request.namespace}/${request.method}`)
    } }
    return { ctx, profile, calls, gateway }
  }
  const read = h => invokeHostRemote(h.ctx, h.gateway, { namespace: 'agentPresets', method: 'list', args: {}, signal })
  const select = (h, id, gateway = h.gateway) => invokeHostRemote(h.ctx, gateway, {
    namespace: 'settings', method: 'update', args: { ns: 'agent-presets', patch: { default: id } }, signal,
  })
  try {
    const web = await host('web'), desktop = await host('desktop')
    const retired = await web.ctx.agentPresets.register({ id: 'retired-assistant', plugins: [] })
    await web.ctx.settingsController.update('agent-preset-registry', { selectedDefault: 'retired-assistant' })
    await retired()
    assert.deepEqual((await read(web)).defaultPreset, { id: 'retired-assistant', state: 'unavailable' })
    assert.equal(web.ctx.agentPresets.defaultId, 'retired-assistant', 'catalog read must not repair or replace a temporarily absent default')
    await assert.rejects(web.ctx.agentPresets.resolve(), error => error.code === 'agent-preset/not-found')
    await assert.rejects(web.ctx.settingsController.update('agent-presets', { default: 'minimal' }), /No configurable plugin entry/)
    await assert.rejects(web.ctx.settingsController.update('agent-preset-registry', { default: 'minimal' }), /not volatile/)
    const before = web.calls.filter(row => row.method === 'update').length
    await select(web, 'minimal')
    assert.equal(web.calls.filter(row => row.method === 'update').length, before + 1, 'one explicit selection produces one native write')
    assert.deepEqual((await read(web)).defaultPreset, { id: 'minimal', state: 'available' })
    assert.equal((await web.ctx.agentPresets.resolve()).id, 'minimal')
    assert.equal(desktop.ctx.agentPresets.defaultId, 'standard', 'one node cannot repair another node default')
    assert.match(fs.readFileSync(web.profile.patchPath, 'utf8'), /selectedDefault: minimal/)
    await web.ctx.fiber.dispose(); await desktop.ctx.fiber.dispose(); contexts.splice(0)

    const restoredWeb = await host('web'), restoredDesktop = await host('desktop')
    assert.equal(restoredWeb.ctx.agentPresets.defaultId, 'minimal', 'explicit repair survives native restart')
    assert.equal(restoredDesktop.ctx.agentPresets.defaultId, 'standard', 'other node remains unchanged after restart')
    let raced = false
    const racingGateway = { async invoke(request) {
      const result = await restoredWeb.gateway.invoke(request)
      if (request.namespace === 'settings' && request.method === 'describe' && !raced) {
        raced = true
        const revision = result.namespaces.find(row => row.ns === 'agent-preset-registry').revision
        await restoredWeb.ctx.settingsController.update('agent-preset-registry', { selectedDefault: 'standard' }, revision)
      }
      return result
    } }
    const count = restoredWeb.calls.filter(row => row.method === 'update').length
    await assert.rejects(select(restoredWeb, 'minimal', racingGateway), error => error.code === 'settings/conflict')
    assert.equal(restoredWeb.calls.filter(row => row.method === 'update').length, count + 1, 'conflicted explicit selection is not silently retried')
    assert.equal(restoredWeb.ctx.agentPresets.defaultId, 'standard', 'concurrent native choice wins')
    assert.equal(restoredDesktop.ctx.agentPresets.defaultId, 'standard')
    return ['actual native Settings/ConfigEditor stale selectedDefault repair', 'production host contract uses one explicit native settings write',
      'profile patch persistence and restart', 'node isolation', 'native revision conflict without retry', 'catalog reads remain nonmutating']
  } finally {
    for (const ctx of contexts.reverse()) await ctx.fiber.dispose()
  }
}
