/** Read-only probes use the host's fetch/dispatcher, never enrollment or a business WebSocket. */
import { type SafeFailure, type ConnectionDiagnosticContext, type ConnectionDiagnosticReport } from './connection-diagnostic-contract.js';
export declare const CONNECTION_DIAGNOSTIC_TIMEOUT_MS = 8000;
export declare const CONNECTION_DIAGNOSTIC_MAX_BYTES = 16384;
export declare function connectionHttpFailure(status: number): SafeFailure;
/** A bounded walk of standard cause/AggregateError fields; raw strings never escape. */
export declare function classifyConnectionFailure(error: unknown): SafeFailure;
export interface ConnectionDiagnosticOptions {
    relayOrigin: string;
    fetch?: typeof fetch;
    signal?: AbortSignal;
    context: ConnectionDiagnosticContext;
}
export declare function runConnectionDiagnostics(options: ConnectionDiagnosticOptions): Promise<ConnectionDiagnosticReport>;
