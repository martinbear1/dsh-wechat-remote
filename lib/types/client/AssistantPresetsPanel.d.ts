import type { AssistantStore } from './assistant-store.js';
/** Registered inside the official Settings slot. The verified native new-session
 * picker remains the entry to work; this panel only manages assistant modes. */
export declare function AssistantPresetsPanel({ store }: {
    store: AssistantStore;
}): JSX.Element;
