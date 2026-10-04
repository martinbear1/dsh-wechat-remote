import type { ToolDefinition, ToolRunContext } from '@deepseek-ai/dsh-tools';
import type { HumanToolsCore } from '../human-tools/core.js';
import type { WorkflowLifecycle } from './lifecycle.js';
import type { WorkspaceDirectory } from './workspace-directory.js';
export declare function workspaceTools(options: {
    nodeId: string;
    directory: WorkspaceDirectory;
    lifecycle: WorkflowLifecycle;
    core: HumanToolsCore;
    assertAgent(exec: ToolRunContext): void;
}): ToolDefinition[];
