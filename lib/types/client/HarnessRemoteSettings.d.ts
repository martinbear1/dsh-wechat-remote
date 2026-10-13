import type { InstallationState } from './installation-state.js';
import { type HarnessRemoteHostDescription, type CallPairingManagement } from './pairing-client.js';
import { type RemotePageStore } from './remote-page-store.js';
import type { AssistantStore } from './assistant-store.js';
import { type ClawbotCall } from './ClawbotPanel.js';
import type { FeatureCall } from './feature-client.js';
import type { ConnectionDiagnosticStore } from './connection-diagnostic-store.js';
import type { MyResourcesCall } from './my-resources-store.js';
import { type ReadOtherEndpoint } from './OtherEndpointSummary.js';
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
    startResource?: (presetId: string, signal: AbortSignal) => Promise<void>;
    readOtherEndpoint?: ReadOtherEndpoint;
    resourceConnection?: {
        subscribe: (listener: () => void) => () => void;
        getSnapshot: () => number;
    };
    readInstallation?: () => Promise<InstallationState>;
}
export declare function HarnessRemoteSettings({ describeHost, callManagement, store, diagnostics, assistants, clawbotCall, featureCall, resourcesCall, startResource, readOtherEndpoint, resourceConnection, readInstallation, }: HarnessRemoteSettingsProps): JSX.Element;
