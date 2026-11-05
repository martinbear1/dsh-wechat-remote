/** Presentation and request translation for the public Host-wide Schedule API.
 * Evaluation, persistence, delivery and conflict checks remain native. */
type Row = Record<string, any>;
export declare function modernSchedule(service: any): boolean;
export declare function modernItems(value: unknown): Row[];
export declare function legacyScheduleItem(item: Row): Row | undefined;
export declare function scheduleRelated(item: Row, sessionId: string): boolean;
export declare function scheduleTiming(input: Row, modernClient: boolean): Row;
export {};
