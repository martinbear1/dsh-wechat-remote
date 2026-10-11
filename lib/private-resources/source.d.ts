import type { AgentIdentity } from '../public-relay-agent.js';
import { type ResourceRelease } from './contract.js';
export interface DeliveryConnection {
    identity: AgentIdentity;
    origin: string;
    objectOrigins?: readonly string[];
    fetchImpl?: typeof fetch;
}
export interface DeliveryRelease extends ResourceRelease {
    kind: 'preset';
    name: string;
    description: string;
}
export interface DeliveryCatalog {
    schemaVersion: 1;
    nodeId: string;
    accountInstance: string;
    items: DeliveryRelease[];
}
export interface DeliverySource {
    current(): DeliveryConnection;
}
/** On-demand control requests plus a direct OSS download. Never uses the
 * realtime tunnel, feature leases, quota ledger or a background refresh timer. */
export declare class ResourceDeliveryClient {
    private readonly source;
    constructor(source: DeliverySource);
    private capture;
    private json;
    catalog(signal: AbortSignal): Promise<DeliveryCatalog>;
    download(expected: DeliveryRelease, accountInstance: string, signal: AbortSignal): Promise<Uint8Array>;
}
