/**
 * dsh-wechat-remote gate — WeChat 小程序专用认证网关（原生 DSH 宿主插件）。
 *
 * web/default profile 保持占用 3092/3093；其他 profile 使用稳定推导的
 * 高位端口对。全部仍可用环境变量覆盖（见 apply 部分）。
 *
 * 进程内两个监听器：
 *
 *   1. LAN door（0.0.0.0:3092 — 仅加密局域网直连）：
 *        - 只接受 /wechat-remote/secure-lan WebSocket。
 *        - 手机先核验 Agent 长期公钥并建立 E2EE，再在密文中提交通过已认证
 *          公网隧道领取的局域网凭据；握手前不接受 DSH 请求或凭据。
 *        - 不再暴露旧微信配对、身份回退、明文 HTTP 或普通 WebSocket 代理。
 *
 *   2. LOCAL door（127.0.0.1:3093 — 仅本机可访问）：
 *        - GET /pair       电脑端配对页（公网单次票据或已配对地址恢复码）
 *        - GET /pair/code  官方 Web Settings 配对页数据（CORS for :3080）
 *        - GET /gate/status 局域网门与端到端加密公网 Agent 状态
 *
 * web/default 的历史状态路径保持为 ~/.dsh/gate-wechat-state.json；其他
 * profile 按稳定 Agent 实例隔离。旧 gate-wechat.json 不再读取。
 * 随 DSH 同生共死 —— 无独立进程。
 */
import http, { type IncomingMessage, type ServerResponse } from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import crypto from 'node:crypto'
import type { Socket } from 'node:net'
import { TaskNotifications, NotificationRelayClient } from './task-notifications.js'
import QRCode from 'qrcode'
import { SecureLanServer } from './secure-lan.js'
import type { Context, Plugin } from '@deepseek-ai/cordis'
import WechatDirectoryService from './directory-service.js'
import WechatHostInfoService, {
  type WechatGateRuntimeInfo,
} from './host-info-service.js'
import WechatHistoryService, {
  type WechatHistoryConfig,
} from './history-service.js'
import WechatAttachmentService, {
  type WechatAttachmentConfig,
} from './attachment-service.js'
import { AgentResourcesService } from './agent-resources.js'
import { AgentInputsService } from './agent-inputs.js'
import { WechatImportService } from './history-import/service.js'
import { HumanToolsService } from './human-tools/service.js'
import { WechatFeaturesService } from './feature-access.js'
import { PrivateInputNative } from './human-workflow/private-input-native.js'
import { WorkflowHttpTransport } from './human-workflow/transport.js'
import PublicRelayGateway from './public-relay-gateway.js'
import {
  loadPublicRelayConfig,
  publicPairingPayload,
  type AgentStatus,
} from './public-relay-agent.js'
import {
  agentProfileScope,
  agentDisplayName,
  agentDshHome,
  defaultAgentIdentityPath,
  defaultRelayConfigPath,
  defaultGateStatePath,
  loadAgentDescriptor,
  type AgentDescriptor,
} from './agent-metadata.js'
import { hostPlatformDescriptor, selectLanIPv4 } from './host-platform.js'
import { deriveGatePorts, describeGateListenFailure } from './gate-ports.js'
import { isAllowedDshWebOrigin, resolveDshWebRuntime } from './dsh-runtime.js'
import { hostRuntimeVersion, desktopOwnsLifecycle } from './dsh-host-context.js'
import { mountPairingManagement } from './pairing-management.js'
import { DshCompatibilityApi } from './dsh-compatibility-api.js'
import { loadGateState, saveGateState, type GateState } from './gate-state.js'
import { prepareNodeStorage } from './node-storage.js'
import { PluginUpdateService } from './update-service.js'
import { NativeUpdateService, supportsNativeUpdates } from './native-update-service.js'
import { PLUGIN_VERSION } from './plugin-version.js'
import { runConnectionDiagnostics } from './connection-diagnostics.js'
import type { LegacyGateStartup } from './update-legacy-handoff.js'

interface RateBucket {
  windowStart: number
  count: number
}

interface PairEntry {
  payload: string
  qrDataUrl: string
  publicMode: boolean
  expiresAt: number
}

type MutableDoor = {
  bind: string
  port: number
  state: 'starting' | 'listening' | 'unavailable' | 'stopped'
  errorCode: string | null
  message: string | null
}

interface MutableGateRuntime {
  profileScope: string
  source: WechatGateRuntimeInfo['source']
  publicDoor: MutableDoor
  localDoor: MutableDoor
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function errorCodeOf(error: unknown): string | null {
  if (!error || typeof error !== 'object' || !('code' in error)) return null
  return typeof error.code === 'string' ? error.code : null
}

function recordOf(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

/**
 * Mount one isolated Harness Remote runtime into the supplied Cordis fiber.
 *
 * Importing the package is intentionally inert: credentials, files, sockets,
 * timers and listening ports are created only after Cordis applies this plugin
 * and are therefore scoped to this exact plugin instance.
 */
export function mountWechatGate(ctx: Context, startup?: LegacyGateStartup): () => void {
  // Validate launcher authority before any credential writes or listeners.
  // A malformed Desktop context must disable this adapter, not borrow Web.
  hostRuntimeVersion(ctx)
  const dshWebRuntime = resolveDshWebRuntime(ctx)
  const UPSTREAM_PORT = dshWebRuntime.port
  const desktopHost = desktopOwnsLifecycle(ctx)
  prepareNodeStorage(agentDshHome(ctx), agentProfileScope(ctx))
  let management: WechatGateRuntimeInfo['management'] = desktopHost ? 'unavailable' : 'loopback'
  let pairingManagement: ReturnType<typeof mountPairingManagement>
  const STATE_FILE = defaultGateStatePath(ctx)
  const ROUTE_QR_REFRESH_MS = 15 * 60 * 1000
  const RATE_WINDOW_MS = 60 * 1000
  const RATE_MAX_PER_IP = 120
  let publicRelayGateway: PublicRelayGateway | null = null
  let publicRelayStatus: AgentStatus = { enabled: false, state: 'disabled' }
  let agentDescriptor: AgentDescriptor
  try {
    agentDescriptor = loadAgentDescriptor(ctx)
  } catch (error: unknown) {
    // A damaged optional metadata file must not prevent DSH itself from booting.
    // Keep this process usable but do not overwrite evidence needed for repair.
    console.error(
      '[wechat-gate] Agent metadata unavailable; using process-local identity:',
      messageOf(error),
    )
    agentDescriptor = {
      schemaVersion: 1,
      hostId: crypto.randomBytes(18).toString('base64url'),
      agentInstanceId: crypto.randomBytes(18).toString('base64url'),
      hostName: os.hostname(),
      agentKind: 'deepseek-harness',
      agentName: agentDisplayName(ctx),
      agentVersion: 'unknown',
      hostPlatform: hostPlatformDescriptor(),
      capabilities: [],
    }
  }
  const selectedGatePorts = deriveGatePorts(
    agentProfileScope(ctx),
    agentDescriptor.agentInstanceId,
    process.env,
  )
  const PUBLIC_PORT = selectedGatePorts.publicPort
  const LOCAL_PORT = selectedGatePorts.localPort
  for (const warning of selectedGatePorts.warnings) {
    console.warn(`[wechat-gate] ${warning}`)
  }
  const doorRuntime: MutableGateRuntime = {
    profileScope: selectedGatePorts.profileScope,
    source: selectedGatePorts.source,
    publicDoor: {
      bind: '0.0.0.0',
      port: PUBLIC_PORT,
      state: 'starting',
      errorCode: null,
      message: null,
    },
    localDoor: {
      bind: '127.0.0.1',
      port: LOCAL_PORT,
      state: 'starting',
      errorCode: null,
      message: null,
    },
  }

  function gateRuntimeSnapshot(): WechatGateRuntimeInfo {
    return {
      profileScope: doorRuntime.profileScope,
      management,
      ...(management === 'authenticated-rpc' ? {
        diagnostics: 'read-only-v1' as const,
        ...(supportsNativeUpdates(ctx.get('pluginManager'), doorRuntime.profileScope) ? { updates: 'native-v1' as const } : {}),
      } : {}),
      source: doorRuntime.source,
      publicDoor: { ...doorRuntime.publicDoor },
      localDoor: { ...doorRuntime.localDoor },
    }
  }

  function installedPluginVersion(): string {
    try {
      const manifest = recordOf(
        JSON.parse(
          fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
        ),
      )
      return typeof manifest?.version === 'string' && manifest.version
        ? manifest.version
        : 'unknown'
    } catch {
      return 'unknown'
    }
  }

  const loadedState = loadGateState(STATE_FILE)
  const state = loadedState.state
  let lanStatePersistent = loadedState.persistent
  let disableLanDoor = (): void => {
    doorRuntime.publicDoor.state = 'unavailable'
    doorRuntime.publicDoor.errorCode = 'GATE_STATE_UNAVAILABLE'
    doorRuntime.publicDoor.message = '局域网凭据文件无法安全读写，已暂停局域网入口'
  }
  if (loadedState.warning) console.warn(`[wechat-gate] ${loadedState.warning}`)

  function replaceState(next: GateState): boolean {
    if (!lanStatePersistent) return false
    try {
      saveGateState(STATE_FILE, next)
      state.token = next.token
      state.publicIdentityNodeId = next.publicIdentityNodeId
      return true
    } catch (error: unknown) {
      lanStatePersistent = false
      console.error('[wechat-gate] failed to persist LAN credential state:', messageOf(error))
      disableLanDoor()
      return false
    }
  }

  function synchronizeLanIdentity(nodeId: string): void {
    if (!lanStatePersistent) return
    if (state.publicIdentityNodeId === nodeId) return
    // Persist the grant's owner with its token atomically. On restart, a
    // mismatching identity retires the grant again, including interrupted saves.
    replaceState({
      token: crypto.randomBytes(32).toString('base64url'),
      publicIdentityNodeId: nodeId,
    })
  }

  function lanIPv4(): string {
    return selectLanIPv4()
  }

  /**
   * Allow this profile's official Web UI to fetch its LOCAL door. Multiple DSH
   * profiles may use different upstream and local ports; only the configured
   * loopback WebUI origin is echoed, never an arbitrary website origin.
   */
  function setCors(req: IncomingMessage, res: ServerResponse): void {
    const origin =
      typeof req.headers.origin === 'string' ? req.headers.origin : ''
    if (isAllowedDshWebOrigin(origin, UPSTREAM_PORT)) {
      res.setHeader('Access-Control-Allow-Origin', origin)
      res.setHeader('Vary', 'Origin')
    }
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  }

  /**
   * LAN WebSocket 的每 IP 请求预算。认证仍在身份钉扎的 E2EE 内完成；
   * 此预算只防止同网段来源用握手洪泛耗尽 DSH 进程。
   *
   * Key 只取 socket 对端地址。PUBLIC door 不再承载反向代理或 Funnel，因而
   * 永不采信客户端自带的 X-Forwarded-For，伪造头不能绕过预算。
   */
  const rateBuckets = new Map<string, RateBucket>()
  function rateKey(req: IncomingMessage): string {
    const sock = String(
      req.socket && req.socket.remoteAddress ? req.socket.remoteAddress : '',
    )
    return (
      'ip:' + (sock.startsWith('::ffff:') ? sock.slice(7) : sock || 'unknown')
    )
  }
  function allowRequest(req: IncomingMessage): boolean {
    const key = rateKey(req)
    const now = Date.now()
    let bucket = rateBuckets.get(key)
    if (!bucket || bucket.windowStart + RATE_WINDOW_MS < now) {
      bucket = { windowStart: now, count: 0 }
      rateBuckets.set(key, bucket)
    }
    if (++bucket.count > RATE_MAX_PER_IP) return false
    if (rateBuckets.size > 20000) {
      // 惰性清扫：空转的桶不无限堆积
      for (const [k, v] of rateBuckets) {
        if (v.windowStart + RATE_WINDOW_MS < now) rateBuckets.delete(k)
      }
    }
    return true
  }
  const updater = new PluginUpdateService(ctx, { web: UPSTREAM_PORT, gate: PUBLIC_PORT, local: LOCAL_PORT })
  const nativeUpdater = new NativeUpdateService({ home: agentDshHome(ctx), scope: selectedGatePorts.profileScope, runningVersion: PLUGIN_VERSION,
    manager: () => ctx.get('pluginManager') as any, sessions: () => ctx.get('sessionController') as any,
    release: () => updater.nativeRelease() })
  ctx.effect(() => () => nativeUpdater.dispose(), 'wechat native updater')
  const compatibilityApi = new DshCompatibilityApi(ctx, UPSTREAM_PORT)
  let taskNotifications: TaskNotifications | undefined

  function readBody(req: IncomingMessage, maxBytes = 1e6): Promise<string> {
    return new Promise<string>((resolve, reject) => {
      const chunks: Buffer[] = []
      let bytes = 0
      req.on('data', (chunk: Buffer | string) => {
        const value = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
        bytes += value.length
        if (bytes > maxBytes) {
          reject(new Error('body too large'))
          req.destroy()
          return
        }
        chunks.push(value)
      })
      req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
      req.on('error', reject)
    })
  }

  async function makePairEntry(): Promise<PairEntry> {
    const gateway = publicRelayGateway
    if (!gateway) throw new Error('公网配对服务尚未就绪')
    // A LAN address is an untrusted locator, never an authorization grant.
    // New devices must claim the cloud's single-use ticket; already paired
    // clients match node identity/public key before accepting this address.
    const payloadObj = { host: lanIPv4(), port: PUBLIC_PORT }
    const locatorPayload = (): string => JSON.stringify({ v: 1, mode: 'secure-lan-route',
      nodeId: gateway.agent.identity.nodeId,
      identityPublicKey: gateway.agent.identity.publicKeyPem,
      relayOrigin: gateway.agent.config.relayOrigin, lan: payloadObj })
    let payload = locatorPayload()
    let publicMode = false
    let expiresAt = Date.now() + ROUTE_QR_REFRESH_MS
    try {
      publicRelayStatus = await gateway.ensurePairingStatus()
      const raw = publicPairingPayload(publicRelayStatus, payloadObj)
      if (raw) {
        const publicPayload = JSON.parse(raw)
        payload = raw
        publicMode = true
        expiresAt = Number(publicPayload.expiresAt) || expiresAt
      }
    } catch (error: unknown) {
      console.warn(
        '[wechat-gate] public pairing ticket unavailable; serving identity-pinned route locator:',
        messageOf(error),
      )
    }
    const qrDataUrl = await QRCode.toDataURL(payload, { width: 420, margin: 2 })
    return { payload, qrDataUrl, publicMode, expiresAt }
  }

  // ── LOCAL door (127.0.0.1:3093): pairing surface + status ──

  async function servePairQR(
    _req: IncomingMessage,
    res: ServerResponse,
  ): Promise<void> {
    let entry: PairEntry
    try {
      entry = await makePairEntry()
    } catch (error: unknown) {
      res.writeHead(503, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' })
      res.end(`<!doctype html><html lang="zh"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>配对暂不可用</title></head><body><h1>暂时无法生成配对二维码</h1><p>${messageOf(error)}</p><p>请确认电脑联网后重试。</p></body></html>`)
      return
    }
    // Issuing a QR replaces the single-use cloud ticket. A background refresh
    // here would invalidate a code being scanned (including one in WebUI).
    const validMinutes = Math.max(1, Math.ceil((entry.expiresAt - Date.now()) / 60_000))
    const html = `<!doctype html><html lang="zh"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>鲸常在配对</title>
<style>
body{font-family:-apple-system,'Segoe UI',sans-serif;background:#0b0f1a;color:#e8ecf4;display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:100vh;margin:0;gap:16px;text-align:center}
h1{font-size:20px;font-weight:600;margin:0}
p{color:#9aa4b8;font-size:13px;margin:0;max-width:480px}
img{background:#fff;border-radius:14px;padding:12px}
code{color:#7aa2ff;font-size:15px;letter-spacing:3px}
button{border:1px solid #596ec6;border-radius:10px;padding:10px 18px;background:#273b83;color:#fff;font:inherit;cursor:pointer}
</style></head>
<body>
<h1>添加到鲸常在</h1>
<p>${agentDescriptor.agentName} · ${agentDescriptor.hostName}</p>
<p>打开微信小程序，进入「添加节点」扫描二维码</p>
<img src="${entry.qrDataUrl}" alt="pairing QR">
<p>二维码生成后约 ${validMinutes} 分钟内有效</p>
<p>${entry.publicMode ? '自动选择更快连接；远程内容端到端加密' : '当前仅供已配对手机更新同一网络连接；新手机配对需要电脑连接公网服务'}</p>
<p>已使用或已过期时，请重新生成二维码。刷新后旧二维码失效。</p>
<button type="button" onclick="location.reload()">重新生成二维码</button>
</body></html>`
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' })
    res.end(html)
  }

  async function pairCodeValue(): Promise<object> {
    const entry = await makePairEntry()
    return {
      host: lanIPv4(), port: PUBLIC_PORT, localPort: LOCAL_PORT,
      profileScope: selectedGatePorts.profileScope, gate: gateRuntimeSnapshot(),
      qrDataUrl: entry.qrDataUrl,
      mode: entry.publicMode ? 'public-relay' : 'secure-lan-route',
      payload: entry.payload, expiresAt: entry.expiresAt,
    }
  }

  async function servePairCode(
    req: IncomingMessage,
    res: ServerResponse,
  ): Promise<void> {
    setCors(req, res)
    let value: object
    try {
      value = await pairCodeValue()
    } catch (error: unknown) {
      res.writeHead(503, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' })
      res.end(JSON.stringify({ error: messageOf(error) }))
      return
    }
    res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' })
    res.end(JSON.stringify(value))
  }

  function gateStatusValue(): object {
    return {
      gate: gateRuntimeSnapshot(),
      plugin: { runningVersion: PLUGIN_VERSION, installedVersion: installedPluginVersion() },
      lan: { ip: lanIPv4(), port: PUBLIC_PORT },
      // Status never releases a QR ticket; only the explicit pair-code operation
      // (authenticated native channel or restricted legacy loopback door) does.
      publicRelay: {
        enabled: publicRelayStatus.enabled === true,
        state: publicRelayStatus.state || 'disabled',
        remoteAccess: publicRelayStatus.remoteAccess || null,
      },
      agent: {
        agentName: agentDescriptor.agentName,
        hostName: agentDescriptor.hostName,
      },
    }
  }

  function serveGateStatus(req: IncomingMessage, res: ServerResponse): void {
    setCors(req, res)
    res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' })
    res.end(JSON.stringify(gateStatusValue()))
  }

  // ── LAN door (0.0.0.0:3092): encrypted transport only ──

  const serveLocal: http.RequestListener = (req, res) => {
    // Simple cross-origin GET responses need the same allow-origin header as
    // preflight responses. The old implementation only decorated OPTIONS,
    // so every Settings-page status request was rejected by the browser.
    setCors(req, res)
    if (req.method === 'OPTIONS') {
      res.writeHead(204)
      return res.end()
    }
    const url = new URL(req.url ?? '/', 'http://gate.local')
    if (url.pathname.startsWith('/gate/update/')) { void updater.handle(req, res); return }
    if (url.pathname === '/pair') return servePairQR(req, res)
    if (url.pathname === '/pair/code') return servePairCode(req, res)
    if (url.pathname === '/gate/status') return serveGateStatus(req, res)
    res.writeHead(404, { 'Content-Type': 'text/plain' })
    res.end('not found')
  }
  const localServer = http.createServer()
  if (startup) startup.bindDoor(localServer, serveLocal, 'local', LOCAL_PORT)
  else localServer.on('request', serveLocal)

  const servePublic: http.RequestListener = (req, res) => {
    // This port is no longer a bearer-authenticated HTTP proxy. Pairing and
    // WebUI update control stay on the loopback-only local door.
    res.writeHead(404, {
      'Content-Type': 'text/plain',
      'Cache-Control': 'no-store',
    })
    res.end('not found')
  }
  const publicServer = http.createServer()
  if (startup) startup.bindDoor(publicServer, servePublic, 'public', PUBLIC_PORT)
  else publicServer.on('request', servePublic)

  const secureLan = new SecureLanServer({
    identity: () => publicRelayGateway?.agent.identity,
    token: () => state.token,
    dshPort: UPSTREAM_PORT,
    compatibilityApi,
    createTunnel: send => {
      if (!publicRelayGateway) throw new Error('Agent identity unavailable')
      return publicRelayGateway.createAuthenticatedTunnel(send)
    },
  })
  disableLanDoor = (): void => {
    doorRuntime.publicDoor.state = 'unavailable'
    doorRuntime.publicDoor.errorCode = 'GATE_STATE_UNAVAILABLE'
    doorRuntime.publicDoor.message = '局域网凭据文件无法安全读写，已暂停局域网入口'
    for (const client of secureLan.sockets.clients) client.terminate()
    try { publicServer.close() } catch { /* already closed or not listening */ }
  }
  const startLan = () => { publicServer.on('upgrade', (req, socket, head) => {
    // A remote client can reset a WebSocket while the proxy is connecting to
    // DSH. Without this listener, Node treats ECONNRESET as an unhandled Socket
    // error and terminates the entire Harness process.
    socket.once('error', (err) => {
      console.warn(
        '[wechat-gate] WebSocket client closed:',
        errorCodeOf(err) || err.message,
      )
      if (!socket.destroyed) socket.destroy()
    })
    if (!allowRequest(req)) {
      socket.write('HTTP/1.1 429 Too Many Requests\r\n\r\n')
      return socket.destroy()
    }
    if (req.url === '/wechat-remote/secure-lan') {
      secureLan.sockets.handleUpgrade(req, socket, head, ws =>
        secureLan.attach(ws, req.socket.remoteAddress),
      )
      return
    }
    socket.write('HTTP/1.1 404 Not Found\r\n\r\n')
    socket.destroy()
  }) }
  if (startup) startup.onRelease(startLan)
  else startLan()

  publicServer.on('clientError', (err, socket) => {
    console.warn(
      '[wechat-gate] client socket error:',
      errorCodeOf(err) || err.message,
    )
    if (!socket.destroyed) socket.destroy()
  })

  let disposed = false
  const openSockets = new Set<Socket>()
  const trackSocket = (socket: Socket): void => {
    openSockets.add(socket)
    socket.once('close', () => openSockets.delete(socket))
  }
  localServer.on('connection', trackSocket)
  publicServer.on('connection', trackSocket)
  // Cordis treats the function returned by apply as the authoritative plugin
  // effect disposer. Do not model disposal as a custom event: fiber.dispose()
  // removes registered listeners but does not emit an application event.
  const dispose = (): void => {
    disposed = true
    void pairingManagement?.dispose().catch(error => console.warn('[wechat-gate] pairing route cleanup failed:', messageOf(error)))
    updater.dispose()
    secureLan.close()
    compatibilityApi.dispose()
    taskNotifications?.dispose()
    doorRuntime.localDoor.state = 'stopped'
    doorRuntime.publicDoor.state = 'stopped'
    try {
      localServer.close()
    } catch (e) {
      /* best-effort */
    }
    try {
      publicServer.close()
    } catch (e) {
      /* best-effort */
    }
    for (const socket of openSockets) {
      try {
        socket.destroy()
      } catch (e) {
        /* best-effort */
      }
    }
    openSockets.clear()
    try {
      publicRelayGateway?.stop()
    } catch (e) {
      /* best-effort */
    }
    publicRelayGateway = null
    console.log('[wechat-gate] runtime disposed')
  }

  const mountChild = (
    label: string,
    plugin: Plugin<unknown>,
    config: unknown,
  ): void => {
    try {
      const fiber = ctx.plugin(plugin, config)
      void Promise.resolve(fiber).catch((error: unknown) => {
        console.error(
          `[wechat-gate] optional ${label} service unavailable; DSH continues: ${messageOf(error)}`,
        )
      })
    } catch (error: unknown) {
      console.error(
        `[wechat-gate] optional ${label} service unavailable; DSH continues: ${messageOf(error)}`,
      )
    }
  }

  // Host plugin body: binds both doors in-process. Disposal closes them.
  // Every door and optional relay fails independently; none may terminate DSH.
  // 独立的 Host-only Typert 服务。它不占用 DSH 的全局 directoryPicker，
  // 因而 WebUI 继续使用官方 auto/native 目录选择器。
  // On-demand delivery is independent of the relay WebSocket/public allowance.
  // Credentials stay host-side; this service is not a Remote or a model tool.
  ctx.provide('wechatResourceSource', {
    current: () => {
      if (!publicRelayGateway) throw new Error('Node unavailable')
      const { agent } = publicRelayGateway
      return { identity: agent.identity, origin: agent.config.relayOrigin,
        objectOrigins: agent.config.objectOrigins, fetchImpl: agent.fetchImpl }
    },
  })
  const startFeatures = () => mountChild('features', WechatFeaturesService, {
    preferenceFile: path.join(path.dirname(defaultGateStatePath(ctx)), 'wechat-feature-preferences-v1.json'),
    source: {
      nodeId: () => { if (!publicRelayGateway) throw new Error('Node unavailable'); return publicRelayGateway.agent.identity.nodeId },
      groupAvailable: () => ctx.get('wechatGroupAssistants' as any)?.active === true,
      read: (signal: AbortSignal) => { if (!publicRelayGateway) throw new Error('Node unavailable'); return publicRelayGateway.agent.readFeatures(signal) },
    },
  })
  // The optional components can resume background work as soon as this
  // provider exists. During the old updater's verification only, release it
  // together with our transports, after the real worker's receipt.
  if (startup) startup.onRelease(startFeatures)
  else startFeatures()
  mountChild('directory', WechatDirectoryService, { maxEntries: 1000 })
  mountChild('history-import', WechatImportService, {
    receiptDirectory: path.join(path.dirname(defaultGateStatePath(ctx)), 'history-import-receipts'),
    loadObject: async (descriptor: Record<string, any>, signal: AbortSignal) => {
      const gateway = publicRelayGateway
      if (!gateway) throw new Error('Public object transport is unavailable')
      return gateway.downloadInputObject(descriptor, signal)
    },
  })
  // 电脑名不在 DSH 原生 host.describe 契约里；以微信端隔离的只读 Remote
  // 提供，避免为了一个客户端字段污染 DSH/WebUI 的 Host API。
  mountChild('host-info', WechatHostInfoService, {
    gateRuntime: gateRuntimeSnapshot,
    privateUpdatesReady: () => compatibilityApi.privateInput?.supported() === true,
  })
  // 公网历史性能适配：只读 DSH 原生 session.history，在电脑端补齐轮次
  // 并删除已完成轮次的冗余流式增量。独立 Remote 不修改 WebUI/DSH。
  const historyConfig: WechatHistoryConfig = {
    dshPort: UPSTREAM_PORT,
    storeSnapshot: async (payloadJson: string, archive: Uint8Array, signal: AbortSignal) => {
      const gateway = publicRelayGateway
      if (!gateway) throw new Error('Public object transport is unavailable')
      return gateway.storeHistorySnapshot(payloadJson, archive, signal)
    },
  }
  mountChild('history', WechatHistoryService, historyConfig)
  // 历史图片仍先通过 DSH 原生 session.attachment 完成会话引用校验；随后
  // 仅将端侧加密密文放入私有对象存储，让小程序公网直取，避免大体积
  // base64 占用实时中继。对象层故障只让该图片失败，不应触发大响应回退。
  const attachmentConfig: WechatAttachmentConfig = {
    dshPort: UPSTREAM_PORT,
    storeAttachment: async (data, attachment, signal) => {
      const gateway = publicRelayGateway
      if (!gateway) throw new Error('Public object transport is unavailable')
      return gateway.uploadAttachmentObject(data, attachment, signal)
    },
  }
  mountChild('attachment', WechatAttachmentService, attachmentConfig)
  mountChild('agent-resources', AgentResourcesService, {
    store: async (data: Uint8Array, signal: AbortSignal) => {
      if (!publicRelayGateway) throw new Error('公网文件服务暂不可用，请连接局域网后重试')
      return publicRelayGateway.uploadArtifactObject(data, signal)
    },
  })
  mountChild('agent-inputs',AgentInputsService,{
    load:async(descriptor:Record<string,any>,signal:AbortSignal)=>{
      if(!publicRelayGateway)throw Error('公网附件服务暂不可用，请连接局域网后重试')
      return publicRelayGateway.downloadInputObject(descriptor,signal)
    },
  })
  // Product mode uses the official outbound-only relay by default so one QR
  // provisions public + LAN routes. A local config may explicitly disable or
  // override it; failures stay isolated and never alter LAN/WebUI behavior.
  try {
    const relayConfig = loadPublicRelayConfig(defaultRelayConfigPath(ctx))
    if (relayConfig) {
      publicRelayGateway = new PublicRelayGateway(relayConfig, {
        identityPath: defaultAgentIdentityPath(ctx),
        agentVersion: agentDescriptor.agentVersion,
        adapterVersion: PLUGIN_VERSION,
        hostId: agentDescriptor.hostId,
        agentInstanceId: agentDescriptor.agentInstanceId,
        agentKind: agentDescriptor.agentKind,
        agentName: agentDescriptor.agentName,
        hostName: agentDescriptor.hostName,
        hostPlatform: agentDescriptor.hostPlatform,
        capabilities: agentDescriptor.capabilities,
        dshPort: UPSTREAM_PORT,
        // Public E2EE dispatches in-process; it does not depend on LAN listen
        // availability or consume the shared loopback IP rate budget.
        compatibilityApi,
        // Persist only short-lived encrypted OSS object descriptors. Scope the
        // private index by stable Agent identity so multiple profiles on one
        // host cannot reuse another public node's object ticket.
        historyCachePath: path.join(
          agentDshHome(ctx),
          `wechat-history-snapshots-${agentDescriptor.agentInstanceId}.json`,
        ),
        onDiagnostic: (level, message) => {
          if (level === 'warn') console.warn(`[wechat-gate] ${message}`)
          else console.log(`[wechat-gate] ${message}`)
        },
        // This credential is released only inside an authenticated, identity-
        // pinned E2EE relay tunnel. It is not a DSH Remote and cannot be called
        // by WebUI or unauthenticated LAN clients.
        issueLanCredential: (rotate = false) => {
          if (!lanStatePersistent) throw new Error('局域网凭据状态不可用，请先修复凭据文件')
          if (doorRuntime.publicDoor.state !== 'listening') {
            throw new Error(
              doorRuntime.publicDoor.message ||
                `局域网门 ${PUBLIC_PORT} 当前不可用`,
            )
          }
          if (rotate) {
            if (!replaceState({
              token: crypto.randomBytes(32).toString('base64url'),
              publicIdentityNodeId: state.publicIdentityNodeId,
            })) throw new Error('局域网凭据保存失败，请检查凭据文件权限')
            console.log(
              '[wechat-gate] authenticated E2EE client rotated LAN credential',
            )
          } else {
            console.log(
              '[wechat-gate] authenticated E2EE client requested LAN route bootstrap',
            )
          }
          return {
            baseUrl: `http://${lanIPv4()}:${PUBLIC_PORT}`,
            token: state.token,
            secureLan: 1,
          }
        },
        onStatus: (status) => {
          publicRelayStatus = status
        },
        onIdentityChange: () => {
          ctx.get('wechatFeatures')?.access.invalidate()
          // Cloud revocation is a security boundary, not a display rename.
          // Retire local grants too; never carry a former owner's LAN token
          // into the newly enrollable public identity.
          if (publicRelayGateway) synchronizeLanIdentity(publicRelayGateway.agent.identity.nodeId)
        },
      })
      synchronizeLanIdentity(publicRelayGateway.agent.identity.nodeId)
      // Shared owner services remain available for published tasks and receipts.
      // Model tools/skills/prompts are exposed only by the native collaboration
      // component in an explicitly composed preset; never by this host gate.
      // An operator may disable the service; cloud authorization still applies.
      if (process.env.HARNESS_REMOTE_HUMAN_TOOLS !== '0') {
        const transport = new WorkflowHttpTransport(relayConfig.relayOrigin, () => {
            if (!publicRelayGateway) throw new Error('Node unavailable')
            return publicRelayGateway.agent.identity
          }, undefined, () => {
            const access = ctx.get('wechatFeatures')?.access
            if (!access) throw new Error('暂时无法核对使用资格，请联网后刷新。')
            return access.assert('group_assistant')
          })
        const privateInput = new PrivateInputNative(ctx, transport.nodeId, () => transport.assertIdentity(), Date.now, { transport })
        compatibilityApi.privateInput = privateInput
        ctx.effect(() => () => { privateInput.close(); if (compatibilityApi.privateInput === privateInput) compatibilityApi.privateInput = undefined })
        const startHumanTools = () => mountChild('human-tools', HumanToolsService, { enabled: true, privateInput, workflow: {
          transport,
        } })
        if (startup) startup.onRelease(startHumanTools)
        else startHumanTools()
      }
      // Opt-in observer only. No native provider replacement and no update of the host configuration.
      if (process.env.HR_TASK_NOTIFICATIONS_ENABLED !== '0') {
        const startNotifications = () => { try {
          taskNotifications = new TaskNotifications(ctx, new NotificationRelayClient(relayConfig.relayOrigin,
            () => { if (!publicRelayGateway) throw new Error('Node unavailable'); return publicRelayGateway.agent.identity }))
          taskNotifications.start()
          compatibilityApi.taskNotificationRequest = args => taskNotifications!.request(args)
        } catch {
          taskNotifications?.dispose(); taskNotifications = undefined
          console.warn('[wechat-gate] optional task notifications unavailable')
        } }
        if (startup) startup.onRelease(startNotifications)
        else startNotifications()
      }
      const startRelay = () => { void publicRelayGateway?.start().then(() => ctx.get('wechatFeatures')?.access.refresh()).catch(() => {}) }
      if (startup) startup.onRelease(startRelay)
      else startRelay()
    }
  } catch (error: unknown) {
    publicRelayStatus = {
      enabled: true,
      state: 'offline',
      lastError: messageOf(error),
    }
    console.error(
      '[wechat-gate] public relay disabled after configuration error:',
      messageOf(error),
    )
  }
  const failDoor = (
    which: 'local door' | 'public door',
    err: unknown,
  ): void => {
    const runtime =
      which === 'local door' ? doorRuntime.localDoor : doorRuntime.publicDoor
    const failure = describeGateListenFailure(
      which === 'local door' ? 'local' : 'public',
      runtime.bind,
      runtime.port,
      err,
    )
    runtime.state = disposed ? 'stopped' : 'unavailable'
    runtime.errorCode = failure.code
    runtime.message = failure.message
    console.error(`[wechat-gate] ${runtime.message} DSH 本体继续运行。`)
    if (disposed) return
    try {
      if (which === 'local door') localServer.close()
      else publicServer.close()
    } catch (e) {
      /* already closed */
    }
  }
  localServer.on('error', (err) => failDoor('local door', err))
  publicServer.on('error', (err) => failDoor('public door', err))
  try {
    localServer.listen(LOCAL_PORT, '127.0.0.1', () => {
      doorRuntime.localDoor.state = 'listening'
      doorRuntime.localDoor.errorCode = null
      doorRuntime.localDoor.message = null
      console.log(
        `[wechat-gate] local door (pairing/status): http://127.0.0.1:${LOCAL_PORT}`,
      )
    })
  } catch (e) {
    failDoor('local door', e)
  }
  if (!lanStatePersistent) {
    doorRuntime.publicDoor.state = 'unavailable'
    doorRuntime.publicDoor.errorCode = 'GATE_STATE_UNAVAILABLE'
    doorRuntime.publicDoor.message = '局域网凭据文件无法安全读取，已保留原文件并暂停局域网入口'
  } else {
    try {
      publicServer.listen(PUBLIC_PORT, '0.0.0.0', () => {
        doorRuntime.publicDoor.state = 'listening'
        doorRuntime.publicDoor.errorCode = null
        doorRuntime.publicDoor.message = null
        console.log(
          `[wechat-gate] encrypted LAN door: ws://0.0.0.0:${PUBLIC_PORT}/wechat-remote/secure-lan`,
        )
      })
    } catch (error: unknown) {
      failDoor('public door', error)
    }
  }
  // Connection can arrive after webServer, and may be reloaded independently.
  // Use its native service lifetime, not polling or one-time startup discovery.
  ctx.inject(['connection', 'webServer'], (pairingCtx) => {
    if (disposed) return
    try {
      const mounted = mountPairingManagement(pairingCtx, {
        status: gateStatusValue, pairCode: pairCodeValue,
        connectionDiagnostics: signal => runConnectionDiagnostics({
          relayOrigin: publicRelayGateway?.agent.config.relayOrigin ?? '',
          fetch: publicRelayGateway?.agent.fetchImpl,
          signal,
          context: { pluginVersion: PLUGIN_VERSION, dshVersion: hostRuntimeVersion(ctx),
            platform: process.platform, profileKind: desktopHost ? 'desktop' : 'web',
            relayEnabled: publicRelayStatus.enabled === true, relayState: publicRelayStatus.state },
        }),
        updateCheck: nativeUpdater.check, updateStart: nativeUpdater.start, updateStatus: nativeUpdater.status,
        unavailable: () => disposed,
      })
      if (!mounted) return
      pairingManagement = mounted
      management = 'authenticated-rpc'
      return async () => {
        if (pairingManagement === mounted) {
          pairingManagement = undefined
          management = desktopHost ? 'unavailable' : 'loopback'
        }
        await mounted.dispose()
      }
    } catch (error) {
      // Never replace a conflicting route or guess another profile's door.
      console.warn('[wechat-gate] authenticated pairing unavailable:', messageOf(error))
    }
  })
  return dispose
}
