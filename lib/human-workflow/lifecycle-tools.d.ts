import type { ToolDefinition, ToolRunContext } from '@deepseek-ai/dsh-tools';
import type { ImageAttachmentRef } from '@deepseek-ai/dsh-attachment';
import type { HumanToolsCore } from '../human-tools/core.js';
import { type HumanTaskRef, type HumanWorkflowDraftRef } from '../human-tools/protocol.js';
import { type WorkflowLifecycle, type PrivatePublishInput } from './lifecycle.js';
import type { WorkspaceDirectory } from './workspace-directory.js';
export interface LifecycleToolsOptions {
    nodeId: string;
    lifecycle: WorkflowLifecycle;
    core: HumanToolsCore;
    directory?: WorkspaceDirectory;
    assertAgent(exec: ToolRunContext): void;
    /** Trusted runtime injection. Model arguments cannot supply this authority. */
    ownerInput?(exec: ToolRunContext, taskRef: HumanTaskRef, draftRef: HumanWorkflowDraftRef): Promise<PrivatePublishInput>;
    ownerInputStatus?(exec: ToolRunContext): Promise<{
        schema: 'human.private.update.status.v1';
        state: 'ready' | 'unavailable' | 'no-current-input';
        expiresAt?: number;
        reason?: string;
    }>;
    saveImage?(image: Uint8Array, mediaType: 'image/png' | 'image/jpeg'): Promise<ImageAttachmentRef>;
}
export declare function lifecycleTools(options: LifecycleToolsOptions): ToolDefinition[];
