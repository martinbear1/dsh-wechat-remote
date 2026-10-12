/** Bind the page to its own Host. No port scan or default-Web fallback. */
export interface GateDoorInfo {
    port: number;
    state: 'starting' | 'listening' | 'unavailable' | 'stopped';
}
export interface GateRuntimeInfo {
    profileScope?: string;
    management?: 'authenticated-rpc' | 'loopback' | 'unavailable';
    diagnostics?: 'read-only-v1';
    updates?: 'native-v1';
    localDoor: GateDoorInfo;
    publicDoor: GateDoorInfo;
}
export interface HarnessRemoteHostDescription {
    computerName: string;
    agentName: string;
    agentInstanceId?: string;
    agentVersion?: string;
    pluginVersion?: string;
    gate?: GateRuntimeInfo;
}
export type CallPairingManagement = (endpoint: 'status' | 'pair-code' | 'companion-decision' | 'update-check' | 'update-start' | 'update-status' | 'connection-diagnostics', payload?: {
    offerId: string;
    action: 'approve' | 'later';
} | {
    ticket: string;
}, signal?: AbortSignal) => Promise<unknown>;
export declare function diagnosticUnsupported(): Error;
export declare function resolvePairingClient(describeHost: () => Promise<HarnessRemoteHostDescription>, callManagement: CallPairingManagement, fetchImpl?: typeof fetch): Promise<{
    host: HarnessRemoteHostDescription;
    runtime: GateRuntimeInfo;
    localOrigin: string | null;
    status: () => Promise<unknown>;
    pairCode: () => Promise<unknown>;
    diagnose: (signal: AbortSignal) => Promise<unknown>;
    decide: (offerId: string, action: "approve" | "later") => Promise<unknown>;
} | {
    host: HarnessRemoteHostDescription;
    runtime: GateRuntimeInfo;
    localOrigin: string;
    status: () => Promise<unknown>;
    pairCode: () => Promise<unknown>;
    diagnose: (_signal: AbortSignal) => Promise<unknown>;
    decide: (offerId: string, action: "approve" | "later") => Promise<any>;
}>;
