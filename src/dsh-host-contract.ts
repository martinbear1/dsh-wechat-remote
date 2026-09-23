/** Host-only contract differences. No network probing or per-request retries. */
import fs from 'node:fs'
import path from 'node:path'
type Row = Record<string, any>
export interface HostContext { get(name: string): unknown }
const contracts = new WeakMap<object, { duplex: boolean }>()
/** Inspect only the RUNNING CLI, never another global/npm cache install. */
export function runningDshVersion(entry = process.argv[1]): string | undefined {
  if (!entry) return
  let directory: string
  try { directory = path.dirname(fs.realpathSync(entry)) } catch { return }
  for (let depth = 0; depth < 8; depth++) {
    try {
      const manifest = JSON.parse(fs.readFileSync(path.join(directory, 'package.json'), 'utf8'))
      if (manifest.name === '@deepseek-ai/dsh') return manifest.version
    } catch { /* ancestor may not be a package */ }
    const parent = path.dirname(directory)
    if (parent === directory) break
    directory = parent
  }
}
/** No carrier-arity capability exists. Follow the official 0.1.7-alpha.1
 * boundary centrally, not Function.length or trial calls. Retire the legacy
 * branch once pre-0.1.7 hosts leave the support matrix. */
export function usesDuplexEvents(version: string | undefined): boolean {
  if (!version) return false // Pre-packaged/source hosts use the legacy carrier.
  const match = /^(\d+)\.(\d+)\.(\d+)(?:-[\w.-]+)?$/.exec(version)
  if (!match) throw new Error('无法识别当前 DSH 事件协议版本')
  const [, major, minor, patch] = match.map(Number)
  return major > 0 || minor > 1 || minor === 1 && patch >= 7
}
export function openHostEvents(gateway: Row, endpoint: string, payload: unknown, signal: AbortSignal): Promise<AsyncIterable<unknown>> {
  let contract = contracts.get(gateway)
  if (!contract) { contract = { duplex: usesDuplexEvents(runningDshVersion()) }; contracts.set(gateway, contract) }
  signal.throwIfAborted()
  // Same in-process operator identity as before. No new network authority,
  // buffered uplink, background task or duplicate subscription.
  const empty = { async *[Symbol.asyncIterator]() {} }
  return contract.duplex
    ? gateway.wireStream.open(endpoint, payload, empty, undefined, signal)
    : gateway.wireStream.open(endpoint, payload, signal)
}
export function workspaceReadArguments(ctx: HostContext, args: Row): Row {
  const registry = ctx.get('typert') as Row | undefined
  const descriptor = registry?.local?.get('workspaceFiles/readBytes')
  const names = descriptor?.parameters?.map((parameter: Row) => parameter.wire)
  if (names?.includes('options') && !names.includes('range')) {
    const { range, ...rest } = args
    return { ...rest, options: { range } }
  }
  if (names?.includes('range') && !names.includes('options')) return args
  if (descriptor || registry?.local?.hasSeen?.('workspaceFiles/readBytes')) throw new Error('DSH 文件接口暂不可用，请稍后重试')
  // Old SRC mode has no strict descriptors; use the running host contract.
  if (usesDuplexEvents(runningDshVersion())) {
    const { range, ...rest } = args
    return { ...rest, options: { range } }
  }
  return args
}
export function nativeFileBytes(value: unknown): Buffer {
  if (value instanceof Uint8Array) return Buffer.from(value)
  if (typeof value === 'string') return Buffer.from(value, 'base64')
  throw new Error('DSH 返回了无效的文件字节')
}

/** DSH 0.1.7 moved the browser child catalog to parent projections. Keep the
 * shipped phone vocabulary here, without resurrecting a removed Remote method
 * or inspecting native log files. Mutations still use native admission checks.
 * Remove this projection when the phone contract adopts parent projections. */
export function projectedSubagentCatalog(parent: string, projection: Row | null, rows: Row[]): Row {
  const entries = projection?.values?.subagentCatalog
  if (!Array.isArray(entries) || !Array.isArray(rows)) throw new Error('DSH 子代理目录暂不可读取')
  const byId = new Map(rows.map(row => [row.sessionId, row]))
  const parents = new Set(rows.filter(row => row.origin === 'subagent').map(row => row.parentSessionId))
  const ids = new Set<string>()
  return { parentAvailable: byId.get(parent)?.agentAvailable === true, entries: entries.map((entry: Row) => {
    if (typeof entry.id !== 'string' || !entry.id || ids.has(entry.id)) throw new Error('DSH 子代理目录不完整')
    ids.add(entry.id)
    if (entry.mode !== 'one-shot' && entry.mode !== 'continuable') return { id: entry.id, kind: 'diagnostic', reason: 'unsupported' }
    const row = byId.get(entry.id)
    if (row && (row.origin !== 'subagent' || row.parentSessionId !== parent)) throw new Error('DSH 子代理归属不一致')
    return { id: entry.id, kind: 'child', mode: entry.mode,
      ...(typeof entry.label === 'string' ? { label: entry.label } : {}),
      activity: row?.running === true ? 'running' : 'inactive', hasChildren: parents.has(entry.id) }
  }) }
}
export async function invokeHostRemote(ctx: HostContext, gateway: Row, request: Row): Promise<unknown> {
  if (request.namespace !== 'subagents' || request.method !== 'list') return gateway.invoke(request)
  const registry = (ctx.get('typert') as Row | undefined)?.local
  // A withdrawn descriptor is a host error, not permission to bypass it.
  if (registry?.get('subagents/list') || registry?.hasSeen?.('subagents/list') || !usesDuplexEvents(runningDshVersion())) return gateway.invoke(request)
  const parent = request.args.parentSessionId
  if (typeof parent !== 'string' || !parent || parent.length > 256) throw new Error('父会话标识无效')
  request.signal?.throwIfAborted()
  const [projection, listing] = await Promise.all([
    gateway.invoke({ namespace: 'session', method: 'projections', args: { request: { sessionId: parent } }, signal: request.signal }),
    gateway.invoke({ namespace: 'session', method: 'list', args: { _request: {} }, signal: request.signal }),
  ])
  request.signal?.throwIfAborted()
  return projectedSubagentCatalog(parent, projection, listing?.items)
}
