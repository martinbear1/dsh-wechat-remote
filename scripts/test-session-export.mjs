import assert from 'node:assert/strict'
import test from 'node:test'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'
import path from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import { AgentResourcesService } from '../lib/agent-resources.js'
import { exportSessionArchive } from '../lib/dsh-session-export.js'

const signal = () => new AbortController().signal
function host(fetch) {
  const ctx = new Context()
  ctx.provide('connection')
  ctx.set('connection', {createSharedFetchHandler(channel) {assert.equal(channel,'/api');return {fetch}}})
  return ctx
}
function value(result) {assert.equal(result.ok,true,JSON.stringify(result));return JSON.parse(result.valueJson)}

test('archive uses only the registered native route, encoded identity and shared delivery',async()=>{
  const data=Buffer.from('PK archive fixture'), seen=[]
  const ctx=host(async request=>{
    const url=new URL(request.url);seen.push(request)
    assert.equal(url.pathname,'/api/session.export');assert.equal(request.method,'GET')
    assert.equal(url.searchParams.get('sessionId'),'会话 &/?');assert.equal(url.searchParams.get('includeDescendants'),'true')
    return new Response(data,{headers:{'content-type':'application/zip','content-disposition':'attachment; filename="native.zip"'}})
  })
  let uploads=0
  const api=new AgentResourcesService(ctx,{store:async bytes=>{uploads++;assert.deepEqual(Buffer.from(bytes),data);return {contentKind:'artifact'}}})
  assert.equal(value(await api.capabilities({scope:'会话 &/?',purpose:'sessionArchive'},signal())).sessionArchive,true)
  for(const delivery of ['chunks','object']) {
    const prepared=value(await api.prepareArchive({scope:'会话 &/?',delivery},signal()))
    assert.equal(prepared.name,'native.zip');assert.equal(prepared.bytes,data.length)
    if(delivery==='chunks') {
      const chunk=value(await api.chunk({scope:'会话 &/?',transferId:prepared.transferId,offset:0},signal()))
      assert.deepEqual(Buffer.from(chunk.data,'base64'),data)
      assert.equal((await api.chunk({scope:'other',transferId:prepared.transferId,offset:0},signal())).ok,false)
      await api.release({scope:'会话 &/?',transferId:prepared.transferId})
    } else assert.equal(prepared.delivery,'object')
  }
  assert.equal(uploads,1);assert.equal(seen.length,2)
})

test('unsupported, wrong response, oversize, abort and broken streams never yield partial archives',async()=>{
  assert.equal(value(await new AgentResourcesService(new Context()).capabilities({scope:'s',purpose:'sessionArchive'},signal())).sessionArchive,false)
  await assert.rejects(exportSessionArchive(new Context(),'s',signal(),100),/尚不支持/)
  let cancelled=0
  const stream=chunk=>new ReadableStream({pull(c){c.enqueue(chunk)},cancel(){cancelled++}})
  await assert.rejects(exportSessionArchive(host(async()=>new Response(stream(new Uint8Array(1)),{status:404})),'s',signal(),100),/不存在/)
  await assert.rejects(exportSessionArchive(host(async()=>new Response(stream(new Uint8Array(11)),{headers:{'content-type':'application/zip'}})),'s',signal(),10),/超过/)
  assert.equal(cancelled,2)
  const controller=new AbortController()
  let started
  const ready=new Promise(r=>{started=r})
  const pending=exportSessionArchive(host(async()=>new Response(new ReadableStream({start(){started()},cancel(){cancelled++}}),{headers:{'content-type':'application/zip'}})),'s',controller.signal,100)
  await ready;controller.abort();await assert.rejects(pending,/abort/i)
  assert.equal(cancelled,3)
  await assert.rejects(exportSessionArchive(host(async()=>new Response(new ReadableStream({start(c){c.error(Error('native read failure'))}}),{headers:{'content-type':'application/zip'}})),'s',signal(),100),/native read failure/)
})

test('archives and files share concurrency limits; cancellation restores capacity',async()=>{
  let started=0
  const ctx=host(async request=>{
    started++
    return new Response(new ReadableStream({start(c){request.signal.addEventListener('abort',()=>c.error(Error('aborted')),{once:true})}}),{headers:{'content-type':'application/zip'}})
  })
  const api=new AgentResourcesService(ctx), controllers=[new AbortController(),new AbortController()]
  const pending=controllers.map(c=>api.prepareArchive({scope:'s',delivery:'chunks'},c.signal))
  assert.equal((await api.prepareArchive({scope:'s',delivery:'chunks'},signal())).ok,false)
  assert.equal((await api.prepare({scope:'s',id:'unused',delivery:'chunks'},signal())).error.message,'有文件正在准备，请稍后重试')
  assert.equal(started,2)
  controllers.forEach(c=>c.abort());await Promise.all(pending)
  const third=new AbortController();const resumed=api.prepareArchive({scope:'s',delivery:'chunks'},third.signal)
  assert.equal(started,3);third.abort();await resumed
})

test('actual installed DSH Connection + native exporter preserve logs, descendants and attachments', {skip:!process.env.DSH_NATIVE_ROOT}, async()=>{
  const require=createRequire(path.join(process.env.DSH_NATIVE_ROOT,'package.json'))
  const load=name=>import(pathToFileURL(require.resolve(name)).href)
  const {Context:NativeContext}=await load('@deepseek-ai/cordis')
  const {HostConnectionService}=await load('@deepseek-ai/dsh-client-connection')
  const native=await load('@deepseek-ai/dsh-session-log-export')
  const {unzipSync}=await load('fflate')
  const {SessionPersistenceNotFoundError}=await load('@deepseek-ai/dsh-session-persistence')
  const ctx=new NativeContext(), opened=[], closed=[], flushed=[]
  const image={attachmentId:'image-1',mediaType:'image/png'}, attachment={attachmentId:'sha256:abcdef1234',name:'测试.txt'}
  const event={seq:1,time:1,type:'message/add',data:{content:[{type:'image',attachment:image},{type:'file',attachment}]}}
  const records=new Map([['root & 中文',[event]],['child',[]]])
  for(const [name,service] of Object.entries({
    commands:{register(){return ()=>{}}},
    sessions:{get:id=>records.has(id)?{id}:undefined,flush:async s=>{flushed.push(s.id)}},
    sessionQuery:{traceSession:async()=>({descendants:[{session:{header:{id:'child'}},descendants:[]}]})},
    sessionPersistence:{async open(id,mode){assert.equal(mode,'read');if(!records.has(id))throw new SessionPersistenceNotFoundError(id);opened.push(id);return {header:{id,version:2,createdAt:1,isSeeded:false},read:async()=>({events:records.get(id)}),close:async()=>{closed.push(id)}}}},
    attachments:{readImage:async()=>({data:Buffer.from('image-bytes')}),async *readFileStream(){yield Buffer.from('file-bytes')}},
  })) {ctx.provide(name);ctx.set(name,service)}
  new HostConnectionService(ctx,[],{})
  native.apply(ctx)
  const archive=await exportSessionArchive(ctx,'root & 中文',signal(),20*1024*1024)
  const files=unzipSync(archive.data)
  assert.equal(Buffer.from(files[native.SESSION_LOG_FILENAME]).toString(),native.serializeSessionLog({id:'root & 中文',version:2,createdAt:1,isSeeded:false},[event]))
  assert(files['subagents/child/'+native.SESSION_LOG_FILENAME])
  assert.equal(Buffer.from(files['media/image-1.png']).toString(),'image-bytes')
  assert.equal(Buffer.from(files['files/ab/abcdef1234/测试.txt']).toString(),'file-bytes')
  assert.deepEqual(opened,['root & 中文','child']);assert.deepEqual(closed,opened);assert.deepEqual(flushed,opened)
  await assert.rejects(exportSessionArchive(ctx,'missing',signal(),100),/不存在/)
})
