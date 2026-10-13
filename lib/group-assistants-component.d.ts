import type { Context } from '@deepseek-ai/cordis';
import { type BuiltinTemplateId } from './assistant-presets/builtins.js';
import { type BuiltinAssistantHost } from './assistant-presets/builtin-component.js';
export declare const name = "wechat-group-assistants";
export declare const inject: string[];
/** Only three local booleans, never a native profile/Agent/default-preset edit.
 * Separate from node opt-in: entitlement loss, the top switch and component
 * hot unload must not silently reset individual choices. */
export declare class GroupAssistantPreferences {
    private readonly file;
    private enabled;
    private issue;
    constructor(file: string);
    get(templateId: BuiltinTemplateId): boolean;
    get notice(): string;
    set(templateId: BuiltinTemplateId, enabled: boolean): void;
}
declare module '@deepseek-ai/cordis' {
    interface Context {
        wechatGroupAssistants: GroupAssistantsController;
    }
}
/** One native component owns the three stable preset declarations. Their old
 * status services remain available to the existing catalog/phone contract. */
export declare class GroupAssistantsController {
    private readonly host;
    private readonly preferences;
    private readonly components;
    private closed;
    private closing?;
    get active(): boolean;
    constructor(host: BuiltinAssistantHost, preferenceFile: string);
    private componentsChanged;
    notify(): Promise<void>;
    setEnabled(templateId: BuiltinTemplateId, enabled: boolean, signal?: AbortSignal): Promise<void>;
    close(): Promise<void>;
}
export declare function apply(ctx: Context): void;
