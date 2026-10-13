import { type InstallationState } from './installation-state.js';
/** The native activation slot owns dismissal and navigation. This guide only
 * reports current-endpoint activation; it cannot mutate or restart the host. */
export declare function InstallationResultPanel({ packageName, readInstallation, onDismiss, onOpenDetails }: {
    packageName: string;
    readInstallation: (packageName: string) => Promise<InstallationState>;
    onDismiss: () => void;
    onOpenDetails?: () => void;
}): JSX.Element;
