import type { Context } from '@deepseek-ai/cordis';
import type { ToolDefinition } from '@deepseek-ai/dsh-tools';
import type { HumanToolsCore } from './core.js';
/** Only this adapter knows DSH tool execution, agent/session and prompt semantics. */
export declare function dshHumanToolsAvailable(ctx: Context): boolean;
export declare const HUMAN_CONTEXT_NAME = "harness-remote.human-actions";
export declare function registerHumanContext(ctx: Context, core: HumanToolsCore): () => void;
export declare function humanMembersTool(core: HumanToolsCore): ToolDefinition;
export declare function humanRemindTool(core: HumanToolsCore): ToolDefinition;
export declare function humanShareTool(core: HumanToolsCore): ToolDefinition;
