import test from 'node:test'
import assert from 'node:assert/strict'
import { build } from 'esbuild'
import { readFileSync } from 'node:fs'
import { legacyHostPayload } from '../lib/dsh-realtime-compat.js'

// Real Cordis and Typert service; synthetic account only. Never open a user's profile.
const output = await build({
  stdin: { contents: `
    export { Context, Service } from '@deepseek-ai/cordis';
    export { remoteMethods } from '@deepseek-ai/dsh-typert-protocol';
    export * from './src/account-balance.ts';
    export { WechatHostInfoService } from './src/host-info-service.ts';
  `, resolveDir: process.cwd(), loader: 'ts' },
  bundle: true, write: false, platform: 'node', format: 'esm', target: 'node22',
  plugins: [{ name: 'isolated-account-host', setup(builder) {
    builder.onResolve({ filter: /agent-metadata\.js$/ }, () => ({ path: 'metadata', namespace: 'fixture' }))
    builder.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({ contents: `
      export const agentDshHome = () => { throw Error('No profile access'); };
      export const agentProfileScope = () => 'synthetic';
      export const startupDirectory = () => ({ path: 'synthetic-workspace', usable: true });
      export const loadAgentDescriptor = () => ({ schemaVersion: 1, hostId: 'synthetic-host',
        agentInstanceId: 'synthetic-node', agentKind: 'deepseek-harness', agentName: 'Synthetic',
        agentVersion: 'synthetic', hostPlatform: { kind: 'windows', name: 'Windows', pathStyle: 'windows', directoryRootStyle: 'drives' },
        capabilities: [{ id: 'dsh.rpc', version: 1 }] });
    `, loader: 'js' }))
  } }],
})
const { Context, Service, remoteMethods, WechatAccountService, WechatHostInfoService, maskedContact, walletViews } =
  await import('data:text/javascript;base64,' + Buffer.from(output.outputFiles[0].contents).toString('base64'))
const signal = () => new AbortController().signal
const request = { locale: 'zh-CN', timezoneOffsetSeconds: 28800 }
const tick = () => new Promise(resolve => setImmediate(resolve))
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r }); return { promise, resolve } }
function provider() {
  let wake = () => {}, dirty = false, ended = false
  const p = {
    state: { status: 'credential-stored' }, calls: [],
    profile: { status: 'ready', value: { id: 'not-for-phone', name: '合成账号', contact: '13812345678', avatarUrl: 'not-for-phone' } },
    balance: { status: 'ready', value: [{ currency: 'CNY', balance: '12.345678901234567890', secret: 'not-for-phone' }], bonusWallets: [{ currency: 'USD', balance: '0.00' }] },
    async getState() { p.calls.push('state'); return p.state },
    async getProfile(client) { p.calls.push(['profile', client]); return p.profile },
    async getBalance(client) { p.calls.push(['balance', client]); return p.balance },
    async *watch(abort, identities = false) {
      p.identities = identities
      const stop = () => wake(); abort.addEventListener('abort', stop)
      try {
        yield p.state
        while (!abort.aborted && !ended) {
          if (dirty) { dirty = false; yield p.state; continue }
          await new Promise(resolve => { wake = resolve })
        }
      } finally { abort.removeEventListener('abort', stop); p.watchClosed = true }
    },
    notify() { dirty = true; wake() }, end() { ended = true; wake() },
  }
  return p
}
async function fixture(t, native = provider()) {
  const ctx = new Context(), events = []
  ctx.on('wechatAccount/changed', event => events.push(event))
  const service = new WechatAccountService(ctx), host = new WechatHostInfoService(ctx)
  let mounted
  if (native) mounted = await ctx.plugin(scope => { scope.provide('deepseekAccount', native) })
  t.after(() => ctx.fiber.dispose())
  await tick()
  return { ctx, service, host, events, native, mounted,
    read: (args = request, abort = signal()) => service.read(args, abort),
    describe: async () => (await host.describe({}, signal())).value }
}

test('optional absence/incomplete native contract hides capability without breaking host bootstrap', async t => {
  for (const native of [null, {}, { getState() { assert.fail('must not call') } }]) {
    const f = await fixture(t, native)
    assert.equal(f.service.available(), false)
    assert.equal((await f.read()).value.status, 'unsupported')
    assert(!(await f.describe()).capabilities.some(c => c.id === 'dsh.account-balance'))
  }
})
test('capability bootstraps synchronously, no network reads, default native watcher and only read Remote', async t => {
  const f = await fixture(t)
  assert((await f.describe()).capabilities.some(c => c.id === 'dsh.account-balance' && c.version === 1))
  assert.deepEqual(f.native.calls, [])
  assert.equal(f.native.identities, false, 'same watch mode as the native account UI')
  assert.deepEqual(remoteMethods(f.service).map(m => m.method), ['read'])
  assert(f.events.every(e => Object.keys(e).join() === 'supported'))
})
test('explicit read uses native public methods, exact decimal strings and strictly minimal fields', async t => {
  const f = await fixture(t), result = await f.read({ ...request, rogue: 'must-not-reach-native' })
  assert.equal(result.value.profile.contact, '***5678')
  assert.equal(result.value.profile.name, '合成账号')
  assert.equal(result.value.balance.wallets[0].balance, '12.345678901234567890')
  assert.equal(result.value.balance.bonusWallets[0].balance, '0.00')
  assert(!JSON.stringify(result).includes('not-for-phone'))
  const metadata = f.native.calls.find(c => Array.isArray(c) && c[0] === 'profile')[1]
  assert.deepEqual(Object.keys(metadata).sort(), ['locale', 'timezoneOffsetSeconds', 'version'])
  assert.equal(metadata.timezoneOffsetSeconds, 28800)
})
test('signed-out does not query profile or money and malformed native state is unavailable', async t => {
  const f = await fixture(t)
  f.native.state = { status: 'signed-out' }
  assert.equal((await f.read()).value.status, 'signed-out')
  assert.deepEqual(f.native.calls, ['state'])
  f.native.state = { status: 'unknown' }
  assert.equal((await f.read()).value.status, 'unavailable')
})
test('native Service identity is stable through Cordis invocation-scope proxies', async t => {
  const f = await fixture(t, null)
  class NativeService extends Service {
    constructor(ctx) { super(ctx, 'deepseekAccount'); Object.assign(this, provider()) }
  }
  await f.ctx.plugin(NativeService); await tick()
  const scoped = f.ctx.extend({ accountTestInvocation: true }).get('wechatAccount')
  const result = await scoped.read(request, signal())
  assert.equal(result.value.status, 'ready')
  assert.equal(result.value.profile.name, '合成账号')
})
test('profile and balance failures remain independent; failures and null never manufacture zero', async t => {
  const f = await fixture(t)
  f.native.getProfile = async () => { throw Error('DO-NOT-EXPOSE-ERROR') }
  let result = await f.read()
  assert.equal(result.value.profile.status, 'failed'); assert.equal(result.value.balance.status, 'ready')
  f.native.getProfile = async () => f.native.profile
  f.native.balance = { status: 'failed', value: [{ currency: 'CNY', balance: '0' }] }
  result = await f.read()
  assert.equal(result.value.profile.status, 'ready'); assert.equal(result.value.balance.status, 'failed')
  assert.deepEqual(result.value.balance.wallets, [])
  f.native.getProfile = async () => null
  assert.equal((await f.read()).value.status, 'unavailable')
  f.native.getState = async () => { throw Error('DO-NOT-EXPOSE-ERROR') }
  assert(!JSON.stringify(await f.read()).includes('DO-NOT'))
})
test('concurrent callers share native reads; cancellation does not spawn extra work', async t => {
  const f = await fixture(t), pending = deferred(), controller = new AbortController()
  let reads = 0
  f.native.getProfile = () => { reads++; return pending.promise }
  const a = f.read(request, controller.signal), b = f.read()
  await tick(); assert.equal(reads, 1)
  controller.abort(); assert.equal((await a).ok, false)
  const c = f.read(); await tick(); assert.equal(reads, 1)
  pending.resolve(f.native.profile)
  assert.equal((await b).value.status, 'ready'); assert.equal((await c).value.status, 'ready')
  const pre = new AbortController(); pre.abort()
  assert.equal((await f.read(request, pre.signal)).ok, false); assert.equal(reads, 1)
})
test('grant change during a query retries against new account and never mixes A/B', async t => {
  const f = await fixture(t), pending = deferred(), first = structuredClone(f.native.profile)
  let count = 0
  f.native.getProfile = () => ++count === 1 ? pending.promise : Promise.resolve(f.native.profile)
  const reading = f.read(); await tick()
  f.native.profile = { status: 'ready', value: { name: 'B', contact: 'b@example.test' } }
  f.native.balance = { status: 'ready', value: [{ currency: 'CNY', balance: '99' }], bonusWallets: [] }
  f.native.notify(); await tick(); pending.resolve(first)
  const result = await reading
  assert.equal(result.value.profile.name, 'B'); assert.equal(result.value.balance.wallets[0].balance, '99')
  assert.equal(count, 2)
})
test('logout/unmount/watch termination discard inflight or cached data', async t => {
  const f = await fixture(t), pending = deferred()
  f.native.getProfile = () => pending.promise
  const reading = f.read(); await tick()
  f.native.state = { status: 'signed-out' }; f.native.notify(); await tick()
  pending.resolve(f.native.profile)
  assert.equal((await reading).value.status, 'signed-out')
  f.native.end(); await tick()
  assert.equal((await f.read()).value.status, 'unavailable')
  await f.mounted.dispose(); await tick()
  assert.equal((await f.read()).value.status, 'unsupported')
  assert.equal(f.native.watchClosed, true)
  assert.equal(f.events.at(-1).supported, false)
})
test('invalid args, currency and amount fail closed; masks and controls are sanitized', async t => {
  const f = await fixture(t)
  for (const args of [null, {}, { ...request, timezoneOffsetSeconds: NaN }, { ...request, timezoneOffsetSeconds: 100000 }, { ...request, locale: 'x\nsecret' }])
    assert.equal((await f.read(args)).error.code, 'invalid_request')
  assert.equal(f.native.calls.length, 0)
  for (const rows of [[{ currency: 'BTC', balance: '1' }], [{ currency: 'CNY', balance: 1 }], [{ currency: 'USD', balance: 'NaN' }], [{ currency: 'CNY', balance: '1' }, { currency: 'CNY', balance: '2' }]]) assert.equal(walletViews(rows), null)
  assert.equal(maskedContact('alice@example.test'), 'a***@example.test')
  assert.equal(maskedContact('13***78'), '13***78')
  f.native.profile.value.name = 'A\n\u202eB'; f.native.balance.value = [{ currency: 'EUR', balance: '1' }]
  const result = await f.read()
  assert.equal(result.value.profile.name, 'AB'); assert.equal(result.value.balance.status, 'failed')
})
test('event/schema projection exposes invalidation only and ships a single readonly boundary', () => {
  assert.deepEqual(legacyHostPayload({ type: 'emit', event: 'wechatAccount/changed', args: [{ supported: true, accountId: 'never-forward' }] }),
    { type: 'host/remote-event', event: 'wechatAccount/changed', args: [{ supported: true }] })
  assert.equal(legacyHostPayload({ type: 'emit', event: 'wechatAccount/changed', args: [{ supported: 'true' }] }), null)
  const schema = readFileSync('lib/typert.remote-client.d.ts', 'utf8')
  assert.match(schema, /wechatAccount/); assert.match(schema, /AccountReadResult/)
  const manifest = JSON.parse(readFileSync('package.json'))
  assert(manifest.files.includes('lib/account-balance.js'))
  assert(manifest.exports['./account-balance'])
})
