import { type HarnessRemoteHostDescription, type CallPairingManagement } from './pairing-client.js';
import { type RemotePageStore } from './remote-page-store.js';
/** Native plugin activation/detail contribution; no host DOM manipulation. */
export declare function CompanionPanel({ describeHost, callManagement, onDismiss, onOpenDetails, store }: {
    describeHost: () => Promise<HarnessRemoteHostDescription>;
    callManagement: CallPairingManagement;
    onDismiss?: () => void;
    onOpenDetails?: () => void;
    store?: RemotePageStore;
}): JSX.Element;
