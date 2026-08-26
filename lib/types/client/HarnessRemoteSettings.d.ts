interface GateDoorInfo {
    port: number;
    state: 'starting' | 'listening' | 'unavailable' | 'stopped';
}
interface GateRuntimeInfo {
    localDoor: GateDoorInfo;
    publicDoor: GateDoorInfo;
}
export interface HarnessRemoteHostDescription {
    computerName: string;
    agentName: string;
    gate?: GateRuntimeInfo;
}
interface HarnessRemoteSettingsProps {
    describeHost: () => Promise<HarnessRemoteHostDescription>;
}
export declare function HarnessRemoteSettings({ describeHost, }: HarnessRemoteSettingsProps): JSX.Element;
export {};
