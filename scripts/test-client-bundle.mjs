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
    }
  if (id === 'react/jsx-runtime') return jsxRuntime
  if (id === '@deepseek-ai/dsh-client-ui-primitives') {
    return { FishLogo: (props) => ({ type: 'FishLogo', props }) }
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
exports.apply({
  connection: {
    rpc: {
      async call(channel, endpoint, payload) {
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
      assert.equal(name, 'settings.section')
      effect()
    },
    register(spec, component) {
      assert.equal(spec.name, 'settings.section')
      assert.equal(spec.id, 'harness-remote')
      assert.equal(spec.order, 30)
      assert.equal(spec.label, '微信连接')
      assert.equal(typeof spec.inject, 'function')
      describeHost = spec.inject().describeHost
      assert.equal(typeof describeHost, 'function')
      assert.equal(typeof component, 'function')
      registered = true
      return () => {}
    },
  },
})
assert.equal(registered, true)
assert.deepEqual(await describeHost(), {
  computerName: 'Peach',
  agentName: 'DeepSeek Harness',
})
console.log('client lazy bundle registration tests passed')
