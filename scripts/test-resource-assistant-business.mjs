import test from 'node:test'
import assert from 'node:assert/strict'
import { AssistantRegistry } from '../lib/assistant-presets/registry.js'
import { AssistantBusinessRecords } from '../lib/assistant-presets/business.js'
import { assistantTemplates } from '../lib/assistant-presets/catalog.js'
import { resourceAssistantDefinition } from '../lib/private-resources/assistant-provider.js'

const signal = new AbortController().signal
const memory = () => { let value; return { async load() { return structuredClone(value) }, async save(next) { value = structuredClone(next) }, get value() { return structuredClone(value) } } }
const resource = () => {
  const assistant = { ...assistantTemplates()[0].definition, name: '定制教学助手', description: '明确携带群协作能力的私有资源' }
  return { schemaVersion: 2, kind: 'preset', resourceId: 'private-teaching', version: '1.0.0', name: assistant.name,
    description: assistant.description, basePreset: assistant.basePreset, systemPrompt: '仅用于隔离测试。', capabilities: ['wechat-group'], assistant }
}
const scope = { nodeId: 'fixture_node', sessionId: 'fixture_chat', sessionGeneration: '1' }
test('declared resource uses the same scoped business tools; disabling never invalidates stored work on restart', async t => {
  const immutable = resourceAssistantDefinition(resource()), recordStore = memory(), registryStore = memory()
  let active = true, stored = [immutable], scopes = 0
  const native = {
    async resourceDefinitions() { return structuredClone(stored) },
    async resources(_signal, options) { if (!active || options?.waitForReady === false) return []; scopes++; return stored.map(item => ({ ...item, state: 'installed', nativeState: 'installed' })) },
    async probe() { return { supported: true, basePresets: [] } }, async close() {},
  }
  const open = () => AssistantRegistry.open(registryStore, { nodeId: scope.nodeId, native, assertIdentity() {} })
  const registry = await open(); t.after(() => registry.close())
  assert.equal(scopes, 0, 'initialization reads data, never acquires a native scope')
  assert.equal(registry.get(immutable).digest, immutable.digest)
  assert.equal(registry.installedForPreset(immutable.presetId), undefined)
  assert.equal(await registry.verifyPreset(immutable.presetId, signal), true)
  const business = await AssistantBusinessRecords.open(recordStore, { nodeId: scope.nodeId, registry, assertIdentity() {} })
  t.after(() => business.close())
  const started = await business.start(scope, immutable.presetId, signal)
  assert.equal(started.assistant.id, immutable.id)
  await business.save(scope, immutable.presetId, { expectedRevision: started.revision, content: { title: '私有助手工作', answers: {}, memory: '仍保留原会话的资料' } }, signal)
  const saved = recordStore.value
  active = false
  assert.equal(await registry.verifyPreset(immutable.presetId, signal), false)
  assert.equal(registry.installedForPreset(immutable.presetId), undefined)
  const reopened = await open(); t.after(() => reopened.close())
  const restored = await AssistantBusinessRecords.open(recordStore, { nodeId: scope.nodeId, registry: reopened, assertIdentity() {} })
  t.after(() => restored.close()); assert.deepEqual(recordStore.value, saved)
  assert.throws(() => restored.get(scope, immutable.presetId), /助手|预设/)
  active = true; assert.equal(await reopened.verifyPreset(immutable.presetId, signal), true)
  assert.equal(restored.get(scope, immutable.presetId).content.memory, '仍保留原会话的资料')
  assert.equal(await reopened.verifyPreset('standard', signal), undefined)
  assert.equal(await reopened.verifyPreset('hr-resource-ordinary-abcdef123456', signal), undefined, 'ordinary resources retain the normal native launch path')
  // A newly installed local version is discovered without restarting HumanTools.
  stored.push(resourceAssistantDefinition({ ...resource(), version: '1.1.0' }))
  assert.equal(await reopened.verifyPreset(stored[1].presetId, signal), true)
  assert.equal(restored.get(scope, immutable.presetId).presetId, immutable.presetId)
})

test('resource assistant identity cannot silently substitute a different definition in one immutable version', async t => {
  const original = resourceAssistantDefinition(resource())
  let definitions = [original]
  const native = { async resourceDefinitions() { return structuredClone(definitions) }, async resources() { return [] }, async close() {} }
  const registry = await AssistantRegistry.open(memory(), { nodeId: scope.nodeId, native, assertIdentity() {} })
  t.after(() => registry.close())
  definitions = [resourceAssistantDefinition({ ...resource(), assistant: { ...resource().assistant, role: '变更后的工作方法' } })]
  await assert.rejects(registry.verifyPreset(original.presetId, signal), /内容发生变化/)
})
