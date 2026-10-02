import type { ToolDefinition, ToolRunContext } from '@deepseek-ai/dsh-tools';
import type { ImageAttachmentRef } from '@deepseek-ai/dsh-attachment';
import type { HumanToolsCore } from '../human-tools/core.js';
import type { WorkflowLifecycle } from './lifecycle.js';
export interface LifecycleToolsOptions {
    nodeId: string;
    lifecycle: WorkflowLifecycle;
    core: HumanToolsCore;
    assertAgent(exec: ToolRunContext): void;
    saveImage?(image: Uint8Array, mediaType: 'image/png' | 'image/jpeg'): Promise<ImageAttachmentRef>;
}
export declare function lifecycleTools(options: LifecycleToolsOptions): ToolDefinition[];
