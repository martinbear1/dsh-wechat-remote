import { type MyResourcesCall } from './my-resources-store.js';
interface Props {
    call: MyResourcesCall;
    onStart?: (presetId: string, signal: AbortSignal) => Promise<void>;
}
/** Local reads on open; downloads, activation and new conversations require separate clicks. */
export declare function MyResourcesPanel({ call, onStart }: Props): JSX.Element;
export {};
