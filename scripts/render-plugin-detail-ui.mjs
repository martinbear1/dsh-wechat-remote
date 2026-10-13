/** Isolated, development-only layout fixtures of the actual plugin React views.
 * Default: generate HTML for review. Add --screenshots to run a fresh headless
 * Chromium profile and geometry assertions. Never reads a DSH profile, makes an
 * RPC/network call, changes an installed plugin or uses a personal browser.
 * React local state is seeded for static layout only; this is NOT an interactive
 * or native-host lifecycle test. Native atoms/CSS are the installed public SDK.
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import vm from 'node:vm'
import { execFileSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { build } from 'esbuild'
import * as React from 'react'
import * as JsxRuntime from 'react/jsx-runtime'
import { renderToStaticMarkup } from 'react-dom/server'
import QRCode from 'qrcode'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const out = path.join(root, 'artifacts/plugin-detail-ui')
const screenshots = process.argv.includes('--screenshots')
assert(process.argv.slice(2).every(value => value === '--screenshots'), 'Only --screenshots is accepted')
const browser = process.env.PLUGIN_UI_BROWSER || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
if (screenshots) assert(fs.existsSync(browser), 'Set PLUGIN_UI_BROWSER to an installed Chromium; this script never installs a browser')
fs.mkdirSync(out, { recursive: true })
const require = createRequire(import.meta.url)
const version = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).version
const nativeVersion = JSON.parse(fs.readFileSync(require.resolve('@deepseek-ai/dsh-client-ui-primitives/package.json'), 'utf8')).version
const now = Date.now()
const noAction = () => assert.fail('Static layout must not invoke a setter, subscription, timer, RPC or network operation')
const passive = value => ({ getSnapshot: () => value, subscribe: noAction, refresh: noAction, generateQr: noAction,
  load: noAction, start: noAction, choose: noAction, install: noAction, verify: noAction, reinstall: noAction })
const qrDataUrl = await QRCode.toDataURL('DSH static UI fixture only. This is not a pairing credential.', { width: 360, margin: 4 })
const access = { allowed: true, reason: 'allowed', validUntil: now + 86400000,
  checkedAt: now, expiresAt: now + 60000, message: '' }
const sceneDefinitions = [
  { name: 'desktop-ready', width: 1040, scope: 'desktop' },
  { name: 'desktop-pairing-qr', width: 1040, scope: 'desktop', qr: true },
  { name: 'web-unbound-warning', width: 1040, scope: 'web', warning: true },
  { name: 'desktop-narrow', width: 400, scope: 'desktop' },
  { name: 'desktop-dark', width: 1040, scope: 'desktop', dark: true },
  { name: 'web-narrow-qr-warning', width: 400, scope: 'web', qr: true, warning: true },
  { name: 'resources-empty', width: 1040, scope: 'desktop', resourceScene: 'empty' },
  { name: 'resources-one', width: 1040, scope: 'desktop', resourceScene: 'one' },
  { name: 'resources-many', width: 1040, scope: 'desktop', resourceScene: 'many' },
  { name: 'resources-medium', width: 700, scope: 'desktop' },
  { name: 'resources-history-open', width: 1040, scope: 'desktop', expandHistory: true },
]
let fixture, activeHooks, suppressedSdkWarmups = 0
const wrapped = new WeakMap()
const stateOwners = new Set(['AssistantPresetsPanel', 'ClawbotPanel', 'MyResourcesPanel', 'OtherEndpointSummary'])
function wrap(type) {
  if (typeof type !== 'function' || !stateOwners.has(type.name)) return type
  if (!wrapped.has(type)) {
    const StaticStateOwner = props => {
      const previous = activeHooks
      activeHooks = { name: type.name, props, index: 0 }
      try { return type(props) } finally { activeHooks = previous }
    }
    wrapped.set(type, StaticStateOwner)
  }
  return wrapped.get(type)
}
const jsx = { ...JsxRuntime, jsx: (type, props, key) => JsxRuntime.jsx(wrap(type), props, key),
  jsxs: (type, props, key) => JsxRuntime.jsxs(wrap(type), props, key) }
const staticReact = { ...React, useEffect() {}, useLayoutEffect() {},
  useState(initial) {
    const value = typeof initial === 'function' ? initial() : initial
    if (!activeHooks) return [value, noAction]
    const { name, props } = activeHooks, index = activeHooks.index++
    if (name === 'AssistantPresetsPanel' && index === 0) return [fixture.feature, noAction]
    if (name === 'ClawbotPanel') return [[fixture.clawbot, fixture.sessions, fixture.clawbot.target?.id ?? '', false,
      fixture.clawbotError, '', now][index], noAction]
    if (name === 'MyResourcesPanel' && index === 0) return [{ call: props.call, view: fixture.resources }, noAction]
    if (name === 'OtherEndpointSummary' && index === 0) return [{ reader: props.readOtherEndpoint, generation: 0,
      busy: false, value: { scope: fixture.scope === 'desktop' ? 'web' : 'desktop', state: 'available',
        dshVersion: '0.2.0-rc.2', pluginState: 'installed', pluginVersion: '1.7.13',
        update: { state: 'available', targetVersion: '1.7.14' } } }, noAction]
    return [value, noAction]
  },
}

// Bundle the real local SDK (including its Button, StateDot, Tooltip and logo)
// and real CSS Modules. No replacement geometry or copied plugin markup.
const built = await build({ entryPoints: [path.join(root, 'src/client/HarnessRemoteSettings.tsx')],
  bundle: true, write: false, outdir: out, format: 'cjs', platform: 'node', target: 'node22', jsx: 'automatic',
  external: ['react', 'react/jsx-runtime', 'react-dom', 'react-dom/server'],
  loader: { '.module.css': 'local-css', '.css': 'css', '.woff': 'dataurl', '.woff2': 'dataurl', '.ttf': 'dataurl' },
  logLevel: 'silent',
})
const code = built.outputFiles.find(file => file.path.endsWith('.js'))?.text
const css = built.outputFiles.find(file => file.path.endsWith('.css'))?.text
assert(code && css, 'Real component and CSS bundles are required')
const module = { exports: {} }
vm.runInNewContext(code, { module, exports: module.exports, console, URL, URLSearchParams, TextEncoder, TextDecoder,
  AbortController, Buffer, Date: class extends Date { static now() { return now } },
  // This SDK schedules its syntax-highlighter warmup at module evaluation.
  // Do not run unrelated idle work (or any timer callback) in a layout fixture.
  setTimeout() { suppressedSdkWarmups++; return { unref() {} } }, setInterval: noAction,
  clearTimeout() {}, clearInterval: noAction, fetch: noAction,
  require(id) { if (id === 'react') return staticReact; if (id === 'react/jsx-runtime') return jsx; return require(id) },
}, { filename: 'isolated-plugin-detail.cjs' })
const HarnessRemoteSettings = module.exports.HarnessRemoteSettings
assert.equal(typeof HarnessRemoteSettings, 'function')

function data(scene) {
  const title = `DeepSeek Harness · ${scene.scope === 'web' ? 'Web' : 'Desktop'}`
  const templates = [
    { id: 'teacher', name: '教师助理', description: '帮老师备课、布置作业、收作业与整理反馈。' },
    { id: 'project', name: '项目助理', description: '协助项目目标、里程碑、进度与协作反馈。' },
    { id: 'designer', name: '定制助手', description: '用对话设计适合自己的助手模式。' },
  ].map(item => ({ ...item, builtin: { enabled: item.id !== 'project', state: item.id === 'project' ? 'unknown' : 'installed', nativeState: item.id === 'project' ? 'disabled' : 'installed' } }))
  let items = [
    { resourceId: 'fixture-creative', version: '1.0.0', name: '私人创作助手', description: '保留已有角色与故事的第一版。',
      presetId: 'fixture-creative-1', enabled: true, state: 'installed' },
    { resourceId: 'fixture-creative', version: '1.1.0', name: '私人创作助手', description: '一起设计角色、场景与短故事。',
      presetId: 'fixture-creative-2', enabled: true, state: 'installed' },
    { resourceId: 'fixture-creative', version: '1.2.0', name: '私人创作助手', description: '新增角色语气校准与剧情分支建议。', state: 'available' },
    { resourceId: 'fixture-review', version: '1.0.0', name: '项目复盘助手', description: '整理项目目标、阶段进展与下一步行动。',
      presetId: 'fixture-review-1', enabled: false, state: 'installed' },
    { resourceId: 'fixture-adventure', version: '2.0.0', name: '文字冒险伙伴', description: '按你的偏好展开一段互动故事。', state: 'available' },
  ]
  if (scene.resourceScene === 'empty') items = []
  if (scene.resourceScene === 'one') items = [items[1]]
  if (scene.resourceScene === 'many') items.push(...Array.from({ length: 4 }, (_, index) => ({
    resourceId: 'fixture-more-' + index, name: '定制资源 ' + (index + 1), version: '1.0.0', state: 'available',
    description: '交付到当前账号，点击安装后即可使用。',
  })))
  fixture = {
    scope: scene.scope,
    feature: { schemaVersion: 1, nodeId: 'fixture-node', checkedAt: now, expiresAt: now + 60000,
      groupEnabled: !scene.warning, groupComponentAvailable: true, features: { group_assistant: access, clawbot: access } },
    clawbot: { supported: true, revision: 1, enabled: !scene.warning && !scene.qr,
      state: scene.warning ? 'disabled' : scene.qr ? 'unpaired' : 'ready', paired: !scene.warning && !scene.qr,
      target: scene.warning ? null : { id: 'fixture-session', title: '本周创作计划' }, message: '', pending: 0,
      uncertain: scene.warning ? 1 : 0, access,
      ...(scene.qr ? { pairing: { id: 'fixture-login', status: 'wait', qrDataUrl, expiresAt: now + 300000 } } : {}),
    },
    clawbotError: scene.warning ? '暂时无法连接微信，请稍后刷新。' : '',
    sessions: [{ id: 'fixture-session', title: '本周创作计划', workspaceId: 'fixture-workspace', workspaceTitle: '创作工作区' }],
    resources: { data: { supported: true, items }, busy: false, installing: null, toggling: null, error: scene.warning
      ? '暂时无法连接资源服务，已安装资源不受影响。' : '', itemErrors: {}, catalogRead: true },
  }
  const nativeUpdates = passive({ check: { channel: 'preview', canInstall: false, ticket: '', reason: '',
    advice: { label: '暂无可用更新', severity: 'none', message: '',
      current: { agentVersion: '0.2.0-rc.2', pluginVersion: version }, checkedAt: now } },
    status: { phase: 'idle', message: '' }, checking: false, starting: false, error: '' })
  const store = { ...passive({ loadState: 'ready', qrState: scene.qr ? 'ready' : 'idle', error: null,
    host: { agentName: title, computerName: '布局测试电脑', agentInstanceId: 'fixture-node', agentVersion: '0.2.0-rc.2', pluginVersion: version, installedPluginVersion: version },
    runtime: { profileScope: scene.scope, publicDoor: { state: 'listening' } }, localOrigin: null,
    status: { plugin: { runningVersion: version, installedVersion: version }, lan: { ip: '192.0.2.4', port: 0 },
      publicRelay: { enabled: true, state: 'online', remoteAccess: { status: 'active' } }, agent: { agentName: title, hostName: '布局测试电脑' } },
    qr: scene.qr ? { qrDataUrl, mode: 'public-relay', expiresAt: now + 300000 } : null }), nativeUpdates }
  return { store, describeHost: noAction, callManagement: noAction, featureCall: noAction, clawbotCall: noAction,
    resourcesCall: noAction, startResource: noAction, readOtherEndpoint: noAction,
    assistants: passive({ catalog: { native: { supported: true }, templates, drafts: templates.map(item => ({ id: 'fixture-' + item.id,
      templateId: item.id, name: item.name, source: 'builtin', ...item.builtin, presetId: 'fixture-' + item.id })) },
      preview: null, busy: false, message: '', error: '' }),
    diagnostics: passive({ diagnosticState: 'idle', diagnosticReport: null }),
  }
}

// The surrounding host column is a clearly-labelled geometry fixture, not a
// replacement DSH header. Only the plugin-owned <section> is under test.
const lightTokens = `:root{color-scheme:light;--dsw-alias-label-primary:#18191c;--dsw-alias-label-secondary:#626975;--dsw-alias-label-tertiary:#888f9b;--dsw-alias-label-primary-foreground:#fff;--dsw-alias-border-l2:#e3e5e8;--dsw-alias-border-l3:#c8cdd3;--dsw-alias-bg-layer-1:#fff;--dsw-alias-bg-layer-2:#f7f8fa;--dsw-alias-bg-layer-3:#fff;--dsw-alias-bg-layer-4:#fff;--dsw-alias-button-primary-fill:#18191c;--dsw-alias-button-primary-hover:#303238;--dsw-alias-interactive-bg-hover:#eff1f4;--dsw-alias-brand-primary:#18191c;--dsw-alias-state-business-primary:#4d6bfe;--dsw-alias-state-success-primary:#20ae69;--dsw-alias-state-warn-primary:#a56c17;--dsw-alias-state-error-primary:#d84c50;--dsw-static-deepseek-450:#5977ff}`
const darkTokens = `:root{color-scheme:dark;--dsw-alias-label-primary:#e9edf2;--dsw-alias-label-secondary:#b2bac7;--dsw-alias-label-tertiary:#959dac;--dsw-alias-label-primary-foreground:#181a1e;--dsw-alias-border-l2:#3a404b;--dsw-alias-border-l3:#737b89;--dsw-alias-bg-layer-1:#17191e;--dsw-alias-bg-layer-2:#242730;--dsw-alias-bg-layer-3:#20232a;--dsw-alias-bg-layer-4:#2d323c;--dsw-alias-button-primary-fill:#e9edf2;--dsw-alias-button-primary-hover:#cbd3df;--dsw-alias-interactive-bg-hover:#303642;--dsw-alias-brand-primary:#e9edf2;--dsw-alias-state-warn-primary:#e0b36b;--dsw-alias-state-error-primary:#f98287}`
const geometryScript = `function measure(){
  const main=document.querySelector('main');
  const panels=[...main.querySelectorAll('section[aria-label]')];
  const rect=el=>{const r=el.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height}};
  const grid=main.querySelector('[aria-label="资源卡片"]');
  const cards=[...grid.querySelectorAll(':scope > article')];
  const groupCard=main.querySelector('section[aria-label="微信群协作助手"] article');
  const overflow=[...main.querySelectorAll('*')].filter(el=>{const c=getComputedStyle(el),r=el.getBoundingClientRect();return c.display!=='none'&&c.visibility!=='hidden'&&r.width&&r.height&&el.scrollWidth>el.clientWidth+1&&['visible','clip'].includes(c.overflowX)&&el.tagName!=='SELECT'}).map(el=>({tag:el.tagName,label:el.getAttribute('aria-label'),className:el.className,scroll:el.scrollWidth,client:el.clientWidth}));
  document.querySelector('#metrics').textContent=JSON.stringify({viewport:innerWidth,pageScroll:document.documentElement.scrollWidth,...rect(main),
    panels:panels.map(p=>({label:p.getAttribute('aria-label'),...rect(p),scroll:p.scrollWidth,client:p.clientWidth})),
    resources:{...rect(grid),columns:getComputedStyle(grid).gridTemplateColumns.split(' ').map(Number.parseFloat),
      cards:cards.map(el=>({...rect(el),id:el.getAttribute('data-resource-id'),state:el.getAttribute('data-resource-state'),label:el.getAttribute('aria-label')})),
      historyCount:grid.querySelectorAll('details').length,openHistories:grid.querySelectorAll('details[open]').length},groupCard:rect(groupCard),overflow});
}window.addEventListener('load',measure);measure();`
const results = []
for (const scene of sceneDefinitions) {
  const props = data(scene)
  const markup = renderToStaticMarkup(React.createElement(HarnessRemoteSettings, props))
  assert(markup.includes('微信群协作助手') && markup.includes('定制你的专属助手'), 'All real feature panels must render')
  assert(markup.includes('私人创作助手') === (scene.resourceScene !== 'empty'))
  if (!scene.resourceScene || scene.resourceScene === 'many') assert(markup.includes('可更新至 v1.2.0'))
  assert(!markup.includes('当前节点：') && !markup.includes('新聊天可使用新版，已有聊天保留原版本。'))
  assert(markup.includes('本节点已暂停') === Boolean(scene.warning))
  assert(!markup.includes('正在读取本地资源'), 'The resource panel must use its fixture state')
  const html = path.join(out, scene.name + '.html'), screenshot = path.join(out, scene.name + '.png')
  const contentWidth = Math.min(960, scene.width - 40)
  const surfaceHeight = scene.width < 640 ? 3400 : scene.qr || scene.expandHistory ? 2100 : scene.warning || scene.resourceScene === 'many' ? 1800 : 1500
  const expandHistory = scene.expandHistory
    ? `document.querySelectorAll('[aria-label="资源卡片"] details').forEach(detail=>{detail.open=true});` : ''
  fs.writeFileSync(html, `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'; script-src 'unsafe-inline'; font-src data:"><title>隔离布局样例 · ${scene.name}</title><style>${lightTokens}${scene.dark ? darkTokens : ''}${css}html{background:var(--dsw-alias-bg-layer-1)}body{box-sizing:border-box;margin:0;padding:20px;font:13px/1.5 "Microsoft YaHei",system-ui,sans-serif;color:var(--dsw-alias-label-primary)}main{width:${contentWidth}px;max-width:100%;margin:auto}button,input,select{font-family:inherit}.fixtureNote{margin:0 0 12px;color:var(--dsw-alias-label-tertiary);font-size:11px}.fixtureHeader{margin-bottom:20px}.fixtureHeader h1{font-size:20px;line-height:1.4;margin:0 0 6px}.fixtureHeader p{font-size:12px;margin:4px 0;color:var(--dsw-alias-label-secondary)}.fixtureHeader small{font-size:11px;color:var(--dsw-alias-label-tertiary);font-weight:400}#metrics{display:none}</style></head><body><main><p class="fixtureNote">隔离静态布局样例 · 虚构数据 · 按钮不执行操作 · 原生 UI SDK ${nativeVersion}</p><header class="fixtureHeader"><h1>微信连接 <small>v${version}</small></h1><p>dsh-wechat-remote</p><p>连接微信小程序，随时与电脑上的助手协作。</p></header>${markup}</main><output id="metrics"></output><script>${expandHistory}${geometryScript}</script></body></html>`)
  let metrics
  if (screenshots) {
    const profile = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-detail-layout-')))
    try {
      const dom = execFileSync(browser, ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
        '--disable-background-networking', '--disable-component-update', '--disable-sync', '--host-resolver-rules=MAP * ~NOTFOUND',
        '--hide-scrollbars', `--user-data-dir=${profile}`, `--window-size=${Math.max(scene.width, 640)},${surfaceHeight}`,
        '--virtual-time-budget=1000', '--dump-dom', `--screenshot=${screenshot}`, pathToFileURL(html).href],
      { encoding: 'utf8', windowsHide: true, timeout: 30000, maxBuffer: 16 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] })
      const match = dom.match(/<output id="metrics">([^<]+)<\/output>/)
      assert(match, scene.name + ': browser geometry missing')
      metrics = JSON.parse(match[1].replaceAll('&quot;', '"').replaceAll('&amp;', '&'))
      assert(metrics.pageScroll <= metrics.viewport, scene.name + ': document overflow')
      // Chromium versions differ in whether --window-size includes window chrome.
      // The fixture column must still fill its actual available width, never overflow it.
      const availableWidth = Math.min(contentWidth, metrics.viewport - 40)
      assert(Math.abs(metrics.width - availableWidth) < 1, `${scene.name}: host content width ${metrics.width}, expected ${availableWidth}`)
      assert.deepEqual(metrics.overflow, [], scene.name + ': content overflow')
      for (const panel of metrics.panels) assert(panel.scroll <= panel.client + 1, scene.name + ': panel overflow: ' + panel.label)
      const expectedColumns = scene.width < 640 ? 1 : scene.width < 900 ? 2 : 3
      const resources = metrics.resources, cards = resources.cards
      assert.equal(resources.columns.length, expectedColumns, scene.name + ': wrong responsive column count')
      assert.equal(cards.length, scene.resourceScene === 'empty' ? 1 : scene.resourceScene === 'one' ? 2 : scene.resourceScene === 'many' ? 8 : 4,
        scene.name + ': missing or duplicated resource cards')
      assert.equal(cards.at(-1).label, '定制专属助手', scene.name + ': discovery card must stay last')
      assert.equal(cards.filter(card => card.label === '定制专属助手').length, 1)
      let deliverySeen = false
      for (const card of cards.slice(0, -1)) {
        if (card.state === 'delivery') deliverySeen = true
        else assert.equal(deliverySeen, false, scene.name + ': local resources must precede deliveries')
      }
      for (const card of cards) {
        assert(Math.abs(card.width - resources.columns[0]) < 1, scene.name + ': a card must occupy one equal grid slot')
        assert(Math.abs(card.width - metrics.groupCard.width) < 1, scene.name + ': resource and assistant card widths differ')
        assert(card.x >= resources.x - 1 && card.x + card.width <= resources.x + resources.width + 1, scene.name + ': card escapes grid')
      }
      if (expectedColumns > 1) assert(cards[0].width < resources.width / 1.5, scene.name + ': a single card must not stretch across the row')
      for (let index = 1; index < Math.min(expectedColumns, cards.length); index++)
        assert(Math.abs(cards[index].y - cards[0].y) < 1, scene.name + ': first-row cards must align')
      for (let first = 0; first < cards.length; first += expectedColumns) {
        for (const card of cards.slice(first, first + expectedColumns))
          assert(Math.abs(card.height - cards[first].height) < 1, scene.name + ': cards on the same row must have equal heights, including discovery')
      }
      if (scene.expandHistory) {
        assert(resources.historyCount > 0, scene.name + ': no history fixture')
        assert.equal(resources.openHistories, resources.historyCount, scene.name + ': version histories were not opened')
      } else assert.equal(resources.openHistories, 0, scene.name + ': history should be collapsed initially')
      assert(metrics.height < surfaceHeight - 100, scene.name + ': full page exceeds screenshot surface')
      assert(fs.statSync(screenshot).size > 1000, scene.name + ': screenshot missing')
    } finally {
      // A resolved, uniquely-created test profile; never a user profile or root.
      assert.equal(path.dirname(profile), fs.realpathSync(os.tmpdir()))
      assert(path.basename(profile).startsWith('dsh-detail-layout-'))
      fs.rmSync(profile, { recursive: true, force: true, maxRetries: 6, retryDelay: 150 })
    }
  }
  results.push({ ...scene, contentWidth, html, ...(metrics ? { metrics, screenshot } : {}) })
}
fs.writeFileSync(path.join(out, 'results.json'), JSON.stringify({ scope: 'isolated static React layout only; no native lifecycle or interactive verification',
  nativeAtoms: `actual installed public SDK ${nativeVersion}; Switch uses the product fallback when absent in that SDK`,
  theme: 'isolated representative DSH alias-token values; not a live host theme', suppressedSdkWarmups, screenshots, results }, null, 2))
console.log(JSON.stringify({ out, screenshots, scenes: results.map(({ name, html, metrics }) => ({ name, html, ...(metrics ? { metrics } : {}) })) }, null, 2))
