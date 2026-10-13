import type { HarnessRemoteHostDescription } from './pairing-client.js';
export interface InstallationState {
    phase: 'ready' | 'restart-required' | 'disabled' | 'incomplete' | 'unknown';
    scope?: 'desktop' | 'web';
    installedVersion?: string;
    runningVersion?: string;
}
/** Activation-only read of the current native manager. No catalog, filesystem,
 * install, restart, peer discovery or background polling. A new client can read
 * the old host's running version without invoking new updater operations. */
export declare function readInstallationState(get: (name: string) => unknown, describe: () => Promise<HarnessRemoteHostDescription>, packageName: string): Promise<InstallationState>;
export declare function manualRestartInstruction(scope?: string): string;
