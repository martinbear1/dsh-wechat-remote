import { type HarnessRemoteHostDescription, type CallPairingManagement } from './pairing-client.js';
import { type RemotePageStore } from './remote-page-store.js';
import type { AssistantStore } from './assistant-store.js';
export type { HarnessRemoteHostDescription } from './pairing-client.js';
export interface HarnessRemoteSettingsProps {
    describeHost: () => Promise<HarnessRemoteHostDescription>;
    callManagement: CallPairingManagement;
    store?: RemotePageStore;
    assistants?: AssistantStore;
    startAssistant?: (presetId: string, lifetime?: AbortSignal) => Promise<void>;
}
export declare function HarnessRemoteSettings({ describeHost, callManagement, store, assistants, startAssistant, }: HarnessRemoteSettingsProps): JSX.Element;
