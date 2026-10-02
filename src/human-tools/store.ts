import { mkdir, open, rename, unlink } from 'node:fs/promises'
import { dirname } from 'node:path'
import { randomBytes } from 'node:crypto'
import type { HumanLedger, HumanStore } from './core.js'

/** Dedicated plugin-owned state, never credentials or a copy of native history. */
export class HumanFileStore implements HumanStore {
  constructor(private readonly file: string) {}
  async load(): Promise<unknown> {
    try {
      const file = await open(this.file, 'r')
      try {
        if ((await file.stat()).size > 1024 * 1024) throw new Error('测试卡片账本过大，未加载')
        return JSON.parse(await file.readFile('utf8'))
      } finally { await file.close() }
    } catch (cause) {
      if ((cause as NodeJS.ErrnoException).code === 'ENOENT') return { schemaVersion: 1, records: [] }
      throw cause
    }
  }
  async save(ledger: HumanLedger): Promise<void> {
    const data = JSON.stringify(ledger)
    if (Buffer.byteLength(data) > 1024 * 1024) throw new Error('测试卡片账本达到大小上限')
    await mkdir(dirname(this.file), { recursive: true, mode: 0o700 })
    const temporary = `${this.file}.${process.pid}.${randomBytes(6).toString('hex')}.tmp`
    try {
      const handle = await open(temporary, 'wx', 0o600)
      try { await handle.writeFile(data); await handle.sync() }
      finally { await handle.close() }
      await rename(temporary, this.file)
      // Directory fsync is not supported by Windows. File sync above is strict;
      // on POSIX also make the rename durable, not merely the file contents.
      if (process.platform !== 'win32') {
        const directory = await open(dirname(this.file), 'r')
        try { await directory.sync() } finally { await directory.close() }
      }
    } finally {
      try { await unlink(temporary) } catch (cause) { if ((cause as NodeJS.ErrnoException).code !== 'ENOENT') throw cause }
    }
  }
}
