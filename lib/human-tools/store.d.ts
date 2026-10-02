import type { HumanLedger, HumanStore } from './core.js';
/** Dedicated plugin-owned state, never credentials or a copy of native history. */
export declare class HumanFileStore implements HumanStore {
    private readonly file;
    constructor(file: string);
    load(): Promise<unknown>;
    save(ledger: HumanLedger): Promise<void>;
}
