import { type HumanRecipientRef } from './protocol.js';
export interface HumanInitialRound {
    title: string;
    instructions: string;
    form: Record<string, unknown>;
    closesAt: number | null;
    recipientRefs: null;
    /** Missing retains the original all-group wire representation and digest. */
    audience?: 'all-group' | 'owner-select' | 'known-members';
    /** Opaque participants of the successful source task, never native member
     * IDs. Only known-members accepts this; the server resolves their identity. */
    sourceParticipantRefs?: string[];
    /** Current exact references may also describe selected/audience members who
     * have never opened the source task. Mutually exclusive with the legacy list. */
    sourceRecipientRefs?: HumanRecipientRef[];
}
export declare function humanForm(value: unknown): Record<string, unknown> | undefined;
export declare function humanInitialRound(value: unknown): HumanInitialRound | undefined;
/** Diagnostic data, not a second permissive parser. Never rewrite the request,
 * remove a requested format, echo submitted values, or infer runtime readiness. */
export interface HumanFormIssue {
    schema: 'human.form.issue.v1';
    path: string;
    code: 'object-required' | 'required' | 'unsupported-field' | 'misplaced-field' | 'schema-unsupported' | 'schema-feature-mismatch' | 'type-invalid' | 'value-invalid' | 'limit-exceeded' | 'attachment-format-unsupported' | 'attachment-kind-mismatch';
    message: string;
    expected?: string;
    correctPath?: string;
}
export declare function humanFormIssue(value: unknown, path?: string): HumanFormIssue | undefined;
export declare function humanRoundIssue(value: unknown, path?: string, mode?: 'initial' | 'round' | 'correction'): HumanFormIssue | undefined;
/** Message carries the safe path too: some native hosts display only Error.message. */
export declare function humanFormError(problem: HumanFormIssue): Error & {
    code: string;
    validation: HumanFormIssue;
};
