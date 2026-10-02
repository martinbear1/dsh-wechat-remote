import type { Context } from '@deepseek-ai/cordis';
import type { ToolDefinition, ToolRunContext } from '@deepseek-ai/dsh-tools';
import type { AssistantRegistry } from './registry.js';
import type { AssistantBusinessRecords } from './business.js';
export interface AssistantToolsOptions {
    nodeId: string;
    registry: AssistantRegistry;
    business: AssistantBusinessRecords;
    assertIdentity(): void;
    /** Must reject a replaced/non-current Agent, even when no preset is composed. */
    composedPreset(agent: ToolRunContext['agent']): string | undefined;
}
export declare const ASSISTANT_DEFINITION_SCHEMA: {
    type: string;
    properties: Record<string, unknown>;
    required: string[];
    additionalProperties: boolean;
};
export declare const ASSISTANT_BUSINESS_SCHEMA: {
    type: string;
    properties: Record<string, unknown>;
    required: string[];
    additionalProperties: boolean;
};
/** Exact public 0.2.0 registry seam. No header/current-preset guesses or old API fallback. */
export declare function nativeComposedPreset(host: Context, agent: ToolRunContext['agent']): string | undefined;
export declare function assistantTools(options: AssistantToolsOptions): ToolDefinition[];
/** Only the real current Agent receives this fixed tool guidance. Private
 * answers/memory are retrieved through checked tools, never prompt-wide data. */
export declare function registerAssistantContext(host: Context, options: AssistantToolsOptions): () => void;
