import { ModeRegistry, type ModeReference } from './mode-package.js';
import { type WorkflowDataStore, type WorkflowScope } from './data.js';
/** References identify a version observed elsewhere. They never update that
 * source, establish identity/ACL, acknowledge delivery, or publish a result. */
export interface WorkflowFactReference {
    kind: 'task' | 'submission' | 'artifact';
    id: string;
    version: number;
}
export interface WorkflowContent {
    title: string;
    objective: string;
    plan: {
        id: string;
        title: string;
        state: 'planned' | 'working' | 'done' | 'blocked';
        notes?: string;
    }[];
    notes?: string;
    analyses: {
        id: string;
        summary: string;
        references: WorkflowFactReference[];
        result?: Record<string, unknown>;
    }[];
    onboardingAnswers?: Record<string, unknown>;
}
export interface WorkflowRecord {
    schema: 'human.workflow.record.v1';
    authority: 'agent-notes';
    id: string;
    revision: number;
    scope: WorkflowScope;
    mode: ModeReference;
    content: WorkflowContent;
    createdAt: number;
    updatedAt: number;
}
export interface WorkflowRecordsOptions {
    nodeId: string;
    modes: ModeRegistry;
    randomId(): string;
    now?: () => number;
    /** Optional, synchronous check against the authenticated node projection.
     * Missing authority rejects references, rather than trusting Agent claims. */
    validateReferences?: (scope: WorkflowScope, references: readonly WorkflowFactReference[]) => void;
}
export declare class WorkflowRecords {
    private readonly state;
    private readonly options;
    private readonly now;
    private constructor();
    static open(store: WorkflowDataStore, options: WorkflowRecordsOptions): Promise<WorkflowRecords>;
    close(): Promise<void>;
    private check;
    private find;
    private parse;
    create(scope: WorkflowScope, request: {
        mode: ModeReference;
        content: unknown;
    }, signal: AbortSignal): Promise<WorkflowRecord>;
    update(scope: WorkflowScope, request: {
        id: string;
        expectedRevision: number;
        content: unknown;
    }, signal: AbortSignal): Promise<WorkflowRecord>;
    get(scope: WorkflowScope, id: string): {
        onboarding: {
            status: "self-reported";
            pendingQuestions: {
                field: import("./mode-package.js").ModeField;
                prompt: string;
            }[];
            meaning: string;
        };
        schema: "human.workflow.record.v1";
        authority: "agent-notes";
        id: string;
        revision: number;
        scope: WorkflowScope;
        mode: ModeReference;
        content: WorkflowContent;
        createdAt: number;
        updatedAt: number;
    };
    list(scope: WorkflowScope): {
        schema: "human.workflow.list.v1";
        records: {
            id: string;
            revision: number;
            title: string;
            mode: ModeReference;
            updatedAt: number;
        }[];
    };
}
