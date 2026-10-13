/** Isolated native-frame artwork render, not a live DSH or personal browser. */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { execFileSync } from 'node:child_process'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const source = process.env.HARNESS_DSH_SOURCE_DIR
assert(source, 'Supply the reviewed official DSH source; do not guess native frame CSS')
const nativeCss = fs.readFileSync(path.join(source, 'packages/client/ui-plugin-manager/src/client/PluginManagerPage.module.css'), 'utf8')
const frameCss = ['cardIcon', 'rowIcon', 'packageImage'].map(name => {
  const rule = nativeCss.match(new RegExp('\\.' + name + ' \\{[^}]+\\}'))
  assert(rule, 'Native artwork rule missing: ' + name)
  return rule[0]
}).join('\n')
const icon = fs.readFileSync(path.join(root, 'lib/assets/wechat.svg'))
const src = 'data:image/svg+xml;base64,' + icon.toString('base64')
const browser = process.env.PLUGIN_UI_BROWSER || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
const out = path.join(root, 'artifacts/plugin-artwork')
fs.mkdirSync(out, { recursive: true })
const results = []
for (const dark of [false, true]) {
  const name = dark ? 'dark' : 'light', html = path.join(out, name + '.html')
  fs.writeFileSync(html, `<!doctype html><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'; script-src 'unsafe-inline'">
    <style>:root{--dsw-radius-md:10px;--dsw-radius-lg:12px;--dsw-alias-border-l3:${dark ? '#51545b' : '#e0e1e5'};--dsw-alias-label-secondary:${dark ? '#b2bac7' : '#626975'}}
    body{margin:30px;background:${dark ? '#20232a' : '#fff'};color:${dark ? '#e9edf2' : '#18191c'};font:14px/1.5 "Microsoft YaHei",sans-serif}
    section{display:flex;align-items:center;gap:18px;margin:30px 0}h2,p{margin:0}h2{font-size:16px}p{font-size:12px;opacity:.75}#result{display:none}${frameCss}</style>
    <p>隔离图标样例 · 使用所提供 DSH 源码的原生外框规则</p>
    <section><span class="cardIcon"><img class="packageImage" width="36" height="36" src="${src}"></span><div><h2>微信连接</h2><p>连接微信小程序，随时与电脑上的助手协作。</p></div></section>
    <section><span class="rowIcon"><img class="packageImage" width="30" height="30" src="${src}"></span><span>微信连接</span></section>
    <output id="result"></output><script>window.addEventListener('load',()=>{
      const images=[...document.images];const canvas=document.createElement('canvas');canvas.width=40;canvas.height=33;
      const c=canvas.getContext('2d');c.drawImage(images[0],0,0,40,33);const p=c.getImageData(0,0,40,33).data;
      document.querySelector('#result').textContent=JSON.stringify({decoded:images.every(i=>i.complete&&i.naturalWidth===40&&i.naturalHeight===33),
        cornerAlpha:[0,39,40*32,40*33-1].map(i=>p[i*4+3]),visiblePixels:[...p].filter((_,i)=>i%4===3&&p[i]>0).length});
    });</script>`)
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-artwork-layout-'))
  try {
    const dom = execFileSync(browser, ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
      '--disable-background-networking', '--host-resolver-rules=MAP * ~NOTFOUND', '--user-data-dir=' + profile,
      '--window-size=720,360', '--virtual-time-budget=1500', '--screenshot=' + path.join(out, name + '.png'),
      '--dump-dom', pathToFileURL(html).href], { encoding: 'utf8', windowsHide: true, timeout: 30000, stdio: ['ignore', 'pipe', 'pipe'] })
    const payload = dom.match(/<output id="result">([^<]+)<\/output>/)?.[1]
    assert(payload, 'Image decode result missing')
    const result = JSON.parse(payload.replaceAll('&quot;', '"').replaceAll('&amp;', '&'))
    assert(result.decoded, 'SVG must decode at its native aspect ratio')
    assert.deepEqual(result.cornerAlpha, [0, 0, 0, 0], 'Transparent image must not add a square background')
    assert(result.visiblePixels > 500, 'The symbol must be visible, not an empty SVG')
    results.push({ name, ...result })
  } finally {
    assert(path.dirname(profile) === path.resolve(os.tmpdir()) && path.basename(profile).startsWith('dsh-artwork-layout-'))
    fs.rmSync(profile, { recursive: true, force: true, maxRetries: 4, retryDelay: 250 })
  }
}
fs.writeFileSync(path.join(out, 'results.json'), JSON.stringify({ scope: 'Isolated native CSS/asset rendering, not live host acceptance', results }, null, 2))
console.log('PASS transparent artwork, native list/detail frames, light/dark: ' + out)
