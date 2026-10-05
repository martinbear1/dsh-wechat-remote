import type { HumanReceiptRecovery } from './core.js';
import type { WorkflowTransport } from '../human-workflow/transport.js';
/** This is a reconciliation adapter, not an Agent tool or execution route.
 * The server authenticates the node and checks its saved source fingerprint.
 * Missing/pending/legacy sources grant nothing; no list or cached fact is used. */
export declare function actionReceiptRecovery(transport: WorkflowTransport, assertOrigin: (scope: string, generation: string, signal: AbortSignal) => Promise<void>): HumanReceiptRecovery;
