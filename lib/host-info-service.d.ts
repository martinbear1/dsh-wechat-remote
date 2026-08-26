import type { Context } from '@deepseek-ai/cordis';
import { TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol';
import { type AgentCapability } from './agent-metadata.js';
import type { HostPlatformDescriptor } from './host-platform.js';
export interface WechatHostDescribeRequest {
}
export interface WechatGateDoorInfo {
    readonly bind: string;
    readonly port: number;
    readonly state: 'starting' | 'listening' | 'unavailable' | 'stopped';
    readonly errorCode: string | null;
    readonly message: string | null;
}
export interface WechatGateRuntimeInfo {
    readonly profileScope: string;
    readonly source: 'legacy-default' | 'profile-derived' | 'environment-override';
    readonly publicDoor: WechatGateDoorInfo;
    readonly localDoor: WechatGateDoorInfo;
}
export interface WechatHostInfoConfig {
    readonly gateRuntime?: () => WechatGateRuntimeInfo;
}
export interface WechatHostDescribeValue {
    readonly computerName: string;
    readonly pluginVersion: string;
    /** Additive v1 Agent-host identity; legacy clients safely ignore these fields. */
    readonly descriptorVersion: 1;
    readonly hostId: string;
    readonly agentInstanceId: string;
    readonly agentKind: 'deepseek-harness';
    readonly agentName: 'DeepSeek Harness';
    readonly agentVersion: string;
    readonly hostPlatform: HostPlatformDescriptor;
    readonly capabilities: readonly AgentCapability[];
    /** Actual ports selected for this DSH profile; never assume 3092/3093. */
    readonly gate?: WechatGateRuntimeInfo;
}
export type WechatHostDescribeResult = {
    readonly ok: true;
    readonly value: WechatHostDescribeValue;
};
declare module '@deepseek-ai/cordis' {
    interface Context {
        wechatHost: WechatHostInfoService;
    }
}
/** Host-only, authenticated, read-only metadata for the WeChat client. */
export declare class WechatHostInfoService extends TypertRemoteService {
    private readonly gateRuntime?;
    constructor(ctx: Context, config?: WechatHostInfoConfig);
    describe(request: WechatHostDescribeRequest, signal: AbortSignal): Promise<WechatHostDescribeResult>;
}
export default WechatHostInfoService;
