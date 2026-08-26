import type { Context } from '@deepseek-ai/cordis';
import { TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol';
import { type DirectoryRootStyle, type HostPlatformKind, type PlatformRootKind } from './host-platform.js';
export interface WechatDirectoryRootsRequest {
}
export interface WechatDirectoryRoot {
    readonly name: string;
    readonly path: string;
    readonly kind: PlatformRootKind;
    readonly displayRoot?: string;
}
export interface WechatDirectoryRootsValue {
    readonly home: string;
    readonly roots: readonly WechatDirectoryRoot[];
    readonly platform: HostPlatformKind;
    readonly rootStyle: DirectoryRootStyle;
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
    constructor(ctx: Context, config?: WechatDirectoryConfig);
    /** Enumerate roots through the selected host adapter; never guess C: through Z:. */
    roots(request: WechatDirectoryRootsRequest, signal: AbortSignal): Promise<WechatDirectoryRootsResult>;
    /** List one directory level with the same bounds and path fence as DSH browse. */
    list(request: WechatDirectoryListRequest, signal: AbortSignal): Promise<WechatDirectoryListResult>;
    /** Create exactly one child directory; never recurse or accept a path segment. */
    create(request: WechatDirectoryCreateRequest, signal: AbortSignal): Promise<WechatDirectoryCreateResult>;
    /**
     * Potentially blocking Windows network drives and macOS/Linux mounts are
     * enumerated in the same disposable Node worker. A dead mount can therefore
     * be killed without pinning DSH's event loop. The path travels only through
     * base64 environment data and is never interpolated into executable code.
     */
    private listMountedDirectory;
    /** Create one child on mounted storage in a killable process with the same deadline. */
    private createMountedDirectory;
}
export default WechatDirectoryService;
