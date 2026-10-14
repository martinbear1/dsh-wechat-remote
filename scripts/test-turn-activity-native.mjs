// Execute unmodified pure projections from the installed official UI bundle.
// Synthetic logs only: no profile, session DB, network, task or model is used.
import fs from 'node:fs'
import vm from 'node:vm'
import crypto from 'node:crypto'
import assert from 'node:assert/strict'
import { TurnActivityCompatibility } from '../lib/turn-activity.js'

const archive=process.env.HARNESS_DSH_ASAR
if(!archive)throw Error('Set HARNESS_DSH_ASAR to the installed read-only app.asar')
const member='dsh/node_modules/@deepseek-ai/dsh-client-ui-chat/lib/client.js'
const fd=fs.openSync(archive,'r')
let source
try {
  const header=Buffer.alloc(16);fs.readSync(fd,header,0,16,0)
  const data=Buffer.alloc(header.readUInt32LE(12));fs.readSync(fd,data,0,data.length,16)
  let item=JSON.parse(data)
  for(const segment of member.split('/'))item=item.files[segment]
  assert(!item.unpacked&&!item.link&&!item.files)
  const contents=Buffer.alloc(item.size)
  fs.readSync(fd,contents,0,contents.length,8+header.readUInt32LE(4)+Number(item.offset))
  source=contents.toString('utf8')
} finally {fs.closeSync(fd)}
const section=(begin,end)=>{
  const start=source.indexOf(begin);assert(start>=0,begin)
  const through=source.indexOf(end,start+begin.length);assert(through>start,end)
  return source.slice(start,through)
}
const inbox=section('//#region lib/types/client/conversation-nodes/inbox.js','//#endregion')
const messages=section('//#region lib/types/client/conversation-nodes/message.js','//#endregion')
const independent=section('const TURN_PROCESS_INDEPENDENT_KINDS =',';')+';'
const derive=section('function derivePresentation(turn, locations, nodes)','/** Mutable projection')
const ordering=section('function turnProcessPresentations(nodes)','/**\n\t\t* Order visible Chat Nodes')
const evidence=section('function visibleChunk(chunk)','function turnLocation$1(context)')
const context=vm.createContext({
  // These presentation-only helpers do not determine inbox/trigger membership.
  contextProducer:()=>undefined,contextForm:()=>undefined,
  isAppendSurfaceEvent:event=>event.surfaceOp==='append',
  isReplacementSurfaceEvent:event=>event.surfaceOp==='replace',
  toAssistantBlocks:blocks=>blocks.map(block=>({...block,kind:block.type})),
  isVisibleChatNode:()=>true,
})
vm.runInContext([inbox,messages,independent,derive,ordering,evidence,
  'globalThis.native={applySplice,messageDefinition,derivePresentation,turnProcessPresentations,presentationPosition,processEvidence}'].join('\n'),context)
const native=context.native
const msg=(id,kind='schedule')=>({id,source:{kind},content:[{type:'text',text:'Synthetic instruction only'}]})
const splice=(target,start,removedCount,inserted=[],outcome)=>['agent/inbox/spliced',{
  target,start,removedCount,inserted,...(outcome?{outcome}:{})}]
const begin=['turn/start',{turn:1}],step=n=>['step/start',{turn:1,step:n}]
const user=(id,kind='schedule')=>['user/message',msg(id,kind)]
const tool=['tool/call',{turn:1,step:1,callId:'read',name:'read',arguments:'{}'}]
const reply=n=>['assistant/message',{turn:1,step:n,message:{content:[{type:'reasoning',text:'Synthetic thought'},{type:'text',text:'Synthetic answer'}]}}]
const end=['turn/end',{turn:1,reason:{kind:'completed'}}]
const scenarios=[
  ['next-turn wake',[splice('next-turn',0,0,[msg('a')]),begin,splice('next-turn',0,1),step(1),user('a'),reply(1),end]],
  ['first-step idle wake',[begin,step(1),splice('next-step',0,0,[msg('a')]),splice('next-step',0,1),user('a'),reply(1),end]],
  ['running second-step injection remains context',[begin,step(1),user('human','user'),tool,step(2),splice('next-step',0,0,[msg('a')]),splice('next-step',0,1),user('a'),reply(2),end]],
  ['mixed first-step claim is not an idle wake',[begin,step(1),splice('next-step',0,0,[msg('a'),msg('human','user')]),splice('next-step',0,2),user('a'),user('human','user'),reply(1),end]],
  ['canceled removal does not enter a claim',[splice('next-turn',0,0,[msg('a')]),begin,splice('next-turn',0,1,[],'canceled'),step(1),user('a'),reply(1),end]],
  ['reinserted identity loses current claim',[splice('next-turn',0,0,[msg('a')]),begin,splice('next-turn',0,1),splice('next-turn',0,0,[msg('a')]),step(1),user('a'),reply(1),end]],
  ['newer claim supersedes old claim',[splice('next-turn',0,0,[msg('a'),msg('b')]),begin,splice('next-turn',0,1),splice('next-turn',0,1),step(1),user('a'),user('b'),reply(1),end]],
  ['opening trigger batch uses the last input',[splice('next-turn',0,0,[msg('a'),msg('b')]),begin,splice('next-turn',0,2),step(1),user('a'),user('b'),reply(1),end]],
  ['later attested trigger preserves all interleaved process',[splice('next-turn',0,0,[msg('a'),msg('b')]),begin,splice('next-turn',0,2),step(1),user('a'),tool,user('b'),reply(1),end]],
  ['human steering after scheduled wake preserves process',[splice('next-turn',0,0,[msg('a')]),begin,splice('next-turn',0,1),step(1),user('a'),tool,user('human','user'),reply(1),end]],
  ['multiple opening humans are not interleaved',[begin,step(1),user('first','user'),user('second','user'),reply(1),end]],
  ['missing inserted queue gives no claim proof',[begin,splice('next-turn',0,1),step(1),user('unknown'),reply(1),end]],
  ['next-turn admission prevents idle-steer shortcut',[splice('next-turn',0,0,[msg('first','user')]),begin,splice('next-turn',0,1),step(1),user('first','user'),splice('next-step',0,0,[msg('a')]),splice('next-step',0,1),user('a'),reply(1),end]],
]
const completed=[]
for(const [name,rows] of scenarios) {
  const adapter=new TurnActivityCompatibility(),claims=new Map(),nodes=[],facets=[]
  let turnStart,stepNumber,controlSeq,answerSeq,answerStep,latest
  const triggerSeqs=[]
  for(const [seq,[type,data]] of rows.entries()) {
    const event={seq,type,data,surfaceOp:'append',time:seq*1000}
    if(type==='agent/inbox/spliced') {
      const key='inbox-'+data.target
      claims.set(key,{state:native.applySplice(claims.get(key),data,seq)})
    }
    if(type==='turn/start')turnStart=seq
    if(type==='step/start')stepNumber=data.step
    const location=stepNumber===undefined?{kind:'turn',turn:{turn:1,start:{seq:turnStart},status:'closed'}}
      :{kind:'step',turn:{turn:1,start:{seq:turnStart},status:'closed'},step:{step:stepNumber}}
    if(type==='user/message') {
      const projected=native.messageDefinition.start({}, {event,location}, {previous:key=>claims.get(key)})
      const kind=projected.kind==='context'&&projected.waking?'turn-trigger':projected.kind
      nodes.push({key:'n'+seq,anchorSeq:seq,kind,location,data:projected})
      if(data.source.kind==='schedule'&&projected.waking)triggerSeqs.push(seq)
    }
    const process=native.processEvidence(event)
    if(process)controlSeq=Math.min(controlSeq??Infinity,seq)
    if(type==='tool/call')nodes.push({key:'n'+seq,anchorSeq:seq,kind:'tool-call',location,data})
    if(type==='assistant/message') {
      answerSeq=seq;answerStep=data.step
      nodes.push({key:'n'+seq,anchorSeq:seq,kind:'assistant-step',location,data:{step:answerStep}})
    }
    const value=adapter.accept(event)
    if(value){facets.push(value);latest=value}
  }
  const observed=[...new Set(facets.flatMap(value=>value.triggerInputSeqs||[]))]
  assert.deepEqual(observed,triggerSeqs,name+': exact native inbox waking classification')
  const turn={turn:1,start:{seq:turnStart},status:'closed'}
  const spec={turn:1,controlAnchorSeq:controlSeq??turnStart,processStartSeq:turnStart,answerAnchorSeq:answerSeq,answerStep,inlineReasoning:true}
  nodes.push({key:'control',anchorSeq:spec.controlAnchorSeq+0.001,kind:'turn-process',location:{kind:'turn',turn},data:spec})
  const nodeMap=new Map(nodes.map(node=>[node.key,node]))
  const nativeView=native.derivePresentation(1,{getTurn:()=>[...nodeMap.keys()]},nodeMap)
  const nativeLayout=native.turnProcessPresentations(nodes).get(1)
  const actualLayout=facets.filter(value=>value.layout).at(-1)?.layout
  assert.equal(actualLayout?.openingInputSeq,nativeLayout.openingInputAnchor,name+': opening layout')
  if(nativeView.hasInterleavedInput)assert.equal(latest.process,undefined,name+': never hide interleaved process or reasoning')
  else {
    assert.deepEqual(latest.process.answerParts,['reasoning'],name+': compact final reasoning only with no interleaved input')
    assert.equal(latest.process.contextCount,nodes.filter(node=>node.kind==='context'&&node.anchorSeq<answerSeq).length,name+': triggers are not context')
  }
  completed.push(name)
}
console.log(JSON.stringify({member,sha256:crypto.createHash('sha256').update(source).digest('hex'),
  nativeFunctions:['applySplice','messageDefinition.start','processEvidence','derivePresentation','turnProcessPresentations'],
  syntheticScenarios:completed,profileAccess:false,network:false,model:false},null,2))
