/** Read-only contract test against the installed DSH archive. Evaluates actual
 * native picker registration and workspace navigation code in an isolated VM.
 * No live profile, UI automation, network write, session or settings changes. */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import { createHash } from 'node:crypto'
import { transform } from 'esbuild'
const archive = process.env.HARNESS_DSH_ASAR
assert(archive, 'HARNESS_DSH_ASAR is required; no silent native-test skip')
const fd = fs.openSync(archive, 'r'), prefix = Buffer.alloc(16)
fs.readSync(fd, prefix, 0, 16, 0)
const bytes = Buffer.alloc(prefix.readUInt32LE(12)); fs.readSync(fd, bytes, 0, bytes.length, 16)
const tree = JSON.parse(bytes), base = 8 + prefix.readUInt32LE(4)
function read(packageName) {
  const relative = `dsh/node_modules/@deepseek-ai/${packageName}/lib/client.js`
  let entry = tree; for (const part of relative.split('/')) entry = entry.files[part]
  assert(!entry.unpacked && !entry.link)
  const data = Buffer.alloc(entry.size); fs.readSync(fd, data, 0, data.length, base + Number(entry.offset))
  return data.toString('utf8')
}
let presetSource, workspaceSource
try { presetSource = read('dsh-client-ui-agent-preset'); workspaceSource = read('dsh-client-ui-workspace') } finally { fs.closeSync(fd) }
const src = fs.readFileSync(new URL('../src/client/assistant-navigation.ts', import.meta.url), 'utf8')
const { code } = await transform(src, { loader: 'ts', format: 'esm' })
const { nativeAssistantNavigation } = await import('data:text/javascript;base64,' + Buffer.from(code).toString('base64'))
const snapshot = initial => { let value = initial; const listeners = new Set(); return { getSnapshot: () => value,
  set(next) { value = next; for (const callback of listeners) callback() }, subscribe(callback) { listeners.add(callback); return () => listeners.delete(callback) } } }
const calls = [], entries = [], effects = []
const oldChat = { id: 'existing-chat', blank: false, retainedBy: { mainView: 1 }, projectionValues: { agentPreset: 'standard' }, draft: 'preserve unsent text' }
const list = snapshot({ phase: 'ready', ids: [oldChat.id], byId: { [oldChat.id]: oldChat } }), bindings = new Map()
const enabled = snapshot(true)
const ctx = {
  locale: { register: () => () => {}, bind: () => key => key },
  slots: { register(options) { const entry = { options, inject: options.inject }; entries.push(entry); return () => entries.splice(entries.indexOf(entry), 1) },
    entries: name => entries.filter(entry => entry.options.name === name), inject: (_name, callback) => callback() },
  configForms: { developerTools: { enabled } },
  sessions: { list, binding: id => bindings.get(id), retainInfo: id => ({ getSnapshot: () => ({ retainedBy: list.getSnapshot().byId[id].retainedBy }) }) },
  remote: { $on: () => () => {}, settings: { update: () => assert.fail('must not change default') }, agentPresets: {
    list: async () => ({ ok: true, value: { presets: [{ id: 'standard', isDefault: true }, { id: 'harness-teacher' }, { id: 'harness-customizer' }] } }),
    select: async (id, preset) => { calls.push(['host-select', id, preset]); list.getSnapshot().byId[id].projectionValues.agentPreset = preset; return { ok: true, value: preset } },
  } },
  on: () => () => {}, effect(callback) { const cleanup = callback(); if (typeof cleanup === 'function') effects.push(cleanup); return () => {} },
  inject: (_names, callback) => callback(ctx),
  layout: { selectPanel: value => { assert.equal(value, null); calls.push('native-hero') } },
}
const nativeDependencies = { '@deepseek-ai/dsh-client-store': { createSnapshotStore: snapshot }, 'react/jsx-runtime': {}, react: {}, '@deepseek-ai/dsh-client-ui-primitives': {} }
let presetModule
vm.runInNewContext(presetSource, { window: { __ModuleLoader__: { load: definition => { presetModule = definition.factory(name => { assert(name in nativeDependencies, name); return nativeDependencies[name] }) } } }, console, Promise, AbortController })
// UiWorkspaceService is private to the native module; extract its original
// class region unchanged, with the same injected native service dependencies.
const begin = workspaceSource.indexOf('var UiWorkspaceService = class '), end = workspaceSource.indexOf('\n\t\t/**', begin)
assert(begin > 0 && end > begin)
const scope = { _deepseek_ai_cordis: { Service: class { constructor(context) { this.ctx = context } } },
  _deepseek_ai_dsh_client_store: { createSnapshotStore: snapshot }, AbortController, console }
vm.runInNewContext(workspaceSource.slice(begin, end), scope)
const navigation = Object.create(scope.UiWorkspaceService.prototype)
navigation.ctx = ctx; navigation.selection = snapshot({ sessionId: oldChat.id })
navigation.mainReference = { sessionId: oldChat.id, release() { oldChat.retainedBy.mainView = 0; calls.push('release-old-main') } }
ctx.uiWorkspace = navigation
presetModule.apply(ctx)
const picker = ctx.slots.entries('conversation.hero.agentPreset')[0]
assert(picker && typeof picker.inject === 'function')
const adapter = nativeAssistantNavigation(name => ctx[name])
await adapter.start('harness-teacher')
assert.deepEqual(calls, ['release-old-main', 'native-hero'])
assert.equal(oldChat.projectionValues.agentPreset, 'standard'); assert.equal(oldChat.draft, 'preserve unsent text')
assert.equal(navigation.mainReference, undefined)
const unbound = picker.inject(undefined)
assert.equal(unbound.hooks.agentPresetSeat.getSnapshot().current, 'harness-teacher')
assert.equal(list.getSnapshot().ids.length, 1, 'click opens no session or workspace')
// Only the later explicit workspace choice creates/retains a native blank.
const fresh = { id: 'new-native-blank', blank: true, retainedBy: { mainView: 1 }, projectionValues: { agentPreset: 'standard' } }
const binding = { sessionId: fresh.id, ctx }; bindings.set(fresh.id, binding)
list.set({ phase: 'ready', ids: [oldChat.id, fresh.id], byId: { [oldChat.id]: oldChat, [fresh.id]: fresh } })
const bound = picker.inject(fresh.id); await bound.load()
assert.deepEqual(calls.at(-1), ['host-select', fresh.id, 'harness-teacher'])
assert.equal(oldChat.projectionValues.agentPreset, 'standard'); assert.equal(oldChat.draft, 'preserve unsent text')
await unbound.load(); assert.equal(unbound.hooks.agentPresetSeat.getSnapshot().current, 'standard', 'stage is consumed; host default remains unchanged')
enabled.set(false); await assert.rejects(adapter.start('harness-customizer'), /快捷入口/)
console.log(JSON.stringify({ archive, nativePickerSha256: createHash('sha256').update(presetSource).digest('hex'),
  nativeWorkspaceSha256: createHash('sha256').update(workspaceSource).digest('hex'), checks: [
    'native sessionless hero', 'preset staged without any session creation', 'old chat and draft preserved',
    'native blank adopts staged mode only after later workspace choice', 'next default unchanged', 'disabled native picker refuses'],
  actualHost: false, scope: 'installed native code, isolated VM, no profile writes' }, null, 2))
