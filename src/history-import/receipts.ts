import { promises as fs } from 'node:fs'
import path from 'node:path'
import { randomUUID } from 'node:crypto'

export type ImportState = 'pending' | 'succeeded' | 'uncertain' | 'failed'
export interface ImportReceipt {
  schema: 1
  operationId: string
  sessionId: string
  workspaceId: string
  presetId?: string
  sourceHash: string
  conversationId: string
  branchId: string
  state: ImportState
  createdAt: number
  message?: string
}
export function operationIdentifier(value: unknown): string {
  if (typeof value !== 'string' || !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(value)) throw new Error('invalid-operation')
  return value
}
/** Only import intentions/receipts, never conversation bodies or host state.
 * A corrupt/incomplete intention is NOT permission to create the session again. */
export class ImportReceipts {
  constructor(private readonly directory: string) {}
  private file(id: string): string { return path.join(this.directory, operationIdentifier(id) + '.json') }
  async read(id: string): Promise<ImportReceipt | undefined> {
    const file = this.file(id)
    try {
      const stat = await fs.lstat(file)
      if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 8192) throw new Error('receipt-unavailable')
      const value = JSON.parse(await fs.readFile(file, 'utf8')) as ImportReceipt
      if (value.schema !== 1 || value.operationId !== id || value.sessionId !== 'session-dsimport-' + id
        || !['pending', 'succeeded', 'uncertain', 'failed'].includes(value.state)
        || typeof value.workspaceId !== 'string' || !value.workspaceId || value.workspaceId.length > 256
        || typeof value.conversationId !== 'string' || typeof value.branchId !== 'string'
        || !/^[a-f0-9]{64}$/.test(value.sourceHash) || !Number.isFinite(value.createdAt)) throw new Error('receipt-unavailable')
      return value
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined
      throw new Error('receipt-unavailable')
    }
  }
  async claim(value: ImportReceipt): Promise<boolean> {
    const file = this.file(value.operationId)
    await fs.mkdir(this.directory, { recursive: true, mode: 0o700 })
    // No automatic deletion of old or uncertain receipts. Hitting this limit
    // blocks new imports only, not native sessions or any connection path.
    if ((await fs.readdir(this.directory)).filter(name => name.endsWith('.json')).length >= 1000) throw new Error('receipt-capacity')
    let handle
    try { handle = await fs.open(file, 'wx', 0o600) }
    catch (error) { if ((error as NodeJS.ErrnoException).code === 'EEXIST') return false; throw error }
    try { await handle.writeFile(JSON.stringify(value)); await handle.sync() }
    finally { await handle.close() }
    return true
  }
  async save(value: ImportReceipt): Promise<void> {
    const file = this.file(value.operationId), temporary = file + '.' + randomUUID() + '.tmp'
    const handle = await fs.open(temporary, 'wx', 0o600)
    try {
      try { await handle.writeFile(JSON.stringify(value)); await handle.sync() } finally { await handle.close() }
      await fs.rename(temporary, file)
    } finally { await fs.unlink(temporary).catch(() => {}) }
  }
}
