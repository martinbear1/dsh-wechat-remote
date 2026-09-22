type Row = Record<string, any>;
/** Read-only mobile presentation; original native records remain intact.
 * Resources, turn usage and signed details are derived from the original. */
export declare function toolRecordPresentation<T extends Row>(entry: T): T;
export {};
