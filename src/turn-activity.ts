/** DSH-native facts -> optional, provider-neutral turn presentation. No paths
 * from prose/shell output, no synthetic persisted events, no model execution. */
type Row = Record<string, any>
const record = (v:any):Row => v && typeof v==='object' && !Array.isArray(v)?v:{}
const pathValue=(v:any)=>typeof v==='string'&&v.trim()&&v.length<=4096?v:null
const append=(e:Row)=>e.surfaceOp===undefined||e.surfaceOp==='append'
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
  accept(event:Row, facts?: { readonly mutationPath: string | null }):Row|undefined {
    const d=record(event.data),seq=event.seq
    if(!Number.isSafeInteger(seq))return
    if(event.type==='turn/start')this.state={turn:d.turn,start:seq,calls:new Map(),results:new Set(),changes:[],messages:[],visible:[],contexts:[],humans:[],tools:[],subagents:[],answer:null,reasoning:false,step:null,evidence:false}
    const s=this.state
    if(!s||d.turn!==undefined&&d.turn!==s.turn)return
    // Native user-message events have no turn field. Their enclosing durable
    // turn owns injected context, while human/steering messages stay separate.
    if(event.type==='user/message' && typeof d.source?.kind==='string'
      && (event.surfaceOp===undefined||event.surfaceOp==='append')) {
      (d.source.kind==='user'?s.humans:s.contexts).push(seq)
      if(d.source.kind==='user'&&!s.evidence&&!s.layout) {
        // chat-snapshot-builder.ts orders process candidates after this input;
        // it does NOT rewrite their durable event seq or move later steering.
        s.layout={startSeq:s.start,openingInputSeq:seq}
        return {schema:'agent.activity.v1',turn:s.turn,layout:s.layout}
      }
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
      if(path && result && result.isError!==true && !d.error && !s.results.has(callId)) {
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
    if(d.reason?.kind!=='completed'||!s.answer)return
    const before=(n:number)=>n<s.answer
    const tools=s.tools.filter(before),subagents=s.subagents.filter(before),messages=s.messages.filter((m:Row)=>m.step<s.step)
    const hasProcess=tools.length||subagents.length||s.contexts.length||s.reasoning||s.visible.some((m:Row)=>m.step<s.step)
    // Native compactAnswer preserves reasoning after in-turn human steering.
    // Input messages stay independent; never erase their surrounding context.
    const compactReasoning=s.reasoning&&s.humans.filter(before).length<=1
    return {schema:'agent.activity.v1',turn:s.turn,answerSeq:s.answer,...(s.layout?{layout:s.layout}:{}),
      changedFiles:[...new Set(s.changes.filter((c:Row)=>c.seq<=s.answer).map((c:Row)=>c.path))].map(reference=>({reference})),
      ...(hasProcess?{process:{startSeq:s.start,endSeq:s.answer,boundary:'turn',answerParts:compactReasoning?['reasoning']:[],includesContext:true,
        contextCount:s.contexts.filter(before).length,toolCount:tools.length,subagentCount:subagents.length,messageCount:messages.length,complete:true}}:{})}
  }
}
