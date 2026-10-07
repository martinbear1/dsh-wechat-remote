import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Context } from '@deepseek-ai/cordis';
import { type HostContext } from './dsh-host-context.js';
import { type RuntimeVersion, type UpdateAdvice, type Release } from './update-policy.js';
export declare function previewUpdatesEnabled(env?: NodeJS.ProcessEnv): boolean;
export declare function updateAction(advice: UpdateAdvice, release: Release | undefined, eligible: {
    eligible: boolean;
    reason: string;
    manualInstallAllowed?: boolean;
}, _occupied: boolean, ctx?: HostContext): {
    canInstall: boolean;
    mode: 'none' | 'manual';
    reason: string;
    manualCommand: string;
};
export declare function acceptsUpdateRequest(req: Pick<IncomingMessage, 'headers' | 'socket'>, webPort: number, localPort: number): boolean;
/** Use DSH's own browser-authentication handoff after this instance restarts. */
export declare function resumedWebUrl(connection: any, origin: string, webPort: number): string;
export declare class PluginUpdateService {
    private ctx;
    private ports;
    private catalog;
    private checkedAt;
    private checking?;
    constructor(ctx: Context, ports: {
        web: number;
        gate: number;
        local: number;
    });
    current(): RuntimeVersion;
    private progressIndex;
    private recovery;
    check(force?: boolean): Promise<UpdateAdvice>;
    nativeRelease(): Promise<{
        advice: UpdateAdvice;
        release: Release | undefined;
        channel: "preview" | "stable";
    }>;
    private eligibility;
    handle(req: IncomingMessage, res: ServerResponse): Promise<void>;
    dispose(): void;
}
