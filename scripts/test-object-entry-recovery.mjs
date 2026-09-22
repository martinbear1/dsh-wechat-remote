import assert from 'node:assert/strict'
import { generateKeyPairSync } from 'node:crypto'
import test from 'node:test'
import { PublicObjectClient, DEFAULT_TRUSTED_OBJECT_ORIGINS } from '../lib/public-object-client.js'
import { objectRpcBudget, OBJECT_UPLOAD_BUDGET_MS, OBJECT_DOWNLOAD_BUDGET_MS } from '../lib/object-transfer-budget.js'

const relay = 'https://relay.example.test', primary = 'https://primary.example.test', alternate = 'https://alias.example.test'
const { privateKey } = generateKeyPairSync('ed25519')
const identity = { nodeId: 'node-abcdefghijklmnop', privateKeyPem: privateKey.export({ type: 'pkcs8', format: 'pem' }) }
const objectId = 'object-abcdefghijklmnop'
test('default routes are only Shanghai native and same-bucket CNAME; retired region is rejected before I/O', async () => {
  assert.deepEqual(DEFAULT_TRUSTED_OBJECT_ORIGINS, [
    'https://harness-remote-e2ee-cn-shanghai-7f4c9d2a.oss-cn-shanghai.aliyuncs.com',
    'https://objects-sh.xyxfood.xyz',
  ])
  for (const method of ['GET', 'PUT']) {
    let calls = 0
    const client = new PublicObjectClient(relay, identity, async () => {
      calls++
      return Response.json({ objectId, purpose: 'attachment', expectedBytes: 17, expiresAt: Date.now() + 60000,
        [method === 'GET' ? 'download' : 'upload']: { expiresIn: 300,
          url: 'https://harness-remote-e2ee-cn-hongkong-7f4c9d2b.oss-cn-hongkong.aliyuncs.com/object' } })
    })
    await assert.rejects(method === 'GET' ? client.download(objectId) : client.upload('attachment', Buffer.alloc(17)), /not trusted/)
    assert.equal(calls, 1, 'only control request; no request to retired storage')
  }
})
test('outer file RPC budgets cover object transfer; ordinary RPC budgets remain unchanged', () => {
  for (const method of ['session.prompt', 'session.list', 'agentResources/list', 'wechatHistory/page']) assert.equal(objectRpcBudget(method), undefined)
  assert(objectRpcBudget('agentInputs/upload') > OBJECT_DOWNLOAD_BUDGET_MS)
  assert(objectRpcBudget('agentResources/prepareArchive') > OBJECT_UPLOAD_BUDGET_MS)
  assert.equal(objectRpcBudget('wechatAttachment/prepareBatch', { args: { request: { attachments: [1, 2] } } }), 210000)
  assert.equal(objectRpcBudget('wechatAttachment/prepareBatch', { args: { request: { attachments: Array(100) } } }), 630000)
})
function fixture({ put, get, complete, mutate } = {}) {
  const calls = [], state = { ready: false, puts: 0, completes: 0 }
  const transfer = (origin, method) => ({ url: origin + '/same-object?signature=test', expiresIn: 300,
    headers: method === 'PUT' ? { 'content-type': 'application/octet-stream', 'x-oss-forbid-overwrite': 'true' } : {} })
  const client = new PublicObjectClient(relay, identity, async (url, options) => {
    calls.push({ url, method: options.method, options })
    if (url.endsWith('/complete')) {
      state.completes++
      if (complete) { const result = await complete(state); if (result) return result }
      return state.ready ? Response.json({ objectId, ready: true, expiresAt: Date.now() + 60000 })
        : Response.json({ error: { code: 'object_upload_missing' } }, { status: 409 })
    }
    if (url.startsWith(relay)) {
      assert.equal(options.headers['x-hr-object-entries'], '1')
      const method = url.endsWith('/download') ? 'GET' : 'PUT'
      const entry = transfer(primary, method)
      entry.alternatives = [transfer(alternate, method)]
      if (mutate) mutate(entry, method)
      return Response.json({ objectId, purpose: 'attachment', expectedBytes: 17, expiresAt: Date.now() + 60000,
        [method === 'GET' ? 'download' : 'upload']: entry })
    }
    if (options.method === 'PUT') {
      state.puts++
      if (put) return put(url, state, options)
      state.ready = true; return new Response(null)
    }
    return get ? get(url, state, options) : new Response(Buffer.alloc(17, 9))
  }, [primary, alternate])
  return { client, calls, state, upload: signal => client.upload('attachment', Buffer.alloc(17), signal) }
}
test('healthy path has one ticket, one PUT, one acknowledgement and zero probes', async () => {
  const f = fixture(); await f.upload()
  assert.deepEqual(f.calls.map(c => c.method), ['POST', 'PUT', 'POST'])
  assert.equal(f.calls[1].url.startsWith(primary), true)
})
test('failed primary confirms absence then uses the same object alternate', async () => {
  const f = fixture({ put: (url, state) => {
    if (url.startsWith(primary)) throw new TypeError('fetch failed')
    state.ready = true; return new Response(null)
  } })
  const result = await f.upload()
  assert.equal(result.objectId, objectId)
  assert.equal(f.calls.filter(c => c.url.endsWith('/objects')).length, 1)
  assert.equal(f.state.puts, 2); assert.equal(f.state.completes, 2)
  assert.deepEqual(f.calls.filter(c => c.method === 'PUT').map(c => new URL(c.url).pathname), ['/same-object', '/same-object'])
})
test('lost successful PUT response is reconciled without uploading a second time', async () => {
  const f = fixture({ put: (_url, state) => { state.ready = true; throw new TypeError('lost reply') } })
  await f.upload()
  assert.equal(f.state.puts, 1); assert.equal(f.state.completes, 1)
  assert.equal(f.client.preferences.size, 0, 'uncertain route is not preference evidence')
})
test('lost completion response retries acknowledgement only', async () => {
  const f = fixture({ complete: state => { if (state.completes === 1) throw new TypeError('lost reply') } })
  await f.upload(); assert.equal(f.state.puts, 1); assert.equal(f.state.completes, 2)
})
test('403 does not retry or confirm an unauthorized PUT', async () => {
  const f = fixture({ put: () => new Response(null, { status: 403 }) })
  await assert.rejects(f.upload(), /403/)
  assert.equal(f.state.puts, 1); assert.equal(f.state.completes, 0)
})
test('both entries failing remain one ticket and bounded reconciliation', async () => {
  const f = fixture({ put: () => { throw new TypeError('network') } })
  await assert.rejects(f.upload(), error => error.code === 'object_upload_missing')
  assert.equal(f.state.puts, 2); assert.equal(f.state.completes, 4)
  assert.equal(f.calls.filter(c => c.url.endsWith('/objects')).length, 1)
})
test('successful alternate is briefly preferred, independently per direction', async () => {
  const f = fixture({ put: (url, state) => {
    if (url.startsWith(primary)) throw new TypeError('network')
    state.ready = true; return new Response(null)
  } })
  await f.upload()
  const uploadPreference = [...f.client.preferences.values()][0]
  const originalExpiry = uploadPreference.expiresAt
  f.calls.length = 0; f.state.ready = false
  await f.upload()
  assert.equal(f.calls[1].url.startsWith(alternate), true)
  assert.equal(uploadPreference.expiresAt, originalExpiry, 'success must not renew the fixed preference window')
  f.calls.length = 0
  await f.client.download(objectId)
  assert.equal(f.calls[1].url.startsWith(primary), true)
  for (const value of f.client.preferences.values()) value.expiresAt = 0
  f.calls.length = 0; f.state.ready = false
  await f.upload()
  assert.equal(f.calls[1].url.startsWith(primary), true)
})
test('a preferred alternate failing returns to healthy primary without another object ticket', async () => {
  let healthy = alternate
  const f = fixture({ put: (url, state) => {
    if (!url.startsWith(healthy)) throw new TypeError('network')
    state.ready = true; return new Response(null)
  } })
  await f.upload()
  healthy = primary; f.calls.length = 0; f.state.ready = false
  await f.upload()
  assert.deepEqual(f.calls.filter(c => c.method === 'PUT').map(c => new URL(c.url).origin), [alternate, primary])
  assert.equal(f.calls.filter(c => c.url.endsWith('/objects')).length, 1)
  f.client.stop(); assert.equal(f.client.preferences.size, 0)
})
test('download falls back on network failure without another ticket or quota request', async () => {
  const f = fixture({ get: url => { if (url.startsWith(primary)) throw new TypeError('network'); return new Response(Buffer.alloc(17)) } })
  assert.equal((await f.client.download(objectId)).byteLength, 17)
  assert.equal(f.calls.length, 3)
})
for (const size of [16, 18]) test('invalid download length never triggers alternate: ' + size, async () => {
  const f = fixture({ get: () => new Response(Buffer.alloc(size)) })
  await assert.rejects(f.client.download(objectId), /length mismatch/)
  assert.equal(f.calls.length, 2)
})
for (const kind of ['host', 'path', 'overwrite', 'count']) test('invalid alternative rejected before transfer: ' + kind, async () => {
  const f = fixture({ mutate: entry => {
    if (kind === 'host') entry.alternatives[0].url = 'https://evil.example.test/same-object'
    if (kind === 'path') entry.alternatives[0].url = alternate + '/different-object'
    if (kind === 'overwrite') delete entry.alternatives[0].headers['x-oss-forbid-overwrite']
    if (kind === 'count') entry.alternatives.push(entry.alternatives[0])
  } })
  await assert.rejects(f.upload()); assert.equal(f.calls.length, 1)
})
test('cancellation after failed PUT cannot launch completion or alternate', async () => {
  const controller = new AbortController()
  const f = fixture({ put: () => { controller.abort(); throw new TypeError('late failure') } })
  await assert.rejects(f.upload(controller.signal), { name: 'AbortError' })
  assert.equal(f.state.puts, 1); assert.equal(f.state.completes, 0)
})
test('old cloud single-entry responses remain supported', async () => {
  const f = fixture({ mutate: entry => { delete entry.alternatives } })
  await f.upload(); await f.client.download(objectId)
  assert.equal(f.calls.length, 5)
})
