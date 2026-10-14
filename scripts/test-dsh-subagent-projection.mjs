import assert from 'node:assert/strict'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

// Compile the actual sources in memory: this test must not overwrite lib while
// compatibility workstreams share the checkout, or borrow stale built files.
const root = fileURLToPath(new URL('../', import.meta.url))
const result = await build({
  stdin: { contents: "export { resolveSubagentCatalogProjection } from './src/dsh-subagent-projection.ts'; export { projectedSubagentCatalog, invokeHostRemote } from './src/dsh-host-contract.ts'", resolveDir: root, loader: 'ts' },
  bundle: true, write: false, format: 'esm', platform: 'node', target: 'node22',
})
const { resolveSubagentCatalogProjection: resolve, projectedSubagentCatalog: catalog, invokeHostRemote } =
  await import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`)

const parent = 'session-parent'
const hint = { kind: 'migration-required', values: {} }
const child = { id: 'session-child', mode: 'continuable', label: 'child' }
function fixture(patch = {}) {
  const counts = { read: 0, disposed: 0 }
  const observation = { header: { id: parent }, cursor: 7,
    projections: { asOfSeq: 7, values: { subagentCatalog: [child] } },
    [Symbol.dispose]() { counts.disposed++ }, ...patch }
  const ctx = { get(name) {
    assert.equal(name, 'sessionQuery', 'never acquire Agent, writer, persistence or activation')
    return { async observeSession(id, options) {
      counts.read++
      assert.equal(id, parent)
      assert.equal(options.projectionMode, 'all')
      return observation
    } }
  } }
  return { counts, observation, ctx }
}

for (const [name, projection] of [
  ['legacy untagged', { asOfSeq: 3, values: { subagentCatalog: [child] } }],
  ['current sequenced', { kind: 'sequenced', asOfSeq: 3, values: { subagentCatalog: [child] } }],
  ['missing', null],
]) test(`${name} projection remains the original path, without extra reads`, async () => {
  const ctx = { get() { assert.fail('not a migration-required response') } }
  assert.equal(await resolve(ctx, parent, projection), projection)
})

test('migration-required with no hints reads exact native observation and releases it', async () => {
  const f = fixture()
  const actual = await resolve(f.ctx, parent, hint)
  assert.deepEqual(actual, { kind: 'sequenced', asOfSeq: 7, values: { subagentCatalog: [child] } })
  assert.deepEqual(f.counts, { read: 1, disposed: 1 })
  assert.notEqual(actual.values.subagentCatalog, f.observation.projections.values.subagentCatalog)
  assert.notEqual(actual.values.subagentCatalog[0], child)
})

function wiredFixture(t, {deny, wrongParent, projection = hint} = {}) {
  const dir=mkdtempSync(path.join(os.tmpdir(),'dsh-subagent-wiring-'))
  const anchor=path.join(dir,'package.json')
  writeFileSync(anchor,JSON.stringify({name:'@deepseek-ai/dsh',version:'0.2.1-alpha.3'}))
  t.after(()=>rmSync(dir,{recursive:true,force:true}))
  const f=fixture(), admitted=[],peers=[]
  const ctx={get(name){
    if(name==='profileContext')return{name:'test',home:dir,dir,installAnchor:anchor}
    if(name==='typert')return{local:{get(){},hasSeen(){return false}}}
    if(name==='connection')return{createPeer(options){const ac=new AbortController();const peer={...options,signal:ac.signal,dispose(){ac.abort()}};peers.push(peer);return peer}}
    if(name==='sessionQuery'){assert.deepEqual(admitted.sort(),['list','projections']);return f.ctx.get(name)}
  }}
  const gateway={async invoke(request){
    assert.equal(request.peer,peers[0]);assert.equal(request.peer.signal.aborted,false)
    if(request.method===deny)throw Error('native denied')
    admitted.push(request.method)
    if(request.method==='projections')return projection
    if(request.method==='list')return{items:[{sessionId:parent,agentAvailable:true},
      {sessionId:child.id,origin:'subagent',parentSessionId:wrongParent?'other':parent}]}
    assert.fail('removed subagents/list must not be dispatched')
  }}
  return{...f,ctx,gateway,peers,run:()=>invokeHostRemote(ctx,gateway,{namespace:'subagents',method:'list',args:{parentSessionId:parent},signal:new AbortController().signal})}
}
test('actual subagents.list wiring admits both native reads before exact migration observation',async t=>{
  const f=wiredFixture(t);const result=await f.run()
  assert.equal(result.entries[0].id,child.id);assert.equal(f.counts.read,1);assert.equal(f.counts.disposed,1)
  assert.equal(f.peers.length,1);assert.equal(f.peers[0].signal.aborted,true)
})
for(const deny of ['projections','list'])test(`actual wiring never observes migration after native ${deny} denial`,async t=>{
  const f=wiredFixture(t,{deny});await assert.rejects(f.run(),/native denied/)
  assert.equal(f.counts.read,0);assert.equal(f.peers[0].signal.aborted,true)
})
test('actual migration wiring retains authoritative parent-child rejection',async t=>{
  const f=wiredFixture(t,{wrongParent:true});await assert.rejects(f.run(),/归属不一致/);assert.equal(f.counts.disposed,1)
})
test('actual normal projection wiring does not add observation reads',async t=>{
  const f=wiredFixture(t,{projection:{values:{subagentCatalog:[child]}}});assert.equal((await f.run()).entries[0].id,child.id);assert.equal(f.counts.read,0)
})

test('cached catalog never wins over an exact empty native catalog', async () => {
  const f = fixture({ cursor: -1, projections: { asOfSeq: -1, values: { subagentCatalog: [] } } })
  const actual = await resolve(f.ctx, parent, { ...hint, values: { subagentCatalog: [child] } })
  assert.deepEqual(actual, { kind: 'sequenced', asOfSeq: -1, values: { subagentCatalog: [] } })
  assert.equal(f.counts.disposed, 1)
})

test('exact catalog preserves local, external-diagnostic and ownership checks', async () => {
  const entries = [child, { id: 'external-job', mode: 'external' }]
  const f = fixture({ projections: { asOfSeq: 7, values: { subagentCatalog: entries } } })
  const actual = await resolve(f.ctx, parent, hint)
  const rows = [{ sessionId: parent, agentAvailable: true },
    { sessionId: child.id, origin: 'subagent', parentSessionId: parent, running: true }]
  assert.deepEqual(catalog(parent, actual, rows), { parentAvailable: true, entries: [
    { id: child.id, kind: 'child', mode: 'continuable', label: 'child', activity: 'running', hasChildren: false },
    { id: 'external-job', kind: 'diagnostic', reason: 'unsupported' },
  ] })
  assert.throws(() => catalog(parent, actual, [{ sessionId: child.id, origin: 'subagent', parentSessionId: 'other' }]), /归属不一致/)
  assert.throws(() => catalog(parent, { values: { subagentCatalog: [child, child] } }, rows), /目录不完整/)
})

for (const [name, patch] of [
  ['wrong identity', { header: { id: 'other' } }],
  ['invalid cursor', { cursor: NaN }],
  ['cursor below empty cut', { cursor: -2 }],
  ['fractional cursor', { cursor: 1.5 }],
  ['unpaired watermark', { projections: { asOfSeq: 6, values: { subagentCatalog: [child] } } }],
  ['missing exact projections', { projections: undefined }],
  ['missing exact catalog', { projections: { asOfSeq: 7, values: {} } }],
]) test(`${name} is rejected, never replaced with cached hints, and releases lease`, async () => {
  const f = fixture(patch)
  await assert.rejects(resolve(f.ctx, parent, { ...hint, values: { subagentCatalog: [child] } }),
    error => error.code === 'adapter/subagent-projection-unavailable')
  assert.equal(f.counts.disposed, 1)
})

test('missing native observation interface fails closed without using hints', async () => {
  await assert.rejects(resolve({ get: () => undefined }, parent, { ...hint, values: { subagentCatalog: [child] } }),
    error => error.code === 'adapter/subagent-projection-unavailable')
})

test('native read rejection propagates unchanged, without retries or hint fallback', async () => {
  const denied = Object.assign(new Error('denied'), { code: 'permission/denied' })
  let reads = 0
  await assert.rejects(resolve({ get: () => ({ observeSession() { reads++; throw denied } }) }, parent, hint), error => error === denied)
  assert.equal(reads, 1)
})

test('pre-aborted read never observes native Session', async () => {
  const controller = new AbortController(); controller.abort(new Error('cancel before read'))
  const f = fixture()
  await assert.rejects(resolve(f.ctx, parent, hint, controller.signal), /cancel before read/)
  assert.deepEqual(f.counts, { read: 0, disposed: 0 })
})

test('abort while observation resolves releases lease and publishes no catalog', async () => {
  const controller = new AbortController()
  const f = fixture()
  const ctx = { get: () => ({ async observeSession(_id, options) {
    assert.equal(options.signal, controller.signal)
    controller.abort(new Error('cancel in read'))
    return f.observation
  } }) }
  await assert.rejects(resolve(ctx, parent, hint, controller.signal), /cancel in read/)
  assert.equal(f.counts.disposed, 1)
})

test('invalid native lease is rejected instead of retained', async () => {
  const f = fixture({ [Symbol.dispose]: undefined })
  await assert.rejects(resolve(f.ctx, parent, hint), error => error.code === 'adapter/subagent-projection-unavailable')
})
