import { type HarnessRemoteHostDescription, type CallPairingManagement } from './pairing-client.js';
import { type RemotePageStore } from './remote-page-store.js';
import type { AssistantStore } from './assistant-store.js';
import { type ClawbotCall } from './ClawbotPanel.js';
import type { FeatureCall } from './feature-client.js';
export type { HarnessRemoteHostDescription } from './pairing-client.js';
export interface HarnessRemoteSettingsProps {
    describeHost: () => Promise<HarnessRemoteHostDescription>;
    callManagement: CallPairingManagement;
    store?: RemotePageStore;
    assistants?: AssistantStore;
    clawbotCall?: ClawbotCall;
    featureCall?: FeatureCall;
}
export declare function HarnessRemoteSettings({ describeHost, callManagement, store, assistants, clawbotCall, featureCall, }: HarnessRemoteSettingsProps): JSX.Element;
