/** Development-only visual check of the actual React update views. No live
 * updater, DSH profile, credentials, requests, or user browser profile is used. */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import vm from 'node:vm'
import { execFileSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { build } from 'esbuild'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const out = path.resolve(root, 'artifacts/current-endpoint-ui')
const browser = process.env.UPDATE_UI_BROWSER || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
assert(fs.existsSync(browser), 'Provide an installed Chromium path as UPDATE_UI_BROWSER; this script never installs one')
fs.mkdirSync(out, { recursive: true })
const require = createRequire(import.meta.url)
let activationState
const css = fs.readFileSync(path.join(root, 'src/client/HarnessRemoteSettings.module.css'), 'utf8')
async function load(name) {
  const result = await build({ entryPoints: [path.join(root, 'src/client', `${name}.tsx`)], bundle: true, write: false,
    format: 'cjs', platform: 'node', jsx: 'automatic', external: ['react', 'react/jsx-runtime', '*.css', '@deepseek-ai/dsh-client-ui-primitives'] })
  const module = { exports: {} }
  vm.runInNewContext(result.outputFiles[0].text, { module, exports: module.exports, require(id) {
    if (id === 'react' && name === 'InstallationResultPanel') return { ...require(id), useEffect() {}, useState: value => [value === null ? activationState : value, noAction] }
    if (id === '@deepseek-ai/dsh-client-ui-primitives') return { Modal: ({ title, children }) => createElement('section', { className: 'installationDialog' }, createElement('h3', null, title), children) }
    if (id.endsWith('.css')) return new Proxy({}, { get: (_, key) => key === '__esModule' ? false : key })
    return require(id)
  } })
  return module.exports[name]
}
const NativeUpdateCard = await load('NativeUpdateCard')
const InstallationResultPanel = await load('InstallationResultPanel')
const noAction = () => assert.fail('A static render cannot trigger an update or network call')
const passive = value => ({ getSnapshot: () => value, subscribe: noAction, refresh: noAction, install: noAction })
const version = JSON.parse(fs.readFileSync(path.join(root, 'package.json'))).version
const advice = { label: '暂无可用更新', severity: 'none', message: '', current: { agentVersion: '0.2.0-rc.2', pluginVersion: version }, checkedAt: 1791376800000 }
const check = { channel: 'preview', canInstall: false, ticket: '', reason: '', advice }
const scenes = [
  { name: 'web-restart', scope: 'web', width: 820, phase: 'restart-required' },
  { name: 'desktop-restart', scope: 'desktop', width: 820, phase: 'restart-required' },
  { name: 'web-ready', scope: 'web', width: 820, phase: 'ready' },
  { name: 'desktop-narrow', scope: 'desktop', width: 400, phase: 'restart-required' },
  { name: 'desktop-dark', scope: 'desktop', width: 820, phase: 'restart-required', dark: true },
  { name: 'web-incomplete', scope: 'web', width: 820, phase: 'incomplete' },
  { name: 'unknown', width: 400, phase: 'unknown' },
  { name: 'desktop-detail-warm', scope: 'desktop', width: 820, phase: 'restart-required', detail: true },
  { name: 'web-detail-narrow', scope: 'web', width: 400, phase: 'restart-required', detail: true },
  { name: 'desktop-detail-dark', scope: 'desktop', width: 820, phase: 'restart-required', detail: true, dark: true },
]
const results = []
for (const scene of scenes) {
  activationState = { phase: scene.phase, scope: scene.scope, installedVersion: version,
    runningVersion: scene.phase === 'restart-required' ? '1.7.13' : version }
  const sceneCheck = { ...check, advice: { ...advice, current: { ...advice.current, pluginVersion: activationState.runningVersion } } }
  const current = createElement(NativeUpdateCard, { embedded: true, scope: scene.scope,
    ...(scene.detail ? { installation: { runningVersion: '1.7.13', installedVersion: version, scope: scene.scope } } : {}),
    store: passive({ check: sceneCheck,
    status: scene.phase === 'restart-required' && !scene.detail ? { phase: 'restart-required', targetVersion: version } : { phase: 'idle', message: '' },
    error: '', checking: false }) })
  const markup = renderToStaticMarkup(createElement('main', null,
    scene.detail ? null : createElement(InstallationResultPanel, { packageName: 'dsh-wechat-remote', readInstallation: noAction, onDismiss: noAction, onOpenDetails: noAction }),
    createElement('section', { className: 'updateCard', 'aria-label': '插件更新' },
      createElement('h3', { className: 'updateHeading' }, '插件更新'), current)))
  const html = path.join(out, scene.name + '.html'), screenshot = path.join(out, scene.name + '.png')
  const dark = scene.dark ? `:root { color-scheme: dark; --dsw-alias-label-primary:#edf1f7; --dsw-alias-label-secondary:#b4becc; --dsw-alias-label-tertiary:#9da8b8; --dsw-alias-bg-layer-1:#242832; --dsw-alias-bg-layer-3:#20242c; --dsw-alias-border-l2:#454b58; --text-primary:#edf1f7; --text-secondary:#a7b1c0; } body{background:#15171c}` : 'body{background:#f5f6f8}'
  fs.writeFileSync(html, `<!doctype html><html><head><meta charset="utf-8"><style>${css}\nbody{margin:0;padding:20px;font:13px/1.5 "Microsoft YaHei",sans-serif;color:var(--dsw-alias-label-primary,#171a20)}main{max-width:${Math.min(scene.width - 40, 760)}px;margin:auto}button{font-family:inherit}.installationDialog{padding:18px;margin-bottom:18px;background:var(--dsw-alias-bg-layer-3,#fff);border:1px solid var(--dsw-alias-border-l2,#ddd);border-radius:12px}.installationDialog h3{margin-top:0}#metrics{display:none}${dark}</style></head><body>${markup}<output id="metrics"></output><script>const card=document.querySelector('.updateCard');document.querySelector('#metrics').textContent=JSON.stringify({width:innerWidth,scrollWidth:document.documentElement.scrollWidth,cardWidth:card.getBoundingClientRect().width,cardScrollWidth:card.scrollWidth,cardClientWidth:card.clientWidth,height:document.querySelector('main').getBoundingClientRect().height});</script></body></html>`)
  const profile = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-update-ui-')))
  try {
    const dom = execFileSync(browser, ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--disable-background-networking',
      // Chromium on Windows clamps very small viewports independently of its
      // screenshot surface. Keep the surface >= 640; main still exercises the
      // requested narrow card width without cropping the captured content.
      '--hide-scrollbars', `--user-data-dir=${profile}`, `--window-size=${Math.max(scene.width, 640)},700`, '--virtual-time-budget=1000', '--dump-dom',
      `--screenshot=${screenshot}`, pathToFileURL(html).href], { encoding: 'utf8', windowsHide: true, timeout: 30000, stdio: ['ignore', 'pipe', 'pipe'] })
    const matched = dom.match(/<output id="metrics">([^<]+)<\/output>/)
    assert(matched, scene.name + ': rendered geometry is required')
    const metrics = JSON.parse(matched[1])
    assert(metrics.scrollWidth <= metrics.width, scene.name + ': horizontal overflow')
    assert(metrics.cardWidth <= scene.width - 40, scene.name + ': requested compact width')
    assert(metrics.cardScrollWidth <= metrics.cardClientWidth, scene.name + ': card content overflow')
    assert(metrics.height < 650, scene.name + ': update block must fit the screenshot')
    assert(fs.statSync(screenshot).size > 1000)
    results.push({ name: scene.name, ...metrics, screenshot })
  } finally {
    // Only this test's exact, freshly-created browser profile may be removed.
    assert.equal(path.dirname(profile), fs.realpathSync(os.tmpdir()))
    assert(path.basename(profile).startsWith('dsh-update-ui-'))
    fs.rmSync(profile, { recursive: true, force: true, maxRetries: 6, retryDelay: 150 })
  }
}
fs.writeFileSync(path.join(out, 'results.json'), JSON.stringify({ scope: 'isolated-static-component-render; no live update performed', results }, null, 2))
console.log(JSON.stringify(results))
