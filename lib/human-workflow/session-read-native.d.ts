/** Native point reads shared by owner-input, session intents and automation.
 * Reading an old session must never restore/resolve an Agent or publish it to
 * the live SessionStore. Authorization and principal/generation checks remain
 * with each caller; a readable log is not permission to execute anything. */
interface SessionReadHost {
    get(name: any): any;
}
export interface NativeSessionRead {
    meta: Record<string, any>;
    events: readonly Record<string, any>[];
}
export declare function nativeSessionReadSupported(host: SessionReadHost): boolean;
export declare function readNativeSession(host: SessionReadHost, sessionId: string, signal: AbortSignal, options?: {
    includeEvents?: boolean;
}): Promise<NativeSessionRead>;
export {};
