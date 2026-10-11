/** Page-local resource controls. No entitlement polling, automatic install or session mutation. */
export interface MyResourceItem {
    resourceId: string;
    version: string;
    name: string;
    description: string;
    presetId?: string;
    installedVersion?: string;
    enabled?: boolean;
    state: 'available' | 'installing' | 'installed' | 'unavailable';
    /** Backend-owned display copy, never raw installer exceptions. */
    message?: string;
}
export interface MyResourcesState {
    supported: boolean;
    notice?: string;
    items: MyResourceItem[];
}
export type MyResourcesRequest = {
    op: 'status' | 'refresh';
} | {
    op: 'install';
    resourceId: string;
    version: string;
} | {
    op: 'setEnabled';
    resourceId: string;
    version: string;
    enabled: boolean;
};
export type MyResourcesResult = {
    ok: true;
    value: MyResourcesState;
} | {
    ok: false;
    error: {
        code: string;
        message: string;
    };
};
export type MyResourcesCall = (request: MyResourcesRequest) => Promise<MyResourcesResult>;
export interface MyResourcesView {
    data: MyResourcesState | null;
    busy: boolean;
    installing: string | null;
    toggling: string | null;
    error: string;
    itemErrors: Record<string, string>;
}
export declare const resourceKey: (resourceId: string, version: string) => string;
export declare const localActivationUnavailable: (item: MyResourceItem) => boolean;
export declare const isResourceUpdate: (item: MyResourceItem, items: MyResourceItem[]) => boolean;
export declare const initialResourcesView: () => MyResourcesView;
export declare class MyResourcesStore {
    private readonly call;
    private state;
    private listeners;
    private disposed;
    private flight?;
    constructor(call: MyResourcesCall);
    getSnapshot: () => MyResourcesView;
    subscribe: (listener: () => void) => () => void;
    private set;
    /** A changed node uses a new store; old receipts never enter its resource list. */
    dispose: () => void;
    private run;
    load: () => Promise<void>;
    refresh: () => Promise<void>;
    install: (resourceId: string, version: string) => Promise<void>;
    setEnabled: (resourceId: string, version: string, enabled: boolean) => Promise<void>;
}
