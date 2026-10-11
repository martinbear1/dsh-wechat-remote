import { randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, rmdirSync, statSync } from 'node:fs'
import path from 'node:path'
import { writePrivateJsonAtomic } from '../secure-file.js'
import type { ILinkCredentials, ILinkMedia, ILinkPreparedMedia } from './ilink-types.js'
import { validateMedia, validatePreparedMedia, MEDIA_MAX_ITEMS } from './ilink-media.js'
import type { ClawbotSession } from './contracts.js'
import { ClawbotError } from './contracts.js'
import { REPLY_TEXT_MAX_BYTES, REPLY_MAX_TEXT_PARTS, REPLY_TOTAL_TEXT_MAX_BYTES, TEXT_PART_MAX_BYTES } from './reply-text.js'

export interface Receipt {
  id: string
  userId: string
  contextToken: string
  input: string
  media?: ILinkMedia[]
  target: ClawbotSession | null
  revision: number
  createdAt: number
  state: 'pending' | 'running' | 'ready' | 'sending' | 'done' | 'uncertain'
  output?: string
  parts?: (string | ILinkPreparedMedia)[]
  sentParts?: number
  /** Legacy RC32 question notice; retired once on upgrade, never recreated. */
  parentId?: string
}
export interface ClawbotData {
  version: 1
  revision: number
  enabled: boolean
  credentials: ILinkCredentials | null
  /** Entitlement owner only; never a Tencent credential or a phone claim. */
  accessBinding?: { nodeId: string; accountInstance: string }
  /** Preserve the identity and pending ledger when Tencent rejects its token. */
  authExpired?: boolean
  target: ClawbotSession | null
  cursor: string
  receipts: Receipt[]
}
export interface ClawbotStorage { read(): ClawbotData; write(data: ClawbotData): void; close(): void }
export const emptyClawbotData = (): ClawbotData => ({ version: 1, revision: 0, enabled: false, credentials: null, target: null, cursor: '', receipts: [] })
export function validateClawbotData(data: ClawbotData): void {
  const validTarget = (target: ClawbotSession | null) => target === null || target && typeof target.id === 'string'
    && target.id.length > 0 && target.id.length <= 256 && typeof target.title === 'string' && target.title.length <= 500
    && (target.generation === undefined || Number.isSafeInteger(target.generation))
    && (target.workspaceId === undefined || typeof target.workspaceId === 'string' && target.workspaceId.length <= 256)
    && (target.workspaceTitle === undefined || typeof target.workspaceTitle === 'string' && target.workspaceTitle.length <= 200)
  if (data.version !== 1 || !Number.isSafeInteger(data.revision) || data.revision < 0 || typeof data.enabled !== 'boolean'
    || data.accessBinding !== undefined && (!data.accessBinding || ![data.accessBinding.nodeId, data.accessBinding.accountInstance]
      .every(value => typeof value === 'string' && value.length > 0 && value.length <= 256))
    || data.authExpired !== undefined && typeof data.authExpired !== 'boolean'
    || typeof data.cursor !== 'string' || data.cursor.length > 65536 || !validTarget(data.target)
    || !Array.isArray(data.receipts) || data.receipts.length > 1000 || new Set(data.receipts.map(r => r?.id)).size !== data.receipts.length
    || data.receipts.some(r => !r || typeof r.id !== 'string' || !/^[a-f0-9]{64}$/.test(r.id) || typeof r.userId !== 'string'
      || typeof r.contextToken !== 'string' || typeof r.input !== 'string' || r.input.length > 8000 || !validTarget(r.target)
      || r.media !== undefined && (!Array.isArray(r.media) || !r.media.length || r.media.length > MEDIA_MAX_ITEMS || !r.media.every(validateMedia))
      || !Number.isSafeInteger(r.createdAt) || !Number.isSafeInteger(r.revision)
      || r.parentId !== undefined && (typeof r.parentId !== 'string' || !/^[a-f0-9]{64}$/.test(r.parentId) || r.parentId === r.id)
      || !['pending', 'running', 'ready', 'sending', 'done', 'uncertain'].includes(r.state)
      || r.output !== undefined && (typeof r.output !== 'string' || Buffer.byteLength(r.output) > REPLY_TEXT_MAX_BYTES)
      || r.parts !== undefined && (!Array.isArray(r.parts) || !r.parts.length || r.parts.length > REPLY_MAX_TEXT_PARTS + MEDIA_MAX_ITEMS
        || r.parts.some(p => typeof p === 'string' ? !p || Buffer.byteLength(p) > TEXT_PART_MAX_BYTES
          : !validatePreparedMedia(p) || p.userId !== r.userId || p.accountId !== data.credentials?.accountId)
        || r.parts.reduce((bytes, p) => bytes + (typeof p === 'string' ? Buffer.byteLength(p) : 0), 0) > REPLY_TOTAL_TEXT_MAX_BYTES
        || r.parts.filter(p => typeof p !== 'string').length > MEDIA_MAX_ITEMS
        || !Number.isSafeInteger(r.sentParts) || r.sentParts! < 0 || r.sentParts! >= r.parts.length)
      || !['done', 'uncertain'].includes(r.state) && r.parts === undefined && r.sentParts !== undefined && r.sentParts !== 0
      || r.state === 'ready' && r.parts === undefined && (typeof r.output !== 'string' || !r.output)))
    throw new ClawbotError('clawbot-storage-invalid', 'ClawBot 本地记录格式无效，未重置或覆盖。')
  if (data.credentials && ![data.credentials.token, data.credentials.accountId, data.credentials.userId, data.credentials.baseUrl]
    .every(value => typeof value === 'string' && value.length > 0 && value.length <= 8192))
    throw new ClawbotError('clawbot-storage-invalid', 'ClawBot 登录记录不完整，请核对本地文件。')
  if (Buffer.byteLength(JSON.stringify(data)) > 12 * 1024 * 1024)
    throw new ClawbotError('clawbot-capacity', 'ClawBot 本地记录达到空间上限；未丢弃或覆盖待处理消息。')
}

/** One owner per native profile. Exact generation filenames make crashed-owner
 * recovery safe against two contenders; no host process is stopped. */
export class FileClawbotStorage implements ClawbotStorage {
  private readonly file: string
  private readonly lock: string
  private readonly owner: string
  private closed = false
  constructor(directory: string) {
    mkdirSync(directory, { recursive: true, mode: 0o700 })
    this.file = path.join(directory, 'state.json')
    this.lock = path.join(directory, '.owner')
    this.owner = `owner-${process.pid}-${randomUUID()}.json`
    const staging = path.join(directory, `.pending-${randomUUID()}`)
    mkdirSync(staging, { mode: 0o700 })
    writePrivateJsonAtomic(path.join(staging, this.owner), { pid: process.pid })
    try {
      if (existsSync(this.lock)) {
        const entries = readdirSync(this.lock)
        if (entries.length !== 1 || !/^owner-\d+-[a-f0-9-]+\.json$/.test(entries[0])) throw new Error('ClawBot 状态正在被另一个实例使用')
        const previous = path.join(this.lock, entries[0])
        const { pid } = JSON.parse(readFileSync(previous, 'utf8'))
        if (!Number.isSafeInteger(pid) || pid < 1) throw new Error('ClawBot 本地锁需要核对')
        try { process.kill(pid, 0); throw new Error('ClawBot 已由此节点的另一个实例管理') }
        catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ESRCH') throw error }
        rmSync(previous)
        rmdirSync(this.lock)
      }
      renameSync(staging, this.lock)
    } catch (error) {
      rmSync(path.join(staging, this.owner), { force: true })
      rmdirSync(staging)
      throw error
    }
  }
  read(): ClawbotData {
    if (!existsSync(this.file)) return emptyClawbotData()
    if (statSync(this.file).size > 16 * 1024 * 1024) throw new Error('ClawBot 本地记录超过上限，未覆盖原记录')
    const data = JSON.parse(readFileSync(this.file, 'utf8')) as ClawbotData
    validateClawbotData(data)
    return data
  }
  write(data: ClawbotData): void {
    if (this.closed) throw new Error('ClawBot 组件已停止')
    validateClawbotData(data)
    writePrivateJsonAtomic(this.file, data)
  }
  close(): void {
    if (this.closed) return
    this.closed = true
    rmSync(path.join(this.lock, this.owner))
    rmdirSync(this.lock)
  }
}
