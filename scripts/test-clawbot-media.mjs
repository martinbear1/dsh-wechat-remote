import test from 'node:test'
import assert from 'node:assert/strict'
import { createCipheriv, createDecipheriv, createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'

// All provider traffic is injected synthetic fetch. No account, profile or CDN.
async function source(name) {
  const result = await build({ entryPoints: [fileURLToPath(new URL(`../src/clawbot/${name}.ts`, import.meta.url))],
    bundle: true, write: false, platform: 'node', format: 'esm', target: 'node22' })
  return import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].contents).toString('base64')}`)
}
const { ILinkClient } = await source('ilink')
const { validateMedia, validatePreparedMedia, MEDIA_MAX_BYTES, MEDIA_MAX_ITEMS } = await source('ilink-media')
const auth = { token: 'synthetic-bot-token', baseUrl: 'https://ilinkai.weixin.qq.com', accountId: 'test@im.bot', userId: 'test@im.wechat' }
const url = 'https://novac2c.cdn.weixin.qq.com/c2c/download?encrypted_query_param=synthetic'
const key = Buffer.alloc(16, 7), rawKey = key.toString('base64'), hexKey = Buffer.from(key.toString('hex')).toString('base64')
const cdn = (patch = {}) => ({ full_url: url, aes_key: rawKey, ...patch })
const image = (patch = {}) => ({ type: 2, image_item: { media: cdn(), ...patch } })
const file = (patch = {}) => ({ type: 4, file_item: { media: cdn(), file_name: 'report.txt', ...patch } })
const voice = (patch = {}) => ({ type: 3, voice_item: { media: cdn(), encode_type: 6, ...patch } })
const video = (patch = {}) => ({ type: 5, video_item: { media: cdn(), ...patch } })
const plain = text => ({ type: 1, text_item: { text } })
function encrypt(data, aes = key) { const cipher = createCipheriv('aes-128-ecb', aes, null); return Buffer.concat([cipher.update(data), cipher.final()]) }
async function normalize(items) {
  let calls = 0
  const client = new ILinkClient({ fetch: async () => { calls++; return Response.json({ msgs: [{ message_id: '1', from_user_id: auth.userId,
    message_type: 1, context_token: 'synthetic-context', item_list: items }], get_updates_buf: 'next' }) } })
  const updates = await client.getUpdates(auth, '')
  assert.equal(calls, 1, 'normalization cannot download before owner/feature checks')
  assert.equal(updates.cursor, 'next'); return updates.messages[0]
}
function downloader(response) {
  const calls = []
  return { calls, client: new ILinkClient({ fetch: async (target, options) => {
    calls.push({ target, options }); assert.equal(options.redirect, 'error'); assert.equal(options.method, 'GET')
    assert.equal(options.headers, undefined, 'no bot token or other authentication sent to CDN')
    return typeof response === 'function' ? response(options) : response
  } }) }
}
const ref = (patch = {}) => ({ kind: 'file', name: 'report.txt', url, aesKey: rawKey, ...patch })

test('native text, emoji and transcribed voice preserve text without downloading raw audio', async () => {
  const item = await normalize([plain('你好 👨‍👩‍👧‍👦 [微笑]'), voice({ text: '微信已转好的语音', media: { full_url: 'https://untrusted.test' } })])
  assert.equal(item.text, '你好 👨‍👩‍👧‍👦 [微笑]\n微信已转好的语音')
  assert.equal(item.media, undefined); assert.equal(item.unsupported, undefined)
})

test('all four native media kinds use original refs; mixed text stays in the same message', async () => {
  const item = await normalize([plain('看一下这些'), image(), file({ len: '123' }), voice(), video()])
  assert.equal(item.text, '看一下这些'); assert.equal(item.unsupported, undefined)
  assert.deepEqual(item.media.map(m => [m.kind, m.name]), [['image', 'image.bin'], ['file', 'report.txt'], ['voice', 'voice.silk'], ['video', 'video.mp4']])
  assert.equal(item.media[1].bytes, 123)
  assert.ok(item.media.every(validateMedia))
})

test('image raw hex AES key wins and provider encrypted query fallback is encoded once', async () => {
  const item = await normalize([image({ aeskey: key.toString('hex'), media: { encrypt_query_param: 'a+b/c==', aes_key: 'invalid-unused-key' } })])
  assert.equal(item.media[0].aesKey, rawKey)
  assert.equal(new URL(item.media[0].url).searchParams.get('encrypted_query_param'), 'a+b/c==')
  assert.equal(item.media[0].url, 'https://novac2c.cdn.weixin.qq.com/c2c/download?encrypted_query_param=a%2Bb%2Fc%3D%3D')
})

test('file and video checksums are normalized; filename is a bounded portable basename', async () => {
  const md5 = 'AA'.repeat(16), item = await normalize([file({ file_name: '..\\folder/report\u0000?.txt', md5 }), video({ video_md5: md5 })])
  assert.equal(item.media[0].name, 'report__.txt'); assert.equal(item.media[0].md5, md5.toLowerCase())
  assert.equal(item.media[1].md5, md5.toLowerCase())
  for (const name of ['CON', 'NUL.txt', '.', '..', '字'.repeat(200) + '.txt']) {
    const result = await normalize([file({ file_name: name })]); assert.ok(validateMedia(result.media[0]))
    assert.ok(Buffer.byteLength(result.media[0].name) <= 240)
  }
})

test('voice encoding is retained without inventing transcription or forcing SILK', async () => {
  const extensions = ['pcm', 'adpcm', 'feature', 'speex', 'amr', 'silk', 'mp3', 'ogg']
  for (let encode_type = 1; encode_type <= 8; encode_type++) {
    const item = await normalize([voice({ encode_type })]); assert.equal(item.text, '')
    assert.equal(item.media[0].name, 'voice.' + extensions[encode_type - 1])
  }
  assert.equal((await normalize([voice({ encode_type: undefined })])).media[0].name, 'voice.bin')
})

test('unknown sticker/tool items and any invalid attachment reject the whole mixed message', async () => {
  for (const extra of [{ type: 6, sticker_item: {} }, { type: 11, tool_call_start_item: {} }, image({ media: {} }),
    file({ media: { full_url: url } }), voice({ text: '', media: {} }), image({ aeskey: 'bad' }),
    file({ len: String(MEDIA_MAX_BYTES + 1) }), file({ md5: 'bad-md5' }), file({ len: '-1' })]) {
    const item = await normalize([plain('do not send this portion alone'), image(), extra])
    assert.equal(item.unsupported, true); assert.ok(item.unsupportedReason); assert.equal(item.media, undefined)
  }
  const tooMany = await normalize(Array.from({ length: MEDIA_MAX_ITEMS + 1 }, () => image()))
  assert.equal(tooMany.unsupported, true); assert.match(tooMany.unsupportedReason, /6/)
  const tooBig = await normalize(Array.from({ length: 4 }, () => file({ len: String(MEDIA_MAX_BYTES) })))
  assert.equal(tooBig.unsupported, true); assert.match(tooBig.unsupportedReason, /30/)
})

test('exact CDN origin/path validation rejects URL and persisted metadata tricks before fetching', async () => {
  for (const target of ['http://novac2c.cdn.weixin.qq.com/c2c/download?x=y', 'https://127.0.0.1/c2c/download?x=y',
    'https://novac2c.cdn.weixin.qq.com.evil.test/c2c/download?x=y', 'https://evil.test/c2c/download?x=y',
    'https://user:pass@novac2c.cdn.weixin.qq.com/c2c/download?x=y', 'https://novac2c.cdn.weixin.qq.com:8443/c2c/download?x=y',
    'https://novac2c.cdn.weixin.qq.com/c2c/upload?x=y', url + '#fragment', url + '\n',
    'https://novac2c.cdn.weixin.qq.com/c2c/../admin?x=y', 'https://novac2c.cdn.weixin.qq.com/c2c/download']) {
    assert.equal((await normalize([image({ media: cdn({ full_url: target }) })])).unsupported, true)
    const { client, calls } = downloader(new Response('never'))
    await assert.rejects(client.downloadMedia(ref({ url: target })), { code: 'clawbot-invalid-input' }); assert.equal(calls.length, 0)
  }
  for (const patch of [{ name: '../escape' }, { name: 'CON' }, { name: 'a\u0000b' }, { name: 'a\u202eb' }, { name: '' }, { bytes: -1 },
    { bytes: MEDIA_MAX_BYTES + 1 }, { bytes: 1.5 }, { aesKey: 'bad' }, { kind: 'sticker' }, { aesKey: undefined }, { md5: 'invalid' }]) {
    assert.equal(validateMedia(ref(patch)), false)
  }
})

test('both official AES key encodings decrypt identically with PKCS7 and no authentication forwarding', async () => {
  const data = Buffer.from('原始文件内容'), md5 = createHash('md5').update(data).digest('hex')
  for (const aesKey of [rawKey, hexKey, rawKey.replace(/=+$/, '')]) {
    const { client, calls } = downloader(new Response(encrypt(data)))
    const result = await client.downloadMedia(ref({ aesKey, bytes: data.length, md5 }))
    assert.deepEqual(result, { name: 'report.txt', data }); assert.equal(calls.length, 1)
  }
})

test('plain images remain supported and real signatures choose the image filename', async () => {
  for (const [hex, ext] of [['89504e470d0a1a0a00000000', 'png'], ['ffd8ffe000000000', 'jpg'],
    ['474946383961000000000000', 'gif'], ['524946460000000057454250', 'webp'], ['424d000000000000', 'bmp']]) {
    const data = Buffer.from(hex, 'hex'), { client } = downloader(new Response(data))
    const result = await client.downloadMedia(ref({ kind: 'image', name: 'image.bin', aesKey: undefined }))
    assert.equal(result.name, 'image.' + ext); assert.deepEqual(result.data, data)
  }
  const item = await normalize([image({ media: { full_url: url } })])
  assert.equal(item.media[0].aesKey, undefined)
})

test('raw voice without encoding hint is named from recognized bytes, not transcoded', async () => {
  for (const [raw, ext] of [['\u0002#!SILK_V3synthetic', 'silk'], ['#!AMR\nsynthetic', 'amr'], ['OggSsynthetic', 'ogg'],
    ['ID3synthetic', 'mp3'], ['RIFF1234WAVEsynthetic', 'wav'], ['unknown encoding', 'bin']]) {
    const data = Buffer.from(raw), { client } = downloader(new Response(encrypt(data)))
    const result = await client.downloadMedia(ref({ kind: 'voice', name: 'voice.bin' }))
    assert.equal(result.name, 'voice.' + ext); assert.deepEqual(result.data, data)
  }
})

test('redirects, failed status, plaintext size and checksum mismatch fail closed without leaking secrets', async () => {
  const data = Buffer.from('test-file'), secret = 'NEVER-LEAK-RESPONSE-BODY'
  for (const response of [Response.redirect('https://evil.test', 302), new Response(secret, { status: 403 }), new Response(secret, { status: 500 })]) {
    const { client, calls } = downloader(response)
    await assert.rejects(client.downloadMedia(ref()), error => !error.message.includes(secret) && !error.message.includes(url))
    assert.equal(calls.length, 1)
  }
  for (const patch of [{ bytes: data.length + 1 }, { md5: '0'.repeat(32) }, { aesKey: Buffer.alloc(16, 3).toString('base64') }]) {
    const { client } = downloader(new Response(encrypt(data)))
    await assert.rejects(client.downloadMedia(ref(patch)), { code: 'clawbot-invalid-response' })
  }
  const { client } = downloader(new Response(Buffer.alloc(0)))
  await assert.rejects(client.downloadMedia(ref({ kind: 'image', aesKey: undefined })), { code: 'clawbot-invalid-response' })
})

test('streaming limit enforces encrypted padding allowance and cap without trusting content-length', async () => {
  for (const response of [new Response('x', { headers: { 'content-length': String(MEDIA_MAX_BYTES + 17) } }),
    new Response('x', { headers: { 'content-length': 'malformed' } }),
    new Response(new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array(MEDIA_MAX_BYTES)); controller.enqueue(new Uint8Array(17)); controller.close() } }))]) {
    const { client } = downloader(response)
    await assert.rejects(client.downloadMedia(ref()), { code: 'clawbot-response-too-large' })
  }
  const data = Buffer.alloc(MEDIA_MAX_BYTES, 3), { client } = downloader(new Response(encrypt(data)))
  assert.equal((await client.downloadMedia(ref({ bytes: data.length }))).data.byteLength, MEDIA_MAX_BYTES)
})

test('caller cancellation interrupts a stalled body; failures are sanitized and never retried', async () => {
  const controller = new AbortController(); let cancelled = false
  const { client, calls } = downloader(new Response(new ReadableStream({ pull() {}, cancel() { cancelled = true } })))
  const pending = client.downloadMedia(ref(), controller.signal)
  await new Promise(setImmediate); controller.abort()
  await assert.rejects(pending, { name: 'AbortError' }); assert.equal(cancelled, true); assert.equal(calls.length, 1)
  const before = downloader(new Response('never'))
  await assert.rejects(before.client.downloadMedia(ref(), AbortSignal.abort()), { name: 'AbortError' }); assert.equal(before.calls.length, 0)
  const network = downloader(() => { throw Error('secret response url and key') })
  await assert.rejects(network.client.downloadMedia(ref()), error => error.code === 'clawbot-network-error' && !error.message.includes('secret'))
  assert.equal(network.calls.length, 1)
})

test('inline quotes are bounded context, never commands, recursive content, or media downloads', async () => {
  const message = await normalize([{ ...plain('解释一下'), ref_msg: { title: '之前的消息', svr_id: '99',
    message_item: { ...plain('/切换 quoted-command'), ref_msg: { message_item: plain('must not recurse') } } } }])
  assert.equal(message.text, '[引用消息]\n之前的消息\n/切换 quoted-command\n[/引用消息]\n解释一下')
  assert.equal(message.unsupported, undefined)
  const unavailable = await normalize([{ ...plain('解释引用'), ref_msg: { svr_id: '99' } }])
  assert.equal(unavailable.text, '[引用消息]\n[引用内容不可用]\n[/引用消息]\n解释引用')
  for (const command of ['/帮助', '/状态', '/回答 old-question 5']) {
    const quotedControl = await normalize([{ ...plain(command), ref_msg: { message_item: plain('旧问题') } }])
    assert.equal(quotedControl.text, command, 'current explicit commands stay controls, including retired answer guidance')
  }
  const quotedImage = await normalize([{ ...plain('看看'), ref_msg: { message_item: image() } }])
  assert.equal(quotedImage.media, undefined); assert.match(quotedImage.text, /\[图片\]/)
  const empty = await normalize([{ ...plain(''), ref_msg: { message_item: plain('must not execute') } }])
  assert.equal(empty.unsupported, true)
  const huge = await normalize([{ ...plain('这条正常'), ref_msg: { title: 'x'.repeat(2048), message_item: plain('x'.repeat(32 * 1024)) } }])
  assert.equal(huge.text, '[引用消息]\n[引用内容不可用]\n[/引用消息]\n这条正常')
})

const uploadUrl = 'https://novac2c.cdn.weixin.qq.com/c2c/upload?encrypted_query_param=synthetic'
const uploadInput = (patch = {}) => ({ userId: auth.userId, kind: 'file', name: 'report.txt', data: Buffer.from('test-file'), ...patch })
const prepared = (patch = {}) => ({ kind: 'file', name: 'report.txt', bytes: 9, cipherBytes: 16,
  query: 'synthetic-download-param', aesKey: hexKey, accountId: auth.accountId, userId: auth.userId, ...patch })
const mediaSend = (media = prepared(), patch = {}) => ({ userId: auth.userId, contextToken: 'captured-context', clientId: 'unique-media-1', media, ...patch })
function uploadFixture(responses) {
  const calls = []
  return { calls, client: new ILinkClient({ fetch: async (target, options) => {
    calls.push({ target, options }); assert.equal(options.redirect, 'error')
    const response = responses.shift(); assert.notEqual(response, undefined, 'unexpected request/retry')
    if (typeof response === 'function') return response(target, options)
    if (response instanceof Error) throw response
    return response instanceof Response ? response : Response.json(response)
  } }) }
}

test('prepare uses native upload enum, plaintext digest, AES-128-ECB padding and bound account snapshot', async () => {
  for (const [kind, mediaType, wireKind] of [['image', 1, 'image'], ['video', 2, 'video'], ['file', 3, 'file'], ['voice', 3, 'file']]) {
    let checks = 0
    const input = uploadInput({ kind }), plainData = Buffer.from(input.data), snapshot = { ...auth }
    const { client, calls } = uploadFixture([
      () => { input.data.fill(0); input.name = 'changed.txt'; snapshot.token = 'changed-token'; snapshot.accountId = 'changed-account'; return Response.json({ upload_param: 'a+b/c==' }) },
      new Response(null, { headers: { 'x-encrypted-param': 'download+param/==' } }),
    ])
    const result = await client.prepareMedia(snapshot, input, undefined, () => { checks++ })
    assert.ok(checks >= 4); assert.equal(calls.length, 2)
    assert.equal(calls[0].target, auth.baseUrl + '/ilink/bot/getuploadurl')
    assert.equal(calls[0].options.headers.Authorization, 'Bearer ' + auth.token)
    const request = JSON.parse(calls[0].options.body)
    assert.equal(request.media_type, mediaType); assert.equal(request.to_user_id, auth.userId)
    assert.equal(request.rawsize, plainData.length); assert.equal(request.rawfilemd5, createHash('md5').update(plainData).digest('hex'))
    assert.equal(request.filesize, 16); assert.equal(request.no_need_thumb, true)
    assert.match(request.filekey, /^[a-f0-9]{32}$/); assert.match(request.aeskey, /^[a-f0-9]{32}$/)
    assert.equal(request.base_info.channel_version, '2.4.9')
    const url = new URL(calls[1].target)
    assert.equal(url.origin + url.pathname, 'https://novac2c.cdn.weixin.qq.com/c2c/upload')
    assert.equal(url.searchParams.get('encrypted_query_param'), 'a+b/c=='); assert.equal(url.searchParams.get('filekey'), request.filekey)
    assert.deepEqual(calls[1].options.headers, { 'Content-Type': 'application/octet-stream' })
    assert.equal(calls[1].options.method, 'POST'); assert.equal(calls[1].options.body.byteLength, 16)
    const decipher = createDecipheriv('aes-128-ecb', Buffer.from(request.aeskey, 'hex'), null)
    assert.deepEqual(Buffer.concat([decipher.update(calls[1].options.body), decipher.final()]), plainData)
    assert.deepEqual(result, { kind: wireKind, name: 'report.txt', bytes: 9, cipherBytes: 16, query: 'download+param/==',
      aesKey: Buffer.from(request.aeskey).toString('base64'), accountId: auth.accountId, userId: auth.userId })
    assert.ok(validatePreparedMedia(result))
  }
})

test('prepare validates recipient and bounded data before network, preserving the safe basename', async () => {
  for (const patch of [{ kind: 'sticker' }, { data: 'not bytes' }, { data: new Uint8Array(0) }, { data: new Uint8Array(MEDIA_MAX_BYTES + 1) },
    { userId: 'other@im.wechat' }, { userId: 'group@chatroom' }, { name: '' }]) {
    const { client, calls } = uploadFixture([])
    await assert.rejects(client.prepareMedia(auth, uploadInput(patch)))
    assert.equal(calls.length, 0)
  }
  const { client } = uploadFixture([{ upload_full_url: uploadUrl }, new Response(null, { headers: { 'x-encrypted-param': 'download' } })])
  assert.equal((await client.prepareMedia(auth, uploadInput({ name: '../NUL.txt' }))).name, '_NUL.txt')
})

test('full upload URL wins but any nonofficial target fails before the CDN request', async () => {
  const good = uploadFixture([{ upload_full_url: uploadUrl, upload_param: 'ignored' }, new Response(null, { headers: { 'x-encrypted-param': 'download' } })])
  await good.client.prepareMedia(auth, uploadInput()); assert.equal(good.calls[1].target, uploadUrl)
  for (const target of ['https://evil.test/upload?x=y', 'http://novac2c.cdn.weixin.qq.com/c2c/upload?x=y',
    'https://novac2c.cdn.weixin.qq.com.evil.test/c2c/upload?x=y', 'https://novac2c.cdn.weixin.qq.com/c2c/download?x=y',
    'https://user:pass@novac2c.cdn.weixin.qq.com/c2c/upload?x=y', 'https://novac2c.cdn.weixin.qq.com:8443/c2c/upload?x=y',
    uploadUrl + '#fragment', uploadUrl + '\n']) {
    const { client, calls } = uploadFixture([{ upload_full_url: target, upload_param: 'must-not-fallback' }])
    await assert.rejects(client.prepareMedia(auth, uploadInput())); assert.equal(calls.length, 1)
  }
  for (const info of [{}, { upload_param: '' }, { upload_param: 'x'.repeat(4097) }, { upload_param: 'x\n' }]) {
    const { client, calls } = uploadFixture([info])
    await assert.rejects(client.prepareMedia(auth, uploadInput()), { code: 'clawbot-invalid-response' }); assert.equal(calls.length, 1)
  }
})

test('pause or revocation checkpoints prevent every next upload stage and do not swallow the caller error', async () => {
  for (const after of [0, 1, 2]) {
    const stop = Error('synthetic-runtime-revoked'), { client, calls } = uploadFixture([
      { upload_full_url: uploadUrl }, new Response(null, { headers: { 'x-encrypted-param': 'download' } }),
    ])
    await assert.rejects(client.prepareMedia(auth, uploadInput(), undefined, () => { if (calls.length === after) throw stop }), error => error === stop)
    assert.equal(calls.length, after)
  }
  const controller = new AbortController(), { client, calls } = uploadFixture([
    () => { controller.abort(); return Response.json({ upload_full_url: uploadUrl }) },
  ])
  await assert.rejects(client.prepareMedia(auth, uploadInput(), controller.signal), { name: 'AbortError' }); assert.equal(calls.length, 1)
})

test('upload rejects redirects, non-200, missing result and uncertain network results without retry or secret exposure', async () => {
  for (const response of [Response.redirect('https://evil.test', 302), new Response('SECRET', { status: 201 }),
    new Response('SECRET', { status: 403 }), new Response('SECRET', { status: 500 }), new Response('SECRET'),
    new Response(null, { headers: { 'x-encrypted-param': 'x'.repeat(4097) } }), Error('SECRET-token-or-upload-url')]) {
    const { client, calls } = uploadFixture([{ upload_full_url: uploadUrl }, response])
    await assert.rejects(client.prepareMedia(auth, uploadInput()), error => !error.message.includes('SECRET') && !error.message.includes(uploadUrl))
    assert.equal(calls.length, 2, 'never retry a failed or uncertain upload')
  }
})

test('uploaded reference validation enforces canonical encryption, bounds and portable names', () => {
  assert.ok(validatePreparedMedia(prepared()))
  for (const patch of [{ kind: 'voice' }, { bytes: 0 }, { bytes: 1.5 }, { bytes: MEDIA_MAX_BYTES + 1 }, { cipherBytes: 15 },
    { cipherBytes: 32 }, { query: '' }, { query: 'x'.repeat(4097) }, { query: 'x y' }, { aesKey: rawKey }, { aesKey: 'invalid' },
    { name: '../report.txt' }, { name: 'NUL' }, { accountId: '' }, { accountId: 'x'.repeat(257) }, { userId: 'not-private' }]) {
    assert.equal(validatePreparedMedia(prepared(patch)), false, JSON.stringify(patch))
  }
})

test('sendMedia makes one native media item with fixed context and no hidden caption or upload', async () => {
  for (const [kind, type, field] of [['image', 2, 'image_item'], ['video', 5, 'video_item'], ['file', 4, 'file_item']]) {
    const { client, calls } = uploadFixture([{}])
    await client.sendMedia(auth, mediaSend(prepared({ kind })))
    assert.equal(calls.length, 1); assert.equal(calls[0].target, auth.baseUrl + '/ilink/bot/sendmessage')
    const { msg } = JSON.parse(calls[0].options.body)
    assert.equal(msg.context_token, 'captured-context'); assert.equal(msg.to_user_id, auth.userId)
    assert.equal(msg.from_user_id, ''); assert.equal(msg.client_id, 'unique-media-1')
    assert.equal(msg.message_type, 2); assert.equal(msg.message_state, 2); assert.equal(msg.item_list.length, 1)
    const item = msg.item_list[0]; assert.equal(item.type, type)
    assert.deepEqual(item[field].media, { encrypt_query_param: 'synthetic-download-param', aes_key: hexKey, encrypt_type: 1 })
    if (kind === 'image') assert.equal(item[field].mid_size, 16)
    if (kind === 'video') assert.equal(item[field].video_size, 16)
    if (kind === 'file') { assert.equal(item[field].file_name, 'report.txt'); assert.equal(item[field].len, '9') }
  }
})

test('sendMedia rejects cross-account/recipient refs before writing; ambiguous send is never retried', async () => {
  for (const input of [mediaSend(prepared({ accountId: 'another-bot' })), mediaSend(prepared({ userId: 'other@im.wechat' })),
    mediaSend(prepared(), { contextToken: '' }), mediaSend(prepared(), { userId: 'other@im.wechat' }),
    mediaSend(prepared(), { clientId: '' }), mediaSend(prepared({ query: '' }))]) {
    const { client, calls } = uploadFixture([])
    await assert.rejects(client.sendMedia(auth, input), { code: 'clawbot-invalid-input' }); assert.equal(calls.length, 0)
  }
  const { client, calls } = uploadFixture([Error('SECRET-network-uncertain')])
  await assert.rejects(client.sendMedia(auth, mediaSend()), error => error.code === 'clawbot-network-error' && !error.message.includes('SECRET'))
  assert.equal(calls.length, 1)
})

test('long media filenames retain their extension within the UTF8 filename budget', async () => {
  const { client } = uploadFixture([{ upload_full_url: uploadUrl }, new Response(null, { headers: { 'x-encrypted-param': 'download' } })])
  const result = await client.prepareMedia(auth, { ...uploadInput(), name: '报'.repeat(150) + '.pdf' })
  assert.ok(result.name.endsWith('.pdf')); assert.ok(Buffer.byteLength(result.name) <= 240)
  assert.ok(validatePreparedMedia(result))
})
