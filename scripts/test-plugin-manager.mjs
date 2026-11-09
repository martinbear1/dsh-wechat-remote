/** Data/authorization contract; no running DSH, profile, network or installation. */
import test from 'node:test'
import assert from 'node:assert/strict'
import { build } from 'esbuild'
import { pathToFileURL } from 'node:url'
import path from 'node:path'
import os from 'node:os'
import fs from 'node:fs'
const directory=fs.mkdtempSync(path.join(os.tmpdir(),'wechat-plugins-test-'))
const entry=path.join(directory,'adapter.mjs')
await build({entryPoints:['src/plugin-manager/native.ts'],outfile:entry,bundle:true,platform:'node',format:'esm'})
const {NativePluginManager,pluginError}=await import(pathToFileURL(entry).href)
process.on('exit',()=>fs.rmSync(directory,{recursive:true,force:true}))
const schema={uid:1,refs:{1:{type:'object',dict:{title:2,token:3,enabled:4,count:5,choice:6,list:9,complex:10,hidden:11,locked:12}},2:{type:'string'},3:{type:'string',meta:{role:'secret',default:'NEVER_EMIT'}},4:{type:'boolean'},5:{type:'number',meta:{min:0,max:4}},6:{type:'union',list:[7,8]},7:{type:'const',value:'a'},8:{type:'const',value:null},9:{type:'array',inner:2},10:{type:'dict',inner:2},11:{type:'string',meta:{hidden:true}},12:{type:'object',meta:{disabled:true},dict:{child:2}}}}
function fixture(){
 const calls=[],plugins=[{entryId:'include:sample',patchId:'sample',moduleName:'third-party/sample',enabled:true},{entryId:'include:ours',patchId:'ours',moduleName:'@harness-remote/dsh-wechat-remote',enabled:true},{entryId:'include:core',patchId:'core',moduleName:'@deepseek-ai/dsh-api-gateway',enabled:true,readOnlyReason:'management-required'}]
 const bundles=[{name:'sample',enabled:true,installed:true,official:false,availability:'profile',rows:[{entryId:plugins[0].entryId}],overrides:[]},{name:'unsafe',enabled:true,installed:true,rows:[],overrides:['ours']},{name:'@deepseek-ai/dsh-subagent-codex',enabled:false,official:true,availability:'missing',installTarget:{spec:'@deepseek-ai/dsh-subagent-codex@0.2.2-rc.1'},rows:[]}]
 let data={title:'original',token:'ORIGINAL_SECRET',enabled:true,count:2,choice:'a',list:['a',''],complex:{a:'untouched'},hidden:'NEVER_EMIT_HIDDEN',locked:{child:'safe'}}
 let rev=7
 const view=()=>({ns:'sample',revision:rev,autoGenerate:false,applies:'live',schema,value:{...data,token:'SHOULD_NOT_LEAK'},secrets:[{path:['token'],set:true}]})
 const manager={listPlugins:()=>plugins,listBundles:()=>bundles,setPluginEnabled:async(...args)=>{calls.push(['plugin',...args]);return {changed:true,application:'restart-required'}},setBundleEnabled:async(...args)=>{calls.push(['bundle',...args]);return {changed:true,application:'applied'}},installBundle:async(...args)=>{calls.push(['install',...args]);return {changed:true,application:'applied'}}}
 const settings={writable:true,describe:opts=>{assert.deepEqual(opts,{redactSecrets:true});return [view(),{...view(),ns:'ours'}]},mutate:async(ns,ops,expected)=>{calls.push(['mutate',ns,ops,expected]);assert.equal(expected,rev);for(const op of ops){if(op.op==='unset')delete data[op.path[0]];else data[op.path[0]]=op.value}rev++}}
 const services={pluginManager:manager,settings},adapter=new NativePluginManager({get:name=>services[name]})
 const call=(action,input={})=>adapter.control(action,input,new AbortController().signal)
 return {calls,plugins,bundles,manager,settings,services,call,adapter,getData:()=>data,advance:()=>rev++}
}
test('optional native capability does not require settings and rejects old hosts',async()=>{const f=fixture();delete f.services.settings;assert.equal((await f.call('status')).capabilities.config,false);delete f.services.pluginManager;assert.equal((await f.call('status')).supported,false);await assert.rejects(f.call('list'),{code:'native_unavailable'})})
test('catalog discovers missing official install targets and preserves third-party/native identity',async()=>{const f=fixture(),v=await f.call('list');assert(v.items.some(i=>i.id==='bundle:sample'));const missing=v.items.find(i=>i.id==='bundle:@deepseek-ai/dsh-subagent-codex');assert.equal(missing.canInstall,true);assert.equal(missing.category,'experimental');assert.equal(missing.canToggle,false)})
test('forms preserve primitives, enums, arrays and only normalized schema projection',async()=>{const f=fixture(),v=await f.call('detail',{id:'bundle:sample'}),s=v.sections[0];assert.equal(s.customPage,true);assert.equal(v.desktopOnly,true);assert.deepEqual(s.fields.find(x=>x.path[0]==='list').value,['a','']);assert.deepEqual(s.fields.find(x=>x.path[0]==='choice').options.map(x=>x.value),['a',null]);assert(s.unsupported.some(x=>x.path[0]==='complex'));assert(!s.fields.some(x=>x.path[0]==='hidden'));assert(!JSON.stringify(v).includes('SHOULD_NOT_LEAK'));assert(!JSON.stringify(v).includes('NEVER_EMIT'));assert(!Object.hasOwn(s.fields.find(x=>x.secret),'value'))})
test('native path mutation retains secrets and non-presented settings',async()=>{const f=fixture();await f.call('write-config',{id:'bundle:sample',ns:'sample',expectedRevision:7,ops:[{op:'set',path:['title'],value:'changed'}]});assert.equal(f.getData().token,'ORIGINAL_SECRET');assert.equal(f.getData().complex.a,'untouched');assert.equal(f.getData().hidden,'NEVER_EMIT_HIDDEN');assert.equal(f.calls[0][0],'mutate')})
test('write-only secrets change only through explicit operation',async()=>{const f=fixture();await f.call('write-config',{id:'bundle:sample',ns:'sample',expectedRevision:7,ops:[{op:'set',path:['token'],value:'NEW_SECRET'}]});assert.equal(f.getData().token,'NEW_SECRET')})
test('stale native revision refuses before mutation',async()=>{const f=fixture();f.advance();await assert.rejects(f.call('write-config',{id:'bundle:sample',ns:'sample',expectedRevision:7,ops:[{op:'set',path:['title'],value:'bad'}]}),{code:'settings_conflict'});assert.equal(f.calls.length,0)})
test('native atomic revision race is surfaced as conflict',async()=>{const f=fixture();f.settings.mutate=async()=>{throw Object.assign(new Error('native conflict'),{code:'SETTINGS_CONFLICT'})};try{await f.call('write-config',{id:'bundle:sample',ns:'sample',expectedRevision:7,ops:[{op:'set',path:['title'],value:'bad'}]});assert.fail()}catch(error){assert.equal(pluginError(error).code,'settings_conflict')}})
for(const [name,ops] of [['object overwrite',[{op:'set',path:[],value:{}}]],['undeclared',[{op:'set',path:['complex'],value:{}}]],['hidden',[{op:'set',path:['hidden'],value:'x'}]],['readonly inherited',[{op:'set',path:['locked','child'],value:'x'}]],['prototype',[{op:'set',path:['__proto__'],value:'x'}]],['wrong type',[{op:'set',path:['enabled'],value:'true'}]],['enum',[{op:'set',path:['choice'],value:'bad'}]],['range',[{op:'set',path:['count'],value:99}]],['array type',[{op:'set',path:['list'],value:[1]}]],['unknown op key',[{op:'set',path:['title'],value:'x',extra:true}]],['empty',[]]])test('reject '+name,async()=>{const f=fixture();await assert.rejects(f.call('write-config',{id:'bundle:sample',ns:'sample',expectedRevision:7,ops}),{code:'invalid_settings'});assert.equal(f.calls.length,0)})
test('cross namespace/self configuration and switch protection are enforced on backend',async()=>{const f=fixture();for(const id of ['plugin:include:ours','plugin:include:core','bundle:unsafe']){const d=await f.call('detail',{id});assert.equal(d.item.canToggle,false);await assert.rejects(f.call('set-enabled',{id,enabled:false,expectedRevision:d.item.revision}),{code:'read_only'})}await assert.rejects(f.call('write-config',{id:'bundle:sample',ns:'ours',expectedRevision:7,ops:[{op:'set',path:['token'],value:'x'}]}),{code:'read_only'});assert.equal(f.calls.length,0)})
test('toggle uses native method and preserves exact application result',async()=>{const f=fixture(),d=await f.call('detail',{id:'plugin:include:sample'});assert.equal((await f.call('set-enabled',{id:d.item.id,enabled:false,expectedRevision:d.item.revision})).application,'restart-required');assert.deepEqual(f.calls[0],['plugin','include:sample',false]);await assert.rejects(f.call('set-enabled',{id:d.item.id,enabled:false,expectedRevision:'stale'}),{code:'plugin_conflict'})})
test('installation only uses native official exact target and explicit confirmation',async()=>{const f=fixture(),d=await f.call('detail',{id:'bundle:@deepseek-ai/dsh-subagent-codex'});await assert.rejects(f.call('install',{id:d.item.id,expectedRevision:d.item.revision}),{code:'operation_unavailable'});await f.call('install',{id:d.item.id,expectedRevision:d.item.revision,confirm:true,spec:'malicious',approveBuilds:true});assert.deepEqual(f.calls[0],['install','@deepseek-ai/dsh-subagent-codex@0.2.2-rc.1',{enabled:true}])})
test('unknown operation, withdrawal and aborted work have no side effects',async()=>{const f=fixture();await assert.rejects(f.call('uninstall'),{code:'operation_unavailable'});const controller=new AbortController();controller.abort();await assert.rejects(f.adapter.control('list',{},controller.signal),{name:'AbortError'});assert.equal(f.calls.length,0)})
test('desktop-only preferences and standalone inventory rows are not plugin manager cards',async()=>{const f=fixture();f.plugins.push({entryId:'client-locale',patchId:'sample',moduleName:'@deepseek-ai/dsh-client-locale',enabled:true},{entryId:'custom-disabled',moduleName:'third-party/switch-only',enabled:false});const list=await f.call('list');assert(!list.items.some(x=>x.id==='plugin:custom-disabled'));assert(!list.items.some(x=>x.id==='plugin:client-locale'));assert.deepEqual((await f.call('detail',{id:'plugin:client-locale'})).sections,[]);await assert.rejects(f.call('write-config',{id:'plugin:client-locale',ns:'sample',expectedRevision:7,ops:[{op:'set',path:['title'],value:'x'}]}),{code:'read_only'})})
test('native provider replacement during snapshot never writes through a different service',async()=>{const f=fixture();f.manager.listPlugins=async()=>{f.services.pluginManager={...f.manager};return f.plugins};await assert.rejects(f.call('write-config',{id:'bundle:sample',ns:'sample',expectedRevision:7,ops:[{op:'set',path:['title'],value:'x'}]}),{code:'native_unavailable'});assert.equal(f.calls.length,0)})

for (const membership of ['rows', 'overrides']) test('native file URL remote components remain protected through bundle ' + membership, async () => {
 const f=fixture()
 f.plugins[1].moduleName='file:///C:/Users/Fixture/.dsh/profiles/desktop/node_modules/dsh-wechat-remote/native/index.js'
 f.plugins[1].readOnlyReason=undefined
 f.bundles.push({name:'dsh-wechat-remote',enabled:true,installed:true,availability:'profile',rows:membership==='rows'?[{entryId:'include:ours',moduleName:f.plugins[1].moduleName}]:[],overrides:membership==='overrides'?['ours']:[]})
 for(const id of ['plugin:include:ours','bundle:dsh-wechat-remote','bundle:unsafe']) {
  const detail=await f.call('detail',{id})
  assert.equal(detail.item.canToggle,false)
  await assert.rejects(f.call('set-enabled',{id,enabled:false,expectedRevision:detail.item.revision}),{code:'read_only'})
  await assert.rejects(f.call('write-config',{id,ns:'ours',expectedRevision:7,ops:[{op:'set',path:['title'],value:'disconnect'}]}),{code:'read_only'})
 }
 assert.equal(f.calls.length,0)
 // A similarly named file path alone never grants ownership to an unrelated package.
 f.plugins[0].moduleName='file:///C:/Users/Fixture/third-party/dsh-wechat-remote/native/index.js'
 assert.equal((await f.call('detail',{id:'plugin:include:sample'})).item.canToggle,true)
})

test('a failed native settings description preserves catalog and switches but never stale configuration writes',async()=>{
 const f=fixture(),before=await f.call('detail',{id:'bundle:sample'})
 assert.equal(before.sections.length,1)
 f.settings.describe=()=>{throw Error('third-party schema failed with internal diagnostic')}
 const catalog=await f.call('list');assert(catalog.items.some(i=>i.id==='bundle:sample'))
 const detail=await f.call('detail',{id:'bundle:sample'})
 assert.deepEqual(detail.sections,[]);assert.equal(detail.desktopOnly,true);assert.match(detail.desktopReason,/配置编辑已停用/)
 assert(!JSON.stringify(detail).includes('internal diagnostic'))
 await assert.rejects(f.call('write-config',{id:'bundle:sample',ns:'sample',expectedRevision:7,ops:[{op:'set',path:['title'],value:'bad'}]}),{code:'settings_unavailable'})
 await f.call('set-enabled',{id:'bundle:sample',enabled:false,expectedRevision:detail.item.revision})
 assert.deepEqual(f.calls,[['bundle','sample',false]])
})

test('old or unknown catalogs retain terminal/worktree; only official Forge successor retires them',async()=>{
 const f=fixture(),names=['@deepseek-ai/dsh-experimental-terminal-bundle','@deepseek-ai/dsh-experimental-tool-worktree']
 f.bundles.push(...names.map(name=>({name,enabled:false,official:true,rows:[]})))
 const ids=async()=>new Set((await f.call('list')).items.map(i=>i.id))
 let listed=await ids();assert(names.every(name=>listed.has('bundle:'+name)))
 const forge={name:'@deepseek-ai/dsh-experimental-forge-bundle',enabled:false,official:false,rows:[]}
 f.bundles.push(forge);listed=await ids();assert(names.every(name=>listed.has('bundle:'+name)))
 forge.official=true;listed=await ids();assert(names.every(name=>!listed.has('bundle:'+name)));assert(listed.has('bundle:'+forge.name))
})

function addBuiltins(f) {
 const namespaces=['subagent','subagent-model-selection-settings','web-search-deepseek','web','web-deepseek-api','agent-loop','pwsh-sandbox','bash-sandbox']
 f.plugins.push(...namespaces.map(ns=>({entryId:'native:'+ns,patchId:ns,moduleName:'@deepseek-ai/dsh-'+ns,enabled:true,fiberPhase:'active'})))
 f.plugins.push(...['subagent','web-search','agent-loop','shell'].map(n=>({entryId:'companion:'+n,moduleName:'@deepseek-ai/dsh-client-ui-settings-'+n,enabled:true,fiberPhase:'active'})))
 const original=f.settings.describe
 f.settings.describe=opts=>[...original(opts),...namespaces.map(ns=>({...original(opts)[0],ns}))]
 return namespaces
}
test('catalog v2 contains only live native companion cards, optional bundles and installed third-party bundles',async()=>{
 const f=fixture();addBuiltins(f)
 f.plugins.push({entryId:'extra',patchId:'sample',moduleName:'@deepseek-ai/dsh-extra-core',enabled:true,fiberPhase:'active'})
 const list=await f.call('list'),items=list.items.filter(i=>i.category==='official')
 assert.equal(list.catalogVersion,2)
 assert.deepEqual(items.map(i=>i.title),['子智能体','网页搜索','Agent 循环','终端'])
 assert.deepEqual(items.map(i=>i.iconKey),['subagent','search','loop','terminal'])
 assert(items.every(i=>i.builtin===true&&!i.canToggle&&!i.canInstall))
 assert(!list.items.some(i=>i.id==='plugin:extra'))
 const detail=await f.call('detail',{id:'plugin:extra'});assert.equal(detail.item.canToggle,false);assert.deepEqual(detail.sections,[])
 await assert.rejects(f.call('set-enabled',{id:'plugin:extra',enabled:false,expectedRevision:detail.item.revision}),{code:'read_only'})
 await assert.rejects(f.call('write-config',{id:'plugin:extra',ns:'sample',expectedRevision:7,ops:[{op:'set',path:['title'],value:'no'}]}),{code:'read_only'})
 assert.equal(f.calls.length,0)
})
test('companion grouped namespaces preserve native CAS and never expose internal enable switches',async()=>{
 const f=fixture();addBuiltins(f)
 const d=await f.call('detail',{id:'plugin:native:subagent'})
 assert.deepEqual(d.sections.map(s=>s.ns),['subagent','subagent-model-selection-settings']);assert.deepEqual(d.rows,[])
 const web=await f.call('detail',{id:'plugin:native:web-search-deepseek'});assert.deepEqual(web.sections.map(s=>s.ns),['web-search-deepseek','web','web-deepseek-api'])
 const shell=await f.call('detail',{id:'plugin:native:pwsh-sandbox'});assert.deepEqual(shell.sections.map(s=>s.ns),['pwsh-sandbox'])
 await f.call('write-config',{id:d.item.id,ns:'subagent-model-selection-settings',expectedRevision:7,ops:[{op:'set',path:['enabled'],value:false}]})
 assert.equal(f.calls[0][1],'subagent-model-selection-settings')
 await assert.rejects(f.call('write-config',{id:d.item.id,ns:'subagent',expectedRevision:7,ops:[{op:'set',path:['enabled'],value:true}]}),{code:'settings_conflict'})
 const secondary=await f.call('detail',{id:'plugin:native:subagent-model-selection-settings'});assert.equal(secondary.item.canToggle,false)
 await assert.rejects(f.call('set-enabled',{id:secondary.item.id,expectedRevision:secondary.item.revision,enabled:false}),{code:'read_only'})
})
test('companion visibility follows real activity and required served namespaces, with no fixed four rows',async()=>{
 const f=fixture();addBuiltins(f)
 f.plugins.find(p=>p.entryId==='companion:subagent').enabled=false
 f.plugins.find(p=>p.entryId==='companion:agent-loop').fiberPhase='loading'
 const describe=f.settings.describe;f.settings.describe=opts=>describe(opts).filter(s=>s.ns!=='web-search-deepseek'&&s.ns!=='pwsh-sandbox')
 const list=await f.call('list');assert.deepEqual(list.items.filter(i=>i.builtin).map(i=>i.id),['plugin:native:bash-sandbox'])
})
test('native display filtering retains installed, enabled, running or broken offers and hides unlisted catalog-only items',async()=>{
 const f=fixture()
 const rows=[
  {name:'not-installed',enabled:false,official:false,installed:false,rows:[]},
  {name:'third-installed',enabled:false,official:false,installed:true,listedByDefault:false,rows:[]},
  {name:'broken',enabled:true,official:false,installed:false,error:{code:'not-bundle'},rows:[]},
  {name:'@deepseek-ai/future-offer',enabled:false,official:true,installed:false,listedByDefault:false,rows:[]},
  {name:'@deepseek-ai/future-running',enabled:false,official:true,installed:false,listedByDefault:false,rows:[{entryId:'include:sample'}]},
  {name:'@deepseek-ai/dsh-base',enabled:true,official:false,installed:true,rows:[]}]
 f.bundles.push(...rows)
 const ids=new Set((await f.call('list')).items.map(i=>i.id))
 for(const n of ['third-installed','broken','@deepseek-ai/future-running'])assert(ids.has('bundle:'+n))
 for(const n of ['not-installed','@deepseek-ai/future-offer','@deepseek-ai/dsh-base'])assert(!ids.has('bundle:'+n))
 const hidden=await f.call('detail',{id:'bundle:@deepseek-ai/dsh-base'});assert.equal(hidden.item.canToggle,false)
})
test('a platform-rejected official install target is never enabled from the mobile catalog',async()=>{
 const f=fixture();const b=f.bundles.find(x=>x.installTarget);b.error={code:'unsupported-platform'}
 const d=await f.call('detail',{id:'bundle:'+b.name});assert.equal(d.item.canInstall,false)
 await assert.rejects(f.call('install',{id:d.item.id,expectedRevision:d.item.revision,confirm:true}),{code:'operation_unavailable'})
})
