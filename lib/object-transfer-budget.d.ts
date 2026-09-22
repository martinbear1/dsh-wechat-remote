/** File-operation ceilings, not normal-path delays. Ordinary RPCs keep theirs. */
export declare const OBJECT_UPLOAD_BUDGET_MS = 180000;
export declare const OBJECT_DOWNLOAD_BUDGET_MS = 150000;
export declare const OBJECT_PREPARE_BUDGET_MS: number;
export declare function objectRpcBudget(method: string, payload?: Record<string, any>): number | undefined;
