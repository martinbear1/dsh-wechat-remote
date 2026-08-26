/**
 * Outbound-only public relay transport for Harness Remote.
 *
 * This module is deliberately isolated from the existing LAN gate. It opens no
 * public port and does not change DSH/WebUI configuration. Product builds use
 * the official relay by default so one QR always carries public + LAN routes;
 * ~/.dsh/harness-remote-public.json may explicitly disable or override it.
 */
import {
  createHash,
  generateKeyPairSync,
  randomBytes,
  sign,
} from 'node:crypto'
import {
  existsSync,
  readFileSync,
} from 'node:fs'
import { homedir, hostname } from 'node:os'
import path from 'node:path'
import { WebSocket } from 'ws'

import { defaultAgentIdentityPath, type AgentCapability } from './agent-metadata.js'
import type { HostPlatformDescriptor } from './host-platform.js'
import { readPrivateJson, writePrivateJsonAtomic } from './secure-file.js'

const CONFIG_PATH = path.join(homedir(), '.dsh', 'harness-remote-public.json')
export const DEFAULT_PUBLIC_RELAY_ORIGIN = 'https://relay.xyxfood.xyz'
const ROUTING_HEADER_BYTES = 18
const MAX_AGENT_BUFFERED_BYTES = 2 * 1024 * 1024
const AGENT_BUFFER_DRAIN_TIMEOUT_MS = 15_000

function wait(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

export interface PublicRelayConfig {
  readonly enabled: boolean
  readonly relayOrigin: string
}

export interface AgentIdentity {
  readonly nodeId: string
  readonly publicKeyPem: string
  readonly privateKeyPem: string
}

export interface AgentStatus {
  readonly enabled: boolean
  readonly state: 'disabled' | 'enrolling' | 'connecting' | 'online' | 'offline'
  readonly nodeId?: string
  readonly identityPublicKey?: string
  readonly relayOrigin?: string
  readonly pairingTicket?: string
  readonly pairingExpiresAt?: number
  readonly lastError?: string
  readonly hostId?: string
  readonly agentInstanceId?: string
  readonly hostName?: string
  readonly agentKind?: string
  readonly agentName?: string
  readonly agentVersion?: string
  readonly adapterVersion?: string
  readonly hostPlatform?: HostPlatformDescriptor
  readonly capabilities?: readonly AgentCapability[]
}

export interface RelayClientFrame {
  readonly clientId: string
  readonly payload: Buffer
  reply(payload: Uint8Array): Promise<void>
}

export interface PublicRelayAgentOptions {
  readonly agentVersion: string
  readonly adapterVersion?: string
  readonly hostId?: string
  readonly agentInstanceId?: string
  readonly agentKind?: string
  readonly agentName?: string
  readonly hostName?: string
  readonly hostPlatform?: HostPlatformDescriptor
  readonly capabilities?: readonly AgentCapability[]
  readonly displayName?: string
  readonly onFrame: (frame: RelayClientFrame) => void | Promise<void>
  readonly onStatus?: (status: AgentStatus) => void
  readonly onClientDisconnect?: (clientId: string) => void
  readonly onClientError?: (clientId: string, error: unknown) => void
  /** The physical Agent socket was lost; all relay client ids are now stale. */
  readonly onTransportDisconnect?: () => void
  readonly fetchImpl?: typeof fetch
  /** Test/portable profile override; production defaults to ~/.dsh. */
  readonly identityPath?: string
}

export function agentNodeIdForPublicKey(publicKeyPem: string): string {
  const der = Buffer.from(publicKeyPem
    .replace(/-----BEGIN PUBLIC KEY-----|-----END PUBLIC KEY-----|\s/g, ''), 'base64')
  return createHash('sha256').update(der).digest().subarray(0, 18).toString('base64url')
}

export function loadPublicRelayConfig(configPath = CONFIG_PATH): PublicRelayConfig | null {
  const value = existsSync(configPath)
    ? JSON.parse(readFileSync(configPath, 'utf8')) as Partial<PublicRelayConfig>
    : {}
  if (value.enabled === false) return null
  const relayOrigin = value.relayOrigin || DEFAULT_PUBLIC_RELAY_ORIGIN
  const url = new URL(relayOrigin)
  if (url.protocol !== 'https:' || (url.port && url.port !== '443') ||
      url.username || url.password || url.search || url.hash || url.pathname !== '/') {
    throw new Error('Public relay origin must be a bare HTTPS origin')
  }
  return { enabled: true, relayOrigin: url.origin }
}

export function loadOrCreateAgentIdentity(identityPath = defaultAgentIdentityPath()): AgentIdentity {
  if (existsSync(identityPath)) {
    const stored = readPrivateJson<AgentIdentity>(identityPath)
    const expected = agentNodeIdForPublicKey(stored.publicKeyPem)
    if (stored.nodeId !== expected || !stored.privateKeyPem) throw new Error('Public relay identity file is invalid')
    return stored
  }
  const pair = generateKeyPairSync('ed25519')
  const publicKeyPem = pair.publicKey.export({ type: 'spki', format: 'pem' }).toString()
  const privateKeyPem = pair.privateKey.export({ type: 'pkcs8', format: 'pem' }).toString()
  const identity = { nodeId: agentNodeIdForPublicKey(publicKeyPem), publicKeyPem, privateKeyPem }
  writePrivateJsonAtomic(identityPath, identity)
  return identity
}

export class PublicRelayAgent {
  readonly config: PublicRelayConfig
  readonly identity: AgentIdentity
  readonly options: PublicRelayAgentOptions
  readonly fetchImpl: typeof fetch
  private socket: WebSocket | null = null
  private stopped = true
  private reconnectAttempt = 0
  private reconnectTimer: NodeJS.Timeout | null = null
  private enrollment: Promise<{ ticket?: string; expiresAt?: number }> | null = null
  private status: AgentStatus

  constructor(config: PublicRelayConfig, options: PublicRelayAgentOptions) {
    this.config = config
    this.options = options
    this.fetchImpl = options.fetchImpl || fetch
    this.identity = loadOrCreateAgentIdentity(options.identityPath)
    this.status = {
      enabled: true,
      state: 'offline',
      nodeId: this.identity.nodeId,
      identityPublicKey: this.identity.publicKeyPem,
      relayOrigin: config.relayOrigin,
      hostId: options.hostId,
      agentInstanceId: options.agentInstanceId,
      hostName: options.hostName || hostname(),
      agentKind: options.agentKind || 'deepseek-harness',
      agentName: options.agentName || 'DeepSeek Harness',
      agentVersion: options.agentVersion,
      adapterVersion: options.adapterVersion,
      hostPlatform: options.hostPlatform,
      capabilities: options.capabilities,
    }
  }

  snapshot(): AgentStatus {
    return { ...this.status }
  }

  async start(): Promise<void> {
    if (!this.stopped) return
    this.stopped = false
    await this.enrollAndConnect()
  }

  /** Ensure a desktop pairing surface never serves an expired cloud ticket. */
  async ensurePairingTicket(minValidityMs = 60_000): Promise<AgentStatus> {
    if (this.status.pairingTicket && (this.status.pairingExpiresAt || 0) > Date.now() + minValidityMs) {
      return this.snapshot()
    }
    const body = await this.enroll()
    this.update({ pairingTicket: body.ticket, pairingExpiresAt: body.expiresAt })
    return this.snapshot()
  }

  stop(): void {
    this.stopped = true
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer)
    this.reconnectTimer = null
    this.socket?.close(1000, 'Agent stopped')
    this.socket = null
    this.update({ state: 'offline' })
  }

  private async enrollAndConnect(): Promise<void> {
    try {
      this.update({ state: 'enrolling', lastError: undefined })
      const body = await this.enroll()
      this.update({ pairingTicket: body.ticket, pairingExpiresAt: body.expiresAt, state: 'connecting' })
      this.connect()
    } catch (error) {
      this.update({ state: 'offline', lastError: error instanceof Error ? error.message : String(error) })
      this.scheduleReconnect()
    }
  }

  private enroll(): Promise<{ ticket?: string; expiresAt?: number }> {
    if (this.enrollment) return this.enrollment
    this.enrollment = (async () => {
      const timestamp = Date.now()
      const nonce = randomBytes(18).toString('base64url')
      const signature = sign(
        null,
        Buffer.from(`enroll\n${this.identity.nodeId}\n${timestamp}\n${nonce}`),
        this.identity.privateKeyPem,
      ).toString('base64url')
      const response = await this.fetchImpl(`${this.config.relayOrigin}/v1/agents/enroll`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          publicKey: this.identity.publicKeyPem,
          timestamp,
          nonce,
          signature,
          displayName: this.options.displayName || `${this.options.agentName || 'DeepSeek Harness'} · ${this.options.hostName || hostname()}`,
          agentKind: this.options.agentKind || 'deepseek-harness',
          agentName: this.options.agentName || 'DeepSeek Harness',
          agentVersion: this.options.agentVersion,
          adapterVersion: this.options.adapterVersion,
          hostId: this.options.hostId,
          agentInstanceId: this.options.agentInstanceId,
          hostPlatform: this.options.hostPlatform,
          capabilities: this.options.capabilities,
          hostName: this.options.hostName || hostname(),
        }),
        signal: AbortSignal.timeout(10_000),
      })
      if (!response.ok) throw new Error(`Relay enrollment failed with HTTP ${response.status}`)
      return await response.json() as { ticket?: string; expiresAt?: number }
    })()
    return this.enrollment.finally(() => { this.enrollment = null })
  }

  private connect(): void {
    const timestamp = Date.now()
    const nonce = randomBytes(18).toString('base64url')
    const signature = sign(
      null,
      Buffer.from(`connect\n${this.identity.nodeId}\n${timestamp}\n${nonce}`),
      this.identity.privateKeyPem,
    ).toString('base64url')
    const socketUrl = new URL(this.config.relayOrigin)
    // loadPublicRelayConfig only permits HTTPS in production. HTTP support is
    // retained solely for loopback integration tests without TLS termination.
    socketUrl.protocol = socketUrl.protocol === 'https:' ? 'wss:' : 'ws:'
    socketUrl.pathname = '/v1/ws/agent'
    socketUrl.searchParams.set('nodeId', this.identity.nodeId)
    const socket = new WebSocket(socketUrl, {
      headers: {
        'x-hr-timestamp': String(timestamp),
        'x-hr-nonce': nonce,
        'x-hr-signature': signature,
      },
      maxPayload: 1024 * 1024,
      perMessageDeflate: false,
    })
    this.socket = socket
    socket.on('open', () => {
      if (this.socket !== socket) return
      this.reconnectAttempt = 0
      this.update({ state: 'online', lastError: undefined })
    })
    socket.on('message', (data, isBinary) => {
      if (!isBinary) {
        try {
          const event = JSON.parse(data.toString()) as { readonly type?: unknown; readonly clientId?: unknown }
          if (event.type === 'client.disconnected' && typeof event.clientId === 'string') {
            this.options.onClientDisconnect?.(event.clientId)
          }
        } catch { /* ignore unknown relay control frames */ }
        return
      }
      const frame = Buffer.isBuffer(data)
        ? data
        : Array.isArray(data)
          ? Buffer.concat(data)
          : Buffer.from(new Uint8Array(data))
      if (frame.length < ROUTING_HEADER_BYTES || frame[0] !== 1 || frame[1] !== 1) {
        socket.close(1002, 'Invalid relay routing frame')
        return
      }
      const header = frame.subarray(0, ROUTING_HEADER_BYTES)
      const clientId = header.subarray(2).toString('base64url')
      const reply = (payload: Uint8Array): Promise<void> => this.sendRouted(socket, header, payload)
      // Start from an already-resolved promise so a synchronous callback throw
      // is converted into a rejection. Promise.resolve(callback()) evaluates
      // callback first and would otherwise let the exception terminate DSH.
      void this.dispatchFrame({ clientId, payload: frame.subarray(ROUTING_HEADER_BYTES), reply })
    })
    socket.on('close', (_code, reason) => {
      if (this.socket !== socket) return
      this.socket = null
      this.update({ state: 'offline', lastError: reason.toString() || 'Relay connection closed' })
      try { this.options.onTransportDisconnect?.() } catch { /* isolation boundary */ }
      this.scheduleReconnect()
    })
    socket.on('error', () => { /* close drives the retry state */ })
  }

  private scheduleReconnect(): void {
    if (this.stopped || this.reconnectTimer) return
    const delay = Math.min(1000 * 2 ** this.reconnectAttempt, 30_000) + Math.floor(Math.random() * 500)
    this.reconnectAttempt += 1
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null
      if (!this.stopped) void this.enrollAndConnect()
    }, delay)
    this.reconnectTimer.unref?.()
  }

  private async dispatchFrame(frame: RelayClientFrame): Promise<void> {
    try {
      await this.options.onFrame(frame)
    } catch (error) {
      try { this.options.onClientError?.(frame.clientId, error) } catch { /* isolation boundary */ }
    }
  }

  private async sendRouted(socket: WebSocket, header: Buffer, payload: Uint8Array): Promise<void> {
    const deadline = Date.now() + AGENT_BUFFER_DRAIN_TIMEOUT_MS
    while (socket.readyState === WebSocket.OPEN && socket.bufferedAmount > MAX_AGENT_BUFFERED_BYTES) {
      if (Date.now() >= deadline) throw new Error('Agent relay backpressure drain timed out')
      await wait(10)
    }
    if (socket.readyState !== WebSocket.OPEN) throw new Error('Agent relay connection is closed')
    const frame = Buffer.concat([header, Buffer.from(payload)])
    await new Promise<void>((resolve, reject) => {
      socket.send(frame, { binary: true }, error => error ? reject(error) : resolve())
    })
  }

  private update(patch: Partial<AgentStatus>): void {
    this.status = { ...this.status, ...patch }
    this.options.onStatus?.(this.snapshot())
  }
}

export function publicPairingPayload(status: AgentStatus): string | null {
  if (!status.nodeId || !status.identityPublicKey || !status.pairingTicket || !status.pairingExpiresAt || !status.relayOrigin) return null
  return JSON.stringify({
    v: 1,
    mode: 'public-relay',
    relay: status.relayOrigin,
    nodeId: status.nodeId,
    identityPublicKey: status.identityPublicKey,
    ticket: status.pairingTicket,
    expiresAt: status.pairingExpiresAt,
    ...(status.hostId ? { hostId: status.hostId } : {}),
    ...(status.agentInstanceId ? { agentInstanceId: status.agentInstanceId } : {}),
    ...(status.hostName ? { hostName: status.hostName } : {}),
    ...(status.agentKind ? { agentKind: status.agentKind } : {}),
    ...(status.agentName ? { agentName: status.agentName } : {}),
    ...(status.agentVersion ? { agentVersion: status.agentVersion } : {}),
    ...(status.adapterVersion ? { adapterVersion: status.adapterVersion } : {}),
    ...(status.hostPlatform ? { hostPlatform: status.hostPlatform } : {}),
    ...(status.capabilities ? { capabilities: status.capabilities } : {}),
  })
}
