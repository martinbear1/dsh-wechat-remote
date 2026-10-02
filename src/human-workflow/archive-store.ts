import { mkdir, lstat, readdir, realpath } from 'node:fs/promises'
import path from 'node:path'
import { WorkflowFileStore } from './persistence.js'
import { bounded, copy, exact, fail, row, type WorkflowDataStore } from './data.js'
import { canonicalSubmission, sha256 } from './submission-crypto.js'

export const WORKFLOW_LONG_TERM_BYTES = 64 * 1024 * 1024
export const WORKFLOW_ARCHIVE_MAX_RECORDS = 10000
const invalid = () => fail('workflow-archive-invalid', '工作流归档缺失或损坏；原文件已保留，不会丢弃防重依据')
/** Bounded immutable originals, with a small atomic hot index. This is physical
 * archival, not deletion: load reconstructs the exact authoritative ledger so
 * CAS and submission dedupe remain unchanged. Unknown/running jobs stay hot.
 * A crash before index commit may leave an orphan; it still counts toward quota.
 * No original, tombstone or received attachment is automatically deleted. */
export class WorkflowArchiveStore implements WorkflowDataStore {
  private readonly verified = new Set<string>()
  private constructor(private index: WorkflowDataStore, private root: string, private nodeId: string,
    private kind: 'analyses' | 'runs', private files: Map<string, number>, private maxBytes: number) {}
  static async open(options: { index: WorkflowDataStore; root: string; nodeId: string; kind: 'analyses' | 'runs'; maxBytes?: number }) {
    const root = path.resolve(options.root)
    await mkdir(root, { recursive: true, mode: 0o700 })
    if ((await lstat(root)).isSymbolicLink() || !((await lstat(root)).isDirectory())) throw invalid()
    const actual = await realpath(root), files = new Map<string, number>()
    const entries = await readdir(actual, { withFileTypes: true })
    if (entries.length > WORKFLOW_ARCHIVE_MAX_RECORDS) throw fail('workflow-archive-capacity', '归档记录数量已达到上限；未删除历史或防重依据')
    for (const entry of entries) {
      // Atomic-store temp files from an interrupted write are not published
      // records, but still count toward the total storage limit.
      if (!entry.isFile() || entry.isSymbolicLink() || !/^[a-f0-9]{64}\.json(?:\.[0-9]+\.[a-f0-9]+\.tmp)?$/.test(entry.name)) throw invalid()
      files.set(entry.name, (await lstat(path.join(actual, entry.name))).size)
    }
    const maxBytes = options.maxBytes ?? 128 * 1024 * 1024
    if (!Number.isSafeInteger(maxBytes) || maxBytes < 1 || maxBytes > 512 * 1024 * 1024) throw invalid()
    if ([...files.values()].reduce((a, b) => a + b, 0) > maxBytes) throw fail('workflow-archive-capacity', '归档容量已达到上限；未自动删除原始记录')
    return new WorkflowArchiveStore(options.index, actual, options.nodeId, options.kind, files, maxBytes)
  }
  private async checkRoot() {
    const info = await lstat(this.root)
    if (!info.isDirectory() || info.isSymbolicLink() || await realpath(this.root) !== this.root) throw invalid()
  }
  private async read(ref: string) {
    if (!/^[a-f0-9]{64}$/.test(ref)) throw invalid()
    await this.checkRoot()
    const target = path.join(this.root, `${ref}.json`), stat = await lstat(target)
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 64 * 1024) throw invalid()
    const value = await new WorkflowFileStore(target, 64 * 1024).load()
    if (!row(value) || !exact(value, ['schema', 'nodeId', 'kind', 'record']) || value.schema !== 'human.workflow.archive.v1'
      || value.nodeId !== this.nodeId || value.kind !== this.kind || sha256(canonicalSubmission(value)) !== ref) throw invalid()
    this.verified.add(ref)
    return value.record
  }
  async load(): Promise<unknown> {
    const value = await this.index.load()
    if (!row(value) || value.schema !== 'human.workflow.archive-index.v1') return value // legacy ledger
    if (!exact(value, ['schema', 'nodeId', 'kind', 'ledger']) || value.nodeId !== this.nodeId || value.kind !== this.kind
      || !row(value.ledger)) throw invalid()
    const source = value.ledger[this.kind]
    if (!Array.isArray(source) || source.length > WORKFLOW_ARCHIVE_MAX_RECORDS) throw invalid()
    const result = copy(value.ledger), records: unknown[] = []
    for (const record of source) {
      if (row(record) && exact(record, ['archiveRef']) && typeof record.archiveRef === 'string') records.push(await this.read(record.archiveRef))
      else records.push(copy(record))
    }
    result[this.kind] = records; bounded(result, WORKFLOW_LONG_TERM_BYTES); return result
  }
  async save(value: unknown): Promise<void> {
    if (!row(value) || value.nodeId !== this.nodeId || !Array.isArray(value[this.kind])) throw invalid()
    bounded(value, WORKFLOW_LONG_TERM_BYTES); await this.checkRoot()
    const result = copy(value), records = result[this.kind] as Record<string, unknown>[]
    const keep = this.kind === 'analyses' ? 128 : 512
    const candidates = records.map((record, index) => ({ record, index })).filter(({ record }) => this.kind === 'analyses'
      || ['succeeded', 'failed', 'cancelled'].includes(String(record.state)) && typeof record.messageId === 'string')
      .sort((a, b) => Number(b.record.updatedAt) - Number(a.record.updatedAt)).slice(keep)
    for (const { record, index } of candidates) {
      const payload = { schema: 'human.workflow.archive.v1', nodeId: this.nodeId, kind: this.kind, record }
      const ref = sha256(canonicalSubmission(payload)), name = `${ref}.json`, size = Buffer.byteLength(JSON.stringify(payload))
      if (size > 64 * 1024) throw invalid()
      if (this.files.has(name)) { if (!this.verified.has(ref)) await this.read(ref) }
      else {
        if (this.files.size >= WORKFLOW_ARCHIVE_MAX_RECORDS || [...this.files.values()].reduce((a, b) => a + b, 0) + size > this.maxBytes)
          throw fail('workflow-archive-capacity', '工作流归档已满；已停止新增记录，未删除历史、未知执行或原始附件')
        await new WorkflowFileStore(path.join(this.root, name), 64 * 1024).save(payload)
        this.files.set(name, size); this.verified.add(ref)
      }
      records[index] = { archiveRef: ref }
    }
    // Every immutable body is durable before its reference can be published.
    await this.index.save({ schema: 'human.workflow.archive-index.v1', nodeId: this.nodeId, kind: this.kind, ledger: result })
  }
}
