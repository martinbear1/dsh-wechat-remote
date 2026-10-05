/** Report bounded field paths, never submitted values or a copy of business memory. */
export declare function assistantFieldPath(parent: string, key: string): string;
export declare function assistantObject(value: unknown, required: readonly string[], optional?: readonly string[], options?: {
    path?: string;
    code?: string;
    moveTo?: Readonly<Record<string, string>>;
}): Record<string, unknown>;
