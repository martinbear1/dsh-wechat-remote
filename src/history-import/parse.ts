import { Worker } from 'node:worker_threads'
import type { HistorySource } from './source.js'

export function parseImportSource(data: Buffer, signal: AbortSignal): Promise<{ source: HistorySource; bytes: number }> {
  signal.throwIfAborted()
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./source-worker.js', import.meta.url), {
      // Do not inherit a host CLI's --input-type/debug/loader flags. This
      // data-only worker needs only Node's built-in modules and our parser.
      workerData: data, execArgv: [], resourceLimits: { maxOldGenerationSizeMb: 256, maxYoungGenerationSizeMb: 32 },
    })
    let finished = false
    const complete = (error?: Error, value?: { source: HistorySource; bytes: number }) => {
      if (finished) return
      finished = true; clearTimeout(timer); signal.removeEventListener('abort', abort)
      void worker.terminate().catch(() => {})
      if (error) reject(error); else resolve(value!)
    }
    const abort = () => complete(new Error('cancelled'))
    const timer = setTimeout(() => complete(new Error('parse-timeout')), 20_000)
    timer.unref()
    worker.once('message', value => value?.source && Number.isSafeInteger(value.bytes)
      ? complete(undefined, value) : complete(new Error(value?.error || 'invalid-source')))
    worker.once('error', () => complete(new Error('parse-unavailable')))
    worker.once('exit', () => { if (!finished) complete(new Error('parse-unavailable')) })
    signal.addEventListener('abort', abort, { once: true })
    if (signal.aborted) abort()
  })
}
