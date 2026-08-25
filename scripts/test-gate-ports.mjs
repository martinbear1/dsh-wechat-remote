import assert from 'node:assert/strict'
import http from 'node:http'

import { deriveGatePorts, describeGateListenFailure } from '../lib/gate-ports.js'

const web = deriveGatePorts('web', 'instance-web', {})
const defaults = deriveGatePorts('default', 'instance-default', {})
assert.deepEqual(
  { publicPort: web.publicPort, localPort: web.localPort, source: web.source },
  { publicPort: 3092, localPort: 3093, source: 'legacy-default' },
)
assert.equal(defaults.publicPort, 3092)
assert.equal(defaults.localPort, 3093)

const researchA = deriveGatePorts('research-a', 'instance-a', {})
const researchAAgain = deriveGatePorts('research-a', 'instance-a', {})
const researchB = deriveGatePorts('research-b', 'instance-b', {})
assert.deepEqual(researchAAgain, researchA, 'same Agent profile must retain its port pair')
assert.equal(researchA.source, 'profile-derived')
assert.ok(researchA.publicPort >= 32_000 && researchA.publicPort <= 39_998)
assert.ok(researchA.localPort < 49_152, 'derived ports must stay below Windows default ephemeral range')
assert.equal(researchA.publicPort % 2, 0)
assert.equal(researchA.localPort, researchA.publicPort + 1)
assert.notEqual(
  `${researchA.publicPort}/${researchA.localPort}`,
  `${researchB.publicPort}/${researchB.localPort}`,
  'the dual-profile regression fixtures must select separate pairs',
)

const overridden = deriveGatePorts('research-a', 'instance-a', {
  WECHAT_GATE_PORT: '51000',
  WECHAT_GATE_LOCAL_PORT: '51001',
})
assert.equal(overridden.publicPort, 51000)
assert.equal(overridden.localPort, 51001)
assert.equal(overridden.source, 'environment-override')

const invalid = deriveGatePorts('research-a', 'instance-a', {
  WECHAT_GATE_PORT: '99999',
  WECHAT_GATE_LOCAL_PORT: 'not-a-port',
})
assert.equal(invalid.publicPort, researchA.publicPort)
assert.equal(invalid.localPort, researchA.localPort)
assert.equal(invalid.warnings.length, 2)

const collision = deriveGatePorts('research-a', 'instance-a', {
  WECHAT_GATE_PORT: '52000',
  WECHAT_GATE_LOCAL_PORT: '52000',
})
assert.match(collision.warnings.join('\n'), /都配置为 52000/)

const occupied = describeGateListenFailure('local', '127.0.0.1', 51001, {
  code: 'EADDRINUSE',
  message: 'listen EADDRINUSE',
})
assert.equal(occupied.code, 'EADDRINUSE')
assert.match(occupied.message, /127\.0\.0\.1:51001 已被其他进程或 DSH profile 占用/)
assert.match(occupied.message, /WECHAT_GATE_LOCAL_PORT/)

// Node emits listen collisions asynchronously. The plugin installs a door-
// local error handler; this regression proves the event can be consumed and
// translated without becoming an uncaught process error.
const first = http.createServer()
await new Promise((resolve, reject) => {
  first.once('error', reject)
  first.listen(0, '127.0.0.1', resolve)
})
const address = first.address()
assert.ok(address && typeof address === 'object')
const second = http.createServer()
const collisionError = await new Promise(resolve => {
  second.once('error', resolve)
  second.listen(address.port, '127.0.0.1')
})
const collisionFailure = describeGateListenFailure('local', '127.0.0.1', address.port, collisionError)
assert.equal(collisionFailure.code, 'EADDRINUSE')
await new Promise(resolve => first.close(resolve))

console.log('gate port derivation tests passed')
