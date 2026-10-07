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
const status = (extra = {}) => ({ supported: true, revision: 1, enabled: false, state: 'disabled', paired: false,
  target: null, message: 'fixture status', pending: 0, uncertain: 0, ...extra })
const pairing = (state = 'wait') => ({ id: 'fixture-login', url: 'https://example.invalid/qr', qrDataUrl: 'data:image/png;base64,AA==', status: state })

function harness() {
  const cells = [], intervals = new Map(), calls = []
  let cursor = 0, dirty = false, tree, effects = [], intervalId = 0, disposed = false
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
    clearInterval(id) { intervals.delete(id) }, window: { confirm: () => true },
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
  const button = label => find(node => node.type === 'button' && text(node) === label)
  async function flush() {
    // RPC continuations and chained foreground requests settle deterministically.
    for (let i = 0; i < 12; i++) { await Promise.resolve(); if (dirty && !disposed) render() }
  }
  render()
  return {
    calls, button, find, text, nodes, flush,
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
  assert.equal(h.calls.length, 2, 'a second timer must not duplicate a pending poll')
  await h.click('取消配对')
  assert.deepEqual(h.calls[2].request, { action: 'login.cancel', loginId: 'fixture-login' })
  await h.resolve(2, status({ revision: 2, message: 'cancelled now' }))
  assert(!h.text().includes('取消配对')); assert(h.text().includes('cancelled now'))
  await h.resolve(1, status({ pairing: pairing('scaned'), message: 'late old pairing' }))
  assert(!h.text().includes('late old pairing')); assert(!h.text().includes('取消配对'))
  assert(!h.button('刷新').props.disabled)
  h.unmount()
})

test('background long poll does not swallow foreground pause or overwrite its newer result', async () => {
  const h = await mounted(status({ pairing: pairing() }))
  await h.tick()
  h.find(n => n.type === 'input' && n.props.role === 'switch').props.onChange({ target: { checked: false } })
  await h.flush()
  assert.deepEqual(h.calls[2].request, { action: 'enabled', enabled: false, expectedRevision: 1 })
  await h.resolve(2, status({ revision: 2, pairing: pairing(), message: 'foreground result' }))
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
  assert(h.text().includes('连接微信 ClawBot')); assert(!h.text().includes('重新确认微信连接'))
  h.unmount()
})

test('late cancelled poll error does not replace the current successful UI with an alert', async () => {
  const h = await mounted(status({ pairing: pairing() }))
  await h.tick(); await h.click('取消配对')
  await h.resolve(2, status({ revision: 2, message: 'cancelled now' }))
  await h.reject(1, Error('old provider cancellation'))
  assert(!h.nodes().some(n => n.props?.role === 'alert'))
  assert(h.text().includes('cancelled now'))
  h.unmount()
})

test('unmount stops the poll timer and ignores pending RPC responses', async () => {
  const h = await mounted(status({ pairing: pairing() }))
  await h.tick(); h.unmount()
  await h.resolve(1, status({ paired: true, message: 'must not update after unmount' }))
  assert.equal(h.calls.length, 2)
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
  await h.tick(); assert.equal(h.calls.length, 2)
  await h.replaceCall()
  assert.equal(h.calls[2].owner, 1); assert.deepEqual(h.calls[2].request, { action: 'status' })
  assert(!h.text().includes('old node')); assert(!h.text().includes('取消配对'))
  await h.resolve(2, status({ pairing: { ...pairing(), id: 'new-login' }, message: 'new node' }))
  await h.tick()
  assert.deepEqual(h.calls[3].request, { action: 'login.poll', loginId: 'new-login' })
  assert.equal(h.calls[3].owner, 1)
  await h.resolve(1, status({ pairing: pairing('scaned'), message: 'late old poll' }))
  assert(!h.text().includes('late old poll')); assert(h.text().includes('new node'))
  await h.tick()
  assert.equal(h.calls.length, 4, 'old poll finally must not allow a duplicate new-node poll')
  await h.resolve(3, status({ paired: true, message: 'new node paired' }))
  assert(h.text().includes('new node paired'))
  h.unmount()
})
