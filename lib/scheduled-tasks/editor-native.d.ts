declare function oc(t: any, e?: boolean): any;
declare function ar(t: any, e?: boolean): any;
declare function Wd(): {
    title: string;
    prompt: string;
    target: string;
    sessionId: string;
    cwd: string;
    frequency: string;
    interval: string;
    start: string;
    timeZone: string;
    rrule: string;
    weekdays: number[];
    monthDay: number;
    dailyTime: string;
};
declare function ac(t: any): {
    title: any;
    prompt: any;
    target: any;
    sessionId: any;
    cwd: any;
    frequency: string;
    rrule: any;
    timeZone: any;
    interval: string;
    start: string;
    weekdays: number[];
    monthDay: number;
    dailyTime: string;
} | {
    title: any;
    prompt: any;
    target: any;
    sessionId: any;
    cwd: any;
    frequency: string;
    dailyTime: any;
    start: string;
    timeZone: any;
    retainedTiming: {
        kind: string;
        at: any;
        every_seconds?: undefined;
        daily?: undefined;
        weekly?: undefined;
    } | {
        kind: string;
        every_seconds: any;
        at?: undefined;
        daily?: undefined;
        weekly?: undefined;
    } | {
        kind: string;
        daily: {
            time: any;
            time_zone: any;
        };
        at?: undefined;
        every_seconds?: undefined;
        weekly?: undefined;
    } | {
        kind: string;
        weekly: {
            time: any;
            time_zone: any;
            weekdays: any;
        };
        at?: undefined;
        every_seconds?: undefined;
        daily?: undefined;
    } | undefined;
    monthDay: number;
    weekdays: number[];
    interval: string;
    rrule: string;
} | {
    title: any;
    prompt: any;
    target: any;
    sessionId: any;
    cwd: any;
    frequency: string;
    start: string;
    weekdays: any;
    timeZone: any;
    retainedTiming: {
        kind: string;
        at: any;
        every_seconds?: undefined;
        daily?: undefined;
        weekly?: undefined;
    } | {
        kind: string;
        every_seconds: any;
        at?: undefined;
        daily?: undefined;
        weekly?: undefined;
    } | {
        kind: string;
        daily: {
            time: any;
            time_zone: any;
        };
        at?: undefined;
        every_seconds?: undefined;
        weekly?: undefined;
    } | {
        kind: string;
        weekly: {
            time: any;
            time_zone: any;
            weekdays: any;
        };
        at?: undefined;
        every_seconds?: undefined;
        daily?: undefined;
    } | undefined;
    dailyTime: string;
    monthDay: number;
    interval: string;
    rrule: string;
} | {
    title: any;
    prompt: any;
    target: any;
    sessionId: any;
    cwd: any;
    frequency: string;
    interval: {};
    start: string;
    timeZone: string;
    rrule: any;
    weekdays: any;
    monthDay: number;
    dailyTime: string;
};
declare function qd(t: any, e: any): "incomplete" | "rule.invalidTitle" | "rule.invalidInterval" | "rule.requiredWeekday" | "rule.invalidMonthDay" | "rule.invalidTime" | "rule.invalidZone" | "rule.tooComplex" | "rule.invalid" | undefined;
declare function Hd(t: any, e: any, n?: boolean): {
    target?: {
        kind: string;
        sessionId: any;
        create?: undefined;
    } | {
        kind: any;
        create: {
            agentPreset?: any;
            cwd?: any;
        };
        sessionId?: undefined;
    } | undefined;
    timing?: any;
    prompt?: any;
    title?: any;
};
declare function sc(t: any, e: any): {
    kind: string;
    sessionId: any;
    create?: undefined;
} | {
    kind: any;
    create: {
        agentPreset?: any;
        cwd?: any;
    };
    sessionId?: undefined;
};
export { sc as draftTarget, Wd as newTaskDraft, oc as rruleFromDraft, ac as taskDraft, qd as taskDraftIssue, Hd as taskDraftPatch, ar as timingFromDraft };
