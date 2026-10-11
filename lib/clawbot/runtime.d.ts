import { type ClawbotHost, type ClawbotRequest, type ClawbotStatus } from './contracts.js';
import { ILinkClient } from './ilink.js';
import type { ILinkMessage } from './ilink-types.js';
import type { ClawbotData, ClawbotStorage } from './storage.js';
export { splitText } from './reply-text.js';
type AccessBinding = NonNullable<ClawbotData['accessBinding']>;
export interface ClawbotAccess {
    authorize(): Promise<void>;
    current(): void;
    identity?(): AccessBinding;
}
/** Independently owned channel. No phone connection, relay account, model tool,
 * native preset mutation, or host process lifecycle is used here. */
export declare class ClawbotRuntime {
    private readonly storage;
    private readonly host;
    private readonly client;
    private readonly now;
    private readonly access?;
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
    private loginWatch?;
    private message;
    private state;
    private closed;
    private commandQueue;
    private readonly nativeAttention;
    constructor(storage: ClawbotStorage, host: ClawbotHost, client?: ILinkClient, now?: () => number, access?: ClawbotAccess | undefined);
    private commit;
    private checkRevision;
    private checkOperational;
    private accessFailure;
    private authorize;
    private sameOwner;
    private currentAccess;
    private requiresAccess;
    snapshot(): ClawbotStatus;
    private endLogin;
    private expireLogin;
    /** The node owns a requested login, even while both control pages are closed.
     * Only read its result, for this attempt's bounded lifetime; never restart a
     * login, resend a verification code, or enable message receiving here. */
    private watchLogin;
    private failLoginStorage;
    private scheduleLoginWatch;
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
    /** Notices reuse the same durable outbox and delivery fences as final replies.
     * At most two per request; no new sender, polling loop or replay permission. */
    private attention;
    private process;
    private deliver;
    private drain;
    dispose(): Promise<void>;
}
