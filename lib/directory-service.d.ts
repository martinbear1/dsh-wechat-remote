import type { Context } from '@deepseek-ai/cordis';
import { TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol';
export interface WechatDirectoryRootsRequest {
}
export interface WechatDirectoryRoot {
    readonly name: string;
    readonly path: string;
    readonly kind: 'local' | 'network' | 'filesystem';
    readonly displayRoot?: string;
}
export interface WechatDirectoryRootsValue {
    readonly home: string;
    readonly roots: readonly WechatDirectoryRoot[];
}
export interface WechatDirectoryRootsError {
    readonly code: 'drive-enumeration-failed';
    readonly message: string;
}
export type WechatDirectoryRootsResult = {
    readonly ok: true;
    readonly value: WechatDirectoryRootsValue;
} | {
    readonly ok: false;
    readonly error: WechatDirectoryRootsError;
};
export interface WechatDirectoryListRequest {
    readonly path?: string;
}
export interface WechatDirectoryCrumb {
    readonly name: string;
    readonly path: string;
    readonly hidden: boolean;
}
export interface WechatDirectoryEntry {
    readonly name: string;
    readonly path: string;
    readonly hidden: boolean;
}
export interface WechatDirectoryListValue {
    readonly path: string;
    readonly home: string;
    readonly crumbs: readonly WechatDirectoryCrumb[];
    readonly entries: readonly WechatDirectoryEntry[];
    readonly truncated: boolean;
}
export interface WechatDirectoryListError {
    readonly code: 'directory-unreadable' | 'directory-timeout' | 'network-unavailable';
    readonly path: string;
    readonly message: string;
}
export type WechatDirectoryListResult = {
    readonly ok: true;
    readonly value: WechatDirectoryListValue;
} | {
    readonly ok: false;
    readonly error: WechatDirectoryListError;
};
export interface WechatDirectoryCreateRequest {
    readonly path: string;
    readonly name: string;
}
export interface WechatDirectoryCreateValue {
    readonly path: string;
}
export interface WechatDirectoryCreateError {
    readonly code: 'directory-exists' | 'directory-create-failed';
    readonly path: string;
    readonly message: string;
}
export type WechatDirectoryCreateResult = {
    readonly ok: true;
    readonly value: WechatDirectoryCreateValue;
} | {
    readonly ok: false;
    readonly error: WechatDirectoryCreateError;
};
export interface WechatDirectoryConfig {
    readonly maxEntries?: number;
    readonly operationTimeoutMs?: number;
}
declare module '@deepseek-ai/cordis' {
    interface Context {
        wechatDirectory: WechatDirectoryService;
    }
}
/**
 * Host-only directory service exposed through the standard DSH Typert gateway.
 */
export declare class WechatDirectoryService extends TypertRemoteService {
    private readonly maxEntries;
    private readonly operationTimeoutMs;
    private readonly windowsRoots;
    private windowsRootsPromise?;
    constructor(ctx: Context, config?: WechatDirectoryConfig);
    /** Enumerate real filesystem roots once; never guess C: through Z:. */
    roots(request: WechatDirectoryRootsRequest, signal: AbortSignal): Promise<WechatDirectoryRootsResult>;
    /** List one directory level with the same bounds and path fence as DSH browse. */
    list(request: WechatDirectoryListRequest, signal: AbortSignal): Promise<WechatDirectoryListResult>;
    /** Create exactly one child directory; never recurse or accept a path segment. */
    create(request: WechatDirectoryCreateRequest, signal: AbortSignal): Promise<WechatDirectoryCreateResult>;
    /**
     * Share one non-blocking drive snapshot between roots() and the initial home
     * listing. The child process still has its own 8 s kill deadline, while each
     * caller may stop waiting through the Typert request signal.
     */
    private readWindowsRoots;
    /** Treat UNC paths and mapped drives reported with DisplayRoot as network I/O. */
    private isNetworkTarget;
    /**
     * Network shares are enumerated in a disposable PowerShell child. A dead
     * mapped drive can therefore be killed without pinning DSH's event loop.
     * The path travels only through base64 environment data; no client text is
     * interpolated into the fixed script.
     */
    private listNetworkDirectory;
    /** Create one network-share child in a killable process with the same deadline. */
    private createNetworkDirectory;
}
export default WechatDirectoryService;
