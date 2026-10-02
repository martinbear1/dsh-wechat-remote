import { randomBytes } from 'node:crypto'
import { lstat, mkdir, open, readFile, readdir, realpath, rename } from 'node:fs/promises'
import path from 'node:path'
import { assertScope, copy, exact, fail, identifier, plain, row, sameScope, scopeValid, type WorkflowScope } from './data.js'
import { sameTaskRef, type HumanTaskRef } from '../human-tools/protocol.js'
import { ReceiverKeyring } from './receiver-keyring.js'
import { canonicalSubmission, decryptSubmission, sha256, submissionAnswers, submissionContext, submissionEnvelope,
  submissionManifest, SUBMISSION_CIPHER_MAX, type SubmissionContext, type SubmissionEnvelope, type SubmissionManifest, type SubmissionAnswers } from './submission-crypto.js'

interface Receipt {
  schema: 'human.receiver.receipt.v1'; nodeId: string; origin: WorkflowScope; context: SubmissionContext
  envelope: SubmissionEnvelope; manifest: SubmissionManifest; receivedAt: number; acked: boolean
  claimId?: string
}
export interface ReceiverDelivery {
  claimId: string; leaseExpiresAt: number; submissionId: string; version: number
  context: SubmissionContext; envelope: SubmissionEnvelope; values: SubmissionAnswers; download: unknown
}
export interface ReceiverOptions {
  root: string; nodeId: string; keys: ReceiverKeyring; assertIdentity(): void
  download(ticket: unknown, bytes: number, signal: AbortSignal): Promise<Uint8Array>
  validateImage(image: Uint8Array, mediaType: 'image/png' | 'image/jpeg'): Promise<void>
  ack(origin: WorkflowScope, taskRef: HumanTaskRef, delivery: ReceiverDelivery, signal: AbortSignal): Promise<unknown>
  maxBytes?: number; maxItems?: number; now?: () => number
}
const keyOf = (context: SubmissionContext) => sha256(canonicalSubmission(context))
async function syncDirectory(dir: string): Promise<void> {
  if (process.platform === 'win32') return // file fsync+rename; no portable Windows directory fsync.
  const file = await open(dir, 'r'); try { await file.sync() } finally { await file.close() }
}
async function writeNew(filename: string, value: string | Uint8Array): Promise<void> {
  const file = await open(filename, 'wx', 0o600)
  try { await file.writeFile(value); await file.sync() } finally { await file.close() }
}
/** Ciphertext is the retained original. A committed directory contains both
 * the exact object and its durable receipt. There is no second index whose
 * transaction could falsely declare a missing file delivered. */
export class SubmissionReceiver {
  private readonly lifetime = new AbortController()
  private tail: Promise<unknown> = Promise.resolve()
  private root = ''
  private constructor(private readonly options: ReceiverOptions) {}
  static async open(options: ReceiverOptions): Promise<SubmissionReceiver> {
    if (!identifier(options.nodeId) || !path.isAbsolute(options.root)) throw fail('receiver-path-invalid', '收件根目录无效')
    const receiver = new SubmissionReceiver(options)
    await mkdir(options.root, { recursive: true, mode: 0o700 })
    receiver.root = await realpath(options.root)
    if ((await lstat(options.root)).isSymbolicLink() || path.resolve(options.root) !== receiver.root) throw fail('receiver-path-invalid', '收件目录不可重定向')
    await receiver.recover(); return receiver
  }
  private check(signal?: AbortSignal): void { this.lifetime.signal.throwIfAborted(); signal?.throwIfAborted(); this.options.assertIdentity() }
  private serial<T>(work: () => Promise<T>): Promise<T> {
    const result = this.tail.then(() => { this.check(); return work() }); this.tail = result.catch(() => {}); return result
  }
  private async directory(name: string): Promise<string> {
    if (!/^(?:[a-f0-9]{64}|\.stage-[a-f0-9]{64}-[a-f0-9]{24})$/.test(name)) throw fail('receiver-path-invalid', '收件路径无效')
    if ((await lstat(this.root)).isSymbolicLink() || await realpath(this.root) !== this.root) throw fail('receiver-path-invalid', '收件目录已变化')
    const dir = path.join(this.root, name), stat = await lstat(dir)
    if (!stat.isDirectory() || stat.isSymbolicLink() || await realpath(dir) !== dir) throw fail('receiver-path-invalid', '收件路径不可重定向')
    return dir
  }
  private async readReceipt(dir: string): Promise<Receipt> {
    const file = path.join(dir, 'receipt.json'), stat = await lstat(file)
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 64 * 1024) throw fail('receiver-store-invalid', '持久收件记录无效')
    let raw: unknown
    try { raw = JSON.parse(await readFile(file, 'utf8')) } catch { throw fail('receiver-store-invalid', '持久收件记录不可读取') }
    if (!row(raw) || !exact(raw, ['schema', 'nodeId', 'origin', 'context', 'envelope', 'manifest', 'receivedAt', 'acked'], ['claimId'])
      || raw.schema !== 'human.receiver.receipt.v1' || raw.nodeId !== this.options.nodeId || !scopeValid(raw.origin)
      || raw.origin.nodeId !== this.options.nodeId || !Number.isSafeInteger(raw.receivedAt) || Number(raw.receivedAt) < 0 || typeof raw.acked !== 'boolean'
      || raw.claimId !== undefined && !identifier(raw.claimId))
      throw fail('receiver-store-invalid', '持久收件记录不属于此节点')
    const context = submissionContext(raw.context), envelope = submissionEnvelope(raw.envelope), manifest = submissionManifest(raw.manifest)
    if (envelope.keyId !== context.keyId || canonicalSubmission(manifest.context) !== canonicalSubmission(context)) throw fail('receiver-store-invalid', '持久收件关联无效')
    return { ...raw, context, envelope, manifest } as unknown as Receipt
  }
  private async bytes(dir: string, receipt: Receipt): Promise<Uint8Array> {
    const filename = path.join(dir, 'payload.box'), stat = await lstat(filename)
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size !== receipt.envelope.cipherBytes || stat.size > SUBMISSION_CIPHER_MAX)
      throw fail('receiver-store-invalid', '已接收附件缺失或大小不符，未发送交付确认')
    return readFile(filename)
  }
  private async verified(dir: string, receipt: Receipt) {
    const decoded = decryptSubmission(await this.bytes(dir, receipt), receipt.envelope,
      this.options.keys.secret(receipt.context.keyId, receipt.context.bindingKey), receipt.context, receipt.manifest.answers)
    if (canonicalSubmission(decoded.manifest) !== canonicalSubmission(receipt.manifest)) throw fail('receiver-store-invalid', '收件记录与密文清单不符')
    return decoded
  }
  private async recover(): Promise<void> {
    this.check(); const entries = await readdir(this.root)
    if (entries.length > (this.options.maxItems ?? 512) * 2) throw fail('receiver-capacity', '收件目录条目已达到上限')
    for (const name of entries) {
      const dir = await this.directory(name)
      if (!name.startsWith('.stage-')) { const receipt = await this.readReceipt(dir); if (keyOf(receipt.context) !== name) throw fail('receiver-store-invalid', '收件记录路径不匹配'); continue }
      // A crash after both fsyncs but before rename is recoverable. Partial
      // stages remain unacknowledged and counted against disk capacity.
      try {
        const receipt = await this.readReceipt(dir)
        await this.verified(dir, receipt)
        const target = path.join(this.root, keyOf(receipt.context))
        try { await lstat(target) } catch (cause) {
          if ((cause as NodeJS.ErrnoException).code !== 'ENOENT') throw cause
          await rename(dir, target); await syncDirectory(this.root)
        }
      } catch { /* Incomplete or invalid stages never become received facts. */ }
    }
    this.check()
  }
  private async capacity(extra: number): Promise<void> {
    const entries = await readdir(this.root); let bytes = extra
    if (entries.length >= (this.options.maxItems ?? 512)) throw fail('receiver-capacity', '本地收件数量已达上限，云端尚未确认交付')
    for (const name of entries) {
      const dir = await this.directory(name)
      for (const child of await readdir(dir)) {
        if (!/^(?:payload\.box|receipt\.json(?:\.[a-f0-9]{24}\.tmp)?)$/.test(child)) throw fail('receiver-store-invalid', '收件目录存在未知文件')
        const stat = await lstat(path.join(dir, child)); if (!stat.isFile() || stat.isSymbolicLink()) throw fail('receiver-path-invalid', '收件文件不可重定向')
        bytes += stat.size
      }
    }
    if (bytes > (this.options.maxBytes ?? 1024 * 1024 * 1024)) throw fail('receiver-capacity', '本地收件空间预算不足，未确认云端交付')
  }
  receive(origin: WorkflowScope, taskRef: HumanTaskRef, bindingKey: string, raw: unknown, signal: AbortSignal): Promise<unknown> {
    return this.serial(async () => {
      const active = AbortSignal.any([signal, this.lifetime.signal]); this.check(active); assertScope(origin, this.options.nodeId)
      if (!row(raw) || !identifier(raw.claimId) || !Number.isSafeInteger(raw.leaseExpiresAt) || Number(raw.leaseExpiresAt) <= (this.options.now ?? Date.now)())
        throw fail('receiver-claim-invalid', '收件租约无效或已过期')
      const context = submissionContext(raw.context), envelope = submissionEnvelope(raw.envelope), values = submissionAnswers(raw.values)
      if (!sameTaskRef(context.taskRef, taskRef) || context.bindingKey !== bindingKey || raw.submissionId !== context.submissionId || raw.version !== context.version)
        throw fail('receiver-claim-invalid', '提交不属于指定任务或接收绑定')
      const delivery = { ...raw, context, envelope, values } as unknown as ReceiverDelivery
      const name = keyOf(context), destination = path.join(this.root, name)
      let receipt: Receipt | undefined
      try { receipt = await this.readReceipt(await this.directory(name)) } catch (cause) { if ((cause as NodeJS.ErrnoException).code !== 'ENOENT') throw cause }
      if (receipt) {
        if (!sameScope(receipt.origin, origin) || canonicalSubmission(receipt.envelope) !== canonicalSubmission(envelope)
          || canonicalSubmission(receipt.manifest.answers) !== canonicalSubmission(values)) throw fail('receiver-conflict', '已接收版本不能被替换')
        await this.verified(destination, receipt)
      } else {
        await this.capacity(envelope.cipherBytes + 64 * 1024)
        const cipher = await this.options.download(delivery.download, envelope.cipherBytes, active); this.check(active)
        const decoded = decryptSubmission(cipher, envelope, this.options.keys.secret(context.keyId, bindingKey), context, values)
        await this.options.validateImage(decoded.image, decoded.manifest.file.mediaType); this.check(active)
        const stageName = `.stage-${name}-${randomBytes(12).toString('hex')}`, stage = path.join(this.root, stageName)
        await mkdir(stage, { mode: 0o700 }); await this.directory(stageName)
        await writeNew(path.join(stage, 'payload.box'), cipher)
        receipt = { schema: 'human.receiver.receipt.v1', nodeId: this.options.nodeId, origin: copy(origin), context, envelope,
          manifest: decoded.manifest, receivedAt: (this.options.now ?? Date.now)(), acked: false, claimId: delivery.claimId }
        await writeNew(path.join(stage, 'receipt.json'), JSON.stringify(receipt)); await syncDirectory(stage)
        this.check(active); await rename(stage, destination); await syncDirectory(this.root)
      }
      this.check(active)
      if (receipt.claimId !== delivery.claimId) { receipt.claimId = delivery.claimId; await this.saveReceipt(destination, receipt) }
      // The disk receipt is authoritative before this network operation. A
      // lost response repeats only ACK, never download, model run, or publish.
      const answer = await this.options.ack(origin, taskRef, delivery, active); this.check(active)
      if (!row(answer) || !row(answer.delivery) || answer.delivery.state !== 'received' || answer.delivery.submissionId !== context.submissionId
        || answer.delivery.version !== context.version || answer.delivery.manifestDigest !== envelope.manifestDigest
        || answer.delivery.cipherDigest !== envelope.cipherDigest) throw fail('receiver-ack-invalid', '云端尚未确认持久收件回执')
      await this.saveReceipt(destination, { ...receipt, acked: true })
      this.check(active)
      return { submissionId: context.submissionId, version: context.version, state: 'received', artifactRef: name }
    })
  }
  private async saveReceipt(destination: string, receipt: Receipt) {
    const temporary = path.join(destination, `receipt.json.${randomBytes(12).toString('hex')}.tmp`)
    await writeNew(temporary, JSON.stringify(receipt)); await rename(temporary, path.join(destination, 'receipt.json')); await syncDirectory(destination)
  }
  /** Restore only ACK authority from a complete local original, never a new
   * download ticket. Older receipts without claimId remain compatible but do
   * not invent proof. All bytes and bound fields are verified before the call. */
  recoverReceipt(origin: WorkflowScope, taskRef: HumanTaskRef, bindingKey: string, submissionId: string, version: number,
    claim: (proof: { claimId: string; version: number; manifestDigest: string; cipherDigest: string }) => Promise<unknown>, signal: AbortSignal): Promise<boolean> {
    return this.serial(async () => {
      this.check(signal); assertScope(origin, this.options.nodeId)
      for (const name of await readdir(this.root)) {
        if (!/^[a-f0-9]{64}$/.test(name)) continue
        const dir = await this.directory(name), receipt = await this.readReceipt(dir), context = receipt.context
        if (context.submissionId !== submissionId || context.version !== version || context.bindingKey !== bindingKey
          || !sameScope(receipt.origin, origin) || !sameTaskRef(context.taskRef, taskRef)) continue
        if (!receipt.claimId) return false
        await this.verified(dir, receipt); this.check(signal)
        const proof = { claimId: receipt.claimId, version, manifestDigest: receipt.envelope.manifestDigest, cipherDigest: receipt.envelope.cipherDigest }
        const result = await claim(proof); this.check(signal)
        if (!row(result) || !row(result.delivery)) throw fail('receiver-ack-invalid', '持久收件恢复结果无效')
        const delivery = result.delivery
        if (delivery.submissionId !== submissionId || delivery.version !== version || delivery.manifestDigest !== proof.manifestDigest || delivery.cipherDigest !== proof.cipherDigest)
          throw fail('receiver-ack-invalid', '持久收件恢复版本不符')
        if (delivery.state !== 'received') {
          if (delivery.state !== 'receipt-only' || delivery.claimId !== proof.claimId || !Number.isSafeInteger(delivery.leaseExpiresAt)
            || Number(delivery.leaseExpiresAt) <= (this.options.now ?? Date.now)() || delivery.download !== undefined) throw fail('receiver-ack-invalid', '持久收件恢复租约无效')
          const answer = await this.options.ack(origin, taskRef, { claimId: proof.claimId, leaseExpiresAt: Number(delivery.leaseExpiresAt), submissionId, version,
            context, envelope: receipt.envelope, values: receipt.manifest.answers, download: undefined }, signal)
          if (!row(answer) || !row(answer.delivery) || answer.delivery.state !== 'received' || answer.delivery.submissionId !== submissionId || answer.delivery.version !== version
            || answer.delivery.manifestDigest !== proof.manifestDigest || answer.delivery.cipherDigest !== proof.cipherDigest) throw fail('receiver-ack-invalid', '云端尚未确认持久收件恢复')
        }
        this.check(signal); await this.saveReceipt(dir, { ...receipt, acked: true }); return true
      }
      return false
    })
  }
  read(origin: WorkflowScope, submissionId: string, bindingKey: string, signal: AbortSignal) {
    return this.serial(async () => {
      this.check(signal); assertScope(origin, this.options.nodeId)
      if (!identifier(submissionId) || !/^[a-f0-9]{64}$/.test(bindingKey)) throw fail('receiver-reference-invalid', '收件引用无效')
      for (const name of await readdir(this.root)) {
        if (!/^[a-f0-9]{64}$/.test(name)) continue
        const dir = await this.directory(name), receipt = await this.readReceipt(dir)
        if (receipt.context.submissionId !== submissionId || receipt.context.bindingKey !== bindingKey || !sameScope(receipt.origin, origin)) continue
        const result = await this.verified(dir, receipt); this.check(signal)
        return { ...result, artifactRef: name, receivedAt: receipt.receivedAt }
      }
      throw fail('submission-not-received', '此会话的提交尚未可靠接收到本机')
    })
  }
  close(): Promise<void> { this.lifetime.abort(); return this.tail.then(() => {}) }
}
