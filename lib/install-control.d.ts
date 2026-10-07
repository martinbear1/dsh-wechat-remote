/** Compatibility boundary for old temporary installer plugins.
 * No private HTTP server, root disposal, shutdown or worker launch is allowed. */
import type { Context } from '@deepseek-ai/cordis';
export { legacyUpdateError } from './install-capabilities.js';
export interface InstallControlConfig {
    directory: string;
    token: string;
    pnpm: string;
}
/** Read-only diagnostic; not an installation admission or host lifecycle hook. */
export declare function nativeInstallSessions(ctx: Context, signal: AbortSignal): Promise<any>;
export declare function quiesceNativeHost(_ctx: Context, _read: (method: string) => Promise<any>, _disposing: () => void): Promise<never>;
export declare function createInstallControl(context: Context, _config: InstallControlConfig): Promise<{
    origin: string;
    close(): void;
}>;
/** Old HMR callers fail before any host resource is acquired. */
export declare const apply: (ctx: Context, config: InstallControlConfig) => Promise<void>;
