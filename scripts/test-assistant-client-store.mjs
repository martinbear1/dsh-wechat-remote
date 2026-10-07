import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { build, transform } from 'esbuild'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import vm from 'node:vm'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
const source = await readFile(new URL('../src/client/assistant-store.ts', import.meta.url),'utf8')
const {code} = await transform(source,{loader:'ts',format:'esm',target:'es2022'})
const {AssistantStore} = await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'))
const deferred = () => { let resolve; return {promise:new Promise(r=>resolve=r),resolve} }
const catalog = {schema:'human.assistants.catalog.v1',nodeId:'testnode',native:{supported:true},templates:[],drafts:[]}
const preview = {id:'id',version:1,digest:'d'.repeat(64),previewId:'preview',expiresAt:Date.now()+60000}
async function panelForSSR() {
  // Portals belong to the native browser; these tests cover our rendered panel
  // and store. The real native Modal is exercised by the browser visual test.
  const require=createRequire(import.meta.url)
  const built=await build({entryPoints:[fileURLToPath(new URL('../src/client/AssistantPresetsPanel.tsx',import.meta.url))],
    bundle:true,write:false,platform:'node',format:'cjs',jsx:'automatic',packages:'external',
    plugins:[{name:'panel-style-test',setup(plugin){plugin.onLoad({filter:/\.css$/},()=>({contents:'export default {}',loader:'js'}))}}]})
  const module={exports:{}}
  vm.runInNewContext(built.outputFiles[0].text,{module,exports:module.exports,require(id){
    if(id==='@deepseek-ai/dsh-client-ui-primitives') return {Modal:()=>{throw Error('Native portals require browser verification')}}
    return require(id)
  }},{filename:'assistant-panel-ssr.cjs'})
  return module.exports.AssistantPresetsPanel
}
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
  const AssistantPresetsPanel=await panelForSSR()
  const drafts=[{id:'new',name:'新版',version:1,presetId:'new_preset',state:'installed',nativeState:'installed'},
    {id:'old',name:'已卸载旧版',version:1,state:'unknown',nativeState:'uninstalled'},
    {id:'unknown',name:'失联旧版',version:1,state:'unknown',nativeState:'unknown'},
    {id:'disabled',name:'已停用旧版',version:1,state:'unknown',nativeState:'disabled'},
    {id:'stale',name:'内容变化旧版',version:1,state:'unknown',nativeState:'stale'}]
  const store=new AssistantStore(async()=>({...catalog,drafts}));await store.load()
  const html=renderToStaticMarkup(createElement(AssistantPresetsPanel,{store,start:async()=>{assert.fail('render must not launch')}}))
  assert.match(html,/<summary>更多助手与安装记录<\/summary>/);assert(!html.includes('<details open'))
  assert.match(html,/<summary>以前安装的助手（4）<\/summary>/)
  assert.equal((html.match(/>开始使用<\/button>/g)||[]).length,1)
  assert.equal((html.match(/查看并重新安装/g)||[]).length,1)
  assert(!html.includes('开始或打开已创建会话'));assert(!html.includes('另开独立工作会话'))
  for(const label of ['未安装','待核对','已停用'])assert(html.includes(label))
})

test('dismissed preview has no installation side effect and cannot reuse hidden consent',async()=>{
  let installs=0
  const store=new AssistantStore(async method=>method==='assistantCatalog'?catalog:method==='assistantDraft'?{id:'id',version:1}:method==='assistantInstall'?(installs++,{state:'installed'}):preview)
  await store.choose('teacher');store.dismissPreview();await store.install()
  assert.equal(installs,0);assert.equal(store.getSnapshot().preview,null)
})

test('included modes never call draft/install even while unknown; a pending custom draft is reused',async()=>{
  const calls=[],store=new AssistantStore(async(method,args)=>{calls.push([method,args]);return method==='assistantCatalog'?{
    ...catalog,templates:[{id:'teacher',builtin:{state:'unknown'}}],drafts:[{id:'pending',version:2,templateId:'general',state:'draft'}],
  }:preview})
  await store.load();await store.choose('teacher')
  assert.deepEqual(calls.map(item=>item[0]),['assistantCatalog','assistantCatalog'])
  await store.choose('general')
  assert.deepEqual(calls.at(-1),['assistantPreview',{id:'pending',version:2}])
  assert(!calls.some(item=>item[0]==='assistantDraft'||item[0]==='assistantInstall'))
})

test('replaced old packages cannot be reinstalled through a stale explicit client action',async()=>{
  const calls=[],store=new AssistantStore(async method=>{calls.push(method);return {...catalog,drafts:[{id:'old',version:1,nativeState:'uninstalled',replacement:{presetId:'harness-teacher'}}]}})
  await store.load();await store.reinstall('old',1)
  assert.deepEqual(calls,['assistantCatalog','assistantCatalog']);assert.equal(store.getSnapshot().preview,null)
  assert.match(store.getSnapshot().message,/无需重新安装旧包/)
})

test('assistant UI separates creation from ready-made modes and preserves exact installed names',async()=>{
  const AssistantPresetsPanel=await panelForSSR()
  const templates=[{id:'teacher',name:'教师助理',description:'教学工作'},{id:'project',name:'项目助理',description:'项目工作'},
    {id:'designer',name:'助手设计师',description:'设计可复用模式'},{id:'general',name:'通用工作助理',description:'通用'}]
  const drafts=[{id:'approved-teacher',version:1,templateId:'teacher',name:'教师助理',state:'installed',nativeState:'installed'},
    {id:'approved-designer',version:1,templateId:'designer',name:'助手设计师',state:'installed',nativeState:'installed'}]
  const store=new AssistantStore(async()=>({...catalog,templates,drafts}));await store.load()
  const html=renderToStaticMarkup(createElement(AssistantPresetsPanel,{store}))
  assert.equal((html.match(/>安装<\/button>/g)||[]).length,2)
  assert(html.indexOf('教师助理')<html.indexOf('定制我的助手'))
  assert(html.includes('确认安装后，再用新模式开启工作会话'))
  assert(html.indexOf('更多助手与安装记录')<html.indexOf('通用工作助理'))
  assert(!html.includes('助手设计师'));assert(!html.includes('approved-teacher'))
  assert.equal((html.match(/>开始使用<\/button>/g)||[]).length,1)
  assert.equal((html.match(/>开始定制<\/button>/g)||[]).length,1)
  assert.equal(store.getSnapshot().catalog.drafts[1].name,'助手设计师')
  const included=templates.slice(0,3).map(item=>({...item,builtin:{id:'builtin_'+item.id,version:1,state:'installed',nativeState:'installed'}}))
  const builtinStore=new AssistantStore(async()=>({...catalog,native:{supported:false,reason:'custom install unavailable'},templates:included,
    drafts:included.map(item=>({id:'builtin_'+item.id,templateId:item.id,name:item.id==='designer'?'定制助手':item.name,source:'builtin',state:'installed',nativeState:'installed'}))}))
  await builtinStore.load()
  const builtinHtml=renderToStaticMarkup(createElement(AssistantPresetsPanel,{store:builtinStore}))
  assert.equal((builtinHtml.match(/>开始使用<\/button>/g)||[]).length,2,'native bundled modes do not depend on custom installer availability')
  assert.equal((builtinHtml.match(/>开始定制<\/button>/g)||[]).length,1)
  assert(!builtinHtml.includes('安装教师助理'));assert(!builtinHtml.includes('安装项目助理'));assert(!builtinHtml.includes('安装定制助手'))
})

test('start is a real native action after a fresh readiness check, never an install or prompt',async()=>{
  const calls=[],item={presetId:'harness-teacher',state:'installed',nativeState:'installed'}
  const store=new AssistantStore(async method=>{calls.push(method);return {...catalog,drafts:[item]}},async(id,signal)=>calls.push(['open',id,signal]))
  const lifetime=new AbortController();await store.start('harness-teacher',lifetime.signal)
  assert.deepEqual(calls,['assistantCatalog',['open','harness-teacher',lifetime.signal]])
  item.nativeState='disabled';await store.start('harness-teacher')
  assert.equal(calls.filter(c=>Array.isArray(c)).length,1);assert.match(store.getSnapshot().error,/已停用/)
})

test('aborted or replaced owner prevents a late catalog from opening a session',async()=>{
  for(const action of ['abort','reset','dispose']){
    const gate=deferred(),lifetime=new AbortController();let opens=0
    const store=new AssistantStore(()=>gate.promise,async()=>{opens++})
    const pending=store.start('harness-teacher',lifetime.signal)
    if(action==='abort')lifetime.abort();else store[action]()
    gate.resolve({...catalog,drafts:[{presetId:'harness-teacher',state:'installed'}]});await pending
    assert.equal(opens,0)
  }
})

test('start shortcut stops at workspace selection and cancel never creates a session',async()=>{
  const opens=[],item={name:'教师助理',presetId:'harness-teacher',state:'installed',nativeState:'installed'}
  const choices={items:[{id:'workspace_a',name:'语文班',path:'C:/class-a'},{id:'workspace_b',name:'英语班',path:'C:/class-b'}],preferredId:'workspace_a'}
  const store=new AssistantStore(async()=>({...catalog,drafts:[item]}),async(...args)=>opens.push(args),{list:()=>choices,pick:async()=>undefined})
  await store.prepareStart('harness-teacher');assert.equal(opens.length,0)
  assert.equal(store.getSnapshot().launch.selectedId,'workspace_a')
  await store.pickWorkspace();assert.equal(opens.length,0)
  store.dismissStart();await store.confirmStart();assert.equal(opens.length,0)
  await store.prepareStart('harness-teacher');store.selectWorkspace('workspace_b');await store.confirmStart()
  assert.deepEqual(opens,[['harness-teacher',undefined,'workspace_b']]);assert.equal(store.getSnapshot().launch,null)
})

test('workspace selector resets with connection, and selecting a folder does not open a session',async()=>{
  const choices={items:[{id:'new',name:'New',path:'C:/new'}],preferredId:''};let opens=0
  const store=new AssistantStore(async()=>({...catalog,drafts:[{name:'定制助手',presetId:'harness-customizer',state:'installed'}]}),async()=>{opens++},{list:()=>choices,pick:async()=> 'new'})
  await store.prepareStart('harness-customizer');await store.pickWorkspace();assert.equal(opens,0)
  assert.equal(store.getSnapshot().launch.selectedId,'new');store.reset();await store.confirmStart();assert.equal(opens,0)
})
