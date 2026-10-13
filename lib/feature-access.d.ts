import type { Context } from '@deepseek-ai/cordis';
import { TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol';
export type AccountFeature = 'group_assistant' | 'clawbot' | 'history_import';
export interface FeatureGrant {
    allowed: boolean;
    reason: string;
    validUntil: number | null;
    message?: string;
}
export interface FeatureLease {
    schemaVersion: 1;
    nodeId: string;
    accountInstance: string | null;
    checkedAt: number;
    expiresAt: number;
    features: Record<AccountFeature, FeatureGrant>;
}
export type FeatureStatus = FeatureLease & {
    groupEnabled: boolean;
    groupComponentAvailable?: boolean;
    historyImportEnabled: boolean;
};
export interface FeatureAuthorization {
    readonly owner: string;
    assertCurrent(): void;
    revalidate?(signal: AbortSignal): Promise<void>;
}
export type FeatureControlResult = {
    ok: true;
    value: FeatureStatus;
} | {
    ok: false;
    error: {
        code: string;
        message: string;
    };
};
export declare function featureMessage(reason: string): string;
export declare class FeatureAccessError extends Error {
    readonly reason: string;
    readonly code = "feature-access-denied";
    constructor(reason: string);
}
export declare function validateFeatureLease(value: unknown, nodeId: string): FeatureLease;
/** One identity-bound, single-flight lease for both local and phone controls.
 * The server's duration is bounded by monotonic time, not the PC wall clock.
 * This is never populated by a mobile-supplied capability/allowed flag. */
export declare class FeatureAccess {
    private readonly source;
    private readonly preferenceFile?;
    private readonly monotonic;
    private lease?;
    private until;
    private flight?;
    private generation;
    private readAbort?;
    private intent;
    private expiry?;
    private renewal?;
    private closed;
    private listeners;
    private requested?;
    private historyRequested?;
    private historyIntent;
    private historyEpoch;
    private historyAuthority;
    constructor(source: {
        nodeId(): string;
        read(signal: AbortSignal): Promise<unknown>;
        groupAvailable?(): boolean;
    }, preferenceFile?: string | undefined, monotonic?: () => number);
    subscribe(listener: () => void): () => void;
    private emit;
    invalidate(): void;
    private clearLease;
    private renewWhileEnabled;
    private live;
    groupComponentAvailable(): boolean;
    /** Component lifecycle changes effective access, never the user's saved intent. */
    componentsChanged(): void;
    groupEnabled(): boolean;
    historyImportEnabled(): boolean;
    grant(feature: AccountFeature, requireEnabled?: boolean): FeatureGrant;
    refresh(force?: boolean): Promise<void>;
    assertCurrent(feature: AccountFeature, requireEnabled?: boolean): void;
    assert(feature: AccountFeature, requireEnabled?: boolean): Promise<void>;
    setGroupEnabled(enabled: boolean, signal?: AbortSignal): Promise<void>;
    private savePreferences;
    setHistoryImportEnabled(enabled: boolean, signal?: AbortSignal): Promise<void>;
    authorizeHistoryImport(signal?: AbortSignal): Promise<FeatureAuthorization>;
    currentOwner(signal?: AbortSignal): Promise<string | undefined>;
    snapshot(): FeatureStatus;
    close(): void;
}
declare module '@deepseek-ai/cordis' {
    interface Context {
        wechatFeatures: WechatFeaturesService;
    }
}
export declare class WechatFeaturesService extends TypertRemoteService {
    private readonly host;
    readonly access: FeatureAccess;
    constructor(host: Context, config: {
        source: ConstructorParameters<typeof FeatureAccess>[0];
        preferenceFile: string;
    });
    control(request: {
        action: 'status' | 'group.enabled' | 'assistant.enabled' | 'historyImport.enabled';
        enabled?: boolean;
        templateId?: 'teacher' | 'project' | 'designer';
    }, signal: AbortSignal): Promise<FeatureControlResult>;
}
export declare function hostFeatureAccess(host: {
    get(name: any): any;
}): FeatureAccess;
