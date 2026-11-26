import { mkdtemp, mkdir, open, rm, readdir, lstat, readFile, writeFile, type FileHandle } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

/** A unique private directory owns exactly one archive file. Never accepts a
 * client path. The controller serializes operations on each upload. */
export class StagedArchive {
  offset = 0
  private handle?: FileHandle
  private directory?: string
  private disposed = false
  private queue: Promise<unknown> = Promise.resolve()
  private constructor(readonly size: number) {}
  static async create(size: number, root?: string): Promise<StagedArchive> {
    const value = new StagedArchive(size)
    if (root) {
      await mkdir(root, { recursive: true, mode: 0o700 })
      await cleanupAbandonedArchives(root)
    }
    value.directory = await mkdtemp(path.join(root || tmpdir(), 'dsh-history-archive-'))
    try {
      if (root) await writeFile(path.join(value.directory, 'owner.json'), JSON.stringify({ schema: 1, pid: process.pid, createdAt: Date.now() }), { flag: 'wx', mode: 0o600 })
      value.handle = await open(path.join(value.directory, 'source.zip'), 'wx+', 0o600); return value
    }
    catch (error) { await value.dispose(); throw error }
  }
  get file(): string { if (!this.directory || this.disposed) throw Error('expired'); return path.join(this.directory, 'source.zip') }
  async append(offset: number, bytes: Uint8Array): Promise<number> {
    const work = this.queue.then(async () => {
      if (this.disposed || !this.handle) throw Error('expired')
      if (!Number.isSafeInteger(offset) || offset < 0 || !bytes.length || offset + bytes.length > this.size || offset > this.offset) throw Error('invalid-chunk')
      if (offset < this.offset) {
        if (offset + bytes.length > this.offset) throw Error('invalid-chunk')
        const old = Buffer.alloc(bytes.length), result = await this.handle.read(old, 0, old.length, offset)
        if (result.bytesRead !== old.length || !old.equals(Buffer.from(bytes))) throw Error('invalid-chunk')
      } else {
        for (let done = 0; done < bytes.length;) { const result = await this.handle.write(bytes, done, bytes.length - done, offset + done); if (!result.bytesWritten) throw Error('invalid-chunk'); done += result.bytesWritten }
        this.offset += bytes.length
      }
      return this.offset
    })
    this.queue = work.catch(() => {})
    return work
  }
  async finish(): Promise<string> { await this.queue; if (this.disposed || !this.handle || this.offset !== this.size) throw Error('upload-incomplete'); await this.handle.sync(); return this.file }
  async dispose(): Promise<void> {
    this.disposed = true; await this.queue; await this.handle?.close().catch(() => {}); this.handle = undefined
    if (this.directory) await rm(this.directory, { recursive: true, force: true }).catch(() => {})
  }
}

/** Only directories carrying this module's marker beneath its dedicated
 * profile spool. A live process owns its files; crashes are reclaimed next use. */
export async function cleanupAbandonedArchives(root: string): Promise<void> {
  for (const entry of await readdir(root, { withFileTypes: true })) {
    if (!entry.isDirectory() || !/^dsh-history-archive-[A-Za-z0-9]{6}$/.test(entry.name)) continue
    const directory = path.join(root, entry.name), marker = path.join(directory, 'owner.json')
    try {
      const stat = await lstat(marker)
      if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 1024) continue
      const owner = JSON.parse(await readFile(marker, 'utf8'))
      if (owner?.schema !== 1 || !Number.isSafeInteger(owner.pid) || owner.pid < 1 || !Number.isSafeInteger(owner.createdAt) || owner.createdAt > Date.now()) continue
      try { process.kill(owner.pid, 0); continue } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ESRCH') continue }
      await rm(directory, { recursive: true, force: true })
    } catch { /* An incomplete/unknown directory is not ours to remove. */ }
  }
}
