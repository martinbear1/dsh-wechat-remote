import type { AssistantStore } from './assistant-store.js';
/** Registered inside the plugin's official Settings slot, never a shell patch. */
export declare function AssistantPresetsPanel({ store, start }: {
    store: AssistantStore;
    start?: (presetId: string, lifetime?: AbortSignal) => Promise<void>;
}): JSX.Element;
