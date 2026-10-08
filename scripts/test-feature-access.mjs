import test from 'node:test'
import assert from 'node:assert/strict'
import { generateKeyPairSync, verify } from 'node:crypto'
import { FeatureAccess, FeatureAccessError, validateFeatureLease } from '../lib/feature-access.js'
import { PublicRelayAgent } from '../lib/public-relay-agent.js'
import { Context } from '@deepseek-ai/cordis'
import { TypertRegistry } from '@deepseek-ai/dsh-typert-registry'
import { TypertGatewayService } from '@deepseek-ai/dsh-api-gateway'
import { WechatFeaturesService } from '../lib/feature-access.js'
import { TYPERT } from '../lib/typert.host.js'
import { invokeLegacyRpc, parseLegacyClientRequest } from '../lib/dsh-protocol-compat.js'

const lease = (nodeId = 'test-node', patch = {}) => ({ schemaVersion: 1, nodeId, accountInstance: 'account-1', checkedAt: 1000, expiresAt: 61000,
  features: { group_assistant: { allowed: true, reason: 'allowed', validUntil: 120000 }, clawbot: { allowed: true, reason: 'allowed', validUntil: 120000 } }, ...patch })
const deferred = () => { let resolve; const promise = new Promise(r => resolve = r); return { promise, resolve } }

test('one lease is singleflight, monotonic bounded, node/account bound and local group opt-in is separate', async t => {
  let clock = 0, nodeId = 'test-node', calls = 0, data = lease(), pending = deferred()
  const access = new FeatureAccess({ nodeId: () => nodeId, read: async () => { calls++; return pending.promise } }, undefined, () => clock)
  t.after(() => access.close())
  const reads = [access.refresh(), access.refresh(), access.refresh()]; pending.resolve(data); await Promise.all(reads)
  assert.equal(calls, 1); assert.equal(access.grant('clawbot').allowed, true)
  assert.equal(access.groupEnabled(), false); await assert.rejects(access.assert('group_assistant'), /先开启/)
  await access.setGroupEnabled(true); assert.equal(access.groupEnabled(), true)
  clock = 60001; assert.equal(access.grant('clawbot').allowed, false); assert.equal(access.groupEnabled(), false)
  pending = deferred(); const refresh = access.refresh(); nodeId = 'other-node'; pending.resolve(data)
  await assert.rejects(refresh, FeatureAccessError); assert.equal(access.grant('clawbot').allowed, false)
  pending = deferred(); data = lease(nodeId, { accountInstance: 'account-2' }); pending.resolve(data); await access.refresh()
  assert.equal(access.groupEnabled(), false, 'never copy old account/node opt-in')
})

test('network failure invalidates a previously allowed lease immediately; statuses never trust client allowed', async t => {
  let fail = false
  const access = new FeatureAccess({ nodeId: () => 'test-node', read: async () => { if (fail) throw Error('secret response'); return lease() } })
  t.after(() => access.close()); await access.refresh(); await access.setGroupEnabled(true)
  fail = true; await assert.rejects(access.refresh(true), /暂时无法核对/)
  assert.equal(access.snapshot().features.clawbot.allowed, false); assert.equal(access.groupEnabled(), false)
  await access.setGroupEnabled(false); assert.equal(access.groupEnabled(), false)
})

test('same-node invalidation aborts and fences an old authority read without clearing its replacement flight', async t => {
  const old = deferred(), fresh = deferred(); let calls = 0, oldSignal
  const access = new FeatureAccess({ nodeId: () => 'test-node', read: async signal => { calls++; if (calls === 1) { oldSignal = signal; return old.promise }; return fresh.promise } })
  t.after(() => access.close())
  const first = access.refresh(); const rejected = assert.rejects(first, FeatureAccessError)
  await Promise.resolve()
  access.invalidate(); assert.equal(oldSignal.aborted, true)
  const replacement = access.refresh()
  old.resolve(lease()); await rejected
  const joined = access.refresh(); assert.equal(calls, 2, 'old finally cannot clear the replacement singleflight')
  fresh.resolve(lease('test-node', { accountInstance: 'new-owner' })); await Promise.all([replacement, joined])
  assert.equal(access.snapshot().accountInstance, 'new-owner'); assert.equal(access.groupEnabled(), false)
})

test('cancelled enable and older enable intent never override a later pause', async t => {
  let pending = deferred()
  const access = new FeatureAccess({ nodeId: () => 'test-node', read: () => pending.promise })
  t.after(() => access.close())
  const abort = new AbortController(), enable = access.setGroupEnabled(true, abort.signal)
  abort.abort(); pending.resolve(lease()); await assert.rejects(enable, {name:'AbortError'})
  assert.equal(access.groupEnabled(), false)
  access.invalidate(); pending = deferred()
  const older = access.setGroupEnabled(true); await access.setGroupEnabled(false)
  pending.resolve(lease()); await assert.rejects(older, FeatureAccessError)
  assert.equal(access.groupEnabled(), false)
  await access.setGroupEnabled(true); assert.equal(access.groupEnabled(), true)
})

test('each denial remains false on LAN; malformed, overlong and denied-with-expiry leases fail closed', async t => {
  for (const reason of ['public_access_required', 'public_quota_exhausted', 'feature_not_entitled', 'feature_disabled', 'feature_account_blocked', 'account_suspended', 'node_unbound', 'account_not_found']) {
    const value = lease(); value.features.group_assistant = value.features.clawbot = { allowed: false, reason, validUntil: null }
    const access = new FeatureAccess({ nodeId: () => 'test-node', read: async () => value }); t.after(() => access.close())
    await assert.rejects(access.assert('clawbot'), FeatureAccessError); assert.equal(access.grant('clawbot').reason, reason)
    await assert.rejects(access.setGroupEnabled(true), FeatureAccessError)
  }
  for (const value of [lease('wrong'), lease('test-node', { expiresAt: 61001 }), lease('test-node', { expiresAt: 1000 }),
    lease('test-node', { features: { ...lease().features, clawbot: { allowed: true, reason: 'allowed', validUntil: 2000 } } }),
    lease('test-node', { features: { ...lease().features, clawbot: { allowed: false, reason: 'feature_disabled', validUntil: 120000 } } })]) {
    assert.throws(() => validateFeatureLease(value, 'test-node'), FeatureAccessError)
  }
})

test('feature HTTP uses exact node GET proof, empty body, no redirect and bounded response', async () => {
  const keys = generateKeyPairSync('ed25519'), identity = { nodeId: 'test-node', privateKeyPem: keys.privateKey.export({type:'pkcs8',format:'pem'}) }
  const agent = Object.assign(Object.create(PublicRelayAgent.prototype), { config: { relayOrigin: 'https://fixture.invalid' }, identity,
    fetchImpl: async (url, options) => {
      assert.equal(url, 'https://fixture.invalid/v1/agents/test-node/features'); assert.equal(options.method, 'GET'); assert.equal(options.body, undefined); assert.equal(options.redirect, 'error')
      const h = options.headers, payload = `agent-http-v2\nGET\n/v1/agents/test-node/features\ntest-node\n${h['x-hr-timestamp']}\n${h['x-hr-nonce']}\ne3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`
      assert.equal(verify(null, Buffer.from(payload), keys.publicKey, Buffer.from(h['x-hr-signature'], 'base64url')), true)
      return new Response(JSON.stringify(lease()))
    } })
  assert.equal((await agent.readFeatures(new AbortController().signal)).nodeId, 'test-node')
  agent.fetchImpl = async () => new Response('x'.repeat(17000)); await assert.rejects(agent.readFeatures(new AbortController().signal))
  agent.fetchImpl = async () => { agent.identity = { ...identity }; return new Response(JSON.stringify(lease())) }
  await assert.rejects(agent.readFeatures(new AbortController().signal), /identity changed/)
})

test('native Typert and authenticated compatibility controls use node authority, never a phone supplied allowed flag', async t => {
  const ctx = new Context(), denied = lease()
  denied.features.group_assistant = {allowed:false,reason:'feature_not_entitled',validUntil:null}
  await ctx.plugin(WechatFeaturesService, {source:{nodeId:()=>'test-node',read:async()=>denied}})
  t.after(()=>ctx.fiber.dispose())
  const registry = new TypertRegistry(ctx); registry.register(TYPERT)
  const gateway = new TypertGatewayService(ctx), signal = new AbortController().signal
  async function control(request) {
    const method='wechatFeatures/control', parsed=parseLegacyClientRequest(method,{type:'client-request',rpcId:'features-test',method,payload:{args:{request}}})
    const response=await invokeLegacyRpc(gateway,parsed,{signal,describeHost(){assert.fail('not host')}})
    assert.equal(response.result.ok,true,JSON.stringify(response)); return response.result.value
  }
  const status=await control({action:'status'})
  assert.equal(status.ok,true); assert.equal(status.value.features.group_assistant.allowed,false)
  assert.equal(status.value.features.clawbot.allowed,true); assert.equal(status.value.groupEnabled,false)
  const attempted=await control({action:'group.enabled',enabled:true,allowed:true,features:{group_assistant:{allowed:true}}})
  assert.equal(attempted.ok,false); assert.equal(attempted.error.code,'feature-access-denied')
  assert.equal((await control({action:'group.enabled',enabled:false})).value.groupEnabled,false)
})
