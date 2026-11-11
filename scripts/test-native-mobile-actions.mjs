/** Cross-version opt-in integration. Uses the actual Host's registered codecs and
 * subagent control methods; the session directory, inbox and archive are fixtures. */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import {createRequire} from 'node:module'
import {pathToFileURL} from 'node:url'

const root = path.resolve(process.env.HARNESS_DSH_ROOT)
const require = createRequire(path.join(root,'package.json'))
const subagent = require.resolve('@deepseek-ai/dsh-subagent')
const {SubagentRuntime} = await import(pathToFileURL(subagent))
const {TYPERT} = await import(pathToFileURL(path.join(path.dirname(subagent),'typert.host.js')))
const rows = new Map(TYPERT.invocations.map(row=>[row.namespace+'/'+row.method,row]))
const modern = rows.has('subagents/interruptByUser')
const hostVersion = require('@deepseek-ai/dsh/package.json').version
const {invokeHostRemote} = await import(process.env.HARNESS_PLUGIN_LIB ?
  pathToFileURL(path.join(process.env.HARNESS_PLUGIN_LIB,'dsh-host-contract.js')).href : '../lib/dsh-host-contract.js')
const baseline = process.env.HARNESS_BASELINE === '1'
const signal = new AbortController().signal
const peer = {signal,interactions:'none',dispose(){throw Error('borrowed peer was disposed')}}
const context = {get:key=>services[key]}
const services = {
  typert:{local:{get:key=>rows.get(key),hasSeen:key=>rows.has(key)}},
  profileContext:{name:'web',home:root,dir:root,installAnchor:require.resolve('@deepseek-ai/dsh/package.json')},
  sessions:{get:id=> id==='child' ? {header:{id,origin:'subagent'}} : undefined},
  sessionPersistence:{stat:async id=>({header:{id,origin:id==='cold'?'subagent':'user'}})},
  worktrees:modern?{cleanupOf(){throw Error('no cleanup may be started')}}:{},
}
let mode='continuable', owned=false, deny=false, refuse=false, migrating=false, leaseMismatch=false, releases=0, last
services.sessionQuery={observeSession:async id=>({header:{id:leaseMismatch?'another':id},cursor:4,projections:{asOfSeq:4,values:{worktree:[{owned,worktree:{path:'/example'}}]}},[Symbol.dispose](){releases++}})}
const counters={normal:0,inbox:0,interrupt:0,archive:0}
const parent={id:'parent'}
const {default:AttachmentStore}=await import(pathToFileURL(require.resolve('@deepseek-ai/dsh-attachment')))
const attachments=Object.assign(Object.create(AttachmentStore.prototype),{
  saveImages: async inputs=>inputs.map((img,i)=>({attachmentId:'att-'+i,mediaType:img.mediaType,bytes:2,width:1,height:1})),
})
const nativeScope={ctx:{get:k=>k==='agents'?{get:()=>parent}:k==='attachments'?attachments:undefined},
  interrupt:(id,source)=>{counters.interrupt++;last={id,source}},
  requireManager:()=>({deliverPrompt:(id,content,options)=>accept(id,content,options)}),
}
for (const symbol of Object.getOwnPropertySymbols(SubagentRuntime.prototype)) {
  if (String(symbol).toLowerCase().includes('deliver')) nativeScope[symbol]=(_parent,id,content,source,signal,delivery)=>accept(id,content,{source,signal,delivery})
}
function accept(id,content,{source,delivery}) {
  if (refuse) throw Error('admission refused')
  last={id,content,source,delivery}; counters.inbox++;return 'receipt-123'
}
const entries=()=>['child','cold'].map(id=>({id,mode}))
const gateway={async invoke(r){
  assert.equal(r.peer,peer)
  r.signal.throwIfAborted()
  const method=r.namespace+'/'+r.method, args=r.args
  if (method==='session/list') return {items:[{sessionId:'parent',agentAvailable:true},...entries().map(({id})=>({sessionId:id,origin:'subagent',parentSessionId:'parent'}))]}
  if (method==='session/projections') {
    if(deny) throw Error('projection denied')
    if(migrating) return {kind:'migration-required',values:{worktree:[]}}
    return {kind:'sequenced',asOfSeq:4,values:{subagentCatalog:entries(),worktree:owned===null?null:[{owned,worktree:{path:'/example'}}]}}
  }
  if (method==='subagents/list') return {entries:entries().map(entry=>({...entry,kind:'child'}))}
  if (method==='session/prompt') {
    counters.normal++
    if (['cold','child'].includes(args.request.sessionId)) throw Error('use subagent delivery for this child session')
    return {accepted:true}
  }
  if (method==='workspace/archiveSession') { counters.archive++;return {archivedSessionIds:[args.request.sessionId]} }
  const desc=rows.get(method)
  if (!desc) throw Error('missing native method '+method)
  const argv=desc.parameters.filter(p=>p.wire).map(p=>{
    const schema = p.codec.create?.() ?? p.codec.schema
    return schema.parse(args[p.wire])
  })
  return SubagentRuntime.prototype[r.method].call(nativeScope,...argv,r.signal)
}}
const invoke=(namespace,method,args)=>invokeHostRemote(context,gateway,{namespace,method,args,signal,peer})
const stop=(id='parent')=>invoke('subagents','interruptByParent',{childSessionId:'child',parentSessionId:id,mode:'continuable'})
const prompt=(id,parts=[{type:'text',text:'hello'}],delivery='queue')=>invoke('session','prompt',{request:{
  requestId:'phone-fixture',sessionId:id,mode:delivery,clientTimeZone:'UTC',content:parts,
}})
const archive=()=>invoke('workspace','archiveSession',{request:{sessionId:'parent'}})
assert.deepEqual(await prompt('ordinary'),{accepted:true})
if(baseline&&modern) await assert.rejects(stop,/missing native method/)
else {assert.deepEqual(await stop(),{accepted:true}); assert.equal(last.id,'child');assert.equal(last.source.kind,'user')}
if(baseline) await assert.rejects(()=>prompt('child'),/subagent delivery/)
else {
  for(const id of ['child','cold']){
    assert.deepEqual(await prompt(id),{accepted:true});assert.equal(last.id,id);assert.equal(last.source.rpcId,'phone-fixture')
    assert.equal(last.delivery,'queue')
  }
  await prompt('child',[{type:'text',text:'before'},{type:'image',mediaType:'image/png',data:'aGk='},{type:'text',text:'after'}],'steer')
  assert.equal(last.delivery,'steer')
  assert.equal(last.content[1].attachment.attachmentId,'att-0')
  assert.equal(last.content[2].text,'after')
  await assert.rejects(()=>prompt('child',[{type:'file',receiptId:'fake'}]))
  mode='one-shot';await assert.rejects(()=>prompt('child'));mode='continuable'
  refuse=true;await assert.rejects(()=>prompt('child'));refuse=false
  if(modern){await assert.rejects(()=>stop('unrelated'));deny=true;await assert.rejects(stop);deny=false}
  assert.equal(counters.normal,1);assert.equal(counters.inbox,3);assert.equal(counters.interrupt,1)
}
await archive()
owned=true
if(modern&&!baseline){
  await assert.rejects(archive,{code:'adapter/worktree-archive-confirmation-required'})
  migrating=true;await assert.rejects(archive,{code:'adapter/worktree-archive-confirmation-required'})
  leaseMismatch=true;await assert.rejects(archive);assert.equal(releases,2);migrating=false
  owned=null;await assert.rejects(archive);deny=true;await assert.rejects(archive)
  assert.equal(counters.archive,1)
} else {await archive();assert.equal(counters.archive,2)}
console.log(JSON.stringify({hostVersion,baseline,modern,counters}))
