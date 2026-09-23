import type { Context } from '@deepseek-ai/cordis';
export interface InstallControlConfig {
    directory: string;
    token: string;
    pnpm: string;
}
/** Installer-owned in-process read. A broken third-party Typert contributor
 * must not prevent the operator from proving idle and repairing that plugin.
 * No network endpoint is exempted from its authentication/schema validation. */
export declare function nativeInstallSessions(ctx: Context, signal: AbortSignal): Promise<any>;
export declare function quiesceNativeHost(ctx: Context, read: (method: string) => Promise<any>, disposing: () => void): Promise<void>;
export declare function createInstallControl(context: Context, config: InstallControlConfig): Promise<{
    origin: string;
    close(): void;
}>;
/** Loaded temporarily through the official profile patch/HMR extension point. */
export declare const apply: (ctx: Context, config: InstallControlConfig) => Promise<void>;
export declare const inject: string[];
