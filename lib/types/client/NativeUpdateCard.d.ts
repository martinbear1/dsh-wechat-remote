import type { NativeUpdateStore } from './native-update-store.js';
import { type InstallationRestartProps } from './InstallationRestartNotice.js';
export declare function NativeUpdateCard({ store, scope, embedded, installation }: {
    store: NativeUpdateStore;
    scope?: string;
    embedded?: boolean;
    installation?: InstallationRestartProps;
}): JSX.Element;
