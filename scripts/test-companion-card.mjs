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

test('the same confirmation names its destination without reversing direction on the receiving host', () => {
  for (const current of ['desktop', 'web']) {
    const rows = flatten(card({ value: { state: 'confirmation-required', message: 'Desktop 插件可更新',
      versions: { current, running: '1.7.12', installed: '1.7.12', peer: current === 'web' ? 'desktop' : 'web', peerInstalled: '1.7.13' } } }))
    assert.equal(rows.find(n => n?.type === 'strong').props.children, '是否更新下方指定端的插件？')
    assert(rows.includes('Desktop 插件可更新'))
  }
})

const text = tree => flatten(tree).filter(n => typeof n === 'string').join(' ')
test('compact peer row is named explicitly; an inbound offer still updates its real destination', () => {
  for (const current of ['desktop', 'web']) {
    const value = { state: 'confirmation-required', message: 'Desktop 插件从 1.7.10 更新至 1.7.12。', offerId: 'offer',
      target: { scope: 'desktop', fromVersion: '1.7.10', version: '1.7.12' },
      versions: { current, running: '1.7.12', installed: '1.7.12', peer: current === 'web' ? 'desktop' : 'web', peerInstalled: '1.7.10' } }
    const rendered = card({ value, compact: true, onDecide() {} }), rows = flatten(rendered)
    assert(text(rendered).includes(current === 'web' ? 'Desktop' : 'Web'))
    assert(text(rendered).includes('同一主机'))
    assert(rows.some(n => n?.type === 'button' && n.props.children === '确认更新 Desktop'))
    assert.match(text(rendered), /Desktop\s+可更新至/)
    assert(text(rendered).includes('连接会短暂中断'))
    assert(!text(rendered).includes('DSH'), 'installed peer data does not prove its host or running version')
  }
})

test('compact absent, idle, offline and stale peers never imply current runtime or an available update', () => {
  const absent = card({ value: { state: 'idle', message: '', versions: { current: 'desktop', running: '1.7.12', installed: '1.7.12', peer: 'web', peerInstalled: null } }, compact: true })
  assert.match(text(absent), /未检测到可同步更新的另一端/)
  assert(!flatten(absent).some(n => n?.type === 'button'))
  for (const state of ['idle', 'unavailable', 'unverified', 'restart-required', 'self-restart-required']) {
    const rendered = card({ value: { state, message: '请核对该端状态。', versions: { current: 'desktop', running: '1.7.12', installed: '1.7.12', peer: 'web', peerInstalled: '1.7.10' } }, compact: true })
    assert.match(text(rendered), /已安装 1.7.10/)
    assert(!text(rendered).includes('已对齐'))
    assert(!text(rendered).includes('最新'))
    assert(!flatten(rendered).some(n => n?.type === 'button'))
  }
})

test('compact progress and errors retain authoritative detail without offering another install', () => {
  for (const state of ['pending', 'busy', 'preparing', 'installing', 'verifying', 'recovering', 'restart-required', 'unavailable', 'complete']) {
    const rendered = card({ value: { state, message: 'Web: exact reason', target: { scope: 'web', fromVersion: '1.7.10', version: '1.7.12' },
      versions: { current: 'desktop', running: '1.7.12', installed: '1.7.12', peer: 'web', peerInstalled: '1.7.10' } }, compact: true })
    const rows = flatten(rendered)
    assert(rows.some(n => n?.type === 'details'))
    assert.match(text(rendered), /exact reason/)
    assert(!rows.some(n => n?.type === 'button'))
    assert.equal(rows.some(n => n?.type === 'progress'), ['preparing', 'installing', 'verifying', 'recovering'].includes(state))
  }
})

test('older server without display metadata retains exact message and a neutral confirmation', () => {
  const rendered = card({ value: { state: 'confirmation-required', message: 'Desktop 1.7.10 → 1.7.12', offerId: 'old' }, compact: true, onDecide() {} })
  assert.match(text(rendered), /Desktop 1.7.10 → 1.7.12/)
  assert(flatten(rendered).some(n => n?.type === 'button' && n.props.children === '确认更新指定端'))
  assert(!text(rendered).includes('确认更新 Web'))
})
