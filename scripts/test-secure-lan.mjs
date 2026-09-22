import assert from 'node:assert/strict'
import { SecureLanAdmissionPool } from '../lib/secure-lan.js'

const pool = new SecureLanAdmissionPool({
  maxPending: 4,
  maxPendingPerAddress: 2,
  maxActive: 2,
})

const first = pool.begin('::ffff:192.168.1.8')
const second = pool.begin('192.168.1.8')
assert.ok(first && second)
assert.equal(pool.begin('192.168.1.8'), null, 'one source cannot fill every pending handshake slot')

const other = pool.begin('192.168.1.9')
const thirdAddress = pool.begin('192.168.1.10')
assert.ok(other && thirdAddress)
assert.equal(pool.begin('192.168.1.11'), null, 'global pending handshake ceiling must hold')
assert.deepEqual(pool.snapshot(), { pending: 4, active: 0, addresses: 3 })

assert.equal(pool.authenticate(first), true)
assert.equal(pool.authenticate(first), false, 'one admission cannot authenticate twice')
assert.deepEqual(pool.snapshot(), { pending: 3, active: 1, addresses: 3 })

const replacement = pool.begin('192.168.1.8')
assert.ok(replacement, 'authentication releases only the pending slot for that source')
assert.equal(pool.authenticate(other), true)
assert.equal(pool.authenticate(second), false, 'active tunnel ceiling is independent from pending slots')

pool.release(first)
assert.equal(pool.authenticate(second), true, 'closing an authenticated tunnel releases active capacity')
pool.release(second)
pool.release(other)
pool.release(thirdAddress)
pool.release(replacement)
pool.release(replacement)
assert.deepEqual(pool.snapshot(), { pending: 0, active: 0, addresses: 0 })

console.log('secure LAN admission isolation tests passed')
