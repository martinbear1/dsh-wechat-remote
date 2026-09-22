export interface GateState {
    publicIdentityNodeId?: string;
    token: string;
}
export interface GateStateLoadResult {
    readonly state: GateState;
    /** False means the LAN door must stay closed; the state is process-local only. */
    readonly persistent: boolean;
    readonly warning?: string;
    readonly recoveredFrom?: string;
}
/**
 * Load the private LAN credential without treating every filesystem failure as
 * a first run. A malformed file is preserved under a unique .corrupt-* name;
 * unreadable files remain untouched and make only the LAN door unavailable.
 */
export declare function loadGateState(file: string): GateStateLoadResult;
export declare function saveGateState(file: string, state: GateState): void;
