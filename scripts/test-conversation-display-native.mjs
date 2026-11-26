/** Real shipped native Settings/Cordis profile. No live profiles, model requests or network. */
import fs from 'node:fs'
import path from 'node:path'
import assert from 'node:assert/strict'
import {createRequire} from 'node:module'
import {pathToFileURL} from 'node:url'
import {build} from 'esbuild'
const runtime=process.env.HARNESS_DSH_ROOT,work=process.env.HARNESS_DISPLAY_WORK
assert(runtime&&work,'Explicit isolated runtime and fixture paths required')
assert(!fs.existsSync(work),'Fixture path must be fresh; never overwrite real configuration')
fs.mkdirSync(work,{recursive:true})
const anchor=path.join(runtime,'node_modules/@deepseek-ai/dsh/package.json'),require=createRequire(anchor),load=name=>import(pathToFileURL(require.resolve(name)).href)
let ctx,requests=0
const previousFetch=globalThis.fetch;globalThis.fetch=async()=>{requests++;throw Error('Network forbidden in native fixture')}
try{
 const {boot,initProfile,readProfilePatches,loadProfileDirectory}=await load('@deepseek-ai/dsh-app-boot')
 const {default:Settings}=await load('@deepseek-ai/dsh-settings'),{default:ConfigEditor}=await load('@deepseek-ai/dsh-config-editor')
 const {default:Timer}=await load('@deepseek-ai/cordis-plugin-timer'),{default:Hmr}=await load('@deepseek-ai/dsh-hmr')
 const nativeChat=await load('@deepseek-ai/dsh-client-ui-chat')
 const home=path.join(work,'home'),dir=path.join(home,'profiles','desktop');fs.mkdirSync(home,{recursive:true});initProfile(dir,['display-fixture'])
 const bundle=path.join(dir,'node_modules/display-fixture');fs.mkdirSync(bundle,{recursive:true});fs.writeFileSync(path.join(bundle,'package.json'),JSON.stringify({name:'display-fixture',version:'1.0.0',dsh:{bundle:{patch:'cordis.patch.yml'}}}))
 fs.writeFileSync(path.join(bundle,'cordis.patch.yml'),JSON.stringify([{insert:[{id:'config-editor',name:'cordis:editor'},{id:'settings',name:'cordis:settings'},{id:'ui-chat',name:'cordis:chat',config:{transcriptView:'detailed',collapseTiming:'completion',foldedReplies:'all',performanceUsage:'compact',linkOpening:'sidebar'}}]}]))
 fs.writeFileSync(path.join(dir,'cordis.yml'),'[]\n')
 const profile={name:'desktop',startedBundles:loadProfileDirectory('desktop',dir,anchor).layers.map(x=>x.packageName),dir,patchPath:path.join(dir,'cordis.patch.yml'),installAnchor:anchor,cwd:home,home,overlays:[],overlayPaths:[],telemetryDisabledEnv:undefined}
 ctx=await boot('desktop',path.join(dir,'cordis.yml'),readProfilePatches('desktop',profile),c=>{c.provide('profileContext',profile);c.provide('appReady',{onReady:f=>{f();return()=>{}}});Object.assign(c.loader.builtins,{editor:ConfigEditor,settings:Settings,chat:{Config:nativeChat.Config,apply:()=>{}}})})
 await ctx.plugin(Timer);await ctx.plugin(Hmr,{root:[],ignored:[],debounce:0});await ctx.hmr.runExclusive(async()=>{})
 const output=path.join(work,'adapter.mjs');await build({entryPoints:['src/conversation-display.ts'],outfile:output,bundle:true,platform:'node',format:'esm',target:'node22',plugins:[{name:'exact-native-runtime',setup(b){b.onResolve({filter:/^@deepseek-ai\//},args=>({path:pathToFileURL(require.resolve(args.path)).href,external:true}))}}]})
 const {NativeConversationDisplay,WechatDisplayService}=await import(pathToFileURL(output).href),adapter=new NativeConversationDisplay(ctx),signal=new AbortController().signal
 const notifications=[];ctx.on('settings/document-updated',(ns,revision)=>notifications.push({ns,revision}))
 const original=await adapter.read(signal);assert(original.supported&&original.writable,JSON.stringify(original));assert.equal(original.values.transcriptView,'detailed')
 const fields=Object.keys(original.options);assert(fields.includes('transcriptView'))
 const next=await adapter.patch({expectedRevision:original.revision,expectedGeneration:original.generation,changes:{transcriptView:'compact',...(fields.includes('foldedReplies')?{foldedReplies:'final'}:{})}},signal)
 assert.equal(next.values.transcriptView,'compact');assert(next.revision>original.revision)
 const accepted=ctx.settings.describe({redactSecrets:true}).find(x=>x.ns==='ui-chat');assert.equal(accepted.value.transcriptView,'compact');assert.equal(accepted.value.performanceUsage,'compact');assert.equal(accepted.value.linkOpening,'sidebar')
 await assert.rejects(adapter.patch({expectedRevision:original.revision,expectedGeneration:original.generation,changes:{transcriptView:'detailed'}},signal),error=>error.code==='settings_conflict')
 // The same public native method used by desktop ConfigForm updates is observed by the phone.
 await ctx.settings.mutate('ui-chat',[{op:'set',path:['transcriptView'],value:'verbose'}],next.revision)
 const desktop=await adapter.read(signal);assert.equal(desktop.values.transcriptView,'verbose');assert(desktop.revision>next.revision)
 await new Promise(resolve=>setTimeout(resolve,30));assert(notifications.some(x=>x.ns==='ui-chat'&&x.revision>=next.revision),'native invalidation emitted for connected client mirrors')
 const {default:Typert}=await load('@deepseek-ai/dsh-typert-registry'),{TypertGatewayService}=await load('@deepseek-ai/dsh-api-gateway')
 const {TYPERT}=await import('../lib/typert.host.js')
 new Typert(ctx)
 if(TypertGatewayService.inject?.includes('remoteAccess')){const {RemoteAccessService}=await load('@deepseek-ai/dsh-api-remote-access');new RemoteAccessService(ctx)}
 await ctx.plugin(TypertGatewayService,{})
 ctx.typert.register({...TYPERT,invocations:TYPERT.invocations.filter(row=>row.namespace==='wechatDisplay')})
 const service=new WechatDisplayService(ctx),answer=await service.control({action:'read'},signal);assert.equal(answer.ok,true);assert.equal(JSON.parse(answer.valueJson).values.transcriptView,'verbose')
 const peer={id:'synthetic-display-peer',principal:{kind:'owner'},signal}
 await assert.rejects(ctx.typertGateway.invoke({namespace:'wechatDisplay',method:'control',args:{action:'read'},signal,peer}),e=>e.code==='gateway/arguments-invalid')
 const mini=createRequire(path.resolve('../wechat-miniprogram/package.json'))('./utils/conversation-display-client.js')
 const listeners=new Set(),store={state:{connected:true,streamDown:false,connectionEpoch:1,remoteHostInfo:{capabilities:[{id:'conversation.display',version:1}]}},
   activeAgentKey:()=> 'synthetic-native-display',onChange:listener=>{listeners.add(listener);return()=>listeners.delete(listener)}}
 let carrierCalls=0
 const client=mini.createClient(store,{async call(method,payload){
   carrierCalls++;assert.equal(method,'wechatDisplay/control');assert(payload.args?.request?.action,'args.request must match generated descriptor')
   return ctx.typertGateway.dispatchRpc(method,payload,signal,peer)
 }},{getStorageSync:()=>[],setStorageSync:()=>assert.fail('native settings cannot silently fall back to local storage')})
 ctx.on('settings/document-updated',ns=>{if(ns==='ui-chat')for(const listener of listeners)listener('conversation-display')})
 const stop=client.subscribe(()=>{});await client.refresh(true)
 assert.equal(client.view().values.transcriptView,'verbose');assert.equal(client.view().mode,'native')
 await client.patch({transcriptView:'standard'})
 assert.equal(ctx.settings.describe({redactSecrets:true}).find(x=>x.ns==='ui-chat').value.transcriptView,'standard')
 assert.equal(client.view().values.transcriptView,'standard')
 const beforeDesktop=await adapter.read(signal)
 await ctx.settings.mutate('ui-chat',[{op:'set',path:['collapseTiming'],value:'next-input'}],beforeDesktop.revision)
 await new Promise(resolve=>setTimeout(resolve,30));await client.refresh()
 assert.equal(client.view().values.collapseTiming,'next-input')
 if(!fields.includes('foldedReplies')){
   assert(!client.view().rows.some(row=>row.key==='foldedReplies'))
   await assert.rejects(client.patch({foldedReplies:'final'}),e=>e.code==='invalid_change')
 }
 stop()
 const patch=fs.readFileSync(path.join(dir,'cordis.patch.yml'),'utf8');assert(patch.includes('standard'));assert.equal(requests,0)
 const result={version:JSON.parse(fs.readFileSync(anchor,'utf8')).version,fields,read:true,phoneToNative:true,nativeToPhone:true,cas:true,unrelatedFieldsPreserved:true,nativeNotifications:notifications.length,persisted:true,miniActualClient:true,nativeGatewayDispatch:true,carrierCalls,networkRequests:requests,realDevice:false}
 fs.writeFileSync(path.join(work,'RESULT.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result))
}finally{await ctx?.fiber.dispose();globalThis.fetch=previousFetch}
