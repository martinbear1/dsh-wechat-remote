import { type HarnessRemoteHostDescription, type CallPairingManagement } from './pairing-client.js';
export type { HarnessRemoteHostDescription } from './pairing-client.js';
interface HarnessRemoteSettingsProps {
    describeHost: () => Promise<HarnessRemoteHostDescription>;
    callManagement: CallPairingManagement;
}
export declare function HarnessRemoteSettings({ describeHost, callManagement, }: HarnessRemoteSettingsProps): JSX.Element;
