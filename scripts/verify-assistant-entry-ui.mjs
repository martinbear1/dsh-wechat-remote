/** Isolated browser QA of our actual panel/store and direct navigation callback.
 * No DSH profile, real workspace, model call, package install or network write. */
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
import { build } from 'esbuild'

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..')
const out=path.resolve(process.argv[2] || path.join(root,'artifacts/assistant-entry-ui'))
const require=createRequire(import.meta.url)
const {chromium}=require(require.resolve('playwright',{paths:[process.env.NODE_PATH || root]}))
await fs.mkdir(out,{recursive:true})
const result=await build({stdin:{contents:`
import React from 'react'; import {createRoot} from 'react-dom/client';
import {AssistantPresetsPanel} from './src/client/AssistantPresetsPanel.tsx';
import {AssistantStore} from './src/client/assistant-store.ts';
const templates=[['teacher','教师助理','备课、布置与整理作业'],['project','项目助理','规划项目、跟进协作'],['designer','定制助手','设计工作方式']].map(([id,name,description])=>({id,name,description,builtin:{}}));
const catalog={schema:'human.assistants.catalog.v1',nodeId:'visual',native:{supported:true},templates,drafts:templates.map(t=>({id:t.id,name:t.name,templateId:t.id,presetId:'harness-'+t.id,source:'builtin',state:'installed',nativeState:'installed'}))};
window.opens=[];
window.store=new AssistantStore(async method=>{if(method!=='assistantCatalog')throw Error('unexpected mutation '+method);return catalog},async(presetId)=>window.opens.push({presetId}));
window.disableTeacher=()=>{catalog.drafts[0].nativeState='disabled';return window.store.load()};
const featureCall=async request=>({schemaVersion:1,nodeId:'visual',accountInstance:'fixture',checkedAt:Date.now(),expiresAt:Date.now()+60000,
  groupEnabled:request.enabled ?? true, features:{group_assistant:{allowed:true,reason:'allowed',validUntil:Date.now()+86400000},clawbot:{allowed:true,reason:'allowed',validUntil:Date.now()+86400000}}});
createRoot(document.querySelector('#root')).render(<AssistantPresetsPanel store={window.store} featureCall={featureCall}/>);
`,resolveDir:root,loader:'tsx'},bundle:true,write:false,outfile:path.join(out,'preview.js'),format:'iife',platform:'browser',jsx:'automatic',
  define:{'process.env.NODE_ENV':'"production"'},loader:{'.woff':'dataurl','.woff2':'dataurl','.ttf':'dataurl'},
  plugins:[{name:'native-css-modules',setup(api){api.onLoad({filter:/\.module\.css$/},async({path:file})=>({contents:await fs.readFile(file,'utf8'),loader:'local-css'}))}}]})
const js=result.outputFiles.find(f=>f.path.endsWith('.js')).text,css=result.outputFiles.find(f=>f.path.endsWith('.css')).text
const browser=await chromium.launch({channel:'msedge',headless:true})
const metrics=[]
try{
  for(const width of [360,820])for(const dark of [false,true]){
    const page=await browser.newPage({viewport:{width,height:850},colorScheme:dark?'dark':'light',reducedMotion:'reduce'})
    const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.route('**/*',route=>route.abort())
    const theme=`:root{color-scheme:${dark?'dark':'light'};--dsw-alias-label-primary:${dark?'#edf1f7':'#171a20'};--dsw-alias-label-secondary:${dark?'#b4becc':'#647084'};--dsw-alias-label-tertiary:${dark?'#9da8b8':'#8490a2'};--dsw-alias-bg-layer-1:${dark?'#242832':'#f5f6f8'};--dsw-alias-bg-layer-2:${dark?'#242832':'#fff'};--dsw-alias-bg-layer-3:${dark?'#20242c':'#fff'};--dsw-alias-border-l2:${dark?'#454b58':'#e2e6ee'};--dsw-alias-border-inverted:#9993;--dsw-alias-bg-mask-1:#0004;--dsw-mask-blur:blur(2px);--dsw-shadow-lv3:0 12px 48px #0003}*{box-sizing:border-box}body{margin:0;padding:20px;font:13px/1.5 'Microsoft YaHei',sans-serif;color:var(--dsw-alias-label-primary);background:var(--dsw-alias-bg-layer-1)}#root{max-width:760px;margin:auto}button{font-family:inherit}`
    await page.setContent(`<style>${theme}\n${css}</style><div id="root"></div>`);await page.addScriptTag({content:js})
    await page.getByRole('button',{name:'开始使用',exact:true}).first().waitFor()
    const toggle=page.getByRole('switch',{name:'启用本节点助手'})
    await page.waitForFunction(()=>document.querySelector('input[aria-label="启用本节点助手"]')?.checked)
    assert.equal(await toggle.isChecked(),true)
    assert.equal(await toggle.evaluate(input=>getComputedStyle(input.nextElementSibling,'::after').transform),'matrix(1, 0, 0, 1, 18, 0)')
    const panel=page.getByRole('region',{name:'微信群协作助手'}),size=await panel.boundingBox()
    assert(size.height<470,'compact panel including explicit node switch, not a full page of explanation')
    assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth))
    await page.screenshot({path:path.join(out,`panel-${width}-${dark?'dark':'light'}.png`)})
    const help=page.getByRole('button',{name:'教师助理使用说明',exact:true})
    assert.equal(await help.getAttribute('title'),null,'no browser tooltip layered over the custom one')
    await help.hover()
    await page.waitForFunction(()=>[...document.querySelectorAll('[role="tooltip"]')].filter(e=>getComputedStyle(e).visibility==='visible').length===1)
    const description=await help.getAttribute('aria-describedby')
    assert.equal(await page.getByRole('tooltip').getAttribute('id'),description)
    await page.screenshot({path:path.join(out,`help-${width}-${dark?'dark':'light'}.png`)})
    await page.mouse.move(0,0)
    await help.focus()
    assert(await page.getByRole('tooltip').isVisible(),'keyboard focus uses the same tooltip')
    await page.getByRole('button',{name:'刷新',exact:true}).focus()
    assert.equal(await page.getByRole('tooltip').count(),0,'tooltip closes after hover and focus leave')
    await page.getByRole('button',{name:'开始使用',exact:true}).first().click()
    await page.waitForFunction(()=>window.opens.length===1)
    assert.equal(await page.getByRole('dialog').count(),0,'no intermediate plugin-owned workspace modal')
    assert.deepEqual(await page.evaluate(()=>window.opens),[{presetId:'harness-teacher'}])
    await page.getByRole('button',{name:'开始定制',exact:true}).click()
    await page.waitForFunction(()=>window.opens.length===2)
    assert.deepEqual(await page.evaluate(()=>window.opens),[{presetId:'harness-teacher'},{presetId:'harness-designer'}])
    await page.evaluate(()=>window.disableTeacher())
    assert(await page.getByRole('button',{name:'开始使用',exact:true}).first().isDisabled())
    assert.deepEqual(errors,[])
    metrics.push({width,dark,panelHeight:size.height,checks:'real panel/store; single accessible hover/focus tooltip; direct native entry callback, no workspace modal, customizer/disabled'})
    await page.close()
  }
}finally{await browser.close()}
await fs.writeFile(path.join(out,'results.json'),JSON.stringify({scope:'isolated browser, not live DSH',metrics},null,2))
console.log(JSON.stringify(metrics))
