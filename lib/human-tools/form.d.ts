export interface HumanInitialRound {
    title: string;
    instructions: string;
    form: Record<string, unknown>;
    closesAt: number | null;
    recipientRefs: null;
    /** Missing retains the original all-group wire representation and digest. */
    audience?: 'all-group' | 'owner-select';
}
export declare function humanForm(value: unknown): Record<string, unknown> | undefined;
export declare function humanInitialRound(value: unknown): HumanInitialRound | undefined;
