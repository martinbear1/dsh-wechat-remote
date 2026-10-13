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
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const lease = (nodeId = 'test-node', patch = {}) => ({ schemaVersion: 1, nodeId, accountInstance: 'account-1', checkedAt: 1000, expiresAt: 61000,
  features: { group_assistant: { allowed: true, reason: 'allowed', validUntil: 120000 }, clawbot: { allowed: true, reason: 'allowed', validUntil: 120000 } }, ...patch })
const deferred = () => { let resolve; const promise = new Promise(r => resolve = r); return { promise, resolve } }
const importLease = (nodeId = 'test-node', patch = {}) => {
  const value = lease(nodeId, patch)
  value.features = { ...value.features, history_import: { allowed: true, reason: 'allowed', validUntil: 120000 } }
  return value
}

test('group component availability changes effective access without changing entitlements or saved opt-in', async t => {
  let active = true, events = 0
  const access = new FeatureAccess({ nodeId: () => 'test-node', read: async () => importLease(), groupAvailable: () => active })
  t.after(() => access.close()); access.subscribe(() => events++)
  await access.setGroupEnabled(true); await access.setHistoryImportEnabled(true)
  const intent = structuredClone(access.requested), leaseBefore = access.snapshot().features
  active = false; access.componentsChanged()
  assert.equal(access.snapshot().groupComponentAvailable, false)
  assert.equal(access.groupEnabled(), false); assert.equal(access.historyImportEnabled(), true)
  assert.deepEqual(access.snapshot().features, leaseBefore); assert.deepEqual(access.requested, intent)
  await assert.rejects(access.assert('group_assistant'), /电脑插件管理器/)
  await assert.rejects(access.setGroupEnabled(true), /电脑插件管理器/)
  active = true; access.componentsChanged()
  assert.equal(access.groupEnabled(), true, 'restores only the existing identity-bound opt-in')
  active = false; access.componentsChanged(); await access.setGroupEnabled(false)
  active = true; access.componentsChanged(); assert.equal(access.groupEnabled(), false, 'explicit off is not overwritten')
  assert(events >= 7)
})

test('assistant card control requires the physical component and current group authority, never enables a node', async t => {
  const ctx = new Context(), calls = [], controller = { active: true, async setEnabled(...args) { calls.push(args.slice(0, 2)) } }
  ctx.provide('wechatGroupAssistants', controller)
  await ctx.plugin(WechatFeaturesService, { source: { nodeId: () => 'test-node', read: async () => lease(), groupAvailable: () => controller.active } })
  t.after(() => ctx.fiber.dispose())
  const service = ctx.get('wechatFeatures'), signal = new AbortController().signal
  assert.equal((await service.control({ action: 'assistant.enabled', templateId: 'teacher', enabled: true }, signal)).ok, false)
  assert.equal(calls.length, 0)
  assert.equal((await service.control({ action: 'assistant.enabled', templateId: 'teacher', enabled: false }, signal)).ok, true)
  assert.equal(service.access.groupEnabled(), false)
  await service.access.setGroupEnabled(true)
  assert.equal((await service.control({ action: 'assistant.enabled', templateId: 'teacher', enabled: true }, signal)).ok, true)
  assert.deepEqual(calls, [['teacher', false], ['teacher', true]])
  assert.equal((await service.control({ action: 'assistant.enabled', templateId: 'unknown', enabled: true }, signal)).ok, false)
  controller.active = false; service.access.componentsChanged()
  const unavailable = await service.control({ action: 'assistant.enabled', templateId: 'teacher', enabled: true }, signal)
  assert.equal(unavailable.ok, false); assert.match(unavailable.error.message, /电脑插件管理器/)
})

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

test('temporary background failure preserves only the same unexpired lease and import permit, without extending deadlines or retrying', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  let clock = 0, reads = 0, failure, value = importLease()
  const access = new FeatureAccess({ nodeId: () => 'test-node', read: async () => { reads++; if (failure) throw failure; return value } }, undefined, () => clock)
  t.after(() => access.close()); await access.setGroupEnabled(true); await access.setHistoryImportEnabled(true)
  const permit = await access.authorizeHistoryImport(), original = access.snapshot(), expiry = access.expiry
  const epoch = access.historyEpoch, generation = access.generation
  clock = 45000; failure = Error('synthetic network failure')
  t.mock.timers.tick(45000)
  await assert.rejects(access.refresh(true), /暂时无法核对/)
  assert.equal(reads, 2, 'join the one existing background refresh')
  assert.deepEqual(access.snapshot(), original); assert.equal(access.expiry, expiry)
  assert.equal(access.historyEpoch, epoch); assert.equal(access.generation, generation)
  permit.assertCurrent(); await access.assert('group_assistant'); await access.assert('clawbot')
  await permit.revalidate(new AbortController().signal)
  assert.equal(reads, 2, 'ordinary consumers reuse authority without awaiting or retrying background I/O')
  for (const observation of [Object.assign(Error('synthetic service unavailable'), { statusCode: 503 }),
    Object.assign(Error('rate limit'), { statusCode: 429 }), Object.assign(Error('proxy route unavailable'), { statusCode: 404 }),
    SyntaxError('malformed response'), { ...importLease(), expiresAt: 0 }]) {
    failure = observation instanceof Error ? observation : undefined
    value = failure ? importLease() : observation
    await assert.rejects(access.refresh(true), FeatureAccessError); permit.assertCurrent()
    assert.deepEqual(access.snapshot(), original); assert.equal(access.expiry, expiry)
    assert.equal(access.historyEpoch, epoch); assert.equal(access.generation, generation)
  }
  clock = 60001; t.mock.timers.tick(15001)
  assert.equal(reads, 7, 'a failed renewal starts no new retry timer')
  assert.equal(access.groupEnabled(), false); assert.equal(access.historyImportEnabled(), false)
  assert.equal(access.grant('clawbot').allowed, false); assert.throws(() => permit.assertCurrent(), FeatureAccessError)
  failure = undefined; value = importLease(); await permit.revalidate(new AbortController().signal)
  permit.assertCurrent(); assert.equal(reads, 8, 'natural expiry still allows a later explicit same-owner recheck')
})

test('explicit authentication denial, validated revocation, invalidation and owner changes never retain the old lease or import permit', async t => {
  for (const change of ['401', '403', 'denied', 'account', 'node', 'invalidate']) {
    let nodeId = 'test-node', value = importLease(), failure
    const access = new FeatureAccess({ nodeId: () => nodeId, read: async () => { if (failure) throw failure; return value } })
    t.after(() => access.close()); await access.setGroupEnabled(true); await access.setHistoryImportEnabled(true)
    const permit = await access.authorizeHistoryImport()
    if (/^\d+$/.test(change)) failure = Object.assign(Error('denied'), { statusCode: Number(change) })
    if (change === 'denied') value.features.history_import = { allowed: false, reason: 'feature_account_blocked', validUntil: null }
    if (change === 'account') value.accountInstance = 'other-owner'
    if (change === 'node') { nodeId = 'other-node'; failure = Error('offline') }
    if (change === 'invalidate') { access.invalidate(); failure = Error('offline') }
    if (failure) await assert.rejects(access.refresh(true), FeatureAccessError, change)
    else await access.refresh(true)
    assert.equal(access.historyImportEnabled(), false, change)
    assert.throws(() => permit.assertCurrent(), FeatureAccessError, change)
    failure = undefined; value = importLease(nodeId); await access.refresh()
    await assert.rejects(permit.revalidate(new AbortController().signal), FeatureAccessError, change)
  }
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
  for (const status of [401, 403, 404, 429, 500, 503]) {
    agent.fetchImpl = async () => new Response('private response must not escape', { status })
    await assert.rejects(agent.readFeatures(new AbortController().signal), error => error.statusCode === status
      && error.message === 'Feature source unavailable' && !JSON.stringify(error).includes('private response'))
  }
  agent.fetchImpl = async () => ({ ok: false, status: 403, body: { async cancel() { throw Error('cleanup failed') } } })
  await assert.rejects(agent.readFeatures(new AbortController().signal), { statusCode: 403, message: 'Feature source unavailable' })
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
  const imported = await control({ action: 'historyImport.enabled', enabled: true, allowed: true })
  assert.equal(imported.ok, false); assert.equal(imported.error.code, 'feature-access-denied')
  assert.equal((await control({ action: 'status' })).value.historyImportEnabled, false)
})

test('old cloud grants keep group/ClawBot working while missing/malformed import grant alone fails closed', async t => {
  for (const patch of [undefined, { allowed: true, reason: 'allowed', validUntil: 1001 }, { allowed: 'true' }]) {
    const value = lease(); if (patch) value.features.history_import = patch
    const access = new FeatureAccess({ nodeId: () => 'test-node', read: async () => value }); t.after(() => access.close())
    await access.refresh(); await access.setGroupEnabled(true)
    assert.equal(access.groupEnabled(), true); assert.equal(access.grant('clawbot').allowed, true)
    assert.equal(access.historyImportEnabled(), false); assert.equal(access.snapshot().features.history_import.allowed, false)
    await assert.rejects(access.setHistoryImportEnabled(true), FeatureAccessError)
  }
})

test('import opt-in is independent, persisted with legacy group fields and owns no renewal timer', async t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'history-import-preference-')), file = path.join(dir, 'preferences.json')
  const accesses = []; t.after(() => { accesses.forEach(a => a.close()); fs.rmSync(dir, { recursive: true, force: true }) })
  // Legacy opt-in is read without losing the established group setting.
  fs.writeFileSync(file, JSON.stringify({ schemaVersion: 1, enabled: true, nodeId: 'test-node', accountInstance: 'account-1' }))
  const source = { nodeId: () => 'test-node', read: async () => importLease() }
  const access = new FeatureAccess(source, file); accesses.push(access)
  await access.refresh(); assert.equal(access.groupEnabled(), true); assert.equal(access.historyImportEnabled(), false)
  await access.setGroupEnabled(false); await access.setHistoryImportEnabled(true)
  assert.equal(access.historyImportEnabled(), true); assert.equal(access.groupEnabled(), false); assert.equal(access.renewal?._destroyed ?? true, true)
  await access.setGroupEnabled(true)
  const saved = JSON.parse(fs.readFileSync(file, 'utf8'))
  assert.equal(saved.schemaVersion, 1); assert.equal(saved.enabled, true); assert.equal(saved.accountInstance, 'account-1')
  assert.equal(saved.historyImport.enabled, true)
  const reopened = new FeatureAccess(source, file); accesses.push(reopened)
  await reopened.refresh(); assert.equal(reopened.groupEnabled(), true); assert.equal(reopened.historyImportEnabled(), true)
  await reopened.setHistoryImportEnabled(false); assert.equal(reopened.groupEnabled(), true)
  const updated = JSON.parse(fs.readFileSync(file, 'utf8')); assert.equal(updated.enabled, true); assert.equal(updated.historyImport.enabled, false)
})

test('import default is off and enable/disable races never enable a replaced account or override later intent', async t => {
  let clock = 0, nodeId = 'test-node', value = importLease(), pending
  const access = new FeatureAccess({ nodeId: () => nodeId, read: async () => pending ? pending.promise : value }, undefined, () => clock)
  t.after(() => access.close()); await access.refresh()
  assert.equal(access.historyImportEnabled(), false)
  await access.setHistoryImportEnabled(true)
  const permit = await access.authorizeHistoryImport(); permit.assertCurrent()
  await access.setHistoryImportEnabled(false); assert.throws(() => permit.assertCurrent(), FeatureAccessError)
  access.invalidate(); pending = deferred()
  const enabling = access.setHistoryImportEnabled(true); await access.setHistoryImportEnabled(false)
  pending.resolve(value); await assert.rejects(enabling, FeatureAccessError)
  assert.equal(access.historyImportEnabled(), false)
  pending = undefined; await access.setHistoryImportEnabled(true)
  const earlier = await access.authorizeHistoryImport()
  value = importLease('test-node', { accountInstance: 'new-owner' }); await access.refresh(true)
  assert.equal(access.historyImportEnabled(), false); assert.throws(() => earlier.assertCurrent(), FeatureAccessError)
  await access.setHistoryImportEnabled(true); const owner = await access.currentOwner()
  assert(owner.includes('new-owner'))
  nodeId = 'new-node'; value = importLease(nodeId, { accountInstance: 'new-owner' }); await access.refresh(true)
  assert.equal(access.historyImportEnabled(), false)
  assert.notEqual(await access.currentOwner(), owner)
  await access.setHistoryImportEnabled(true); const expiring = await access.authorizeHistoryImport()
  clock = 60001; assert.throws(() => expiring.assertCurrent(), FeatureAccessError)
})

test('revocation fences waiting import authority without group coupling; owner recovery ignores revoked feature', async t => {
  let value = importLease()
  const access = new FeatureAccess({ nodeId: () => 'test-node', read: async () => value }); t.after(() => access.close())
  await access.setHistoryImportEnabled(true)
  const permit = await access.authorizeHistoryImport(), owner = permit.owner
  await access.setGroupEnabled(true); permit.assertCurrent()
  await access.setGroupEnabled(false); permit.assertCurrent()
  value = importLease(); value.features.history_import = { allowed: false, reason: 'feature_not_entitled', validUntil: null }
  await access.refresh(true); assert.throws(() => permit.assertCurrent(), FeatureAccessError)
  assert.equal(access.historyImportEnabled(), false); assert.equal(await access.currentOwner(), owner)
  assert.equal(access.grant('clawbot').allowed, true)
  await assert.rejects(access.authorizeHistoryImport(), FeatureAccessError)
})

test('long import revalidates after real natural expiry without renewing in the background', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  let clock = 0, reads = 0
  const access = new FeatureAccess({ nodeId: () => 'test-node', read: async () => { reads++; return importLease() } }, undefined, () => clock)
  t.after(() => access.close())
  await access.setHistoryImportEnabled(true)
  const permit = await access.authorizeHistoryImport(), owner = permit.owner
  clock = 60001; t.mock.timers.tick(60001)
  assert.equal(reads, 1); assert.equal(access.lease, undefined)
  assert.throws(() => permit.assertCurrent(), FeatureAccessError)
  await permit.revalidate(new AbortController().signal)
  permit.assertCurrent(); assert.equal(permit.owner, owner); assert.equal(reads, 2)
  assert.equal(access.groupEnabled(), false); assert.equal(access.renewal, undefined)
  clock += 60001; t.mock.timers.tick(60001)
  assert.equal(reads, 2, 'an enabled import never starts a renewal loop')
  await permit.revalidate(new AbortController().signal); assert.equal(reads, 3)
})

test('long import never reauthorizes after explicit invalidation, off/on, revoke/restore or changed owner', async t => {
  for (const change of ['invalidate', 'off-on', 'revoke-restore', 'account', 'node', 'close', 'cancel']) {
    let value = importLease(), nodeId = 'test-node', clock = 0
    const access = new FeatureAccess({ nodeId: () => nodeId, read: async () => value }, undefined, () => clock)
    t.after(() => access.close()); await access.setHistoryImportEnabled(true)
    const permit = await access.authorizeHistoryImport(), abort = new AbortController()
    if (change === 'invalidate') { access.invalidate(); await access.refresh() }
    if (change === 'off-on') { await access.setHistoryImportEnabled(false); await access.setHistoryImportEnabled(true) }
    if (change === 'revoke-restore') {
      value.features.history_import = { allowed: false, reason: 'feature_not_entitled', validUntil: null }
      await access.refresh(true); value = importLease(); await access.refresh(true)
    }
    if (change === 'account') { value = importLease('test-node', { accountInstance: 'new-owner' }); clock = 60001 }
    if (change === 'node') { nodeId = 'another-node'; value = importLease(nodeId) }
    if (change === 'close') access.close()
    if (change === 'cancel') abort.abort()
    await assert.rejects(permit.revalidate(abort.signal), undefined, change)
  }
})

test('expiry aborts a stale forced lease refresh; a later import recheck cannot accept its response', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  let clock = 0, pending, reads = 0
  const access = new FeatureAccess({ nodeId: () => 'test-node', read: async () => { reads++; return pending ? pending.promise : importLease() } }, undefined, () => clock)
  t.after(() => access.close()); await access.setHistoryImportEnabled(true)
  const permit = await access.authorizeHistoryImport()
  clock = 59999; pending = deferred()
  const refresh = access.refresh(true); await Promise.resolve()
  clock = 60001; t.mock.timers.tick(60001)
  pending.resolve(importLease()); await assert.rejects(refresh, FeatureAccessError)
  assert.throws(() => permit.assertCurrent(), FeatureAccessError)
  pending = undefined
  await permit.revalidate(new AbortController().signal)
  permit.assertCurrent(); assert.equal(reads, 3)
})

test('on-demand refresh after deadline retires a delayed old expiry timer before its new read', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  let clock = 0, pending
  const access = new FeatureAccess({ nodeId: () => 'test-node', read: async () => pending ? pending.promise : importLease() }, undefined, () => clock)
  t.after(() => access.close()); await access.setHistoryImportEnabled(true)
  const permit = await access.authorizeHistoryImport()
  clock = 60001; pending = deferred()
  const recheck = permit.revalidate(new AbortController().signal); await Promise.resolve()
  t.mock.timers.tick(60001)
  pending.resolve(importLease()); await recheck
  permit.assertCurrent()
})
