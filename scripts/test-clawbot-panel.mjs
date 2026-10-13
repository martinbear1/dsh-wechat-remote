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
  external: ['react', 'react/jsx-runtime', '@deepseek-ai/dsh-client-ui-primitives'],
  plugins: [{ name: 'css-fixture', setup(api) {
    api.onLoad({ filter: /\.module\.css$/ }, () => ({ contents: 'export default {}', loader: 'js' }))
  } }],
})
const source = outputFiles[0].text
const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b }); return { promise, resolve, reject } }
const clean = value => JSON.parse(JSON.stringify(value))
const status = (extra = {}) => ({ supported: true, revision: 1, enabled: false, state: 'error', paired: false,
  target: null, message: 'fixture status', pending: 0, uncertain: 0,
  access: { allowed: true, reason: 'allowed', validUntil: Date.now() + 86400000, checkedAt: Date.now(), expiresAt: Date.now() + 60000, message: '' }, ...extra })
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
  const element = (type, props) => typeof type === 'function' ? type(props) : ({ type, props })
  const jsx = { Fragment: Symbol('Fragment'), jsx: element, jsxs: element }
  // Exercise the real shared wrappers with the public native primitive props.
  // The native Switch calls onChange(boolean); its DOM is the host's concern.
  const nativeUi = {
    Button: ({ size, variant, ...props }) => element('button', props),
    Tooltip: ({ children }) => children,
    StateDot: ({ state }) => element('span', { 'data-dot-state': state, 'aria-hidden': true }),
    Switch: ({ checked, onChange, label, ...props }) => element('input', {
      ...props, type: 'checkbox', role: 'switch', checked, 'aria-label': label,
      onChange: event => onChange(event.target.checked),
    }),
  }
  const module = { exports: {} }
  const context = vm.createContext({ module, exports: module.exports, Error,
    require(name) { if (name === 'react') return react; if (name === 'react/jsx-runtime') return jsx;
      if (name === '@deepseek-ai/dsh-client-ui-primitives') return nativeUi; assert.fail('unexpected dependency: ' + name) },
    setInterval(fn, ms) { assert.equal(ms, 4000); intervals.set(++intervalId, fn); return intervalId },
    clearInterval(id) { intervals.delete(id) }, window: { confirm: text => { confirms.push(text); return confirmResult } },
    Date: class extends Date { static now() { return now } },
  })
  vm.runInContext(source, context)
  function render() {
    assert(!disposed); cursor = 0; dirty = false
    tree = module.exports.ClawbotPanel({ call })
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
  const button = label => find(node => node.type === 'button' && (node.props['aria-label'] || text(node)) === label)
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

test('missing, expired, malformed or denied entitlement cannot bind, route or enable; read, cancel and pause remain available', async () => {
  const now = Date.now()
  for (const access of [undefined,
    { allowed: false, reason: 'public_quota_exhausted', validUntil: null, message: '公网流量已用尽' },
    { allowed: true, reason: 'allowed', validUntil: now + 60000 },
    { allowed: true, reason: 'allowed', validUntil: now + 60000, checkedAt: now - 60001, expiresAt: now - 1 },
    { allowed: true, reason: 'allowed', validUntil: now + 60000, checkedAt: now, expiresAt: now + 60001 },
    { allowed: true, reason: 'allowed', validUntil: now - 1, checkedAt: now, expiresAt: now + 60000 },
  ]) {
    const h = await mounted(status({ access, pairing: pairing(), enabled: true, paired: true, target: { id: 's1', title: 'A' } }))
    await h.tick()
    assert.deepEqual(h.calls[1].request, { action: 'status' }, 'denial stops provider polling, not status refresh')
    assert.equal(h.calls.length, 2)
    h.find(n => n.type === 'select').props.onChange({ target: { value: 's2' } }); await h.flush()
    assert(h.button('接到此会话').props.disabled)
    assert(!h.find(n => n.props?.role === 'switch').props.disabled, 'pause remains possible')
    await h.click('取消绑定')
    assert.equal(h.calls[2].request.action, 'login.cancel')
    h.unmount()
    const empty = await mounted(status({ access }))
    assert(empty.button('显示绑定码').props.disabled)
    assert(empty.find(n => n.props?.role === 'switch').props.disabled)
    empty.unmount()
  }
})

test('native session selector groups the existing directory without extra requests and disambiguates untitled sessions', async () => {
  const h = await mounted(status())
  h.find(n => n.type === 'select').props.onFocus(); await h.flush()
  await h.resolve(1, { sessions: [
    { id: 'session-12345678', title: '未命名', workspaceId: 'w1', workspaceTitle: '教学' },
    { id: 'session-87654321', title: '未命名', workspaceId: 'w2', workspaceTitle: '项目' },
    { id: 'standalone', title: '独立会话' },
  ] })
  assert.deepEqual(h.nodes().filter(n => n.type === 'optgroup').map(n => n.props.label), ['教学', '项目', '未分组'])
  assert(h.text().includes('未命名 · 12345678')); assert(h.text().includes('未命名 · 87654321'))
  assert.equal(h.calls.length, 2)
  h.unmount()
})

test('background long poll does not swallow cancel; late old success cannot restore cancelled pairing', async () => {
  const h = await mounted(status({ pairing: pairing() }))
  await h.tick(); await h.tick()
  assert.deepEqual(h.calls[1].request, { action: 'login.poll', loginId: 'fixture-login' })
  assert.equal(h.calls.length, 3, 'a second timer must not duplicate either pending poll')
  assert.deepEqual(h.calls[2].request, { action: 'status' }, 'provider long poll must not block status refresh')
  await h.click('取消绑定')
  assert.deepEqual(h.calls[3].request, { action: 'login.cancel', loginId: 'fixture-login' })
  await h.resolve(3, status({ revision: 2, message: 'cancelled now' }))
  assert(!h.text().includes('取消绑定')); assert(h.text().includes('cancelled now'))
  await h.resolve(1, status({ pairing: pairing('scaned'), message: 'late old pairing' }))
  await h.resolve(2, status({ pairing: pairing(), message: 'late old status' }))
  assert(!h.text().includes('late old pairing')); assert(!h.text().includes('取消绑定'))
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
  await h.click('取消绑定')
  assert.deepEqual(h.calls[2].request, { action: 'login.cancel', loginId: 'fixture-login' })
  await h.resolve(2, status({ revision: 2, message: 'cancelled code submission' }))
  await h.resolve(1, status({ revision: 3, paired: true, message: 'late verification success' }))
  assert(h.text().includes('cancelled code submission')); assert(!h.text().includes('late verification success'))
  assert(h.text().includes('显示绑定码')); assert(!h.text().includes('重新绑定'))
  h.unmount()
})

test('late cancelled poll error does not replace the current successful UI with an alert', async () => {
  const h = await mounted(status({ pairing: pairing() }))
  await h.tick(); await h.click('取消绑定')
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
  assert(!h.text().includes('old node')); assert(!h.text().includes('取消绑定'))
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

test('desktop removes redundant node copy while keeping accessible binding state and actions', async () => {
  const h = await mounted(status({ state: 'disabled' }))
  assert(!h.text().includes('当前节点：'))
  assert(!h.nodes().some(n => h.text(n) === '节点绑定'))
  const binding = h.find(n => n.props?.['aria-label'] === '节点绑定')
  assert(h.text(binding).includes('未绑定'))
  assert(h.text().indexOf('未绑定') < h.text().indexOf('接入会话'))
  assert(h.find(n => n.type === 'input' && n.props.role === 'switch').props.disabled)
  assert(!h.button('显示绑定码').props.disabled)
  assert(!h.nodes().some(n => n.type === 'img'))
  await h.click('显示绑定码')
  assert.deepEqual(h.calls[1].request, { action: 'login.start', expectedRevision: 1 })
  h.unmount()
})

test('legacy enabled but unpaired still has an available pairing entry and pause switch', async () => {
  const h = await mounted(status({ enabled: true, state: 'unpaired' }))
  assert(!h.button('显示绑定码').props.disabled)
  assert(!h.find(n => n.type === 'input' && n.props.role === 'switch').props.disabled)
  await h.click('显示绑定码')
  assert.deepEqual(h.calls[1].request, { action: 'login.start', expectedRevision: 1 })
  assert(!h.calls.some(c => c.request.action === 'enabled'), 'the UI does not silently change existing settings')
  h.unmount()
})

test('status refresh discovers a pairing begun on the phone and displays the computer QR automatically', async () => {
  const h = await mounted(status({ state: 'disabled' }))
  await h.tick()
  assert.deepEqual(h.calls[1].request, { action: 'status' })
  await h.resolve(1, status({ revision: 2, pairing: pairing(), state: 'disabled' }))
  assert.equal(h.find(n => n.type === 'img').props.alt, '微信 ClawBot 节点绑定码')
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
  assert(!h.text().includes('取消绑定'))
  await h.resolve(1, status({ revision: 2, pairing: pairing('scaned') }))
  assert(!h.text().includes('取消绑定'))
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
    await h.click('重新显示绑定码')
    assert.deepEqual(h.calls[2].request, { action: 'login.start', expectedRevision: 1 })
    h.unmount()
  }
})

test('local pairing deadline hides QR even while both network requests remain pending', async () => {
  const h = await mounted(status({ pairing: pairing() }))
  await h.tick()
  assert(h.nodes().some(n => n.type === 'img'))
  h.advance(301_000); await h.tick()
  assert(!h.nodes().some(n => n.type === 'img'))
  assert(h.text().includes('绑定码已过期'))
  assert.equal(h.calls.length, 3, 'expiry must not submit another request while lanes are occupied')
  h.unmount()
})

test('scanned and verification attempts show confirmation steps without another scannable QR', async () => {
  for (const state of ['scaned', 'scaned_but_redirect', 'need_verifycode']) {
    const h = await mounted(status({ pairing: pairing(state) }))
    assert(!h.nodes().some(n => n.type === 'img'))
    assert(!h.text().includes('重新显示绑定码'))
    assert(h.text().includes('取消绑定'))
    h.unmount()
  }
})

test('credential expiry is not presented as a healthy pairing or allowed to enable messages', async () => {
  const h = await mounted(status({ paired: true, bindingState: 'expired', state: 'disabled', target: { id: 's1', title: 'A' } }))
  assert(h.text().includes('绑定已失效'))
  assert(!h.text().includes('已绑定此节点'))
  assert(h.find(n => n.type === 'input' && n.props.role === 'switch').props.disabled)
  h.setConfirm(false); await h.click('重新绑定')
  assert.equal(h.confirms.length, 1); assert.equal(h.calls.length, 1)
  h.setConfirm(true); await h.click('重新绑定')
  assert.deepEqual(h.calls[1].request, { action: 'login.start', expectedRevision: 1 })
  h.unmount()
})

test('running binding requires confirmation then a fenced pause before starting a replacement', async () => {
  const h = await mounted(status({ paired: true, enabled: true, state: 'ready', target: { id: 's1', title: 'A' } }))
  assert(h.text().includes('已绑定此节点')); assert(h.text().includes('接收中'))
  assert(!h.button('重新绑定').props.disabled); assert(!h.button('移除绑定').props.disabled)
  assert(!h.find(n => n.type === 'input' && n.props.role === 'switch').props.disabled)
  h.setConfirm(false); await h.click('重新绑定')
  assert.equal(h.calls.length, 1, 'cancelled confirmation makes no writes')
  assert(h.confirms[0].includes('先暂停')); assert(h.confirms[0].includes('手动开启'))
  h.setConfirm(true); await h.click('重新绑定')
  assert.deepEqual(h.calls[1].request, { action: 'enabled', enabled: false, expectedRevision: 1 })
  assert(!h.calls.some(c => c.request.action === 'login.start'))
  await h.resolve(1, status({ revision: 2, paired: true, state: 'disabled', target: { id: 's1', title: 'A' } }))
  assert.deepEqual(h.calls[2].request, { action: 'login.start', expectedRevision: 2 })
  await h.resolve(2, status({ revision: 3, paired: true, state: 'disabled', pairing: pairing(), target: { id: 's1', title: 'A' } }))
  assert(h.nodes().some(n => n.type === 'img'))
  assert(!h.calls.some(c => c.request.action === 'enabled' && c.request.enabled))
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
    assert(h.text().includes('接收中')); assert(!h.text().includes('取消绑定'))
    h.unmount()
  }
})

test('paired without a target cannot start receiving, and no successful pairing auto-enables', async () => {
  const h = await mounted(status({ pairing: pairing(), state: 'disabled' }))
  await h.tick()
  await h.resolve(1, status({ paired: true, revision: 2, state: 'disabled' }))
  assert(h.find(n => n.type === 'input' && n.props.role === 'switch').props.disabled)
  assert(!h.calls.some(c => c.request.action === 'enabled'))
  assert(h.text().includes('选择会话后可开启'))
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

test('disconnect confirms the pending-work consequence and pauses before the revision-fenced removal', async () => {
  const h = await mounted(status({ paired: true, enabled: true, state: 'ready', pending: 2, target: { id: 's1', title: 'A' } }))
  h.setConfirm(false); await h.click('移除绑定')
  assert.equal(h.calls.length, 1)
  assert(h.confirms[0].includes('先暂停')); assert(h.confirms[0].includes('未完成的微信消息'))
  h.setConfirm(true); await h.click('移除绑定')
  assert.deepEqual(h.calls[1].request, { action: 'enabled', enabled: false, expectedRevision: 1 })
  await h.resolve(1, status({ paired: true, state: 'disabled', revision: 2, pending: 2, target: { id: 's1', title: 'A' } }))
  assert.deepEqual(h.calls[2].request, { action: 'disconnect', expectedRevision: 2, abandonPending: true })
  await h.resolve(2, status({ state: 'disabled', revision: 3 }))
  assert(!h.text().includes('绑定管理'))
  assert(h.text().includes('显示绑定码'))
  assert(!h.calls.some(c => c.request.action === 'enabled' && c.request.enabled))
  h.unmount()
})

test('pause failure or an invalid stale pause receipt never proceeds to replacement or disconnect', async () => {
  for (const label of ['重新绑定', '移除绑定']) {
    for (const failure of ['rejected', 'stale', 'still-enabled', 'not-status']) {
      const h = await mounted(status({ paired: true, enabled: true, state: 'ready' }))
      await h.click(label)
      if (failure === 'rejected') await h.reject(1, Error('pause failed'))
      else if (failure === 'not-status') await h.resolve(1, { sessions: [] })
      else await h.resolve(1, status({ paired: true, revision: failure === 'stale' ? 1 : 2, enabled: failure === 'still-enabled' }))
      assert.equal(h.calls.length, 2, failure + ' must not continue to management mutation')
      assert(h.nodes().some(n => n.props?.role === 'alert'))
      assert(!h.button(label).props.disabled)
      h.unmount()
    }
  }
})

test('node switch during the confirmed pause prevents the old-node follow-up mutation', async () => {
  for (const label of ['重新绑定', '移除绑定']) {
    const h = await mounted(status({ paired: true, enabled: true, state: 'ready' }))
    await h.click(label)
    await h.replaceCall()
    assert.equal(h.calls.length, 3)
    assert.deepEqual(h.calls[2].request, { action: 'status' }); assert.equal(h.calls[2].owner, 1)
    await h.resolve(1, status({ paired: true, revision: 2, state: 'disabled' }))
    assert.equal(h.calls.length, 3, 'old pause success may not act on either node')
    assert(h.button('刷新').props.disabled, 'old finally must not release new-node foreground state')
    await h.resolve(2, status({ state: 'disabled' }))
    assert(!h.button('显示绑定码').props.disabled)
    h.unmount()
  }
})

test('management failure after a successful pause remains paused without an automatic retry or resume', async () => {
  const h = await mounted(status({ paired: true, enabled: true, state: 'ready' }))
  await h.click('重新绑定')
  await h.resolve(1, status({ paired: true, revision: 2, state: 'disabled' }))
  await h.reject(2, Error('QR provider temporarily unavailable'))
  assert.equal(h.find(n => n.type === 'input' && n.props.role === 'switch').props.checked, false)
  assert(h.text().includes('QR provider temporarily unavailable'))
  await h.tick()
  assert.deepEqual(h.calls[3].request, { action: 'status' })
  assert.equal(h.calls.filter(c => c.request.action === 'login.start').length, 1)
  assert(!h.calls.some(c => c.request.action === 'enabled' && c.request.enabled))
  h.unmount()
})

test('valid pairing hides obsolete attempt notices and keeps replacement only in collapsed management', async () => {
  for (const value of ['expired', 'verify_code_blocked', 'binded_redirect', 'confirmed']) {
    const h = await mounted(status({ paired: true, state: 'disabled', pairing: pairing(value) }))
    assert(!h.nodes().some(n => n.type === 'img'))
    assert(!h.text().includes('绑定码已过期'))
    assert(!h.text().includes('验证码暂不可用'))
    assert(!h.text().includes('请重新显示绑定码'))
    assert(!h.text().includes('取消绑定'))
    assert(!h.text().includes('重新显示绑定码'))
    assert(h.text().includes('已绑定此节点'))
    const menu = h.find(n => n.type === 'details')
    assert(!menu.props.open)
    assert.equal(h.nodes(menu).filter(n => n.type === 'button' && h.text(n) === '重新绑定').length, 1)
    h.unmount()
  }
})

test('waiting QR has one cancel action, a homepage-scanner instruction and one accessible receive switch', async () => {
  const h = await mounted(status({ pairing: pairing(), state: 'disabled' }))
  assert(h.text().includes('微信首页「＋ → 扫一扫」'))
  assert(h.text().includes('再确认绑定'))
  assert(!h.nodes().some(n => n.type === 'button' && /显示绑定码|重新绑定/.test(h.text(n))))
  assert.equal(h.nodes().filter(n => n.type === 'input' && n.props.role === 'switch').length, 1)
  assert(h.find(n => n.type === 'input' && n.props.role === 'switch').props.disabled)
  const toggle = h.find(n => n.props?.role === 'switch')
  assert.equal(toggle.props['aria-label'], '启用私聊接入')
  assert(toggle.props.title.includes('保留绑定'))
  h.unmount()
})

test('disabled or expired states never hide replacement safety warnings or unknown provider messages', async () => {
  for (const message of [
    '此次确认的是另一个微信账号。未替换原绑定；如需换号，请先明确移除本地绑定。',
    '原连接仍有未完成的消息，未替换本地绑定。请先处理原消息，或确认停止这些消息后移除绑定。',
    '微信绑定已失效，请重新绑定。未确认送达的回复请在原会话查看。',
    'A new warning not known to this version',
  ]) {
    const h = await mounted(status({ paired: true, state: 'disabled', bindingState: 'expired', message }))
    assert(h.text().includes(message))
    h.unmount()
  }
})

test('routine successful pairing notices do not duplicate the current pairing and receive status', async () => {
  for (const message of [
    '微信已绑定。选择目标会话并开启接入后，即可在 ClawBot 私聊。',
    '微信确认本节点已有绑定。选择会话并开启接入后即可使用。',
  ]) {
    const h = await mounted(status({ paired: true, state: 'disabled', target: { id: 's1', title: 'A' }, message }))
    assert(!h.text().includes(message))
    assert(h.text().includes('已绑定此节点')); assert(h.text().includes('已暂停'))
    h.unmount()
  }
})

test('active replacement status takes precedence over both a valid or an expired previous binding', async () => {
  for (const bindingState of ['paired', 'expired']) for (const [state, expected] of [
    ['wait', '等待扫码'], ['scaned', '等待微信确认'], ['scaned_but_redirect', '等待微信确认'], ['need_verifycode', '等待确认码'],
  ]) {
    const h = await mounted(status({ paired: true, bindingState, state: 'disabled', pairing: pairing(state) }))
    const badge = h.find(n => n.props?.['data-state'] === 'pending')
    assert.equal(h.text(badge), expected)
    assert(!h.text(badge).includes('已绑定此节点')); assert(!h.text(badge).includes('绑定已失效'))
    assert(h.text().includes('绑定完成后可开启')); assert(!h.text().includes('请重新绑定'))
    h.unmount()
  }
})

test('binding management is adjacent to binding status before session controls, with one explicit receive switch', async () => {
  const h = await mounted(status({ paired: true, enabled: true, state: 'ready', target: { id: 's1', title: 'A' } }))
  assert(!h.text().includes('当前节点：'))
  assert(!h.nodes().some(n => h.text(n) === '节点绑定'))
  const binding = h.find(n => n.props?.['aria-label'] === '节点绑定')
  assert(h.text(binding).includes('已绑定此节点'))
  assert(h.text(binding).includes('绑定管理'))
  assert(h.text().indexOf('绑定管理') < h.text().indexOf('接入会话'))
  assert.equal(h.nodes().filter(n => n.props?.role === 'switch').length, 1)
  assert(h.nodes().some(n => n.props?.['data-dot-state'] === 'done'))
  assert(!h.text().includes('关闭只暂停私聊接入'))
  h.unmount()
})

test('uncertain outcomes remain visible separately from routine receive state and do not mutate messages', async () => {
  const h = await mounted(status({ paired: true, enabled: true, state: 'ready', uncertain: 2, target: { id: 's1', title: 'A' }, message: '' }))
  assert(h.text().includes('接收中'))
  assert(h.text().includes('2 条消息的结果待确认，请查看原会话。'))
  assert.equal(h.calls.length, 1)
  h.unmount()
})
