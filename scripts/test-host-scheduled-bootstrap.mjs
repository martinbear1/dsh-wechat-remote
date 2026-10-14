import test from 'node:test'
import assert from 'node:assert/strict'
import { build } from 'esbuild'

// Exercise the real host/service implementation without discovering or writing
// the machine's identity/profile. Only unrelated descriptor inputs are stubbed.
const output = await build({
  stdin: { contents: `
    export { Context } from '@deepseek-ai/cordis';
    export { remoteMethods } from '@deepseek-ai/dsh-typert-protocol';
    export { WechatHostInfoService } from './src/host-info-service.ts';
    export { WechatSchedulesService } from './src/scheduled-tasks/service.ts';
  `, resolveDir: process.cwd(), loader: 'ts' },
  bundle: true, write: false, platform: 'node', format: 'esm', target: 'node22',
  plugins: [{ name: 'isolated-host-descriptor', setup(builder) {
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
const { Context, remoteMethods, WechatHostInfoService, WechatSchedulesService } =
  await import('data:text/javascript;base64,' + Buffer.from(output.outputFiles[0].contents).toString('base64'))
const signal = new AbortController().signal
function setup(t) {
  const ctx = new Context(), host = new WechatHostInfoService(ctx)
  t.after(async () => { await ctx.fiber.dispose() })
  return { ctx, host, describe: async () => (await host.describe({}, signal)).value }
}
function noTaskReads() {
  return {
    catalog() { assert.fail('host bootstrap must not enumerate tasks') },
    history() { assert.fail('host bootstrap must not read delivery history') },
    create() { assert.fail('host bootstrap must not create tasks') },
    update() { assert.fail('host bootstrap must not modify tasks') },
    delete() { assert.fail('host bootstrap must not delete tasks') },
  }
}

test('legacy adapter absence and missing snapshot keep the optional field omitted', async t => {
  const f = setup(t)
  const absent = await f.describe()
  assert(!Object.hasOwn(absent, 'schedules'))
  assert(!absent.capabilities.some(item => item.id === 'dsh.schedules'))
  f.ctx.provide('wechatSchedules', {})
  const oldAdapter = await f.describe()
  assert(!Object.hasOwn(oldAdapter, 'schedules'))
  assert(oldAdapter.capabilities.some(item => item.id === 'dsh.schedules'))
})

test('host bootstrap uses identical synchronous status without native catalog or history', async t => {
  const f = setup(t)
  f.ctx.provide('schedule', noTaskReads())
  f.ctx.provide('sessions', { get() { assert.fail('bootstrap must not look up a Session') } })
  const schedules = new WechatSchedulesService(f.ctx)
  const value = await f.describe()
  assert.deepEqual(value.schedules, schedules.status())
  assert.equal(value.schedules.enabled, true)
  assert.deepEqual(value.schedules.capabilities, { create: true, update: true, delete: true, pause: false })
  const rpc = await schedules.control({ action: 'status' }, signal)
  assert.equal(rpc.ok, true)
  assert.deepEqual(value.schedules, JSON.parse(rpc.valueJson))
  assert.deepEqual(remoteMethods(schedules).map(item => item.method), ['control'], 'local status is not a new Remote')
  assert(!JSON.stringify(value.schedules).includes('prompt'))
  assert(!Object.hasOwn(value.schedules, 'items'))
})

test('native off/on/off changes appear immediately in fresh bootstrap snapshots', async t => {
  const f = setup(t)
  const adapter = new WechatSchedulesService(f.ctx)
  assert.equal((await f.describe()).schedules.enabled, false)
  assert.equal((await f.describe()).schedules.supported, true)
  const native = await f.ctx.plugin(scope => { scope.provide('schedule', noTaskReads()) })
  assert.equal((await f.describe()).schedules.enabled, true)
  await native.dispose()
  assert.equal((await f.describe()).schedules.enabled, false)
  assert.deepEqual(adapter.status().capabilities, { create: false, update: false, delete: false, pause: false })
})

test('incomplete native contracts stay disabled and bootstrap does not invent support', async t => {
  const f = setup(t)
  f.ctx.provide('schedule', { catalog() { assert.fail('not called') } })
  new WechatSchedulesService(f.ctx)
  assert.equal((await f.describe()).schedules.enabled, false)
})

test('optional schedule snapshot failure cannot fail the primary host metadata request', async t => {
  const f = setup(t)
  f.ctx.provide('wechatSchedules', { status() { throw Error('Synthetic accessory failure') } })
  const value = await f.describe()
  assert.equal(value.agentName, 'Synthetic')
  assert(value.capabilities.some(item => item.id === 'dsh.schedules'))
  assert(!Object.hasOwn(value, 'schedules'))
})

test('aborted primary requests do not read optional schedule metadata', async t => {
  const f = setup(t), controller = new AbortController()
  f.ctx.provide('wechatSchedules', { status() { assert.fail('aborted primary request must exit') } })
  controller.abort()
  await assert.rejects(f.host.describe({}, controller.signal), { name: 'AbortError' })
})
