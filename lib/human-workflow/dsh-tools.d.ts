import type { Context } from '@deepseek-ai/cordis';
import type { JsonSchemaNode, ToolDefinition } from '@deepseek-ai/dsh-tools';
import { type HumanSurface } from '../human-tools/protocol.js';
import type { CapabilityManifest } from './capabilities.js';
import { ModeRegistry } from './mode-package.js';
import { WorkflowRecords } from './workflow-records.js';
import { type WorkflowScope } from './data.js';
export interface HumanWorkflowToolsOptions {
    nodeId: string;
    modes: ModeRegistry;
    records: WorkflowRecords;
    capabilities(): CapabilityManifest;
    /** Delegate to the existing HumanToolsCore.create: same ledger, root-call
     * idempotency and owner-approved native action as the original share tool. */
    prepareCard(input: {
        scope: WorkflowScope;
        callId: string;
        rootCallId: string;
        title: string;
        body: string;
        sourceSurfaceId?: string;
    }, signal: AbortSignal): Promise<HumanSurface>;
}
export declare const MODE_FIELD_SCHEMA: JsonSchemaNode;
/** Shipped with the tool, rather than asking a model to invent JSON in chat. */
export declare const MODE_PACKAGE_SCHEMA: JsonSchemaNode;
export declare const WORKFLOW_CONTENT_SCHEMA: JsonSchemaNode;
export declare function humanWorkflowTools(options: HumanWorkflowToolsOptions): ToolDefinition[];
/** Approved business guidance only; no Inbox writes, polling, or model wakeup. */
export declare function registerHumanWorkflowContext(ctx: Context, options: HumanWorkflowToolsOptions): () => void;
