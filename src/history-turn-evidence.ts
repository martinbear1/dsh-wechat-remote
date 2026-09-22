import { firstCompactTokenTime } from './assistant-stream-compat.js'
import { TurnActivityCompatibility, mutationPath } from './turn-activity.js'
import { turnDetails } from './turn-presentation.js'

type Row = Record<string, any>
type Fact = { event: Row; mutation: string | null; firstToken?: number }
type Window = { from: number; through: number; facts: Map<number, { fact: Fact; json: string }>; bytes: number }
export interface HistoryTurnFacets { details: Row[]; activity: Row[] }
const MAX_EVENTS = 8192
const MAX_BYTES = 4 * 1024 * 1024
const MAX_SESSIONS = 8
const pick = (value: Row | undefined, names: string[]): Row => Object.fromEntries(
  names.filter(key => value?.[key] !== undefined).map(key => [key, value![key]]))

/** Keep only the native fields read by the two existing derivations. These
 * facts NEVER leave the host or replace persisted records. Bodies, credentials,
 * attachments and arbitrary metadata are not retained in this cache. */
function factOf(event: Row): Fact {
  const d = event.data || {}, data: Row = pick(d, ['turn', 'step', 'callId', 'name'])
  const message = (m: Row = {}) => ({ ...pick(m, ['id', 'role']),
    source: pick(m.source, ['kind', 'callId', 'provider', 'model']),
    content: [...new Map((Array.isArray(m.content) ? m.content : []).filter(Boolean).map((b: Row) => {
      const block = b.type === 'text' || b.type === 'reasoning'
        ? { type: b.type, text: typeof b.text === 'string' && b.text.trim() ? 'x' : '' }
        : { type: b.type, ...(b.type === 'tool-result' ? { isError: b.isError === true } : {}) }
      return [JSON.stringify(block), block]
    })).values()],
  })
  const usage = (v: Row) => pick(v, ['inputTokens', 'outputTokens', 'cacheReadTokens', 'cacheWriteTokens', 'reasoningTokens', 'totalTokens'])
  if (event.type === 'user/message') Object.assign(data, message(d))
  if (d.message) data.message = message(d.message)
  if (d.reason) data.reason = pick(d.reason, ['kind'])
  if (d.error) data.error = true
  if (d.usage) data.usage = usage(d.usage)
  // Native accounting uses only the last usage chunk of a compact attempt.
  // Keep that actual sample, not a sum of possibly repeated stream readings.
  if (Array.isArray(d.stream)) {
    const sample = d.stream.findLast((r: Row) => r.type === 'chunk' && r.chunk?.type === 'usage')
    if (sample) data.stream = [{ ...pick(sample, ['type', 'time']), chunk: { type: 'usage', usage: usage(sample.chunk.usage) } }]
  }
  if (event.type === 'assistant/chunk' || event.type === 'assistant/live-chunk') {
    const c = d.chunk || {}
    data.chunk = { ...pick(c, ['type', 'index', 'blockType', 'name']),
      ...(typeof c.text === 'string' ? { text: c.text.trim() ? 'x' : c.text ? ' ' : '' } : {}),
      ...(typeof c.argumentsDelta === 'string' ? { argumentsDelta: c.argumentsDelta ? 'x' : '' } : {}),
      ...(c.usage ? { usage: usage(c.usage) } : {}),
      ...(c.block ? { block: message({ content: [c.block] }).content[0] } : {}),
    }
  }
  return { event: { ...pick(event, ['seq', 'type', 'time', 'surfaceOp']), data },
    mutation: event.type === 'tool/call' ? mutationPath(d.name, d.arguments) : null,
    firstToken: firstCompactTokenTime(d.stream) }
}

/** Opportunistic, bounded evidence for ranges the phone has already asked to
 * read. No hidden I/O, no persisted index, no completeness across a gap. Cache
 * eviction can omit optional disclosures, never fabricate a full turn. */
export class HistoryTurnEvidence {
  private readonly sessions = new Map<string, Window>()
  clear(): void { this.sessions.clear() }
  accept(sessionId: string, entries: readonly Row[], usageFold?: Parameters<typeof turnDetails>[1]): HistoryTurnFacets {
    const none = { details: [], activity: [] }
    if (!entries.length) return none
    const from = entries[0].event?.seq, through = entries.at(-1)?.event?.seq
    if (!Number.isSafeInteger(from) || !Number.isSafeInteger(through)) return none
    const additions = entries.map(entry => { const fact = factOf(entry.event); return { fact, json: JSON.stringify(fact) } })
    let window = this.sessions.get(sessionId)
    if (window && (through + 1 < window.from || from > window.through + 1
      || additions.some(item => { const old = window!.facts.get(item.fact.event.seq); return old && old.json !== item.json }))) window = undefined
    window ??= { from, through, facts: new Map(), bytes: 0 }
    for (const item of additions) if (!window.facts.has(item.fact.event.seq)) {
      window.facts.set(item.fact.event.seq, item); window.bytes += Buffer.byteLength(item.json)
    }
    this.sessions.delete(sessionId)
    if (window.facts.size > MAX_EVENTS || window.bytes > MAX_BYTES) return none
    window.from = Math.min(window.from, from); window.through = Math.max(window.through, through)
    this.sessions.set(sessionId, window)
    while (this.sessions.size > MAX_SESSIONS || [...this.sessions.values()].reduce((sum, w) => sum + w.bytes, 0) > MAX_BYTES) {
      this.sessions.delete(this.sessions.keys().next().value!)
    }
    const facts = [...window.facts.values()].map(item => item.fact).sort((a, b) => a.event.seq - b.event.seq)
    const activity = new TurnActivityCompatibility(), facets: Row[] = [], firstTokens = new Map<number, number>()
    for (const fact of facts) {
      const view = activity.accept(fact.event, { mutationPath: fact.mutation })
      if (view) facets.push(view)
      if (fact.firstToken !== undefined) firstTokens.set(fact.event.seq, fact.firstToken)
    }
    return { activity: facets, details: turnDetails(facts.map(f => ({ event: f.event })), usageFold, firstTokens) }
  }
}
