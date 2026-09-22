/** Bound host history work before allocating native pages or ZIP buffers.
 * A cancelled queued reader never starts. An active reader keeps its slot
 * until its actual work settles, even if a native provider ignores abort. */
export class HistoryReadBudget {
  private active = 0
  private readonly waiting: { start(): void; cancel(): void }[] = []

  constructor(private readonly concurrency = 2, private readonly maxWaiting = 8) {
    if (!Number.isSafeInteger(concurrency) || concurrency < 1
      || !Number.isSafeInteger(maxWaiting) || maxWaiting < 0) throw new Error('Invalid history read budget')
  }

  async acquire(signal: AbortSignal): Promise<() => void> {
    signal.throwIfAborted()
    if (this.active < this.concurrency) return this.claim()
    if (this.waiting.length >= this.maxWaiting) {
      throw Object.assign(new Error('历史读取繁忙，请稍后重试'), { code: 'history-busy' })
    }
    return new Promise((resolve, reject) => {
      const entry = {
        start: () => {
          signal.removeEventListener('abort', entry.cancel)
          resolve(this.claim())
        },
        cancel: () => {
          const index = this.waiting.indexOf(entry)
          if (index < 0) return
          this.waiting.splice(index, 1)
          signal.removeEventListener('abort', entry.cancel)
          reject(signal.reason)
        },
      }
      this.waiting.push(entry)
      signal.addEventListener('abort', entry.cancel, { once: true })
    })
  }

  private claim(): () => void {
    this.active += 1
    let released = false
    return () => {
      if (released) return
      released = true
      this.active -= 1
      this.waiting.shift()?.start()
    }
  }
}
