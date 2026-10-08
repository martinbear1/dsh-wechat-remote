import type { NativeAutomationAdapter } from './automation-types.js';
interface Host {
    get(name: string): any;
    on(name: string, listener: (...args: any[]) => any, options?: unknown): () => void;
}
/** Install synchronously with the service, before any async ledger load. This
 * is a producer-specific replay gate, NOT a permission gate for all native
 * agents. Recognized plugin work needs an exact process-local lease even when
 * the optional ledger fails. Missing history alone cannot disable unrelated
 * native tools/turns; admission of NEW automation still requires inspect(). */
export declare function installNativeAutomationGate(host: Host): () => void;
export declare const AUTOMATION_TOOLS: readonly ["human_automation_submission", "human_automation_image", "human_automation_save"];
export declare function createNativeAutomationAdapter(host: Host, access?: {
    authorize(): Promise<void>;
    current(): void;
}): NativeAutomationAdapter;
export {};
