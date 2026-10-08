/** Executes the real TSX component with deterministic React hooks and RPC/timer
 * fixtures. No copied controller logic, browser, network, login or DSH profile. */
import assert from 'node:assert/strict'
import test from 'node:test'
import vm from 'node:vm'
import { build } from 'esbuild'
import { fileURLToPath } from 'node:url'

const { outputFiles } = await build({
  entryPoints: [fileURLToPath(new URL('../src/client/ClawbotPanel.tsx', import.meta.url))],
  bundle: true, write: false, platform: 'node', format: 'cjs', target: 'node22', jsx: 'automatic',
  external: ['react', 'react/jsx-runtime'],
  plugins: [{ name: 'css-fixture', setup(api) {
    api.onLoad({ filter: /\.module\.css$/ }, () => ({ contents: 'export default {}', loader: 'js' }))
  } }],
})
const source = outputFiles[0].text
const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b }); return { promise, resolve, reject } }
const clean = value => JSON.parse(JSON.stringify(value))
const status = (extra = {}) => ({ supported: true, revision: 1, enabled: false, state: 'error', paired: false,
  target: null, message: 'fixture status', pending: 0, uncertain: 0, ...extra })
const pairing = (state = 'wait') => ({ id: 'fixture-login', url: 'https://example.invalid/qr', qrDataUrl: 'data:image/png;base64,AA==', status: state, expiresAt: Date.now() + 300_000 })

function harness() {
  const cells = [], intervals = new Map(), calls = [], confirms = []
  let cursor = 0, dirty = false, tree, effects = [], intervalId = 0, disposed = false
  let now = Date.now(), confirmResult = true
  let owner = 0
  const makeCall = owner => request => {
    const reply = deferred(); calls.push({ owner, request: clean(request), ...reply }); return reply.promise
  }
  let call = makeCall(owner)
  const react = {
    useState(initial) {
      const index = cursor++
      if (!cells[index]) cells[index] = { value: typeof initial === 'function' ? initial() : initial }
      return [cells[index].value, next => { assert(!disposed, 'late response changed unmounted state')
        cells[index].value = typeof next === 'function' ? next(cells[index].value) : next; dirty = true }]
    },
    useRef(initial) { const index = cursor++; return cells[index] ||= { current: initial } },
    useEffect(effect, deps) {
      const index = cursor++, previous = cells[index]
      if (!previous || !deps || deps.some((v, i) => !Object.is(v, previous.deps?.[i]))) {
        const cell = cells[index] = { deps, cleanup: previous?.cleanup }
        effects.push(() => { cell.cleanup?.(); cell.cleanup = effect() })
      }
    },
  }
  const jsx = { Fragment: Symbol('Fragment'), jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }) }
  const module = { exports: {} }
  const context = vm.createContext({ module, exports: module.exports,
    require(name) { if (name === 'react') return react; if (name === 'react/jsx-runtime') return jsx; assert.fail('unexpected dependency: ' + name) },
    setInterval(fn, ms) { assert.equal(ms, 4000); intervals.set(++intervalId, fn); return intervalId },
    clearInterval(id) { intervals.delete(id) }, window: { confirm: text => { confirms.push(text); return confirmResult } },
    Date: class extends Date { static now() { return now } },
  })
  vm.runInContext(source, context)
  function render() {
    assert(!disposed); cursor = 0; dirty = false
    tree = module.exports.ClawbotPanel({ call, nodeName: 'DeepSeek Harness · Desktop', hostName: 'fixture-computer' })
    const pending = effects; effects = []; pending.forEach(effect => effect())
  }
  function nodes(value = tree) {
    if (Array.isArray(value)) return value.flatMap(node => nodes(node))
    return value && typeof value === 'object' ? [value, ...nodes(value.props?.children ?? null)] : []
  }
  function text(value = tree) {
    if (Array.isArray(value)) return value.map(node => text(node)).join('')
    if (value == null || typeof value === 'boolean') return ''
    return typeof value === 'object' ? text(value.props?.children ?? null) : String(value)
  }
  const find = predicate => { const found = nodes().filter(predicate); assert.equal(found.length, 1, 'expected exactly one fixture element'); return found[0] }
  const button = label => find(node => node.type === 'button' && text(node) === label)
  async function flush() {
    // RPC continuations and chained foreground requests settle deterministically.
    for (let i = 0; i < 12; i++) { await Promise.resolve(); if (dirty && !disposed) render() }
  }
  render()
  return {
    calls, button, find, text, nodes, flush, confirms,
    setConfirm(value) { confirmResult = value },
    advance(ms) { now += ms },
    async tick() { for (const fn of intervals.values()) fn(); await flush() },
    async click(label) { const node = button(label); assert(!node.props.disabled, label + ' must remain clickable'); node.props.onClick(); await flush() },
    async resolve(index, value) { calls[index].resolve(value); await flush() },
    async reject(index, error) { calls[index].reject(error); await flush() },
    async replaceCall() { call = makeCall(++owner); render(); await flush(); assert.equal(intervals.size, 1) },
    unmount() { for (const cell of cells) cell?.cleanup?.(); disposed = true; assert.equal(intervals.size, 0) },
  }
}

async function mounted(initial) {
  const h = harness()
  assert.deepEqual(h.calls.map(c => c.request), [{ action: 'status' }])
  await h.resolve(0, initial)
  return h
}

test('background long poll does not swallow cancel; late old success cannot restore cancelled pairing', async () => {
  const h = await mounted(status({ pairing: pairing() }))
  await h.tick(); await h.tick()
  assert.deepEqual(h.calls[1].request, { action: 'login.poll', loginId: 'fixture-login' })
  assert.equal(h.calls.length, 3, 'a second timer must not duplicate either pending poll')
  assert.deepEqual(h.calls[2].request, { action: 'status' }, 'provider long poll must not block status refresh')
  await h.click('取消配对')
  assert.deepEqual(h.calls[3].request, { action: 'login.cancel', loginId: 'fixture-login' })
  await h.resolve(3, status({ revision: 2, message: 'cancelled now' }))
  assert(!h.text().includes('取消配对')); assert(h.text().includes('cancelled now'))
  await h.resolve(1, status({ pairing: pairing('scaned'), message: 'late old pairing' }))
  await h.resolve(2, status({ pairing: pairing(), message: 'late old status' }))
  assert(!h.text().includes('late old pairing')); assert(!h.text().includes('取消配对'))
  assert(!h.button('刷新').props.disabled)
  h.unmount()
})

test('background long poll does not swallow foreground pause or overwrite its newer result', async () => {
  const h = await mounted(status({ pairing: pairing(), enabled: true }))
  await h.tick()
  h.find(n => n.type === 'input' && n.props.role === 'switch').props.onChange({ target: { checked: false } })
  await h.flush()
  assert.deepEqual(h.calls[3].request, { action: 'enabled', enabled: false, expectedRevision: 1 })
  await h.resolve(3, status({ revision: 2, pairing: pairing(), message: 'foreground result' }))
  await h.resolve(1, status({ pairing: pairing(), message: 'stale background result' }))
  assert(h.text().includes('foreground result')); assert(!h.text().includes('stale background result'))
  h.unmount()
})

test('verification-code foreground request remains cancellable and its late result is ignored', async () => {
  const h = await mounted(status({ pairing: pairing('need_verifycode') }))
  h.find(n => n.type === 'input' && n.props['aria-label'] === '微信验证码').props.onChange({ target: { value: '123456' } })
  await h.flush(); assert(!h.button('确认验证码').props.disabled)
  let prevented = false
  h.find(n => n.type === 'form').props.onSubmit({ preventDefault() { prevented = true } })
  await h.flush(); assert(prevented)
  assert.deepEqual(h.calls[1].request, { action: 'login.poll', loginId: 'fixture-login', verifyCode: '123456' })
  assert(h.button('确认验证码').props.disabled)
  await h.click('取消配对')
  assert.deepEqual(h.calls[2].request, { action: 'login.cancel', loginId: 'fixture-login' })
  await h.resolve(2, status({ revision: 2, message: 'cancelled code submission' }))
  await h.resolve(1, status({ revision: 3, paired: true, message: 'late verification success' }))
  assert(h.text().includes('cancelled code submission')); assert(!h.text().includes('late verification success'))
  assert(h.text().includes('生成配对二维码')); assert(!h.text().includes('重新配对'))
  h.unmount()
})

test('late cancelled poll error does not replace the current successful UI with an alert', async () => {
  const h = await mounted(status({ pairing: pairing() }))
  await h.tick(); await h.click('取消配对')
  await h.resolve(3, status({ revision: 2, message: 'cancelled now' }))
  await h.reject(1, Error('old provider cancellation'))
  assert(!h.nodes().some(n => n.props?.role === 'alert'))
  assert(h.text().includes('cancelled now'))
  h.unmount()
})

test('unmount stops the poll timer and ignores pending RPC responses', async () => {
  const h = await mounted(status({ pairing: pairing() }))
  await h.tick(); h.unmount()
  await h.resolve(1, status({ paired: true, message: 'must not update after unmount' }))
  await h.resolve(2, status({ message: 'must not update status after unmount' }))
  assert.equal(h.calls.length, 3)
})

test('replacing call during pending foreground starts the new status; old finally cannot unlock its lane', async () => {
  const h = harness()
  await h.flush(); assert(h.button('刷新').props.disabled)
  await h.replaceCall()
  assert.deepEqual(h.calls.map(c => ({ owner: c.owner, request: c.request })), [
    { owner: 0, request: { action: 'status' } }, { owner: 1, request: { action: 'status' } },
  ])
  await h.resolve(0, status({ message: 'old node status', target: { id: 'old', title: 'old target' } }))
  assert(!h.text().includes('old node status')); assert(!h.text().includes('old target'))
  assert(h.button('刷新').props.disabled, 'old foreground finally must not clear the new busy state')
  await h.tick()
  assert.equal(h.calls.length, 2, 'old finally must not unlock the new foreground lane for timer work')
  await h.resolve(1, status({ message: 'new node status' }))
  assert(h.text().includes('new node status')); assert(!h.button('刷新').props.disabled)
  h.unmount()
})

test('replacing call releases old polling lane; late old finally does not unlock a new pending poll', async () => {
  const h = await mounted(status({ pairing: pairing(), message: 'old node' }))
  await h.tick(); assert.equal(h.calls.length, 3)
  await h.replaceCall()
  assert.equal(h.calls[3].owner, 1); assert.deepEqual(h.calls[3].request, { action: 'status' })
  assert(!h.text().includes('old node')); assert(!h.text().includes('取消配对'))
  await h.resolve(3, status({ pairing: { ...pairing(), id: 'new-login' }, message: 'new node' }))
  await h.tick()
  assert.deepEqual(h.calls[4].request, { action: 'login.poll', loginId: 'new-login' })
  assert.equal(h.calls[4].owner, 1)
  await h.resolve(1, status({ pairing: pairing('scaned'), message: 'late old poll' }))
  await h.resolve(2, status({ pairing: pairing(), message: 'late old status' }))
  assert(!h.text().includes('late old poll')); assert(h.text().includes('new node'))
  await h.tick()
  assert.equal(h.calls.length, 6, 'old poll finally must not allow a duplicate new-node poll')
  await h.resolve(4, status({ paired: true, message: 'new node paired' }))
  assert(h.text().includes('new node paired'))
  h.unmount()
})

test('pairing comes before target selection and identifies this node and its computer', async () => {
  const h = await mounted(status({ state: 'disabled' }))
  assert(h.text().includes('当前节点：DeepSeek Harness · Desktop · fixture-computer'))
  assert(h.text().indexOf('微信配对') < h.text().indexOf('目标会话'))
  assert(h.find(n => n.type === 'input' && n.props.role === 'switch').props.disabled)
  assert(!h.button('生成配对二维码').props.disabled)
  assert(!h.nodes().some(n => n.type === 'img'))
  await h.click('生成配对二维码')
  assert.deepEqual(h.calls[1].request, { action: 'login.start' })
  h.unmount()
})

test('legacy enabled but unpaired still has an available pairing entry and pause switch', async () => {
  const h = await mounted(status({ enabled: true, state: 'unpaired' }))
  assert(!h.button('生成配对二维码').props.disabled)
  assert(!h.find(n => n.type === 'input' && n.props.role === 'switch').props.disabled)
  await h.click('生成配对二维码')
  assert.deepEqual(h.calls[1].request, { action: 'login.start' })
  assert(!h.calls.some(c => c.request.action === 'enabled'), 'the UI does not silently change existing settings')
  h.unmount()
})

test('status refresh discovers a pairing begun on the phone and displays the computer QR automatically', async () => {
  const h = await mounted(status({ state: 'disabled' }))
  await h.tick()
  assert.deepEqual(h.calls[1].request, { action: 'status' })
  await h.resolve(1, status({ revision: 2, pairing: pairing(), state: 'disabled' }))
  assert.equal(h.find(n => n.type === 'img').props.alt, '微信 ClawBot 配对二维码')
  assert(!h.calls.some(c => c.request.action === 'login.start'), 'displaying a remote attempt must not replace it')
  await h.tick()
  assert.deepEqual(h.calls[2].request, { action: 'login.poll', loginId: 'fixture-login' })
  assert.deepEqual(h.calls[3].request, { action: 'status' })
  h.unmount()
})

test('remote cancellation is visible while provider poll is pending and late success cannot restore its QR', async () => {
  const h = await mounted(status({ pairing: pairing() }))
  await h.tick()
  await h.resolve(2, status({ revision: 3, state: 'disabled' }))
  assert(!h.nodes().some(n => n.type === 'img'))
  assert(!h.text().includes('取消配对'))
  await h.resolve(1, status({ revision: 2, pairing: pairing('scaned') }))
  assert(!h.text().includes('取消配对'))
  await h.tick()
  assert.deepEqual(h.calls[3].request, { action: 'status' })
  h.unmount()
})

test('obsolete provider poll rejection does not show an alert for a remotely replaced pairing', async () => {
  const h = await mounted(status({ pairing: pairing() }))
  await h.tick()
  await h.resolve(2, status({ revision: 3, pairing: { ...pairing(), id: 'new-attempt' } }))
  await h.reject(1, Error('cancelled old attempt'))
  assert(!h.nodes().some(n => n.props?.role === 'alert'))
  await h.tick()
  assert.deepEqual(h.calls[3].request, { action: 'login.poll', loginId: 'new-attempt' })
  h.unmount()
})

test('expired and terminal attempts hide QR and regenerate only after an explicit click', async () => {
  for (const attempt of [pairing('expired'), pairing('verify_code_blocked'), pairing('binded_redirect'),
    { ...pairing(), expiresAt: Date.now() - 1 }]) {
    const h = await mounted(status({ pairing: attempt }))
    assert(!h.nodes().some(n => n.type === 'img'))
    await h.tick()
    assert.deepEqual(h.calls[1].request, { action: 'status' })
    await h.click('重新生成二维码')
    assert.deepEqual(h.calls[2].request, { action: 'login.start' })
    h.unmount()
  }
})

test('local pairing deadline hides QR even while both network requests remain pending', async () => {
  const h = await mounted(status({ pairing: pairing() }))
  await h.tick()
  assert(h.nodes().some(n => n.type === 'img'))
  h.advance(301_000); await h.tick()
  assert(!h.nodes().some(n => n.type === 'img'))
  assert(h.text().includes('二维码已过期'))
  assert.equal(h.calls.length, 3, 'expiry must not submit another request while lanes are occupied')
  h.unmount()
})

test('scanned and verification attempts show confirmation steps without another scannable QR', async () => {
  for (const state of ['scaned', 'scaned_but_redirect', 'need_verifycode']) {
    const h = await mounted(status({ pairing: pairing(state) }))
    assert(!h.nodes().some(n => n.type === 'img'))
    assert(!h.text().includes('重新生成二维码'))
    assert(h.text().includes('取消配对'))
    h.unmount()
  }
})

test('credential expiry is not presented as a healthy pairing or allowed to enable messages', async () => {
  const h = await mounted(status({ paired: true, bindingState: 'expired', state: 'disabled', target: { id: 's1', title: 'A' } }))
  assert(h.text().includes('需要重新配对'))
  assert(!h.text().includes('已配对此节点'))
  assert(h.find(n => n.type === 'input' && n.props.role === 'switch').props.disabled)
  h.setConfirm(false); await h.click('生成配对二维码')
  assert.equal(h.confirms.length, 1); assert.equal(h.calls.length, 1)
  h.setConfirm(true); await h.click('生成配对二维码')
  assert.deepEqual(h.calls[1].request, { action: 'login.start' })
  h.unmount()
})

test('running binding cannot be replaced or disconnected without first explicitly pausing', async () => {
  const h = await mounted(status({ paired: true, enabled: true, state: 'ready', target: { id: 's1', title: 'A' } }))
  assert(h.text().includes('已配对此节点')); assert(h.text().includes('已连接'))
  assert(h.button('重新配对').props.disabled); assert(h.button('移除配对').props.disabled)
  assert(!h.find(n => n.type === 'input' && n.props.role === 'switch').props.disabled)
  h.unmount()
})

test('an ended re-pairing attempt does not block resuming the existing valid binding', async () => {
  for (const state of ['expired', 'verify_code_blocked', 'binded_redirect']) {
    const h = await mounted(status({ paired: true, state: 'disabled', target: { id: 's1', title: 'A' }, pairing: pairing(state) }))
    const toggle = h.find(n => n.type === 'input' && n.props.role === 'switch')
    assert(!toggle.props.disabled)
    toggle.props.onChange({ target: { checked: true } }); await h.flush()
    assert.deepEqual(h.calls[1].request, { action: 'enabled', enabled: true, expectedRevision: 1 })
    await h.resolve(1, status({ revision: 2, paired: true, enabled: true, state: 'ready', target: { id: 's1', title: 'A' } }))
    assert(h.text().includes('已连接')); assert(!h.text().includes('取消配对'))
    h.unmount()
  }
})

test('paired without a target cannot start receiving, and no successful pairing auto-enables', async () => {
  const h = await mounted(status({ pairing: pairing(), state: 'disabled' }))
  await h.tick()
  await h.resolve(1, status({ paired: true, revision: 2, state: 'disabled' }))
  assert(h.find(n => n.type === 'input' && n.props.role === 'switch').props.disabled)
  assert(!h.calls.some(c => c.request.action === 'enabled'))
  assert(h.text().includes('选择会话后，即可开启微信消息'))
  h.unmount()
})

test('remote route changes update selection without discarding an unsubmitted local choice', async () => {
  const h = await mounted(status({ target: { id: 's1', title: 'A' } }))
  await h.tick(); await h.resolve(1, status({ revision: 2, target: { id: 's2', title: 'B' } }))
  assert.equal(h.find(n => n.type === 'select').props.value, 's2')
  h.find(n => n.type === 'select').props.onChange({ target: { value: 's3' } }); await h.flush()
  await h.tick(); await h.resolve(2, status({ revision: 3, target: { id: 's4', title: 'D' } }))
  assert.equal(h.find(n => n.type === 'select').props.value, 's3')
  await h.click('接到此会话')
  assert.deepEqual(h.calls[3].request, { action: 'route', sessionId: 's3', expectedRevision: 3 })
  await h.resolve(3, status({ revision: 4, target: { id: 's3', title: 'C' } }))
  assert(h.button('接到此会话').props.disabled)
  h.unmount()
})

test('loading the latest session list does not disable and close the focused selector', async () => {
  const h = await mounted(status())
  h.find(n => n.type === 'select').props.onFocus(); await h.flush()
  assert.deepEqual(h.calls[1].request, { action: 'sessions' })
  assert(!h.find(n => n.type === 'select').props.disabled)
  await h.resolve(1, { sessions: [{ id: 's1', title: 'New session' }] })
  assert(h.text().includes('New session'))
  h.unmount()
})
