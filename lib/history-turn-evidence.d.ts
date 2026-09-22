import { turnDetails } from './turn-presentation.js';
type Row = Record<string, any>;
export interface HistoryTurnFacets {
    details: Row[];
    activity: Row[];
}
/** Opportunistic, bounded evidence for ranges the phone has already asked to
 * read. No hidden I/O, no persisted index, no completeness across a gap. Cache
 * eviction can omit optional disclosures, never fabricate a full turn. */
export declare class HistoryTurnEvidence {
    private readonly sessions;
    clear(): void;
    accept(sessionId: string, entries: readonly Row[], usageFold?: Parameters<typeof turnDetails>[1]): HistoryTurnFacets;
}
export {};
