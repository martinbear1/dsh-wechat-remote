import type { AgentIdentity } from './public-relay-agent.js';
type Event = {
    seq: number;
    type: string;
    data: any;
};
type Session = {
    id: string;
    events?: readonly Event[];
    snapshotEvents?: (fromSeq?: number) => readonly Event[];
    firstLiveSeq: number;
};
type Watch = {
    id: string;
    session: Session;
    turn: number;
    baseline: number;
    expiresAt: number;
    preparing?: Promise<any>;
};
type Context = {
    get(name: string): any;
    on(name: any, callback: any): () => void;
};
export declare function currentTurn(session: Session): number | null;
/** Body-bound proof, distinct domain from the legacy object API. */
export declare function notificationProof(path: string, node: string, time: number, nonce: string, body: string): Buffer;
export declare class NotificationRelayClient {
    readonly origin: string;
    private identity;
    private fetchImpl;
    constructor(origin: string, identity: () => AgentIdentity, fetchImpl?: typeof fetch);
    call(action: 'prepare' | 'observe', values: unknown): Promise<any>;
}
export declare class TaskNotifications {
    private ctx;
    private relay;
    private now;
    private watches;
    private questions;
    private presence;
    private disposers;
    private timer?;
    private pumping;
    private disposed;
    private clientEpoch;
    private cursor;
    constructor(ctx: Context, relay: Pick<NotificationRelayClient, 'call' | 'origin'>, now?: () => number);
    start(): void;
    private session;
    request(args: any): Promise<any>;
    private prepareWatch;
    private pending;
    /** Exported pure-ish snapshot is also used by deterministic race tests. */
    snapshot(watch: Watch): any;
    tick(): Promise<void>;
    dispose(): void;
}
export {};
