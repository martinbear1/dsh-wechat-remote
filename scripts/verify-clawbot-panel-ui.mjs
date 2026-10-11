/** Render the real React/CSS pairing panel with local-only fixtures. No real
 * binding, Tencent request, DSH profile, model call, or browser profile is used. */
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
import { build } from 'esbuild'
import QRCode from 'qrcode'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const out = path.resolve(process.argv[2] || path.join(root, 'artifacts/clawbot-panel-ui'))
const require = createRequire(import.meta.url)
const { chromium } = require(require.resolve('playwright', { paths: [process.env.NODE_PATH || root] }))
await fs.mkdir(out, { recursive: true })
const bundle = await build({ stdin: { contents: `
import React from 'react'; import {createRoot} from 'react-dom/client';
import {ClawbotPanel} from './src/client/ClawbotPanel.tsx';
const call=async request=>{
  window.requests.push(request);
  if(request.action==='status')return window.fixture;
  if(request.action==='sessions')return {sessions:[]};
  if(request.action==='login.poll')return window.fixture;
  throw Error('This visual fixture never performs mutations');
};
createRoot(document.querySelector('#root')).render(<ClawbotPanel call={call} nodeName="DeepSeek Harness · Desktop" hostName="Peach"/>);
`, resolveDir: root, loader: 'tsx' }, bundle: true, write: false, outfile: path.join(out, 'preview.js'),
  format: 'iife', platform: 'browser', jsx: 'automatic', define: { 'process.env.NODE_ENV': '"production"' },
  plugins: [{ name: 'actual-css-modules', setup(api) {
    api.onLoad({ filter: /\.module\.css$/ }, async ({ path: file }) => ({ contents: await fs.readFile(file, 'utf8'), loader: 'local-css' }))
  } }],
})
const js = bundle.outputFiles.find(f => f.path.endsWith('.js')).text
const css = bundle.outputFiles.find(f => f.path.endsWith('.css')).text
const base = { supported: true, supportsEnableBeforeSetup: true, revision: 1, enabled: false, state: 'disabled', paired: false,
  target: null, message: '', pending: 0, uncertain: 0,
  access: { allowed: true, reason: 'allowed', validUntil: Date.now() + 86400000, checkedAt: Date.now(), expiresAt: Date.now() + 60000, message: '' } }
const target = { id: 'fixture-session', title: '整理本周资料与下一步安排' }
const pairing = { id: 'fixture-login', url: 'https://example.invalid/visual-only', status: 'wait', expiresAt: Date.now() + 300_000,
  qrDataUrl: await QRCode.toDataURL('https://example.invalid/visual-only', { width: 240, margin: 2 }) }
const scenes = [
  ['enabled-unpaired', { enabled: true, state: 'unpaired' }],
  ['enabled-no-target', { enabled: true, paired: true }],
  ['legacy-unpaired', { supportsEnableBeforeSetup: false }],
  ['unpaired', {}], ['waiting', { pairing }], ['scanned', { pairing: { ...pairing, status: 'scaned' } }],
  ['verify', { pairing: { ...pairing, status: 'need_verifycode' } }],
  ['paused', { paired: true, target }], ['receiving', { paired: true, enabled: true, state: 'ready', target }],
  ['expired', { paired: true, bindingState: 'expired', target }],
  ['locked', { access: { allowed: false, reason: 'feature_not_entitled', validUntil: null, message: '此账号暂未开通此功能。' } }],
]
const browser = await chromium.launch({ channel: 'msedge', headless: true })
const results = []
try {
  for (const width of [320, 820]) for (const dark of [false, true]) for (const [scene, value] of scenes) {
    const page = await browser.newPage({ viewport: { width, height: 900 }, colorScheme: dark ? 'dark' : 'light', reducedMotion: 'reduce' })
    const errors = []; page.on('pageerror', error => errors.push(error.message))
    await page.route('**/*', route => route.abort())
    const theme = `:root{color-scheme:${dark ? 'dark' : 'light'};--dsw-alias-label-primary:${dark ? '#edf1f7' : '#171a20'};--dsw-alias-label-secondary:${dark ? '#b4becc' : '#647084'};--dsw-alias-label-tertiary:${dark ? '#9da8b8' : '#8490a2'};--dsw-alias-bg-layer-1:${dark ? '#242832' : '#f5f6f8'};--dsw-alias-bg-layer-3:${dark ? '#20242c' : '#fff'};--dsw-alias-bg-layer-4:${dark ? '#5f6a7d' : '#a6afbd'};--dsw-alias-border-l2:${dark ? '#454b58' : '#e2e6ee'};--dsw-alias-state-business-primary:#4e79ff}*{box-sizing:border-box}body{margin:0;padding:16px;font:13px/1.5 'Microsoft YaHei',sans-serif;color:var(--dsw-alias-label-primary);background:var(--dsw-alias-bg-layer-1)}#root{max-width:760px;margin:auto}button{font-family:inherit}`
    await page.setContent(`<style>${theme}\n${css}</style><div id="root"></div>`)
    await page.evaluate(fixture => { window.fixture = fixture; window.requests = [] }, { ...base, ...value })
    await page.addScriptTag({ content: js })
    await page.waitForFunction(() => window.requests.length > 0 && !document.body.textContent.includes('读取中'))
    const panel = page.getByRole('region', { name: '微信 ClawBot 私聊接线' })
    assert.equal(await panel.getByRole('switch', { name: '启用私聊接入' }).count(), 1)
    const metrics = await panel.evaluate(element => {
      const input = element.querySelector('input[role="switch"]'), track = input.nextElementSibling
      const state = getComputedStyle(track), knob = getComputedStyle(track, '::after')
      return { height: element.getBoundingClientRect().height, viewport: innerWidth, documentWidth: document.documentElement.scrollWidth,
        clientWidth: element.clientWidth, scrollWidth: element.scrollWidth, switchWidth: track.getBoundingClientRect().width,
        switchHeight: track.getBoundingClientRect().height, switchRadius: state.borderRadius,
        knobWidth: knob.width, knobHeight: knob.height, knobTransform: knob.transform,
        checked: input.checked, disabled: input.disabled }
    })
    assert(metrics.documentWidth <= metrics.viewport, scene + ': no page overflow')
    assert(metrics.scrollWidth <= metrics.clientWidth, scene + ': no panel overflow')
    assert(metrics.height < 820, scene + ': panel fits narrow viewport')
    assert.equal(metrics.switchWidth, 42); assert.equal(metrics.switchHeight, 24)
    assert.equal(metrics.knobWidth, '18px'); assert.equal(metrics.knobHeight, '18px')
    assert.equal(metrics.switchRadius, '999px')
    assert.equal(metrics.checked, value.enabled === true)
    assert.equal(metrics.knobTransform, value.enabled === true ? 'matrix(1, 0, 0, 1, 18, 0)' : 'none')
    assert.equal(metrics.disabled, ['locked', 'legacy-unpaired'].includes(scene))
    const toggle = panel.getByRole('switch', { name: '启用私聊接入' })
    if (metrics.disabled) {
      assert.equal(await toggle.evaluate(input => { input.focus(); return input === document.activeElement }), false)
    } else {
      await toggle.focus()
      assert.equal(await toggle.evaluate(input => getComputedStyle(input.nextElementSibling).outlineWidth), '2px')
      await toggle.evaluate(input => input.blur())
    }
    if (['paused', 'receiving', 'expired'].includes(scene)) {
      const summary = panel.locator('summary')
      await summary.focus(); await page.keyboard.press('Enter')
      assert.equal(await panel.locator('details').evaluate(element => element.open), true, 'keyboard opens pairing management')
      await page.keyboard.press('Enter')
      assert.equal(await panel.locator('details').evaluate(element => element.open), false)
      await summary.evaluate(element => element.blur())
    }
    assert.equal(await page.getByRole('img', { name: '微信 ClawBot 节点绑定码' }).count(), scene === 'waiting' ? 1 : 0)
    assert.deepEqual(errors, [])
    const screenshot = path.join(out, `${scene}-${width}-${dark ? 'dark' : 'light'}.png`)
    await page.screenshot({ path: screenshot })
    results.push({ scene, width, dark, ...metrics, screenshot })
    await page.close()
  }
} finally { await browser.close() }
await fs.writeFile(path.join(out, 'results.json'), JSON.stringify({ scope: 'isolated actual React and CSS; no live DSH or pairing', results }, null, 2))
console.log(JSON.stringify({ scenes: results.length, output: out, checks: 'actual React/CSS, 320/820 light/dark, enable-before-setup and legacy states, no overflow, one accessible rounded switch' }))
