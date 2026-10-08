import type { FeatureCall } from './feature-client.js';
import type { AssistantStore } from './assistant-store.js';
/** Native-mode shortcuts, not a second conversation or preset implementation. */
export declare function AssistantPresetsPanel({ store, featureCall }: {
    store: AssistantStore;
    featureCall?: FeatureCall;
}): JSX.Element;
