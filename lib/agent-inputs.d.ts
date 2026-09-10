import type { Context } from '@deepseek-ai/cordis';
import { TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol';
import { type TypertGatewayLike } from './dsh-protocol-compat.js';
import type { ResourceResult } from './agent-resources.js';
type Row = Record<string, any>;
export interface InputConfig {
    readonly gateway?: TypertGatewayLike;
    readonly supported?: boolean;
    readonly load?: (descriptor: Row, signal: AbortSignal) => Promise<Uint8Array>;
}
/** Native receipt semantics stay adapter-owned. Clients treat this signed,
 * short-lived, scope-bound token as opaque (it is not a secret or file URL). */
export declare class AgentInputsService extends TypertRemoteService {
    private host;
    private config;
    private secret;
    private active;
    constructor(host: Context, config?: InputConfig);
    private gateway;
    private guarded;
    capabilities(request: {
        scope: string;
    }, signal: AbortSignal): Promise<ResourceResult>;
    upload(request: {
        scope: string;
        name: string;
        data?: string;
        descriptorJson?: string;
    }, signal: AbortSignal): Promise<ResourceResult>;
    resolve(scope: string, token: string): {
        type: 'file';
        receiptId: string;
    };
}
export {};
