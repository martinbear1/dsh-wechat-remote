import type { ToolDefinition, ToolRunContext } from '@deepseek-ai/dsh-tools';
import type { ImageAttachmentRef } from '@deepseek-ai/dsh-attachment';
import type { HumanToolsCore } from '../human-tools/core.js';
import { type WorkflowLifecycle } from './lifecycle.js';
import type { WorkspaceDirectory } from './workspace-directory.js';
export interface LifecycleToolsOptions {
    nodeId: string;
    lifecycle: WorkflowLifecycle;
    core: HumanToolsCore;
    directory?: WorkspaceDirectory;
    assertAgent(exec: ToolRunContext): void;
    saveImage?(image: Uint8Array, mediaType: 'image/png' | 'image/jpeg'): Promise<ImageAttachmentRef>;
}
export declare function lifecycleTools(options: LifecycleToolsOptions): ToolDefinition[];
