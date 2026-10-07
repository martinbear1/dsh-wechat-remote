import { type AssistantDefinition } from './definition.js';
/** Product-owned identities. Never derived from a customer's install/session IDs.
 * A later definition revision must retain the preceding version for old records. */
export declare const BUILTIN_ASSISTANTS: readonly [{
    readonly templateId: "teacher";
    readonly presetId: "harness-teacher";
    readonly service: "harnessTeacherAssistant";
    readonly name: "教师助理";
}, {
    readonly templateId: "project";
    readonly presetId: "harness-project";
    readonly service: "harnessProjectAssistant";
    readonly name: "项目助理";
}, {
    readonly templateId: "designer";
    readonly presetId: "harness-customizer";
    readonly service: "harnessCustomizerAssistant";
    readonly name: "定制助手";
}];
export type BuiltinTemplateId = typeof BUILTIN_ASSISTANTS[number]['templateId'];
export interface BuiltinAssistant {
    id: string;
    version: number;
    digest: string;
    templateId: BuiltinTemplateId;
    presetId: string;
    name: string;
    definition: AssistantDefinition;
    sourceTemplateDigest: string;
}
export interface BuiltinAssistantStatus extends BuiltinAssistant {
    state: 'installed' | 'unknown';
    nativeState: 'installed' | 'disabled' | 'stale' | 'unknown';
    reason?: string;
    source: 'builtin';
}
export declare function builtinAssistants(): BuiltinAssistant[];
export declare const builtinAssistant: (id: string, version: number) => BuiltinAssistant | undefined;
