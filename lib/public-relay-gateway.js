/** Product boundary that joins relay routing, E2EE sessions, and local DSH virtual streams. */
import { createHash } from 'node:crypto';
import { DshTunnelAgent } from './dsh-tunnel-agent.js';
import { AgentE2EESession } from './e2ee-session.js';
import { PublicRelayAgent, } from './public-relay-agent.js';
import { decryptRemoteAttachment, encryptCloudObject } from './object-crypto.js';
import { PublicObjectClient } from './public-object-client.js';
export class PublicRelayGateway {
    agent;
    clients = new Map();
    dshPort;
    maxClients;
    maxStreamsPerClient;
    issueLanCredential;
    objectClient;
    historySnapshots = new Map();
    pendingHistorySnapshots = new Map();
    constructor(config, options) {
        this.dshPort = options.dshPort || 3080;
        // One personal Agent should only have a handful of simultaneously active
        // phone clients. Keep the bound small so an owned relay account cannot
        // exhaust the desktop DSH process.
        this.maxClients = options.maxClients || 8;
        this.maxStreamsPerClient = options.maxStreamsPerClient || 32;
        this.issueLanCredential = options.issueLanCredential;
        const agentOptions = {
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
        };
        this.agent = new PublicRelayAgent(config, agentOptions);
        this.objectClient = new PublicObjectClient(config.relayOrigin, this.agent.identity, this.agent.fetchImpl);
    }
    start() {
        return this.agent.start();
    }
    stop() {
        for (const clientId of this.clients.keys())
            this.disconnect(clientId);
        this.agent.stop();
    }
    snapshot() {
        return this.agent.snapshot();
    }
    async uploadHistorySnapshot(payloadJson) {
        const digest = createHash('sha256').update(payloadJson).digest('base64url');
        const cached = this.historySnapshots.get(digest);
        if (cached && cached.expiresAt > Date.now() + 60_000)
            return cached.descriptor;
        const pending = this.pendingHistorySnapshots.get(digest);
        if (pending)
            return pending;
        const upload = (async () => {
            const encrypted = encryptCloudObject(new TextEncoder().encode(payloadJson), 'history-json');
            const ticket = await this.objectClient.upload('history', encrypted.ciphertext);
            const descriptor = { ...encrypted.descriptor, objectId: ticket.objectId, expiresAt: ticket.expiresAt };
            this.historySnapshots.set(digest, { descriptor, expiresAt: ticket.expiresAt });
            while (this.historySnapshots.size > 32) {
                const oldest = this.historySnapshots.keys().next().value;
                if (!oldest)
                    break;
                this.historySnapshots.delete(oldest);
            }
            return descriptor;
        })();
        this.pendingHistorySnapshots.set(digest, upload);
        try {
            return await upload;
        }
        finally {
            this.pendingHistorySnapshots.delete(digest);
        }
    }
    async ensurePairingStatus() {
        return this.agent.ensurePairingTicket();
    }
    async receive(frame) {
        let client = this.clients.get(frame.clientId);
        if (!client) {
            if (this.clients.size >= this.maxClients)
                throw new Error('Public Agent client limit reached');
            client = {
                e2ee: new AgentE2EESession({
                    nodeId: this.agent.identity.nodeId,
                    identityPrivateKeyPem: this.agent.identity.privateKeyPem,
                }),
                tunnel: null,
                reply: frame.reply,
            };
            this.clients.set(frame.clientId, client);
        }
        else {
            client.reply = frame.reply;
        }
        try {
            const result = client.e2ee.receive(frame.payload);
            for (const outbound of result.outbound || [])
                await client.reply(outbound);
            if (result.ready && !client.tunnel) {
                client.tunnel = new DshTunnelAgent({
                    dshPort: this.dshPort,
                    maxStreams: this.maxStreamsPerClient,
                    issueLanCredential: this.issueLanCredential,
                    materializeAttachment: async (raw) => {
                        const descriptor = raw;
                        const ciphertext = await this.objectClient.download(descriptor.objectId);
                        return decryptRemoteAttachment(ciphertext, descriptor);
                    },
                    send: clearFrame => client.reply(client.e2ee.seal(clearFrame)),
                });
            }
            if (result.data) {
                if (!client.tunnel)
                    throw new Error('DSH tunnel arrived before E2EE key confirmation');
                client.tunnel.receive(result.data);
            }
        }
        catch (error) {
            this.disconnect(frame.clientId);
            throw error;
        }
    }
    disconnect(clientId) {
        const client = this.clients.get(clientId);
        if (!client)
            return;
        this.clients.delete(clientId);
        client.tunnel?.close();
    }
    disconnectAll() {
        for (const clientId of [...this.clients.keys()])
            this.disconnect(clientId);
    }
}
export default PublicRelayGateway;
