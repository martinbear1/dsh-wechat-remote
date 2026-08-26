import type { AgentIdentity } from './public-relay-agent.js';
interface SignedTransfer {
    readonly url: string;
    readonly headers?: Readonly<Record<string, string>>;
    readonly expiresIn: number;
}
interface ObjectTicket {
    readonly objectId: string;
    readonly purpose: 'attachment' | 'artifact' | 'history';
    readonly expectedBytes: number;
    readonly expiresAt: number;
    readonly upload?: SignedTransfer;
    readonly download?: SignedTransfer;
}
export declare class PublicObjectClient {
    private readonly relayOrigin;
    private readonly identity;
    private readonly fetchImpl;
    constructor(relayOrigin: string, identity: AgentIdentity, fetchImpl?: typeof fetch);
    download(objectId: string, expectedMaximum?: number, signal?: AbortSignal): Promise<Uint8Array>;
    upload(purpose: 'attachment' | 'artifact' | 'history', body: Uint8Array, signal?: AbortSignal): Promise<ObjectTicket>;
    private requestJson;
}
export {};
