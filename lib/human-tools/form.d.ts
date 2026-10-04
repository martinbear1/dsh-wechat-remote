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
}
export declare function humanForm(value: unknown): Record<string, unknown> | undefined;
export declare function humanInitialRound(value: unknown): HumanInitialRound | undefined;
