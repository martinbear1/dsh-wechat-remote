import type { AgentIdentity } from './public-relay-agent.js';
interface SignedTransfer {
    readonly url: string;
    readonly headers?: Readonly<Record<string, string>>;
    readonly expiresIn: number;
    readonly alternatives?: readonly SignedTransfer[];
}
interface ObjectTicket {
    readonly objectId: string;
    readonly purpose: 'attachment' | 'artifact' | 'history';
    readonly expectedBytes: number;
    readonly expiresAt: number;
    readonly upload?: SignedTransfer;
    readonly download?: SignedTransfer;
}
export declare const DEFAULT_TRUSTED_OBJECT_ORIGINS: readonly string[];
export declare class PublicObjectClient {
    private readonly relayOrigin;
    private readonly identitySource;
    private readonly fetchImpl;
    private readonly trustedObjectOrigins;
    private lifetime;
    private readonly preferences;
    constructor(relayOrigin: string, identitySource: AgentIdentity | (() => AgentIdentity), fetchImpl?: typeof fetch, trustedObjectOrigins?: readonly string[]);
    private get identity();
    start(): void;
    stop(): void;
    private operationSignal;
    download(objectId: string, expectedMaximum?: number, signal?: AbortSignal): Promise<Uint8Array>;
    upload(purpose: 'attachment' | 'artifact' | 'history', body: Uint8Array, signal?: AbortSignal): Promise<ObjectTicket>;
    private complete;
    private entries;
    private remember;
    private forget;
    private validateTransfer;
    private requestJson;
}
export {};
