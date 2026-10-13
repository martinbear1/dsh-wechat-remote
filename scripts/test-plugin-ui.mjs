import assert from 'node:assert/strict'
import test from 'node:test'
import vm from 'node:vm'
import { build } from 'esbuild'
import { fileURLToPath } from 'node:url'
import { readFileSync } from 'node:fs'

const result = await build({ entryPoints: [fileURLToPath(new URL('../src/client/PluginUi.tsx', import.meta.url))],
  bundle: true, write: false, platform: 'node', format: 'cjs', jsx: 'automatic',
  external: ['react', 'react/jsx-runtime', '*.css', '@deepseek-ai/dsh-client-ui-primitives'] })
const jsx = (type, props) => ({ type, props })
const primitives = { Button: 'native-button', StateDot: 'native-state-dot', Tooltip: 'native-tooltip' }
function load(native = primitives) {
  const module = { exports: {} }
  vm.runInNewContext(result.outputFiles[0].text, { module, exports: module.exports, require(id) {
    if (id === '@deepseek-ai/dsh-client-ui-primitives') return native
    if (id === 'react/jsx-runtime') return { jsx, jsxs: jsx }
    if (id.endsWith('.css')) return new Proxy({}, { get: (_, key) => key === '__esModule' ? false : key })
    throw Error(id)
  } })
  return module.exports
}
test('actions use the native primitive and preserve disabled, accessible label and click handler', () => {
  const { ActionButton } = load(), onClick = () => {}
  const button = ActionButton({ disabled: true, 'aria-label': '安装预设', onClick, children: '安装' })
  assert.equal(button.type, primitives.Button)
  assert.equal(button.props.size, 'sm'); assert.equal(button.props.variant, 'outline')
  assert.equal(button.props.disabled, true); assert.equal(button.props.onClick, onClick)
  assert.equal(button.props['aria-label'], '安装预设')
  assert.equal(ActionButton({ variant: 'primary' }).props.variant, 'primary')
})
test('current hosts receive their own Switch with unchanged state and handler', () => {
  const { PluginSwitch } = load({ ...primitives, Switch: 'native-switch' }), onChange = () => {}
  const toggle = PluginSwitch({ checked: true, disabled: true, label: '私聊接入', onChange })
  assert.equal(toggle.type, 'native-switch'); assert.equal(toggle.props.checked, true)
  assert.equal(toggle.props.disabled, true); assert.equal(toggle.props.label, '私聊接入')
  assert.equal(toggle.props.onChange, onChange)
})
test('older hosts without Switch retain a keyboard-operable button with equivalent semantics', () => {
  const { PluginSwitch } = load()
  let changed
  for (const checked of [true, false]) {
    const toggle = PluginSwitch({ checked, label: '本节点助手', onChange: value => { changed = value } })
    assert.equal(toggle.type, 'button'); assert.equal(toggle.props.type, 'button')
    assert.equal(toggle.props.role, 'switch'); assert.equal(toggle.props['aria-checked'], checked)
    assert.equal(toggle.props['aria-label'], '本节点助手'); toggle.props.onClick()
    assert.equal(changed, !checked)
  }
  assert.equal(PluginSwitch({ checked: false, label: '本节点助手', disabled: true }).props.disabled, true)
})
test('active status dots are host primitives; off state is neutral, and explanatory text is not interactive state', () => {
  const { StatusLabel, SectionHeading } = load()
  for (const state of ['done', 'ongoing', 'warning', 'error']) {
    const dot = StatusLabel({ state, children: '状态' }).props.children[0]
    assert.equal(dot.type, primitives.StateDot); assert.equal(dot.props.state, state)
  }
  assert.equal(StatusLabel({ state: 'off', children: '已关闭' }).props.children[0].type, 'span')
  const heading = SectionHeading({ icon: 'group', title: '微信群协作助手', help: '功能说明' })
  const tooltip = heading.props.children[0].props.children[2]
  assert.equal(tooltip.type, primitives.Tooltip); assert.equal(tooltip.props.label, '功能说明')
  assert.equal(tooltip.props.children.props.tabIndex, 0, 'keyboard users can reach the explanation')
})

test('ClawBot matches the mini-program Settings accent tile rather than a red mark', () => {
  const css = readFileSync(new URL('../src/client/PluginUi.module.css', import.meta.url), 'utf8')
  const tile = css.match(/^\.clawbotIcon \{([^}]+)\}/m)?.[1]
  assert.match(tile, /color: var\(--dsw-alias-state-business-primary,/)
  assert.match(tile, /background: color-mix\(in srgb, currentColor 12%, transparent\)/)
  assert.match(tile, /border-radius: 31\.25%/)
  const dots = css.match(/\.clawbotIcon::before, \.clawbotIcon::after \{([^}]+)\}/)?.[1]
  assert.match(dots, /background: currentColor/)
  assert.match(dots, /top: 21\.5%/)
})
