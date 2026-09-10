/** Process-local frames must never consume durable Session sequence numbers. */
type Row = Record<string, any>
/** Lossless compact runs stay native; only a portable visible prefix leaves. */
export function assistantAttemptPresentation(event: Row): Row | undefined {
  if (event.type !== 'assistant/attempt' || !Array.isArray(event.data?.stream)) return undefined
  const blocks = new Map<number, {type:string; parts:string[]}>()
  const add = (index:number,type:string,text:string,replace=false) => {
    if (!Number.isSafeInteger(index) || index<0 || index>4096 || typeof text!=='string') return
    const old=blocks.get(index)
    if(replace || !old || old.type!==type) blocks.set(index,{type,parts:[text]})
    else old.parts.push(text)
  }
  for(const record of event.data.stream) {
    if(record.type==='text-chunks' || record.type==='reasoning-chunks') {
      for(const text of record.texts || [])add(record.index,record.type==='text-chunks'?'text':'reasoning',text)
    } else if(record.type==='chunk') {
      const c=record.chunk || {}
      if(c.type==='text-delta' || c.type==='reasoning-delta')add(c.index,c.type==='text-delta'?'text':'reasoning',c.text)
      else if(c.type==='block-start' && (c.blockType==='text' || c.blockType==='reasoning'))add(c.index,c.blockType,'',true)
      else if(c.type==='block-end' && (c.block?.type==='text' || c.block?.type==='reasoning'))add(c.index,c.block.type,c.block.text,true)
    }
  }
  const content=[...blocks].sort(([a],[b])=>a-b).map(([,b])=>({type:b.type,text:b.parts.join('')})).filter(b=>b.text)
  if(!content.length)return undefined
  return {schema:'agent.transcript.v1',kind:'assistant-attempt',turn:event.data.turn,step:event.data.step,
    message:{id:'agent-attempt-'+event.seq,role:'assistant',content}}
}

/** First actual token's original timestamp, without expanding compact runs. */
export function firstCompactTokenTime(stream: unknown): number | undefined {
  if(!Array.isArray(stream))return undefined
  for(const record of stream) {
    if(record.type==='chunk') {
      const c=record.chunk || {}
      if((c.type==='text-delta'||c.type==='reasoning-delta')&&c.text || c.type==='tool-call-delta'&&(c.argumentsDelta||c.name!==undefined))return record.time
    }else if(['text-chunks','reasoning-chunks','tool-call-chunks'].includes(record.type)) {
      const texts=record.texts || record.args || []
      let time=record.time0
      for(let i=0;i<texts.length;i++) {
        if(i)time+=record.dt?.[i-1] || 0
        if(texts[i] || record.type==='tool-call-chunks'&&record.name!==undefined)return time
      }
    }
  }
  return undefined
}

export class AssistantStreamCompatibility {
  private revision: number | undefined
  private attempt = ''
  private index = 0
  private blocks = new Set<number>()
  constructor(private readonly emit: (event: Row) => void) {}
  private reset(): void {
    // Released clients understand block-end, but not stream-reset yet.
    for (const index of this.blocks) this.emit({ type: 'assistant/chunk', data: {
      chunk: { type: 'block-end', index, block: { type: 'text', text: '' } },
    } })
    this.blocks.clear()
    this.emit({ type: 'agent/stream-reset', data: {} })
  }
  private chunk(chunk: Row, time?: number): void {
    if (!chunk || typeof chunk.type !== 'string') throw new Error('Invalid assistant stream chunk')
    const index = Number.isSafeInteger(chunk.index) ? chunk.index : 0
    if (index < 0 || index > 4096) throw new Error('Invalid assistant block index')
    this.blocks.add(index)
    this.emit({ type: 'assistant/chunk', ...(time === undefined ? {} : { time }), data: { chunk } })
  }
  baseline(value?: Row): void {
    if (!value) return // Older RCs retain durable assistant/chunk events.
    this.reset()
    this.revision = value.revision
    const active = value.activeAttempt
    this.attempt = active?.attemptId || ''
    this.index = active?.nextIndex || 0
    for (const entry of active?.stream || []) {
      if (entry.type === 'chunk') this.chunk(entry.chunk, entry.time)
      else if (entry.type === 'text-chunks' || entry.type === 'reasoning-chunks') {
        if (!Array.isArray(entry.texts) || !entry.texts.every((text:unknown)=>typeof text==='string')) throw new Error('Invalid assistant baseline')
        this.chunk({type:entry.type==='text-chunks'?'text-delta':'reasoning-delta',index:entry.index,text:entry.texts.join('')},entry.time0)
      }
    }
  }
  follow(frame: Row): void {
    if (!frame || !Number.isSafeInteger(frame.revision)
      || frame.revision !== (this.revision ?? 0) + 1) throw new Error('Assistant stream revision gap')
    this.revision = frame.revision
    if (frame.type === 'start') {
      this.reset()
      this.attempt = frame.attemptId
      this.index = 0
    } else if (frame.type === 'chunk' || frame.type === 'end') {
      if (frame.attemptId !== this.attempt || frame.index !== this.index) throw new Error('Assistant stream attempt/index gap')
      if (frame.type === 'chunk') { this.chunk(frame.chunk, frame.time); this.index++ }
      else {
        if (frame.outcome?.kind === 'abandoned') this.reset()
        this.attempt = ''
        this.blocks.clear()
      }
    }
  }
}
