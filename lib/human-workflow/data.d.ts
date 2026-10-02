/** Shared bounded data and persistence primitives; no DSH or network authority. */
export interface WorkflowScope {
    nodeId: string;
    sessionId: string;
    sessionGeneration: string;
}
export interface WorkflowDataStore {
    load(): Promise<unknown>;
    save(value: unknown): Promise<void>;
}
export declare const fail: (code: string, message: string) => Error & {
    code: string;
};
export declare const copy: <T>(value: T) => T;
export declare function row(value: unknown): value is Record<string, unknown>;
export declare function exact(value: Record<string, unknown>, required: readonly string[], optional?: readonly string[]): boolean;
export declare function plain(value: unknown, max: number): value is string;
export declare function identifier(value: unknown): value is string;
export declare function version(value: unknown): value is number;
export declare function revision(value: unknown): value is number;
export declare function scopeValid(value: unknown): value is WorkflowScope;
export declare function sameScope(a: WorkflowScope, b: WorkflowScope): boolean;
export declare function assertScope(scope: WorkflowScope, nodeId: string): void;
export declare function bounded(value: unknown, maxBytes?: number): void;
/** One owner per profile file. Dispose drains an in-flight atomic write before
 * a replacement registry can open it. Callers never receive an unsaved result. */
export declare class StateQueue<T> {
    private readonly store;
    private state;
    private tail;
    private stopped;
    constructor(store: WorkflowDataStore, state: T);
    current(): T;
    private available;
    close(): Promise<void>;
    update<R>(change: (next: T) => R, signal: AbortSignal): Promise<R>;
}
