import test from 'node:test'
import assert from 'node:assert/strict'
import { build } from 'esbuild'
const built = await build({stdin:{contents:`export {Context} from '@deepseek-ai/cordis';export {remoteMethods} from '@deepseek-ai/dsh-typert-protocol';export * from './src/conversation-display.ts';`,resolveDir:process.cwd(),loader:'ts'},bundle:true,write:false,format:'esm',platform:'node',target:'node22'})
const {Context,remoteMethods,NativeConversationDisplay,WechatDisplayService}=await import('data:text/javascript;base64,'+Buffer.from(built.outputFiles[0].contents).toString('base64'))
const signal=new AbortController().signal
const values={transcriptView:'detailed',collapseTiming:'completion',foldedReplies:'all',performanceUsage:'compact',linkOpening:'sidebar',future:{keep:true}}
const enums={transcriptView:['compact','standard','detailed','verbose','normal','expanded'],collapseTiming:['completion','next-input'],foldedReplies:['all','final']}
const makeSchema=()=>({type:'object',dict:Object.fromEntries(Object.entries(enums).map(([key,choices])=>[key,{type:'union',list:choices.map(value=>({type:'const',value})),meta:{}}]))})
function fixture(t,options={}){
 const ctx=new Context();t.after(()=>ctx.fiber.dispose());const state={value:structuredClone(values),revision:5,schema:makeSchema(),calls:[],reads:0}
 const native={writable:true,describe({redactSecrets}){assert.equal(redactSecrets,true);state.reads++;return[{ns:'ui-chat',schema:state.schema,value:structuredClone(state.value),applies:'live',revision:state.revision}]},async mutate(ns,ops,expected){assert.equal(ns,'ui-chat');if(expected!==state.revision)throw Object.assign(new Error('native conflict'),{code:'SETTINGS_CONFLICT'});state.calls.push(structuredClone(ops));for(const op of ops)state.value[op.path[0]]=op.value;state.revision++}}
 ctx.provide('profileContext',{name:options.profile||'desktop'});ctx.provide('settings',native);const adapter=new NativeConversationDisplay(ctx),service=new WechatDisplayService(ctx)
 return {ctx,state,native,adapter,service,call:async(action,input)=>{if(action==='patch'&&input&&input.expectedGeneration===undefined)input={...input,expectedGeneration:JSON.parse((await service.control({action:'read'},signal)).valueJson).generation};return service.control({action,...(input===undefined?{}:{inputJson:JSON.stringify(input)})},signal)}}
}
test('read exposes only three native preferences and does not write or export other fields',async t=>{
 const f=fixture(t),before=structuredClone(f.state.value),value=await f.adapter.read(signal)
 assert.deepEqual(value.values,{transcriptView:'detailed',collapseTiming:'completion',foldedReplies:'all'});assert.equal(value.revision,5);assert.equal(value.provider,'dsh-native');assert.equal(value.scope,'node');assert(value.supported&&value.writable)
 assert.deepEqual(f.state.value,before);assert.equal(f.state.calls.length,0);assert(!JSON.stringify(value).includes('performanceUsage'));assert.deepEqual(remoteMethods(f.service).map(x=>x.method),['control'])
})
test('native field mutation preserves all unrelated settings and desktop changes are read live',async t=>{
 const f=fixture(t),before=structuredClone(f.state.value);const next=await f.adapter.patch({expectedRevision:5,expectedGeneration:(await f.adapter.read(signal)).generation,changes:{transcriptView:'compact',foldedReplies:'final'}},signal)
 assert.equal(next.revision,6);assert.equal(next.values.transcriptView,'compact');assert.equal(f.state.calls.length,1)
 assert.deepEqual(f.state.value.future,before.future);assert.equal(f.state.value.linkOpening,before.linkOpening);assert.equal(f.state.value.performanceUsage,before.performanceUsage)
 f.state.value.collapseTiming='next-input';f.state.revision++
 assert.equal((await f.adapter.read(signal)).values.collapseTiming,'next-input');assert.equal(f.state.calls.length,1)
})
test('stale revision and queued concurrent writes fail closed',async t=>{
 const f=fixture(t),a=f.call('patch',{expectedRevision:5,changes:{transcriptView:'compact'}}),b=f.call('patch',{expectedRevision:5,changes:{foldedReplies:'final'}})
 assert.equal((await a).ok,true);assert.equal((await b).error.code,'settings_conflict');assert.equal(f.state.calls.length,1);assert.equal(f.state.value.foldedReplies,'all')
})
test('native CAS remains authoritative between describe and mutate',async t=>{
 const f=fixture(t);f.native.mutate=async()=>{throw Object.assign(new Error('conflict private path'),{code:'SETTINGS_CONFLICT'})}
 const result=await f.call('patch',{expectedRevision:5,changes:{transcriptView:'compact'}});assert.equal(result.error.code,'settings_conflict');assert(!result.error.message.includes('private path'))
})
test('old host missing folded replies only supports its real fields',async t=>{
 const f=fixture(t);delete f.state.schema.dict.foldedReplies;const value=await f.adapter.read(signal)
 assert(!Object.hasOwn(value.values,'foldedReplies'));assert(!Object.hasOwn(value.options,'foldedReplies'))
 assert.equal((await f.call('patch',{expectedRevision:5,changes:{foldedReplies:'final'}})).error.code,'invalid_request');assert.equal(f.state.calls.length,0)
})
test('legacy saved modes normalize without rewriting native values',async t=>{
 const f=fixture(t);for(const v of ['normal','expanded']){f.state.value.transcriptView=v;assert.equal((await f.adapter.read(signal)).values.transcriptView,'detailed');assert.equal(f.state.value.transcriptView,v)}assert.equal(f.state.calls.length,0)
})
test('unset preferences follow node UI default without persistence',async t=>{
 const f=fixture(t);delete f.state.value.transcriptView;assert.equal((await f.adapter.read(signal)).values.transcriptView,'standard');assert.equal(f.state.calls.length,0)
 const w=fixture(t,{profile:'web'});delete w.state.value.transcriptView;assert.equal((await w.adapter.read(signal)).values.transcriptView,'detailed')
})
test('unknown, hidden, secret and readonly fields are not offered for mutation',async t=>{
 const f=fixture(t);f.state.schema.dict.transcriptView.meta.hidden=true;f.state.schema.dict.collapseTiming.meta.role='secret';f.state.schema.dict.foldedReplies.meta.disabled=true
 const value=await f.adapter.read(signal);assert.deepEqual(value.values,{foldedReplies:'all'});assert.deepEqual(value.options,{});assert.equal(value.writable,false)
 assert.equal((await f.call('patch',{expectedRevision:5,changes:{foldedReplies:'final'}})).ok,false)
})
test('future native values are never mislabeled as known settings',async t=>{
 const f=fixture(t);f.state.value.transcriptView='future';const v=await f.adapter.read(signal);assert(!Object.hasOwn(v.values,'transcriptView'));assert(!Object.hasOwn(v.options,'transcriptView'))
})
test('readonly native profile has read-only values',async t=>{
 const f=fixture(t);f.native.writable=false;const value=await f.adapter.read(signal);assert(value.supported);assert(!value.writable);assert.deepEqual(value.options,{})
})
test('missing native adapter or namespace does not invent Host synchronization',async t=>{
 const ctx=new Context();t.after(()=>ctx.fiber.dispose());const a=new NativeConversationDisplay(ctx);assert.equal(a.available(),false);assert.equal((await a.read(signal)).supported,false)
 const f=fixture(t);f.native.describe=()=>[];assert.equal((await f.adapter.read(signal)).supported,false)
})
test('narrow request rejects scope, wrong revision, extra fields and overlong JSON before mutation',async t=>{
 const f=fixture(t)
 for(const input of [{expectedRevision:5,changes:{performanceUsage:'detailed'}},{expectedRevision:-1,changes:{transcriptView:'compact'}},{expectedRevision:'5',changes:{transcriptView:'compact'}},{expectedRevision:5,changes:{}},{expectedRevision:5,changes:{foldedReplies:'bad'}},{expectedRevision:5,changes:{transcriptView:'compact'},nodeId:'another'},{expectedRevision:5,changes:JSON.parse('{"__proto__":"compact"}')}])assert.equal((await f.call('patch',input)).error.code,'invalid_request')
 assert.equal((await f.call('read',{nodeId:'another'})).error.code,'invalid_request')
 assert.equal((await f.service.control({action:'patch',inputJson:' '.repeat(4097)},signal)).error.code,'invalid_request')
 assert.equal((await f.service.control({action:'patch',inputJson:'{'},signal)).error.code,'invalid_request');assert.equal(f.state.calls.length,0)
})
test('aborted and failed requests cannot claim saved values',async t=>{
 const f=fixture(t),abort=new AbortController();abort.abort();assert.equal((await f.service.control({action:'read'},abort.signal)).ok,false);assert.equal(f.state.reads,0)
 f.native.mutate=async()=>{throw Error('secret filesystem path')};const r=await f.call('patch',{expectedRevision:5,changes:{transcriptView:'compact'}});assert.equal(r.ok,false);assert(!r.error.message.includes('secret filesystem'));assert.equal(f.state.value.transcriptView,'detailed')
})

// Independent owner-replacement regressions: native revisions restart at zero.
function ownerReplacementFixture(){let owner,resolveDescribe;const make=(revision=0)=>({revision,value:{...values},writes:0,writable:true,describe(){return[{ns:'ui-chat',schema:makeSchema(),value:{...this.value,secret:'never-export'},applies:'live',revision:this.revision}]},async mutate(ns,ops,revision){assert.equal(ns,'ui-chat');assert.equal(revision,this.revision);this.writes++;for(const op of ops)this.value[op.path[0]]=op.value;this.revision++}});owner=make();const adapter=new NativeConversationDisplay({get:name=>name==='settings'?owner:name==='profileContext'?{name:'desktop'}:undefined});return{adapter,get owner(){return owner},replace(rev=0){owner=make(rev);return owner},block(){const old=owner,rows=old.describe();old.describe=()=>new Promise(r=>resolveDescribe=()=>r(rows));return()=>resolveDescribe()}};}
test('same native owner retains generation; replacement at identical revision rejects stale write',async()=>{
 const f=ownerReplacementFixture(),first=await f.adapter.read(signal);assert(first.generation);assert.equal((await f.adapter.read(signal)).generation,first.generation);assert(!JSON.stringify(first).includes('never-export'));
 const fresh=f.replace(),second=await f.adapter.read(signal);assert.equal(second.revision,first.revision);assert.notEqual(second.generation,first.generation);
 await assert.rejects(f.adapter.patch({expectedRevision:first.revision,expectedGeneration:first.generation,changes:{foldedReplies:'final'}},signal),e=>e.code==='settings_conflict');assert.equal(fresh.writes,0);
 await f.adapter.patch({expectedRevision:second.revision,expectedGeneration:second.generation,changes:{foldedReplies:'final'}},signal);assert.equal(fresh.writes,1);
});
test('native replacement while describe is pending rejects old descriptor',async()=>{
 const f=ownerReplacementFixture(),release=f.block(),pending=f.adapter.read(signal);await new Promise(resolve=>setImmediate(resolve));f.replace();release();await assert.rejects(pending,e=>e.code==='native_unavailable');
});
