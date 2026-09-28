import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const manifest = JSON.parse(
  readFileSync(path.join(root, 'package.json'), 'utf8'),
)
const bundle = readFileSync(path.join(root, 'lib', 'client.js'), 'utf8')
let registration = null
let styleTag = null
const context = vm.createContext({
  fetch: async () => { throw new Error('no requests while rendering') },
  document: {
    querySelector() {
      return null
    },
    createElement(name) {
      assert.equal(name, 'style')
      return { dataset: {}, textContent: '' }
    },
    head: {
      appendChild(tag) {
        styleTag = tag
      },
    },
  },
  window: {
    __ModuleLoader__: {
      load(value) {
        registration = value
      },
    },
  },
})

vm.runInContext(bundle, context)
assert.equal(registration?.id, manifest.name)
assert.equal(typeof registration?.factory, 'function')

const jsxRuntime = {
  Fragment: Symbol('Fragment'),
  jsx: (type, props) => ({ type, props }),
  jsxs: (type, props) => ({ type, props }),
}
const exports = registration.factory((id) => {
  if (id === 'react')
    return {
      useEffect() {},
      useRef: (value) => ({ current: value }),
      useState: (value) => [value, () => {}],
      useSyncExternalStore: (_subscribe, snapshot) => snapshot(),
      useId: () => 'fixture-title',
    }
  if (id === 'react/jsx-runtime') return jsxRuntime
  if (id === '@deepseek-ai/dsh-client-ui-primitives') {
    return { FishLogo: (props) => ({ type: 'FishLogo', props }), Modal: 'NativeModal' }
  }
  throw new Error(`Unexpected external client module: ${id}`)
})
assert.ok(styleTag, 'client factory must install its component stylesheet')
assert.match(
  styleTag.textContent,
  /\.hr_[0-9a-f]{7}_root\b/,
  'generated CSS selectors must have a valid alphabetic prefix',
)
assert.doesNotMatch(
  styleTag.textContent,
  /\.[0-9][A-Za-z0-9_-]*\s*[{,:]/,
  'generated CSS must not contain selectors beginning with a digit',
)
assert.deepEqual(Array.from(exports.inject), ['slots', 'connection'])
assert.equal(typeof exports.apply, 'function')
assert.equal(
  'HarnessRemoteSettings' in exports,
  false,
  'client public API must expose only Cordis entry values',
)

let registered = false
let describeHost = null
let callManagement = null
let settingsComponent, sharedStore
const nativeKeys = new Set()
exports.apply({
  get() {},
  inject(names, effect) { assert.deepEqual(Array.from(names), ['pluginNavigation', 'remote.pluginManager']); effect() },
  effect(fn) { return fn() },
  connection: {
    rpc: {
      async call(channel, endpoint, payload) {
        if (channel === '/wechat-remote-management') {
          assert.equal(endpoint, 'status')
          assert.equal(Object.keys(payload).length, 0)
          return { ok: true, value: { profile: 'desktop' } }
        }
        assert.equal(channel, '/api')
        assert.equal(endpoint, 'wechatHost/describe')
        assert.equal(typeof payload, 'object')
        assert.equal(typeof payload.args, 'object')
        assert.equal(typeof payload.args.request, 'object')
        assert.equal(Object.keys(payload.args.request).length, 0)
        return {
          ok: true,
          value: {
            ok: true,
            value: {
              computerName: 'Peach',
              agentName: 'DeepSeek Harness',
            },
          },
        }
      },
    },
  },
  slots: {
    inject(name, effect) {
      assert(['settings.section', 'plugins.bundle.activation', 'plugins.bundle.config', 'sidebar.footer.action'].includes(name))
      effect()
    },
    register(spec, component) {
      if (spec.name === 'sidebar.footer.action') {
        assert.equal(spec.id, 'harness-remote')
        assert.equal(typeof spec.inject().openPlugin, 'function')
        assert.equal(spec.inject().store, undefined, 'navigation does not mount a third feature page')
        return () => {}
      }
      if (spec.name !== 'settings.section') {
        assert(['dsh-wechat-remote', '@harness-remote/dsh-wechat-remote'].includes(spec.key))
        nativeKeys.add(`${spec.name}:${spec.key}`)
        assert.equal(typeof spec.inject().callManagement, 'function')
        assert.equal(typeof component, 'function')
        assert.equal(spec.inject().store, sharedStore, 'every entry must share the exact same host store')
        if (spec.name === 'plugins.bundle.config') assert.equal(component, settingsComponent, 'native detail and settings render the same full page')
        if (spec.name === 'plugins.bundle.activation') {
          const onDismiss = () => {}
          const view = component({ ...spec.inject(), onDismiss })
          assert.equal(view.type, 'NativeModal', 'activation must be prominent, not an inline footer below the plugin list')
          assert.equal(view.props.open, true)
          assert.equal(view.props.onClose, onDismiss, 'closing the native guide never approves an update')
        }
        return () => {}
      }
      assert.equal(spec.name, 'settings.section')
      assert.equal(spec.id, 'harness-remote')
      assert.equal(spec.order, 30)
      assert.equal(spec.label, '微信连接')
      assert.equal(typeof spec.inject, 'function')
      describeHost = spec.inject().describeHost
      callManagement = spec.inject().callManagement
      settingsComponent = component
      sharedStore = spec.inject().store
      assert.equal(typeof describeHost, 'function')
      assert.equal(typeof component, 'function')
      registered = true
      return () => {}
    },
  },
})
assert.equal(registered, true)
assert.equal(nativeKeys.size, 4, 'CLI Web core and native GUI wrapper each expose config and activation without separate implementations')
assert.deepEqual(await describeHost(), {
  computerName: 'Peach',
  agentName: 'DeepSeek Harness',
})
assert.deepEqual(await callManagement('status'), { profile: 'desktop' })
const oldEntries = []
exports.apply({
  get() {}, effect(fn) { return fn() }, connection: { rpc: { call() {} } },
  inject(names) { assert.deepEqual(Array.from(names), ['pluginNavigation', 'remote.pluginManager']) /* service absent: no shortcut */ },
  slots: {
    inject(name, effect) { if (name === 'settings.section') effect() },
    register(spec) { oldEntries.push(spec.name); return () => {} },
  },
})
assert.deepEqual(oldEntries, ['settings.section'], 'old host retains native settings only; no sidebar shortcut, fake settings launcher or third modal')
console.log('client lazy bundle registration tests passed')
