import { WebSocket } from 'ws';
import { DshTunnelAgent } from './dsh-tunnel-agent.js';
import type { AgentIdentity } from './public-relay-agent.js';
import type { DshCompatibilityTransport } from './dsh-compatibility-api.js';
export interface SecureLanAdmission {
    readonly id: symbol;
    readonly address: string;
}
/**
 * Separates cheap unauthenticated handshakes from authenticated tunnels.
 * Pending clients are bounded globally and per source address; only a client
 * that proves the encrypted LAN credential can consume an active slot.
 */
export declare class SecureLanAdmissionPool {
    private readonly limits;
    private readonly entries;
    private readonly pendingByAddress;
    private pending;
    private active;
    constructor(limits?: {
        readonly maxPending?: number;
        readonly maxPendingPerAddress?: number;
        readonly maxActive?: number;
    });
    begin(remoteAddress: string | undefined): SecureLanAdmission | null;
    authenticate(admission: SecureLanAdmission): boolean;
    release(admission: SecureLanAdmission): void;
    snapshot(): {
        readonly pending: number;
        readonly active: number;
        readonly addresses: number;
    };
    private releasePending;
}
export declare class SecureLanServer {
    private readonly options;
    readonly sockets: import("ws").Server<typeof WebSocket, typeof import("http").IncomingMessage>;
    readonly admissions: SecureLanAdmissionPool;
    constructor(options: {
        identity: () => AgentIdentity | undefined;
        token: () => string;
        dshPort: number;
        compatibilityApi?: DshCompatibilityTransport;
        createTunnel?: (send: (frame: Uint8Array) => Promise<void>) => DshTunnelAgent;
        admissionPool?: SecureLanAdmissionPool;
    });
    attach(ws: WebSocket, remoteAddress?: string): void;
    close(): void;
}
