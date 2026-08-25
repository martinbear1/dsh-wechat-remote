/** Product boundary that joins relay routing, E2EE sessions, and local DSH virtual streams. */
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
  readonly capabilities?: readonly AgentCapability[]
  readonly displayName?: string
  readonly dshPort?: number
  readonly maxClients?: number
  readonly maxStreamsPerClient?: number
  readonly issueLanCredential?: (rotate?: boolean) => { readonly baseUrl: string; readonly token: string }
  readonly onStatus?: (status: AgentStatus) => void
  readonly fetchImpl?: typeof fetch
  readonly identityPath?: string
}

export class PublicRelayGateway {
  readonly agent: PublicRelayAgent
  private readonly clients = new Map<string, ClientContext>()
  private readonly dshPort: number
  private readonly maxClients: number
  private readonly maxStreamsPerClient: number
  private readonly issueLanCredential?: PublicRelayGatewayOptions['issueLanCredential']

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

export default PublicRelayGateway
