import type { ToolDefinition, ToolRunContext } from '@deepseek-ai/dsh-tools';
import type { WorkflowAutomation } from './automation-engine.js';
/** Ordinary Agent may propose/read, never approve, pause, dispatch or publish.
 * This does not register the three private automatic-turn execution tools. */
export declare function automationProposalTools(options: {
    nodeId: string;
    runtime: WorkflowAutomation;
    assertAgent(exec: ToolRunContext): void;
}): ToolDefinition[];
