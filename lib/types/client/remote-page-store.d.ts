/** One memory-only view model per connected host, shared by every entry. */
import { type GateRuntimeInfo, type HarnessRemoteHostDescription, type CallPairingManagement } from './pairing-client.js';
import { WebUpdateStore } from './web-update-store.js';
import { NativeUpdateStore } from './native-update-store.js';
import { type ConnectionDiagnosticReport, type SafePairingAttempt } from '../connection-diagnostic-contract.js';
export interface PairCode {
    qrDataUrl: string;
    mode: 'secure-lan-route' | 'public-relay';
    expiresAt: number;
    lastPairingAttempt?: SafePairingAttempt;
}
export interface GateStatus {
    gate?: GateRuntimeInfo;
    plugin?: {
        runningVersion: string;
        installedVersion: string;
    };
    companionUpdate?: {
        state: string;
        message: string;
        offerId?: string;
        target?: {
            scope: 'desktop' | 'web';
            fromVersion: string;
            version: string;
        };
        versions?: {
            current: 'desktop' | 'web';
            running: string;
            installed: string | null;
            peer: 'desktop' | 'web';
            peerInstalled: string | null;
        };
    };
    lan: {
        ip: string;
        port: number;
    };
    publicRelay: {
        enabled: boolean;
        state: 'disabled' | 'enrolling' | 'connecting' | 'online' | 'offline';
        remoteAccess?: {
            status: 'active' | 'expired' | 'suspended' | 'not_entitled';
            validUntil?: number | null;
        } | null;
    };
    agent?: {
        agentName?: string;
        hostName?: string;
    };
    pairing?: {
        qrKind: 'pairing' | 'recovery' | 'none';
        lastPairingAttempt?: SafePairingAttempt;
    };
}
export interface PageSnapshot {
    loadState: 'loading' | 'ready' | 'error';
    qrState: 'idle' | 'loading' | 'ready' | 'expired' | 'error';
    status: GateStatus | null;
    host: HarnessRemoteHostDescription | null;
    runtime: GateRuntimeInfo | null;
    localOrigin: string | null;
    qr: PairCode | null;
    error: string | null;
    decisionError: string | null;
    deciding: boolean;
    diagnosticState: 'idle' | 'running' | 'ready' | 'cancelled' | 'error' | 'unsupported';
    diagnosticReport: ConnectionDiagnosticReport | null;
}
export declare class RemotePageStore {
    private describeHost;
    private callManagement;
    updates?: WebUpdateStore;
    nativeUpdates?: NativeUpdateStore;
    private value;
    private listeners;
    private timer?;
    private reading?;
    private pairing?;
    private diagnostic?;
    private disposed;
    private identity;
    private generation;
    constructor(describeHost: () => Promise<HarnessRemoteHostDescription>, callManagement: CallPairingManagement);
    getSnapshot: () => PageSnapshot;
    subscribe: (listener: () => void) => (() => void);
    private patch;
    private client;
    refresh: () => Promise<void>;
    generateQr: () => Promise<void>;
    diagnose: () => Promise<void>;
    cancelDiagnostic: (clear?: boolean) => void;
    reset: () => void;
    decide: (action: "approve" | "later") => Promise<void>;
    dispose: () => void;
}
export declare function pageStore(describe: () => Promise<HarnessRemoteHostDescription>, call: CallPairingManagement): RemotePageStore;
