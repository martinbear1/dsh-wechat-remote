import { WebSocket } from 'ws';
import { DshTunnelAgent } from './dsh-tunnel-agent.js';
import type { AgentIdentity } from './public-relay-agent.js';
import type { DshCompatibilityTransport } from './dsh-compatibility-api.js';
export declare class SecureLanServer {
    private readonly options;
    readonly sockets: import("ws").Server<typeof WebSocket, typeof import("http").IncomingMessage>;
    constructor(options: {
        identity: () => AgentIdentity | undefined;
        token: () => string;
        dshPort: number;
        compatibilityApi?: DshCompatibilityTransport;
        createTunnel?: (send: (frame: Uint8Array) => Promise<void>) => DshTunnelAgent;
    });
    attach(ws: WebSocket): void;
    close(): void;
}
