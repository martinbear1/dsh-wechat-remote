import assert from 'node:assert/strict'
import { test } from 'node:test'
import vm from 'node:vm'
import { build } from 'esbuild'
import { fileURLToPath } from 'node:url'
const output = await build({ entryPoints: [fileURLToPath(new URL('../src/client/CompanionUpdateCard.tsx', import.meta.url))],
  bundle: true, write: false, platform: 'node', format: 'cjs', jsx: 'automatic', external: ['react/jsx-runtime', '*.css'], logLevel: 'silent' })
const module = { exports: {} }
vm.runInNewContext(output.outputFiles[0].text, { module, exports: module.exports, require(id) {
  if (id.endsWith('.css')) return { companionCard: 'companion-card' }
  if (id === 'react/jsx-runtime') return { jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }) }
  throw Error(id)
} })
const card = module.exports.CompanionUpdateCard
function flatten(tree) { return !tree || typeof tree !== 'object' ? [tree] : Array.isArray(tree) ? tree.flatMap(flatten) : [tree, ...flatten(tree.props?.children)] }
test('idle is hidden; every active phase has a prominent live status and honest indeterminate progress', () => {
  assert.equal(card({}), null)
  assert.equal(card({ value: { state: 'idle', message: 'none' } }), null)
  for (const state of ['preparing', 'installing', 'verifying', 'recovering']) {
    const tree = card({ value: { state, message: 'Web：测试进度' } }), rows = flatten(tree)
    assert.equal(tree.type, 'aside'); assert.equal(tree.props.role, 'status')
    assert(rows.some(n => n?.type === 'strong'))
    const progress = rows.find(n => n?.type === 'progress')
    assert(progress); assert.equal(progress.props.value, undefined, 'do not invent a percentage')
    assert(rows.some(n => typeof n === 'string' && n.includes('暂勿退出')))
  }
})
test('waiting does not tell users to stop tasks; failure and restart are not success', () => {
  const waiting = flatten(card({ value: { state: 'busy', message: 'Web 正忙' } }))
  assert(waiting.some(n => typeof n === 'string' && n.includes('不用手动停止任务')))
  for (const state of ['busy', 'pending', 'restart-required', 'unavailable', 'complete']) {
    const rows = flatten(card({ value: { state, message: state } }))
    assert(!rows.some(n => n?.type === 'progress'))
    assert.equal(rows.includes('两端插件已对齐'), state === 'complete')
  }
})

test('confirmation requires an explicit click; deferred offers can resume and pending decisions disable both controls', () => {
  const decisions = []
  for (const state of ['confirmation-required', 'deferred']) {
    const before = decisions.length
    const rows = flatten(card({ value: { state, message: 'Web 1.7.10 → 1.7.12-rc.6', offerId: 'offer' }, onDecide: action => decisions.push(action) }))
    const buttons = rows.filter(n => n?.type === 'button')
    assert.equal(buttons.length, 2)
    assert(!rows.some(n => n?.type === 'progress'))
    assert.equal(decisions.length, before, 'render does not approve')
    buttons[1].props.onClick(); assert.equal(decisions.at(-1), 'later')
    buttons[0].props.onClick(); assert.equal(decisions.at(-1), 'approve')
    const busy = flatten(card({ value: { state, message: 'Web', offerId: 'offer' }, onDecide() {}, deciding: true }))
    assert(busy.filter(n => n?.type === 'button').every(n => n.props.disabled === true))
  }
  assert(!flatten(card({ value: { state: 'confirmation-required', message: 'Web' }, onDecide() {} })).some(n => n?.type === 'button'))
})
