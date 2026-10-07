import { type ClawbotHost, type ClawbotRequest, type ClawbotStatus } from './contracts.js';
import { ILinkClient } from './ilink.js';
import type { ILinkMessage } from './ilink-types.js';
import type { ClawbotStorage } from './storage.js';
/** Independently owned channel. No phone connection, relay account, model tool,
 * native preset mutation, or host process lifecycle is used here. */
export declare class ClawbotRuntime {
    private readonly storage;
    private readonly host;
    private readonly client;
    private readonly now;
    private data;
    private readonly lifetime;
    private polling?;
    private pollTask?;
    private worker?;
    private commandWorker?;
    private deliveryWorker?;
    private broken;
    private login?;
    private loginPoll?;
    private message;
    private state;
    private closed;
    private commandQueue;
    constructor(storage: ClawbotStorage, host: ClawbotHost, client?: ILinkClient, now?: () => number);
    private commit;
    private checkRevision;
    snapshot(): ClawbotStatus;
    control(request: ClawbotRequest, signal: AbortSignal): Promise<ClawbotStatus | {
        sessions: {
            id: string;
            title: string;
        }[];
    }>;
    private mutate;
    private completeLogin;
    private resume;
    private delay;
    private poll;
    /** Exposed for deterministic contract testing, not a public RPC. */
    ingest(messages: ILinkMessage[], cursor: string): void;
    private work;
    private update;
    private command;
    private shortId;
    private process;
    private deliver;
    private drain;
    dispose(): Promise<void>;
}
/** Conservative local text chunk size, counted as UTF-8 without splitting emoji. */
export declare function splitText(text: string): string[];
