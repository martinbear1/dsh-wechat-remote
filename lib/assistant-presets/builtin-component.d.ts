import type { Context } from '@deepseek-ai/cordis';
import { type BuiltinTemplateId, type BuiltinAssistantStatus } from './builtins.js';
type Host = {
    get(name: string): any;
    provide(name: any, service: any): unknown;
    effect(callback: () => () => Promise<void>, label: string): unknown;
};
/** A real main-bundle component; no install/profile mutation, child package or
 * generated account-specific ID. Uses the same public registry as DSH's native
 * preset component, retaining the host's current validated standard policies. */
export declare class BuiltinAssistantComponent {
    private readonly host;
    private readonly lifetime;
    private readonly ready;
    private unregister?;
    private expected?;
    private settled;
    private changes;
    private unsubscribe?;
    private issue;
    private readonly definition;
    constructor(host: Host, templateId: BuiltinTemplateId);
    private initialize;
    status(options?: {
        waitForReady?: boolean;
    }): Promise<BuiltinAssistantStatus>;
}
export declare function builtinComponent(templateId: BuiltinTemplateId): {
    new (ctx: Context): {};
    inject: string[];
};
export {};
