/** Product boundary that joins relay routing, E2EE sessions, and local DSH virtual streams. */
import { createHash } from 'node:crypto';
import { DshTunnelAgent } from './dsh-tunnel-agent.js';
import { AgentE2EESession } from './e2ee-session.js';
import { PublicRelayAgent, } from './public-relay-agent.js';
import { decryptRemoteAttachment, encryptCloudObject } from './object-crypto.js';
import { archiveHistoryJson, HISTORY_ARCHIVE_ENTRY } from './history-archive.js';
import { PublicObjectClient } from './public-object-client.js';
import HistorySnapshotCache from './history-snapshot-cache.js';
// Compact history is already protected by the node/client E2EE session.  A
// small ZIP is faster and cheaper to carry in that existing response than to
// perform the three-step OSS cold-upload handshake.  Large archives still use
// OSS so they do not occupy the realtime relay or the mini-program JS thread.
const INLINE_HISTORY_ARCHIVE_MAX_BYTES = 96 * 1024;
export class PublicRelayGateway {
    agent;
    clients = new Map();
    dshPort;
    compatibilityApi;
    maxClients;
    maxStreamsPerClient;
    issueLanCredential;
    objectClient;
    historySnapshots;
    pendingHistorySnapshots = new Map();
    attachmentObjects = new Map();
    pendingAttachmentObjects = new Map();
    constructor(config, options) {
        this.dshPort = options.dshPort || 3080;
        this.compatibilityApi = options.compatibilityApi;
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
        this.historySnapshots = new HistorySnapshotCache({
            file: options.historyCachePath,
            onDiagnostic: options.onDiagnostic,
        });
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
    async prepareHistorySnapshot(payloadJson) {
        const archive = archiveHistoryJson(payloadJson);
        if (archive.byteLength <= INLINE_HISTORY_ARCHIVE_MAX_BYTES) {
            return {
                contentKind: 'history-json',
                contentEncoding: 'zip',
                archiveEntry: HISTORY_ARCHIVE_ENTRY,
                originalBytes: Buffer.byteLength(payloadJson),
                archiveBase64: Buffer.from(archive).toString('base64'),
            };
        }
        const digest = createHash('sha256').update(payloadJson).digest('base64url');
        const cached = this.historySnapshots.get(digest);
        if (cached)
            return cached;
        const pending = this.pendingHistorySnapshots.get(digest);
        if (pending)
            return pending;
        const upload = (async () => {
            const encrypted = encryptCloudObject(archive, 'history-json');
            const ticket = await this.objectClient.upload('history', encrypted.ciphertext);
            const descriptor = {
                ...encrypted.descriptor,
                objectId: ticket.objectId,
                expiresAt: ticket.expiresAt,
                contentEncoding: 'zip',
                archiveEntry: HISTORY_ARCHIVE_ENTRY,
                originalBytes: Buffer.byteLength(payloadJson),
            };
            return this.historySnapshots.set(digest, descriptor);
        })();
        this.pendingHistorySnapshots.set(digest, upload);
        try {
            return await upload;
        }
        finally {
            this.pendingHistorySnapshots.delete(digest);
        }
    }
    async uploadAttachmentObject(data, metadata, signal) {
        const digest = createHash('sha256')
            .update(data)
            .update('\0')
            .update(metadata.mediaType)
            .digest('base64url');
        const cached = this.attachmentObjects.get(digest);
        if (cached && cached.expiresAt > Date.now() + 60_000)
            return cached.descriptor;
        const pending = this.pendingAttachmentObjects.get(digest);
        if (pending)
            return await waitFor(pending, signal);
        const transferSignal = AbortSignal.timeout(60_000);
        const upload = (async () => {
            const encrypted = encryptCloudObject(data, 'image');
            const ticket = await this.objectClient.upload('attachment', encrypted.ciphertext, transferSignal);
            const descriptor = {
                ...encrypted.descriptor,
                contentKind: 'image',
                objectId: ticket.objectId,
                expiresAt: ticket.expiresAt,
                mediaType: metadata.mediaType,
                ...(metadata.name ? { name: metadata.name } : {}),
            };
            this.attachmentObjects.set(digest, { descriptor, expiresAt: ticket.expiresAt });
            while (this.attachmentObjects.size > 128) {
                const oldest = this.attachmentObjects.keys().next().value;
                if (!oldest)
                    break;
                this.attachmentObjects.delete(oldest);
            }
            return descriptor;
        })();
        this.pendingAttachmentObjects.set(digest, upload);
        void upload.finally(() => {
            if (this.pendingAttachmentObjects.get(digest) === upload) {
                this.pendingAttachmentObjects.delete(digest);
            }
        }).catch(() => { });
        return await waitFor(upload, signal);
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
                    compatibilityApi: this.compatibilityApi,
                    maxStreams: this.maxStreamsPerClient,
                    issueLanCredential: this.issueLanCredential,
                    materializeAttachment: async (raw, signal) => {
                        const descriptor = raw;
                        const ciphertext = await this.objectClient.download(descriptor.objectId, undefined, signal);
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
async function waitFor(promise, signal) {
    if (!signal)
        return await promise;
    signal.throwIfAborted();
    return await new Promise((resolve, reject) => {
        const abort = () => reject(signal.reason || new Error('Object transfer aborted'));
        signal.addEventListener('abort', abort, { once: true });
        promise.then(value => { signal.removeEventListener('abort', abort); resolve(value); }, error => { signal.removeEventListener('abort', abort); reject(error); });
    });
}
export default PublicRelayGateway;
