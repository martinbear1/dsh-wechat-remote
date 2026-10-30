import { type PairingObservation } from './connection-diagnostic-contract.js';
/** A diagnostic fault must never escape into the operation it observes. */
export declare function observePairingDiagnostic<T>(observe: () => T): T | undefined;
export declare class PairingDiagnosticObserver {
    private attempt?;
    private observation?;
    begin(): object;
    issued(attempt: object | undefined): void;
    unavailable(attempt: object | undefined, reason: 'service-not-ready' | 'ticket-missing'): void;
    failed(attempt: object | undefined, error: unknown): void;
    snapshot(): PairingObservation | undefined;
    private finish;
}
