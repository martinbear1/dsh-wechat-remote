/** Real shipped DSH plugin manager, Settings and HMR; synthetic profile only. */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL, fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
import { build } from 'esbuild'
const archive=process.env.HARNESS_DSH_ASAR
assert(archive,'HARNESS_DSH_ASAR must explicitly select an official archive')
// Windows cannot delete a loaded .node DLL until its process exits. Own cleanup in a parent process.
if(!process.env.HARNESS_PLUGIN_NATIVE_WORK){
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'plugins-native-'))
 let result
 try{result=spawnSync(process.execPath,[fileURLToPath(import.meta.url)],{stdio:'inherit',env:{...process.env,HARNESS_PLUGIN_NATIVE_WORK:directory}})}
 finally{assert.equal(path.dirname(path.resolve(directory)),path.resolve(os.tmpdir()));assert(path.basename(directory).startsWith('plugins-native-'));fs.rmSync(directory,{recursive:true,force:true,maxRetries:3,retryDelay:100})}
 process.exit(result?.status??1)
}
const work=process.env.HARNESS_PLUGIN_NATIVE_WORK
assert.equal(path.dirname(path.resolve(work)),path.resolve(os.tmpdir()));assert(path.basename(work).startsWith('plugins-native-'))
let fd,ctx,network=0
const originalFetch=globalThis.fetch
globalThis.fetch=async()=>{network++;throw Error('Network forbidden in native fixture')}
try{
 fd=fs.openSync(archive,'r');const prefix=Buffer.alloc(16);fs.readSync(fd,prefix,0,16,0)
 const bytes=Buffer.alloc(prefix.readUInt32LE(12));fs.readSync(fd,bytes,0,bytes.length,16)
 const tree=JSON.parse(bytes),dataStart=8+prefix.readUInt32LE(4)
 function extract(entry,relative){const target=path.resolve(work,relative);assert(target.startsWith(work+path.sep));assert(!entry.link)
  if(entry.files)for(const[name,child]of Object.entries(entry.files))extract(child,path.join(relative,name))
  else if(/\.(?:[mc]?js|json|node|dll|wasm|ya?ml|svg|png|jpe?g|webp)$/.test(relative)){fs.mkdirSync(path.dirname(target),{recursive:true});if(entry.unpacked)fs.copyFileSync(path.join(archive+'.unpacked',relative),target);else{const data=Buffer.alloc(entry.size);fs.readSync(fd,data,0,data.length,dataStart+Number(entry.offset));fs.writeFileSync(target,data)}}}
 extract(tree.files.dsh,'dsh')
 const anchor=path.join(work,'dsh/node_modules/@deepseek-ai/dsh/package.json'),require=createRequire(anchor),load=name=>import(pathToFileURL(require.resolve(name)).href)
 const {boot,initProfile,readProfilePatches,loadProfileDirectory,composeEntries}=await load('@deepseek-ai/dsh-app-boot')
 const {default:PluginManager}=await load('@deepseek-ai/dsh-plugin-manager'),{default:Settings}=await load('@deepseek-ai/dsh-settings')
 const {default:ConfigEditor}=await load('@deepseek-ai/dsh-config-editor'),{default:Timer}=await load('@deepseek-ai/cordis-plugin-timer'),{default:Hmr}=await load('@deepseek-ai/dsh-hmr'),{default:z}=await load('@deepseek-ai/schemastery')
 const home=path.join(work,'synthetic-home'),dir=path.join(home,'profiles','test');fs.mkdirSync(home,{recursive:true});initProfile(dir,['core','sample','dsh-wechat-remote'])
 function bundle(name,rows){const p=path.join(dir,'node_modules',name);fs.mkdirSync(p,{recursive:true});fs.writeFileSync(path.join(p,'package.json'),JSON.stringify({name,version:'1.0.0',dsh:{bundle:{patch:'cordis.patch.yml'}}}));fs.writeFileSync(path.join(p,'cordis.patch.yml'),JSON.stringify([{insert:rows}]))}
 bundle('core',[{id:'manager',name:'cordis:manager'},{id:'config-editor',name:'cordis:editor'},{id:'settings',name:'cordis:settings'}])
 bundle('sample',[{id:'probe',name:'cordis:probe',config:{ordinary:'keep',token:'native-private',count:2,list:['original']}}])
 // Exact shipped schemas with isolated no-op providers: no Agents or model requests.
 function nativeSchemaFixture(name, source) {
  const p=path.join(dir,'node_modules',name);fs.mkdirSync(p,{recursive:true})
  fs.writeFileSync(path.join(p,'package.json'),JSON.stringify({name,version:'1.0.0',type:'module',main:'index.mjs'}))
  fs.writeFileSync(path.join(p,'index.mjs'),`import * as source from ${JSON.stringify(pathToFileURL(require.resolve(source)).href)};export const Config=source.Config??source.default?.Config??source.SubagentModelSelectionConfig?.Config;export const apply=()=>{};`)
 }
 nativeSchemaFixture('@deepseek-ai/dsh-native-fixture-subagent','@deepseek-ai/dsh-subagent')
 nativeSchemaFixture('@deepseek-ai/dsh-native-fixture-model-selection','@deepseek-ai/dsh-tool-subagent/model-selection-settings')
 const pageRows=[{id:'subagent',name:'@deepseek-ai/dsh-native-fixture-subagent',config:{maxDepth:1,maxActiveSubagents:8}},{id:'subagent-model-selection-settings',name:'@deepseek-ai/dsh-native-fixture-model-selection',config:{enabled:false,allowedModels:[]}}]
 for(const companion of ['subagent','web-search','agent-loop','shell']) {
  const name='@deepseek-ai/dsh-client-ui-settings-'+companion,companionDir=path.join(dir,'node_modules',name);fs.mkdirSync(companionDir,{recursive:true})
  fs.writeFileSync(path.join(companionDir,'package.json'),JSON.stringify({name,version:'1.0.0',type:'module',main:'index.mjs'}))
  fs.writeFileSync(path.join(companionDir,'index.mjs'),`export * from ${JSON.stringify(pathToFileURL(require.resolve(name)).href)};`)
  pageRows.push({id:companion+'-settings-page',name})
 }
 for(const [ns,config] of Object.entries({'web-search-deepseek':{maxUses:5},'web-deepseek-api':{count:10},web:{searchProvider:'deepseek-official',fetchProvider:'http'},'agent-loop':{maxParallelToolCalls:4},'pwsh-sandbox':{timeoutMs:10000,maxOutputBytes:10000}})) {
  const name='@deepseek-ai/dsh-native-fixture-'+ns;nativeSchemaFixture(name,'@deepseek-ai/dsh-'+ns);pageRows.push({id:ns,name,config})
 }
 bundle('native-page-fixture',pageRows)
 const profileManifest=JSON.parse(fs.readFileSync(path.join(dir,'package.json'),'utf8'));profileManifest.dsh.profile.bundles.push('native-page-fixture');fs.writeFileSync(path.join(dir,'package.json'),JSON.stringify(profileManifest))
 // Match the published installer's native file URL entry, with a harmless
 // synthetic component; ownership must come from the real bundle inventory.
 const carrierEntry=path.join(dir,'node_modules/dsh-wechat-remote/native/index.mjs')
 bundle('dsh-wechat-remote',[{id:'gate',name:pathToFileURL(carrierEntry).href,config:{enabled:true}}])
 fs.mkdirSync(path.dirname(carrierEntry),{recursive:true})
 fs.writeFileSync(carrierEntry,`import z from ${JSON.stringify(pathToFileURL(require.resolve('@deepseek-ai/schemastery')).href)}; export const Config=z.object({enabled:z.boolean().volatile()});export const apply=()=>{};`)
 const manifest=JSON.parse(fs.readFileSync(path.join(dir,'package.json'),'utf8'));manifest.dependencies={sample:'1.0.0','dsh-wechat-remote':'1.0.0'};fs.writeFileSync(path.join(dir,'package.json'),JSON.stringify(manifest));fs.writeFileSync(path.join(dir,'cordis.yml'),'[]\n')
 const profile={name:'test',startedBundles:loadProfileDirectory('test',dir,anchor).layers.map(x=>x.packageName),dir,patchPath:path.join(dir,'cordis.patch.yml'),installAnchor:anchor,cwd:home,home,overlays:[],telemetryDisabledEnv:undefined}
 const Probe={Config:z.object({ordinary:z.string().required(),count:z.number().min(1).default(2).volatile(),token:z.string().role('secret').volatile(),list:z.array(z.string()).volatile(),complex:z.array(z.object({name:z.string()})).volatile()}),apply:()=>{}}
 ctx=await boot('test',path.join(dir,'cordis.yml'),readProfilePatches('test',profile),c=>{c.provide('profileContext',profile);c.provide('appReady',{onReady:f=>{f();return()=>{}}});Object.assign(c.loader.builtins,{manager:PluginManager,editor:ConfigEditor,settings:Settings,probe:Probe})})
 await ctx.plugin(Timer);await ctx.plugin(Hmr,{root:[],ignored:[],debounce:0});await ctx.hmr.runExclusive(async()=>{})
 const out=path.join(work,'dsh/adapter.mjs');await build({entryPoints:['src/plugin-manager/native.ts'],outfile:out,bundle:true,packages:'external',platform:'node',format:'esm'})
 const {NativePluginManager}=await import(pathToFileURL(out).href),adapter=new NativePluginManager(ctx),signal=new AbortController().signal,call=(action,input={})=>adapter.control(action,input,signal)
 ctx.provide('sessionController',{modelCatalog:async()=>({groups:[{id:'fixture',name:'Fixture',models:[{id:'model',name:'Synthetic catalog entry'}]}],failures:[]})})
 assert.equal((await call('status')).supported,true)
 const catalog=await call('list');assert.equal(catalog.catalogVersion,2);assert(catalog.items.some(x=>x.id==='bundle:sample'))
 assert(catalog.items.every(x=>x.kind==='bundle'||x.builtin===true),'raw Host inventory is not a desktop card')
 const hostVersion=JSON.parse(fs.readFileSync(anchor,'utf8')).version
 const webModule = await load('@deepseek-ai/dsh-web')
 const split = typeof webModule.default?.prototype?.listProviders === 'function' || typeof webModule.WebService?.prototype?.listProviders === 'function'
 let removeOptionalProvider
 if (split) {
  await ctx.plugin(webModule.default,{})
  const noNetwork=()=>{throw new Error('fixture service must not access the network')}
  for (const id of ['deepseek-search-api','deepseek-official']) ctx.web.registerSearchProvider({id,available:()=>true,search:noNetwork})
  for (const id of ['http','deepseek-fetch-api']) ctx.web.registerFetchProvider({id,available:()=>true,fetch:noNetwork})
  removeOptionalProvider=ctx.web.registerFetchProvider({id:'optional-fixture',available:()=>true,fetch:noNetwork})
 }
 const actualNames=new Set(catalog.items.map(item=>item.id))
 for(const name of ['experimental-terminal-bundle','experimental-tool-worktree']) {
  if(hostVersion==='0.2.1-rc.5') assert(actualNames.has('bundle:@deepseek-ai/dsh-'+name),'old native manager card retained: '+name)
  if(hostVersion==='0.2.2-rc.1') assert(!actualNames.has('bundle:@deepseek-ai/dsh-'+name),'new official successor catalog retires: '+name)
 }
 if(hostVersion==='0.2.2-rc.1') assert(actualNames.has('bundle:@deepseek-ai/dsh-experimental-forge-bundle'))
 if (split) {
  const card = catalog.items.find(i=>i.builtin && i.iconKey==='search')
  const detail = await call('detail',{id:card.id})
  assert.equal(detail.presentation.web,undefined)
  assert.equal(detail.presentation.credential,undefined)
  const [search,fetch] = ['searchProvider','fetchProvider'].map(k=>detail.presentation.fields.find(f=>f.ns==='web' && f.path[0]===k))
  assert(search.options.some(o=>o.value==='deepseek-search-api') && fetch.options.some(o=>o.value==='http'))
  if (process.env.HARNESS_MINI_DIR) {
    const phone = createRequire(path.join(process.env.HARNESS_MINI_DIR,'app.js'))
    assert(phone('./packages/plugin-manager/client.js').validate('detail',detail))
    const fields = phone('./packages/plugin-manager/official.js').sections(detail).flatMap(s=>s.fields)
    assert([search,fetch].every(field=>fields.some(f=>f.path[0]===field.path[0] && f.type==='enum')))
  }
  const section = detail.sections.find(s=>s.ns==='web')
  const change = {ns:'web',expectedRevision:section.revision,ops:[{op:'set',path:['searchProvider'],value:'deepseek-search-api'}]}
  const stale = await call('write-page',{id:card.id,sections:[change],credential:{value:'fixture',expectedRevision:'old'}})
  assert.equal(stale.application,'failed');assert.deepEqual(stale.appliedNamespaces,[])
  const mixed = await call('write-page',{id:card.id,sections:[change]})
  assert.equal(mixed.application,'applied',JSON.stringify(mixed))
  const actual = ctx.settings.describe().find(f=>f.ns==='web').value
  assert.equal(actual.searchProvider,'deepseek-search-api');assert.equal(actual.fetchProvider,'http')
  const refreshed = await call('detail',{id:card.id})
  const group = refreshed.sections.find(s=>s.ns==='web')
  await assert.rejects(call('write-config',{id:card.id,ns:'web',expectedRevision:group.revision,ops:[{op:'set',path:['fetchProvider'],value:'unknown-service'}]}))
  assert(fetch.options.some(o=>o.value==='optional-fixture'))
  removeOptionalProvider()
  const expired={...change,expectedRevision:group.revision,ops:[{op:'set',path:['fetchProvider'],value:'optional-fixture'}]}
  assert.equal((await call('write-page',{id:card.id,sections:[expired]})).application,'failed')
  const billing=refreshed.sections.find(s=>s.ns==='web-deepseek-api')
  const editBilling={ns:billing.ns,expectedRevision:billing.revision,ops:[{op:'set',path:['searchBilling'],value:'api-key'}]}
  assert.equal((await call('write-page',{id:card.id,sections:[editBilling]})).application,'applied')
  assert.equal(ctx.settings.describe().find(f=>f.ns===billing.ns).value.searchBilling,'api-key')
  console.log('PASS registered service disposal, independent selectors, mobile rendering, mixed settings, stale credentials, billing and generic write guard')
 } else {
  const card=catalog.items.find(i=>i.builtin&&i.iconKey==='search')
  const detail=await call('detail',{id:card.id})
  assert.equal(detail.presentation.web?.switchAvailable,true,'preserve the old coupled search switch')
 }
 const nativePage=catalog.items.find(x=>x.builtin&&x.iconKey==='subagent');assert(nativePage,'real companion + exact shipped Settings schemas produce the builtin page')
 const nativeDetail=await call('detail',{id:nativePage.id});assert(nativeDetail.presentation.models,'exact shipped object-route schema admitted')
 const modelSection=nativeDetail.sections.find(s=>s.ns==='subagent-model-selection-settings'),limitsSection=nativeDetail.sections.find(s=>s.ns==='subagent')
 const pageChanges=[{ns:modelSection.ns,expectedRevision:modelSection.revision,ops:[{op:'set',path:['enabled'],value:true},{op:'set',path:['allowedModels'],value:[{provider:'fixture',model:'model'}]}]},{ns:limitsSection.ns,expectedRevision:limitsSection.revision,ops:[{op:'set',path:['maxActiveSubagents'],value:9}]}]
 const savedPage=await call('write-page',{id:nativePage.id,sections:pageChanges});assert.equal(savedPage.application,'applied');assert.deepEqual(savedPage.appliedNamespaces,[modelSection.ns,limitsSection.ns])
 // A separate adapter/Client reads Host Settings, not shared UI state.
 const secondClient=new NativePluginManager(ctx),second=await secondClient.control('detail',{id:nativePage.id},signal)
 assert.equal(second.sections.find(s=>s.ns==='subagent').fields.find(f=>f.path[0]==='maxActiveSubagents').value,9)
 assert(second.presentation.models.candidates.some(c=>c.provider==='fixture'&&c.model==='model'&&c.selected))
 const stale=await secondClient.control('write-page',{id:nativePage.id,sections:pageChanges},signal);assert.equal(stale.application,'failed');assert.equal(stale.error.code,'settings_conflict')
 const currentLimits=second.sections.find(s=>s.ns==='subagent')
 await ctx.settings.mutate('subagent',[{op:'set',path:['maxActiveSubagents'],value:10}],currentLimits.revision)
 const desktopConflict=await call('write-page',{id:nativePage.id,sections:[{ns:'subagent',expectedRevision:currentLimits.revision,ops:[{op:'set',path:['maxActiveSubagents'],value:11}]}]})
 assert.equal(desktopConflict.application,'failed');assert.equal(desktopConflict.error.code,'settings_conflict')
 const otherPages=[]
 for(const [iconKey,edits] of [
  ['search',{'web-search-deepseek':[{op:'set',path:['maxUses'],value:6}],'web-deepseek-api':[{op:'set',path:['count'],value:15}],web:[{op:'set',path:['searchProvider'],value:'deepseek-search-api'},{op:'set',path:['fetchProvider'],value:'deepseek-fetch-api'}]}],
  ['loop',{'agent-loop':[{op:'set',path:['maxParallelToolCalls'],value:5}]}],
  ['terminal',{'pwsh-sandbox':[{op:'set',path:['timeoutMs'],value:12000},{op:'set',path:['maxOutputBytes'],value:12000}]}],
 ]) {
  const card=(await call('list')).items.find(x=>x.builtin&&x.iconKey===iconKey);assert(card,'actual native companion available: '+iconKey)
  const before=await call('detail',{id:card.id}),sections=Object.entries(edits).map(([ns,ops])=>{const s=before.sections.find(s=>s.ns===ns);assert(s,'actual native section: '+ns);return{ns,expectedRevision:s.revision,ops}})
  const saved=await call('write-page',{id:card.id,sections});assert.equal(saved.application,'applied',JSON.stringify(saved))
  const fresh=await secondClient.control('detail',{id:card.id},signal)
  for(const [ns,ops]of Object.entries(edits))for(const op of ops)assert.deepEqual(fresh.sections.find(s=>s.ns===ns).fields.find(f=>JSON.stringify(f.path)===JSON.stringify(op.path)).value,op.value)
  const stale=await secondClient.control('write-page',{id:card.id,sections},signal);assert.equal(stale.application,'failed');assert.equal(stale.error.code,'settings_conflict')
  otherPages.push(before,fresh)
 }
 const carrier=await call('detail',{id:'bundle:dsh-wechat-remote'})
 assert.equal(carrier.item.canToggle,false)
 assert(carrier.rows.some(row=>row.name.startsWith('file:')))
 for(const row of carrier.rows){assert.equal(row.canToggle,false);await assert.rejects(call('set-enabled',{id:row.id,expectedRevision:row.revision,enabled:false}),{code:'read_only'});const direct=await call('detail',{id:row.id});assert(direct.sections.every(section=>!section.writable));await assert.rejects(call('write-config',{id:row.id,ns:'gate',expectedRevision:direct.sections[0].revision,ops:[{op:'set',path:['enabled'],value:false}]}),{code:'read_only'})}
 let detail=await call('detail',{id:'bundle:sample'}),section=detail.sections.find(x=>x.ns==='probe');assert(section,'native namespace mapped by patchId');assert(section.fields.find(x=>x.path[0]==='count'));assert(!JSON.stringify(detail).includes('native-private'));assert(!section.fields.some(x=>x.path[0]==='ordinary'))
 await call('write-config',{id:'bundle:sample',ns:'probe',expectedRevision:section.revision,ops:[{op:'set',path:['count'],value:3},{op:'set',path:['list'],value:['a','']} ]})
 const native=ctx.settings.describe().find(x=>x.ns==='probe');assert.equal(native.value.count,3);assert.equal(native.value.token,'native-private');assert.deepEqual(native.value.list,['a','']);assert.equal(ctx.configEditor.entries().find(x=>x.options.id==='probe').options.config.ordinary,'keep')
 await assert.rejects(call('write-config',{id:'bundle:sample',ns:'probe',expectedRevision:section.revision,ops:[{op:'set',path:['count'],value:4}]}),{code:'settings_conflict'})
 detail=await call('detail',{id:'bundle:sample'});section=detail.sections.find(x=>x.ns==='probe')
 await ctx.settings.mutate('probe',[{op:'set',path:['count'],value:4}],section.revision)
 await assert.rejects(call('write-config',{id:'bundle:sample',ns:'probe',expectedRevision:section.revision,ops:[{op:'set',path:['count'],value:5}]}),{code:'settings_conflict'})
 const before=await call('detail',{id:'bundle:sample'}),disabled=await call('set-enabled',{id:'bundle:sample',expectedRevision:before.item.revision,enabled:false});assert.equal(disabled.application,'applied');assert.equal((await call('detail',{id:'bundle:sample'})).sections.length,0)
 const off=await call('detail',{id:'bundle:sample'});assert.equal(off.item.enabled,false);assert.equal((await call('set-enabled',{id:'bundle:sample',expectedRevision:off.item.revision,enabled:true})).application,'applied')
 const enabled=await call('detail',{id:'bundle:sample'});assert.equal(enabled.sections[0].fields.find(x=>x.path[0]==='count').value,4)
 const official=(await ctx.pluginManager.listBundles()).filter(x=>x.official)
 if(process.env.HARNESS_PLUGIN_ICONS) fs.writeFileSync(process.env.HARNESS_PLUGIN_ICONS,JSON.stringify({hostVersion,source:'native pluginManager.listBundles().meta.icon',icons:official.map(b=>({name:b.name,title:b.meta?.title,version:b.version,icon:b.meta?.icon}))},null,2)+'\n')
 const schemaInventory={},baseDeclarations=[]
 if(process.env.HARNESS_PLUGIN_INVENTORY==='1'){
  const schemaFile=path.join(work,'schema-adapter.mjs');await build({entryPoints:['src/plugin-manager/schema.ts'],outfile:schemaFile,bundle:true,platform:'node',format:'esm'})
  const {formSection}=await import(pathToFileURL(schemaFile).href)
  // Read-only declaration inventory mirrors the native volatile selection rule; it is not used by product writes.
  function volatileForm(schema){if(schema.meta.volatile)return schema;if(schema.type!=='object')return;const dict=Object.fromEntries(Object.entries(schema.dict??{}).flatMap(([key,child])=>{const field=volatileForm(child);return field?[[key,field]]:[]}));return Object.keys(dict).length?z.object(dict):undefined}
  const baselineDir=path.join(home,'profile-declaration-only');initProfile(baselineDir,['@deepseek-ai/dsh-base','@deepseek-ai/dsh-web-app'])
  const baseline=loadProfileDirectory('test',baselineDir,anchor)
  for(const row of composeEntries(baseline.layers.map(l=>l.patches))){if(typeof row.id==='string'&&typeof row.name==='string')baseDeclarations.push({rowId:row.id,moduleName:row.name})}
  for(const row of [...official.flatMap(b=>b.rows),...baseDeclarations]){
   if(schemaInventory[row.moduleName])continue
   if(/\/client$/.test(row.moduleName)){schemaInventory[row.moduleName]={clientPage:true,reason:'Explicit browser export; not executed by host schema inventory'};continue}
   try{const module=await load(row.moduleName),config=module.Config??module.default?.Config,form=config&&typeof config.toJSON==='function'?volatileForm(config):undefined
    schemaInventory[row.moduleName]={hasConfig:!!config,hasLiveSchema:!!form,...(form?{section:formSection({ns:row.rowId,revision:0,autoGenerate:true,schema:form.toJSON(),value:{}},row.rowId,true)}:{})}
   }catch(error){schemaInventory[row.moduleName]={inspection:'unavailable',reason:String(error.message).slice(0,300)}}
  }
 }
 let officialPolicy
 try{officialPolicy=await load('@deepseek-ai/dsh-official-bundles')}catch{officialPolicy=await load('@deepseek-ai/dsh-app-boot')}
 const nativeBundles=await ctx.pluginManager.listBundles(),nativePlugins=await ctx.pluginManager.listPlugins()
 const expectedHidden=officialPolicy.HIDDEN_BUNDLES??new Set(['base','web-app','headless','sdk-app','acp-app','sdk-minimal'].map(s=>'@deepseek-ai/dsh-'+s))
 const expected=nativeBundles.filter(b=>!expectedHidden.has(b.name)&&(b.listedByDefault!==false||b.enabled||b.installed||b.rows.some(r=>nativePlugins.some(p=>p.entryId===r.entryId&&p.enabled)))&&(b.installed||b.official||b.error!==undefined)).map(b=>'bundle:'+b.name).sort()
 assert.deepEqual((await call('list')).items.filter(x=>x.kind==='bundle').map(x=>x.id).sort(),expected,'matches this exact native desktop display predicate')
 assert((await call('list')).items.filter(x=>x.kind==='bundle'&&x.category==='experimental').every(x=>nativeBundles.find(b=>b.name===x.name).official))
 const report={hostVersion:JSON.parse(fs.readFileSync(anchor,'utf8')).version,passed:true,network,liveProfileTouched:false,catalog:{version:2,nativeDesktopCount:expected.length,items:catalog.items.map(x=>({id:x.id,category:x.category,canToggle:x.canToggle}))},checks:['native discovery','native desktop bundle display predicate','no raw Host inventory cards','native schema normalization','secret preservation','unpresented ordinary config preservation','real revision CAS','desktop edit conflict','native HMR disable/enable and persisted settings','native file URL carrier bundle ownership protection'],official:official.map(b=>({name:b.name,title:b.meta?.title,availability:b.availability,optional:b.optional,readOnlyReason:b.readOnlyReason,rows:b.rows.map(r=>({id:r.rowId,module:r.moduleName})),overrides:b.overrides,installTarget:b.installTarget})),baseDeclarations,schemaInventory,policy:{optional:officialPolicy.OPTIONAL_BUNDLES,onDemand:officialPolicy.ON_DEMAND_BUNDLES,experimental:officialPolicy.EXPERIMENTAL_BUNDLES?[...officialPolicy.EXPERIMENTAL_BUNDLES]:undefined,hidden:officialPolicy.HIDDEN_BUNDLES?[...officialPolicy.HIDDEN_BUNDLES]:undefined}}
 assert.equal(network,0)
 report.checks.push('exact shipped subagent and allowedModels Config schemas','native multi-namespace page save','independent second Client reads persisted settings and model selection','stale second Client whole-page save rejected','native desktop Settings mutation rejects stale mobile save','exact shipped web three namespaces, write and independent readback/CAS','exact shipped Agent loop schema, write and independent readback/CAS','exact shipped PowerShell schema, write and independent readback/CAS')
 report.presentationFixture={native:['PluginManager','Settings','ConfigEditor','HMR','subagent Config','model-selection Config','web/search/API Config','agent-loop Config','PowerShell Config','four companion host apply'],synthetic:['isolated profile','no-op Agent/executor providers','model catalog service entries'],realDeviceActions:false}
 if(process.env.HARNESS_PLUGIN_PAGES)fs.writeFileSync(process.env.HARNESS_PLUGIN_PAGES,JSON.stringify({hostVersion,fixture:report.presentationFixture,pages:[nativeDetail,second,...otherPages]},null,2)+'\n')
 if(process.env.HARNESS_PLUGIN_REPORT)fs.writeFileSync(process.env.HARNESS_PLUGIN_REPORT,JSON.stringify(report,null,2)+'\n')
 console.log(JSON.stringify({...report,official:report.official.length,policy:undefined,schemaInventory:undefined,baseDeclarations:baseDeclarations.length}))
}finally{globalThis.fetch=originalFetch;if(fd!==undefined)fs.closeSync(fd);await ctx?.fiber?.dispose?.()}
