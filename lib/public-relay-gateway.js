/** Product boundary that joins relay routing, E2EE sessions, and local DSH virtual streams. */
import { DshTunnelAgent } from './dsh-tunnel-agent.js';
import { AgentE2EESession } from './e2ee-session.js';
import { PublicRelayAgent, } from './public-relay-agent.js';
export class PublicRelayGateway {
    agent;
    clients = new Map();
    dshPort;
    maxClients;
    maxStreamsPerClient;
    constructor(config, options) {
        this.dshPort = options.dshPort || 3080;
        // One personal Agent should only have a handful of simultaneously active
        // phone clients. Keep the bound small so an owned relay account cannot
        // exhaust the desktop DSH process.
        this.maxClients = options.maxClients || 8;
        this.maxStreamsPerClient = options.maxStreamsPerClient || 32;
        const agentOptions = {
            agentVersion: options.agentVersion,
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
    async ensurePairingStatus() {
        return this.agent.ensurePairingTicket();
    }
    receive(frame) {
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
                client.reply(outbound);
            if (result.ready && !client.tunnel) {
                client.tunnel = new DshTunnelAgent({
                    dshPort: this.dshPort,
                    maxStreams: this.maxStreamsPerClient,
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
