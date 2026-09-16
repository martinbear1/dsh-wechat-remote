import { createRequire } from 'node:module'
import { realpathSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import { firstCompactTokenTime } from './assistant-stream-compat.js'

type Value = Record<string, any>
type UsageFold = (events: readonly Value[]) => Value | undefined
const record = (v: unknown): Value => v && typeof v === 'object' && !Array.isArray(v) ? v as Value : {}
const number = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0
const fields = (v: Value, names: string[][]): Value => Object.fromEntries(names.flatMap(([from, to]) => number(v[from]) ? [[to, v[from]]] : []))

let nativeUsage: Promise<UsageFold | undefined> | undefined
/** Resolve the running host's public contract, never another bundled DSH version.
 * Older hosts have no export: omit exact usage rather than inventing accounting. */
export function nativeTurnUsage(): Promise<UsageFold | undefined> {
  return nativeUsage ??= (async () => {
    try {
      // npm's POSIX dsh command (and npx .bin entry) may be a symlink.
      // Resolve from the actual host entry, not the shim's directory, cwd,
      // another global installation, or the adapter's own dependencies.
      const require = createRequire(realpathSync(process.argv[1]))
      const module = await import(pathToFileURL(require.resolve('@deepseek-ai/dsh-token-meter/client')).href)
      return typeof module.deriveTurnTokenUsage === 'function' ? module.deriveTurnTokenUsage : undefined
    } catch { return undefined }
  })()
}

/** Timing follows DSH's assistant-step readings: first nonempty token delta,
 * first settled step TTFT, and summed sampled output / summed decode time. */
function timing(events: Value[], start: Value, end: Value): Value {
  const result: Value = {}
  if (number(start.time) && number(end.time) && end.time >= start.time) result.elapsedMs = end.time - start.time
  let open: Value | undefined, firstStep = Infinity, firstTokenMs: number | undefined
  let decodeMs = 0, output = 0
  for (const event of events) {
    const data = record(event.data)
    if (event.type === 'step/start') open = { step: data.step, time: event.time }
    else if (event.type === 'assistant/chunk' && open && open.step === data.step) {
      const chunk = record(data.chunk)
      const token = (chunk.type === 'text-delta' || chunk.type === 'reasoning-delta') && !!chunk.text
        || chunk.type === 'tool-call-delta' && (!!chunk.argumentsDelta || chunk.name !== undefined)
      if (token && open.first === undefined && number(event.time)) open.first = event.time
    } else if (event.type === 'assistant/message') {
      // V3 no longer has durable assistant/chunk events. Their original times
      // live inside the settled attempt; never substitute socket arrival time.
      const compactFirst=firstCompactTokenTime(data.stream)
      if(open && open.step===data.step && open.first===undefined && number(compactFirst) && compactFirst>=open.time)open.first=compactFirst
      // An untimed lowest step makes first-token latency unavailable too.
      if (number(data.step) && data.step < firstStep) {
        firstStep = data.step
        firstTokenMs = open && open.step === data.step && number(open.time) && number(open.first)
          ? Math.max(0, open.first - open.time) : undefined
      }
      if (open && open.step === data.step && number(open.first) && number(event.time) && number(data.usage?.outputTokens)) {
        decodeMs += Math.max(0, event.time - open.first)
        output += data.usage.outputTokens
      }
      open = undefined
    } else if (event.type === 'step/end') open = undefined
  }
  if (firstTokenMs !== undefined) result.firstTokenMs = firstTokenMs
  if (decodeMs > 0 && number(output / (decodeMs / 1000))) result.outputTokensPerSecond = output / (decodeMs / 1000)
  return result
}

/** Optional portable per-turn facet, attached to the final textual reply.
 * Read BEFORE transport compaction: retry usage and token timing need chunks.
 * Partial pages/running turns are intentionally not disclosed as complete. */
export function turnDetails(entries: readonly unknown[], usageFold?: UsageFold): Value[] {
  const turns = new Map<number, Value[]>()
  for (const entry of entries) {
    const event = record(record(entry).event), turn = record(event.data).turn
    if (!Number.isSafeInteger(turn) || turn < 0) continue
    const group = turns.get(turn) ?? []
    group.push(event); turns.set(turn, group)
  }
  const details: Value[] = []
  for (const [turn, events] of turns) {
    const starts = events.filter(e => e.type === 'turn/start'), ends = events.filter(e => e.type === 'turn/end')
    if (starts.length !== 1 || ends.length !== 1 || events[0] !== starts[0] || events.at(-1) !== ends[0]) continue
    const closing = [...events].reverse().find(e => e.type === 'assistant/message' && typeof e.data?.message?.id === 'string'
      && Array.isArray(e.data.message.content) && e.data.message.content.some((b: Value) => b.type === 'text' && typeof b.text === 'string' && b.text.trim()))
    if (!closing) continue
    const value: Value = { turnId: String(turn), messageId: closing.data.message.id }
    const time = timing(events, starts[0], ends[0])
    if (Object.keys(time).length) value.timing = time
    // Accounting failure must not take down the history reader.
    let usage: Value | undefined
    try { usage = usageFold?.(events) } catch { /* unavailable native reading */ }
    if (usage && number(usage.totalTokens)) {
      value.usage = fields(usage, [['totalTokens','total'], ['uncachedInputTokens','input'], ['outputTokens','output'], ['cacheReadTokens','cacheRead'], ['cacheWriteTokens','cacheWrite'], ['reasoningTokens','reasoning']])
      if (Array.isArray(usage.routes)) value.usage.models = usage.routes.map(r => record(r)).filter(r => typeof r.provider === 'string' && typeof r.model === 'string').map(r => ({ provider: r.provider, model: r.model }))
    }
    if (value.usage || value.timing) details.push(value)
  }
  return details
}
