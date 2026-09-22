import assert from 'node:assert/strict'
import { test } from 'node:test'
import { gzipSync } from 'node:zlib'
import { createHash } from 'node:crypto'
import { downloadRelease, downloadNpmRelease, pluginFromInstaller, boundedFetch, DownloadUnavailableError } from '../lib/update-download.js'
import { validateCatalog } from '../lib/update-policy.js'

function pack(entries) {
  const chunks = []
  for (const [name, content, type = '0'] of entries) {
    const data = Buffer.from(content), h = Buffer.alloc(512)
    h.write(name); h.write(data.length.toString(8).padStart(11, '0') + '\0', 124); h.write(type, 156)
    h.fill(32, 148, 156); h.write([...h].reduce((a, b) => a + b, 0).toString(8).padStart(6, '0') + '\0 ', 148)
    chunks.push(h, data, Buffer.alloc((512 - data.length % 512) % 512))
  }
  return gzipSync(Buffer.concat([...chunks, Buffer.alloc(1024)]))
}
const pluginFiles = [['package/package.json', JSON.stringify({ name:'@harness-remote/dsh-wechat-remote', version:'1.7.9' })], ['package/lib/index.js',''], ['package/lib/client.js','']]
const plugin = pack(pluginFiles)
const npmFiles = [['package/package.json',JSON.stringify({ name:'dsh-wechat-remote',version:'1.7.10' })], ['package/assets/plugin.tgz',plugin]]
const installer = pack(npmFiles)
const digest = data => ({ bytes:data.length, sha256:createHash('sha256').update(data).digest('hex') })
const release = { version:'1.7.9', channel:'stable', dsh:['0.1.5-rc.1'], platforms:['windows'], architectures:['x64'],
  asset:{ url:'https://github.com/martinbear1/dsh-wechat-remote/releases/download/v1.7.9/plugin.tgz', ...digest(plugin) },
  npmInstaller:{ version:'1.7.10',url:'https://registry.npmjs.org/dsh-wechat-remote/-/dsh-wechat-remote-1.7.10.tgz', ...digest(installer) } }
const catalog = r => ({ schemaVersion:1,revision:'test',issuedAt:1,expiresAt:1000,releases:[r],blocked:[],retiredDsh:[] })

test('GitHub succeeds without requesting npm; installer hotfix version may differ', async () => {
  const calls=[]
  assert.deepEqual(await downloadRelease(release, async url => { calls.push(url); return new Response(plugin) }),plugin)
  assert.deepEqual(calls,[release.asset.url])
  assert.deepEqual(pluginFromInstaller(installer,release),plugin)
})
test('transport and HTTP failures switch once and return identical audited bytes', async () => {
  for (const fail of [() => { throw new TypeError('fetch failed') }, () => new Response(null,{status:503}), () => new Response(null,{status:404}),
    () => new Response(new ReadableStream({ start(c) { c.error(Error('connection reset')) } }))]) {
    const calls=[]
    const body = await downloadRelease(release, async url => { calls.push(url); return calls.length===1 ? fail() : new Response(installer) })
    assert.deepEqual(body,plugin); assert.deepEqual(calls,[release.asset.url,release.npmInstaller.url])
  }
})
test('both sources unavailable produce one actionable availability error, no retry loop', async () => {
  let calls=0
  await assert.rejects(downloadRelease(release,async () => { calls++; throw Error('offline') }), DownloadUnavailableError)
  assert.equal(calls,2)
})
test('old catalog without fallback keeps single-source behavior', async () => {
  let calls=0
  await assert.rejects(downloadRelease({...release,npmInstaller:undefined},async () => { calls++; throw Error('offline') }), DownloadUnavailableError)
  assert.equal(calls,1); validateCatalog(catalog({...release,npmInstaller:undefined}))
})
test('npm is not permitted through the generic catalog fetch helper', async () => {
  let called=false
  await assert.rejects(boundedFetch(release.npmInstaller.url,100,async () => { called=true }), /不受信任/)
  assert.equal(called,false)
})
test('source policy rejects mutable tags, arbitrary packages and invalid metadata before fetch', async () => {
  for (const source of [null, {...release.npmInstaller,version:'latest'}, {...release.npmInstaller,sha256:'x'}, {...release.npmInstaller,bytes:33*1024*1024},
    {...release.npmInstaller,url:release.npmInstaller.url+'?x=1'}, {...release.npmInstaller,url:release.npmInstaller.url.replace('dsh-wechat-remote/-','other/-')}]) {
    const r={...release,npmInstaller:source}
    assert.throws(()=>validateCatalog(catalog(r)))
    await assert.rejects(downloadRelease(r,async()=>assert.fail('must reject before network')))
  }
})
test('unsafe redirect, oversized response, corruption and wrong plugin version never fall back', async () => {
  for (const response of [() => new Response(null,{status:302,headers:{location:'http://127.0.0.1/secret'}}),
    () => new Response(Buffer.alloc(plugin.length+1)), () => new Response(Buffer.alloc(plugin.length)),
    () => new Response(plugin.subarray(0,plugin.length-1))]) {
    let calls=0
    await assert.rejects(downloadRelease(release,async()=> { calls++; return response() }))
    assert.equal(calls,1)
  }
  await assert.rejects(downloadRelease({...release,version:'1.7.8'},async()=>assert.fail('wrong URL version')))
})
test('npm redirects cannot leave its official registry or carry credentials', async () => {
  for (const location of ['https://github.com/other','https://registry.npmjs.org.evil.test/a','https://u:p@registry.npmjs.org/a']) {
    let calls=0
    await assert.rejects(downloadNpmRelease(release,async()=> { calls++; return new Response(null,{status:302,headers:{location}}) }), /不受信任/)
    assert.equal(calls,1)
  }
})
test('outer and inner integrity, manifest, paths, duplicate payload, links and directory impostors rejected', () => {
  assert.throws(()=>pluginFromInstaller(Buffer.alloc(installer.length),release))
  for (const files of [[...npmFiles,['package/assets/PLUGIN.tgz',plugin]], [...npmFiles,['package/../x','']],
    [npmFiles[0],['package/assets/plugin.tgz',plugin,'2']], [npmFiles[0],['package/assets/plugin.tgz','','5']],
    [npmFiles[0],['package/assets/plugin.tgz',Buffer.alloc(plugin.length)]],
    [['package/package.json',JSON.stringify({name:'other',version:'1.7.10'})],npmFiles[1]]]) {
    const body=pack(files)
    assert.throws(()=>pluginFromInstaller(body,{...release,npmInstaller:{...release.npmInstaller,...digest(body)}}))
  }
  const huge = gzipSync(Buffer.alloc(64*1024*1024+512))
  assert.throws(()=>pluginFromInstaller(huge,{...release,npmInstaller:{...release.npmInstaller,...digest(huge)}}))
})
test('cancellation does not initiate backup and already-aborted request does no work', async () => {
  const controller=new AbortController(); let calls=0
  await assert.rejects(downloadRelease(release,async()=> { calls++; controller.abort(); throw controller.signal.reason },{signal:controller.signal}),{name:'AbortError'})
  assert.equal(calls,1)
  await assert.rejects(downloadRelease(release,async()=> { calls++; },{signal:controller.signal}),{name:'AbortError'})
  assert.equal(calls,1)
})
test('unresponsive primary switches on response deadline; body download gets its separate budget', async () => {
  let calls=0
  const result=await downloadRelease(release, async (url,{signal}) => {
    if (++calls===1) return new Promise((resolve,reject)=>signal.addEventListener('abort',()=>reject(signal.reason),{once:true}))
    return new Response(new ReadableStream({ start(c) { setTimeout(()=>{c.enqueue(installer);c.close()},40) } }))
  },{responseTimeoutMs:15,timeoutMs:500})
  assert.deepEqual(result,plugin); assert.equal(calls,2)
})
test('redirects share a wall-clock deadline instead of renewing it', async () => {
  let calls=0; const started=Date.now()
  await assert.rejects(downloadRelease(release,async(url,{signal})=> {
    calls++
    return new Promise((resolve,reject)=> {
      const timer=setTimeout(()=>resolve(new Response(null,{status:302,headers:{location:url}})),25)
      signal.addEventListener('abort',()=>{clearTimeout(timer);reject(signal.reason)},{once:true})
    })
  },{responseTimeoutMs:200,timeoutMs:60}),DownloadUnavailableError)
  assert(calls<=3); assert(Date.now()-started<400)
})
test('headers followed by a stalled body switch early; active slow body keeps its budget', async () => {
  let calls=0
  const result=await downloadRelease(release,async(url,{signal})=> {
    if(++calls===1)return new Response(new ReadableStream({start(c){
      signal.addEventListener('abort',()=>c.error(signal.reason),{once:true})
    }}))
    return new Response(installer)
  },{idleTimeoutMs:20,timeoutMs:500})
  assert.deepEqual(result,plugin);assert.equal(calls,2)
  calls=0
  const active=await downloadRelease(release,async(url,{signal})=> {
    calls++
    return new Response(new ReadableStream({start(c){
      let offset=0
      const timer=setInterval(()=>{
        const end=Math.min(plugin.length,offset+30);c.enqueue(plugin.subarray(offset,end));offset=end
        if(offset===plugin.length){clearInterval(timer);c.close()}
      },10)
      signal.addEventListener('abort',()=>{clearInterval(timer);c.error(signal.reason)},{once:true})
    }}))
  },{idleTimeoutMs:30,responseTimeoutMs:5,timeoutMs:500})
  assert.deepEqual(active,plugin);assert.equal(calls,1)
})
