import { type NetworkInterfaceInfo } from 'node:os';
export type HostPlatformKind = 'windows' | 'macos' | 'linux' | 'unknown';
export type HostPathStyle = 'windows' | 'posix';
export type DirectoryRootStyle = 'drives' | 'filesystem';
export type PlatformRootKind = 'local' | 'network' | 'filesystem' | 'home' | 'volume';
export interface HostPlatformDescriptor {
    readonly kind: HostPlatformKind;
    readonly name: string;
    readonly pathStyle: HostPathStyle;
    readonly directoryRootStyle: DirectoryRootStyle;
}
export interface PlatformFilesystemRoot {
    readonly name: string;
    readonly path: string;
    readonly kind: PlatformRootKind;
    readonly displayRoot?: string;
}
export interface HostPlatformAdapter {
    readonly descriptor: HostPlatformDescriptor;
    filesystemRoots(signal: AbortSignal): Promise<readonly PlatformFilesystemRoot[]>;
    isPotentiallyBlockingPath(target: string, signal: AbortSignal): Promise<boolean>;
    lanIPv4(): string;
}
export declare const hostPlatform: HostPlatformAdapter;
export declare function hostPlatformDescriptor(): HostPlatformDescriptor;
/**
 * Choose a real private LAN address, not a VPN/VM/benchmark adapter. Interface
 * names are only ranking hints; no chosen address is persisted by this layer.
 */
export declare function selectLanIPv4(source?: Readonly<Record<string, readonly NetworkInterfaceInfo[] | undefined>>): string;
