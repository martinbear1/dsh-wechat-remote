import { Worker } from 'node:worker_threads'
import type { HistorySource, HistoryConversation } from './source.js'

export function parseImportSource(data: Buffer, signal: AbortSignal, sourceKind?: 'share'): Promise<{ source: HistorySource; bytes: number }> {
  return parserWorker({ data, sourceKind }, signal, sourceKind) as Promise<{ source: HistorySource; bytes: number }>
}
export function parseImportArchive(file: string, signal: AbortSignal): Promise<{ source: HistorySource; bytes: number }> {
  return parserWorker({ file }, signal) as Promise<{ source: HistorySource; bytes: number }>
}
export async function parseImportConversation(file: string, id: string, signal: AbortSignal): Promise<HistoryConversation> {
  return (await parserWorker({ file, id, action: 'conversation' }, signal)).conversation
}
export async function parseImportImage(file: string, entry: string, signal: AbortSignal): Promise<Uint8Array> {
  return (await parserWorker({ file, entry, action: 'image' }, signal)).image
}
function parserWorker(workerData: Record<string, unknown>, signal: AbortSignal, sourceKind?: 'share'): Promise<any> {
  // A shared overall deadline can expire while this worker is running. Keep
  // it distinct from an explicit cancel, without exposing the raw reason.
  const abortError = () => new Error(signal.reason?.name === 'TimeoutError'
    ? sourceKind === 'share' ? 'share-timeout' : 'parse-timeout' : 'cancelled')
  if (signal.aborted) throw abortError()
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./source-worker.js', import.meta.url), {
      // Do not inherit a host CLI's --input-type/debug/loader flags. This
      // data-only worker needs only Node's built-in modules and our parser.
      workerData, execArgv: [], resourceLimits: { maxOldGenerationSizeMb: 256, maxYoungGenerationSizeMb: 32 },
    })
    let finished = false
    const complete = (error?: Error, value?: unknown) => {
      if (finished) return
      finished = true; clearTimeout(timer); signal.removeEventListener('abort', abort)
      void worker.terminate().catch(() => {})
      if (error) reject(error); else resolve(value!)
    }
    const abort = () => complete(abortError())
    const timer = setTimeout(() => complete(new Error('parse-timeout')), workerData.file ? 120_000 : 20_000)
    timer.unref()
    worker.once('message', value => (value?.source && Number.isSafeInteger(value.bytes)) || value?.conversation || value?.image
      ? complete(undefined, value) : complete(Object.assign(new Error(value?.error || 'invalid-source'),
        { actualBytes: value?.actualBytes, limitBytes: value?.limitBytes, diagnostic: value?.diagnostic })))
    worker.once('error', () => complete(new Error('parse-unavailable')))
    worker.once('exit', () => { if (!finished) complete(new Error('parse-unavailable')) })
    signal.addEventListener('abort', abort, { once: true })
    if (signal.aborted) abort()
  })
}
