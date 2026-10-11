import type { HistoryFragment, HistoryMessage } from './source.js';
export interface HistorySearchSource {
    url: string;
    title?: string;
    snippet?: string;
    publishedAt?: number;
}
/** No array-position guesses: export ZIPs only have URL/title, not citation IDs. */
export declare function historySearchSources(part: HistoryFragment): HistorySearchSource[];
export declare function historicalSourceText(part: HistoryFragment): string | undefined;
/** Display-only conversion; original fragment content/data remain unchanged in
 * the archival event. Official mapping: [reference:n] -> references[n] -> same
 * message's (id,type); TOOL_SEARCH denotes a group, TOOL_OPEN a single result. */
export declare function renderHistoryResponse(message: HistoryMessage, part: HistoryFragment): string;
