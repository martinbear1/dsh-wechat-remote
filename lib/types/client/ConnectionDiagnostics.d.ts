import { type SafePairingAttempt } from '../connection-diagnostic-contract.js';
import type { PageSnapshot, RemotePageStore } from './remote-page-store.js';
export declare function latestPairingAttempt(snapshot: PageSnapshot): SafePairingAttempt | undefined;
export declare function recoveryReminder(snapshot: PageSnapshot): string | null;
export declare function ConnectionDiagnostics({ store }: {
    store: RemotePageStore;
}): JSX.Element;
