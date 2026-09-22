type Row = Record<string, any>;
export interface DetailPart {
    readonly kind: 'text' | 'code' | 'diff-before' | 'diff-after' | 'image' | 'notice';
    readonly label: string;
    readonly text: string;
    readonly path?: string;
    readonly language?: string;
    readonly attachment?: Row;
}
export interface DetailDocument {
    readonly parts: readonly DetailPart[];
}
/** Uniform on-demand source view. No tool-name renderer dispatch. The optional
 * call argument remains accepted by the existing signed-reference API; central
 * read/diff/web card derivation belongs to the mini's inline presenter only. */
export declare function historyDetailDocument(entry: Row, _call?: Row): DetailDocument;
/** Explicit partial presentation. Do not recursively clip arbitrary objects:
 * doing so corrupts call IDs, URLs, attachment references and projection proofs.
 * If identity/proofs alone exceed the page limit the caller rejects the page. */
export declare function historyRecordPreview(entry: Row): Row;
export {};
