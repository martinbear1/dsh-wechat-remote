type Row = Record<string, any>;
export declare function mutationPath(name: string, raw: string): string | null;
export declare class TurnActivityCompatibility {
    private state;
    private nextTurn;
    private nextStep;
    private previousSeq;
    accept(event: Row, facts?: {
        readonly mutationPath: string | null;
    }): Row | undefined;
}
export {};
