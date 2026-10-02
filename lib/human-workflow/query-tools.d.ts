import type { ToolDefinition } from '@deepseek-ai/dsh-tools';
import type { WorkflowReplica } from './replica.js';
export declare function workflowQueryTools(nodeId: string, replica: WorkflowReplica): ToolDefinition[];
