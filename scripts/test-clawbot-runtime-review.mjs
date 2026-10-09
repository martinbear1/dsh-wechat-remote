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
const { ILinkClient } = await sourceModule('ilink')
const auth = { token: 'synthetic-token', baseUrl: 'https://ilinkai.weixin.qq.com', accountId: 'test@im.bot', userId: 'test@im.wechat' }
const sessions = [{ id: 'session-a', title: 'A', generation: 101 }, { id: 'session-b', title: 'B', generation: 102 }]
const signal = () => new AbortController().signal
const incoming = (id, text) => ({ id, text, userId: auth.userId, contextToken: 'synthetic-context' })
const mediaFixture = (kind = 'file', name = 'note.txt') => ({ kind, name,
  url: 'https://novac2c.cdn.weixin.qq.com/c2c/download?encrypted_query_param=fixture', aesKey: Buffer.alloc(16, 1).toString('base64') })
const preparedFixture = (kind = 'file', name = 'result.pdf') => ({ kind, name, bytes: 3, cipherBytes: 16,
  query: 'synthetic-upload', aesKey: Buffer.from('1234567890abcdef1234567890abcdef').toString('base64'), accountId: auth.accountId, userId: auth.userId })
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
function featureGate() {
  return { allowed: true, current() { if (!this.allowed) throw Error('公网流量已用完，请补充后再使用。') }, async authorize() { this.current() } }
}

function ownerGate() { return { ...featureGate(), owner: { nodeId: 'node-one', accountInstance: 'account-one' }, identity() { this.current(); return { ...this.owner } } } }

test('legacy enabled ClawBot keeps its token and target but requires explicit owner-qualified enable after upgrade', async () => {
  const gate = ownerGate(), storage = memory(seed({enabled:true})); let polls = 0
  const runtime = new ClawbotRuntime(storage, host(), client({getUpdates(...args) { polls++; return blockedPoll(...args) }}), Date.now, gate)
  try {
    await setImmediate(); assert.equal(polls, 0); assert.equal(runtime.snapshot().enabled, false)
    assert.match(runtime.snapshot().message, /升级后/); assert.equal(storage.data.credentials.token, auth.token)
    assert.equal(storage.data.target.id, sessions[0].id); assert.equal(storage.data.accessBinding, undefined)
    await enabled(runtime, true); await setImmediate()
    assert.deepEqual(storage.data.accessBinding, gate.owner); assert.equal(polls, 1)
  } finally { await runtime.dispose() }
})

test('same node new account incarnation cannot reuse a former account token, poll reply or route', async () => {
  const gate = ownerGate(), read = deferred(), storage = memory(seed({accessBinding:gate.owner}))
  const runtime = new ClawbotRuntime(storage, host(() => assert.fail('must not dispatch')), client({getUpdates:() => read.promise}), Date.now, gate)
  try {
    await enabled(runtime, true); await setImmediate()
    gate.owner = { ...gate.owner, accountInstance:'account-recreated' }
    read.resolve({cursor:'late',messages:[incoming('late-owner','hi')]}); await setImmediate()
    assert.equal(runtime.snapshot().enabled, false); assert.equal(storage.data.cursor, ''); assert.equal(storage.data.receipts.length, 0)
    assert.equal(storage.data.accessBinding.accountInstance, 'account-one'); assert.equal(storage.data.credentials.token, auth.token)
    await assert.rejects(enabled(runtime,true), /账号绑定已变化/)
    await assert.rejects(runtime.control({action:'route',sessionId:sessions[1].id,expectedRevision:runtime.snapshot().revision},signal()), /账号绑定已变化/)
    await runtime.control({action:'disconnect',expectedRevision:runtime.snapshot().revision},signal())
    assert.equal(storage.data.accessBinding, undefined); assert.equal(storage.data.credentials,null)
  } finally { read.resolve({cursor:'',messages:[]}); await runtime.dispose() }
})

test('node or account change during QR generation or provider confirmation never adopts the delayed binding', async () => {
  for (const stage of ['qr','confirmation']) {
    const gate = ownerGate(), delayed = deferred(), storage = memory(emptyClawbotData()); let forgotten = 0
    const runtime = new ClawbotRuntime(storage, host(), client({
      async getQr() { return stage === 'qr' ? delayed.promise : {qrcode:'owner-qr',url:'https://example.invalid/qr'} },
      async pollQr() { return delayed.promise }, forgetQr() {forgotten++},
    }), Date.now, gate)
    try {
      const start = runtime.control({action:'login.start'},signal())
      if (stage === 'qr') {
        await setImmediate(); gate.owner = {...gate.owner,nodeId:'node-two'}
        delayed.resolve({qrcode:'owner-qr',url:'https://example.invalid/qr'})
        await assert.rejects(start, /节点或账号已变化/)
      } else {
        const state = await start, poll = runtime.control({action:'login.poll',loginId:state.pairing.id},signal())
        await setImmediate(); gate.owner = {...gate.owner,accountInstance:'account-two'}
        delayed.resolve({status:'confirmed',credentials:auth})
        await assert.rejects(poll, /账号绑定已变化/)
      }
      assert.equal(runtime.snapshot().paired,false); assert.equal(storage.data.credentials,null); assert.equal(storage.data.accessBinding,undefined); assert.ok(forgotten > 0)
    } finally { await runtime.dispose() }
  }
})

test('feature denial blocks new controls and Tencent access on any carrier; safe pause and disconnect remain available', async () => {
  const gate = featureGate(); gate.allowed = false
  const storage = memory(), runtime = new ClawbotRuntime(storage, { ...host(), async describeSession() { assert.fail('must not route') } },
    client({ async getQr() { assert.fail('must not request QR') }, async getUpdates() { assert.fail('must not poll') }, async sendText() { assert.fail('must not send') } }), Date.now, gate)
  try {
    for (const request of [{ action: 'enabled', enabled: true }, { action: 'route', sessionId: sessions[1].id }, { action: 'login.start' }])
      await assert.rejects(runtime.control({ ...request, expectedRevision: runtime.snapshot().revision }, signal()), /公网流量/)
    assert.equal(runtime.snapshot().enabled, false); assert.equal(storage.data.credentials.accountId, auth.accountId)
    await enabled(runtime, false)
    await runtime.control({ action: 'disconnect', expectedRevision: runtime.snapshot().revision }, signal())
    assert.equal(runtime.snapshot().paired, false)
  } finally { await runtime.dispose() }
})

test('feature revocation while Tencent poll is pending accepts no new input and does not advance cursor', async () => {
  const gate = featureGate(), next = deferred(), storage = memory()
  const runtime = new ClawbotRuntime(storage, host(() => assert.fail('must not dispatch')), client({ getUpdates: () => next.promise }), Date.now, gate)
  try {
    await enabled(runtime, true); await setImmediate(); gate.allowed = false
    next.resolve({ cursor: 'new', messages: [incoming('denied', 'hi')] }); await setImmediate()
    assert.equal(storage.data.cursor, ''); assert.equal(storage.data.receipts.length, 0); assert.equal(runtime.snapshot().enabled, false)
  } finally { await runtime.dispose() }
})

test('feature revocation preserves in-flight native result without cancel or new send; route cannot finish after revocation', async () => {
  const gate = featureGate(), run = deferred(), selected = deferred(), storage = memory(seed({ receipts: [receipt('native'), receipt('route', 'pending', { input: '/切换 ' + createHash('sha256').update(sessions[1].id).digest('hex').slice(0, 8) })] }))
  let calls = 0
  const runtime = new ClawbotRuntime(storage, { ...host(async () => { calls++; return run.promise }), describeSession: () => selected.promise }, client({ sendText: () => assert.fail('must not send') }), Date.now, gate)
  try {
    await enabled(runtime, true); await setImmediate(); gate.allowed = false; selected.resolve(sessions[1]); run.resolve({text:'saved result'}); await setImmediate()
    assert.equal(calls, 1); assert.equal(storage.data.target.id, sessions[0].id); assert.equal(runtime.snapshot().enabled, false)
    assert.equal(storage.data.receipts.find(r => r.id === receipt('native').id).state, 'ready')
    assert.match(storage.data.receipts.find(r => r.id === receipt('native').id).output, /saved result/)
  } finally { await runtime.dispose() }
})

test('feature revocation after first reply fragment never sends the next fragment or replays the acknowledged fragment', async () => {
  const gate = featureGate(), sent = deferred(), storage = memory(seed({ receipts: [receipt('delivery', 'ready', { input:'', output:'A'.repeat(1900) })] }))
  let count = 0
  const runtime = new ClawbotRuntime(storage, host(), client({ sendText: async () => { count++; return sent.promise } }), Date.now, gate)
  try {
    await enabled(runtime, true); await setImmediate(); gate.allowed = false; sent.resolve(); await setImmediate()
    assert.equal(count, 1); assert.equal(storage.data.receipts[0].sentParts, 1); assert.equal(storage.data.receipts[0].state, 'ready'); assert.equal(runtime.snapshot().enabled, false)
  } finally { await runtime.dispose() }
})
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

test('attention uses durable outbox once, then forwards final reply without a second native prompt', async () => {
  const run = deferred(), storage = memory(), sent = []; let notify, prompts = 0
  const runtime = new ClawbotRuntime(storage, host(async (_input, _signal, onAttention) => {
    prompts++; notify = onAttention; return run.promise
  }), client({ async sendText(_auth, message) { sent.push(message) } }))
  try {
    runtime.ingest([incoming('attention', 'work')], 'cursor'); await enabled(runtime, true); await setImmediate()
    notify('question'); notify('question'); await setImmediate()
    assert.equal(sent.length, 1); assert.match(sent[0].text, /回答问题/)
    assert.equal(storage.data.receipts[0].state, 'running')
    run.resolve({ text: 'native final' }); await setImmediate()
    assert.equal(prompts, 1); assert.equal(sent.length, 2); assert.match(sent[1].text, /native final/)
    assert.notEqual(sent[0].clientId, sent[1].clientId)
    assert.ok(storage.data.receipts.every(row => row.state === 'done' && row.contextToken === ''))
  } finally { run.resolve({ text: 'cleanup' }); await runtime.dispose() }
})

test('finishing while paused retires unsent attention and sends only final reply on resume', async () => {
  const run = deferred(), storage = memory(), sent = []; let notify
  const runtime = new ClawbotRuntime(storage, host(async (_input, _signal, onAttention) => {
    notify = onAttention; return run.promise
  }), client({ async sendText(_auth, message) { sent.push(message) } }))
  try {
    runtime.ingest([incoming('paused-attention', 'work')], 'cursor'); await enabled(runtime, true); await setImmediate()
    await enabled(runtime, false); notify('approval')
    run.resolve({ text: 'completed while paused' }); await setImmediate()
    assert.equal(sent.length, 0)
    await enabled(runtime, true); await setImmediate()
    assert.equal(sent.length, 1); assert.match(sent[0].text, /completed while paused/)
  } finally { run.resolve({ text: 'cleanup' }); await runtime.dispose() }
})

test('completion during notice authorization cannot revive a retired attention receipt', async () => {
  const run = deferred(), authorization = deferred(), storage = memory(), sent = []
  const gate = featureGate(); let notify, delaying = false, authorizations = 0
  gate.authorize = async () => { gate.current(); if (delaying && ++authorizations === 1) await authorization.promise }
  const runtime = new ClawbotRuntime(storage, host(async (_input, _signal, onAttention) => {
    notify = onAttention; return run.promise
  }), client({ async sendText(_auth, message) { sent.push(message) } }), Date.now, gate)
  try {
    runtime.ingest([incoming('late-notice', 'work')], 'cursor'); await enabled(runtime, true); await setImmediate()
    delaying = true; notify('question'); await setImmediate()
    assert.equal(authorizations, 1); assert.equal(sent.length, 0)
    run.resolve({ text: 'finished during authorization' }); await setImmediate()
    assert.equal(storage.data.receipts[1].state, 'done')
    authorization.resolve(); await setImmediate()
    assert.equal(sent.length, 1); assert.match(sent[0].text, /finished during authorization/)
    assert.ok(storage.data.receipts.every(row => row.state === 'done' && row.contextToken === ''))
  } finally { authorization.resolve(); run.resolve({ text: 'cleanup' }); await runtime.dispose() }
})

test('disconnect during authorization cannot revive pending dispatch or ready delivery', async () => {
  for (const state of ['pending', 'ready']) {
    const gate = featureGate(), authorization = deferred(), storage = memory(seed({ receipts: [receipt('sealed', state, { output: 'old reply' })] }))
    let authorized = 0, delay = false, runs = 0, sends = 0
    gate.authorize = async () => { gate.current(); if (delay && ++authorized <= 2) await authorization.promise }
    const runtime = new ClawbotRuntime(storage, host(async () => { runs++; return { text: 'must not run' } }),
      client({ async sendText() { sends++ },
        async getQr() { return { qrcode: 'replacement-qr', url: 'https://example.invalid/qr' } },
        async pollQr() { return { status: 'confirmed', credentials: { ...auth, accountId: 'replacement@im.bot' } } },
      }), Date.now, gate)
    try {
      // Enable authorization completes first; subsequent work is delayed.
      const original = gate.authorize
      gate.authorize = async () => { await original(); delay = true }
      await enabled(runtime, true); await setImmediate()
      assert.equal(authorized, 2, 'receive poll and dispatch/delivery are both held')
      await enabled(runtime, false)
      await runtime.control({ action: 'disconnect', expectedRevision: runtime.snapshot().revision, abandonPending: true }, signal())
      const pairing = await runtime.control({ action: 'login.start' }, signal())
      await runtime.control({ action: 'login.poll', loginId: pairing.pairing.id }, signal())
      await runtime.control({ action: 'route', sessionId: sessions[0].id, expectedRevision: runtime.snapshot().revision }, signal())
      await enabled(runtime, true)
      authorization.resolve(); await setImmediate()
      assert.equal(runs, 0); assert.equal(sends, 0)
      assert.equal(storage.data.receipts[0].state, 'uncertain'); assert.equal(storage.data.credentials.accountId, 'replacement@im.bot')
    } finally { authorization.resolve(); await runtime.dispose() }
  }
})

test('restart does not send a stale continue-waiting notice or resubmit an interrupted run', async () => {
  const parent = receipt('restart-attention', 'running')
  const notice = receipt('ignored', 'ready', { id: createHash('sha256').update(`attention\0${parent.id}\0question`).digest('hex'), input: '', output: 'continue waiting' })
  const storage = memory(seed({ enabled: true, receipts: [parent, notice] })), sent = []
  const runtime = new ClawbotRuntime(storage, host(() => assert.fail('no replay')), client({ async sendText(_auth, message) { sent.push(message) } }))
  try {
    await setImmediate(); assert.equal(sent.length, 0)
    assert.equal(storage.data.receipts[0].state, 'uncertain'); assert.equal(storage.data.receipts[1].state, 'done')
  } finally { await runtime.dispose() }
})

test('unknown notice delivery is not retried and does not suppress the final reply', async () => {
  const run = deferred(), storage = memory(), sent = []; let notify
  const runtime = new ClawbotRuntime(storage, host(async (_input, _signal, onAttention) => {
    notify = onAttention; return run.promise
  }), client({ async sendText(_auth, message) {
    sent.push(message); if (sent.length === 1) throw Error('uncertain response')
  } }))
  try {
    runtime.ingest([incoming('uncertain-attention', 'work')], 'cursor'); await enabled(runtime, true); await setImmediate()
    notify('approval'); await setImmediate(); notify('approval')
    run.resolve({ text: 'native final' }); await setImmediate()
    assert.equal(sent.length, 2); assert.match(sent[1].text, /native final/)
    assert.equal(runtime.snapshot().uncertain, 1)
  } finally { run.resolve({ text: 'cleanup' }); await runtime.dispose() }
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
  const run = deferred(), expiredPoll = deferred(), storage = memory(), sent = []
  let submitted = 0
  const refreshed = { ...auth, token: 'refreshed-token' }
  const runtime = new ClawbotRuntime(storage, host(() => { submitted++; return run.promise }), client({
    getUpdates(credentials, cursor, abort) {
      if (credentials.token === auth.token) return expiredPoll.promise
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
    assert.equal(submitted, 1, 'the fixture must admit the original run before the token expires')
    expiredPoll.reject(Object.assign(new Error('expired'), { code: 'clawbot-auth-expired' }))
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

async function advanceLogin(t, milliseconds) {
  t.mock.timers.tick(milliseconds)
  // Drain the real runtime's control queue without advancing its next timer.
  await setImmediate()
}

test('node-owned pairing finishes with both pages closed and caller disconnected, without enabling receiving', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  const storage = memory(emptyClawbotData()), caller = new AbortController()
  let polls = 0, updates = 0
  const runtime = new ClawbotRuntime(storage, host(), client({
    async getQr() { return { qrcode: 'qr-no-ui', url: 'https://example.invalid/qr' } },
    async pollQr() { polls++; return { status: 'confirmed', credentials: auth } },
    async getUpdates() { updates++; return { cursor: '', messages: [] } },
  }))
  try {
    const started = await runtime.control({ action: 'login.start' }, caller.signal)
    caller.abort()
    assert.equal(polls, 0)
    await advanceLogin(t, 1000)
    const finished = runtime.snapshot()
    assert.equal(polls, 1)
    assert.equal(finished.paired, true)
    assert.equal(finished.enabled, false)
    assert.equal(finished.target, null)
    assert.equal(finished.pairing, undefined)
    assert.ok(finished.revision > started.revision)
    assert.equal(storage.data.credentials.token, auth.token)
    await advanceLogin(t, 300_000)
    assert.equal(polls, 1)
    assert.equal(updates, 0)
  } finally { await runtime.dispose() }
})

test('watcher and UI share one provider poll; explicit code still preempts only the passive read', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  let calls = 0, active = 0, maximum = 0, codes = []
  const runtime = new ClawbotRuntime(memory(emptyClawbotData()), host(), client({
    async getQr() { return { qrcode: 'qr-single-flight', url: 'https://example.invalid/qr' } },
    async pollQr(_qr, abort, code) {
      calls++; active++; maximum = Math.max(maximum, active)
      if (code !== undefined) { codes.push(code); active--; return { status: 'confirmed', credentials: auth } }
      return new Promise((_resolve, reject) => abort.addEventListener('abort', () => {
        active--; reject(abort.reason)
      }, { once: true }))
    },
  }))
  try {
    const started = await runtime.control({ action: 'login.start' }, signal())
    await advanceLogin(t, 1000)
    assert.equal(calls, 1)
    const passive = await runtime.control({ action: 'login.poll', loginId: started.pairing.id }, signal())
    assert.equal(passive.paired, false)
    assert.equal(calls, 1)
    const finished = await runtime.control({ action: 'login.poll', loginId: started.pairing.id, verifyCode: '123456' }, signal())
    assert.equal(finished.paired, true)
    assert.deepEqual(codes, ['123456'])
    assert.equal(maximum, 1)
    await advanceLogin(t, 20_000)
    assert.equal(calls, 2)
  } finally { await runtime.dispose() }
})

test('watcher pauses at verification and resumes passive reading only after the explicit code response', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  let polls = 0, codes = []
  const runtime = new ClawbotRuntime(memory(emptyClawbotData()), host(), client({
    async getQr() { return { qrcode: 'qr-verify', url: 'https://example.invalid/qr' } },
    async pollQr(_qr, _abort, code) {
      polls++
      if (code !== undefined) { codes.push(code); return { status: 'scaned' } }
      return polls === 1 ? { status: 'need_verifycode' } : { status: 'confirmed', credentials: auth }
    },
  }))
  try {
    const started = await runtime.control({ action: 'login.start' }, signal())
    await advanceLogin(t, 1000)
    assert.equal(runtime.snapshot().pairing.status, 'need_verifycode')
    await advanceLogin(t, 20_000)
    assert.equal(polls, 1)
    await runtime.control({ action: 'login.poll', loginId: started.pairing.id, verifyCode: '654321' }, signal())
    assert.deepEqual(codes, ['654321'])
    await advanceLogin(t, 1000)
    assert.equal(runtime.snapshot().paired, true)
    assert.equal(polls, 3)
  } finally { await runtime.dispose() }
})

test('verification preemption is not a background failure while the explicit code is still in flight', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  const verification = deferred()
  let calls = 0
  const runtime = new ClawbotRuntime(memory(emptyClawbotData()), host(), client({
    async getQr() { return { qrcode: 'qr-verify-slow', url: 'https://example.invalid/qr' } },
    async pollQr(_qr, abort, code) {
      calls++
      if (code !== undefined) return verification.promise
      return new Promise((_resolve, reject) => abort.addEventListener('abort', () => reject(abort.reason), { once: true }))
    },
  }))
  try {
    const started = await runtime.control({ action: 'login.start' }, signal())
    await advanceLogin(t, 1000)
    const submitting = runtime.control({ action: 'login.poll', loginId: started.pairing.id, verifyCode: '123456' }, signal())
    await setImmediate()
    assert.equal(runtime.snapshot().pairing.status, 'wait')
    await advanceLogin(t, 3000)
    assert.equal(calls, 2, 'passive watcher cannot duplicate the explicit request')
    verification.resolve({ status: 'need_verifycode' })
    await submitting
    await advanceLogin(t, 5000)
    assert.equal(runtime.snapshot().pairing.status, 'need_verifycode')
    assert.equal(calls, 2)
  } finally { verification.resolve({ status: 'need_verifycode' }); await runtime.dispose() }
})

test('deadline aborts a background read with no UI, even if the computer clock stops or moves back', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  let aborted = false, polls = 0
  const runtime = new ClawbotRuntime(memory(emptyClawbotData()), host(), client({
    async getQr() { return { qrcode: 'qr-deadline', url: 'https://example.invalid/qr' } },
    async pollQr(_qr, abort) {
      polls++
      return new Promise((_resolve, reject) => abort.addEventListener('abort', () => {
        aborted = true; reject(abort.reason)
      }, { once: true }))
    },
  }), () => 1000)
  try {
    await runtime.control({ action: 'login.start' }, signal())
    await advanceLogin(t, 1000)
    await advanceLogin(t, 299_000)
    assert.equal(aborted, true)
    assert.equal(runtime.snapshot().pairing.status, 'expired')
    assert.equal(runtime.snapshot().paired, false)
    await advanceLogin(t, 300_000)
    assert.equal(polls, 1)
  } finally { await runtime.dispose() }
})

test('cancel and disposal clear node-owned timers and late confirmation never installs a binding', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  const response = deferred(), storage = memory(emptyClawbotData())
  let polls = 0, aborted = 0, qrCalls = 0
  const runtime = new ClawbotRuntime(storage, host(), client({
    async getQr() { return { qrcode: 'qr-cancel-' + ++qrCalls, url: 'https://example.invalid/qr' } },
    async pollQr(_qr, abort) { polls++; abort.addEventListener('abort', () => aborted++); return response.promise },
  }))
  try {
    const first = await runtime.control({ action: 'login.start' }, signal())
    await advanceLogin(t, 1000)
    await runtime.control({ action: 'login.cancel', loginId: first.pairing.id }, signal())
    const second = await runtime.control({ action: 'login.start' }, signal())
    response.resolve({ status: 'confirmed', credentials: auth })
    await setImmediate()
    assert.equal(runtime.snapshot().paired, false)
    assert.equal(runtime.snapshot().pairing.id, second.pairing.id)
    assert.equal(aborted, 1)
    await runtime.dispose()
    await advanceLogin(t, 300_000)
    assert.equal(polls, 1)
    assert.equal(storage.data.credentials, null)
  } finally { response.resolve({ status: 'wait' }); await runtime.dispose() }
})

test('component disposal aborts and joins its in-flight watcher before closing local storage', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  const storage = memory(emptyClawbotData())
  let polls = 0, aborted = false, closed = false
  storage.close = () => { assert.equal(aborted, true); closed = true }
  const runtime = new ClawbotRuntime(storage, host(), client({
    async getQr() { return { qrcode: 'qr-dispose', url: 'https://example.invalid/qr' } },
    async pollQr(_qr, abort) {
      polls++
      return new Promise((_resolve, reject) => abort.addEventListener('abort', () => {
        aborted = true; reject(abort.reason)
      }, { once: true }))
    },
  }))
  try {
    await runtime.control({ action: 'login.start' }, signal())
    await advanceLogin(t, 1000)
    await runtime.dispose()
    assert.equal(closed, true)
    await advanceLogin(t, 300_000)
    assert.equal(polls, 1)
    assert.equal(storage.data.credentials, null)
  } finally { await runtime.dispose() }
})

test('only transient background reads retry, bounded to the existing attempt without replaying login start', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  let polls = 0, starts = 0
  const runtime = new ClawbotRuntime(memory(emptyClawbotData()), host(), client({
    async getQr() { starts++; return { qrcode: 'qr-retry', url: 'https://example.invalid/qr' } },
    async pollQr() {
      if (++polls === 1) throw Object.assign(new Error('must not leak provider detail'), { code: 'clawbot-network-error' })
      return { status: 'confirmed', credentials: auth }
    },
  }))
  try {
    await runtime.control({ action: 'login.start' }, signal())
    await advanceLogin(t, 1000)
    assert.match(runtime.snapshot().message, /正在重试/)
    assert.doesNotMatch(runtime.snapshot().message, /provider detail/)
    await advanceLogin(t, 1999)
    assert.equal(polls, 1)
    await advanceLogin(t, 1)
    assert.equal(polls, 2)
    assert.equal(starts, 1)
    assert.equal(runtime.snapshot().paired, true)
  } finally { await runtime.dispose() }
})

test('only a real successful pairing read clears the retry notice and advances its revision', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  const recoveredRead = deferred()
  let polls = 0
  const runtime = new ClawbotRuntime(memory(emptyClawbotData()), host(), client({
    async getQr() { return { qrcode: 'qr-retry-message', url: 'https://example.invalid/qr' } },
    async pollQr() {
      polls++
      if (polls === 1) return { status: 'wait' }
      if (polls === 2) throw Object.assign(new Error('synthetic network outage'), { code: 'clawbot-network-error' })
      return recoveredRead.promise
    },
  }))
  try {
    const started = await runtime.control({ action: 'login.start' }, signal())
    await advanceLogin(t, 1000)
    assert.equal(runtime.snapshot().message, started.message, 'a message-less result preserves unrelated guidance')
    assert.equal(runtime.snapshot().revision, started.revision)
    await advanceLogin(t, 1000)
    const failed = runtime.snapshot()
    assert.match(failed.message, /正在重试/)
    assert.ok(failed.revision > started.revision)
    await advanceLogin(t, 2000)
    const coalesced = await runtime.control({ action: 'login.poll', loginId: started.pairing.id }, signal())
    assert.equal(coalesced.message, failed.message, 'joining the existing read is not a recovery receipt')
    assert.equal(coalesced.revision, failed.revision)
    recoveredRead.resolve({ status: 'wait' }) // The adapter also returns this for a normal long-poll timeout.
    await setImmediate()
    const recovered = runtime.snapshot()
    assert.equal(recovered.message, '')
    assert.ok(recovered.revision > failed.revision)
    assert.equal(recovered.pairing.status, 'wait')
    assert.equal(recovered.paired, false)
    assert.equal(polls, 3)
  } finally { recoveredRead.resolve({ status: 'wait' }); await runtime.dispose() }
})

test('background pairing reports account mismatch and storage failure without changing the old binding', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  const existing = memory(seed())
  const mismatch = new ClawbotRuntime(existing, host(), client({
    async getQr() { return { qrcode: 'qr-mismatch', url: 'https://example.invalid/qr' } },
    async pollQr() { return { status: 'confirmed', credentials: { ...auth, userId: 'other@im.wechat' } } },
  }))
  try {
    await mismatch.control({ action: 'login.start' }, signal())
    await advanceLogin(t, 1000)
    assert.match(mismatch.snapshot().message, /另一个微信账号/)
    assert.equal(mismatch.snapshot().pairing, undefined)
    assert.equal(existing.data.credentials.userId, auth.userId)
  } finally { await mismatch.dispose() }
  const storage = memory(emptyClawbotData())
  const broken = new ClawbotRuntime(storage, host(), client({
    async getQr() { return { qrcode: 'qr-storage', url: 'https://example.invalid/qr' } },
    async pollQr() { storage.fail = true; return { status: 'confirmed', credentials: auth } },
  }))
  try {
    await broken.control({ action: 'login.start' }, signal())
    await advanceLogin(t, 1000)
    assert.equal(broken.snapshot().paired, false)
    assert.equal(broken.snapshot().pairing.status, 'error')
    assert.match(broken.snapshot().message, /记录未能保存/)
    assert.equal(storage.data.credentials, null)
    await advanceLogin(t, 300_000)
  } finally { await broken.dispose() }
})

test('restoring storage after a fatal pairing write cannot claim a successful binding or enabled channel before restart', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  const storage = memory(seed())
  let qrCalls = 0, pollCalls = 0, updates = 0, descriptions = 0
  const runtime = new ClawbotRuntime(storage, {
    ...host(), async describeSession(id) { descriptions++; return sessions.find(item => item.id === id) },
  }, client({
    async getQr() { qrCalls++; return { qrcode: 'qr-storage-recovery', url: 'https://example.invalid/qr' } },
    async pollQr() { pollCalls++; storage.fail = true; return { status: 'confirmed', credentials: { ...auth, token: 'replacement-token' } } },
    getUpdates(...args) { updates++; return blockedPoll(...args) },
  }))
  try {
    const started = await runtime.control({ action: 'login.start' }, signal())
    const durableBeforeFailure = structuredClone(storage.data)
    await advanceLogin(t, 1000)
    const failed = runtime.snapshot()
    assert.match(failed.message, /记录未能保存.*重启/)
    assert.equal(failed.enabled, false)
    assert.equal(storage.data.credentials.token, auth.token)
    storage.fail = false // Disk availability alone cannot repair the stopped in-memory runtime.
    const revision = failed.revision
    for (const request of [
      { action: 'login.start' },
      { action: 'login.poll', loginId: started.pairing.id },
      { action: 'login.poll', loginId: started.pairing.id, verifyCode: '123456' },
      { action: 'route', sessionId: sessions[1].id, expectedRevision: revision },
      { action: 'enabled', enabled: true, expectedRevision: revision },
      { action: 'disconnect', expectedRevision: revision },
    ]) {
      await assert.rejects(runtime.control(request, signal()), error => error.code === 'clawbot-restart-required' && /重启/.test(error.message))
      assert.deepEqual(storage.data, durableBeforeFailure)
      assert.deepEqual(runtime.snapshot(), failed)
    }
    const read = await runtime.control({ action: 'status' }, signal())
    assert.equal(read.message, failed.message)
    const paused = await runtime.control({ action: 'enabled', enabled: false, expectedRevision: revision }, signal())
    assert.equal(paused.enabled, false)
    assert.equal(paused.message, failed.message)
    assert.deepEqual(storage.data, durableBeforeFailure, 'an already-paused broken runtime does not rewrite state')
    const cancelled = await runtime.control({ action: 'login.cancel', loginId: started.pairing.id }, signal())
    assert.equal(cancelled.pairing, undefined)
    assert.equal(cancelled.message, failed.message, 'safe cancellation must retain the restart diagnostic')
    assert.equal(storage.data.credentials.token, auth.token)
    assert.deepEqual(storage.data.target, durableBeforeFailure.target)
    assert.deepEqual(storage.data.receipts, durableBeforeFailure.receipts)
    await advanceLogin(t, 300_000)
    assert.equal(qrCalls, 1)
    assert.equal(pollCalls, 1)
    assert.equal(updates, 0)
    assert.equal(descriptions, 0)
  } finally { await runtime.dispose() }
})

test('a storage-locked runtime cannot finish an in-flight slash route or persist its success', async () => {
  const nativeResult = deferred(), description = deferred(), sent = []
  const commandText = '/切换 ' + createHash('sha256').update(sessions[1].id).digest('hex').slice(0, 8)
  const storage = memory(seed({ receipts: [receipt('route-trigger'), receipt('late-command', 'pending', { input: commandText })] }))
  let nativeSignal
  const runtime = new ClawbotRuntime(storage, {
    ...host(), async describeSession() { return description.promise },
    async run(_input, signal) { nativeSignal = signal; return nativeResult.promise },
  }, client({ async sendText(_auth, message) { sent.push(message) } }))
  try {
    await enabled(runtime, true)
    await setImmediate()
    storage.fail = true
    nativeResult.resolve({ text: 'completed in the original DSH session' })
    await setImmediate()
    const failed = runtime.snapshot(), original = structuredClone(storage.data)
    assert.match(failed.message, /保存失败.*重启/)
    assert.equal(nativeSignal.aborted, false, 'a local storage fault must not cancel the native DSH task')
    storage.fail = false
    description.resolve(sessions[1])
    await setImmediate()
    assert.equal(runtime.snapshot().target.id, sessions[0].id)
    assert.equal(runtime.snapshot().message, failed.message)
    assert.deepEqual(storage.data, original, 'late route completion does not revive writes or success receipts')
    assert.deepEqual(sent, [])
    assert.ok(storage.data.receipts.every(row => row.state === 'running'))
  } finally { nativeResult.resolve({ text: 'done' }); description.resolve(sessions[1]); await runtime.dispose() }
  const restarted = new ClawbotRuntime(storage, host(), client())
  try {
    assert.ok(storage.data.receipts.every(row => row.state === 'uncertain'))
    assert.equal(storage.data.target.id, sessions[0].id)
  } finally { await restarted.dispose() }
})

test('a storage-locked runtime stops after the already-sent first fragment and never replays it on restart', async () => {
  const nativeResult = deferred(), firstSend = deferred(), sent = []
  const storage = memory(seed({ receipts: [receipt('send-trigger'), receipt('partial-reply', 'ready', { input: '', output: 'A'.repeat(1900) })] }))
  let nativeSignal
  const runtime = new ClawbotRuntime(storage, {
    ...host(), async run(_input, signal) { nativeSignal = signal; return nativeResult.promise },
  }, client({ async sendText(_auth, message) { sent.push(message); if (sent.length === 1) await firstSend.promise } }))
  try {
    await enabled(runtime, true)
    await setImmediate()
    assert.equal(sent.length, 1)
    storage.fail = true
    nativeResult.resolve({ text: 'completed in the original DSH session' })
    await setImmediate()
    const failed = runtime.snapshot(), original = structuredClone(storage.data)
    assert.match(failed.message, /保存失败.*重启/)
    assert.equal(nativeSignal.aborted, false)
    storage.fail = false
    firstSend.resolve()
    await setImmediate()
    assert.equal(sent.length, 1, 'storage recovery must not send the remaining fragment in a stopped runtime')
    assert.equal(runtime.snapshot().message, failed.message)
    assert.deepEqual(storage.data, original)
    assert.deepEqual(storage.data.receipts.map(row => row.state), ['running', 'sending'])
  } finally { nativeResult.resolve({ text: 'done' }); firstSend.resolve(); await runtime.dispose() }
  const restarted = new ClawbotRuntime(storage, host(), client({ async sendText(_auth, message) { sent.push(message) } }))
  try {
    await setImmediate()
    assert.ok(storage.data.receipts.every(row => row.state === 'uncertain'))
    assert.equal(sent.length, 1, 'an uncertain first fragment is never automatically resent')
  } finally { await restarted.dispose() }
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

test('native HTTP adapter accepts omitted status codes through idle, dispatch, reply and duplicate receipt', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  const gate = ownerGate(), storage = memory(seed({ cursor: 'initial', accessBinding: gate.owner }))
  const cursors = [], sent = [], runs = []
  const message = { message_id: '18446744073709551615', from_user_id: auth.userId, message_type: 1,
    context_token: 'synthetic-context', item_list: [{ type: 1, text_item: { text: 'synthetic hello' } }] }
  const http = new ILinkClient({ fetch: async (url, options) => {
    const body = JSON.parse(options.body)
    if (new URL(url).pathname.endsWith('/sendmessage')) {
      sent.push(body.msg)
      return Response.json({}) // Native acknowledgement need not contain ret.
    }
    assert.ok(new URL(url).pathname.endsWith('/getupdates'))
    cursors.push(body.get_updates_buf)
    if (cursors.length === 1) return Response.json({ msgs: [], sync_buf: 'deprecated', get_updates_buf: 'idle' })
    if (cursors.length <= 3) return Response.json({ msgs: [message], get_updates_buf: cursors.length === 2 ? 'incoming' : 'repeat' })
    return blockedPoll(null, null, options.signal)
  } })
  const runtime = new ClawbotRuntime(storage, host(async input => { runs.push(input); return { text: 'synthetic reply' } }), http, Date.now, gate)
  try {
    await enabled(runtime, true); await setImmediate()
    assert.equal(runtime.snapshot().state, 'ready')
    assert.equal(runtime.snapshot().message, '')
    assert.equal(storage.data.cursor, 'idle')
    assert.equal(runs.length, 0); assert.equal(sent.length, 0)
    t.mock.timers.tick(500); await setImmediate()
    assert.deepEqual(cursors, ['initial', 'idle', 'incoming', 'repeat'])
    assert.equal(runs.length, 1); assert.equal(runs[0].sessionId, sessions[0].id)
    assert.equal(runs[0].expectedGeneration, sessions[0].generation)
    assert.equal(runs[0].text, 'synthetic hello')
    assert.equal(sent.length, 1); assert.equal(sent[0].context_token, message.context_token)
    assert.equal(sent[0].to_user_id, auth.userId)
    assert.match(sent[0].item_list[0].text_item.text, /synthetic reply/)
    assert.equal(storage.data.cursor, 'repeat'); assert.equal(storage.data.receipts.length, 1)
    assert.equal(storage.data.receipts[0].state, 'done'); assert.equal(runtime.snapshot().uncertain, 0)
    assert.equal(storage.data.receipts[0].contextToken, '')
    assert.deepEqual(storage.data.credentials, auth); assert.deepEqual(storage.data.target, sessions[0])
    assert.deepEqual(storage.data.accessBinding, gate.owner)
    await enabled(runtime, false); await setImmediate()
    assert.equal(runtime.snapshot().enabled, false)
    assert.equal(runs.length, 1); assert.equal(sent.length, 1)
  } finally { await runtime.dispose() }
})

test('native HTTP failures preserve cursor and binding, show safe distinct diagnostics and recover on next read', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  for (const [makeResponse, expected] of [
    [() => Response.json({ msgs: 'bad', get_updates_buf: 'never-adopt' }), /数据暂不兼容/],
    [() => { throw new Error(auth.token) }, /连接暂不可用/],
    [() => Response.json({ errcode: 7, errmsg: auth.token, get_updates_buf: 'never-adopt' }), /服务暂未接受/],
    [() => new Response(auth.token, { status: 503 }), /服务暂未接受/],
    [() => new Response('', { headers: { 'content-length': '1048577' } }), /超过本地处理上限/],
    [() => Response.redirect('https://example.invalid', 302), /地址校验未通过/],
  ]) {
    const storage = memory(seed({ cursor: 'keep', receipts: [receipt('kept', 'uncertain')] }))
    let reads = 0
    const http = new ILinkClient({ fetch: async (url) => {
      assert.ok(new URL(url).pathname.endsWith('/getupdates'), 'no send or login is allowed')
      if (++reads === 1) return makeResponse()
      return Response.json({ msgs: [], get_updates_buf: 'recovered' })
    } })
    const runtime = new ClawbotRuntime(storage, host(() => assert.fail('must not dispatch')), http)
    try {
      await enabled(runtime, true); await setImmediate()
      assert.equal(runtime.snapshot().state, 'error'); assert.match(runtime.snapshot().message, expected)
      assert.ok(!runtime.snapshot().message.includes(auth.token))
      assert.equal(storage.data.cursor, 'keep'); assert.equal(storage.data.receipts.length, 1)
      assert.equal(storage.data.receipts[0].state, 'uncertain')
      assert.deepEqual(storage.data.credentials, auth); assert.deepEqual(storage.data.target, sessions[0])
      t.mock.timers.tick(1999); await setImmediate(); assert.equal(reads, 1)
      t.mock.timers.tick(1); await setImmediate()
      assert.equal(reads, 2); assert.equal(runtime.snapshot().state, 'ready')
      assert.equal(runtime.snapshot().message, ''); assert.equal(storage.data.cursor, 'recovered')
    } finally { await runtime.dispose() }
  }
})

test('malformed send acknowledgement remains uncertain and is not replayed after pause or restart', async () => {
  const storage = memory(seed({ receipts: [receipt('reply', 'ready', { input: '', output: 'synthetic reply' })] }))
  let sends = 0
  const http = new ILinkClient({ fetch: async (url, options) => {
    if (new URL(url).pathname.endsWith('/getupdates')) return blockedPoll(null, null, options.signal)
    assert.ok(new URL(url).pathname.endsWith('/sendmessage'))
    sends++
    return new Response('')
  } })
  const runtime = new ClawbotRuntime(storage, host(() => assert.fail('must not dispatch')), http)
  try {
    await enabled(runtime, true); await setImmediate()
    assert.equal(sends, 1); assert.equal(storage.data.receipts[0].state, 'uncertain')
    await enabled(runtime, false); await setImmediate()
    await enabled(runtime, true); await setImmediate()
    assert.equal(sends, 1)
  } finally { await runtime.dispose() }
  const restarted = new ClawbotRuntime(storage, host(() => assert.fail('must not dispatch')), http)
  try { await setImmediate(); assert.equal(sends, 1); assert.equal(restarted.snapshot().uncertain, 1) }
  finally { await restarted.dispose() }
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

async function nativeAttentionFixture(patch = {}) {
  const storage = memory(seed()), sent = [], runs = [], native = deferred(), gate = featureGate()
  let notify, count = 0, observationSignal
  const runtime = new ClawbotRuntime(storage, { ...host(async (...args) => {
    assert.equal(args.length, 3, 'runtime must not install an exclusive question answerer')
    const [input, abort, onAttention] = args
    runs.push(input); notify = onAttention; observationSignal = abort
    if (runs.length > 1) return { text: 'ordinary chat reply' }
    abort.addEventListener('abort', () => native.resolve({ text: 'observation ended' }), { once: true })
    return native.promise
  }), ...patch.host }, client({ async sendText(_auth, message) { sent.push(message.text) }, ...patch.client }), Date.now, gate)
  const send = async (text, id = 'attention-in-' + (++count), userId = auth.userId) => {
    runtime.ingest([{ ...incoming(id, text), userId }], 'cursor-' + count); runtime.work(); await setImmediate()
  }
  await enabled(runtime, true); await send('begin original task')
  return { runtime, storage, sent, runs, native, gate, send,
    async attention(kind = 'question') { notify(kind); await setImmediate() },
    async route(sessionId) { await runtime.control({ action: 'route', sessionId, expectedRevision: runtime.snapshot().revision }, signal()) },
    get observationSignal() { return observationSignal },
    async close() { native.resolve({ text: 'final result' }); await setImmediate(); await runtime.dispose() } }
}

test('question and approval observation never installs a private answerer or resubmits the native task', async () => {
  for (const kind of ['question', 'approval']) {
    const f = await nativeAttentionFixture()
    try {
      const originalRequest = f.runs[0].requestId
      await f.attention(kind); await f.attention(kind)
      assert.equal(f.sent.length, 1)
      assert.match(f.sent[0], /小程序或电脑/)
      assert.doesNotMatch(f.sent[0], /\/回答|Q[A-F0-9]{10}/)
      assert.equal(f.observationSignal.aborted, false)
      assert.equal(f.storage.data.receipts[0].state, 'running')
      f.native.resolve({ text: 'native card answered and same task finished' }); await setImmediate()
      assert.equal(f.runs.length, 1); assert.equal(f.runs[0].requestId, originalRequest)
      assert.equal(f.sent.filter(text => text.includes('same task finished')).length, 1)
    } finally { await f.close() }
  }
})

test('plain numeric and free-text replies while native input is waiting receive guidance and are never replayed', async () => {
  const f = await nativeAttentionFixture()
  try {
    await f.attention()
    for (const text of ['5', '好', '我选择第五项']) {
      const start = f.sent.length
      await f.send(text)
      assert.equal(f.sent.length, start + 1)
      assert.match(f.sent.at(-1), /本条消息未发送/)
      assert.match(f.sent.at(-1), /小程序或电脑/)
      assert.equal(f.runs.length, 1)
    }
    f.native.resolve({ text: 'native completion' }); await setImmediate()
    assert.equal(f.runs.length, 1, 'possible answers must not become delayed new prompts')
    await f.send('new ordinary task after completion')
    assert.deepEqual(f.runs.map(row => row.text), ['begin original task', 'new ordinary task after completion'])
  } finally { await f.close() }
})

test('duplicate ambiguous input produces one receipt and one guidance, not a second native prompt', async () => {
  const f = await nativeAttentionFixture()
  try {
    await f.attention(); await f.send('5', 'duplicate-five')
    const count = f.sent.length, receipts = f.storage.data.receipts.length
    await f.send('5', 'duplicate-five')
    assert.equal(f.sent.length, count); assert.equal(f.storage.data.receipts.length, receipts)
    f.native.resolve({ text: 'native final' }); await setImmediate()
    assert.equal(f.runs.length, 1)
  } finally { await f.close() }
})

test('already queued ordinary inputs for the captured target are rejected when the original task requests native input', async () => {
  const f = await nativeAttentionFixture()
  try {
    await f.send('5'); await f.send('ordinary input received before attention')
    assert.equal(f.runs.length, 1)
    await f.attention()
    assert.equal(f.sent.filter(text => text.includes('本条消息未发送')).length, 2)
    assert.equal(f.storage.data.receipts.filter(row => row.state === 'pending').length, 0)
    f.native.resolve({ text: 'native final' }); await setImmediate()
    assert.equal(f.runs.length, 1)
  } finally { await f.close() }
})

test('native input marker persists for the original observation and does not block another captured target', async () => {
  const f = await nativeAttentionFixture()
  try {
    await f.attention()
    await f.route(sessions[1].id); await f.send('other target task')
    assert.equal(f.sent.filter(text => text.includes('本条消息未发送')).length, 0)
    await f.route(sessions[0].id); await f.send('5')
    assert.equal(f.sent.filter(text => text.includes('本条消息未发送')).length, 1)
    await f.attention('approval'); await f.send('yes')
    assert.equal(f.sent.filter(text => text.includes('本条消息未发送')).length, 2)
    assert.equal(f.runs.length, 1)
    f.native.resolve({ text: 'A completed natively' }); await setImmediate()
    assert.deepEqual(f.runs.map(row => [row.sessionId, row.text]), [
      [sessions[0].id, 'begin original task'], [sessions[1].id, 'other target task'],
    ])
  } finally { await f.close() }
})

test('native input marker is scoped to the captured generation and never rejects a replacement session', async () => {
  let selected = sessions[0]
  const f = await nativeAttentionFixture({ host: { async describeSession() { return selected } } })
  try {
    await f.attention()
    selected = { ...sessions[0], generation: 201 }
    await f.route(selected.id); await f.send('new generation task')
    assert.equal(f.sent.filter(text => text.includes('本条消息未发送')).length, 0)
    f.native.resolve({ text: 'old generation done' }); await setImmediate()
    assert.equal(f.runs.length, 2)
    assert.equal(f.runs[1].expectedGeneration, 201)
    assert.equal(f.runs[1].text, 'new generation task')
  } finally { await f.close() }
})

test('only the bound sender receives waiting-task guidance; unrelated sender remains ignored', async () => {
  const f = await nativeAttentionFixture()
  try {
    await f.attention()
    const count = f.sent.length, receipts = f.storage.data.receipts.length
    await f.send('5', 'foreign', 'another@im.wechat')
    assert.equal(f.sent.length, count); assert.equal(f.storage.data.receipts.length, receipts)
    assert.equal(f.runs.length, 1)
  } finally { await f.close() }
})

test('legacy answer syntax always points to native UI, never executes or answers a host question', async () => {
  const f = await nativeAttentionFixture()
  try {
    for (const text of ['/回答 QB9DBE4CC72 5', '/回答 bad', '/回答', '/回答 QB9DBE4CC72 转原会话']) {
      await f.send(text)
      assert.match(f.sent.at(-1), /小程序或电脑/)
      assert.equal(f.runs.length, 1)
    }
    await f.attention()
    await f.send('/帮助'); assert.doesNotMatch(f.sent.at(-1), /\/回答/)
    await f.send('/状态'); assert.match(f.sent.at(-1), /接入会话/)
    await f.send('/会话'); assert.match(f.sent.at(-1), /发送 \/切换/)
    await f.send('/切换 ' + createHash('sha256').update(sessions[1].id).digest('hex').slice(0, 8))
    assert.equal(f.storage.data.target.id, sessions[1].id)
    assert.equal(f.runs.length, 1)
  } finally { await f.close() }
})

test('pause and access revocation retain the original native observation without cancelling or replaying work', async () => {
  for (const end of ['pause', 'revoke']) {
    const f = await nativeAttentionFixture()
    try {
      await f.attention()
      if (end === 'pause') await enabled(f.runtime, false)
      else { f.gate.allowed = false; assert.throws(() => f.runtime.currentAccess()) }
      assert.equal(f.observationSignal.aborted, false)
      assert.equal(f.runs.length, 1)
      f.native.resolve({ text: 'completed natively while disabled' }); await setImmediate()
      assert.equal(f.runs.length, 1)
      f.gate.allowed = true
      await enabled(f.runtime, true); await setImmediate()
      assert.equal(f.sent.filter(text => text.includes('completed natively while disabled')).length, 1)
    } finally { await f.close() }
  }
})

test('failed waiting-task guidance cannot make an ambiguous answer replayable after pause or restart', async () => {
  const sent = [], f = await nativeAttentionFixture({ client: { async sendText(_a, message) {
    sent.push(message.text)
    if (message.text.includes('本条消息未发送')) throw Error('synthetic send failure')
  } } })
  let snapshot
  try {
    await f.attention(); await f.send('5')
    assert.equal(f.runs.length, 1)
    assert.equal(f.storage.data.receipts.filter(row => row.state === 'uncertain').length, 1)
    await enabled(f.runtime, false); await enabled(f.runtime, true); await setImmediate()
    assert.equal(sent.filter(text => text.includes('本条消息未发送')).length, 1)
    snapshot = structuredClone(f.storage.data)
  } finally { await f.close() }
  const runtime = new ClawbotRuntime(memory(snapshot), host(() => assert.fail('no interrupted or ambiguous input replay')), client())
  try { await setImmediate(); assert.equal(runtime.snapshot().uncertain, 2) }
  finally { await runtime.dispose() }
})

test('terminal receive failure disables only the channel while native interaction can still complete', async () => {
  for (const code of ['clawbot-auth-expired', 'clawbot-capacity']) {
    const poll = deferred(), f = await nativeAttentionFixture({ client: { getUpdates() { return poll.promise } } })
    try {
      await f.attention()
      poll.reject(Object.assign(Error('synthetic terminal receive failure'), { code })); await setImmediate()
      assert.equal(f.runtime.snapshot().enabled, false)
      assert.equal(f.observationSignal.aborted, false)
      f.native.resolve({ text: 'native task finished' }); await setImmediate()
      assert.equal(f.runs.length, 1)
      assert.equal(f.storage.data.receipts[0].state, 'ready')
    } finally { poll.resolve({ messages: [], cursor: '' }); await f.close() }
  }
})

test('disposal ends only observation and leaves the interrupted receipt non-replayable', async () => {
  const f = await nativeAttentionFixture()
  try {
    await f.attention(); await f.runtime.dispose()
    assert.equal(f.observationSignal.aborted, true, 'local observer stops at plugin disposal')
    assert.equal(f.runs.length, 1)
    const runtime = new ClawbotRuntime(memory(f.storage.data), host(() => assert.fail('no native task replay')), client())
    try { await setImmediate(); assert.equal(runtime.snapshot().uncertain, 1) }
    finally { await runtime.dispose() }
  } finally { await f.close() }
})

test('RC32 upgrade retires old question prompts and rejects only possible queued answers of interrupted parents', async () => {
  for (const parentState of ['running', 'uncertain']) {
    const now = Date.now(), parent = receipt('legacy-parent', parentState, { createdAt: now })
    const notice = receipt('legacy-done-question', 'done', { input: '', parentId: parent.id, contextToken: '', createdAt: now + 1 })
    const possible = receipt('legacy-five', 'pending', { input: '5', createdAt: now + 2 })
    const preserved = [
      receipt('before-parent', 'pending', { input: 'earlier input', createdAt: now - 1 }),
      receipt('other-generation', 'pending', { target: { ...sessions[0], generation: 201 }, createdAt: now + 2 }),
      receipt('other-session', 'pending', { target: sessions[1], createdAt: now + 2 }),
      receipt('other-user', 'pending', { userId: 'another@im.wechat', createdAt: now + 2 }),
      receipt('control-command', 'pending', { input: '/状态', createdAt: now + 2 }),
    ]
    const storage = memory(seed({ receipts: [parent, notice, possible, ...preserved] }))
    const runtime = new ClawbotRuntime(storage, host(() => assert.fail('disabled upgrade must not dispatch')), client())
    try {
      const migrated = storage.data.receipts.find(row => row.id === possible.id)
      assert.equal(migrated.state, 'ready'); assert.equal(migrated.input, '')
      assert.match(migrated.output, /升级前待发消息未发送/)
      assert.equal(storage.data.receipts[0].state, 'uncertain')
      assert.ok(storage.data.receipts.every(row => row.parentId === undefined))
      for (const original of preserved) assert.deepEqual(storage.data.receipts.find(row => row.id === original.id), original)
      assert.deepEqual(storage.data.credentials, auth); assert.deepEqual(storage.data.target, sessions[0])
    } finally { await runtime.dispose() }
    const newInput = receipt('next-launch-input', 'pending', { input: 'a later ordinary task', createdAt: now + 3 })
    const nextStore = memory({ ...storage.data, receipts: [...storage.data.receipts, newInput] })
    const next = new ClawbotRuntime(nextStore, host(() => assert.fail('disabled restart must not dispatch')), client())
    try {
      assert.deepEqual(nextStore.data.receipts.find(row => row.id === newInput.id), newInput,
        'migration must not permanently suppress new input to the same session on later launches')
    } finally { await next.dispose() }
  }
})

test('RC32 orphan ready and partially sent question notices are sealed without delivering stale answer commands', async () => {
  for (const state of ['ready', 'sending']) {
    const notice = receipt('orphan-question', state, { parentId: receipt('missing-parent').id, input: '',
      output: 'stale /回答 QB9DBE4CC72 5', ...(state === 'sending' ? { parts: ['first', 'second'], sentParts: 0 } : {}) })
    const storage = memory(seed({ enabled: true, receipts: [notice] }))
    const runtime = new ClawbotRuntime(storage, host(() => assert.fail('no orphan dispatch')),
      client({ async sendText() { assert.fail('no stale question delivery') } }))
    try {
      await setImmediate()
      assert.equal(storage.data.receipts[0].state, state === 'sending' ? 'uncertain' : 'done')
      for (const key of ['parentId', 'parts', 'output']) assert.equal(storage.data.receipts[0][key], undefined)
      assert.equal(storage.data.receipts[0].contextToken, '')
    } finally { await runtime.dispose() }
  }
})

test('RC32 upgrade does not replay queued answers after a paused parent completed through its native card', async () => {
  for (const state of ['ready', 'done']) {
    const parent = receipt('completed-legacy-parent', state, { input: '', output: 'native finished' })
    const notice = receipt('completed-legacy-question', 'done', { input: '', contextToken: '', parentId: parent.id })
    const pending = receipt('completed-queued-five', 'pending', { input: '5', createdAt: parent.createdAt + 1 })
    const storage = memory(seed({ receipts: [parent, notice, pending] }))
    const sent = [], runtime = new ClawbotRuntime(storage, host(() => assert.fail('old queued answer must not become a new task')),
      client({ async sendText(_a, message) { sent.push(message.text) } }))
    try {
      const migrated = storage.data.receipts.find(row => row.id === pending.id)
      assert.equal(migrated.state, 'ready'); assert.equal(migrated.input, '')
      assert.match(migrated.output, /升级前待发消息未发送/)
      assert.ok(storage.data.receipts.every(row => row.parentId === undefined))
      await enabled(runtime, true); await setImmediate()
      assert.equal(sent.filter(text => text.includes('升级前待发消息未发送')).length, 1)
      assert.equal(sent.filter(text => text.includes('native finished')).length, state === 'ready' ? 1 : 0)
      await enabled(runtime, false)
    } finally { await runtime.dispose() }
    const nextInput = receipt('next-launch-after-native-completion', 'pending', {
      input: 'new work after upgrade', createdAt: parent.createdAt + 2,
    })
    const nextStore = memory({ ...storage.data, receipts: [...storage.data.receipts, nextInput] }), runs = []
    const next = new ClawbotRuntime(nextStore, host(async input => { runs.push(input); return { text: 'new work done' } }), client())
    try {
      assert.deepEqual(nextStore.data.receipts.find(row => row.id === nextInput.id), nextInput)
      await enabled(next, true); await setImmediate()
      assert.deepEqual(runs.map(row => row.text), ['new work after upgrade'])
    } finally { await next.dispose() }
  }
})

test('media uses the captured native target with exact downloaded bytes; command captions do not drop files', async () => {
  const sent = [], runs = [], downloads = [], storage = memory()
  const media = mediaFixture(), bytes = Buffer.from('synthetic file')
  const runtime = new ClawbotRuntime(storage, host(async input => {
    input.checkAdmission(); runs.push(input); return { text: 'received' }
  }), client({ async downloadMedia(ref) { downloads.push(ref); return { name: ref.name, data: bytes } },
    async sendText(_auth, message) { sent.push(message.text) } }))
  try {
    runtime.ingest([{ ...incoming('media', '/状态'), media: [media] }], 'media-cursor')
    assert.deepEqual(storage.data.receipts[0].media, [media])
    await enabled(runtime, true); await setImmediate()
    assert.equal(runs.length, 1); assert.equal(downloads.length, 1); assert.equal(runs[0].sessionId, sessions[0].id)
    assert.equal(runs[0].text, '/状态'); assert.deepEqual(runs[0].attachments, [{ kind: 'file', name: media.name, data: bytes }])
    assert.ok(storage.data.receipts.every(row => row.media === undefined)); assert.match(sent[0], /received/)
    runtime.ingest([{ ...incoming('media', '/状态'), media: [media] }], 'duplicate')
    await setImmediate(); assert.equal(downloads.length, 1)
  } finally { await runtime.dispose() }
})

test('media-only messages work but mixed unsupported items never partially submit', async () => {
  const runs = [], storage = memory(), sent = []
  const runtime = new ClawbotRuntime(storage, host(async input => { runs.push(input); return { text: 'file received' } }),
    client({ async downloadMedia(ref) { return { name: ref.name, data: Buffer.from('fixture') } },
      async sendText(_auth, message) { sent.push(message.text) } }))
  try {
    runtime.ingest([{ ...incoming('only-file', ''), media: [mediaFixture()] },
      { ...incoming('unsupported-mixed', 'must not partially run'), media: [mediaFixture()], unsupported: true }], 'mixed')
    await enabled(runtime, true); await setImmediate()
    assert.equal(runs.length, 1); assert.equal(runs[0].text, ''); assert.equal(runs[0].attachments.length, 1)
    assert.ok(sent.some(text => /未发送到会话/.test(text)))
  } finally { await runtime.dispose() }
})

test('pause or entitlement revoke during download never submits the native task or leaks media secrets', async () => {
  for (const action of ['pause', 'revoke', 'failure']) {
    const gate = featureGate(), downloaded = deferred(), storage = memory(), sent = []
    let count = 0
    const runtime = new ClawbotRuntime(storage, host(() => assert.fail('must not submit')), client({
      downloadMedia() { count++; return downloaded.promise }, async sendText(_auth, message) { sent.push(message.text) },
    }), Date.now, gate)
    try {
      runtime.ingest([{ ...incoming(action, ''), media: [mediaFixture()] }], action)
      await enabled(runtime, true); await setImmediate(); assert.equal(count, 1)
      if (action === 'pause') await enabled(runtime, false)
      if (action === 'revoke') gate.allowed = false
      if (action === 'failure') downloaded.reject(Error('https://secret-url/?key=secret'))
      else downloaded.resolve({ name: 'note.txt', data: Buffer.from('fixture') })
      await setImmediate()
      assert.ok(storage.data.receipts.every(row => row.media === undefined))
      assert.doesNotMatch(JSON.stringify(sent), /secret-url|key=secret/)
      if (action === 'failure') assert.match(sent[0], /附件未能完整接收/)
    } finally { downloaded.resolve({ name: 'note.txt', data: Buffer.from('fixture') }); await runtime.dispose() }
  }
})

test('a later file failure or total media budget never dispatches only the earlier files', async () => {
  for (const mode of ['failure', 'budget']) {
    const storage = memory(), sent = []; let downloads = 0
    const runtime = new ClawbotRuntime(storage, host(() => assert.fail('must not submit partial files')), client({
      async downloadMedia(ref) {
        downloads++
        if (mode === 'failure' && downloads === 2) throw Error('synthetic failure')
        return { name: ref.name, data: Buffer.alloc(mode === 'budget' ? 10 * 1024 * 1024 : 1) }
      }, async sendText(_auth, message) { sent.push(message.text) },
    }))
    try {
      runtime.ingest([{ ...incoming(mode, 'files'), media: Array.from({ length: 4 }, (_, i) => mediaFixture('file', `${i}.txt`)) }], mode)
      await enabled(runtime, true); await setImmediate()
      assert.equal(downloads, mode === 'failure' ? 2 : 4); assert.equal(sent.length, 1)
      assert.match(sent[0], /本条消息未发送/); assert.ok(storage.data.receipts.every(row => row.media === undefined))
    } finally { await runtime.dispose() }
  }
})

test('incoming media during native Q&A gets guidance without downloading, and media metadata is bounded on disk', async () => {
  const done = deferred(), storage = memory(), sent = []
  const runtime = new ClawbotRuntime(storage, host(async (_input, _signal, attention) => {
    attention('question'); return done.promise
  }), client({ downloadMedia: () => assert.fail('must not download answers'), async sendText(_auth, message) { sent.push(message.text) } }))
  try {
    runtime.ingest([incoming('question', 'ask')], 'ask')
    await enabled(runtime, true); await setImmediate()
    runtime.ingest([{ ...incoming('image-answer', ''), media: [mediaFixture('image', 'image.png')] }], 'answer')
    // Wake the same delivery queue without creating another worker/task.
    await enabled(runtime, true); await setImmediate()
    assert.ok(sent.some(text => text.includes('本条消息未发送')))
    assert.ok(storage.data.receipts.every(row => row.media === undefined))
    done.resolve({ text: 'native completed' }); await setImmediate()
    assert.throws(() => runtime.ingest([{ ...incoming('bad-ref', ''), media: [{ ...mediaFixture(), url: 'http://127.0.0.1/private' }] }], 'bad'), /记录格式/)
    assert.equal(storage.data.cursor, 'answer')
  } finally { done.resolve({ text: 'native completed' }); await runtime.dispose() }
})

test('native deliverables send text then separate image/file messages with captured identity and ordered durable parts', async () => {
  const storage = memory(), uploads = [], sent = []
  const runtime = new ClawbotRuntime(storage, host(async () => ({ text: '成果已完成', attachments: [
    { kind: 'image', name: 'chart.png', data: Buffer.from('img') }, { kind: 'file', name: 'report.pdf', data: Buffer.from('pdf') },
  ] })), client({
    async prepareMedia(a, part, _s, check) { check(); assert.deepEqual(a, auth); uploads.push(part); return preparedFixture(part.kind, part.name) },
    async sendText(a, part) { sent.push({ type: 'text', a, ...part }); assert.equal(storage.data.receipts[0].state, 'sending') },
    async sendMedia(a, part) { sent.push({ type: part.media.kind, a, ...part }); assert.equal(storage.data.receipts[0].state, 'sending') },
  }))
  try {
    runtime.ingest([incoming('outputs', '生成成果')], 'out'); await enabled(runtime, true); await setImmediate()
    assert.deepEqual(sent.map(p => p.type), ['text', 'image', 'file']); assert.equal(uploads.length, 2)
    assert.deepEqual(uploads.map(p => [...p.data]), [[105, 109, 103], [112, 100, 102]])
    assert.ok(sent.every(p => p.userId === auth.userId && p.contextToken === 'synthetic-context'))
    assert.equal(new Set(sent.map(p => p.clientId)).size, 3)
    assert.equal(storage.data.receipts[0].state, 'done'); assert.equal(storage.data.receipts[0].parts, undefined)
    assert.doesNotMatch(JSON.stringify(storage.data), /synthetic-upload|1234567890abcdef|chart.png/)
  } finally { await runtime.dispose() }
})

test('failed media send after acknowledged text is uncertain and never replays text or subsequent media on restart', async () => {
  const storage = memory(); let texts = 0, media = 0, runs = 0
  const runtime = new ClawbotRuntime(storage, host(async () => {
    runs++; return { text: 'final', attachments: [1, 2].map(i => ({ kind: 'file', name: `result${i}.pdf`, data: Buffer.from('pdf') })) }
  }), client({ async prepareMedia(_a, p) { return preparedFixture(p.kind, p.name) },
    async sendText() { texts++ }, async sendMedia() { media++; throw Error('ambiguous send') } }))
  try {
    runtime.ingest([incoming('uncertain-media', 'create')], 'out'); await enabled(runtime, true); await setImmediate()
    assert.equal(texts, 1); assert.equal(media, 1); assert.equal(runs, 1)
    assert.equal(storage.data.receipts[0].state, 'uncertain'); assert.equal(storage.data.receipts[0].parts, undefined)
  } finally { await runtime.dispose() }
  const restarted = new ClawbotRuntime(memory(storage.data), host(() => assert.fail('no rerun')), client({
    sendText: () => assert.fail('no text replay'), sendMedia: () => assert.fail('no file replay'),
  }))
  try { await setImmediate(); assert.equal(restarted.snapshot().uncertain, 1) } finally { await restarted.dispose() }
})

test('pause/revoke/disconnect while preparing output prevents late media send and preserves completed native text when still bound', async () => {
  for (const action of ['pause', 'revoke', 'disconnect']) {
    const pending = deferred(), gate = featureGate(), storage = memory(); let sent = 0, uploads = 0, runs = 0
    const runtime = new ClawbotRuntime(storage, host(async () => {
      runs++; return { text: '原任务完成', attachments: [{ kind: 'file', name: 'a.pdf', data: Buffer.from('pdf') }] }
    }), client({ async prepareMedia(_a, _p, _s, check) { uploads++; await pending.promise; check(); return preparedFixture() },
      async sendText() { sent++ }, async sendMedia() { sent++ } }), Date.now, gate)
    try {
      runtime.ingest([incoming(action + '-output', 'create')], 'out'); await enabled(runtime, true); await setImmediate()
      assert.equal(uploads, 1)
      if (action === 'revoke') gate.allowed = false
      else if (action === 'pause') await enabled(runtime, false)
      else {
        await enabled(runtime, false)
        await runtime.control({ action: 'disconnect', abandonPending: true, expectedRevision: runtime.snapshot().revision }, signal())
      }
      pending.resolve(); await setImmediate()
      assert.equal(runs, 1); assert.equal(sent, 0)
      if (action !== 'disconnect') {
        assert.equal(storage.data.receipts[0].state, 'ready'); assert.match(storage.data.receipts[0].output, /原任务完成/)
        assert.match(storage.data.receipts[0].output, /部分附件/); assert.equal(storage.data.receipts[0].parts, undefined)
      } else assert.ok(storage.data.receipts.every(r => ['done', 'uncertain'].includes(r.state)))
    } finally { pending.resolve(); await runtime.dispose() }
  }
})

test('acknowledged text plus pending media survives pause/restart without reupload or repeating text', async () => {
  const gate = featureGate(), storage = memory(); let texts = 0, uploads = 0
  const runtime = new ClawbotRuntime(storage, host(async () => ({ text: 'ready', attachments: [
    { kind: 'file', name: 'a.pdf', data: Buffer.from('pdf') },
  ] })), client({ async prepareMedia() { uploads++; return preparedFixture() },
    async sendText() { texts++; gate.allowed = false }, sendMedia: () => assert.fail('revoked') }), Date.now, gate)
  try {
    runtime.ingest([incoming('pause-parts', 'create')], 'out'); await enabled(runtime, true); await setImmediate()
    assert.equal(texts, 1); assert.equal(uploads, 1)
    assert.equal(storage.data.receipts[0].state, 'ready'); assert.equal(storage.data.receipts[0].sentParts, 1)
  } finally { await runtime.dispose() }
  gate.allowed = true
  const next = memory(storage.data); let media = 0
  const restarted = new ClawbotRuntime(next, host(() => assert.fail('no rerun')), client({
    prepareMedia: () => assert.fail('no reupload'), sendText: () => assert.fail('no text replay'), async sendMedia() { media++ },
  }), Date.now, gate)
  try { await enabled(restarted, true); await setImmediate(); assert.equal(media, 1); assert.equal(next.data.receipts[0].state, 'done') }
  finally { await restarted.dispose() }
})

test('oversized/failed output preparation retains text, does not submit another task and exposes no provider details', async () => {
  for (const count of [1, 7]) {
    const storage = memory(), sent = []; let runs = 0, uploads = 0
    const runtime = new ClawbotRuntime(storage, host(async () => {
      runs++; return { text: '文本成果', attachments: Array.from({ length: count }, () => ({ kind: 'file', name: 'a.pdf', data: Buffer.from('pdf') })) }
    }), client({ async prepareMedia() { uploads++; throw Error('provider secret path token') }, async sendText(_a, p) { sent.push(p.text) } }))
    try {
      runtime.ingest([incoming('failed-' + count, 'create')], 'out'); await enabled(runtime, true); await setImmediate()
      assert.equal(runs, 1); assert.equal(uploads, count === 1 ? 1 : 0)
      assert.equal(sent.length, 1); assert.match(sent[0], /文本成果/); assert.match(sent[0], /部分附件/)
      assert.doesNotMatch(sent[0], /secret|token/)
    } finally { await runtime.dispose() }
  }
})

test('outbox rejects malformed or cross-account prepared media and never loses its old ledger', async () => {
  for (const patch of [{ userId: 'foreign@im.wechat' }, { accountId: 'foreign@im.bot' }, { bytes: 100 * 1024 * 1024 }, { aesKey: 'bad' }]) {
    const original = seed({ receipts: [receipt('bad-outbox', 'ready', { input: '', output: 'ready', parts: [{ ...preparedFixture(), ...patch }], sentParts: 0 })] })
    const storage = memory(original)
    // A revision update validates before persisting or starting any worker.
    storage.data.revision = 1
    assert.throws(() => new ClawbotRuntime(storage, host(), client()), /记录格式/)
    assert.deepEqual(storage.data.receipts, original.receipts)
  }
})
