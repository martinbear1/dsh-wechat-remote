import test from 'node:test'
import assert from 'node:assert/strict'
import { build } from 'esbuild'
import { createRequire } from 'node:module'
import { fileURLToPath, pathToFileURL } from 'node:url'
const root=fileURLToPath(new URL('../',import.meta.url))
const require=createRequire(import.meta.url)
const built=await build({stdin:{resolveDir:root,loader:'ts',contents:`
export * from './src/dsh-native-peer.ts'; export * from './src/dsh-tunnel-agent.ts';
export * from './src/dsh-compatibility-api.ts';`},bundle:true,write:false,platform:'node',format:'esm',target:'node22',
plugins:[{name:'native-ws',setup(b){b.onResolve({filter:/^ws$/},()=>({path:pathToFileURL(require.resolve('ws').replace(/index\.js$/,'wrapper.mjs')).href,external:true}))}}]})
const {acquireNativePeer,withNativePeer,withNativePeerStream,DshTunnelAgent,DshCompatibilityApi}=await import('data:text/javascript;base64,'+Buffer.from(built.outputFiles[0].text+'\n//# sourceURL=dsh-native-peer-source-test.mjs').toString('base64'))
function fixture(){
  const peers=[]
  return {peers,ctx:{get(name){if(name!=='connection')return;return{createPeer(options){
    const controller=new AbortController();const peer={...options,signal:controller.signal,disposed:0,dispose(){this.disposed++;controller.abort()}}
    peers.push(peer);return peer
  }}}}}
}
test('absence preserves old calls without fabricated Peer',async()=>{
  const signal=new AbortController().signal
  await withNativePeer({get(){}},signal,async lease=>{assert.equal(lease.peer,undefined);assert.equal(lease.signal,signal)})
})
test('native rejection is never retried without an identity',async()=>{
  let attempts=0
  await assert.rejects(withNativePeer({get(){return{createPeer(){attempts++;throw Error('native denied')}}}},undefined,async()=>assert.fail()),/native denied/)
  assert.equal(attempts,1)
})
test('ordinary unary receives passive owner and releases on success/error',async()=>{
  const f=fixture()
  assert.equal(await withNativePeer(f.ctx,undefined,async lease=>{assert.equal(lease.peer.interactions,'none');assert.deepEqual(lease.peer.principal,{kind:'owner'});return 42}),42)
  await assert.rejects(withNativePeer(f.ctx,undefined,async()=>{throw Error('business denied')}),/business denied/)
  assert.ok(f.peers.every(p=>p.disposed===1&&p.signal.aborted))
})
test('explicit borrowed identity is neither replaced nor disposed',async()=>{
  const f=fixture(),controller=new AbortController()
  const guest={principal:{kind:'guest'},interactions:'none',signal:controller.signal,dispose(){assert.fail('borrower cannot release owner')}}
  await withNativePeer(f.ctx,undefined,async lease=>assert.equal(lease.peer,guest),guest)
  assert.equal(f.peers.length,0)
})
test('signal cancellation disposes owned Peer once while call is outstanding',async()=>{
  const f=fixture(),abort=new AbortController(),ready=Promise.withResolvers()
  const task=withNativePeer(f.ctx,abort.signal,async lease=>{await ready.promise;lease.signal.throwIfAborted()})
  abort.abort(Error('client left'));await Promise.resolve();await Promise.resolve()
  assert.equal(f.peers[0].signal.aborted,true);ready.resolve();await assert.rejects(task,/client left/)
  assert.equal(f.peers[0].disposed,1)
})
test('stream lease survives opening and ends on explicit return before first next',async()=>{
  const f=fixture();const source=await withNativePeerStream(f.ctx,undefined,async()=>({async *[Symbol.asyncIterator](){yield 1}}))
  assert.equal(f.peers[0].disposed,0);await source[Symbol.asyncIterator]().return();assert.equal(f.peers[0].disposed,1)
})
test('stream result arriving after cancellation is not emitted',async()=>{
  const f=fixture(),abort=new AbortController(),ready=Promise.withResolvers()
  const source=await withNativePeerStream(f.ctx,abort.signal,async()=>({[Symbol.asyncIterator](){return{next:()=>ready.promise}}}))
  const next=source[Symbol.asyncIterator]().next();abort.abort(Error('revoked'));ready.resolve({done:false,value:'late'})
  await assert.rejects(next,/revoked/);assert.equal(f.peers[0].disposed,1)
})
test('native stream opening failure releases its Peer without another attempt',async()=>{
  const f=fixture();await assert.rejects(withNativePeerStream(f.ctx,undefined,async()=>{throw Error('no stream')}),/no stream/)
  assert.equal(f.peers.length,1);assert.equal(f.peers[0].disposed,1)
})
test('each authenticated tunnel owns only its factory result and closes it once',()=>{
  const instances=[]
  const factory={createConnection(){const c={disposed:0,dispose(){this.disposed++}};instances.push(c);return c}}
  const a=new DshTunnelAgent({send(){},compatibilityApi:factory}),b=new DshTunnelAgent({send(){},compatibilityApi:factory})
  assert.equal(instances.length,2);a.close();a.close();assert.equal(instances[0].disposed,1);assert.equal(instances[1].disposed,0)
  b.close();assert.equal(instances[1].disposed,1)
})
test('older transport without factory keeps its original ownership',()=>{
  const tunnel=new DshTunnelAgent({send(){},compatibilityApi:{dispose(){assert.fail('shared old adapter not tunnel owned')}}})
  tunnel.close()
})
test('dynamic private-input and notification providers remain gate-owned across connections',async()=>{
  const ctx={get(){},on(){return()=>{}}},api=new DshCompatibilityApi(ctx),a=api.createConnection(),b=api.createConnection()
  const request=path=>({method:'POST',path,body:Buffer.from(JSON.stringify({rpcId:'fixture',payload:{}})),signal:new AbortController().signal})
  api.privateInput={describe:async()=>({version:1})}
  assert.equal(JSON.parse(Buffer.from((await a.request(request('/api/wechatPrivateUpdates'))).body)).result.value.version,1)
  api.privateInput={describe:async()=>({version:2})}
  assert.equal(JSON.parse(Buffer.from((await b.request(request('/api/wechatPrivateUpdates'))).body)).result.value.version,2)
  api.taskNotificationRequest=async()=>({ok:true});assert.equal(b.handlesPath('/api/wechatTaskNotifications'),true)
  a.dispose();assert.equal(b.handlesPath('/api/wechatTaskNotifications'),true);api.dispose()
  await assert.rejects(b.request(request('/api/wechatTaskNotifications')),/closed/)
})
