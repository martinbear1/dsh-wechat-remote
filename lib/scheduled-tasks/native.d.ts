type Row = Record<string, any>;
export interface ScheduleHost {
    get(name: string): any;
}
export declare class ScheduleAdapterError extends Error {
    readonly code: string;
    constructor(code: string, message: string);
}
/** Only queries live core services. Turning off the official bundle immediately
 * makes future calls unavailable, without deleting its tasks or keeping a
 * stale service reference. Reads never activate Agents or read Session logs. */
export declare class NativeScheduledTasks {
    private readonly host;
    private closed;
    constructor(host: ScheduleHost);
    close(): void;
    private current;
    status(): Row;
    private core;
    private same;
    private catalog;
    control(action: string, input: unknown, signal: AbortSignal): Promise<unknown>;
}
export declare function scheduledError(error: unknown): {
    code: string;
    message: string;
};
export {};
