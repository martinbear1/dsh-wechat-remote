/** Actual official Desktop runtime, synthetic storage only. No live profile or Agent. */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL, fileURLToPath } from 'node:url'
import { build } from 'esbuild'
const archive = process.env.HARNESS_DSH_ASAR
assert(archive, 'HARNESS_DSH_ASAR must explicitly select the official runtime')
const work = fs.mkdtempSync(path.join(os.tmpdir(), 'schedule-modern-native-'))
assert.equal(path.dirname(path.resolve(work)), path.resolve(os.tmpdir()))
assert(path.basename(work).startsWith('schedule-modern-native-'))
let ctx, scheduleScope, fd
let network = 0, activation = 0
let allowSyntheticDispatch=false,syntheticResolutions=0,releaseIdle
const inbox=[],syntheticSession={id:'synthetic'}
const receiver={session:syntheticSession,followup:message=>{assert(allowSyntheticDispatch);inbox.push(message)},whenIdle:()=>new Promise(resolve=>{releaseIdle=resolve})}
const originalFetch = globalThis.fetch
globalThis.fetch = async () => { network++; throw Error('Network is forbidden in this fixture') }
try {
  fd = fs.openSync(archive, 'r')
  const prefix = Buffer.alloc(16); fs.readSync(fd, prefix, 0, 16, 0)
  const bytes = Buffer.alloc(prefix.readUInt32LE(12)); fs.readSync(fd, bytes, 0, bytes.length, 16)
  const tree = JSON.parse(bytes), dataStart = 8 + prefix.readUInt32LE(4)
  function extract(entry, relative) {
    const target = path.resolve(work, relative)
    assert(target.startsWith(work + path.sep)); assert(!entry.link)
    if (entry.files) for (const [name, child] of Object.entries(entry.files)) extract(child, path.join(relative, name))
    else if (/\.(?:[mc]?js|json|node|dll|wasm|ya?ml)$/.test(relative)) {
      fs.mkdirSync(path.dirname(target), { recursive: true })
      if (entry.unpacked) fs.copyFileSync(path.join(archive + '.unpacked', relative), target)
      else { const data = Buffer.alloc(entry.size); fs.readSync(fd, data, 0, data.length, dataStart + Number(entry.offset)); fs.writeFileSync(target, data) }
    }
  }
  extract(tree.files.dsh, 'dsh')
  const anchor = path.join(work, 'dsh/node_modules/@deepseek-ai/dsh/package.json')
  const require = createRequire(anchor), load = name => import(pathToFileURL(require.resolve(name)).href)
  const hostVersion = JSON.parse(fs.readFileSync(anchor, 'utf8')).version
  const { Context } = await load('@deepseek-ai/cordis')
  const storage = await load('@deepseek-ai/dsh-storage'), json = await load('@deepseek-ai/dsh-storage-json'), domain = await load('@deepseek-ai/dsh-storage-domain')
  const { default: Schedule } = await load('@deepseek-ai/dsh-schedule')
  const output = await build({ entryPoints: [fileURLToPath(new URL('../src/scheduled-tasks/native.ts', import.meta.url))],
    bundle: true, packages: 'external', write: false, platform: 'node', format: 'esm', target: 'node22' })
  const entry = path.join(work, 'dsh/test-adapter.mjs'); fs.writeFileSync(entry, output.outputFiles[0].contents)
  const { NativeScheduledTasks } = await import(pathToFileURL(entry).href)
  ctx = new Context()
  ctx.provide('agents', { roots: () => [], get: () => undefined, withoutInitiator: action => action() })
  ctx.provide('sessions', { get: id => id === 'synthetic' ? syntheticSession : undefined,flush:async session=>{assert.equal(session,syntheticSession);fs.writeFileSync(path.join(work,'synthetic-inbox.json'),JSON.stringify(inbox));return true} })
  ctx.provide('sessionPersistence', { stat: async id => id === 'synthetic' ? { header: { delegationDepth: 0 } } : undefined })
  ctx.provide('workspaceRegistry', { archivedSessionIds: [],list:()=>[{title:'default-workspace',path:'/synthetic-project'}] })
  ctx.provide('sessionController', { resolveAgent: async id => {if(!allowSyntheticDispatch){activation++;throw Error('Agent activation forbidden')}assert.equal(id,'synthetic');syntheticResolutions++;return {agent:receiver}} })
  ctx.provide('tools', {})
  await ctx.plugin(storage.default); await ctx.plugin(json, { root: path.join(work, 'synthetic-storage') }); await ctx.plugin(domain, { backend: 'json' })
  scheduleScope = ctx.plugin(Schedule, {}); await scheduleScope
  const adapter = new NativeScheduledTasks(ctx), signal = new AbortController().signal
  assert.equal(adapter.status().protocolVersion, 2)
  const call = (action, input = {}) => adapter.control(action, { ...input, protocolVersion: 2 }, signal)
  const request = { title: 'Synthetic task', prompt: 'Never dispatched', daily: { time: '09:00:00', time_zone: 'UTC' } }
  const made = await call('create', { sessionId: 'synthetic', request })
  assert.deepEqual(made.target, { kind: 'session', sessionId: 'synthetic' })
  const detail = await call('detail', { id: made.id })
  assert.equal(detail.expected.updatedAt, made.updatedAt)
  const updated = await call('update', { id: made.id, expected: detail.expected, title: 'Edited' })
  assert.equal(updated.record.title, 'Edited')
  const conflict = await call('update', { id: made.id, expected: { id: made.id, updatedAt: 'stale' }, title: 'Must not replace' })
  assert.equal(conflict.code, 'schedule_conflict')
  const latest = await call('detail', { id: made.id })
  const paused = await call('update', { id: made.id, expected: latest.expected, active: false })
  assert.equal(paused.record.status, 'paused')
  assert.equal((await call('catalog')).items.find(x => x.id === made.id).status, 'paused')
  const beforeResume = await call('detail', { id: made.id })
  assert.equal((await call('update', { id: made.id, expected: beforeResume.expected, active: true })).record.status, 'active')
  const rrule = 'DTSTART:20990101T090000Z\nRRULE:FREQ=DAILY'
  const advanced = await ctx.schedule.create({ title: 'Advanced', prompt: 'Never dispatched', timing: { kind: 'rrule', rrule }, target: { kind: 'new' } }, undefined, signal)
  const once = await ctx.schedule.create({ title: 'New once', prompt: 'Never dispatched', timing: { kind: 'at', at: '2099-01-01T00:00:00Z' }, target: { kind: 'new_once' } }, undefined, signal)
  const all = await call('catalog'); assert.equal(all.total, 3)
  assert.equal(all.items.find(x => x.id === advanced.id).sessionId, undefined)
  assert.equal(all.items.find(x => x.id === once.id).sessionId, undefined)
  const advancedDetail = await call('detail', { id: advanced.id })
  const edited = await call('update', { id: advanced.id, expected: advancedDetail.expected, prompt: 'Changed text only' })
  assert.equal(edited.record.rrule, advanced.rrule); assert.deepEqual(edited.record.target, advanced.target)
  await assert.rejects(adapter.control('catalog', {}, signal), { code: 'operation_unavailable' })
  const history = await call('history', { id: once.id }); assert.deepEqual(history.records, [])
  const deleteDetail = await call('detail', { id: once.id })
  assert.equal((await call('delete', { id: once.id, expected: deleteDetail.expected })).deleted, true)
  assert.equal((await call('catalog')).total, 2)
  const fresh = await call('newDraft')
  assert.equal(fresh.draft.target,'new_once'); assert.equal(fresh.draft.cwd,'/synthetic-project')
  const manual=await call('createDraft',{draft:{...fresh.draft,title:'Manual native form',prompt:'Never dispatched',frequency:'daily',dailyTime:'09:00',timeZone:'Asia/Shanghai',target:'new'}})
  assert.equal(manual.record.target.kind,'new'); assert.equal(manual.record.kind,'rrule')
  let manualDetail=await call('detail',{id:manual.record.id})
  assert.equal(manualDetail.editor.draft.frequency,'daily');assert.equal(manualDetail.editor.draft.dailyTime,'09:00')
  const untouched=manualDetail.item.rrule, destination=manualDetail.item.target
  const text=await call('updateDraft',{id:manual.record.id,expected:manualDetail.expected,draft:{...manualDetail.editor.draft,title:'Text only'}})
  assert.equal(text.record.rrule,untouched);assert.deepEqual(text.record.target,destination)
  assert.equal((await call('updateDraft',{id:manual.record.id,expected:manualDetail.expected,draft:{...manualDetail.editor.draft,title:'Stale'}})).code,'schedule_conflict')
  manualDetail=await call('detail',{id:manual.record.id})
  const timingEdit=await call('updateDraft',{id:manual.record.id,expected:manualDetail.expected,draft:{...manualDetail.editor.draft,dailyTime:'10:30',target:'new_once'}})
  assert.equal(timingEdit.record.target.kind,'new_once');assert(timingEdit.record.rrule.includes('BYHOUR=10'))
  assert(timingEdit.record.rrule.includes('BYMINUTE=30'))
  const guided=await call('detail',{id:manual.record.id})
  const custom=await call('customDraft',{id:manual.record.id,expected:guided.expected,draft:{...guided.editor.draft,dailyTime:'11:15'}})
  assert(custom.rrule.includes('BYHOUR=11'));assert(custom.rrule.includes('BYMINUTE=15'))
  assert.equal((await call('clearEnded')).deleted,0)
  await assert.rejects(adapter.control('newDraft',{},signal),{code:'operation_unavailable'})
  assert.equal(activation,0)
  allowSyntheticDispatch=true
  const beforeRun=await call('detail',{id:made.id})
  const ran=await call('run',{id:made.id})
  assert.equal(ran.scheduledAt,beforeRun.item.scheduledAt);assert.equal(inbox.length,1)
  assert.equal((await call('run',{id:made.id})).code,'schedule_execution_pending')
  assert.equal(inbox.length,1);releaseIdle();await Promise.resolve()
  const runHistory=await call('history',{id:made.id})
  assert.equal(runHistory.records[0].targetSessionId,'synthetic');assert.equal(runHistory.records[0].messageId,inbox[0].id)
  const due=await call('create',{sessionId:'synthetic',request:{title:'Synthetic timer',prompt:'SYNTHETIC_ONLY',after_seconds:1}})
  const deadline=Date.now()+5000
  while((await call('detail',{id:due.id})).item.status!=='ended'){
    assert(Date.now()<deadline,'native one-shot did not finish');await new Promise(resolve=>setTimeout(resolve,20))
  }
  releaseIdle?.();assert.equal(inbox.length,2)
  assert.equal((await call('clearEnded')).deleted,1)
  assert.equal((await call('detail',{id:made.id})).item.status,'active')
  await scheduleScope.dispose()
  assert.equal(adapter.status().enabled, false)
  await assert.rejects(call('catalog'), { code: 'schedule_disabled' })
  adapter.close()
  assert.equal(network, 0); assert.equal(activation, 0)
  console.log(JSON.stringify({ hostVersion, passed: true, genuineNativeStorage: true,
    checks: ['create explicit target', 'native edit CAS', 'pause/resume', 'RRULE/new/new_once roundtrip', 'text edit preserves timing/target', 'guided manual create/edit', 'custom projection', 'old-phone explicit boundary', 'run keeps occurrence and holds admission', 'native timer/inbox history', 'clear ended only', 'history/delete', 'provider withdrawal'], network, activation,syntheticResolutions,syntheticInboxDeliveries:inbox.length,liveProfilesTouched:false }))
} finally {
  globalThis.fetch = originalFetch
  if (fd !== undefined) fs.closeSync(fd)
  await ctx?.fiber?.dispose?.()
  assert.equal(path.dirname(path.resolve(work)), path.resolve(os.tmpdir()))
  assert(path.basename(work).startsWith('schedule-modern-native-'))
  fs.rmSync(work, { recursive: true, force: true })
}
