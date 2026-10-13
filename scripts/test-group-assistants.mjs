/** Synthetic profiles only. No native host process, real settings or network. */
import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { setImmediate } from 'node:timers/promises'
import { GroupAssistantPreferences, GroupAssistantsController } from '../lib/group-assistants-component.js'
import { BUILTIN_ASSISTANTS, builtinAssistants } from '../lib/assistant-presets/builtins.js'
import { HUMAN_WORKFLOW_SKILL } from '../lib/human-workflow/dsh-skill.js'

const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done }); return { promise, resolve } }
function temporary(t) {
  const dir = mkdtempSync(path.join(tmpdir(), 'group-assistant-fixture-'))
  t.after(() => { assert.equal(path.dirname(dir), tmpdir()); rmSync(dir, { recursive: true, force: true }) })
  return path.join(dir, 'group-assistant-preferences-v1.json')
}
function fixture(file, options = {}) {
  const services = new Map(), entries = new Map(), cleanups = [], listeners = new Set(), scopes = new Map()
  const base = [{ id: 'persona', name: '@deepseek-ai/dsh-persona', config: { prefix: 'You are a coding agent powered by the {{model}} model.\nNative policy.', suffix: 'Keep suffix.' } }]
  let groupIntent = true, qualified = true, registrations = 0, refreshes = 0
  const access = { groupEnabled: () => qualified && groupIntent && services.get('wechatGroupAssistants')?.active === true,
    assertCurrent() { if (!access.groupEnabled()) throw Error('node group feature is off') }, assert: async () => access.assertCurrent(),
    grant: () => ({ message: '节点已关闭' }), subscribe: callback => { listeners.add(callback); return () => listeners.delete(callback) },
    componentsChanged() { for (const callback of listeners) callback() },
    async refresh() { refreshes++; access.componentsChanged() },
  }
  const registry = { async list() { return [...entries.values()].map(item => ({ id: item.id, name: item.name })) },
    async readDocument(id) { return { agentPreset: id, content: JSON.stringify(id === 'standard' ? base : entries.get(id)?.plugins) } },
    async register(item) {
      if (options.registration) await options.registration(item)
      assert(!entries.has(item.id), 'a live native identity cannot be overwritten')
      registrations++; entries.set(item.id, item)
      return async () => { if (entries.get(item.id) === item) entries.delete(item.id) }
    },
    async acquireScope(id) { assert(entries.has(id)); if (!scopes.has(id)) scopes.set(id, {}); return { key: scopes.get(id), async [Symbol.asyncDispose]() {} } },
  }
  services.set('wechatFeatures', { access }); services.set('agentPresets', registry)
  services.set('profileContext', { installAnchor: fileURLToPath(new URL('../package.json', import.meta.url)) })
  services.set('loader', { await: async () => options.loader })
  services.set('tools', { get: (_name, scope) => { assert([...scopes.values()].includes(scope)); return {} } })
  services.set('skills', { get: async (_name, lookup) => { assert([...scopes.values()].includes(lookup.scope)); return HUMAN_WORKFLOW_SKILL } })
  const host = { get: name => services.get(name), provide: (name, value) => services.set(name, value), effect: callback => cleanups.push(callback()) }
  return { host, entries, services, access, get registrations() { return registrations }, get refreshes() { return refreshes },
    start() { return new GroupAssistantsController(host, file) },
    statuses: () => Promise.all(BUILTIN_ASSISTANTS.map(item => services.get(item.service).status())),
    async node(enabled) { groupIntent = enabled; access.componentsChanged(); await services.get('wechatGroupAssistants').notify() },
    async entitlement(enabled) { qualified = enabled; access.componentsChanged(); await services.get('wechatGroupAssistants').notify() },
    async close() { for (const cleanup of cleanups.reverse()) await cleanup() },
  }
}

test('one component registers stable presets and keeps card choices across node/entitlement off and native component reload', async t => {
  const file = temporary(t), f = fixture(file), group = f.start(); t.after(() => f.close())
  await group.notify(); assert((await f.statuses()).every(item => item.state === 'installed' && item.enabled === true))
  assert.equal(f.registrations, 3); assert.equal(f.refreshes, 1)
  const identities = builtinAssistants().map(item => [item.id, item.presetId, item.digest])
  await group.setEnabled('teacher', false)
  assert.deepEqual([...f.entries.keys()], ['harness-project', 'harness-customizer'])
  assert.equal((await f.statuses())[0].nativeState, 'disabled')
  const saved = readFileSync(file, 'utf8')
  await f.node(false); assert.equal(f.entries.size, 0); assert.equal(readFileSync(file, 'utf8'), saved)
  await f.node(true); assert.equal(f.entries.size, 2)
  await f.entitlement(false); assert.equal(f.entries.size, 0)
  await f.entitlement(true); assert.equal(f.entries.size, 2)
  await group.close(); assert.equal(group.active, false); assert.equal(f.access.groupEnabled(), false); assert.equal(f.entries.size, 0)
  assert.equal(readFileSync(file, 'utf8'), saved)
  const restarted = f.start(); await restarted.notify()
  assert.equal(f.entries.size, 2); assert.equal((await f.statuses())[0].enabled, false)
  await restarted.setEnabled('teacher', true); assert.equal(f.entries.size, 3)
  assert.deepEqual((await f.statuses()).map(item => [item.id, item.presetId, item.digest]), identities)
})

test('rapid individual and simultaneous controls never duplicate presets or reset another choice', async t => {
  const file = temporary(t), f = fixture(file), group = f.start(); t.after(() => f.close())
  await group.notify()
  await Promise.all([group.setEnabled('teacher', false), group.setEnabled('project', false), group.setEnabled('teacher', true)])
  assert.deepEqual([...f.entries.keys()].sort(), ['harness-customizer', 'harness-teacher'])
  assert.deepEqual(JSON.parse(readFileSync(file, 'utf8')).enabled, { teacher: true, project: false, designer: true })
  await Promise.all([f.node(false), group.setEnabled('designer', false)])
  assert.equal(f.entries.size, 0)
  await assert.rejects(group.setEnabled('project', true), /off/)
  await f.node(true); assert.deepEqual([...f.entries.keys()], ['harness-teacher'])
})

test('foreign matching identity is never adopted, overwritten or removed; duplicate component activation is rejected', async t => {
  const f = fixture(temporary(t)); f.entries.set('harness-teacher', { id: 'harness-teacher', name: 'Unrelated native owner', plugins: [] })
  const group = f.start(); t.after(() => f.close()); await group.notify()
  const status = await f.statuses(); assert.equal(status[0].state, 'unknown'); assert.equal(status[0].enabled, true)
  assert.equal(f.registrations, 2)
  assert.throws(() => f.start(), /已运行/)
  await group.setEnabled('teacher', false); await group.close()
  assert.deepEqual([...f.entries.keys()], ['harness-teacher']); assert.equal(f.entries.get('harness-teacher').name, 'Unrelated native owner')
})

test('loader cancellation and late native registration cannot resurrect a stopped component', async t => {
  const waiting = fixture(temporary(t), { loader: new Promise(() => {}) }), first = waiting.start()
  await first.close(); assert.equal(waiting.entries.size, 0)
  const gate = deferred(), entered = deferred(), f = fixture(temporary(t), { registration: async () => { entered.resolve(); await gate.promise } })
  const group = f.start(); await entered.promise
  await group.close(); assert.equal(f.access.groupEnabled(), false)
  gate.resolve(); await setImmediate(); await setImmediate()
  assert.equal(f.entries.size, 0)
})

test('saved choices are bounded, validated and atomically updated; damaged preferences do not silently enable modes', t => {
  const file = temporary(t)
  let prefs = new GroupAssistantPreferences(file)
  assert.equal(prefs.get('teacher'), true)
  prefs.set('teacher', false); prefs = new GroupAssistantPreferences(file)
  assert.equal(prefs.get('teacher'), false); assert.equal(prefs.get('project'), true)
  assert.throws(() => prefs.set('foreign', true), /无效/)
  for (const bad of ['{', '{}', 'x'.repeat(4097), JSON.stringify({ schemaVersion: 1, enabled: { teacher: true } })]) {
    writeFileSync(file, bad); prefs = new GroupAssistantPreferences(file)
    assert(BUILTIN_ASSISTANTS.every(item => prefs.get(item.templateId) === false)); assert.match(prefs.notice, /未能读取/)
    assert.equal(readFileSync(file, 'utf8'), bad, 'reading malformed preferences does not replace the source')
  }
  prefs.set('project', true); assert.equal(prefs.notice, '')
  assert.deepEqual(JSON.parse(readFileSync(file, 'utf8')), { schemaVersion: 1, enabled: { teacher: false, project: true, designer: false } })
})
