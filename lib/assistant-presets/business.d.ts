import { type WorkflowDataStore, type WorkflowScope } from '../human-workflow/data.js';
import type { AssistantRef, AssistantRegistry } from './registry.js';
/** Local business memory is neither a reusable preset nor a verified group fact. */
export interface AssistantBusinessContent {
    title: string;
    answers: Record<string, string>;
    memory: string;
}
export interface AssistantBusinessRecord {
    schema: 'human.assistant.business.v1';
    authority: 'local-business-notes';
    id: string;
    revision: number;
    scope: WorkflowScope;
    presetId: string;
    assistant: AssistantRef;
    content: AssistantBusinessContent;
    createdAt: number;
    updatedAt: number;
}
export interface AssistantBusinessOptions {
    nodeId: string;
    registry: AssistantRegistry;
    assertIdentity(): void;
    now?: () => number;
    randomId?: () => string;
}
export declare class AssistantBusinessRecords {
    private state;
    private options;
    private readonly now;
    private readonly randomId;
    private constructor();
    static open(store: WorkflowDataStore, options: AssistantBusinessOptions): Promise<AssistantBusinessRecords>;
    close(): Promise<void>;
    private current;
    private checkedRecord;
    start(scope: WorkflowScope, presetId: string, signal: AbortSignal): Promise<AssistantBusinessRecord>;
    get(scope: WorkflowScope, presetId: string): {
        onboarding: {
            status: "self-reported";
            pendingQuestions: {
                key: string;
                label: string;
                prompt: string;
            }[];
            meaning: string;
        };
        schema: "human.assistant.business.v1";
        authority: "local-business-notes";
        id: string;
        revision: number;
        scope: WorkflowScope;
        presetId: string;
        assistant: AssistantRef;
        content: AssistantBusinessContent;
        createdAt: number;
        updatedAt: number;
    };
    save(scope: WorkflowScope, presetId: string, request: {
        expectedRevision: number;
        content: unknown;
    }, signal: AbortSignal): Promise<AssistantBusinessRecord>;
}
