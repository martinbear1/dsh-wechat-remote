import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { transform } from 'esbuild'
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
