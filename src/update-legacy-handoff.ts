/** One cold-start handoff from the published 1.7.10/1.7.13 Web updater.
 * Ordinary startup acquires no listeners/timers and never trusts a journal as
 * proof of maintenance. An authenticated LIVE worker must confirm this exact
 * transaction first. DSH owns startup, HTTP admission and WebSocket readiness;
 * no native listener replacement, root disposal or data/receipt rewriting.
 *
 * This protects new external requests, not arbitrary in-process writers. The
 * historical worker still performs its real durable-data/session verification.
 */
import fs from 'node:fs'
import path from 'node:path'
import type { Server, RequestListener, IncomingMessage, ServerResponse } from 'node:http'
import { createHash, timingSafeEqual } from 'node:crypto'
import { setTimeout as delay } from 'node:timers/promises'
import type { Context } from '@deepseek-ai/cordis'
import { agentDshHome, agentProfileScope } from './agent-metadata.js'
import { desktopOwnsLifecycle, hostRuntimeVersion } from './dsh-host-context.js'
import { resolveDshWebRuntime } from './dsh-runtime.js'
import { invokeLegacyRpc, resolveTypertGateway } from './dsh-protocol-compat.js'
import { nativeInstallSessions } from './install-control.js'
import { PLUGIN_VERSION } from './plugin-version.js'
import { startLegacyRecovery } from './update-legacy-recovery.js'

interface LegacyJob {
  id: string; directory: string; home: string; profile: string; stateFile: string
  webPort: number; gatePort: number; localPort: number; statusToken: string
  targetVersion: string; previousVersion: string; dshVersion: string
}
interface Handoff { job: LegacyJob; origin: string; token: string }
/** Admission for our own transports during a verified legacy cold start. */
export interface LegacyGateStartup {
  bindDoor(server: Server, normal: RequestListener, door: 'public' | 'local', port: number): void
  onRelease(start: () => void): void
}
const loopback = (address?: string) => ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(address || '')
function readJson(file: string): any {
  const info = fs.lstatSync(file)
  if (!info.isFile() || info.isSymbolicLink() || info.size > 16384) throw Error('Invalid update record')
  return JSON.parse(fs.readFileSync(file, 'utf8'))
}
function complete(job: LegacyJob): boolean {
  try { return readJson(path.join(job.directory, 'verification-complete.json')).id === job.id } catch { return false }
}
function discover(ctx: Context): Handoff | undefined {
  if (desktopOwnsLifecycle(ctx)) return
  try {
    const home = agentDshHome(ctx), scope = agentProfileScope(ctx)
    const parent = path.join(home, 'harness-remote-updates')
    const index = `profile-${createHash('sha256').update(scope).digest('hex').slice(0, 24)}.json`
    // Managed Web services do not inherit the worker's environment marker.
    // The index only locates the candidate; it never authorizes a pause.
    const directory = process.env.HARNESS_REMOTE_UPDATE_JOB || path.join(parent, readJson(path.join(parent, index)).jobId)
    if (path.dirname(directory) !== parent || !/^[a-f0-9]{32}$/.test(path.basename(directory))) return
    const job = readJson(path.join(directory, 'job.json')) as LegacyJob
    if (job.id !== path.basename(directory) || job.directory !== directory || job.home !== home
        || job.profile !== path.join(home, 'profiles', scope) || fs.realpathSync(directory) !== directory
        || job.targetVersion !== PLUGIN_VERSION || !['1.7.10', '1.7.13'].includes(job.previousVersion)
        || job.dshVersion !== hostRuntimeVersion(ctx) || job.webPort !== resolveDshWebRuntime(ctx).port
        || !/^[a-f0-9]{48}$/.test(job.statusToken) || complete(job)) return
    if (![job.webPort, job.gatePort, job.localPort].every(port => Number.isInteger(port) && port > 0 && port < 65536)
        || new Set([job.webPort, job.gatePort, job.localPort]).size !== 3) return
    const relative = path.relative(home, job.stateFile)
    if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) return
    if (fs.readFileSync(path.join(job.profile, '.harness-remote-update.lock'), 'utf8') !== job.id
        || readJson(path.join(directory, 'authorized.json')).id !== job.id) return
    const ready = readJson(path.join(directory, 'worker-ready.json'))
    const url = new URL(ready.origin)
    if (ready.id !== job.id || url.protocol !== 'http:' || url.hostname !== '127.0.0.1' || !url.port
        || url.username || url.password || url.pathname !== '/' || url.search || url.hash) return
    const token = readJson(job.stateFile).token
    if (typeof token !== 'string' || !token || token.length > 1024) return
    return { job, origin: url.origin, token }
  } catch { return }
}
async function liveStatus(handoff: Handoff, signal: AbortSignal) {
  const response = await fetch(handoff.origin + '/status', { headers: {
    origin: `http://127.0.0.1:${handoff.job.webPort}`, authorization: `Bearer ${handoff.job.statusToken}`,
  }, signal: AbortSignal.any([signal, AbortSignal.timeout(1500)]), redirect: 'error' })
  if (!response.ok) throw Error('Legacy update worker is unavailable')
  const bytes = await response.text()
  if (bytes.length > 16384) throw Error('Invalid legacy update status')
  const value = JSON.parse(bytes)
  // 1.7.10 predates the echoed jobId. Its worker-ready record and unique bearer
  // still authenticate this live endpoint; a supplied conflicting ID is never accepted.
  if (value.jobId !== handoff.job.id && !(handoff.job.previousVersion === '1.7.10' && value.jobId === undefined)) {
    throw Error('Legacy update worker does not own this transaction')
  }
  return value
}
function maintenance(_req: IncomingMessage, res: ServerResponse) {
  res.writeHead(503, { 'retry-after': '2', 'cache-control': 'no-store' })
  res.end('Plugin upgrade verification in progress')
}
function matches(value: unknown, expected: string): boolean {
  if (typeof value !== 'string') return false
  const bytes = Buffer.from(value), wanted = Buffer.from(expected)
  return bytes.length === wanted.length && timingSafeEqual(bytes, wanted)
}

/** Returns undefined on the normal path: no asynchronous startup wait. */
export function legacyUpdateHandoff(ctx: Context, mount: (startup?: LegacyGateStartup) => () => void): Promise<() => void> | undefined {
  const handoff = discover(ctx)
  if (!handoff) return
  return verifyHandoff(ctx, handoff, mount)
}
async function verifyHandoff(ctx: Context, handoff: Handoff, mount: (startup?: LegacyGateStartup) => () => void): Promise<() => void> {
  const abort = new AbortController(), signal = abort.signal
  const removeLifetime = ctx.effect(() => () => abort.abort(), 'legacy update handoff lifetime')
  const cleanup: (() => void | Promise<void>)[] = []
  let disposeGate: (() => void) | undefined
  let released = false
  try {
    let status
    try { status = await liveStatus(handoff, signal) } catch { /* stale journal is not maintenance */ }
    ctx.fiber.assertActive()
    signal.throwIfAborted()
    if (!status || status.terminal || !['restarting', 'verifying'].includes(status.phase)) return mount()
    const ready = ctx.get('appReady') as { onReady?: (fn: () => void) => () => void } | undefined
    const web = ctx.get('webServer') as { register?: (route: any) => () => void } | undefined
    if (!ready?.onReady || !web?.register) throw Error('当前 DSH 缺少原生启动交接能力')
    let alreadyReady = false
    const cancelReady = ready.onReady(() => { alreadyReady = true })
    cancelReady()
    if (alreadyReady) throw Error('旧版更新交接仅限本次冷启动')
    // The frozen updater can stop this candidate again on rollback. Its bounded
    // recovery participant must outlive that one transaction, not the host.
    // It cannot turn a failed upgrade into success or restore user data.
    await startLegacyRecovery({ job: handoff.job, workerOrigin: handoff.origin })
    ctx.fiber.assertActive()
    signal.throwIfAborted()
    // Holding this plugin's async apply uses the launcher's startup barrier.
    // Native API WebSockets are not registered until appReady commits. HTTP
    // admission uses its documented event and is removed before normal use.
    cleanup.push((ctx as any).on('connection/request', async (req: IncomingMessage, res: ServerResponse) => maintenance(req, res), { global: true }))
    cleanup.push(web.register({ kind: 'exact', path: '/gate/status', handler: maintenance }))
    const { job, token } = handoff
    const probe = async (req: IncomingMessage, res: ServerResponse) => {
      if (req.method === 'GET' && req.url === '/gate/status') return maintenance(req, res)
      if (!loopback(req.socket.remoteAddress) || req.method !== 'POST' || req.headers.origin || req.headers['x-forwarded-for']
          || req.headers.host !== `127.0.0.1:${job.gatePort}`
          || !matches(req.headers.authorization, `Bearer ${token}`)
          || !matches(req.headers['x-harness-update-probe'], job.statusToken)
          || !['/api/wechatHost/describe', '/api/session.list', '/api/session.history'].includes(req.url || '')) {
        res.writeHead(403); res.end(); return
      }
      try {
        let body = ''
        for await (const chunk of req) { body += chunk.toString(); if (Buffer.byteLength(body) > 16384) throw Error('Update probe too large') }
        const input = JSON.parse(body), method = req.url!.slice(5)
        if (input.type !== 'client-request' || input.method !== method || typeof input.rpcId !== 'string') throw Error('Invalid update probe')
        const readSignal = AbortSignal.any([signal, AbortSignal.timeout(5000)])
        let value: unknown
        if (method === 'wechatHost/describe') {
          const host = ctx.get('wechatHost')
          if (!host) throw Error('The actual connection runtime is not ready')
          value = await host.describe({}, readSignal)
          const actual = (value as { value?: { gate?: { publicDoor: { port: number; state: string }; localDoor: { port: number; state: string } } } }).value?.gate
          if (!actual || actual.publicDoor.port !== job.gatePort || actual.localDoor.port !== job.localPort
              || actual.publicDoor.state !== 'listening' || actual.localDoor.state !== 'listening') throw Error('Actual connection doors are not ready')
        }
        else if (method === 'session.list') value = await nativeInstallSessions(ctx, readSignal)
        else {
          const gateway = resolveTypertGateway(ctx)
          if (!gateway?.readSnapshot) throw Error('Native read-only session history is not ready')
          const reply = await invokeLegacyRpc(gateway, { type: 'client-request', rpcId: input.rpcId, method,
            payload: { sessionId: input.payload?.sessionId, maxMessages: 1 } }, { signal: readSignal, describeHost: () => ({}) })
          if (!reply.result.ok) throw Error(reply.result.error.message)
          value = reply.result.value
        }
        res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' })
        res.end(JSON.stringify({ type: 'server-response', rpcId: input.rpcId, result: { ok: true, value } }))
      } catch {
        if (!res.headersSent) res.writeHead(503, { 'content-type': 'application/json' })
        res.end(JSON.stringify({ result: { ok: false, error: { message: 'Native verification is not ready' } } }))
      }
    }
    const releaseTransports: (() => void)[] = []
    disposeGate = mount({
      bindDoor(server, normal, door, port) {
        if (port !== (door === 'public' ? job.gatePort : job.localPort)) throw Error('Legacy update door changed')
        const temporary: RequestListener = door === 'public' ? (req, res) => { void probe(req, res) } : maintenance
        server.on('request', temporary)
        releaseTransports.push(() => { server.off('request', temporary); server.on('request', normal) })
      },
      onRelease(start) { releaseTransports.push(start) },
    })
    // This candidate never creates a maintenance receipt or changes old hashes.
    // Only the worker's genuine verification releases it. A disposed fixture/host
    // releases every temporary resource, including on a rollback.
    const deadline = Date.now() + 210000
    let nextStatus = Date.now() + 1000
    while (!complete(job)) {
      ctx.fiber.assertActive()
      signal.throwIfAborted()
      if (Date.now() >= deadline) throw Error('旧版升级验收未完成；已保留更新记录和备份')
      if (Date.now() >= nextStatus) {
        const current = await liveStatus(handoff, signal)
        ctx.fiber.assertActive()
        if (!complete(job) && (current.terminal || !['restarting', 'verifying'].includes(current.phase))) throw Error('旧版更新进程已停止验收')
        nextStatus = Date.now() + 1000
      }
      await delay(100, undefined, { signal })
    }
    ctx.fiber.assertActive()
    signal.throwIfAborted()
    for (const start of releaseTransports) start()
    released = true
    return disposeGate
  } finally {
    if (!released) disposeGate?.()
    for (const release of cleanup.reverse()) { try { await release() } catch { /* release all owned resources */ } }
    removeLifetime()
  }
}
