/** Product boundary that joins relay routing, E2EE sessions, and local DSH virtual streams. */
import { createHash } from 'node:crypto';
import { DshTunnelAgent } from './dsh-tunnel-agent.js';
import { AgentE2EESession } from './e2ee-session.js';
import { PublicRelayAgent, } from './public-relay-agent.js';
import { decryptRemoteAttachment, decryptCloudObject, encryptCloudObject } from './object-crypto.js';
import { HISTORY_ARCHIVE_ENTRY } from './history-archive.js';
import { PublicObjectClient } from './public-object-client.js';
import { OBJECT_UPLOAD_BUDGET_MS } from './object-transfer-budget.js';
import HistorySnapshotCache from './history-snapshot-cache.js';
export class PublicRelayGateway {
    agent;
    clients = new Map();
    dshPort;
    compatibilityApi;
    maxClients;
    maxStreamsPerClient;
    issueLanCredential;
    objectClient;
    starting = null;
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
            onIdentityChange: options.onIdentityChange,
            onFrame: frame => this.receive(frame),
            onClientDisconnect: clientId => this.disconnect(clientId),
            onClientError: clientId => this.disconnect(clientId),
            onTransportDisconnect: () => this.disconnectAll(),
        };
        this.agent = new PublicRelayAgent(config, agentOptions);
        this.objectClient = new PublicObjectClient(config.relayOrigin, () => this.agent.identity, this.agent.fetchImpl, options.trustedObjectOrigins || config.objectOrigins);
        this.historySnapshots = new HistorySnapshotCache({
            file: options.historyCachePath,
            onDiagnostic: options.onDiagnostic,
        });
    }
    start() {
        if (this.starting)
            return this.starting;
        // Own the whole startup, not only the Agent's enrollment. A stopped or
        // replaced startup must never reactivate the next run's object client.
        const starting = Promise.resolve().then(async () => {
            if (this.starting !== starting)
                return;
            await this.agent.start();
            if (this.starting !== starting)
                return;
            // Real transfers supply route evidence; no periodic HEAD/report task.
            this.objectClient.start();
        });
        this.starting = starting;
        return starting;
    }
    stop() {
        this.starting = null;
        this.objectClient.stop();
        for (const clientId of this.clients.keys())
            this.disconnect(clientId);
        this.agent.stop();
    }
    snapshot() {
        return this.agent.snapshot();
    }
    // COMPAT(history-window-v1): called by window(), never page()/detail().
    // Retire its cache/index together with the old history endpoint after the
    // client support window closes; picture/file object transfers remain active.
    async storeHistorySnapshot(payloadJson, archive, signal) {
        signal?.throwIfAborted();
        const digest = createHash('sha256').update(this.agent.identity.nodeId).update('\0').update(payloadJson).digest('base64url');
        const cached = this.historySnapshots.get(digest);
        if (cached)
            return cached;
        const pending = this.pendingHistorySnapshots.get(digest);
        if (pending)
            return await waitFor(pending, signal);
        const upload = (async () => {
            const encrypted = encryptCloudObject(archive, 'history-json');
            // The cache fill is shared. Cancelling one viewer must not cancel another;
            // its independent budget still prevents orphaned transfers running forever.
            const ticket = await this.objectClient.upload('history', encrypted.ciphertext, AbortSignal.timeout(20_000));
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
        void upload.finally(() => {
            if (this.pendingHistorySnapshots.get(digest) === upload)
                this.pendingHistorySnapshots.delete(digest);
        }).catch(() => { });
        return await waitFor(upload, signal);
    }
    async uploadArtifactObject(data, signal) {
        const encrypted = encryptCloudObject(data, 'artifact');
        const ticket = await this.objectClient.upload('artifact', encrypted.ciphertext, signal);
        return { ...encrypted.descriptor, objectId: ticket.objectId, expiresAt: ticket.expiresAt };
    }
    async downloadInputObject(descriptor, signal) {
        if (descriptor.contentKind !== 'artifact' || !Number.isSafeInteger(descriptor.plainBytes) || descriptor.plainBytes < 1 || descriptor.plainBytes > 20 * 1024 * 1024)
            throw Error('附件对象无效');
        const ciphertext = await this.objectClient.download(descriptor.objectId, 20 * 1024 * 1024 + 4096, signal);
        return decryptCloudObject(ciphertext, descriptor);
    }
    async uploadAttachmentObject(data, metadata, signal) {
        const digest = createHash('sha256')
            .update(this.agent.identity.nodeId).update('\0')
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
        const transferSignal = AbortSignal.timeout(OBJECT_UPLOAD_BUDGET_MS);
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
        return this.agent.ensurePairingTicket(60_000, { refresh: true });
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
            if (this.clients.get(frame.clientId) !== client)
                return;
            if (result.ready && !client.tunnel) {
                client.tunnel = this.createAuthenticatedTunnel(clearFrame => client.reply(client.e2ee.seal(clearFrame)));
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
    /** Only carriers that completed identity pinning AND client authorization
     * may enter this shared DSH boundary. LAN and relay use identical features.
     */
    createAuthenticatedTunnel(send) {
        return new DshTunnelAgent({
            dshPort: this.dshPort,
            compatibilityApi: this.compatibilityApi,
            maxStreams: this.maxStreamsPerClient,
            issueLanCredential: this.issueLanCredential,
            materializeAttachment: async (raw, signal) => {
                const descriptor = raw;
                const ciphertext = await this.objectClient.download(descriptor.objectId, undefined, signal);
                return decryptRemoteAttachment(ciphertext, descriptor);
            },
            send,
        });
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
