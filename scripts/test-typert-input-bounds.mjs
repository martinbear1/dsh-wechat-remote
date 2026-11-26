import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { z } from 'zod'
import { TYPERT } from '../lib/typert.host.js'
import { attachInputSizeBounds } from '../lib/typert-input-bounds.js'
import { attachLegacySchemaAccess } from '../lib/typert-schema-compat.js'
import { REMOTE_INPUT_LIMITS as limits } from '../lib/remote-input-limits.js'

function codec(namespace, method) {
  const invocation = TYPERT.invocations.find(row => row.namespace === namespace && row.method === method)
  assert.ok(invocation, `${namespace}/${method}`)
  return invocation.parameters.find(row => row.wire === 'request').codec
}
const ack = { scope: 's', surfaceId: 's', revision: 1, actionId: 'select-members', attemptId: 'a', outcome: 'success' }
const selection = memberRefs => ({ schema: 'human.members.ref.v1', taskId: 't', deliveryId: 'd', revision: 1, memberRefs })
const automation = recipientRefs => ({ scope: 's', expectedRevision: 1,
  taskRef: { schema: 'human.task.ref.v1', taskId: 't', deliveryId: 'd' },
  config: { trigger: 'all-recipients', roundId: 'r', instructions: 'i', existing: 'new-only',
    allowSessionResume: false, maxRuns: 100, timeoutSeconds: 60, concurrency: 1, recipientRefs } })
const cases = [
  ['humanTools', 'ack', limits.selectedMembers, values => ({ ...ack, selectionRef: selection(values) }), index => `member-${index}`],
  ['humanTools', 'automationPreview', limits.automationRecipients, automation, index => `recipient-${index}`],
  ['wechatAttachment', 'prepareBatch', limits.attachmentBatch, values => ({ sessionId: 's', attachments: values }), index => ({ attachmentId: `image-${index}` })],
]

test('both distributable layers lock the same patched Zod', () => {
  for (const location of ['', 'installer/']) {
    const manifest = JSON.parse(fs.readFileSync(new URL(`../${location}package.json`, import.meta.url)))
    const lock = JSON.parse(fs.readFileSync(new URL(`../${location}package-lock.json`, import.meta.url)))
    assert.equal(manifest.dependencies.zod, '4.6.7')
    assert.equal(lock.packages['node_modules/zod'].version, '4.6.7')
    assert.equal(lock.packages[''].dependencies.zod, '4.6.7')
  }
})

test('patched Zod rejects a constrained oversized collection before validating elements', () => {
  let reads = 0
  const input = Array.from({ length: 4096 }, () => ({ get value() { reads++; return false } }))
  const result = z.array(z.object({ value: z.string() })).max(6).safeParse(input)
  assert.equal(result.success, false)
  assert.equal(result.error.issues.length, 1)
  assert.equal(result.error.issues[0].code, 'too_big')
  assert.equal(reads, 0)
})

for (const [namespace, method, limit, request, valid] of cases) {
  test(`${namespace}/${method}: old schema and lazy create keep all valid entries at capacity`, () => {
    const current = codec(namespace, method)
    assert.equal(current.schema, current.create())
    const input = request(Array.from({ length: limit }, (_, i) => valid(i)))
    assert.deepEqual(current.schema.parse(input), input)
    assert.deepEqual(current.create().parse(input), input)
  })
  test(`${namespace}/${method}: oversized invalid collection rejected before touching any entry`, () => {
    let reads = 0
    const input = new Proxy(new Array(limit + 1).fill(false), {
      get(target, key, receiver) {
        if (/^\d+$/.test(String(key))) reads++
        return Reflect.get(target, key, receiver)
      },
    })
    const result = codec(namespace, method).schema.safeParse(request(input))
    assert.equal(result.success, false)
    assert.equal(result.error.issues.length, 1)
    assert.equal(reads, 0)
  })
  test(`${namespace}/${method}: in-capacity wrong element types still fail native schema`, () => {
    assert.equal(codec(namespace, method).create().safeParse(request([false])).success, false)
  })
}

test('selection records cannot bypass the bound via extra array-valued keys', () => {
  const large = { ...ack, selectionRef: { unexpected: new Array(21).fill(false) } }
  assert.equal(codec('humanTools', 'ack').create().safeParse(large).success, false)
  const wide = { ...ack, selectionRef: Object.fromEntries(Array.from({ length: 6 }, (_, i) => [`k${i}`, 'v'])) }
  assert.equal(codec('humanTools', 'ack').create().safeParse(wide).success, false)
  const wideTask = { ...ack, taskRef: { schema: 'human.task.ref.v1', taskId: 't', deliveryId: 'd', extra: 'v' } }
  assert.equal(codec('humanTools', 'ack').create().safeParse(wideTask).success, false)
})

test('capacity extension leaves outputs and unrelated generated codecs unchanged', () => {
  const result = { create: () => z.array(z.string()) }
  const other = { create: () => z.string() }
  const createResult = result.create, createOther = other.create
  const manifest = { schemas: [], invocations: [
    { namespace: 'unrelated', method: 'method', parameters: [{ wire: 'request', codec: other }], result },
  ] }
  attachInputSizeBounds(manifest)
  attachLegacySchemaAccess(manifest)
  assert.equal(result.create, createResult)
  assert.equal(other.create, createOther)
  assert.equal(result.schema.parse(new Array(2000).fill('value')).length, 2000)
})

test('missing expected request codec fails generation registration instead of silently skipping protection', () => {
  assert.throws(() => attachInputSizeBounds({ invocations: [{ namespace: 'humanTools', method: 'ack', parameters: [] }] }), /Missing bounded/)
})
