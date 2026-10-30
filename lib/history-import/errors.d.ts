export declare function importError(error: unknown): {
    code: string;
    message: string;
};
/** Only call after a positively identified rejection before native creation.
 * Never convert an ambiguous write into a safe-to-retry failure. */
export declare function preflightMessage(error: unknown): string;
