export type HostManager = {
    kind: 'process';
} | {
    kind: 'systemd';
    unit: string;
} | {
    kind: 'launchd';
    label: string;
    domain: string;
    plist: string;
};
export declare function validateManager(value: HostManager): void;
/** Called INSIDE DSH, so pid and service ownership cannot be guessed by a client. */
export declare function currentHostManager(): HostManager;
export declare function stopManagedHost(manager: HostManager): void;
export declare function startManagedHost(manager: HostManager): void;
/** Service-owned children may be killed with their parent: use a sibling job. */
export declare function startUpdateWorker(manager: HostManager, directory: string, executable: string): void;
