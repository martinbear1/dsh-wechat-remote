import type { ToolDefinition, ToolRunContext } from '@deepseek-ai/dsh-tools';
import type { WorkflowLifecycle } from './lifecycle.js';
/** Exports only a currently-authorized, verified, durable attachment. A user
 * display name never selects a local path. File contents are untrusted input. */
export declare function submissionFileTool(options: {
    nodeId: string;
    lifecycle: WorkflowLifecycle;
    assertAgent(exec: ToolRunContext): void;
}): ToolDefinition;
