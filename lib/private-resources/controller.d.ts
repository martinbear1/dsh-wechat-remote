import { PrivateResourceLibrary } from './library.js';
import { ResourceDeliveryClient } from './source.js';
import type { ResourceRequest, ResourceState } from './protocol.js';
export declare class ResourceController {
    private readonly library;
    private readonly delivery;
    private catalog?;
    private busy;
    constructor(library: PrivateResourceLibrary, delivery: ResourceDeliveryClient);
    snapshot(): ResourceState;
    control(request: ResourceRequest, signal: AbortSignal): Promise<ResourceState>;
}
