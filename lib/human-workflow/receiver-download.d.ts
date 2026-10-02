/** Only consumes a node-authenticated claim's one-object ticket. Models and
 * member forms cannot supply this input. No redirects or cross-object races. */
export declare function downloadSubmission(ticket: unknown, expectedBytes: number, signal: AbortSignal, fetcher?: typeof fetch, trustedOrigins?: readonly string[]): Promise<Uint8Array>;
