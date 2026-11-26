import assert from 'node:assert/strict'
import { stat } from 'node:fs/promises'
import { setTimeout as delay } from 'node:timers/promises'

// Source release invalidates access immediately and schedules disk cleanup.
// Assert eventual removal, not a filesystem scheduling deadline of 30–40 ms.
export async function assertArchiveRemoved(file, timeoutMs = 5000) {
  const started = performance.now()
  while (true) {
    try { await stat(file) }
    catch (error) {
      if (error.code !== 'ENOENT') throw error
      return Math.ceil(performance.now() - started)
    }
    assert(performance.now() - started < timeoutMs, 'released archive remained after the cleanup deadline')
    await delay(20)
  }
}
