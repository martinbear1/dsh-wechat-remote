/** The native shutdown/save contract, not a frozen list of DSH releases.
 * This probe is read-only. Actual idle checks, flush, backup, restart, health
 * and rollback remain mandatory inside the installation transaction.
 */
export interface NativeUpdateContext {
    get(name: string): unknown;
    root?: NativeUpdateContext;
    fiber?: {
        dispose?: unknown;
    };
}
export declare function assertNativeUpdateCapabilities(context: NativeUpdateContext): void;
