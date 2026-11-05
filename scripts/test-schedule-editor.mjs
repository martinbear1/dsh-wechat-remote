import test from 'node:test'
import assert from 'node:assert/strict'
import {editorView,editorRequest} from '../lib/scheduled-tasks/editor.js'
import {NativeScheduledTasks} from '../lib/scheduled-tasks/native.js'
const signal=new AbortController().signal
const row=(patch={})=>({id:'t',title:'Daily',prompt:'Instruction',kind:'rrule',
 rrule:'DTSTART;TZID=Asia/Shanghai:20990101T090000\nRRULE:FREQ=DAILY;BYHOUR=9;BYMINUTE=0',
 scheduledAt:'2099-01-01T01:00:00Z',status:'active',updatedAt:'r1',target:{kind:'new',create:{cwd:'/project',agentPreset:{id:'keep-me'}}},involvedSessionIds:['creator'],...patch})
test('pinned native editor preserves opaque recurrence and target for content-only edits',()=>{
 for(const task of [row(),row({kind:'every',everySeconds:90}),row({rrule:'DTSTART:20990101T091530Z\nRRULE:FREQ=WEEKLY;BYDAY=1MO;COUNT=12'}),row({kind:'at',scheduledAt:'2099-01-01T01:02:03.123Z'})]){
  const {draft}=editorView({get:()=>undefined},task)
  let changed;assert.doesNotThrow(()=>{changed=editorRequest({...draft,title:'Updated'},task)},JSON.stringify(draft))
  assert.deepEqual(changed,{title:'Updated'})
  assert.deepEqual(editorRequest(draft,task),{})
 }
})
test('guided rules map to native typed selectors and advanced text remains lossless',()=>{
 const task=row(),{draft}=editorView({get:()=>undefined},task)
 for(const frequency of ['once','minutely','hourly','daily','weekly','monthly']){
  const request=editorRequest({...draft,frequency,interval:'2',monthDay:31,weekdays:[1,5],dailyTime:'10:30'},task)
  assert.equal(request.timing.kind,'rrule');assert(request.timing.rrule.startsWith('DTSTART'))
 }
 assert.equal(editorRequest({...draft,frequency:'advanced',rrule:'  0 9 * * *  '},task).timing.kind,'cron')
 assert.throws(()=>editorRequest({...draft,frequency:'weekly',weekdays:[]},task),{code:'invalid_rule'})
 assert.throws(()=>editorRequest({...draft,frequency:'monthly',monthDay:32},task),{code:'invalid_rule'})
 assert.throws(()=>editorRequest({...draft,target:'session',sessionId:'creator'},task),{code:'invalid_rule'})
 assert.deepEqual(editorRequest({...draft,target:'new_once'},task).target,{kind:'new_once',create:task.target.create})
 assert.deepEqual(editorRequest({...draft,cwd:'/other'},task).target,{kind:'new',create:{cwd:'/other'}})
})
test('clock includes creator/manager/latest execution, excludes inactive and keeps execution identity separate',async()=>{
 const task=row({lastDelivery:{targetSessionId:'latest'}})
 const native={catalog:async()=>[task],view:async()=>task,edit:async()=>task,history:async()=>({})}
 const adapter=new NativeScheduledTasks({get:n=>n==='schedule'?native:undefined})
 assert.deepEqual(await adapter.control('sessionFlags',{sessionIds:['creator','latest','other']},signal),{sessionIds:['creator','latest']})
 const detail=await adapter.control('detail',{protocolVersion:2,id:'t',sessionId:'creator'},signal)
 assert.equal(detail.item.sessionId,undefined);assert.equal(detail.item.linkedSessionId,'latest');assert.equal(detail.item.target.kind,'new')
 task.status='paused';assert.deepEqual(await adapter.control('sessionFlags',{sessionIds:['creator','latest']},signal),{sessionIds:[]})
})
test('new write APIs are opt-in and forward one native run/clear operation without replay',async()=>{
 const calls=[],task=row(),native={catalog:async()=>[task],view:async()=>task,edit:async()=>task,history:async()=>({}),run:async(...a)=>{calls.push(['run',...a]);return {id:'t',code:'schedule_execution_pending'}},deleteInactive:async()=>{calls.push(['clear']);return {deleted:0}}}
 const adapter=new NativeScheduledTasks({get:n=>n==='schedule'?native:undefined})
 assert.equal(adapter.status().capabilities.run,true)
 await assert.rejects(adapter.control('run',{id:'t'},signal),{code:'operation_unavailable'})
 assert.equal((await adapter.control('run',{protocolVersion:2,id:'t'},signal)).code,'schedule_execution_pending')
 assert.deepEqual(calls[0],['run',{id:'t'},signal])
 await adapter.control('clearEnded',{protocolVersion:2},signal);assert.equal(calls.length,2)
})
