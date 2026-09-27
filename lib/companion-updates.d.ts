type Scope = 'web' | 'desktop';
type Target = {
    owner: 'cli' | 'native';
    version: string;
};
interface Offer {
    schema: 1;
    id: string;
    from: Scope;
    to: Scope;
    version: string;
    previous: string;
    source: string;
}
export type CompanionResult = {
    state: 'idle' | 'pending' | 'busy' | 'preparing' | 'installing' | 'verifying' | 'recovering' | 'restart-required' | 'complete' | 'unavailable';
    message: string;
};
/** Only already enabled installations participate. Do not re-enable a plugin,
 * create another profile, downgrade, or guess which mixed owner to replace. */
export declare function companionTarget(home: string, scope: Scope): Target | undefined;
/** Called after an explicit CLI install or first activation of a native bundle.
 * Capture the existing peer version: a later manual rollback invalidates this
 * offer instead of becoming an unwanted automatic re-upgrade. */
export declare function offerCompanionUpdate(home: string, from: Scope, source: string, version: string): Offer | undefined;
export declare function validateCompanionOffer(home: string, scope: Scope, offer: Offer): Target;
/** Never hand a peer's live directory to pnpm: local folder installs can link
 * the two profiles. Install a verified, immutable tarball kept outside both
 * profiles, so updating/removing the source cannot break the recipient. */
export declare function stageCompanionArchive(home: string, source: string, version: string): Promise<string>;
/** Native manager errors (including build approval) remain refusals. No extra
 * scripts are approved, and downloaded is never reported as running. */
export declare function applyNativeCompanion(home: string, scope: Scope, runningVersion: string, offer: Offer, services: {
    list(): Promise<{
        items: {
            running: boolean;
        }[];
    }>;
    install(spec: string): Promise<any>;
    stage?: typeof stageCompanionArchive;
    signal?: AbortSignal;
    progress?(value: CompanionResult): void;
}): Promise<CompanionResult>;
/** The existing Web transaction supplies idle fencing, exact launcher reuse,
 * verification and rollback. It is never passed the Desktop profile. */
/** Desktop's Electron executable is not a Web launch runtime. Discover only
 * a real Node already available to this OS user; never install a runtime or
 * reinterpret a desktop executable as the user's existing CLI. */
export declare function webInstallerRuntime(environment?: NodeJS.ProcessEnv, electron?: boolean): Promise<{
    executable: string;
    env: NodeJS.ProcessEnv;
}>;
/** No service daemon and no polling scanner: one fiber-owned file watcher plus
 * native agent-idle events. Old peers without this receiver keep their native
 * manual entry; an enabled legacy Web can use its existing one-line installer. */
export declare function mountCompanionUpdates(ctx: any, version: string): {
    status(): CompanionResult;
    dispose(): void;
};
export {};
