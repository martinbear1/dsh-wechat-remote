/** Cross-repository production protocol contract. Requires the sibling cloud
 * repository. Only temporary SQLite/files, loopback HTTP and an OSS byte fixture
 * are used; the native registry is a mock, not a real DSH profile or Agent. */
import assert from 'node:assert/strict'
import test from 'node:test'
import { createHash, generateKeyPairSync, randomBytes, verify } from 'node:crypto'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { DatabaseSync } from 'node:sqlite'
import { build } from 'esbuild'
import { nodeIdForPublicKey } from '../../harness-remote-cloud-server/src/security.js'
import { resourceDeliveryConfig } from '../../harness-remote-cloud-server/src/resource-delivery/config.js'
import { openDeliveryRegistry } from '../../harness-remote-cloud-server/src/resource-delivery/registry.js'
import { ResourceDeliveryStore } from '../../harness-remote-cloud-server/src/resource-delivery/store.js'
import { createResourceDeliveryServer } from '../../harness-remote-cloud-server/src/resource-delivery/server.js'

const temporary = () => mkdtemp(path.join(os.tmpdir(), 'resource-delivery-contract-'))
async function cleanup(directory) {
  assert.equal(path.dirname(path.resolve(directory)), path.resolve(os.tmpdir()))
  assert(path.basename(directory).startsWith('resource-delivery-contract-'))
  await rm(directory, { recursive: true, force: true, maxRetries: 3 })
}
const compiled = await temporary()
test.after(() => cleanup(compiled))
await build({
  stdin: { contents: `export { ResourceDeliveryClient } from './private-resources/source.ts';
    export { ResourceController } from './private-resources/controller.ts';
    export { PrivateResourceLibrary } from './private-resources/library.ts';
    export { MyResourcesStore } from './client/my-resources-store.ts';`,
    resolveDir: fileURLToPath(new URL('../src', import.meta.url)), loader: 'ts' },
  bundle: true, platform: 'node', format: 'esm', packages: 'external',
  outfile: path.join(compiled, 'plugin.mjs'), logLevel: 'silent',
})
const { ResourceDeliveryClient, ResourceController, PrivateResourceLibrary, MyResourcesStore } = await import(pathToFileURL(path.join(compiled, 'plugin.mjs')).href)
const API = 'https://resource-control.contract.invalid', OSS = 'https://resource-objects.contract.invalid'
const digest = bytes => createHash('sha256').update(bytes).digest('hex')
const signal = () => new AbortController().signal
const preset = (patch = {}) => ({ schemaVersion: 1, kind: 'preset', resourceId: 'story-helper', version: '1.0.0',
  name: '故事伙伴', description: '私有角色预设', basePreset: 'standard',
  systemPrompt: '  保持角色 {{user}} 的原始设定。\r\n中文与 emoji 😊，保留空白。  ', ...patch })
const content = (patch = {}) => Buffer.from(` \n${JSON.stringify(preset(patch), null, 2)}\n`)
function identity() {
  const pair = generateKeyPairSync('ed25519')
  const publicKeyPem = pair.publicKey.export({ type: 'spki', format: 'pem' }).toString()
  return { nodeId: nodeIdForPublicKey(publicKeyPem), publicKeyPem,
    privateKeyPem: pair.privateKey.export({ type: 'pkcs8', format: 'pem' }).toString() }
}
class Objects {
  objects = new Map()
  tickets = new Map()
  signed = []
  location(sha) { return { region: 'oss-cn-test', bucket: 'delivery-contract', key: `resource-delivery/v1/sha256/${sha}.json` } }
  async putImmutable(bytes, sha) {
    assert.equal(digest(bytes), sha)
    const location = this.location(sha), old = this.objects.get(location.key)
    if (old) assert.deepEqual(old, bytes); else this.objects.set(location.key, Buffer.from(bytes))
    return location
  }
  async createDownloadUrl(release) {
    this.signed.push(release)
    const url = `${OSS}/${release.object_key}?ticket=${randomBytes(12).toString('hex')}`
    this.tickets.set(url, { key: release.object_key, expiresAt: Date.now() + 300_000 })
    return { url, expiresIn: 300 }
  }
  async ready() { return true }
  bytes(url) { const ticket = this.tickets.get(url); return ticket && ticket.expiresAt > Date.now() ? this.objects.get(ticket.key) : undefined }
}

async function fixture(t) {
  const root = await temporary(), registryPath = path.join(root, 'registry.sqlite'), deliveryPath = path.join(root, 'delivery.sqlite')
  const writer = new DatabaseSync(registryPath), libraries = []
  let app, registry, store
  t.after(async () => {
    for (const library of libraries) await library.close()
    await app?.close(); registry?.close(); store?.close(); writer.close(); await cleanup(root)
  })
  writer.exec(`PRAGMA journal_mode=WAL;
    CREATE TABLE accounts(owner_subject TEXT PRIMARY KEY,user_code TEXT UNIQUE NOT NULL,account_instance TEXT NOT NULL,status TEXT NOT NULL) STRICT;
    CREATE TABLE nodes(node_id TEXT PRIMARY KEY,public_key_pem TEXT NOT NULL,owner_subject TEXT,created_at INTEGER NOT NULL,revoked_at INTEGER) STRICT;
    CREATE TABLE test_public_access(owner_subject TEXT,expires_at INTEGER,balance INTEGER,disabled INTEGER) STRICT;
    INSERT INTO accounts VALUES ('contract-a','AAA-111','instance-a','active'),('contract-b','BBB-222','instance-b','active');
    INSERT INTO test_public_access VALUES ('contract-a',1,0,1);`)
  const a = identity(), b = identity()
  for (const [who, subject] of [[a, 'contract-a'], [b, 'contract-b']])
    writer.prepare('INSERT INTO nodes VALUES (?,?,?,?,NULL)').run(who.nodeId, who.publicKeyPem, subject, 100)
  registry = openDeliveryRegistry(registryPath); store = new ResourceDeliveryStore(deliveryPath)
  const objects = new Objects(), config = resourceDeliveryConfig({
    HR_DELIVERY_DB_PATH: deliveryPath, HR_DELIVERY_REGISTRY_DB_PATH: registryPath,
    HR_DELIVERY_OSS_REGION: 'oss-cn-test', HR_DELIVERY_OSS_BUCKET: 'delivery-contract', HR_DELIVERY_OSS_ROLE_NAME: 'contract-fixture',
  })
  app = createResourceDeliveryServer(config, { registry, store, objects })
  await new Promise((resolve, reject) => { app.server.once('error', reject); app.server.listen(0, '127.0.0.1', resolve) })
  const loopback = `http://127.0.0.1:${app.server.address().port}`
  function client(who = a, name = 'a') {
    const rows = new Map([['standard', { id: 'standard', name: 'Standard', plugins: [
      { id: 'persona', name: '@deepseek-ai/dsh-persona', config: { prefix: 'Stock persona', suffix: 'Stock suffix', includeRuntimeContext: true } },
      { id: 'fs', name: '@deepseek-ai/dsh-tool-fs' },
    ] }]])
    const registrations = [], removals = [], requests = []
    let nativeUnavailable = false
    const native = {
      async list() { return [...rows.values()].map(({ plugins, ...metadata }) => metadata) },
      async resolve(id) { if (!rows.has(id)) throw Error('native fixture: missing mode'); return rows.get(id) },
      async readDocument(id) { return { agentPreset: id, content: JSON.stringify(rows.get(id).plugins) } },
      async register(row) {
        assert(!rows.has(row.id), 'must not overwrite native or an older installed version')
        if (nativeUnavailable) throw Error('native fixture: temporarily unavailable')
        registrations.push(row); rows.set(row.id, row)
        return async () => { removals.push(row.id); rows.delete(row.id) }
      },
    }
    const directory = path.join(root, 'plugin-' + name)
    const host = { get(key) { assert.equal(key, 'agentPresets', 'resource delivery may only use the native preset registry'); return native } }
    const newLibrary = () => {
      const library = new PrivateResourceLibrary(host, directory, { codec: { load: JSON.parse }, promptModule: 'cordis:privateResourcePrompt' })
      libraries.push(library); return library
    }
    let offline = false, tamper = false, corrupt = false
    const fetchImpl = async (address, options) => {
      assert(!offline, 'offline local management must not fetch')
      const url = new URL(address); assert.equal(options.redirect, 'error')
      if (url.origin === OSS) {
        assert.equal(options.method, 'GET'); assert.equal(options.headers, undefined, 'node proof must never reach OSS')
        const bytes = objects.bytes(url.href); assert(bytes, 'only a real cloud-issued ticket can fetch bytes')
        requests.push({ kind: 'object', method: options.method, pathname: url.pathname })
        const body = Buffer.from(bytes); if (corrupt) body[body.length - 2] ^= 1
        return new Response(body, { headers: { 'content-type': 'application/json', 'content-length': String(body.length) } })
      }
      assert.equal(url.origin, API, 'adapter cannot access any other network destination')
      assert.equal(url.search, ''); assert.equal(url.hash, '')
      const headers = options.headers, raw = options.body ?? ''
      assert.equal(headers['x-hr-proof-version'], '2')
      assert.equal(headers['x-hr-node-id'], who.nodeId)
      const envelope = `agent-http-v2\n${options.method}\n${url.pathname}\n${who.nodeId}\n${headers['x-hr-timestamp']}\n${headers['x-hr-nonce']}\n${digest(raw)}`
      assert(verify(null, Buffer.from(envelope), who.publicKeyPem, Buffer.from(headers['x-hr-signature'], 'base64url')),
        'the actual plugin proof signs the actual method/path/body, independently checked here')
      if (options.method === 'POST') assert.equal(raw, '{}')
      // Origin substitution is test-only. Canonical production route, original
      // proof headers and body go through the real HTTP parser/authentication.
      const forwarded = { ...options, ...(tamper && options.method === 'POST' ? { body: ' { } ' } : {}) }
      const response = await fetch(loopback + url.pathname, forwarded)
      requests.push({ kind: 'control', method: options.method, pathname: url.pathname, body: raw, headers: { ...headers }, status: response.status })
      return response
    }
    const connection = { identity: who, origin: API, objectOrigins: [OSS], fetchImpl }
    const delivery = new ResourceDeliveryClient({ current: () => connection }), library = newLibrary()
    const controller = new ResourceController(library, delivery)
    return { connection, delivery, library, controller, directory, rows, native, requests, registrations, removals,
      offline() { offline = true }, tamperBody(value = true) { tamper = value }, corruptObject() { corrupt = true },
      failNative(value) { nativeUnavailable = value },
      recreate() { const next = newLibrary(); return { library: next, controller: new ResourceController(next, delivery) } },
    }
  }
  return { a, b, root, writer, store, objects, app, loopback, client,
    async publish(patch = {}) { const bytes = content(patch); const result = await app.service.publish(bytes); return { bytes, release: result.release } },
    grant(version = '1.0.0', code = 'AAA-111') { return app.service.changeGrant('grant', code, 'story-helper', version) },
    revoke(version = '1.0.0', code = 'AAA-111') { return app.service.changeGrant('revoke', code, 'story-helper', version) },
  }
}

test('real cloud publish/grant → bodyproofV2 catalog/ticket → original OSS JSON → hot native list', async t => {
  const f = await fixture(t), p = f.client(), published = await f.publish(); f.grant()
  await p.library.start(); const base = structuredClone(p.rows.get('standard'))
  assert.deepEqual(await p.controller.control({ op: 'status' }, signal()), { supported: true, items: [] })
  assert.equal(p.requests.length, 0, 'initial local status must not touch cloud')
  const catalog = await p.controller.control({ op: 'refresh' }, signal())
  assert.equal(catalog.items[0].state, 'available'); assert.equal(p.registrations.length, 0)
  const installed = await p.controller.control({ op: 'install', resourceId: 'story-helper', version: '1.0.0' }, signal())
  assert.equal(installed.items[0].state, 'installed'); assert.equal(installed.items[0].enabled, true)
  const presetId = installed.items[0].presetId
  assert((await p.native.list()).some(row => row.id === presetId), 'installation is a live native registry entry, not just a downloaded file')
  assert.deepEqual(p.rows.get('standard'), base)
  assert.equal(p.rows.get(presetId).plugins.at(-1).config.text, preset().systemPrompt)
  assert.deepEqual(p.rows.get(presetId).plugins[1], base.plugins[1])
  assert.deepEqual(await readFile(path.join(p.directory, digest('story-helper\0' + '1.0.0'), 'resource.json')), published.bytes)
  assert.deepEqual(p.requests.map(row => [row.kind, row.method]), [['control', 'GET'], ['control', 'GET'], ['control', 'POST'], ['object', 'GET']])
  const audits = f.store.db.prepare("SELECT * FROM rd_audit WHERE event='download_ticket_issued'").all()
  assert.equal(audits.length, 1); assert.equal(audits[0].bytes, published.bytes.length)
  assert.equal(audits[0].sha256, digest(published.bytes)); assert.equal(audits[0].account_instance, 'instance-a')
  assert.equal(f.store.db.prepare("SELECT COUNT(*) n FROM sqlite_master WHERE name LIKE '%traffic%'").get().n, 0)
})

test('actual plugin bodyproofV2 fails on altered HTTP bytes and replay; server rejects both before OSS signing', async t => {
  const f = await fixture(t), p = f.client(), published = await f.publish(); f.grant()
  const catalog = await p.delivery.catalog(signal()); p.tamperBody()
  await assert.rejects(p.delivery.download(published.release, catalog.accountInstance, signal()), { code: 'resources-forbidden' })
  assert.equal(p.requests.at(-1).status, 401); assert.equal(f.objects.signed.length, 0)
  p.tamperBody(false); assert.deepEqual(await p.delivery.download(published.release, catalog.accountInstance, signal()), published.bytes)
  const signed = p.requests.findLast(row => row.kind === 'control' && row.method === 'POST')
  const replay = await fetch(f.loopback + signed.pathname, { method: signed.method, headers: signed.headers, body: signed.body })
  assert.equal(replay.status, 401); await replay.arrayBuffer()
  assert.equal(f.objects.signed.length, 1)
})

test('a different account cannot list/install/download a grant or impersonate the owner node', async t => {
  const f = await fixture(t), published = await f.publish(); f.grant()
  const b = f.client(f.b, 'b')
  assert.deepEqual((await b.controller.control({ op: 'refresh' }, signal())).items, [])
  await assert.rejects(b.controller.control({ op: 'install', resourceId: 'story-helper', version: '1.0.0' }, signal()), { code: 'resources-forbidden' })
  await assert.rejects(b.delivery.download(published.release, 'instance-b', signal()), { code: 'resources-unavailable' })
  assert.equal(b.requests.at(-1).status, 404); assert.equal(b.registrations.length, 0); assert.equal(f.objects.signed.length, 0)
  const spoof = f.client({ ...f.b, nodeId: f.a.nodeId }, 'spoof')
  await assert.rejects(spoof.delivery.catalog(signal()), { code: 'resources-forbidden' })
  assert.equal(spoof.requests[0].status, 401); assert.equal(spoof.registrations.length, 0)
})

test('a newly authorized version installs hot while the old native definition and original bytes remain intact', async t => {
  const f = await fixture(t), p = f.client(), first = await f.publish(); f.grant()
  const before = await p.controller.control({ op: 'install', resourceId: 'story-helper', version: '1.0.0' }, signal())
  const oldId = before.items[0].presetId, oldDefinition = await p.native.resolve(oldId)
  const second = await f.publish({ version: '1.1.0', systemPrompt: '新版角色；不覆盖旧版。\n' }); f.grant('1.1.0')
  const next = await p.controller.control({ op: 'refresh' }, signal())
  assert.deepEqual(next.items.map(row => [row.version, row.state]), [['1.0.0', 'installed'], ['1.1.0', 'available']])
  assert.equal(p.registrations.length, 1, 'refresh is not consent to update')
  const after = await p.controller.control({ op: 'install', resourceId: 'story-helper', version: '1.1.0' }, signal())
  assert(after.items.every(row => row.state === 'installed' && row.enabled === true))
  assert.notEqual(after.items[0].presetId, after.items[1].presetId)
  assert.equal(await p.native.resolve(oldId), oldDefinition)
  assert.equal(p.removals.length, 0, 'installing the new version must not disable the old version')
  assert.equal((await p.native.list()).length, 3)
  for (const [version, bytes] of [['1.0.0', first.bytes], ['1.1.0', second.bytes]])
    assert.deepEqual(await readFile(path.join(p.directory, digest('story-helper\0' + version), 'resource.json')), bytes)
})

test('revocation blocks future installations but local status, restart and activation remain completely offline', async t => {
  const f = await fixture(t), p = f.client(); await f.publish(); f.grant()
  await p.controller.control({ op: 'install', resourceId: 'story-helper', version: '1.0.0' }, signal())
  await f.publish({ version: '1.1.0' }); f.grant('1.1.0'); f.revoke(); f.revoke('1.1.0')
  const catalog = await p.controller.control({ op: 'refresh' }, signal())
  assert.deepEqual(catalog.items.map(row => [row.version, row.state]), [['1.0.0', 'installed']])
  for (const version of ['1.0.0', '1.1.0'])
    await assert.rejects(p.controller.control({ op: 'install', resourceId: 'story-helper', version }, signal()), { code: 'resources-forbidden' })
  assert.equal(f.objects.signed.length, 1)
  const count = p.requests.length; p.offline()
  const paused = await p.controller.control({ op: 'setEnabled', resourceId: 'story-helper', version: '1.0.0', enabled: false }, signal())
  assert.equal(paused.items[0].state, 'installed'); assert.equal(paused.items[0].enabled, false); assert.equal((await p.native.list()).length, 1)
  await p.library.close(); const restored = p.recreate(); await restored.library.start()
  assert.equal((await restored.controller.control({ op: 'status' }, signal())).items[0].enabled, false)
  const resumed = await restored.controller.control({ op: 'setEnabled', resourceId: 'story-helper', version: '1.0.0', enabled: true }, signal())
  assert.equal(resumed.items[0].enabled, true); assert.equal((await p.native.list()).length, 2)
  assert.equal(p.requests.length, count, 'offline operations cannot acquire tickets, check entitlements or bill traffic')
})

test('account instance changes between catalog and ticket are rejected before the OSS byte request', async t => {
  const f = await fixture(t), p = f.client(), published = await f.publish(); f.grant()
  const previous = await p.delivery.catalog(signal())
  f.writer.exec("UPDATE accounts SET account_instance='instance-a-recreated' WHERE owner_subject='contract-a'"); f.grant()
  await assert.rejects(p.delivery.download(published.release, previous.accountInstance, signal()), { code: 'resources-closed' })
  assert(!p.requests.some(row => row.kind === 'object')); assert.equal(p.registrations.length, 0)
})

test('altered OSS bytes fail integrity before native registration or local resource publication', async t => {
  const f = await fixture(t), p = f.client(); await f.publish(); f.grant(); p.corruptObject()
  await assert.rejects(p.controller.control({ op: 'install', resourceId: 'story-helper', version: '1.0.0' }, signal()), { code: 'resource-integrity' })
  assert.equal(p.registrations.length, 0); assert.deepEqual(p.library.list(), []); assert.equal((await p.native.list()).length, 1)
  await assert.rejects(readFile(path.join(p.directory, digest('story-helper\0' + '1.0.0'), 'resource.json')), { code: 'ENOENT' })
})

test('UI store retries downloaded-but-unavailable native activation entirely offline after grant revocation', async t => {
  const f = await fixture(t), p = f.client(); await f.publish(); f.grant(); p.failNative(true)
  const unavailable = await p.controller.control({ op: 'install', resourceId: 'story-helper', version: '1.0.0' }, signal())
  assert.equal(unavailable.items[0].state, 'unavailable'); assert.equal(unavailable.items[0].enabled, true)
  assert(unavailable.items[0].presetId); assert.equal(p.registrations.length, 0)
  f.revoke(); const networkCount = p.requests.length; p.offline()
  const controlCalls = [], ui = new MyResourcesStore(async request => {
    controlCalls.push(request)
    return { ok: true, value: await p.controller.control(request, signal()) }
  })
  t.after(() => ui.dispose())
  await ui.load(); await ui.install('story-helper', '1.0.0')
  assert.equal(controlCalls.length, 1, 'local unavailable entry must never issue another install')
  p.failNative(false); await ui.setEnabled('story-helper', '1.0.0', true)
  assert.equal(ui.getSnapshot().data.items[0].state, 'installed'); assert.equal(p.registrations.length, 1)
  await ui.setEnabled('story-helper', '1.0.0', false)
  assert.equal(ui.getSnapshot().data.items[0].enabled, false); assert.equal((await p.native.list()).length, 1)
  await ui.setEnabled('story-helper', '1.0.0', true)
  assert.equal(ui.getSnapshot().data.items[0].enabled, true); assert.equal((await p.native.list()).length, 2)
  assert.deepEqual(controlCalls.map(request => request.op), ['status', 'setEnabled', 'setEnabled', 'setEnabled'])
  assert.equal(p.requests.length, networkCount, 'all local retries/activation must remain free of cloud requests')
})
