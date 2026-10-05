import { workflowCapabilityContracts } from './capability-contracts.js';
export type CapabilityStatus = 'available' | 'blocked' | 'planned';
export declare const CAPABILITY_IDS: readonly ["surface.reading-confirmation", "surface.cover-image", "action.select-members", "action.remind-selected-pending", "surface.form-collection", "task.audience-select", "task.audience-known", "task.lifecycle", "task.private-publish", "task.query", "recipient.query", "task.reshare", "workspace.directory", "assistant.design", "mode.packages", "workflow.records", "submission.receive", "submission.file-receive", "result.private", "automation.run"];
export type CapabilityId = typeof CAPABILITY_IDS[number];
export interface WorkflowCapability {
    id: CapabilityId;
    version: 1;
    status: CapabilityStatus;
    description: string;
    tools: string[];
    ownerApproval: boolean;
    reason?: string;
}
export interface CapabilityManifest {
    schema: 'human.capabilities.v1';
    nodeId: string;
    version: 1;
    capabilities: WorkflowCapability[];
    cardKinds: ('reading-confirmation' | 'form-collection')[];
    fieldKinds: ['short-text', 'long-text', 'choice', 'boolean', 'number'];
    limits: {
        fields: 12;
        choices: 12;
        titleCharacters: 80;
        bodyCharacters: 1000;
    };
    /** Legacy limits above describe mode templates, not member collection forms. */
    contracts: ReturnType<typeof workflowCapabilityContracts>;
}
export type CapabilityAvailability = Partial<Record<'surface.reading-confirmation' | 'surface.cover-image' | 'action.select-members' | 'action.remind-selected-pending' | 'task.query' | 'recipient.query' | 'task.reshare' | 'workspace.directory' | 'assistant.design' | 'surface.form-collection' | 'task.audience-select' | 'task.audience-known' | 'task.lifecycle' | 'task.private-publish' | 'submission.receive' | 'submission.file-receive' | 'result.private' | 'automation.run', {
    status: CapabilityStatus;
    reason?: string;
}>>;
export declare function createCapabilityManifest(nodeId: string, availability?: CapabilityAvailability): CapabilityManifest;
export declare function availableCapability(manifest: CapabilityManifest, id: string): boolean;
