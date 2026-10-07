export interface HostContext {
    get(name: string): unknown;
}
export interface DshProfileFacts {
    readonly name: string;
    readonly home: string;
    readonly dir: string;
    readonly installAnchor: string;
}
/** DSH supplies this service before mounting profile plugins. Missing is the
 * legacy compatibility case; malformed is NOT permission to use Web's state.
 * Retire absence fallback only when pre-profileContext hosts leave support. */
export declare function dshProfileFacts(ctx?: HostContext): DshProfileFacts | undefined;
/** The Desktop launcher, not a CLI worker, owns its install/restart lifecycle. */
export declare function desktopOwnsLifecycle(ctx?: HostContext): boolean;
/** Prefer the actual bundled runtime. Never search PATH: another CLI on this
 * computer can have a different protocol from the running Desktop host. */
export declare function hostRuntimeVersion(ctx?: HostContext, entry?: string): string | undefined;
