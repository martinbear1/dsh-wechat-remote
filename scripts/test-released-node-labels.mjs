/** Run the immutable released mini-program registry without editing that repo. */
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
assert(process.env.HARNESS_MINI_DIR, 'HARNESS_MINI_DIR required')
const source = execFileSync('git', ['show', 'v1.7.10:utils/agent-registry.js'], {
  cwd: process.env.HARNESS_MINI_DIR, encoding: 'utf8', windowsHide: true,
})
const module = { exports: {} }
new Function('module', source)(module)
const registry = module.exports, storage = new Map()
const wx = { getStorageSync: key => structuredClone(storage.get(key)), setStorageSync: (key, value) => storage.set(key, structuredClone(value)) }
const config = id => ({ baseUrl: `http://127.0.0.1:${id === 'web' ? 3092 : 38074}`,
  token: `${id}-fixture-token`, publicNode: { nodeId: id, relayOrigin: 'https://relay.example.test',
    identityPublicKey: `${id}-fixture-key`, agentName: 'DeepSeek Harness', hostName: 'same-computer' } })
registry.saveActiveConfig(wx, config('web'))
registry.saveActiveConfig(wx, config('desktop'))
assert.equal(registry.listNodes(wx).length, 2, 'same name/host never collapses independent identities')
const desktopKey = registry.nodeKeyForConfig(config('desktop'))
registry.updateActiveMetadata(wx, { agentName: 'DeepSeek Harness · Desktop' })
registry.activateNode(wx, registry.nodeKeyForConfig(config('web')))
const before = registry.activeConfig(wx)
registry.updateActiveMetadata(wx, { agentName: 'DeepSeek Harness · Web', nodeId: 'must-not-change', identityPublicKey: 'must-not-change' })
const after = registry.activeConfig(wx)
assert.equal(registry.nodeKeyForConfig(after), registry.nodeKeyForConfig(before))
assert.equal(after.publicNode.identityPublicKey, before.publicNode.identityPublicKey)
assert.equal(after.token, before.token)
const nodes = registry.listNodes(wx)
assert.equal(nodes.length, 2)
assert.equal(nodes.find(n => n.key === desktopKey).agentName, 'DeepSeek Harness · Desktop')
assert.equal(nodes.find(n => n.active).agentName, 'DeepSeek Harness · Web')
console.log('PASS released node registry: equal names stay separate; upgrade labels preserve keys and binding')
