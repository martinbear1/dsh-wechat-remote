export interface GatePortEnvironment {
    readonly WECHAT_GATE_PORT?: string;
    readonly WECHAT_GATE_LOCAL_PORT?: string;
}
export interface GatePorts {
    readonly profileScope: string;
    readonly publicPort: number;
    readonly localPort: number;
    readonly source: 'legacy-default' | 'profile-derived' | 'environment-override';
    readonly warnings: readonly string[];
}
export interface GateListenFailure {
    readonly code: string;
    readonly message: string;
}
/**
 * Select the two loopback/LAN gateway ports without probing or binding.
 *
 * The historic web/default profile remains exactly 3092/3093. Additional DSH
 * profiles get a stable even/odd pair in 32000..39999, derived from both their
 * profile scope and durable Agent instance id. This stays below Windows'
 * default dynamic/ephemeral range (normally beginning at 49152). Explicit
 * environment variables always win independently.
 */
export declare function deriveGatePorts(profileScope: string, agentInstanceId: string, environment?: GatePortEnvironment): GatePorts;
/** Stable, user-actionable diagnostics for a door-level listen failure. */
export declare function describeGateListenFailure(role: 'public' | 'local', bind: string, port: number, error: {
    readonly code?: unknown;
    readonly message?: unknown;
} | unknown): GateListenFailure;
