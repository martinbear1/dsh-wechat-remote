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
const context = vm.createContext({
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
  throw new Error(`Unexpected external client module: ${id}`)
})
assert.deepEqual(Array.from(exports.inject), ['slots'])
assert.equal(typeof exports.apply, 'function')
assert.equal(
  'PairingButton' in exports,
  false,
  'client public API must expose only Cordis entry values',
)

let registered = false
exports.apply({
  slots: {
    inject(name, effect) {
      assert.equal(name, 'sidebar.footer.action')
      effect()
    },
    register(spec, component) {
      assert.equal(spec.name, 'sidebar.footer.action')
      assert.equal(spec.id, 'wechat-pairing')
      assert.equal(typeof component, 'function')
      registered = true
      return () => {}
    },
  },
})
assert.equal(registered, true)
console.log('client lazy bundle registration tests passed')
