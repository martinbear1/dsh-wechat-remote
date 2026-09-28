import assert from 'node:assert/strict'
import { test } from 'node:test'
import { build } from 'esbuild'
import { mountPairingManagement, createPairingHandler } from '../lib/pairing-management.js'

const clientBuild = await build({ entryPoints: ['src/client/pairing-client.ts'], bundle: true,
  write: false, platform: 'node', format: 'esm' })
const { resolvePairingClient } = await import('data:text/javascript;base64,'
  + Buffer.from(clientBuild.outputFiles[0].contents).toString('base64'))
const signal = () => new AbortController().signal
test('companion decisions require exact local operator payload and stale choices are rejected', async () => {
  const calls = [], id = 'a'.repeat(32)
  const h = createPairingHandler({ unavailable: () => false, status: () => ({}), pairCode: async () => ({}),
    companionDecision(offer, action) { if (offer !== id) throw Error('stale'); calls.push(action) } })
  for (const payload of [null, [], {}, { offerId: id, action: 'install-any' }, { offerId: id, action: 'approve', source: 'remote' }]) {
    assert.equal((await h.call('companion-decision', payload, signal())).ok, false)
  }
  assert.equal(calls.length, 0)
  assert.equal((await h.call('companion-decision', { offerId: id, action: 'approve' }, signal())).ok, true)
  assert.equal((await h.call('companion-decision', { offerId: 'b'.repeat(32), action: 'approve' }, signal())).error.code, 'pairing/stale-offer')
  assert.deepEqual(calls, ['approve'])
})
function mount(id, extras = {}) {
  let removed = 0, calls = 0
  const handler = createPairingHandler({
    status: () => ({ id }), pairCode: async () => { calls++; return { ticket: id } },
    unavailable: () => false, ...extras,
  })
  const mounted = { async dispose() { handler.stop(); removed++ } }
  return { mounted, call: (endpoint, payload = {}) => handler.call(endpoint, payload, signal()),
    get calls() { return calls }, get removed() { return removed } }
}

test('legacy origin-only or absent Connection never mounts an operator API', () => {
  for (const connection of [undefined, { rpc: { handle() { assert.fail('untrusted handler mounted') } } }]) {
    assert.equal(mountPairingManagement({ get: () => connection }, {}), undefined)
  }
})
test('independent operators, endpoint whitelist and empty input validation', async () => {
  const web = mount('web'), desktop = mount('desktop')
  assert.deepEqual(await web.call('status'), { ok: true, value: { id: 'web' } })
  assert.deepEqual(await desktop.call('pair-code'), { ok: true, value: { ticket: 'desktop' } })
  assert.equal(web.calls, 0)
  for (const payload of [null, [], 'data', { nodeId: 'other-node' }]) {
    assert.equal((await web.call('pair-code', payload)).error.code, 'pairing/bad-request')
  }
  assert.equal((await web.call('install')).error.code, 'pairing/not-found')
  await web.mounted.dispose()
  assert.equal(web.removed, 1)
  assert.equal((await web.call('status')).error.code, 'pairing/unavailable')
  assert.equal((await desktop.call('status')).ok, true)
})
test('simultaneous QR requests coalesce; stopping suppresses late QR delivery', async () => {
  let complete, calls = 0
  const host = mount('web', { pairCode: () => {
    calls++; return new Promise(resolve => { complete = resolve })
  } })
  const first = host.call('pair-code'), second = host.call('pair-code')
  await Promise.resolve()
  assert.equal(calls, 1)
  complete({ ticket: 'same-ticket' })
  assert.deepEqual(await first, await second)
  const pending = host.call('pair-code')
  await Promise.resolve()
  await host.mounted.dispose()
  complete({ ticket: 'late-ticket' })
  assert.equal((await pending).ok, false)
})
test('state unavailable forbids even a queued ticket creation', async () => {
  let unavailable = false
  const host = mount('web', { unavailable: () => unavailable })
  const pending = host.call('pair-code')
  unavailable = true
  assert.equal((await pending).ok, false)
  assert.equal(host.calls, 0)
})
const descriptor = (scope, management) => ({ computerName: 'same computer', agentName: scope,
  gate: { profileScope: scope, management, localDoor: { port: 49152, state: 'listening' },
    publicDoor: { port: 49153, state: 'listening' } } })
const noFetch = () => assert.fail('must not contact another loopback port')
test('Desktop uses its authenticated carrier, never Web fallback or CLI update origin', async () => {
  const calls = []
  const client = await resolvePairingClient(async () => descriptor('desktop', 'authenticated-rpc'),
    async endpoint => { calls.push(endpoint); return 'desktop' }, noFetch)
  assert.equal(client.localOrigin, null)
  assert.equal(await client.status(), 'desktop')
  assert.equal(await client.pairCode(), 'desktop')
  assert.deepEqual(calls, ['status', 'pair-code'])
})
test('Desktop auth failure, absent description or failed discovery cannot switch hosts', async () => {
  for (const get of [async () => ({}), async () => descriptor('desktop'),
    async () => descriptor('desktop', 'unavailable'), async () => { throw new Error('offline') }]) {
    await assert.rejects(resolvePairingClient(get, noFetch, noFetch))
  }
  const client = await resolvePairingClient(async () => descriptor('desktop', 'authenticated-rpc'),
    async () => { throw new Error('unauthorized') }, noFetch)
  await assert.rejects(client.pairCode(), /unauthorized/)
})
test('legacy Web uses only its explicitly described door and retains update origin', async () => {
  const urls = []
  const client = await resolvePairingClient(async () => descriptor('web'), noFetch,
    async (url, options) => {
      urls.push(url); assert.equal(options.cache, 'no-store')
      return { ok: true, json: async () => 'web' }
    })
  assert.equal(client.localOrigin, 'http://127.0.0.1:49152')
  await client.status(); await client.pairCode()
  assert.deepEqual(urls, ['http://127.0.0.1:49152/gate/status', 'http://127.0.0.1:49152/pair/code'])
  for (const port of [0, 65536, '3093', NaN]) {
    const description = descriptor('web'); description.gate.localDoor.port = port
    await assert.rejects(resolvePairingClient(async () => description, noFetch, noFetch))
  }
})
