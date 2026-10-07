import type { Context } from '@deepseek-ai/cordis';
/** Match DSH's home override without importing a package absent in older DSH. */
export declare function adapterDshHome(environment?: {
    readonly DSH_HOME?: string;
}, userHome?: string): string;
export type DshWebPortSource = 'web-server' | 'environment' | 'legacy-default';
export interface DshWebRuntime {
    readonly port: number;
    readonly source: DshWebPortSource;
}
export interface DshRuntimeEnvironment {
    readonly DSH_PORT?: string;
}
/**
 * Resolve the listening DSH Web port from the host service itself.
 *
 * `dsh --port` is a command-line option, not an inherited `DSH_PORT`
 * environment variable. Reading `ctx.webServer.port` therefore keeps the
 * adapter attached to the correct profile and also supports `--port 0` after
 * DSH has selected an OS-assigned port. The environment variable remains a
 * compatibility fallback for hand-built/older compositions.
 */
export declare function resolveDshWebRuntime(ctx: Context, environment?: DshRuntimeEnvironment): DshWebRuntime;
/** Only the active profile's loopback Web UI may read the local pairing door. */
export declare function isAllowedDshWebOrigin(origin: string | undefined, port: number): boolean;
