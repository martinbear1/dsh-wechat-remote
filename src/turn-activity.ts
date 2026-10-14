/** DSH-native facts -> optional, provider-neutral turn presentation. No paths
 * from prose/shell output, no synthetic persisted events, no model execution. */
import { toolResultFailed } from './tool-result-compat.js'
type Row = Record<string, any>
const record = (v:any):Row => v && typeof v==='object' && !Array.isArray(v)?v:{}
const pathValue=(v:any)=>typeof v==='string'&&v.trim()&&v.length<=4096?v:null
const append=(e:Row)=>e.surfaceOp===undefined||e.surfaceOp==='append'
// ui-chat/inbox.ts retains the current entered claim, not every message ever
// queued. Keep a bounded, known prefix: a history page may begin in the middle
// of a queue, so an unseen tail must never become invented claim evidence.
const MAX_INBOX_ITEMS=2048
type InboxItem={id:string;kind:string}
type InboxClaim={pending:InboxItem[];claimed:Map<string,string>;claimSeq:number;claimedHuman:boolean|undefined}
const inboxClaim=():InboxClaim=>({pending:[],claimed:new Map(),claimSeq:-1,claimedHuman:undefined})
const inboxId=(v:any):v is string=>typeof v==='string'&&v.length>0&&v.length<=512
function spliceClaim(current:InboxClaim,d:Row,seq:number):InboxClaim {
  if(!Number.isSafeInteger(d.start)||d.start<0||!Number.isSafeInteger(d.removedCount??0)||(d.removedCount??0)<0
    ||!Array.isArray(d.inserted)||d.inserted.length>MAX_INBOX_ITEMS)return inboxClaim()
  const inserted:InboxItem[]=[]
  for(const message of d.inserted) {
    if(!inboxId(message?.id)||typeof message?.source?.kind!=='string'||message.source.kind.length>128)return inboxClaim()
    inserted.push({id:message.id,kind:message.source.kind})
  }
  const count=d.removedCount??0,start=d.start
  const removed=current.pending.slice(start,start+count)
  // start beyond the known prefix may refer to an unseen suffix. Retain only
  // positions whose exact indices are proven, and never guess where it ends.
  const pending=start<=current.pending.length
    ?[...current.pending.slice(0,start),...inserted,...current.pending.slice(start+count)].slice(0,MAX_INBOX_ITEMS)
    :current.pending
  if(count>0&&d.outcome!=='canceled')return {pending,claimed:new Map(removed.map(item=>[item.id,item.kind])),claimSeq:seq,
    claimedHuman:removed.some(item=>item.kind==='user')?true:removed.length===count?false:undefined}
  const claimed=new Map(current.claimed)
  for(const item of inserted)claimed.delete(item.id)
  return {...current,pending,claimed}
}
// ui-chat/turn-process.ts processEvidence: injected context is not evidence.
// In particular, the first human message AFTER a tool/reply is steering, not
// an opening input. Preserve this distinction even before a turn completes.
function processEvidence(e:Row):boolean {
  const d=record(e.data)
  if(e.type==='tool/call'||e.type==='llm/retry'||e.type==='tool/result'&&append(e))return true
  const visible=(b:Row)=>b.type!=='tool-call'&&
    (b.type==='text'||b.type==='reasoning'?typeof b.text==='string'&&b.text.trim()!=='':true)
  if(e.type==='assistant/message'&&append(e))return (d.message?.content||[]).some(visible)
  if(e.type!=='assistant/live-chunk')return false
  const c=record(d.chunk)
  if(c.type==='text-delta'||c.type==='reasoning-delta')return typeof c.text==='string'&&c.text.trim()!==''
  if(c.type==='block-start')return !['text','reasoning','tool-call'].includes(c.blockType)
  return c.type==='block-end'&&!!c.block&&visible(c.block)
}
export function mutationPath(name:string,raw:string):string|null {
  let a:Row; try {a=record(JSON.parse(raw))} catch {return null}
  if(name==='write')return typeof a.content==='string'?pathValue(a.file_path):null
  if(name==='edit')return typeof a.old_string==='string'&&a.old_string.length>0&&typeof a.new_string==='string'
    &&a.old_string!==a.new_string&&(a.replace_all===undefined||typeof a.replace_all==='boolean')?pathValue(a.file_path):null
  if(name!=='str_replace_editor')return null
  const valid=a.command==='create'&&typeof a.file_text==='string'
    ||a.command==='str_replace'&&typeof a.old_str==='string'&&a.old_str.length>0&&(a.new_str===undefined||typeof a.new_str==='string')
    ||a.command==='insert'&&Number.isInteger(a.insert_line)&&a.insert_line>=0&&typeof a.new_str==='string'
  return valid?pathValue(a.path):null
}
export class TurnActivityCompatibility {
  private state:Row|undefined
  private nextTurn=inboxClaim()
  private nextStep=inboxClaim()
  private previousSeq:number|undefined
  accept(event:Row, facts?: { readonly mutationPath: string | null }):Row|undefined {
    const d=record(event.data),seq=event.seq
    if(!Number.isSafeInteger(seq))return
    if(this.previousSeq!==undefined&&seq!==this.previousSeq+1) {
      this.nextTurn=inboxClaim();this.nextStep=inboxClaim()
      if(this.state)this.state.nativeContinuous=false
    }
    this.previousSeq=seq
    if(event.type==='agent/inbox/spliced') {
      if(d.target==='next-turn')this.nextTurn=spliceClaim(this.nextTurn,d,seq)
      if(d.target==='next-step')this.nextStep=spliceClaim(this.nextStep,d,seq)
    }
    if(event.type==='turn/start')this.state={turn:d.turn,start:seq,calls:new Map(),results:new Set(),changes:[],messages:[],visible:[],contexts:[],tools:[],subagents:[],triggerInputSeqs:[],answer:null,reasoning:false,step:null,evidence:false,interleavedInput:false,nativeContinuous:true}
    const s=this.state
    if(!s||d.turn!==undefined&&d.turn!==s.turn)return
    // Native user-message events have no turn field. Their enclosing durable
    // turn owns injected context, while human/steering messages stay separate.
    if(event.type==='user/message' && typeof d.source?.kind==='string'
      && (event.surfaceOp===undefined||event.surfaceOp==='append')) {
      // message.ts: a non-human message is a turn trigger only when admitted by
      // the current next-turn claim, or by the first-step idle-steer claim. A
      // schedule source alone says who sent it, not whether it woke this turn.
      const id=d.id,schedule=d.source.kind==='schedule'
      const waking=schedule&&inboxId(id)&&(this.nextTurn.claimed.get(id)==='schedule'
        ||s.nativeContinuous&&s.step===1&&this.nextStep.claimSeq>s.start&&this.nextTurn.claimSeq<s.start
          &&this.nextStep.claimedHuman===false&&this.nextStep.claimed.get(id)==='schedule')
      const input=d.source.kind==='user'||waking
      if(!input)s.contexts.push(seq)
      if(waking&&s.triggerInputSeqs.length<MAX_INBOX_ITEMS)s.triggerInputSeqs.push(seq)
      if(input&&!s.evidence) {
        // chat-snapshot-builder.ts orders process candidates after this input;
        // the last opening input in a claimed batch is the opening anchor. It
        // does NOT rewrite durable seq or move later/interleaved input.
        s.layout={startSeq:s.start,openingInputSeq:seq}
        return {schema:'agent.activity.v1',turn:s.turn,layout:s.layout,...(waking?{triggerInputSeqs:[seq]}:{})}
      }
      if(input)s.interleavedInput=true
      if(waking)return {schema:'agent.activity.v1',turn:s.turn,triggerInputSeqs:[seq]}
    }
    if(d.turn!==s.turn)return
    if(processEvidence(event))s.evidence=true
    if(event.type==='step/start'){s.step=d.step;s.answer=null}
    if(event.type==='tool/call') {
      if(!s.calls.has(d.callId))(d.name==='subagent'||d.name?.startsWith('subagent_')?s.subagents:s.tools).push(seq)
      s.calls.set(d.callId,facts ? facts.mutationPath : mutationPath(d.name,d.arguments))
    }
    if(event.type==='tool/result'&&(event.surfaceOp===undefined||event.surfaceOp==='append')) {
      const callId=d.message?.source?.callId ?? d.message?.callId
      const result=d.message?.content?.[0]
      const path=s.calls.get(callId)
      if(path && result && !toolResultFailed(d.message) && !d.error && !s.results.has(callId)) {
        s.results.add(callId);s.changes.push({seq,path})
        return {schema:'agent.activity.v1',turn:s.turn,changedFiles:[{reference:path}]}
      }
    }
    if(event.type==='assistant/message'&&(event.surfaceOp===undefined||event.surfaceOp==='append')) {
      const content=d.message?.content||[]
      const reply=content.some((b:Row)=>b.type==='text'?typeof b.text==='string'&&b.text.trim()!=='':['image','file','audio','video'].includes(b.type))
      if(reply)s.messages.push({seq,step:d.step})
      if(reply||content.some((b:Row)=>b.type==='reasoning'&&b.text?.trim()))s.visible.push({seq,step:d.step})
      if(d.step===s.step){
        s.answer=reply&&!content.some((b:Row)=>b.type==='tool-call')?seq:null
        s.reasoning=content.some((b:Row)=>b.type==='reasoning'&&b.text?.trim())
      }
    }
    if(event.type!=='turn/end')return
    this.state=undefined
    // Failed/cancelled turns remain fully visible. Incomplete snapshot prefixes
    // never create this state, and therefore never pretend to be complete.
    const triggers=s.triggerInputSeqs.length?{triggerInputSeqs:s.triggerInputSeqs}:{}
    if(d.reason?.kind!=='completed'||!s.answer)return s.triggerInputSeqs.length
      ?{schema:'agent.activity.v1',turn:s.turn,...triggers,...(s.layout?{layout:s.layout}:{})}:undefined
    const before=(n:number)=>n<s.answer
    const tools=s.tools.filter(before),subagents=s.subagents.filter(before),messages=s.messages.filter((m:Row)=>m.step<s.step)
    const hasProcess=tools.length||subagents.length||s.contexts.length||s.reasoning||s.visible.some((m:Row)=>m.step<s.step)
    // ui-chat keeps the WHOLE process open after interleaved input. Preserving
    // only final reasoning would still hide the context around that input.
    return {schema:'agent.activity.v1',turn:s.turn,answerSeq:s.answer,...triggers,...(s.layout?{layout:s.layout}:{}),
      changedFiles:[...new Set(s.changes.filter((c:Row)=>c.seq<=s.answer).map((c:Row)=>c.path))].map(reference=>({reference})),
      ...(hasProcess&&!s.interleavedInput?{process:{startSeq:s.start,endSeq:s.answer,boundary:'turn',answerParts:s.reasoning?['reasoning']:[],includesContext:true,
        contextCount:s.contexts.filter(before).length,toolCount:tools.length,subagentCount:subagents.length,messageCount:messages.length,complete:true}}:{})}
  }
}
