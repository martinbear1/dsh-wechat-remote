import type { Context } from '@deepseek-ai/cordis';
export interface InstallControlConfig {
    directory: string;
    token: string;
    pnpm: string;
}
export declare function quiesceNativeHost(ctx: Context, read: (method: string) => Promise<any>, disposing: () => void): Promise<void>;
export declare function createInstallControl(context: Context, config: InstallControlConfig): Promise<{
    origin: string;
    close(): void;
}>;
/** Loaded temporarily through the official profile patch/HMR extension point. */
export declare const apply: (ctx: Context, config: InstallControlConfig) => Promise<void>;
export declare const inject: string[];
