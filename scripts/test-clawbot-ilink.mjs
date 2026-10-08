import test from 'node:test'
import assert from 'node:assert/strict'
import { setImmediate } from 'node:timers/promises'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'

// Compile only these sources in memory. Every HTTP call below is a synthetic fetch.
const compiled = await build({ entryPoints: [fileURLToPath(new URL('../src/clawbot/ilink.ts', import.meta.url))],
  bundle: true, write: false, platform: 'node', format: 'esm', target: 'node22' })
const { ILinkClient, ILinkError } = await import(`data:text/javascript;base64,${Buffer.from(compiled.outputFiles[0].contents).toString('base64')}`)
const auth = { token: 'secret-bot-token', baseUrl: 'https://ilinkai.weixin.qq.com',
  accountId: 'bot-test@im.bot', userId: 'user-test@im.wechat' }
const outgoing = { userId: auth.userId, contextToken: 'secret-context', text: '你好', clientId: 'client-1' }
const qr = { qrcode: 'secret-qr-code', qrcode_img_content: 'https://liteapp.weixin.qq.com/q/test-only' }
const inbound = (overrides = {}) => ({ message_id: '18446744073709551615', from_user_id: auth.userId,
  message_type: 1, context_token: 'context-1', item_list: [{ type: 1, text_item: { text: '你好' } }], ...overrides })
const success = (messages = [inbound()], overrides = {}) => ({ ret: 0, msgs: messages, get_updates_buf: 'next-cursor', ...overrides })

function fixture(responses) {
  const calls = []
  return { calls, client: new ILinkClient({ fetch: async (url, options) => {
    calls.push({ url: String(url), options })
    assert.equal(options.redirect, 'error')
    assert.ok(options.signal instanceof AbortSignal)
    const next = responses.shift()
    assert.notEqual(next, undefined, 'unexpected request')
    if (next instanceof Error) throw next
    return next instanceof Response ? next : Response.json(next)
  } }) }
}

test('native QR headers, verification code, IDC state and confirmed credentials', async () => {
  const { client, calls } = fixture([qr, { status: 'need_verifycode' },
    { status: 'scaned_but_redirect', redirect_host: 'test.ilinkai.weixin.qq.com' },
    { status: 'confirmed', bot_token: auth.token, ilink_bot_id: auth.accountId,
      ilink_user_id: auth.userId, baseurl: auth.baseUrl }])
  assert.deepEqual(await client.getQr(), { qrcode: qr.qrcode, url: qr.qrcode_img_content })
  const first = calls[0]
  assert.equal(first.url, `${auth.baseUrl}/ilink/bot/get_bot_qrcode?bot_type=3`)
  assert.equal(first.options.method, 'POST')
  assert.deepEqual(JSON.parse(first.options.body), { local_token_list: [] })
  assert.equal(first.options.headers.AuthorizationType, 'ilink_bot_token')
  assert.equal(first.options.headers.Authorization, undefined)
  assert.equal(first.options.headers['iLink-App-Id'], 'bot')
  assert.equal(first.options.headers['iLink-App-ClientVersion'], '132105')
  const uin = Buffer.from(first.options.headers['X-WECHAT-UIN'], 'base64').toString('utf8')
  assert.match(uin, /^\d+$/)
  assert.ok(Number(uin) <= 0xffffffff)
  assert.equal((await client.pollQr(qr.qrcode)).status, 'need_verifycode')
  assert.equal((await client.pollQr(qr.qrcode, undefined, '012345')).status, 'scaned_but_redirect')
  const confirmed = await client.pollQr(qr.qrcode)
  assert.deepEqual(confirmed, { status: 'confirmed', credentials: auth })
  assert.equal(calls[1].options.method, 'GET')
  assert.deepEqual(calls[1].options.headers, { 'iLink-App-Id': 'bot', 'iLink-App-ClientVersion': '132105' })
  assert.equal(new URL(calls[2].url).searchParams.get('verify_code'), '012345')
  assert.equal(new URL(calls[3].url).searchParams.has('verify_code'), false, 'verification code must not be cached')
  assert.equal(new URL(calls[3].url).hostname, 'test.ilinkai.weixin.qq.com')
  await assert.rejects(client.pollQr(qr.qrcode), { code: 'clawbot-invalid-input' })
})

test('known native QR states remain native and terminal states clear local state', async () => {
  for (const status of ['wait', 'scaned', 'need_verifycode', 'verify_code_blocked', 'expired', 'binded_redirect']) {
    const { client } = fixture([qr, { status }])
    await client.getQr()
    const result = await client.pollQr(qr.qrcode)
    assert.equal(result.status, status)
    assert.ok(result.message)
    assert.equal(result.credentials, undefined)
    if (['verify_code_blocked', 'expired', 'binded_redirect'].includes(status)) {
      await assert.rejects(client.pollQr(qr.qrcode), { code: 'clawbot-invalid-input' })
    }
  }
})

test('reconnecting supplies only the most recent ten valid caller tokens and preserves already-bound status', async () => {
  const { client, calls } = fixture([qr, { status: 'binded_redirect' }])
  const localTokens = [...Array.from({ length: 12 }, (_, index) => `local-token-${index}`), '', 'bad\ntoken', ' local-newest ']
  await client.getQr(undefined, localTokens)
  assert.deepEqual(JSON.parse(calls[0].options.body), {
    local_token_list: ['local-newest', ...Array.from({ length: 9 }, (_, index) => `local-token-${11 - index}`)],
  })
  assert.equal(calls[0].options.headers.Authorization, undefined)
  const result = await client.pollQr(qr.qrcode)
  assert.equal(result.status, 'binded_redirect')
  assert.equal(result.credentials, undefined, 'already-bound must not invent or replace credentials')
  assert.ok(result.message)
  await assert.rejects(client.pollQr(qr.qrcode), { code: 'clawbot-invalid-input' })
})

test('QR status errors and incomplete credentials fail closed', async () => {
  for (const response of [{ status: 'new_status' }, { status: 'confirmed' },
    { status: 'confirmed', bot_token: '', ilink_bot_id: auth.accountId, ilink_user_id: auth.userId },
    { status: 'confirmed', bot_token: auth.token, ilink_bot_id: auth.accountId, ilink_user_id: 'room@chatroom' },
    { status: 'scaned_but_redirect' }]) {
    const { client } = fixture([qr, response])
    await client.getQr()
    await assert.rejects(client.pollQr(qr.qrcode), { code: 'clawbot-invalid-response' })
  }
  const { client, calls } = fixture([qr])
  await client.getQr()
  await assert.rejects(client.pollQr(qr.qrcode, undefined, '123&verify_code=456'), { code: 'clawbot-invalid-input' })
  assert.equal(calls.length, 1)
})

test('API destinations are HTTPS allowlisted origins and all HTTP redirects are denied', async () => {
  for (const baseUrl of ['http://ilinkai.weixin.qq.com', 'https://127.0.0.1', 'https://ilinkai.weixin.qq.com.evil.test',
    'https://ilinkai.weixin.qq.com:8443', 'https://user:pass@ilinkai.weixin.qq.com',
    'https://ilinkai.weixin.qq.com/path', 'https://ilinkai.weixin.qq.com?route=other',
    'https://ilinkai.weixin.qq.com/#secret', 'https://evil.test\\@ilinkai.weixin.qq.com']) {
    const { client, calls } = fixture([])
    await assert.rejects(client.getUpdates({ ...auth, baseUrl }, ''), { code: 'clawbot-untrusted-url' })
    assert.equal(calls.length, 0)
  }
  const { client, calls } = fixture([Response.redirect('https://evil.test', 302)])
  await assert.rejects(client.getQr(), { code: 'clawbot-untrusted-url' })
  assert.equal(calls.length, 1)
})

test('QR display URL and explicit status redirects have independent allowlists', async () => {
  for (const url of ['javascript:alert(1)', 'http://liteapp.weixin.qq.com/q/a', 'https://weixin.qq.com.evil.test/a',
    'https://user:pass@liteapp.weixin.qq.com/q/a', 'https://liteapp.weixin.qq.com:8443/q/a']) {
    const { client } = fixture([{ ...qr, qrcode_img_content: url }])
    await assert.rejects(client.getQr(), { code: 'clawbot-untrusted-url' })
  }
  for (const host of ['evil.test', 'ilinkai.weixin.qq.com.evil.test', 'localhost']) {
    const { client, calls } = fixture([qr, { status: 'scaned_but_redirect', redirect_host: host }])
    await client.getQr()
    await assert.rejects(client.pollQr(qr.qrcode), { code: 'clawbot-untrusted-url' })
    assert.equal(calls.length, 2)
  }
})

test('text wire format and cursor propagation preserve native metadata', async () => {
  const { client, calls } = fixture([success(), { ret: 0 }])
  const updates = await client.getUpdates(auth, 'previous-cursor')
  assert.deepEqual(updates, { cursor: 'next-cursor', messages: [{ id: '18446744073709551615',
    userId: auth.userId, contextToken: 'context-1', text: '你好' }] })
  await client.sendText(auth, outgoing)
  assert.equal(calls[0].options.headers.Authorization, `Bearer ${auth.token}`)
  assert.deepEqual(JSON.parse(calls[0].options.body), { get_updates_buf: 'previous-cursor',
    base_info: { channel_version: '2.4.9', bot_agent: 'DSHRemote/1.0.0' } })
  assert.deepEqual(JSON.parse(calls[1].options.body), { msg: { from_user_id: '', to_user_id: auth.userId,
    client_id: outgoing.clientId, message_type: 2, message_state: 2, context_token: outgoing.contextToken,
    item_list: [{ type: 1, text_item: { text: '你好' } }] },
    base_info: { channel_version: '2.4.9', bot_agent: 'DSHRemote/1.0.0' } })
})

test('uint64 IDs remain exact, including item fallback, without rewriting user text', async () => {
  const raw = '{"ret":0,"get_updates_buf":"next","msgs":[{"message_id":18446744073709551615,"message_type":1,'
    + '"from_user_id":"user-test@im.wechat","context_token":"ctx","item_list":[{"type":1,'
    + '"text_item":{"text":"say \\"message_id\\": 18446744073709551615"}}]}]}'
  const { client } = fixture([new Response(raw), success([inbound({ message_id: undefined,
    item_list: [{ type: 1, msg_id: '9007199254740993', text_item: { text: 'fallback' } }] })])])
  const first = await client.getUpdates(auth, '')
  assert.equal(first.messages[0].id, '18446744073709551615')
  assert.equal(first.messages[0].text, 'say "message_id": 18446744073709551615')
  assert.equal((await client.getUpdates(auth, first.cursor)).messages[0].id, '9007199254740993')
})

test('native getupdates may omit success codes, including idle replies with a cursor and deprecated sync_buf', async () => {
  // Shape observed on device; all identifiers and cursor values here are synthetic.
  const { client, calls } = fixture([
    { msgs: [], sync_buf: 'deprecated', get_updates_buf: 'synthetic-cursor' },
    { msgs: [inbound()], get_updates_buf: 'after-message' },
    { errcode: 0, msgs: [], get_updates_buf: '' },
    { sync_buf: 'never-adopt-this-cursor' }, {},
  ])
  assert.deepEqual(await client.getUpdates(auth, 'old'), { cursor: 'synthetic-cursor', messages: [] })
  const batch = await client.getUpdates(auth, 'synthetic-cursor')
  assert.equal(batch.cursor, 'after-message')
  assert.equal(batch.messages[0].text, '你好')
  assert.equal(JSON.parse(calls[1].options.body).get_updates_buf, 'synthetic-cursor')
  for (let index = 0; index < 3; index++)
    assert.deepEqual(await client.getUpdates(auth, 'after-message'), { cursor: 'after-message', messages: [] })
})

test('missing ret never hides an explicit error or malformed error field on reads or writes', async () => {
  for (const [body, code] of [
    [{ errcode: -14 }, 'clawbot-auth-expired'], [{ errcode: 7 }, 'clawbot-api-error'],
    [{ ret: 0, errcode: 7 }, 'clawbot-api-error'], [{ ret: -2, errcode: 0 }, 'clawbot-api-error'],
    ...[{ ret: null }, { errcode: null }, { errcode: '0' }, { ret: false }, { ret: 0.5 }]
      .map(body => [body, 'clawbot-invalid-response']),
  ]) {
    for (const method of ['read', 'send']) {
      const { client, calls } = fixture([{ msgs: [], get_updates_buf: 'must-not-adopt', ...body }])
      await assert.rejects(method === 'read' ? client.getUpdates(auth, 'keep') : client.sendText(auth, outgoing), { code })
      assert.equal(calls.length, 1)
    }
  }
})

test('media is flagged and group/bot events cannot become user commands', async () => {
  const { client } = fixture([success([inbound({ item_list: [{ type: 2, image_item: {} }] }),
    inbound({ group_id: 'group' }), inbound({ message_type: 2 })])])
  assert.deepEqual(await client.getUpdates(auth, ''), { cursor: 'next-cursor', messages: [{
    id: '18446744073709551615', userId: auth.userId, contextToken: 'context-1', text: '', unsupported: true,
  }] })
})

test('malformed or over-limit batches fail as a whole and never return their cursor', async () => {
  for (const message of [inbound({ message_id: '' }), inbound({ message_id: '-1' }),
    inbound({ message_id: '18446744073709551616' }), inbound({ from_user_id: '' }),
    inbound({ from_user_id: 'group@chatroom' }), inbound({ context_token: '' }),
    inbound({ item_list: [] }), inbound({ item_list: [{ type: 1, text_item: { text: 12 } }] })]) {
    const { client } = fixture([success([inbound(), message])])
    await assert.rejects(client.getUpdates(auth, 'previous'), { code: 'clawbot-invalid-response' })
  }
  for (const body of [success(Array.from({ length: 101 }, () => inbound())),
    success([], { get_updates_buf: 12 }), success([], { longpolling_timeout_ms: -1 }),
    { ret: 0, msgs: {} }, { ret: '0' }, { msgs: null }, { msgs: [inbound({ context_token: '' })] }]) {
    const { client } = fixture([body])
    await assert.rejects(client.getUpdates(auth, 'previous'), { code: 'clawbot-invalid-response' })
  }
  const { client } = fixture([success([], { get_updates_buf: '' }), { ret: 0 }])
  assert.deepEqual(await client.getUpdates(auth, 'previous'), { cursor: 'previous', messages: [] })
  assert.deepEqual(await client.getUpdates(auth, 'previous'), { cursor: 'previous', messages: [] })
})

test('business errors, stale-token errors and HTTP failures are distinguished without secret leakage', async () => {
  for (const [body, code, apiCode] of [[{ ret: -14 }, 'clawbot-auth-expired', -14],
    [{ ret: 0, errcode: -14 }, 'clawbot-auth-expired', -14],
    [{ ret: -2, errmsg: auth.token }, 'clawbot-api-error', -2],
    [{ ret: 0, errcode: 7 }, 'clawbot-api-error', 7]]) {
    const { client, calls } = fixture([body])
    await assert.rejects(client.sendText(auth, outgoing), (error) => {
      assert.ok(error instanceof ILinkError)
      assert.equal(error.code, code)
      assert.equal(error.apiCode, apiCode)
      assert.ok(!error.message.includes(auth.token))
      return true
    })
    assert.equal(calls.length, 1, 'writes must never be automatically retried')
  }
  for (const status of [401, 403, 429, 503]) {
    const { client } = fixture([new Response(auth.token, { status })])
    await assert.rejects(client.sendText(auth, outgoing), (error) => {
      assert.equal(error.httpStatus, status)
      assert.ok(!error.message.includes(auth.token))
      return true
    })
  }
  const { client } = fixture([new Error(`network detail ${auth.token}`)])
  await assert.rejects(client.getQr(), { code: 'clawbot-network-error', message: '暂时无法连接微信，请稍后重试' })
})

test('response budget covers actual streamed bytes, advertised lengths and invalid JSON', async () => {
  for (const response of [new Response('x', { headers: { 'content-length': String(1024 * 1024 + 1) } }),
    new Response(' '.repeat(1024 * 1024 + 1))]) {
    const { client } = fixture([response])
    await assert.rejects(client.getUpdates(auth, ''), { code: 'clawbot-response-too-large' })
  }
  for (const raw of ['null', '[]', '<html>error</html>', '{"ret":0,"message_id":01}',
    '{"ret":0,"message_id":1e5}', new Uint8Array([255])]) {
    const { client } = fixture([new Response(raw)])
    await assert.rejects(client.getUpdates(auth, ''), { code: 'clawbot-invalid-response' })
  }
})

test('missing sending context and non-private recipients cannot be accepted', async () => {
  for (const text of [{ ...outgoing, contextToken: '' }, { ...outgoing, userId: '' },
    { ...outgoing, userId: 'room@chatroom' }, { ...outgoing, clientId: '' }, { ...outgoing, text: '' }]) {
    const { client, calls } = fixture([])
    await assert.rejects(client.sendText(auth, text), { code: 'clawbot-invalid-input' })
    assert.equal(calls.length, 0)
  }
})

test('native send acknowledgements may omit ret, but HTTP or malformed bodies never acknowledge delivery', async () => {
  for (const body of [{}, { errcode: 0 }, { ret: 0 }, { ret: 0, errcode: 0 }]) {
    const { client, calls } = fixture([body])
    await client.sendText(auth, outgoing)
    assert.equal(calls.length, 1, 'an accepted reply is not resent')
  }
  for (const response of [new Response(''), new Response(null, { status: 204 }),
    new Response('null'), new Response('[]'), new Response('<html>error</html>'),
    new Response('{}', { status: 503 })]) {
    const { client, calls } = fixture([response])
    await assert.rejects(client.sendText(auth, outgoing), error => {
      assert.ok(['clawbot-invalid-response', 'clawbot-http-error'].includes(error.code)); return true
    })
    assert.equal(calls.length, 1, 'uncertain sends must not be retried')
  }
})

test('external abort interrupts an in-flight body and is never converted to a successful poll', async () => {
  const controller = new AbortController()
  let cancelled = false
  const client = new ILinkClient({ fetch: async () => new Response(new ReadableStream({
    cancel() { cancelled = true },
  })) })
  const pending = client.getUpdates(auth, 'previous', controller.signal)
  await setImmediate()
  controller.abort(new Error('stopped by caller'))
  await assert.rejects(pending, /stopped by caller/)
  assert.equal(cancelled, true)
  const { client: unused, calls } = fixture([])
  await assert.rejects(unused.getQr(controller.signal), /stopped by caller/)
  assert.equal(calls.length, 0)
})

test('timeouts retain the existing longpoll cursor but sends fail without retry', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  let calls = 0
  const client = new ILinkClient({ fetch: async (_url, options) => {
    calls++
    return new Promise((_resolve, reject) => options.signal.addEventListener('abort',
      () => reject(options.signal.reason), { once: true }))
  } })
  const poll = client.getUpdates(auth, 'previous')
  t.mock.timers.tick(35_000)
  assert.deepEqual(await poll, { cursor: 'previous', messages: [] })
  const send = client.sendText(auth, outgoing)
  t.mock.timers.tick(15_000)
  await assert.rejects(send, { code: 'clawbot-timeout' })
  assert.equal(calls, 2)
})
