import { type NativeUpdateStore } from './native-update-store.js';
import { type InstallationRestartProps } from './InstallationRestartNotice.js';
export declare function NativeUpdateCard({ store, scope, embedded, installation, current }: {
    store: NativeUpdateStore;
    scope?: string;
    embedded?: boolean;
    installation?: InstallationRestartProps;
    current?: {
        agentVersion?: string;
        pluginVersion?: string;
    };
}): JSX.Element;
