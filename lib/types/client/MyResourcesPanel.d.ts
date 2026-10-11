import { type MyResourcesCall } from './my-resources-store.js';
/** Opening reads local status only; cloud refresh and native installation require an explicit click. */
export declare function MyResourcesPanel({ call, nodeName, hostName }: {
    call: MyResourcesCall;
    nodeName?: string;
    hostName?: string;
}): JSX.Element;
