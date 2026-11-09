import type { PluginStatus } from './protocol.js';
export interface PluginHost {
    get(name: string): unknown;
}
export declare class PluginAdapterError extends Error {
    readonly code: string;
    constructor(code: string, message: string);
}
export declare function pluginError(error: unknown): {
    code: string;
    message: string;
};
export declare class NativePluginManager {
    private readonly host;
    private mutations;
    constructor(host: PluginHost);
    private manager;
    private settings;
    status(): PluginStatus;
    private snapshot;
    private protectedRow;
    private protectedBundle;
    private item;
    private target;
    private sections;
    control(action: string, value: unknown, signal: AbortSignal): Promise<unknown>;
    private execute;
    private writePage;
}
