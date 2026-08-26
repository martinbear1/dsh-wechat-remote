/**
 * Outbound-only public relay transport for Harness Remote.
 *
 * This module is deliberately isolated from the existing LAN gate. It opens no
 * public port and does not change DSH/WebUI configuration. Product builds use
 * the official relay by default so one QR always carries public + LAN routes;
 * ~/.dsh/harness-remote-public.json may explicitly disable or override it.
 */
import { createHash, generateKeyPairSync, randomBytes, sign, } from 'node:crypto';
import { existsSync, readFileSync, } from 'node:fs';
import { homedir, hostname } from 'node:os';
import path from 'node:path';
import { WebSocket } from 'ws';
import { defaultAgentIdentityPath } from './agent-metadata.js';
import { readPrivateJson, writePrivateJsonAtomic } from './secure-file.js';
const CONFIG_PATH = path.join(homedir(), '.dsh', 'harness-remote-public.json');
export const DEFAULT_PUBLIC_RELAY_ORIGIN = 'https://relay.xyxfood.xyz';
const ROUTING_HEADER_BYTES = 18;
const MAX_AGENT_BUFFERED_BYTES = 2 * 1024 * 1024;
const AGENT_BUFFER_DRAIN_TIMEOUT_MS = 15_000;
function wait(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}
export function agentNodeIdForPublicKey(publicKeyPem) {
    const der = Buffer.from(publicKeyPem
        .replace(/-----BEGIN PUBLIC KEY-----|-----END PUBLIC KEY-----|\s/g, ''), 'base64');
    return createHash('sha256').update(der).digest().subarray(0, 18).toString('base64url');
}
export function loadPublicRelayConfig(configPath = CONFIG_PATH) {
    const value = existsSync(configPath)
        ? JSON.parse(readFileSync(configPath, 'utf8'))
        : {};
    if (value.enabled === false)
        return null;
    const relayOrigin = value.relayOrigin || DEFAULT_PUBLIC_RELAY_ORIGIN;
    const url = new URL(relayOrigin);
    if (url.protocol !== 'https:' || (url.port && url.port !== '443') ||
        url.username || url.password || url.search || url.hash || url.pathname !== '/') {
        throw new Error('Public relay origin must be a bare HTTPS origin');
    }
    return { enabled: true, relayOrigin: url.origin };
}
export function loadOrCreateAgentIdentity(identityPath = defaultAgentIdentityPath()) {
    if (existsSync(identityPath)) {
        const stored = readPrivateJson(identityPath);
        const expected = agentNodeIdForPublicKey(stored.publicKeyPem);
        if (stored.nodeId !== expected || !stored.privateKeyPem)
            throw new Error('Public relay identity file is invalid');
        return stored;
    }
    const pair = generateKeyPairSync('ed25519');
    const publicKeyPem = pair.publicKey.export({ type: 'spki', format: 'pem' }).toString();
    const privateKeyPem = pair.privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
    const identity = { nodeId: agentNodeIdForPublicKey(publicKeyPem), publicKeyPem, privateKeyPem };
    writePrivateJsonAtomic(identityPath, identity);
    return identity;
}
export class PublicRelayAgent {
    config;
    identity;
    options;
    fetchImpl;
    socket = null;
    stopped = true;
    reconnectAttempt = 0;
    reconnectTimer = null;
    enrollment = null;
    status;
    constructor(config, options) {
        this.config = config;
        this.options = options;
        this.fetchImpl = options.fetchImpl || fetch;
        this.identity = loadOrCreateAgentIdentity(options.identityPath);
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
        };
    }
    snapshot() {
        return { ...this.status };
    }
    async start() {
        if (!this.stopped)
            return;
        this.stopped = false;
        await this.enrollAndConnect();
    }
    /** Ensure a desktop pairing surface never serves an expired cloud ticket. */
    async ensurePairingTicket(minValidityMs = 60_000) {
        if (this.status.pairingTicket && (this.status.pairingExpiresAt || 0) > Date.now() + minValidityMs) {
            return this.snapshot();
        }
        const body = await this.enroll();
        this.update({
            pairingTicket: body.ticket,
            pairingExpiresAt: body.expiresAt,
            ...(body.remoteAccess ? { remoteAccess: body.remoteAccess } : {}),
        });
        return this.snapshot();
    }
    stop() {
        this.stopped = true;
        if (this.reconnectTimer)
            clearTimeout(this.reconnectTimer);
        this.reconnectTimer = null;
        this.socket?.close(1000, 'Agent stopped');
        this.socket = null;
        this.update({ state: 'offline' });
    }
    async enrollAndConnect() {
        try {
            this.update({ state: 'enrolling', lastError: undefined });
            const body = await this.enroll();
            this.update({
                pairingTicket: body.ticket,
                pairingExpiresAt: body.expiresAt,
                state: 'connecting',
                ...(body.remoteAccess ? { remoteAccess: body.remoteAccess } : {}),
            });
            this.connect();
        }
        catch (error) {
            this.update({ state: 'offline', lastError: error instanceof Error ? error.message : String(error) });
            this.scheduleReconnect();
        }
    }
    enroll() {
        if (this.enrollment)
            return this.enrollment;
        this.enrollment = (async () => {
            const timestamp = Date.now();
            const nonce = randomBytes(18).toString('base64url');
            const signature = sign(null, Buffer.from(`enroll\n${this.identity.nodeId}\n${timestamp}\n${nonce}`), this.identity.privateKeyPem).toString('base64url');
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
            });
            if (!response.ok)
                throw new Error(`Relay enrollment failed with HTTP ${response.status}`);
            const body = await response.json();
            return {
                ticket: body.ticket,
                expiresAt: body.expiresAt,
                remoteAccess: normalizeRemoteAccess(body.remoteAccess),
            };
        })();
        return this.enrollment.finally(() => { this.enrollment = null; });
    }
    connect() {
        const timestamp = Date.now();
        const nonce = randomBytes(18).toString('base64url');
        const signature = sign(null, Buffer.from(`connect\n${this.identity.nodeId}\n${timestamp}\n${nonce}`), this.identity.privateKeyPem).toString('base64url');
        const socketUrl = new URL(this.config.relayOrigin);
        // loadPublicRelayConfig only permits HTTPS in production. HTTP support is
        // retained solely for loopback integration tests without TLS termination.
        socketUrl.protocol = socketUrl.protocol === 'https:' ? 'wss:' : 'ws:';
        socketUrl.pathname = '/v1/ws/agent';
        socketUrl.searchParams.set('nodeId', this.identity.nodeId);
        const socket = new WebSocket(socketUrl, {
            headers: {
                'x-hr-timestamp': String(timestamp),
                'x-hr-nonce': nonce,
                'x-hr-signature': signature,
            },
            maxPayload: 1024 * 1024,
            perMessageDeflate: false,
        });
        this.socket = socket;
        socket.on('open', () => {
            if (this.socket !== socket)
                return;
            this.reconnectAttempt = 0;
            this.update({ state: 'online', lastError: undefined });
        });
        socket.on('message', (data, isBinary) => {
            if (!isBinary) {
                try {
                    const event = JSON.parse(data.toString());
                    if (event.type === 'client.disconnected' && typeof event.clientId === 'string') {
                        this.options.onClientDisconnect?.(event.clientId);
                    }
                    else if (event.type === 'relay.ready' || event.type === 'relay.access') {
                        this.update({ remoteAccess: normalizeRemoteAccess(event.remoteAccess) });
                    }
                }
                catch { /* ignore unknown relay control frames */ }
                return;
            }
            const frame = Buffer.isBuffer(data)
                ? data
                : Array.isArray(data)
                    ? Buffer.concat(data)
                    : Buffer.from(new Uint8Array(data));
            if (frame.length < ROUTING_HEADER_BYTES || frame[0] !== 1 || frame[1] !== 1) {
                socket.close(1002, 'Invalid relay routing frame');
                return;
            }
            const header = frame.subarray(0, ROUTING_HEADER_BYTES);
            const clientId = header.subarray(2).toString('base64url');
            const reply = (payload) => this.sendRouted(socket, header, payload);
            // Start from an already-resolved promise so a synchronous callback throw
            // is converted into a rejection. Promise.resolve(callback()) evaluates
            // callback first and would otherwise let the exception terminate DSH.
            void this.dispatchFrame({ clientId, payload: frame.subarray(ROUTING_HEADER_BYTES), reply });
        });
        socket.on('close', (_code, reason) => {
            if (this.socket !== socket)
                return;
            this.socket = null;
            this.update({ state: 'offline', lastError: reason.toString() || 'Relay connection closed' });
            try {
                this.options.onTransportDisconnect?.();
            }
            catch { /* isolation boundary */ }
            this.scheduleReconnect();
        });
        socket.on('error', () => { });
    }
    scheduleReconnect() {
        if (this.stopped || this.reconnectTimer)
            return;
        const delay = Math.min(1000 * 2 ** this.reconnectAttempt, 30_000) + Math.floor(Math.random() * 500);
        this.reconnectAttempt += 1;
        this.reconnectTimer = setTimeout(() => {
            this.reconnectTimer = null;
            if (!this.stopped)
                void this.enrollAndConnect();
        }, delay);
        this.reconnectTimer.unref?.();
    }
    async dispatchFrame(frame) {
        try {
            await this.options.onFrame(frame);
        }
        catch (error) {
            try {
                this.options.onClientError?.(frame.clientId, error);
            }
            catch { /* isolation boundary */ }
        }
    }
    async sendRouted(socket, header, payload) {
        const deadline = Date.now() + AGENT_BUFFER_DRAIN_TIMEOUT_MS;
        while (socket.readyState === WebSocket.OPEN && socket.bufferedAmount > MAX_AGENT_BUFFERED_BYTES) {
            if (Date.now() >= deadline)
                throw new Error('Agent relay backpressure drain timed out');
            await wait(10);
        }
        if (socket.readyState !== WebSocket.OPEN)
            throw new Error('Agent relay connection is closed');
        const frame = Buffer.concat([header, Buffer.from(payload)]);
        await new Promise((resolve, reject) => {
            socket.send(frame, { binary: true }, error => error ? reject(error) : resolve());
        });
    }
    update(patch) {
        this.status = { ...this.status, ...patch };
        this.options.onStatus?.(this.snapshot());
    }
}
function normalizeRemoteAccess(value) {
    if (!value || typeof value !== 'object')
        return undefined;
    const raw = value;
    if (raw.status !== 'active' &&
        raw.status !== 'pending' &&
        raw.status !== 'expired' &&
        raw.status !== 'suspended' &&
        raw.status !== 'not_entitled')
        return undefined;
    return {
        status: raw.status,
        validUntil: typeof raw.validUntil === 'number' && Number.isFinite(raw.validUntil)
            ? raw.validUntil
            : null,
    };
}
export function publicPairingPayload(status) {
    if (!status.nodeId || !status.identityPublicKey || !status.pairingTicket || !status.pairingExpiresAt || !status.relayOrigin)
        return null;
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
    });
}
