/** DSH-native facts -> optional, provider-neutral turn presentation. No paths
 * from prose/shell output, no synthetic persisted events, no model execution. */
type Row = Record<string, any>;
export declare function mutationPath(name: string, raw: string): string | null;
export declare class TurnActivityCompatibility {
    private state;
    accept(event: Row): Row | undefined;
}
export {};
