import { type HarnessRemoteHostDescription, type CallPairingManagement } from './pairing-client.js';
import { type RemotePageStore } from './remote-page-store.js';
export type { HarnessRemoteHostDescription } from './pairing-client.js';
export interface HarnessRemoteSettingsProps {
    describeHost: () => Promise<HarnessRemoteHostDescription>;
    callManagement: CallPairingManagement;
    store?: RemotePageStore;
}
export declare function HarnessRemoteSettings({ describeHost, callManagement, store, }: HarnessRemoteSettingsProps): JSX.Element;
