import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { build, transform } from 'esbuild'
import { createRequire } from 'node:module'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
const source = await readFile(new URL('../src/client/assistant-store.ts', import.meta.url),'utf8')
const {code} = await transform(source,{loader:'ts',format:'esm',target:'es2022'})
const {AssistantStore} = await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'))
const deferred = () => { let resolve; return {promise:new Promise(r=>resolve=r),resolve} }
const catalog = {schema:'human.assistants.catalog.v1',nodeId:'testnode',native:{supported:true},templates:[],drafts:[]}
const preview = {id:'id',version:1,digest:'d'.repeat(64),previewId:'preview',expiresAt:Date.now()+60000}
test('assistant UI has no installation side effect until exact explicit consent',async()=>{
  const calls=[], store=new AssistantStore(async(method,request)=>{calls.push([method,request]);return method==='assistantCatalog'?catalog:method==='assistantDraft'?{id:'id',version:1}:method==='assistantPreview'?preview:{state:'installed',message:'installed'}})
  await store.load(); await store.choose('teacher')
  assert.deepEqual(calls.map(c=>c[0]),['assistantCatalog','assistantDraft','assistantCatalog','assistantPreview'])
  await store.install(); assert.equal(calls.filter(c=>c[0]==='assistantInstall').length,1)
  assert.deepEqual(calls.find(c=>c[0]==='assistantInstall')[1],{id:'id',version:1,digest:preview.digest,previewId:'preview'})
  assert.equal(store.getSnapshot().preview,null)
})
test('lost install response clears consent and only explicit status read can recover',async()=>{
  let count=0;const store=new AssistantStore(async method=>{if(method==='assistantCatalog')return catalog;if(method==='assistantPreview')return preview;if(method==='assistantDraft')return {id:'id',version:1};if(method==='assistantInstall'){count++;throw Error('lost')}return {state:'installed',message:'verified'}})
  await store.choose('teacher');await store.install();await store.install()
  assert.equal(count,1);assert.equal(store.getSnapshot().preview,null)
  await store.verify('id',1);assert.equal(count,1);assert.equal(store.getSnapshot().message,'verified')
})
test('connection reset fences both pending preview and follow-up writes',async()=>{
  const gate=deferred(),calls=[];const store=new AssistantStore(async method=>{calls.push(method);return gate.promise})
  const pending=store.choose('teacher');store.reset();gate.resolve({id:'id',version:1});await pending
  assert.deepEqual(calls,['assistantDraft']);assert.equal(store.getSnapshot().preview,null);assert.equal(store.getSnapshot().busy,false)
})
test('dispose fences late catalog response and forbids new reads',async()=>{
  const gate=deferred();let count=0;const store=new AssistantStore(async()=>{count++;return gate.promise})
  const pending=store.load();store.dispose();gate.resolve(catalog);await pending;await store.load()
  assert.equal(count,1);assert.equal(store.getSnapshot().catalog,null)
})
test('expired preview cannot launch native installation',async()=>{
  let installs=0;const store=new AssistantStore(async method=>{if(method==='assistantCatalog')return catalog;if(method==='assistantDraft')return {id:'id',version:1};if(method==='assistantInstall')installs++;return {...preview,expiresAt:1}})
  await store.choose('teacher');await store.install();assert.equal(installs,0);assert.match(store.getSnapshot().error,/重新预览/)
})

test('failed catalog refresh removes obsolete installed actions instead of preserving a stale success',async()=>{
  let available=true
  const store=new AssistantStore(async()=>{if(!available)throw Error('host unavailable');return {...catalog,drafts:[{id:'old',state:'installed'}]}})
  await store.load(); assert.equal(store.getSnapshot().catalog.drafts[0].state,'installed')
  available=false; await store.load()
  assert.equal(store.getSnapshot().catalog,null); assert.equal(store.getSnapshot().error,'host unavailable')
})

test('lost verification does not leave historical installed buttons or success text actionable',async()=>{
  let lost=false
  const store=new AssistantStore(async method=>{if(method==='assistantStatus'){if(lost)throw Error('lost verification');return {state:'installed',message:'已生效'}}return {...catalog,drafts:[{id:'old',state:'installed'}]}})
  await store.verify('old',1);assert.equal(store.getSnapshot().message,'已生效')
  lost=true;await store.verify('old',1)
  assert.equal(store.getSnapshot().catalog,null);assert.equal(store.getSnapshot().message,'');assert.equal(store.getSnapshot().error,'lost verification')
})

test('reinstall is a new exact-source draft and preview, never an automatic install',async()=>{
  const calls=[],store=new AssistantStore(async(method,args)=>{calls.push([method,args]);return method==='assistantCatalog'?catalog:method==='assistantDraft'?{id:'new',version:1}:method==='assistantPreview'?{...preview,id:'new'}:{state:'installed'}})
  await store.reinstall('old',3)
  assert.deepEqual(calls.map(c=>c[0]),['assistantDraft','assistantCatalog','assistantPreview'])
  assert.deepEqual(calls[0][1],{sourceId:'old',sourceVersion:3}); assert.deepEqual(calls[2][1],{id:'new',version:1})
  assert.equal(store.getSnapshot().preview.id,'new')
  await store.install(); assert.equal(calls.filter(c=>c[0]==='assistantInstall').length,1)
  assert.equal(calls.find(c=>c[0]==='assistantInstall')[1].id,'new')
})

test('desktop hides unavailable history by default and keeps new-install consent separate from status',async()=>{
  const require=createRequire(import.meta.url)
  const built=await build({entryPoints:[fileURLToPath(new URL('../src/client/AssistantPresetsPanel.tsx',import.meta.url))],bundle:true,write:false,platform:'node',format:'esm',jsx:'automatic',plugins:[{name:'memory-panel-test',setup(plugin){
    plugin.onResolve({filter:/^react(?:\/jsx-runtime)?$/},args=>({path:pathToFileURL(require.resolve(args.path)).href,external:true}))
    plugin.onLoad({filter:/\.module\.css$/},()=>({contents:'export default {}',loader:'js'}))
  }}]})
  const {AssistantPresetsPanel}=await import('data:text/javascript;base64,'+Buffer.from(built.outputFiles[0].text).toString('base64'))
  const drafts=[{id:'new',name:'新版',version:1,presetId:'new_preset',state:'installed',nativeState:'installed'},
    {id:'old',name:'已卸载旧版',version:1,state:'unknown',nativeState:'uninstalled'},
    {id:'unknown',name:'失联旧版',version:1,state:'unknown',nativeState:'unknown'},
    {id:'disabled',name:'已停用旧版',version:1,state:'unknown',nativeState:'disabled'},
    {id:'stale',name:'内容变化旧版',version:1,state:'unknown',nativeState:'stale'}]
  const store=new AssistantStore(async()=>({...catalog,drafts}));await store.load()
  const html=renderToStaticMarkup(createElement(AssistantPresetsPanel,{store,start:async()=>{assert.fail('render must not launch')}}))
  assert.match(html,/<details><summary>历史助手（4）/);assert(!html.includes('<details open'))
  assert.equal((html.match(/开始或打开已创建会话/g)||[]).length,1)
  assert.equal((html.match(/重新预览安装/g)||[]).length,1)
  for(const label of ['未安装','待核对','已停用','需要核对'])assert(html.includes(label))
})
