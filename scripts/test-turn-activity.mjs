import assert from 'node:assert/strict'
import {TurnActivityCompatibility,mutationPath} from '../lib/turn-activity.js'
const run=(reason='completed',prefix=true)=>{
 const a=new TurnActivityCompatibility(),out=[]
 const add=(type,seq,data={},surfaceOp='append')=>{const v=a.accept({type,seq,surfaceOp,data:{turn:1,...data}});if(v)out.push(v)}
 if(prefix)add('turn/start',1)
 add('step/start',2,{step:1})
 add('assistant/message',3,{step:1,message:{content:[{type:'reasoning',text:'thinking'}]}})
 add('tool/call',4,{callId:'write',name:'write',arguments:JSON.stringify({file_path:'report.md',content:''})})
 add('tool/result',5,{message:{source:{callId:'write'},content:[{type:'tool-result',isError:false}]}})
 add('assistant/message',6,{step:1,message:{content:[{type:'text',text:'working'}]}})
 add('tool/call',7,{callId:'child',name:'subagent_research',arguments:'{}'})
 assert(!out.some(f=>f.process),'running turn never folds even with an intermediate text answer')
 add('step/start',8,{step:2})
 add('assistant/message',9,{step:2,message:{content:[{type:'text',text:'ignored replay'}]}},'replace')
 add('assistant/message',10,{step:2,message:{content:[{type:'text',text:'done'}]}})
 add('turn/end',11,{reason:{kind:reason}})
 return out
}
const done=run().at(-1)
assert.deepEqual(done.process,{startSeq:1,endSeq:10,boundary:'turn',answerParts:[],includesContext:true,contextCount:0,toolCount:1,subagentCount:1,messageCount:1,complete:true})
assert.deepEqual(done.changedFiles,[{reference:'report.md'}])
assert(!run('failed').some(f=>f.process));assert(!run('completed',false).some(f=>f.process))
const noAnswer=new TurnActivityCompatibility()
for(const e of [{type:'turn/start',seq:1,data:{turn:1}},{type:'step/start',seq:2,data:{turn:1,step:1}},{type:'assistant/message',seq:3,data:{turn:1,step:1,message:{content:[{type:'text',text:'not final'}]}}},{type:'step/start',seq:4,data:{turn:1,step:2}}])noAnswer.accept(e)
assert.equal(noAnswer.accept({type:'turn/end',seq:5,data:{turn:1,reason:{kind:'completed'}}}),undefined)
assert.equal(mutationPath('bash','{"command":"touch x"}'),null)
assert.equal(mutationPath('write','{"file_path":"x"}'),null)
assert.equal(mutationPath('edit','{"file_path":"x","old_string":"a","new_string":"a"}'),null)
assert.equal(mutationPath('str_replace_editor','{"command":"insert","path":"x","insert_line":0,"new_str":"a"}'),'x')
console.log('turn activity: completion boundary, reply-only counts, subagents, partial/replaced events, real mutations passed')

const parts=new TurnActivityCompatibility()
parts.accept({type:'turn/start',seq:1,data:{turn:2}})
parts.accept({type:'user/message',seq:2,data:{source:{kind:'user'}}})
parts.accept({type:'user/message',seq:3,data:{source:{kind:'plugin'}}})
parts.accept({type:'step/start',seq:4,data:{turn:2,step:1}})
parts.accept({type:'assistant/message',seq:5,data:{turn:2,step:1,message:{content:[{type:'reasoning',text:'Think'},{type:'text',text:'Done'}]}}})
const spec=parts.accept({type:'turn/end',seq:6,data:{turn:2,reason:{kind:'completed'}}})
assert.deepEqual(spec.process.answerParts,['reasoning'])
assert.equal(spec.process.contextCount,1);assert.equal(spec.process.toolCount,0);assert.equal(spec.process.messageCount,0)

const steering=new TurnActivityCompatibility()
for(const e of [
 {type:'turn/start',seq:1,data:{turn:1}},
 {type:'user/message',seq:2,data:{source:{kind:'user'}}},
 {type:'user/message',seq:3,data:{source:{kind:'external-provider'}}},
 {type:'user/message',seq:4,data:{source:{kind:'user'}}},
 {type:'step/start',seq:5,data:{turn:1,step:1}},
 {type:'assistant/message',seq:6,data:{turn:1,step:1,message:{content:[{type:'reasoning',text:'reconsider'},{type:'text',text:'answer'}]}}},
])steering.accept(e)
const steered=steering.accept({type:'turn/end',seq:7,data:{turn:1,reason:{kind:'completed'}}})
assert.deepEqual(steered.process.answerParts,[],'native in-turn steering keeps final reasoning visible')
assert.equal(steered.process.contextCount,1,'all known non-human producer kinds are context')
