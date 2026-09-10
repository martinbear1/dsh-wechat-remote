import assert from 'node:assert/strict'
import { Context } from '@deepseek-ai/cordis'
import { AgentResourcesService, resourcePresentation } from '../lib/agent-resources.js'
const data=Buffer.alloc(400000,42), signal=new AbortController().signal
let changed=false, uploads=0,reportedBytes=data.length,redirect=false
const service=new AgentResourcesService(new Context(), {async invoke(method,args) {
  assert.equal(args.workspaceFileScopeId,'s')
  if (method==='list') {
    if (args.path.includes('..') || args.path.startsWith('/outside')) throw Error('outside workspace')
    return {path:'',entries:[{name:'测试.xlsx',type:'file',size:data.length},{name:'folder',type:'directory'}]}
  }
  if(method==='stat') return {version:'v1',bytes:reportedBytes,absolutePath:redirect?'/outside/secret':'/work/测试.xlsx'}
  if(method==='readBytes') return {absolutePath:'/work/测试.xlsx',version:changed?'v2':'v1',offset:args.range.offset,data:data.subarray(args.range.offset,args.range.offset+args.range.length).toString('base64')}
}, async store(bytes) {uploads++;assert.deepEqual(Buffer.from(bytes),data);return {contentKind:'artifact'}}})
for(const method of ['capabilities','list','resolve','prepare','chunk','release']) {
  const original=service[method].bind(service)
  service[method]=async(...args)=>{const r=await original(...args);return {...r,value:r.valueJson?JSON.parse(r.valueJson):undefined}}
}
assert.equal((await service.capabilities({scope:'s'},signal)).value.schema,'agent.resources.v1')
const file=(await service.resolve({scope:'s',reference:'测试.xlsx'},signal)).value
assert(file.id)
assert.equal((await service.resolve({scope:'s',reference:'../secret'},signal)).ok,false)
assert.equal((await service.prepare({scope:'another',id:file.id,delivery:'chunks'},signal)).ok,false)
assert.equal((await service.prepare({scope:'s',id:file.id+'x',delivery:'chunks'},signal)).ok,false)
assert.equal((await service.resolve({scope:'s',reference:'dsh-resource://file/session/other/file.xlsx'},signal)).ok,false)
const prepared=await service.prepare({scope:'s',id:file.id,delivery:'chunks'},signal)
assert(prepared.ok,JSON.stringify(prepared))
const chunks=[]
for(let offset=0;offset<data.length;offset+=prepared.value.chunkBytes) {
 const r=await service.chunk({scope:'s',transferId:prepared.value.transferId,offset},signal)
 assert(r.ok);chunks.push(Buffer.from(r.value.data,'base64'))
}
assert.deepEqual(Buffer.concat(chunks),data)
assert.equal((await service.chunk({scope:'other',transferId:prepared.value.transferId,offset:0},signal)).ok,false)
assert.equal((await service.chunk({scope:'s',transferId:prepared.value.transferId,offset:1},signal)).ok,false)
await service.release({scope:'s',transferId:prepared.value.transferId})
assert.equal((await service.chunk({scope:'s',transferId:prepared.value.transferId,offset:0},signal)).ok,false)
assert.equal((await service.prepare({scope:'s',id:file.id,delivery:'object'},signal)).value.delivery,'object')
assert.equal(uploads,1)
changed=true
assert.equal((await service.prepare({scope:'s',id:file.id,delivery:'object'},signal)).ok,false)
assert.equal(uploads,1,'changed file cannot be uploaded')
changed=false;reportedBytes=21*1024*1024
assert.equal((await service.prepare({scope:'s',id:file.id,delivery:'chunks'},signal)).ok,false,'oversize rejected before allocation')
reportedBytes=data.length;redirect=true
assert.equal((await service.prepare({scope:'s',id:file.id,delivery:'object'},signal)).ok,false,'canonical parent moved outside workspace')
redirect=false
const aborted=new AbortController();aborted.abort()
assert.equal((await service.prepare({scope:'s',id:file.id,delivery:'chunks'},aborted.signal)).ok,false)
const paged=new AgentResourcesService(new Context(),{async invoke(){return {path:'',entries:Array.from({length:250},(_,i)=>({name:'file-'+String(i).padStart(3,'0')+'.txt',type:'file',size:1}))}}})
const first=JSON.parse((await paged.list({scope:'s'},signal)).valueJson)
const second=JSON.parse((await paged.list({scope:'s',directoryId:first.directoryId,cursor:first.nextCursor},signal)).valueJson)
assert.equal(first.entries.length,100);assert.equal(second.entries.length,100);assert.notEqual(first.entries[0].name,second.entries[0].name)
assert.equal(resourcePresentation({type:'deliverables/presented',data:{turn:2,files:[{path:'a.pdf'}]}}).files[0].reference,'a.pdf')
console.log('agent resources: capabilities, references, scope/MAC, immutable chunks, object handoff, changed-file rejection passed')
