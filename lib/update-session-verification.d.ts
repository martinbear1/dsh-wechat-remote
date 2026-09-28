/** Verify the current host service, not an old process's in-memory catalog.
 * DSH owns session visibility and format admission. In a shared home an older
 * Web process can retain a session that its cold loader no longer admits after
 * Desktop has produced a newer generation. Requiring equal lists incorrectly
 * rolls back a sound plugin install and cannot restore that native visibility.
 *
 * This does NOT establish data preservation: the transaction separately checks
 * the original session/attachment/identity hashes and pairing binding. Keep
 * those checks and the native idle/flush, identity, version and fence checks.
 * Never rewrite native files, interpret generation formats, or grant access to
 * a session the restarted host does not expose merely to reproduce a snapshot.
 */
export declare function verifySessionService(read: (method: string, payload?: Record<string, unknown>) => Promise<any>, previouslyReadable: readonly string[]): Promise<void>;
