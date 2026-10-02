import type { ToolDefinition } from '@deepseek-ai/dsh-tools';
import type { ImageAttachmentRef } from '@deepseek-ai/dsh-attachment';
import type { HumanToolsCore } from '../human-tools/core.js';
import { type HumanWorkflowDraftRef } from '../human-tools/protocol.js';
import type { WorkflowLifecycle } from './lifecycle.js';
import type { AutomationPolicy, AutomationRun } from './automation-types.js';
export interface AutomationToolsOptions {
    lifecycle: WorkflowLifecycle;
    core: HumanToolsCore;
    run: AutomationRun;
    policy: AutomationPolicy;
    authorize(signal: AbortSignal): Promise<void>;
    saved(value: {
        analysisRevision: number;
        draftRef: HumanWorkflowDraftRef;
    }): Promise<void>;
    saveImage?(data: Uint8Array, mediaType: 'image/png' | 'image/jpeg'): Promise<ImageAttachmentRef>;
}
/** Job-closed capabilities: model arguments contain no task, member, scope,
 * path or URL. The native adapter registers these only in the owning Agent
 * and permits them only in the exact plugin-message turn. */
export declare function automationTools(options: AutomationToolsOptions): ToolDefinition[];
