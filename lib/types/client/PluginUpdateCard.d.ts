import type { WebUpdateStore } from './web-update-store.js';
/** Both entry pages render this view; requests and progress live in one store. */
export declare function PluginUpdateCard({ store, embedded }: {
    store: WebUpdateStore;
    embedded?: boolean;
}): JSX.Element;
