export interface HumanWorkflowInlinePreview {
    schema: 'human.workflow.inline.v1';
    kind: 'round' | 'review';
    taskTitle: string;
    roundTitle?: string;
    submissionCreatedAt?: number;
    content: Record<string, unknown>;
    target?: {
        participantRef: string;
        submissionId: string;
        submissionVersion: number;
    };
}
export declare function humanWorkflowInlinePreview(v: unknown): HumanWorkflowInlinePreview | undefined;
/** A caller must explicitly fall back to its complete page preview if absent.
 * In particular, an asset digest is not proof that the cover was displayed. */
export declare function workflowInlinePreview(draft: unknown): HumanWorkflowInlinePreview | undefined;
