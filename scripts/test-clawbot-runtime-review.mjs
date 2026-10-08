// Independent regression contracts. Synthetic state, host and HTTP clients only.
import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { setImmediate } from 'node:timers/promises'
import { build } from 'esbuild'

async function sourceModule(name) {
  const compiled = await build({ entryPoints: [fileURLToPath(new URL(`../src/clawbot/${name}.ts`, import.meta.url))],
    platform: 'node', format: 'esm', target: 'node22', bundle: true, write: false,
    banner: { js: `import { createRequire } from 'node:module'; const require = createRequire(${JSON.stringify(import.meta.url)});` } })
  return import(`data:text/javascript;base64,${Buffer.from(compiled.outputFiles[0].contents).toString('base64')}`)
}
const { ClawbotRuntime } = await sourceModule('runtime')
const { FileClawbotStorage, emptyClawbotData } = await sourceModule('storage')
const auth = { token: 'synthetic-token', baseUrl: 'https://ilinkai.weixin.qq.com', accountId: 'test@im.bot', userId: 'test@im.wechat' }
const sessions = [{ id: 'session-a', title: 'A', generation: 101 }, { id: 'session-b', title: 'B', generation: 102 }]
const signal = () => new AbortController().signal
const incoming = (id, text) => ({ id, text, userId: auth.userId, contextToken: 'synthetic-context' })
const seed = (patch = {}) => ({ ...emptyClawbotData(), credentials: auth, target: sessions[0], ...patch })
const receipt = (id, state = 'pending', patch = {}) => ({
  id: createHash('sha256').update(id).digest('hex'), userId: auth.userId, contextToken: 'synthetic-context',
  input: 'hello', target: sessions[0], revision: 0, createdAt: Date.now(), state, ...patch,
})
function deferred() {
  let resolve, reject
  const promise = new Promise((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}
function memory(data = seed()) {
  return { data: structuredClone(data), fail: false,
    read() { return structuredClone(this.data) },
    write(next) { if (this.fail) throw new Error('synthetic disk failure'); this.data = structuredClone(next) },
    close() {},
  }
}
function blockedPoll(_auth, _cursor, abort) {
  return new Promise((_resolve, reject) => {
    if (abort.aborted) reject(abort.reason)
    else abort.addEventListener('abort', () => reject(abort.reason), { once: true })
  })
}
function client(patch = {}) {
  return { getUpdates: blockedPoll, async sendText() {}, ...patch }
}
function host(run = async () => ({ text: 'reply' })) {
  return { async listSessions() { return sessions }, async describeSession(id) { return sessions.find(item => item.id === id) }, run }
}
async function enabled(runtime, value) {
  return runtime.control({ action: 'enabled', expectedRevision: runtime.snapshot().revision, enabled: value }, signal())
}
function temporaryStore() {
  const directory = mkdtempSync(path.join(tmpdir(), 'clawbot-review-'))
  const storage = new FileClawbotStorage(directory)
  return { directory, storage, close() { storage.close(); rmSync(directory, { recursive: true, force: true }) } }
}

test('safety: failed durable ingest cannot advance memory or disk cursor', async () => {
  const storage = memory(seed({ cursor: 'old' })), runtime = new ClawbotRuntime(storage, host(), client())
  try {
    storage.fail = true
    assert.throws(() => runtime.ingest([incoming('1', 'first')], 'new'), /synthetic disk failure/)
    assert.equal(storage.data.cursor, 'old')
    assert.equal(runtime.snapshot().pending, 0)
    storage.fail = false
    runtime.ingest([incoming('1', 'first'), incoming('2', 'second')], 'new')
    assert.equal(storage.data.cursor, 'new')
    assert.equal(storage.data.receipts.length, 2)
    runtime.ingest([incoming('1', 'first')], 'newer')
    assert.equal(storage.data.receipts.length, 2)
  } finally { await runtime.dispose() }
})

test('safety: interrupted dispatch and uncertain delivery do not automatically replay', async () => {
  let submitted = 0, sent = 0
  const storage = memory(seed({ enabled: true, receipts: [receipt('1', 'running'), receipt('2', 'sending')] }))
  const runtime = new ClawbotRuntime(storage, host(async () => { submitted++; return { text: 'reply' } }),
    client({ async sendText() { sent++ } }))
  try {
    await setImmediate()
    assert.equal(runtime.snapshot().uncertain, 2)
    assert.equal(submitted, 0)
    assert.equal(sent, 0)
    assert.ok(storage.data.receipts.every(item => item.input === '' && item.contextToken === ''))
  } finally { await runtime.dispose() }
})

test('safety: pausing a run keeps its result; resuming sends it without resubmitting', async () => {
  const run = deferred(), storage = memory(), sent = []
  let submitted = 0
  const runtime = new ClawbotRuntime(storage, host(async () => { submitted++; return run.promise }),
    client({ async sendText(_auth, message) { sent.push(message) } }))
  try {
    runtime.ingest([incoming('1', 'work')], 'cursor')
    await enabled(runtime, true)
    await setImmediate()
    assert.equal(submitted, 1)
    await enabled(runtime, false)
    run.resolve({ text: 'finished while paused' })
    await setImmediate()
    assert.equal(storage.data.receipts[0].state, 'ready')
    assert.equal(sent.length, 0)
    await enabled(runtime, true)
    await setImmediate()
    assert.equal(submitted, 1)
    assert.equal(sent.length, 1)
    assert.equal(storage.data.receipts[0].state, 'done')
  } finally { run.resolve({ text: 'cleanup' }); await runtime.dispose() }
})

test('expired auth can be repaired while retaining the accepted run and same-account cursor', async () => {
  const run = deferred(), storage = memory(), sent = []
  let submitted = 0
  const refreshed = { ...auth, token: 'refreshed-token' }
  const runtime = new ClawbotRuntime(storage, host(() => { submitted++; return run.promise }), client({
    getUpdates(credentials, cursor, abort) {
      if (credentials.token === auth.token) return Promise.reject(Object.assign(new Error('expired'), { code: 'clawbot-auth-expired' }))
      return blockedPoll(credentials, cursor, abort)
    },
    async getQr() { return { qrcode: 'test-qr', url: 'https://liteapp.weixin.qq.com/q/test-only' } },
    async pollQr() { return { status: 'confirmed', credentials: refreshed } },
    async sendText(_auth, message) { sent.push(message) },
  }))
  try {
    runtime.ingest([incoming('1', 'work')], 'cursor')
    await enabled(runtime, true)
    await setImmediate()
    run.resolve({ text: 'completed' })
    await setImmediate()
    assert.equal(runtime.snapshot().enabled, false)
    assert.equal(storage.data.receipts[0].state, 'ready')
    const started = await runtime.control({ action: 'login.start' }, signal())
    await runtime.control({ action: 'login.poll', loginId: started.pairing.id }, signal())
    assert.equal(storage.data.credentials.token, refreshed.token)
    assert.equal(storage.data.cursor, 'cursor')
    assert.equal(storage.data.receipts.length, 1)
    assert.equal(storage.data.receipts[0].state, 'ready')
    await enabled(runtime, true)
    await setImmediate()
    assert.equal(submitted, 1)
    assert.equal(sent.length, 1)
    assert.equal(storage.data.receipts[0].state, 'done')
  } finally { run.resolve({ text: 'cleanup' }); await runtime.dispose() }
})

test('an over-budget queue is rejected before replacing the last readable state', () => {
  const fixture = temporaryStore()
  try {
    const data = seed({ receipts: Array.from({ length: 700 }, (_unused, index) =>
      receipt(String(index), 'pending', { input: '中'.repeat(8000) })) })
    fixture.storage.write(seed({ cursor: 'old-cursor' }))
    assert.throws(() => fixture.storage.write(data), { code: 'clawbot-capacity' })
    assert.equal(fixture.storage.read().cursor, 'old-cursor')
  } finally { fixture.close() }
})

test('storage refuses empty parts and invalid send offsets that cannot make progress', () => {
  const fixture = temporaryStore()
  try {
    for (const patch of [{ parts: [] }, { parts: ['hello'], sentParts: 1 },
      { parts: ['hello'], sentParts: -1 }, { parts: ['hello'], sentParts: 0.5 }, { sentParts: 5 }]) {
      const data = seed({ enabled: true, receipts: [receipt('1', 'ready', { ...patch, output: 'hello' })] })
      assert.throws(() => fixture.storage.write(data), { code: 'clawbot-storage-invalid' })
      writeFileSync(path.join(fixture.directory, 'state.json'), JSON.stringify(data))
      assert.throws(() => fixture.storage.read(), { code: 'clawbot-storage-invalid' })
    }
  } finally { fixture.close() }
})

test('a received slash route command works during a slow run without changing its captured target', async () => {
  const run = deferred(), update = deferred(), storage = memory(), sent = []
  let polled = false
  const runtime = new ClawbotRuntime(storage, host(() => run.promise),
    client({
      getUpdates(auth, cursor, abort) { if (!polled) { polled = true; return update.promise }; return blockedPoll(auth, cursor, abort) },
      async sendText(_auth, message) { sent.push(message) },
    }))
  try {
    runtime.ingest([incoming('1', 'slow work')], 'first')
    await enabled(runtime, true)
    await setImmediate()
    const target = createHash('sha256').update(sessions[1].id).digest('hex').slice(0, 8)
    update.resolve({ messages: [incoming('2', `/切换 ${target}`)], cursor: 'second' })
    await setImmediate()
    assert.equal(runtime.snapshot().target.id, sessions[1].id)
    assert.equal(storage.data.receipts[0].target.id, sessions[0].id)
    assert.equal(sent.length, 1)
    assert.match(sent[0].text, /B/)
    run.resolve({ text: 'finished' })
    await setImmediate()
    assert.equal(runtime.snapshot().target.id, sessions[1].id)
  } finally { run.resolve({ text: 'cleanup' }); update.resolve({ messages: [], cursor: '' }); await runtime.dispose() }
})

test('disconnect requires explicit abandonment, retains dedupe, and cannot revive late native results', async () => {
  const run = deferred(), storage = memory(), sent = []
  const runtime = new ClawbotRuntime(storage, host(() => run.promise), client({
    async getQr() { return { qrcode: 'test-qr', url: 'https://liteapp.weixin.qq.com/q/test-only' } },
    async pollQr() { return { status: 'confirmed', credentials: auth } },
    async sendText(_auth, message) { sent.push(message) },
  }))
  try {
    runtime.ingest([incoming('1', 'work')], 'before-disconnect')
    await enabled(runtime, true); await setImmediate(); await enabled(runtime, false)
    const revision = runtime.snapshot().revision
    await assert.rejects(runtime.control({ action: 'disconnect', expectedRevision: revision }, signal()), { code: 'clawbot-pending' })
    assert.equal(runtime.snapshot().paired, true)
    await runtime.control({ action: 'disconnect', expectedRevision: revision, abandonPending: true }, signal())
    assert.equal(runtime.snapshot().paired, false)
    assert.equal(storage.data.receipts[0].state, 'uncertain')
    assert.equal(storage.data.receipts[0].input, '')
    const login = await runtime.control({ action: 'login.start' }, signal())
    await runtime.control({ action: 'login.poll', loginId: login.pairing.id }, signal())
    runtime.ingest([incoming('1', 'work')], 'replayed-provider-cursor')
    assert.equal(storage.data.receipts.length, 1)
    await runtime.control({ action: 'route', expectedRevision: runtime.snapshot().revision, sessionId: sessions[0].id }, signal())
    await enabled(runtime, true)
    run.resolve({ text: 'must stay in DSH' }); await setImmediate()
    assert.equal(sent.length, 0)
    assert.equal(storage.data.receipts[0].state, 'uncertain')
  } finally { run.resolve({ text: 'cleanup' }); await runtime.dispose() }
})

test('explicit verification replaces a status-only longpoll and is never silently swallowed', async () => {
  let sentCode, aborted = false
  const runtime = new ClawbotRuntime(memory(seed({ credentials: null })), host(), client({
    async getQr() { return { qrcode: 'qr', url: 'https://liteapp.weixin.qq.com/q/test-only' } },
    async pollQr(_qr, abort, code) {
      if (code !== undefined) { sentCode = code; return { status: 'confirmed', credentials: auth } }
      return new Promise((_resolve, reject) => abort.addEventListener('abort', () => { aborted = true; reject(abort.reason) }, { once: true }))
    },
  }))
  try {
    const login = await runtime.control({ action: 'login.start' }, signal())
    const waiting = runtime.control({ action: 'login.poll', loginId: login.pairing.id }, signal())
    const rejected = assert.rejects(waiting)
    const confirmed = await runtime.control({ action: 'login.poll', loginId: login.pairing.id, verifyCode: '123456' }, signal())
    await rejected
    assert.equal(aborted, true)
    assert.equal(sentCode, '123456')
    assert.equal(confirmed.paired, true)
  } finally { await runtime.dispose() }
})

test('pairing cancellation aborts an outstanding native QR longpoll promptly', async () => {
  const poll = deferred()
  const runtime = new ClawbotRuntime(memory(emptyClawbotData()), host(), client({
    async getQr() { return { qrcode: 'test-qr', url: 'https://liteapp.weixin.qq.com/q/test-only' } },
    async pollQr(_qrcode, abort) {
      abort.addEventListener('abort', () => poll.reject(abort.reason), { once: true })
      return poll.promise
    },
  }))
  try {
    const started = await runtime.control({ action: 'login.start' }, signal())
    const waiting = runtime.control({ action: 'login.poll', loginId: started.pairing.id }, signal())
      .then(value => ({ value }), error => ({ error }))
    await setImmediate()
    let cancelled = false
    const cancellation = runtime.control({ action: 'login.cancel', loginId: started.pairing.id }, signal())
      .then(() => { cancelled = true })
    await setImmediate()
    assert.equal(cancelled, true)
    await Promise.all([waiting, cancellation])
    assert.equal(cancelled, true)
  } finally { poll.resolve({ status: 'wait' }); await runtime.dispose() }
})

test('changing account cannot silently discard pending work; explicit disconnect seals late results', async () => {
  const run = deferred(), storage = memory(), sent = []
  const newAuth = { ...auth, accountId: 'new-bot@im.bot', token: 'new-account-token' }
  const runtime = new ClawbotRuntime(storage, host(() => run.promise), client({
    async getQr() { return { qrcode: 'test-qr', url: 'https://liteapp.weixin.qq.com/q/test-only' } },
    async pollQr() { return { status: 'confirmed', credentials: newAuth } },
    async sendText(credentials, message) { sent.push({ credentials, message }) },
  }))
  try {
    runtime.ingest([incoming('1', 'old account task')], 'old-cursor')
    await enabled(runtime, true)
    await setImmediate()
    assert.equal(storage.data.receipts[0].state, 'running')
    await enabled(runtime, false)
    const started = await runtime.control({ action: 'login.start' }, signal())
    await assert.rejects(runtime.control({ action: 'login.poll', loginId: started.pairing.id }, signal()), { code: 'clawbot-pending' })
    assert.equal(storage.data.credentials.accountId, auth.accountId)
    assert.equal(storage.data.receipts[0].state, 'running')
    assert.equal(storage.data.cursor, 'old-cursor')
    await runtime.control({ action: 'disconnect', expectedRevision: runtime.snapshot().revision, abandonPending: true }, signal())
    const replacement = await runtime.control({ action: 'login.start' }, signal())
    await runtime.control({ action: 'login.poll', loginId: replacement.pairing.id }, signal())
    assert.equal(storage.data.credentials.accountId, newAuth.accountId)
    assert.equal(storage.data.cursor, '')
    assert.equal(storage.data.receipts[0].state, 'uncertain')
    run.resolve({ text: 'old account output' })
    await setImmediate()
    assert.equal(storage.data.receipts[0].state, 'uncertain', 'late completion must not overwrite the sealed state')
    await runtime.control({ action: 'route', expectedRevision: runtime.snapshot().revision, sessionId: sessions[1].id }, signal())
    await enabled(runtime, true)
    await setImmediate()
    assert.equal(sent.length, 0)
  } finally { run.resolve({ text: 'cleanup' }); await runtime.dispose() }
})

test('unpaired enable is rejected and legacy enabled-unpaired state can pair directly', async () => {
  let qrCalls = 0
  const storage = memory(emptyClawbotData())
  const runtime = new ClawbotRuntime(storage, host(), client({
    async getQr() { qrCalls++; return { qrcode: 'qr', url: 'https://liteapp.weixin.qq.com/q/test-only' } },
    async pollQr() { return { status: 'confirmed', credentials: auth } },
  }))
  try {
    await assert.rejects(enabled(runtime, true), { code: 'clawbot-unpaired' })
    assert.equal(storage.data.enabled, false)
    const start = await runtime.control({ action: 'login.start', expectedRevision: 0 }, signal())
    const reused = await runtime.control({ action: 'login.start' }, signal())
    assert.equal(start.pairing.id, reused.pairing.id)
    assert.equal(start.revision, reused.revision)
    assert.equal(qrCalls, 1)
    const finish = await runtime.control({ action: 'login.poll', loginId: start.pairing.id }, signal())
    assert.equal(finish.paired, true)
    assert.equal(finish.bindingState, 'paired')
    assert.equal(finish.enabled, false, 'confirmation is not permission to start receiving')
    await assert.rejects(enabled(runtime, true), { code: 'clawbot-target-required' })
    assert.equal(finish.revision > start.revision, true)
  } finally { await runtime.dispose() }
  const legacy = memory({ ...emptyClawbotData(), enabled: true })
  const repaired = new ClawbotRuntime(legacy, host(), client({
    async getQr() { return { qrcode: 'qr2', url: 'https://liteapp.weixin.qq.com/q/test-only' } },
  }))
  try {
    const result = await repaired.control({ action: 'login.start' }, signal())
    assert.equal(result.enabled, false)
    assert.equal(result.pairing.status, 'wait')
    assert.equal(legacy.data.enabled, false)
  } finally { await repaired.dispose() }
})

test('shared pairing expiry, terminal regeneration and precise cancellation advance revision', async () => {
  let now = 1000, qrCalls = 0, pollCalls = 0
  const forgotten = []
  const runtime = new ClawbotRuntime(memory(emptyClawbotData()), host(), client({
    async getQr() { return { qrcode: `qr-${++qrCalls}`, url: 'https://liteapp.weixin.qq.com/q/test-only' } },
    async pollQr() { pollCalls++; return { status: 'scaned', message: '请确认' } },
    forgetQr(qr) { forgotten.push(qr) },
  }), () => now)
  try {
    const [first, second] = await Promise.all([
      runtime.control({ action: 'login.start' }, signal()), runtime.control({ action: 'login.start' }, signal()),
    ])
    assert.equal(first.pairing.id, second.pairing.id)
    assert.equal(qrCalls, 1)
    assert.equal(first.pairing.expiresAt, now + 300000)
    const scanned = await runtime.control({ action: 'login.poll', loginId: first.pairing.id }, signal())
    assert.ok(scanned.revision > first.revision)
    now = first.pairing.expiresAt
    const expired = runtime.snapshot()
    assert.equal(expired.pairing.status, 'expired')
    assert.equal(expired.pairing.url, '')
    assert.equal(expired.pairing.qrDataUrl, '')
    assert.ok(expired.revision > scanned.revision)
    await runtime.control({ action: 'login.poll', loginId: first.pairing.id }, signal())
    assert.equal(pollCalls, 1, 'an expired local attempt never calls the provider again')
    const replacement = await runtime.control({ action: 'login.start' }, signal())
    assert.notEqual(replacement.pairing.id, first.pairing.id)
    assert.ok(replacement.revision > expired.revision)
    await assert.rejects(runtime.control({ action: 'login.cancel', loginId: first.pairing.id }, signal()), { code: 'clawbot-login-stale' })
    await assert.rejects(runtime.control({ action: 'login.cancel' }, signal()), { code: 'clawbot-login-stale' })
    const cancel = await runtime.control({ action: 'login.cancel', loginId: replacement.pairing.id }, signal())
    assert.equal(cancel.pairing, undefined)
    assert.ok(cancel.revision > replacement.revision)
    assert.ok(forgotten.includes('qr-1'))
    assert.ok(forgotten.includes('qr-2'))
  } finally { await runtime.dispose() }
})

test('pairing cannot replace a running identity and rejects stale mutation revisions', async () => {
  let qrCalls = 0
  const storage = memory(seed({ enabled: true }))
  const runtime = new ClawbotRuntime(storage, host(), client({
    async getQr() { qrCalls++; return { qrcode: 'qr', url: 'https://liteapp.weixin.qq.com/q/test-only' } },
  }))
  try {
    await assert.rejects(runtime.control({ action: 'login.start' }, signal()), { code: 'clawbot-busy' })
    await enabled(runtime, false)
    await assert.rejects(runtime.control({ action: 'login.start', expectedRevision: 0 }, signal()), { code: 'clawbot-conflict' })
    assert.equal(qrCalls, 0)
    assert.deepEqual(storage.data.credentials, auth)
  } finally { await runtime.dispose() }
})

test('expired credentials stay distinguishable across restarts and are not offered as a reusable binding', async () => {
  const storage = memory(seed({ enabled: true }))
  const runtime = new ClawbotRuntime(storage, host(), client({
    async getUpdates() { throw Object.assign(new Error('expired'), { code: 'clawbot-auth-expired' }) },
  }))
  await setImmediate()
  assert.equal(runtime.snapshot().bindingState, 'expired')
  assert.equal(storage.data.enabled, false)
  await runtime.dispose()
  let providedTokens
  const restarted = new ClawbotRuntime(storage, host(), client({
    async getQr(_signal, tokens) { providedTokens = tokens; return { qrcode: 'qr', url: 'https://liteapp.weixin.qq.com/q/test-only' } },
    async pollQr() { return { status: 'confirmed', credentials: { ...auth, token: 'refreshed-token' } } },
  }))
  try {
    assert.equal(restarted.snapshot().bindingState, 'expired')
    await assert.rejects(enabled(restarted, true), { code: 'clawbot-auth-expired' })
    const start = await restarted.control({ action: 'login.start' }, signal())
    assert.deepEqual(providedTokens, [])
    const recovered = await restarted.control({ action: 'login.poll', loginId: start.pairing.id }, signal())
    assert.equal(recovered.bindingState, 'paired')
    assert.equal(storage.data.authExpired, false)
    assert.equal(recovered.enabled, false)
  } finally { await restarted.dispose() }
})

test('late confirmation past the shared deadline never installs credentials', async () => {
  let now = 1000
  const qrPoll = deferred(), storage = memory(emptyClawbotData())
  const runtime = new ClawbotRuntime(storage, host(), client({
    async getQr() { return { qrcode: 'qr', url: 'https://liteapp.weixin.qq.com/q/test-only' } },
    async pollQr() { return qrPoll.promise },
  }), () => now)
  try {
    const start = await runtime.control({ action: 'login.start' }, signal())
    const waiting = runtime.control({ action: 'login.poll', loginId: start.pairing.id }, signal())
    now = start.pairing.expiresAt
    qrPoll.resolve({ status: 'confirmed', credentials: auth })
    const finished = await waiting
    assert.equal(finished.paired, false)
    assert.equal(finished.pairing.status, 'expired')
    assert.equal(finished.pairing.url, '')
    assert.equal(storage.data.credentials, null)
  } finally { qrPoll.resolve({ status: 'wait' }); await runtime.dispose() }
})

test('late cancelled confirmation cannot replace the next attempt or install an identity', async () => {
  const oldPoll = deferred(), storage = memory(emptyClawbotData())
  let qrCalls = 0
  const runtime = new ClawbotRuntime(storage, host(), client({
    async getQr() { return { qrcode: `qr-${++qrCalls}`, url: 'https://liteapp.weixin.qq.com/q/test-only' } },
    async pollQr() { return oldPoll.promise },
  }))
  try {
    const first = await runtime.control({ action: 'login.start' }, signal())
    const waiting = runtime.control({ action: 'login.poll', loginId: first.pairing.id }, signal())
    const rejected = assert.rejects(waiting)
    await runtime.control({ action: 'login.cancel', loginId: first.pairing.id }, signal())
    const next = await runtime.control({ action: 'login.start' }, signal())
    oldPoll.resolve({ status: 'confirmed', credentials: auth })
    await rejected
    assert.equal(runtime.snapshot().pairing.id, next.pairing.id)
    assert.equal(runtime.snapshot().paired, false)
    assert.equal(storage.data.credentials, null)
  } finally { oldPoll.resolve({ status: 'wait' }); await runtime.dispose() }
})

test('terminal QR regeneration failure preserves a monotonic expired snapshot', async () => {
  let now = 1000, qrCalls = 0
  const runtime = new ClawbotRuntime(memory(emptyClawbotData()), host(), client({
    async getQr() {
      if (++qrCalls > 1) throw new Error('synthetic network outage')
      return { qrcode: 'qr', url: 'https://liteapp.weixin.qq.com/q/test-only' }
    },
  }), () => now)
  try {
    const first = await runtime.control({ action: 'login.start' }, signal())
    now = first.pairing.expiresAt
    const expired = runtime.snapshot()
    await assert.rejects(runtime.control({ action: 'login.start' }, signal()), /synthetic network outage/)
    assert.deepEqual(runtime.snapshot(), expired)
  } finally { await runtime.dispose() }
})

test('send-side credential rejection pauses both receive and delivery without resending or dropping the queue', async () => {
  let sent = 0
  const storage = memory(seed({ receipts: [receipt('1', 'ready', { input: '', output: 'first' }), receipt('2', 'ready', { input: '', output: 'second' })] }))
  const runtime = new ClawbotRuntime(storage, host(), client({
    async sendText() { sent++; throw Object.assign(new Error('expired'), { code: 'clawbot-auth-expired' }) },
  }))
  try {
    await enabled(runtime, true)
    await setImmediate()
    assert.equal(sent, 1)
    assert.equal(runtime.snapshot().enabled, false)
    assert.equal(runtime.snapshot().bindingState, 'expired')
    assert.equal(storage.data.receipts[0].state, 'uncertain')
    assert.equal(storage.data.receipts[1].state, 'ready')
    assert.equal(storage.data.receipts[1].output, 'second')
    assert.deepEqual(storage.data.credentials, auth)
  } finally { await runtime.dispose() }
})

test('an old in-flight send cannot expire a newly confirmed same-account credential', async () => {
  const oldSend = deferred(), storage = memory(seed({ receipts: [
    receipt('1', 'ready', { input: '', output: 'old token output' }),
    receipt('2', 'ready', { input: '', output: 'next output' }),
  ] })), sentTokens = []
  const refreshed = { ...auth, token: 'synthetic-refreshed-token' }
  const runtime = new ClawbotRuntime(storage, host(), client({
    async getQr() { return { qrcode: 'qr', url: 'https://liteapp.weixin.qq.com/q/test-only' } },
    async pollQr() { return { status: 'confirmed', credentials: refreshed } },
    async sendText(credentials) {
      sentTokens.push(credentials.token)
      if (credentials.token === auth.token) return oldSend.promise
    },
  }))
  try {
    await enabled(runtime, true); await setImmediate()
    assert.equal(storage.data.receipts[0].state, 'sending')
    await enabled(runtime, false)
    const start = await runtime.control({ action: 'login.start' }, signal())
    await runtime.control({ action: 'login.poll', loginId: start.pairing.id }, signal())
    await enabled(runtime, true)
    oldSend.reject(Object.assign(new Error('old token expired'), { code: 'clawbot-auth-expired' }))
    await setImmediate()
    assert.equal(runtime.snapshot().enabled, true)
    assert.equal(runtime.snapshot().bindingState, 'paired')
    assert.equal(storage.data.credentials.token, refreshed.token)
    assert.equal(storage.data.receipts[0].state, 'uncertain')
    assert.equal(storage.data.receipts[1].state, 'done')
    assert.deepEqual(sentTokens, [auth.token, refreshed.token], 'old uncertain reply is not replayed')
  } finally { oldSend.resolve(); await runtime.dispose() }
})

test('a superseded receive poll cannot expire the replacement credential or overwrite its cursor', async () => {
  const oldPoll = deferred(), storage = memory(seed({ cursor: 'keep-cursor' })), pollTokens = []
  const refreshed = { ...auth, token: 'synthetic-refreshed-token' }
  const runtime = new ClawbotRuntime(storage, host(), client({
    getUpdates(credentials, cursor, abort) {
      pollTokens.push(credentials.token)
      return credentials.token === auth.token ? oldPoll.promise : blockedPoll(credentials, cursor, abort)
    },
    async getQr() { return { qrcode: 'qr', url: 'https://liteapp.weixin.qq.com/q/test-only' } },
    async pollQr() { return { status: 'confirmed', credentials: refreshed } },
  }))
  try {
    await enabled(runtime, true)
    await enabled(runtime, false)
    const start = await runtime.control({ action: 'login.start' }, signal())
    await runtime.control({ action: 'login.poll', loginId: start.pairing.id }, signal())
    await enabled(runtime, true)
    oldPoll.reject(Object.assign(new Error('old token expired'), { code: 'clawbot-auth-expired' }))
    await setImmediate()
    assert.equal(runtime.snapshot().enabled, true)
    assert.equal(runtime.snapshot().bindingState, 'paired')
    assert.equal(storage.data.credentials.token, refreshed.token)
    assert.equal(storage.data.cursor, 'keep-cursor')
    assert.deepEqual(pollTokens, [auth.token, refreshed.token])
  } finally { oldPoll.resolve({ messages: [], cursor: 'stale' }); await runtime.dispose() }
})

test('terminal QR attempts do not block explicit disconnect while active attempts still require cancellation', async () => {
  let now = 1000
  const storage = memory(seed()), runtime = new ClawbotRuntime(storage, host(), client({
    async getQr() { return { qrcode: 'qr', url: 'https://liteapp.weixin.qq.com/q/test-only' } },
  }), () => now)
  try {
    const start = await runtime.control({ action: 'login.start' }, signal())
    await assert.rejects(runtime.control({ action: 'disconnect', expectedRevision: start.revision }, signal()), { code: 'clawbot-login-active' })
    assert.deepEqual(storage.data.credentials, auth)
    now = start.pairing.expiresAt
    const expired = runtime.snapshot()
    const disconnected = await runtime.control({ action: 'disconnect', expectedRevision: expired.revision }, signal())
    assert.equal(disconnected.paired, false)
    assert.equal(disconnected.pairing, undefined)
    assert.equal(disconnected.bindingState, 'unpaired')
    assert.ok(disconnected.revision > expired.revision)
  } finally { await runtime.dispose() }
})

test('component reload fences old pairing snapshots even when the carrier epoch stays unchanged', async () => {
  const storage = memory(emptyClawbotData())
  const runtime = new ClawbotRuntime(storage, host(), client({
    async getQr() { return { qrcode: 'qr', url: 'https://liteapp.weixin.qq.com/q/test-only' } },
  }))
  const before = await runtime.control({ action: 'login.start' }, signal())
  assert.ok(before.pairing)
  await runtime.dispose()
  const restarted = new ClawbotRuntime(storage, host(), client())
  try {
    const after = restarted.snapshot()
    assert.equal(after.pairing, undefined)
    assert.equal(after.enabled, false)
    assert.equal(after.paired, false)
    assert.ok(after.revision > before.revision)
    assert.equal(storage.data.revision, after.revision)
    await assert.rejects(restarted.control({ action: 'enabled', enabled: false, expectedRevision: before.revision }, signal()), { code: 'clawbot-conflict' })
  } finally { await restarted.dispose() }
})

test('native already-bound confirmation retains the local account and pending ledger', async () => {
  const storage = memory(seed({ cursor: 'keep-cursor', receipts: [receipt('1', 'ready', { output: 'keep output' })] }))
  let providedTokens
  const runtime = new ClawbotRuntime(storage, host(), client({
    async getQr(_signal, tokens) { providedTokens = tokens; return { qrcode: 'test-qr', url: 'https://liteapp.weixin.qq.com/q/test-only' } },
    async pollQr() { return { status: 'binded_redirect' } },
  }))
  try {
    const started = await runtime.control({ action: 'login.start' }, signal())
    const finished = await runtime.control({ action: 'login.poll', loginId: started.pairing.id }, signal())
    assert.deepEqual(providedTokens, [auth.token])
    assert.equal(finished.paired, true)
    assert.equal(finished.pairing, undefined)
    assert.equal(finished.enabled, false)
    assert.equal(storage.data.cursor, 'keep-cursor')
    assert.equal(storage.data.receipts[0].output, 'keep output')
  } finally { await runtime.dispose() }
})

test('an immediate slash response does not wait for the next provider poll to be delivered', async () => {
  const storage = memory(), sent = []
  const runtime = new ClawbotRuntime(storage, host(), client({ async sendText(_auth, message) { sent.push(message) } }))
  try {
    runtime.ingest([incoming('1', '/状态')], 'cursor')
    await enabled(runtime, true)
    await setImmediate()
    assert.equal(sent.length, 1)
    assert.equal(storage.data.receipts[0].state, 'done')
  } finally { await runtime.dispose() }
})

test('safety: a second same-profile owner is rejected and cannot remove the first lock', () => {
  const fixture = temporaryStore()
  try {
    assert.throws(() => new FileClawbotStorage(fixture.directory), /另一个实例/)
    fixture.storage.write(seed())
    assert.equal(fixture.storage.read().credentials.userId, auth.userId)
    assert.throws(() => new FileClawbotStorage(fixture.directory), /另一个实例/)
  } finally { fixture.close() }
})
