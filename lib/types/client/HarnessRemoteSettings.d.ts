import { type HarnessRemoteHostDescription, type CallPairingManagement } from './pairing-client.js';
import { type RemotePageStore } from './remote-page-store.js';
import type { AssistantStore } from './assistant-store.js';
import { type ClawbotCall } from './ClawbotPanel.js';
import type { FeatureCall } from './feature-client.js';
import type { ConnectionDiagnosticStore } from './connection-diagnostic-store.js';
import type { MyResourcesCall } from './my-resources-store.js';
export type { HarnessRemoteHostDescription } from './pairing-client.js';
export interface HarnessRemoteSettingsProps {
    describeHost: () => Promise<HarnessRemoteHostDescription>;
    callManagement: CallPairingManagement;
    store?: RemotePageStore;
    diagnostics?: ConnectionDiagnosticStore;
    assistants?: AssistantStore;
    clawbotCall?: ClawbotCall;
    featureCall?: FeatureCall;
    resourcesCall?: MyResourcesCall;
    resourceConnection?: {
        subscribe: (listener: () => void) => () => void;
        getSnapshot: () => number;
    };
}
export declare function HarnessRemoteSettings({ describeHost, callManagement, store, diagnostics, assistants, clawbotCall, featureCall, resourcesCall, resourceConnection, }: HarnessRemoteSettingsProps): JSX.Element;
