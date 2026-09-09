import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Context } from '@deepseek-ai/cordis';
import { type RuntimeVersion, type UpdateAdvice, type Release } from './update-policy.js';
export declare function previewUpdatesEnabled(env?: NodeJS.ProcessEnv): boolean;
export declare function updateAction(advice: UpdateAdvice, release: Release | undefined, eligible: {
    eligible: boolean;
    reason: string;
}, occupied: boolean): {
    canInstall: boolean;
    mode: 'none' | 'automatic' | 'manual' | 'busy';
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
    private ticket?;
    private busy;
    private maintenance;
    private activeJob?;
    private restoreFence?;
    private startupJob?;
    private startupTimer?;
    private restoreStartup?;
    private nativeRequests;
    private readToken;
    private otherInFlight;
    private requestObserver;
    constructor(ctx: Context, ports: {
        web: number;
        gate: number;
        local: number;
    });
    private fenceStartup;
    isVerificationProbe(req: IncomingMessage): boolean;
    trackPublicRequests(check: () => boolean): void;
    current(): RuntimeVersion;
    isMaintaining(): boolean;
    private progressIndex;
    private recovery;
    check(force?: boolean): Promise<UpdateAdvice>;
    private eligibility;
    private begin;
    handle(req: IncomingMessage, res: ServerResponse): Promise<void>;
    dispose(): void;
}
