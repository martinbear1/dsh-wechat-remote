import { parentPort, workerData } from 'node:worker_threads'
import { parseHistorySource } from './source.js'

// The archive is data, never code. Parsing large account exports happens away
// from DSH's event loop; only this short-lived worker sees the complete input.
try {
  const source = await parseHistorySource(Buffer.from(workerData))
  const bytes = Buffer.byteLength(JSON.stringify(source))
  if (bytes > 64 * 1024 * 1024) throw new Error('source-too-large')
  parentPort?.postMessage({ source, bytes })
} catch (error) {
  const code = typeof (error as { code?: unknown })?.code === 'string' ? (error as { code: string }).code : 'invalid-source'
  parentPort?.postMessage({ error: code })
}
