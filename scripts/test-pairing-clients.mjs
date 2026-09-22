/** Cross-repository regression against immutable, UNMODIFIED mini-program
 * releases and the actual cloud HTTP routes. Only WeChat identity exchange and
 * the post-pairing DSH connection are simulated. No production data/network.
 * Set HARNESS_MINI_DIR / HARNESS_CLOUD_DIR for checkouts in other locations.
 */
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import vm from 'node:vm'
import { randomBytes } from 'node:crypto'
import { PublicRelayAgent, publicPairingPayload } from '../lib/public-relay-agent.js'
import PublicRelayGateway from '../lib/public-relay-gateway.js'

const root = fileURLToPath(new URL('../', import.meta.url))
const mini = path.resolve(process.env.HARNESS_MINI_DIR || path.join(root, '../research-wechat-miniprogram'))
const cloud = path.resolve(process.env.HARNESS_CLOUD_DIR || path.join(root, '../research-harness-remote-cloud-server'))
const { createRelayServer } = await import(pathToFileURL(path.join(cloud, 'src/server.js')))
const { RelayStore } = await import(pathToFileURL(path.join(cloud, 'src/store.js')))
const origin = 'https://relay.example.test'
const db = new RelayStore(':memory:')
const relay = createRelayServer({
  host: '127.0.0.1', port: 0, publicOrigin: origin,
  wechatAppId: 'fixture-mini', wechatAppSecret: 'not-used',
  accessTokenKey: randomBytes(32), subjectHmacKey: randomBytes(32), pairTicketKey: randomBytes(32),
  accessTokenTtlSeconds: 900, pairTicketTtlSeconds: 600,
  maxHttpBodyBytes: 32768, maxFrameBytes: 1048576, maxBufferedBytes: 2097152,
  heartbeatMs: 25000, proofWindowMs: 60000, authRateLimitPerMinute: 200,
  enrollRateLimitPerMinute: 200, entitlementsEnforced: true,
  betaMaxBytesPerPeriod: 1073741824, betaMaxConcurrentClients: 1,
  betaMaxBytesPerMinute: 16777216, ossEnabled: false,
}, db, { logger: { error() {} }, wechat: {
  exchange: async code => ({ openId: 'fixture-openid-' + code.split(':')[0] }),
} })
const temp = mkdtempSync(path.join(tmpdir(), 'pairing-clients-'))
const agents = []
// Invoke the same ticket boundary as gate-runtime.makePairEntry(), not a
// hand-built test ticket or the background cached status accessor.
const pairingStatus = agent => PublicRelayGateway.prototype.ensurePairingStatus.call({ agent })
let httpBase
function localUrl(url) {
  assert.equal(new URL(url).origin, origin, 'fixture must never call an external service')
  return httpBase + new URL(url).pathname
}
const sourceCache = new Map()
function source(ref, file) {
  const key = ref + ':' + file
  if (!sourceCache.has(key)) sourceCache.set(key,
    execFileSync('git', ['-C', mini, 'show', key], { encoding: 'utf8', maxBuffer: 4 * 1024 * 1024 }))
  return sourceCache.get(key)
}

function phone(ref, account) {
  const storage = new Map(), modules = new Map(), calls = []
  let definition, pending, serial = 0, scanValue, tamperIdentity = false
  const wx = {
    getStorageSync: key => storage.get(key),
    setStorageSync: (key, value) => storage.set(key, JSON.parse(JSON.stringify(value))),
    removeStorageSync: key => storage.delete(key),
    login(options) { calls.push('login'); options.success({ code: account + ':' + ++serial }) },
    scanCode(options) { options.success({ result: JSON.stringify(scanValue) }) },
    request(options) {
      calls.push(new URL(options.url).pathname)
      void fetch(localUrl(options.url), {
        method: options.method || 'GET', headers: options.header,
        body: options.data === undefined ? undefined : JSON.stringify(options.data),
      }).then(async response => {
        const data = await response.json()
        if (tamperIdentity && options.url.endsWith('/v1/pair/claim') && data.node) {
          data.node.identityPublicKey = 'untrusted-key'
        }
        options.success({ statusCode: response.status, data })
      }).catch(error => options.fail({ errMsg: error.message }))
      return { abort() {} }
    },
    showToast() {}, reLaunch() {},
  }
  const context = vm.createContext({ wx, console,
    Page(value) { definition = value },
    // Pairing finishes before navigation/route maintenance. These callbacks
    // must not open a DSH session or leave periodic tasks behind in this test.
    setTimeout() { return 0 }, clearTimeout() {}, setInterval() { return 0 }, clearInterval() {},
  })
  function load(file) {
    if (modules.has(file)) return modules.get(file).exports
    const module = { exports: {} }
    modules.set(file, module)
    const require = name => {
      assert.ok(name.startsWith('.'), 'mini snapshot must only import local modules')
      let target = path.posix.normalize(path.posix.join(path.posix.dirname(file), name))
      assert.ok(!target.startsWith('../'))
      if (!path.posix.extname(target)) target += '.js'
      return load(target)
    }
    vm.runInContext('(function(require,module,exports){\n' + source(ref, file) + '\n})', context,
      { filename: ref.slice(0, 8) + '/' + file })(require, module, module.exports)
    return module.exports
  }
  const store = load('utils/store.js')
  let connectedNode = ''
  store.connect = async config => { connectedNode = config.publicNode.nodeId; store.state.connected = true }
  load('pages/onboarding/onboarding.js')
  const page = Object.assign({}, definition, { data: {}, setData(value) { Object.assign(this.data, value) } })
  const claimPublic = page.claimPublic
  page.claimPublic = function (payload) { return pending = claimPublic.call(this, payload) }
  return {
    calls, store,
    async scan(payload) {
      pending = null; scanValue = payload
      page.onScan()
      assert.ok(pending, 'the real onScan must reach claimPublic')
      await pending
      return page.data.status
    },
    tamper() { tamperIdentity = true },
    get connectedNode() { return connectedNode },
  }
}

try {
  const address = await relay.listen()
  httpBase = 'http://127.0.0.1:' + address.port
  const refs = process.env.HARNESS_MINI_REFS?.split(',') || ['d8507e2^', '2a196f7', 'v1.7.1-trial.3']
  let total = 0
  for (const [generation, name] of refs.entries()) {
    const ref = execFileSync('git', ['-C', mini, 'rev-parse', name + '^{commit}'], { encoding: 'utf8' }).trim()
    const first = phone(ref, 'owner-' + generation), second = phone(ref, 'owner-' + generation)
    const group = []
    for (let index = 0; index < 3; index++) {
      const agent = new PublicRelayAgent({ enabled: true, relayOrigin: origin }, {
        agentVersion: 'fixture', identityPath: path.join(temp, generation + '-' + index + '.json'),
        hostName: 'fixture-host-' + index, onFrame() {},
        fetchImpl: (url, options) => fetch(localUrl(url), options),
      })
      agents.push(agent); group.push(agent)
      const status = await pairingStatus(agent)
      const payload = JSON.parse(publicPairingPayload(status, { host: '192.168.1.2', port: 3092 }))
      if (generation > 0 && index === 0) {
        const legacyPhone = phone(ref, 'owner-' + generation)
        const { relayOrigin: _alias, ...legacyPayload } = payload
        assert.match(await legacyPhone.scan(legacyPayload), /公网中继地址无效/,
          'unmodified released client reproduces the original QR failure')
        assert.equal(legacyPhone.calls.length, 0, 'original failure occurs before login or claim')
      }
      assert.match(await first.scan(payload), /已绑定当前微信账号/, name + ': fresh scan failed')
      assert.equal(first.connectedNode, status.nodeId)
    }
    total += 3
    const original = first.store.listAgentNodes().map(node => node.nodeId).sort()
    assert.equal(original.length, 3)
    for (const agent of group) {
      const previous = agent.snapshot()
      const status = await pairingStatus(agent)
      assert.equal(status.nodeId, previous.nodeId, 'recovery must retain the host node ID')
      assert.equal(status.identityPublicKey, previous.identityPublicKey, 'recovery must not rotate a valid host identity')
      assert.notEqual(status.pairingTicket, previous.pairingTicket, 'explicit QR generation must not reuse the consumed ticket')
      const payload = JSON.parse(publicPairingPayload(status, { host: '192.168.1.2', port: 3092 }))
      assert.match(await second.scan(payload), /已绑定当前微信账号/, name + ': owner recovery failed')
    }
    assert.equal(JSON.stringify(second.store.listAgentNodes().map(node => node.nodeId).sort()), JSON.stringify(original))
    assert.equal(db.db.prepare('SELECT COUNT(*) AS count FROM nodes').get().count, total)
    assert.equal(first.store.listAgentNodes().length, 3, 'old phone retains its records')

    const status = await pairingStatus(group[0])
    const payload = JSON.parse(publicPairingPayload(status, { host: '192.168.1.2', port: 3092 }))
    const outsider = phone(ref, 'outsider-' + generation)
    assert.match(await outsider.scan(payload), /already paired/)
    assert.equal(outsider.store.listAgentNodes().length, 0)
    // Wrong owner must not consume the valid owner's ticket.
    assert.match(await first.scan(payload), /已绑定当前微信账号/)
    assert.equal(first.store.listAgentNodes().length, 3, 'repeated scan must be idempotent locally')
    const replay = phone(ref, 'owner-' + generation)
    assert.match(await replay.scan(payload), /invalid or expired/)
    assert.equal(replay.store.listAgentNodes().length, 0)
    const expired = phone(ref, 'owner-' + generation)
    assert.match(await expired.scan({ ...payload, expiresAt: Date.now() - 1000 }), /过期/)
    assert.equal(expired.calls.length, 0, 'expired QR fails before login')
    const fresh = await pairingStatus(group[0])
    const mismatch = phone(ref, 'owner-' + generation); mismatch.tamper()
    assert.match(await mismatch.scan(JSON.parse(publicPairingPayload(fresh,
      { host: '192.168.1.2', port: 3092 }))), /身份与二维码不一致/)
    assert.equal(mismatch.store.listAgentNodes().length, 0)

    if (generation > 0) {
      const locator = phone(ref, 'owner-' + generation)
      assert.match(await locator.scan({ v: 1, mode: 'secure-lan-route',
        nodeId: fresh.nodeId, identityPublicKey: fresh.identityPublicKey,
        relayOrigin: origin, lan: { host: '192.168.1.2', port: 3092 } }), /仅供已配对手机/)
      assert.equal(locator.calls.length, 0, 'LAN-only QR never authorizes a new device')
    }
    console.log('PASS ' + name + ' (' + ref.slice(0, 12) + '): fresh 3 nodes, new-phone recovery 3 not 6, repeat scan, wrong owner, replay, expiry, identity mismatch')
  }
  console.log('Pairing HTTP regression passed. WeChat exchange and post-pair DSH connection are fixtures; no native phone claim is implied.')
} finally {
  for (const agent of agents) agent.stop()
  await relay.close()
  db.close()
  assert.ok(path.resolve(temp).startsWith(path.resolve(tmpdir()) + path.sep))
  rmSync(temp, { recursive: true, force: true })
}
