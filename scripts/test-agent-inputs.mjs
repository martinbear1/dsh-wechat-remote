import assert from 'node:assert/strict'
import {Context} from '@deepseek-ai/cordis'
import {AgentInputsService} from '../lib/agent-inputs.js'
const signal=new AbortController().signal,data=Buffer.from('file contents'),calls=[]
const gateway={async invoke(plan){calls.push(plan);if(plan.namespace==='session')return{items:[{sessionId:'s'}]};assert.equal(plan.namespace,'fileUploads');assert.equal(plan.args.agentId,'s');assert.deepEqual(Buffer.from(plan.args.request.data,'base64'),data);return{receiptId:'native-receipt',file:{attachmentId:'hash',name:'report.md',bytes:data.length}}}}
const service=new AgentInputsService(new Context(),{gateway,supported:true,load:async()=>data})
const parsed=r=>{assert(r.ok,JSON.stringify(r));return JSON.parse(r.valueJson)}
assert.equal(parsed(await service.capabilities({scope:'s'},signal)).maxBytes,10*1024*1024)
const file=parsed(await service.upload({scope:'s',name:'report.md',data:data.toString('base64')},signal))
assert.deepEqual(service.resolve('s',file.token),{type:'file',receiptId:'native-receipt'})
assert.throws(()=>service.resolve('other',file.token));assert.throws(()=>service.resolve('s',file.token+'x'))
const replacement=new AgentInputsService(new Context(),{gateway,supported:true})
assert.throws(()=>replacement.resolve('s',file.token))
const nativeCount=()=>calls.filter(c=>c.namespace==='fileUploads').length
const before=nativeCount()
for(const request of [{scope:'foreign',name:'a',data:'YQ=='},{scope:'s',name:'../a',data:'YQ=='},{scope:'s',name:'a',data:'@@'},{scope:'s',name:'a',data:''},{scope:'s',name:'a',descriptorJson:JSON.stringify({contentKind:'artifact',plainBytes:11*1024*1024})}])assert.equal((await service.upload(request,signal)).ok,false)
const abort=new AbortController();abort.abort();assert.equal((await service.upload({scope:'s',name:'a',data:'YQ=='},abort.signal)).ok,false)
assert.equal(nativeCount(),before)
parsed(await service.upload({scope:'s',name:'a',descriptorJson:JSON.stringify({contentKind:'artifact',plainBytes:data.length})},signal))
assert.equal((await new AgentInputsService(new Context(),{gateway,supported:false}).capabilities({scope:'s'},signal)).ok,false)
console.log('agent inputs: scoped receipts, MAC, restart invalidation, canonical bytes, size/name/cancellation and optional capability passed')
