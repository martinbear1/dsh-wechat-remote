/** Bind the page to its own Host. No port scan or default-Web fallback. */
export interface GateDoorInfo {
    port: number;
    state: 'starting' | 'listening' | 'unavailable' | 'stopped';
}
export interface GateRuntimeInfo {
    profileScope?: string;
    management?: 'authenticated-rpc' | 'loopback' | 'unavailable';
    localDoor: GateDoorInfo;
    publicDoor: GateDoorInfo;
}
export interface HarnessRemoteHostDescription {
    computerName: string;
    agentName: string;
    gate?: GateRuntimeInfo;
}
export type CallPairingManagement = (endpoint: 'status' | 'pair-code') => Promise<unknown>;
export declare function resolvePairingClient(describeHost: () => Promise<HarnessRemoteHostDescription>, callManagement: CallPairingManagement, fetchImpl?: typeof fetch): Promise<{
    host: HarnessRemoteHostDescription;
    runtime: GateRuntimeInfo;
    localOrigin: string | null;
    status: () => Promise<unknown>;
    pairCode: () => Promise<unknown>;
}>;
