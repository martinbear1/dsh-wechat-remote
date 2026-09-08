/** The existing identity-pinned E2EE + DSH tunnel on a local carrier.
 * No bearer header, DSH request, or session is accepted before encrypted auth.
 */
import { timingSafeEqual } from 'node:crypto'
import { WebSocket, WebSocketServer } from 'ws'
import { AgentE2EESession } from './e2ee-session.js'
import { DshTunnelAgent } from './dsh-tunnel-agent.js'
import type { AgentIdentity } from './public-relay-agent.js'
import type { DshCompatibilityTransport } from './dsh-compatibility-api.js'

export class SecureLanServer {
  readonly sockets = new WebSocketServer({ noServer: true, maxPayload: 1024 * 1024, perMessageDeflate: false })
  constructor(private readonly options: {
    identity: () => AgentIdentity | undefined
    token: () => string
    dshPort: number
    compatibilityApi?: DshCompatibilityTransport
    createTunnel?: (send: (frame: Uint8Array) => Promise<void>) => DshTunnelAgent
  }) {}

  attach(ws: WebSocket): void {
    const identity = this.options.identity()
    if (!identity || this.sockets.clients.size > 8) { ws.close(1013, 'LAN unavailable'); return }
    const e2ee = new AgentE2EESession({ nodeId: identity.nodeId, identityPrivateKeyPem: identity.privateKeyPem })
    let tunnel: DshTunnelAgent | undefined
    let credential = ''
    const deadline = setTimeout(() => ws.terminate(), 12_000)
    deadline.unref?.()
    let alive = true
    const heartbeat = setInterval(() => {
      if (!alive || identity !== this.options.identity() || (credential && credential !== this.options.token())) {
        ws.terminate(); return
      }
      alive = false
      if (ws.readyState === WebSocket.OPEN) ws.ping()
    }, 25_000)
    heartbeat.unref?.()
    ws.on('pong', () => { alive = true })
    const send = (data: Uint8Array): Promise<void> => new Promise((resolve, reject) => {
      if (identity !== this.options.identity() || (credential && credential !== this.options.token()) ||
          ws.readyState !== WebSocket.OPEN || ws.bufferedAmount > 2 * 1024 * 1024) {
        ws.terminate(); reject(new Error('LAN transport unavailable')); return
      }
      ws.send(data, { binary: true }, error => error ? reject(error) : resolve())
    })
    ws.on('message', (raw, binary) => {
      try {
        if (!binary || identity !== this.options.identity()) throw new Error('LAN identity changed')
        const bytes = Buffer.isBuffer(raw) ? raw : Buffer.concat(Array.isArray(raw) ? raw : [Buffer.from(raw)])
        const result = e2ee.receive(bytes)
        for (const frame of result.outbound || []) void send(frame).catch(() => ws.terminate())
        if (!result.data) return
        if (!tunnel) {
          if (result.data.length > 256) throw new Error('Invalid LAN authentication')
          const auth = JSON.parse(Buffer.from(result.data).toString('utf8'))
          const expected = Buffer.from(this.options.token())
          const presented = Buffer.from(typeof auth.token === 'string' ? auth.token : '')
          if (auth.type !== 'lan.authenticate' || expected.length < 32 || presented.length !== expected.length ||
              !timingSafeEqual(presented, expected)) throw new Error('Invalid LAN authentication')
          credential = auth.token
          const sendClear = (data: Uint8Array): Promise<void> => send(e2ee.seal(data))
          tunnel = this.options.createTunnel ? this.options.createTunnel(sendClear) : new DshTunnelAgent({ dshPort: this.options.dshPort,
            compatibilityApi: this.options.compatibilityApi,
            maxStreams: 32, send: sendClear })
          clearTimeout(deadline)
          void send(e2ee.seal(Buffer.from('{"type":"lan.ready"}'))).catch(() => ws.terminate())
        } else {
          if (credential !== this.options.token()) throw new Error('LAN credential changed')
          tunnel.receive(result.data)
        }
      } catch { ws.close(4002, 'LAN authentication or protocol failed') }
    })
    ws.on('error', () => {})
    ws.on('close', () => { clearTimeout(deadline); clearInterval(heartbeat); tunnel?.close() })
  }

  close(): void {
    for (const socket of this.sockets.clients) socket.terminate()
    this.sockets.close()
  }
}
