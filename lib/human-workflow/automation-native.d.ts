import type { NativeAutomationAdapter } from './automation-types.js';
interface Host {
    get(name: string): any;
    on(name: string, listener: (...args: any[]) => any, options?: unknown): () => void;
}
/** Install synchronously with the service, before any async ledger load. Cold
 * inbox replay is denied without an exact process-local execution lease. The
 * gate intentionally remains even when the optional automation ledger fails. */
export declare function installNativeAutomationGate(host: Host): () => void;
export declare const AUTOMATION_TOOLS: readonly ["human_automation_submission", "human_automation_image", "human_automation_save"];
export declare function createNativeAutomationAdapter(host: Host): NativeAutomationAdapter;
export {};
