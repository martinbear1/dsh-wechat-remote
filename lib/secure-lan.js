/** The existing identity-pinned E2EE + DSH tunnel on a local carrier.
 * No bearer header, DSH request, or session is accepted before encrypted auth.
 */
import { timingSafeEqual } from 'node:crypto';
import { WebSocket, WebSocketServer } from 'ws';
import { AgentE2EESession } from './e2ee-session.js';
import { DshTunnelAgent } from './dsh-tunnel-agent.js';
/**
 * Separates cheap unauthenticated handshakes from authenticated tunnels.
 * Pending clients are bounded globally and per source address; only a client
 * that proves the encrypted LAN credential can consume an active slot.
 */
export class SecureLanAdmissionPool {
    limits;
    entries = new Map();
    pendingByAddress = new Map();
    pending = 0;
    active = 0;
    constructor(limits = {}) {
        this.limits = limits;
    }
    begin(remoteAddress) {
        const address = normalizeRemoteAddress(remoteAddress);
        const maxPending = this.limits.maxPending ?? 8;
        const maxPendingPerAddress = this.limits.maxPendingPerAddress ?? 2;
        if (this.pending >= maxPending || (this.pendingByAddress.get(address) || 0) >= maxPendingPerAddress) {
            return null;
        }
        const admission = { id: Symbol('secure-lan-admission'), address };
        this.entries.set(admission.id, { address, state: 'pending' });
        this.pending += 1;
        this.pendingByAddress.set(address, (this.pendingByAddress.get(address) || 0) + 1);
        return admission;
    }
    authenticate(admission) {
        const entry = this.entries.get(admission.id);
        if (!entry || entry.state !== 'pending' || entry.address !== admission.address)
            return false;
        if (this.active >= (this.limits.maxActive ?? 8))
            return false;
        this.releasePending(entry.address);
        entry.state = 'active';
        this.active += 1;
        return true;
    }
    release(admission) {
        const entry = this.entries.get(admission.id);
        if (!entry || entry.address !== admission.address)
            return;
        this.entries.delete(admission.id);
        if (entry.state === 'pending')
            this.releasePending(entry.address);
        else
            this.active = Math.max(0, this.active - 1);
    }
    snapshot() {
        return { pending: this.pending, active: this.active, addresses: this.pendingByAddress.size };
    }
    releasePending(address) {
        this.pending = Math.max(0, this.pending - 1);
        const count = (this.pendingByAddress.get(address) || 1) - 1;
        if (count > 0)
            this.pendingByAddress.set(address, count);
        else
            this.pendingByAddress.delete(address);
    }
}
function normalizeRemoteAddress(value) {
    const address = String(value || 'unknown').trim().toLowerCase();
    return address.startsWith('::ffff:') ? address.slice(7) : address;
}
export class SecureLanServer {
    options;
    sockets = new WebSocketServer({ noServer: true, maxPayload: 1024 * 1024, perMessageDeflate: false });
    admissions;
    constructor(options) {
        this.options = options;
        this.admissions = options.admissionPool || new SecureLanAdmissionPool();
    }
    attach(ws, remoteAddress) {
        const identity = this.options.identity();
        if (!identity) {
            ws.close(1013, 'LAN unavailable');
            return;
        }
        const admission = this.admissions.begin(remoteAddress);
        if (!admission) {
            ws.close(1013, 'LAN busy');
            return;
        }
        const e2ee = new AgentE2EESession({ nodeId: identity.nodeId, identityPrivateKeyPem: identity.privateKeyPem });
        let tunnel;
        let credential = '';
        const deadline = setTimeout(() => ws.terminate(), 12_000);
        deadline.unref?.();
        let alive = true;
        const heartbeat = setInterval(() => {
            if (!alive || identity !== this.options.identity() || (credential && credential !== this.options.token())) {
                ws.terminate();
                return;
            }
            alive = false;
            if (ws.readyState === WebSocket.OPEN)
                ws.ping();
        }, 25_000);
        heartbeat.unref?.();
        ws.on('pong', () => { alive = true; });
        const send = (data) => new Promise((resolve, reject) => {
            if (identity !== this.options.identity() || (credential && credential !== this.options.token()) ||
                ws.readyState !== WebSocket.OPEN || ws.bufferedAmount > 2 * 1024 * 1024) {
                ws.terminate();
                reject(new Error('LAN transport unavailable'));
                return;
            }
            ws.send(data, { binary: true }, error => error ? reject(error) : resolve());
        });
        ws.on('message', (raw, binary) => {
            try {
                if (!binary || identity !== this.options.identity())
                    throw new Error('LAN identity changed');
                const bytes = Buffer.isBuffer(raw) ? raw : Buffer.concat(Array.isArray(raw) ? raw : [Buffer.from(raw)]);
                const result = e2ee.receive(bytes);
                for (const frame of result.outbound || [])
                    void send(frame).catch(() => ws.terminate());
                if (!result.data)
                    return;
                if (!tunnel) {
                    if (result.data.length > 256)
                        throw new Error('Invalid LAN authentication');
                    const auth = JSON.parse(Buffer.from(result.data).toString('utf8'));
                    const expected = Buffer.from(this.options.token());
                    const presented = Buffer.from(typeof auth.token === 'string' ? auth.token : '');
                    if (auth.type !== 'lan.authenticate' || expected.length < 32 || presented.length !== expected.length ||
                        !timingSafeEqual(presented, expected))
                        throw new Error('Invalid LAN authentication');
                    if (!this.admissions.authenticate(admission))
                        throw new Error('LAN capacity reached');
                    credential = auth.token;
                    const sendClear = (data) => send(e2ee.seal(data));
                    tunnel = this.options.createTunnel ? this.options.createTunnel(sendClear) : new DshTunnelAgent({ dshPort: this.options.dshPort,
                        compatibilityApi: this.options.compatibilityApi,
                        maxStreams: 32, send: sendClear });
                    clearTimeout(deadline);
                    void send(e2ee.seal(Buffer.from('{"type":"lan.ready"}'))).catch(() => ws.terminate());
                }
                else {
                    if (credential !== this.options.token())
                        throw new Error('LAN credential changed');
                    tunnel.receive(result.data);
                }
            }
            catch {
                ws.close(4002, 'LAN authentication or protocol failed');
            }
        });
        ws.on('error', () => { });
        ws.on('close', () => {
            clearTimeout(deadline);
            clearInterval(heartbeat);
            this.admissions.release(admission);
            tunnel?.close();
        });
    }
    close() {
        for (const socket of this.sockets.clients)
            socket.terminate();
        this.sockets.close();
    }
}
