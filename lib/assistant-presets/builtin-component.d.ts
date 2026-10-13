import type { Context } from '@deepseek-ai/cordis';
import { type BuiltinTemplateId, type BuiltinAssistantStatus } from './builtins.js';
export type BuiltinAssistantHost = {
    get(name: string): any;
    provide(name: any, service: any): unknown;
    effect(callback: () => () => Promise<void>, label: string): unknown;
};
export interface BuiltinAssistantOptions {
    /** Omitted by the old independent components; presence advertises card control. */
    enabled?: () => boolean;
    reason?: () => string;
    managed?: boolean;
}
/** A real main-bundle component; no install/profile mutation, child package or
 * generated account-specific ID. Uses the same public registry as DSH's native
 * preset component, retaining the host's current validated standard policies. */
export declare class BuiltinAssistantComponent {
    private readonly host;
    private readonly options;
    private readonly lifetime;
    private readonly ready;
    private unregister?;
    private expected?;
    private settled;
    private changes;
    private closing?;
    private unsubscribe?;
    private issue;
    private readonly definition;
    constructor(host: BuiltinAssistantHost, templateId: BuiltinTemplateId, options?: BuiltinAssistantOptions);
    /** Serialize every opt-in, entitlement and component transition per native ID. */
    notify(): Promise<void>;
    close(): Promise<void>;
    /** Native reads can wait on the global Loader, including our own unload.
     * Cancel that wait; a late registration still disposes only its own entry. */
    private wait;
    private initialize;
    status(options?: {
        waitForReady?: boolean;
    }): Promise<BuiltinAssistantStatus>;
}
export declare function builtinComponent(templateId: BuiltinTemplateId): {
    new (ctx: Context): {};
    inject: string[];
};
