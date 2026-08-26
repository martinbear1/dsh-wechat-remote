/** Product boundary that joins relay routing, E2EE sessions, and local DSH virtual streams. */
import { createHash } from 'node:crypto'
import { DshTunnelAgent } from './dsh-tunnel-agent.js'
import { AgentE2EESession } from './e2ee-session.js'
import {
  PublicRelayAgent,
  type AgentStatus,
  type PublicRelayAgentOptions,
  type PublicRelayConfig,
  type RelayClientFrame,
} from './public-relay-agent.js'
import type { AgentCapability } from './agent-metadata.js'
import type { WechatAttachmentObjectDescriptor } from './attachment-service.js'
import type { HostPlatformDescriptor } from './host-platform.js'
import { decryptRemoteAttachment, encryptCloudObject, type RemoteAttachmentDescriptor } from './object-crypto.js'
import { archiveHistoryJson, HISTORY_ARCHIVE_ENTRY } from './history-archive.js'
import { PublicObjectClient } from './public-object-client.js'
import HistorySnapshotCache from './history-snapshot-cache.js'

// Compact history is already protected by the node/client E2EE session.  A
// small ZIP is faster and cheaper to carry in that existing response than to
// perform the three-step OSS cold-upload handshake.  Large archives still use
// OSS so they do not occupy the realtime relay or the mini-program JS thread.
const INLINE_HISTORY_ARCHIVE_MAX_BYTES = 96 * 1024

interface ClientContext {
  readonly e2ee: AgentE2EESession
  tunnel: DshTunnelAgent | null
  reply: RelayClientFrame['reply']
}

export interface PublicRelayGatewayOptions {
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
  readonly dshPort?: number
  readonly maxClients?: number
  readonly maxStreamsPerClient?: number
  readonly issueLanCredential?: (rotate?: boolean) => { readonly baseUrl: string; readonly token: string }
  readonly onStatus?: (status: AgentStatus) => void
  readonly fetchImpl?: typeof fetch
  readonly identityPath?: string
  readonly historyCachePath?: string
  readonly onDiagnostic?: (level: 'info' | 'warn', message: string) => void
}

export class PublicRelayGateway {
  readonly agent: PublicRelayAgent
  private readonly clients = new Map<string, ClientContext>()
  private readonly dshPort: number
  private readonly maxClients: number
  private readonly maxStreamsPerClient: number
  private readonly issueLanCredential?: PublicRelayGatewayOptions['issueLanCredential']
  private readonly objectClient: PublicObjectClient
  private readonly historySnapshots: HistorySnapshotCache
  private readonly pendingHistorySnapshots = new Map<string, Promise<Record<string, unknown>>>()
  private readonly attachmentObjects = new Map<string, {
    readonly descriptor: WechatAttachmentObjectDescriptor
    readonly expiresAt: number
  }>()
  private readonly pendingAttachmentObjects = new Map<string, Promise<WechatAttachmentObjectDescriptor>>()

  constructor(config: PublicRelayConfig, options: PublicRelayGatewayOptions) {
    this.dshPort = options.dshPort || 3080
    // One personal Agent should only have a handful of simultaneously active
    // phone clients. Keep the bound small so an owned relay account cannot
    // exhaust the desktop DSH process.
    this.maxClients = options.maxClients || 8
    this.maxStreamsPerClient = options.maxStreamsPerClient || 32
    this.issueLanCredential = options.issueLanCredential
    const agentOptions: PublicRelayAgentOptions = {
      agentVersion: options.agentVersion,
      adapterVersion: options.adapterVersion,
      hostId: options.hostId,
      agentInstanceId: options.agentInstanceId,
      agentKind: options.agentKind,
      agentName: options.agentName,
      hostName: options.hostName,
      hostPlatform: options.hostPlatform,
      capabilities: options.capabilities,
      displayName: options.displayName,
      fetchImpl: options.fetchImpl,
      identityPath: options.identityPath,
      onStatus: options.onStatus,
      onFrame: frame => this.receive(frame),
      onClientDisconnect: clientId => this.disconnect(clientId),
      onClientError: clientId => this.disconnect(clientId),
      onTransportDisconnect: () => this.disconnectAll(),
    }
    this.agent = new PublicRelayAgent(config, agentOptions)
    this.objectClient = new PublicObjectClient(config.relayOrigin, this.agent.identity, this.agent.fetchImpl)
    this.historySnapshots = new HistorySnapshotCache({
      file: options.historyCachePath,
      onDiagnostic: options.onDiagnostic,
    })
  }

  start(): Promise<void> {
    return this.agent.start()
  }

  stop(): void {
    for (const clientId of this.clients.keys()) this.disconnect(clientId)
    this.agent.stop()
  }

  snapshot(): AgentStatus {
    return this.agent.snapshot()
  }

  async prepareHistorySnapshot(payloadJson: string): Promise<Record<string, unknown>> {
    const archive = archiveHistoryJson(payloadJson)
    if (archive.byteLength <= INLINE_HISTORY_ARCHIVE_MAX_BYTES) {
      return {
        contentKind: 'history-json',
        contentEncoding: 'zip',
        archiveEntry: HISTORY_ARCHIVE_ENTRY,
        originalBytes: Buffer.byteLength(payloadJson),
        archiveBase64: Buffer.from(archive).toString('base64'),
      }
    }
    const digest = createHash('sha256').update(payloadJson).digest('base64url')
    const cached = this.historySnapshots.get(digest)
    if (cached) return cached
    const pending = this.pendingHistorySnapshots.get(digest)
    if (pending) return pending
    const upload = (async (): Promise<Record<string, unknown>> => {
      const encrypted = encryptCloudObject(archive, 'history-json')
      const ticket = await this.objectClient.upload('history', encrypted.ciphertext)
      const descriptor = {
        ...encrypted.descriptor,
        objectId: ticket.objectId,
        expiresAt: ticket.expiresAt,
        contentEncoding: 'zip',
        archiveEntry: HISTORY_ARCHIVE_ENTRY,
        originalBytes: Buffer.byteLength(payloadJson),
      }
      return this.historySnapshots.set(digest, descriptor)
    })()
    this.pendingHistorySnapshots.set(digest, upload)
    try {
      return await upload
    } finally {
      this.pendingHistorySnapshots.delete(digest)
    }
  }

  async uploadAttachmentObject(
    data: Uint8Array,
    metadata: { readonly attachmentId: string; readonly mediaType: string; readonly name?: string },
    signal?: AbortSignal,
  ): Promise<WechatAttachmentObjectDescriptor> {
    const digest = createHash('sha256')
      .update(data)
      .update('\0')
      .update(metadata.mediaType)
      .digest('base64url')
    const cached = this.attachmentObjects.get(digest)
    if (cached && cached.expiresAt > Date.now() + 60_000) return cached.descriptor
    const pending = this.pendingAttachmentObjects.get(digest)
    if (pending) return await waitFor(pending, signal)
    const transferSignal = AbortSignal.timeout(60_000)
    const upload = (async (): Promise<WechatAttachmentObjectDescriptor> => {
      const encrypted = encryptCloudObject(data, 'image')
      const ticket = await this.objectClient.upload('attachment', encrypted.ciphertext, transferSignal)
      const descriptor = {
        ...encrypted.descriptor,
        contentKind: 'image' as const,
        objectId: ticket.objectId,
        expiresAt: ticket.expiresAt,
        mediaType: metadata.mediaType,
        ...(metadata.name ? { name: metadata.name } : {}),
      }
      this.attachmentObjects.set(digest, { descriptor, expiresAt: ticket.expiresAt })
      while (this.attachmentObjects.size > 128) {
        const oldest = this.attachmentObjects.keys().next().value as string | undefined
        if (!oldest) break
        this.attachmentObjects.delete(oldest)
      }
      return descriptor
    })()
    this.pendingAttachmentObjects.set(digest, upload)
    void upload.finally(() => {
      if (this.pendingAttachmentObjects.get(digest) === upload) {
        this.pendingAttachmentObjects.delete(digest)
      }
    }).catch(() => { /* waiting callers observe the original rejection */ })
    return await waitFor(upload, signal)
  }

  async ensurePairingStatus(): Promise<AgentStatus> {
    return this.agent.ensurePairingTicket()
  }

  private async receive(frame: RelayClientFrame): Promise<void> {
    let client = this.clients.get(frame.clientId)
    if (!client) {
      if (this.clients.size >= this.maxClients) throw new Error('Public Agent client limit reached')
      client = {
        e2ee: new AgentE2EESession({
          nodeId: this.agent.identity.nodeId,
          identityPrivateKeyPem: this.agent.identity.privateKeyPem,
        }),
        tunnel: null,
        reply: frame.reply,
      }
      this.clients.set(frame.clientId, client)
    } else {
      client.reply = frame.reply
    }

    try {
      const result = client.e2ee.receive(frame.payload)
      for (const outbound of result.outbound || []) await client.reply(outbound)
      if (result.ready && !client.tunnel) {
        client.tunnel = new DshTunnelAgent({
          dshPort: this.dshPort,
          maxStreams: this.maxStreamsPerClient,
          issueLanCredential: this.issueLanCredential,
          materializeAttachment: async (raw, signal) => {
            const descriptor = raw as RemoteAttachmentDescriptor
            const ciphertext = await this.objectClient.download(descriptor.objectId, undefined, signal)
            return decryptRemoteAttachment(ciphertext, descriptor)
          },
          send: clearFrame => client!.reply(client!.e2ee.seal(clearFrame)),
        })
      }
      if (result.data) {
        if (!client.tunnel) throw new Error('DSH tunnel arrived before E2EE key confirmation')
        client.tunnel.receive(result.data)
      }
    } catch (error) {
      this.disconnect(frame.clientId)
      throw error
    }
  }

  private disconnect(clientId: string): void {
    const client = this.clients.get(clientId)
    if (!client) return
    this.clients.delete(clientId)
    client.tunnel?.close()
  }

  private disconnectAll(): void {
    for (const clientId of [...this.clients.keys()]) this.disconnect(clientId)
  }
}

async function waitFor<T>(promise: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return await promise
  signal.throwIfAborted()
  return await new Promise<T>((resolve, reject) => {
    const abort = (): void => reject(signal.reason || new Error('Object transfer aborted'))
    signal.addEventListener('abort', abort, { once: true })
    promise.then(
      value => { signal.removeEventListener('abort', abort); resolve(value) },
      error => { signal.removeEventListener('abort', abort); reject(error) },
    )
  })
}

export default PublicRelayGateway
