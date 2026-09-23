import { createHmac, randomBytes, timingSafeEqual, createHash } from 'node:crypto'
import path from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import { resolveTypertGateway } from './dsh-protocol-compat.js'
import { exportSessionArchive, sessionExportAvailable } from './dsh-session-export.js'
import { workspaceReadArguments, nativeFileBytes } from './dsh-host-contract.js'

type Row = Record<string, any>
export interface ResourceResult {
  readonly ok: boolean
  /** Versioned agent.resources.v1 JSON, independent of native Agent types. */
  readonly valueJson?: string
  readonly error?: {readonly code: string; readonly message: string}
}
const MAX_BYTES = 20 * 1024 * 1024
const CHUNK_BYTES = 192 * 1024
const TTL = 5 * 60_000
export interface ResourceConfig {
  readonly invoke?: (method: string, args: Row, signal: AbortSignal) => Promise<Row>
  readonly store?: (data: Uint8Array, signal: AbortSignal) => Promise<Row>
}
/** Neutral wire vocabulary. Native paths and native file APIs terminate here. */
export class AgentResourcesService extends TypertRemoteService {
  private readonly secret = randomBytes(32)
  private readonly snapshots = new Map<string, {scope: string; data: Buffer; expires: number}>()
  private active = 0
  constructor(private readonly host: Context, private readonly config: ResourceConfig = {}) {
    super(host, 'agentResources')
    host.effect(() => {
      const timer = setInterval(() => this.prune(), TTL)
      timer.unref()
      return () => {clearInterval(timer); this.snapshots.clear()}
    })
  }
  private async native(method: string, scope: string, args: Row, signal: AbortSignal): Promise<Row> {
    if (typeof scope !== 'string' || !scope || scope.length > 256) throw new Error('会话无效')
    signal.throwIfAborted()
    const input = {workspaceFileScopeId: scope, ...args}
    if (this.config.invoke) return this.config.invoke(method, input, signal)
    const gateway = resolveTypertGateway(this.host)
    if (!gateway) throw new Error('此节点尚不支持文件浏览')
    return await gateway.invoke({namespace:'workspaceFiles', method,
      args:method === 'readBytes' ? workspaceReadArguments(this.host, input) : input, signal}) as Row
  }
  private id(scope: string, location: string, kind: string): string {
    const data = Buffer.from(JSON.stringify({scope, location, kind, expires:Date.now() + 60 * 60_000})).toString('base64url')
    return data + '.' + createHmac('sha256', this.secret).update(data).digest('base64url')
  }
  private target(scope: string, id: string, kind?: string): Row {
    if (typeof id !== 'string' || id.length > 12000) throw new Error('文件引用无效，请刷新')
    const [data, signature, extra] = id.split('.')
    const expected = createHmac('sha256', this.secret).update(data || '').digest()
    const actual = Buffer.from(signature || '', 'base64url')
    if (extra || actual.length !== expected.length || !timingSafeEqual(actual, expected)) throw new Error('文件引用无效，请刷新')
    const value = JSON.parse(Buffer.from(data, 'base64url').toString())
    if (value.scope !== scope || value.expires < Date.now() || (kind && value.kind !== kind)) throw new Error('文件引用已失效，请刷新')
    return value
  }
  private entry(scope: string, parent: string, item: Row): Row {
    if (typeof item.name !== 'string' || !item.name || /[\\/\x00-\x1f]/.test(item.name) || item.name === '.' || item.name === '..') throw new Error('无效文件名')
    const location = [parent, item.name].filter(Boolean).join('/')
    return {id:this.id(scope, location, item.type), name:item.name, kind:item.type,
      bytes:Number.isSafeInteger(item.size) ? item.size : null, parentId:this.id(scope,parent || '.', 'directory')}
  }
  private async guarded(operation: () => Promise<Row>): Promise<ResourceResult> {
    try { return {ok:true, valueJson:JSON.stringify(await operation())} }
    catch (error) {
      const value = error && typeof error === 'object' ? error as {code?: unknown; message?: unknown} : null
      const code = value?.code === 'object_backend_unavailable'
        ? 'object_backend_unavailable'
        : 'resource-unavailable'
      const message = typeof value?.message === 'string' ? value.message : '文件不可用'
      return {ok:false, error:{code, message}}
    }
  }
  @Remote('capabilities')
  async capabilities(request: {scope: string; purpose?: 'sessionArchive'}, signal: AbortSignal): Promise<ResourceResult> {
    return this.guarded(async () => {
      signal.throwIfAborted()
      // Export does not depend on a workspace still being browsable. Older
      // clients keep their existing browse capability and unchanged response.
      if (request.purpose === 'sessionArchive') return {schema:'agent.resources.v1', sessionArchive:sessionExportAvailable(this.host)}
      await this.native('list', request.scope, {path:'.'}, signal)
      return {schema:'agent.resources.v1', browse:true, resolve:true, download:true,
        delivery:['chunks', ...(this.config.store ? ['object'] : [])], maxBytes:MAX_BYTES, chunkBytes:CHUNK_BYTES}
    })
  }
  @Remote('list')
  async list(request: {scope: string; directoryId?: string; cursor?: number}, signal: AbortSignal): Promise<ResourceResult> {
    return this.guarded(async () => {
      const location = request.directoryId ? this.target(request.scope,request.directoryId,'directory').location : '.'
      const value = await this.native('list',request.scope,{path:location},signal)
      const parent = value.path || ''
      const cursor = request.cursor ?? 0
      if (!Number.isSafeInteger(cursor) || cursor < 0 || cursor > 2000) throw new Error('目录分页无效')
      const sorted = (value.entries || []).filter((e:Row)=>e.type==='file' || e.type==='directory')
        .sort((a:Row,b:Row)=>Number(b.type==='directory')-Number(a.type==='directory') || a.name.localeCompare(b.name))
      return {schema:'agent.resources.v1', directoryId:this.id(request.scope,parent || '.', 'directory'),
        parentId:parent ? this.id(request.scope,path.posix.dirname(parent), 'directory') : null,
        label:parent || '工作区', truncated:value.truncated === true,
        nextCursor:cursor+100<sorted.length?cursor+100:null,
        entries:sorted.slice(cursor,cursor+100).map((e:Row)=>this.entry(request.scope,parent,e))}
    })
  }
  @Remote('resolve')
  async resolve(request: {scope: string; reference: string}, signal: AbortSignal): Promise<ResourceResult> {
    return this.guarded(async () => {
      let reference = request.reference
      if (typeof reference !== 'string' || reference.length > 4096 || /[\x00-\x1f]/.test(reference)) throw new Error('文件链接无效')
      // DSH's URI is decoded only in the adapter, never in the generic client.
      if (reference.startsWith('dsh-resource://file/session/')) {
        const parts = reference.slice('dsh-resource://file/session/'.length).split('/')
        if (decodeURIComponent(parts.shift() || '') !== request.scope) throw new Error('文件不属于当前会话')
        reference = decodeURIComponent(parts.join('/'))
      }
      const paths = /^[A-Za-z]:[\\/]/.test(reference) ? path.win32 : path.posix
      const name = paths.basename(reference)
      // Unlike native stat/read, list enforces workspace containment, including
      // parent symlinks. Only an actually listed file can receive a signed ID.
      const directory = await this.native('list',request.scope,{path:paths.dirname(reference)},signal)
      const item = (directory.entries || []).find((e:Row)=>e.name===name && e.type==='file')
      if (!item) throw new Error('文件不在当前工作区、已移动或已删除')
      return this.entry(request.scope,directory.path || '',item)
    })
  }
  private prune(): void {
    for (const [key,value] of this.snapshots) if (value.expires <= Date.now()) this.snapshots.delete(key)
  }
  private checkPreparation(delivery: string, signal: AbortSignal): void {
    signal.throwIfAborted()
    if (delivery !== 'chunks' && delivery !== 'object') throw new Error('文件传输方式无效')
    if (delivery === 'object' && !this.config.store) throw new Error('公网文件下载暂不可用')
    if (this.active >= 2) throw new Error('有文件正在准备，请稍后重试')
  }
  /** Workspace files and native archives share one bounded transfer lifecycle. */
  private async deliver(scope: string, data: Buffer, metadata: Row, delivery: string, signal: AbortSignal): Promise<Row> {
    signal.throwIfAborted()
    const value = {...metadata, bytes:data.length,
      sha512:createHash('sha512').update(data).digest('hex'),
      sha256:createHash('sha256').update(data).digest('hex')}
    if (delivery === 'object' && data.length) {
      const descriptor = await this.config.store!(data,signal)
      signal.throwIfAborted()
      return {...value, delivery:'object', descriptor}
    }
    this.prune()
    const used = [...this.snapshots.values()].reduce((total,item)=>total+item.data.length,0)
    if (this.snapshots.size >= 16 || used + data.length > 48 * 1024 * 1024) throw new Error('文件下载较多，请稍后再试')
    const transferId = randomBytes(24).toString('base64url')
    const expiresAt = Date.now()+TTL
    this.snapshots.set(transferId,{scope,data,expires:expiresAt})
    return {...value,delivery:'chunks',transferId,expiresAt,chunkBytes:CHUNK_BYTES}
  }
  @Remote('prepareArchive')
  async prepareArchive(request: {scope: string; delivery: 'chunks'|'object'}, signal: AbortSignal): Promise<ResourceResult> {
    return this.guarded(async () => {
      this.checkPreparation(request.delivery, signal)
      this.active++
      try {
        const archive = await exportSessionArchive(this.host, request.scope, signal, MAX_BYTES)
        return await this.deliver(request.scope, archive.data, {name:archive.name}, request.delivery, signal)
      } finally { this.active-- }
    })
  }
  @Remote('prepare')
  async prepare(request: {scope: string; id: string; delivery: 'chunks'|'object'}, signal: AbortSignal): Promise<ResourceResult> {
    return this.guarded(async () => {
      this.checkPreparation(request.delivery, signal)
      const file = this.target(request.scope,request.id,'file')
      this.active++
      try {
        // Revalidate directory containment on each export, not just when listed.
        await this.native('list',request.scope,{path:path.posix.dirname(file.location)},signal)
        const before = await this.native('stat',request.scope,{path:file.location},signal)
        if (typeof before.absolutePath !== 'string' || !before.absolutePath || typeof before.version !== 'string') throw new Error('节点文件信息不完整')
        const paths = /^[A-Za-z]:[\\/]/.test(before.absolutePath) ? path.win32 : path.posix
        // Pin the canonical file and have native containment check its parent
        // again. A renamed parent/symlink cannot redirect later byte reads.
        await this.native('list',request.scope,{path:paths.dirname(before.absolutePath)},signal)
        if (!Number.isSafeInteger(before.bytes) || before.bytes < 0 || before.bytes > MAX_BYTES) throw new Error('手机暂支持下载 20 MB 以内的文件，请在电脑查看此文件')
        const data = Buffer.alloc(before.bytes)
        for (let offset=0; offset<data.length; offset+=CHUNK_BYTES) {
          const value = await this.native('readBytes',request.scope,{path:before.absolutePath,range:{offset,length:Math.min(CHUNK_BYTES,data.length-offset)}},signal)
          const chunk = nativeFileBytes(value.data)
          if (value.absolutePath !== before.absolutePath || value.version !== before.version || value.offset !== offset || chunk.length !== Math.min(CHUNK_BYTES,data.length-offset)) throw new Error('文件正在变化，请生成完成后重试')
          chunk.copy(data,offset)
        }
        const after = await this.native('stat',request.scope,{path:file.location},signal)
        if (after.absolutePath !== before.absolutePath || after.version !== before.version || after.bytes !== before.bytes) throw new Error('文件正在变化，请重试')
        return await this.deliver(request.scope, data, {name:path.posix.basename(file.location), version:before.version}, request.delivery, signal)
      } finally { this.active-- }
    })
  }
  @Remote('chunk')
  async chunk(request: {scope: string; transferId: string; offset: number}, signal: AbortSignal): Promise<ResourceResult> {
    return this.guarded(async () => {
      signal.throwIfAborted()
      this.prune()
      const item = this.snapshots.get(request.transferId)
      if (!item || item.scope!==request.scope) throw new Error('下载已过期，请重新打开文件')
      if (!Number.isSafeInteger(request.offset) || request.offset<0 || request.offset>item.data.length || request.offset%CHUNK_BYTES!==0) throw new Error('文件分块无效')
      const data = item.data.subarray(request.offset,request.offset+CHUNK_BYTES)
      return {offset:request.offset,data:data.toString('base64'),eof:request.offset+data.length===item.data.length}
    })
  }
  @Remote('release')
  async release(request: {scope: string; transferId: string}): Promise<ResourceResult> {
    if (this.snapshots.get(request.transferId)?.scope === request.scope) this.snapshots.delete(request.transferId)
    return {ok:true,valueJson:'{"released":true}'}
  }
}

/** Optional presentation facet; unknown native events still retain their seq. */
export function resourcePresentation(event: Row): Row | undefined {
  if (event.type !== 'deliverables/presented' || !Array.isArray(event.data?.files)) return undefined
  return {schema:'agent.resources.v1',turn:event.data.turn,files:event.data.files.slice(0,32)
    .filter((f:Row)=> typeof f.path==='string' && f.path.length<=4096)
    .map((f:Row)=>({reference:f.path,name:f.path.split(/[\\/]/).pop(),description:typeof f.description==='string'?f.description.slice(0,256):''}))}
}
