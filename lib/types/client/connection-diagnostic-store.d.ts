/** Optional, memory-only diagnostics. No reference to the normal page store. */
import { type HarnessRemoteHostDescription, type CallPairingManagement } from './pairing-client.js';
import { type ConnectionDiagnosticReport } from '../connection-diagnostic-contract.js';
export interface DiagnosticSnapshot {
    diagnosticState: 'idle' | 'running' | 'ready' | 'cancelled' | 'error' | 'unsupported';
    diagnosticReport: ConnectionDiagnosticReport | null;
}
export declare class ConnectionDiagnosticStore {
    private describeHost;
    private callManagement;
    private value;
    private listeners;
    private active?;
    private disposed;
    constructor(describeHost: () => Promise<HarnessRemoteHostDescription>, callManagement: CallPairingManagement);
    getSnapshot: () => DiagnosticSnapshot;
    subscribe: (listener: () => void) => (() => void);
    private publish;
    diagnose: () => Promise<void>;
    cancel: (clear?: boolean) => void;
    reset: () => void;
    dispose: () => void;
}
