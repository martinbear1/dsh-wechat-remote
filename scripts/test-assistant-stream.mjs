import assert from 'node:assert/strict'
import { AssistantStreamCompatibility, assistantAttemptPresentation, firstCompactTokenTime } from '../lib/assistant-stream-compat.js'
const events = []
const bridge = new AssistantStreamCompatibility(e => events.push(e))
bridge.baseline({revision: 3, activeAttempt: {attemptId: 'a', nextIndex: 9, stream: [
  {type:'chunk',time:1,chunk:{type:'block-start',index:0,blockType:'text'}},
  {type:'text-chunks',time0:2,index:0,dt:[1],texts:['hel','lo']}]}})
assert.equal(events.at(-1).data.chunk.text,'hello')
bridge.follow({type:'chunk',attemptId:'a',revision:4,index:9,time:10,chunk:{type:'text-delta',index:0,text:' world'}})
assert.equal(events.at(-1).data.chunk.text, ' world')
assert(events.every(e => e.seq === undefined), 'ephemeral stream cannot advance durable cursor')
bridge.follow({type:'end',attemptId:'a',revision:5,index:10,outcome:{kind:'abandoned'}})
assert.equal(events.at(-1).type, 'agent/stream-reset')
assert.throws(()=>bridge.follow({type:'chunk',attemptId:'a',revision:7,index:10,chunk:{}}), /gap/)
new AssistantStreamCompatibility(()=>assert.fail()).baseline(undefined)
const stream=[{type:'text-chunks',index:0,time0:100,dt:[7,9],texts:['','a','b']}]
assert.equal(firstCompactTokenTime(stream),107)
const attempt=assistantAttemptPresentation({seq:20,type:'assistant/attempt',data:{turn:2,step:1,stream}})
assert.equal(attempt.message.content[0].text,'ab')
assert.equal(attempt.message.id,'agent-attempt-20')
assert.equal(attempt.schema,'agent.transcript.v1')
console.log('assistant stream: reconnect baseline, deltas, abandonment, seq isolation, gap detection passed')
