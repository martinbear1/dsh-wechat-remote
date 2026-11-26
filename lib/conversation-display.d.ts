/** Node-scoped rendering choices over the native ui-chat settings owner.
 * Only presentation metadata rides this service; conversation events are never filtered.
 */
import type { Context } from '@deepseek-ai/cordis';
import { TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol';
export declare const DISPLAY_CAPABILITY = "conversation.display";
declare const CHOICES: {
    readonly transcriptView: readonly ["compact", "standard", "detailed", "verbose"];
    readonly collapseTiming: readonly ["completion", "next-input"];
    readonly foldedReplies: readonly ["all", "final"];
};
type Field = keyof typeof CHOICES;
export interface DisplayHost {
    get(name: string): unknown;
}
export interface DisplaySnapshot {
    schema: 'conversation.display.v1';
    scope: 'node';
    provider: 'dsh-native';
    supported: boolean;
    writable: boolean;
    revision?: number;
    generation?: string;
    values: Partial<Record<Field, string>>;
    options: Partial<Record<Field, string[]>>;
    reason?: string;
}
export interface DisplayRequest {
    action: string;
    inputJson?: string;
}
export type DisplayResult = {
    ok: true;
    valueJson: string;
} | {
    ok: false;
    error: {
        code: string;
        message: string;
    };
};
/** Direct Host service adapter: no profile file writes, process globals, or alternate transport. */
export declare class NativeConversationDisplay {
    private readonly host;
    private writes;
    private readonly ownerGenerations;
    constructor(host: DisplayHost);
    private settings;
    /** Capability lookup does not enumerate settings or read a Session. */
    available(): boolean;
    private generation;
    private snapshot;
    read(signal: AbortSignal): Promise<DisplaySnapshot>;
    patch(input: unknown, signal: AbortSignal): Promise<DisplaySnapshot>;
}
declare module '@deepseek-ai/cordis' {
    interface Context {
        wechatDisplay: WechatDisplayService;
    }
}
/** Additive owner-authenticated Remote with a bounded JSON envelope for cross-agent clients. */
export declare class WechatDisplayService extends TypertRemoteService {
    private readonly adapter;
    private readonly lifetime;
    constructor(ctx: Context);
    available(): boolean;
    control(request: DisplayRequest, signal: AbortSignal): Promise<DisplayResult>;
}
export {};
