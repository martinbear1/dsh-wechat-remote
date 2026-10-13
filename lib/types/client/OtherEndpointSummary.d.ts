import type { OtherEndpointInfo } from '../other-endpoint-info.js';
export type ReadOtherEndpoint = (signal: AbortSignal) => Promise<OtherEndpointInfo>;
declare const stableConnection: {
    subscribe: (_listener: () => void) => () => void;
    getSnapshot: () => number;
};
export declare function OtherEndpointSummary({ readOtherEndpoint, connection }: {
    readOtherEndpoint?: ReadOtherEndpoint;
    connection?: typeof stableConnection;
}): JSX.Element | null;
export {};
