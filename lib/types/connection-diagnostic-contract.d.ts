/** Browser-safe, allowlisted diagnostic data. Never pass raw errors or URLs to UI. */
export type SafeFailureCode = 'dns' | 'connection-refused' | 'connection-reset' | 'network-unreachable' | 'timeout' | 'tls-validation' | 'proxy-auth-required' | 'request-rejected' | 'rate-limited' | 'server-error' | 'invalid-response' | 'cancelled' | 'unknown';
export interface SafeFailure {
    code: SafeFailureCode;
    systemCode?: string;
    httpStatus?: number;
}
export type DiagnosticCheckId = 'local-plugin' | 'relay-health' | 'agent-connection';
export type DiagnosticCheckStatus = 'pass' | 'fail' | 'not-tested' | 'cancelled';
export interface ConnectionDiagnosticCheck extends Partial<SafeFailure> {
    id: DiagnosticCheckId;
    status: DiagnosticCheckStatus;
    durationMs?: number;
}
export interface ConnectionDiagnosticContext {
    pluginVersion?: string;
    dshVersion?: string;
    platform?: string;
    profileKind?: 'desktop' | 'web' | 'unknown';
    relayEnabled?: boolean;
    relayState?: string;
}
export interface ConnectionDiagnosticReport {
    schema: 1;
    source: 'plugin';
    startedAt: string;
    pluginRunningVersion: string;
    dshVersion?: string;
    platform: string;
    profileKind: 'desktop' | 'web' | 'unknown';
    relayEnabled: boolean;
    relayState: 'disabled' | 'enrolling' | 'connecting' | 'online' | 'offline' | 'unknown';
    checks: ConnectionDiagnosticCheck[];
}
export declare const DIAGNOSTIC_CHECK_IDS: readonly DiagnosticCheckId[];
export declare const CONNECTION_SYSTEM_CODES: Readonly<Record<string, SafeFailureCode>>;
/** Also handles hostile getters supplied by unexpected transport/error objects. */
export declare function diagnosticField(value: unknown, key: string): unknown;
export declare function sanitizeConnectionFailure(value: unknown): SafeFailure;
export declare function sanitizeConnectionReport(value: unknown): ConnectionDiagnosticReport | null;
export declare function failureDescription(code: unknown): string;
export declare function failureAdvice(code: unknown): string;
export declare function diagnosticCheckLabel(id: unknown): string;
export declare function formatConnectionDiagnosticReport(value: unknown): string;
