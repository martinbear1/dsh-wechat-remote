import { type InstallationState } from './installation-state.js';
export interface InstallationRestartProps {
    readInstallation?: () => Promise<InstallationState>;
    runningVersion?: string;
    installedVersion?: string;
    scope?: string;
    hostIdentity?: string;
}
/** Supplement the native activation modal when the host hides it on details.
 * One existing read per mounted host/runtime, no timer, approval or action. */
export declare function InstallationRestartNotice({ readInstallation, runningVersion, installedVersion, scope, hostIdentity }: InstallationRestartProps): JSX.Element | null;
