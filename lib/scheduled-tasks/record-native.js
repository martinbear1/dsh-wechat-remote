// @ts-nocheck
// Pinned native task-record projections. See THIRD-PARTY-NOTICES/schedule-editor.
function c(t) { return t.deliveryFloorEndsAt !== void 0 && Date.parse(t.deliveryFloorEndsAt) > Date.parse(t.scheduledAt) ? t.deliveryFloorEndsAt : t.scheduledAt; }
function d(t) { return t.target.kind === "new" ? t.lastDelivery?.targetSessionId : t.target.sessionId; }
function a(t, n) { return t.involvedSessionIds.includes(n) || d(t) === n; }
function u(t) { let n = /^RRULE:(.+)$/m.exec(t)?.[1] ?? ""; return new Map(n.split(";").map(e => e.split("="))); }
function E(t) { let n = /^DTSTART(?:;TZID=[^:]+)?:\d{8}T\d{4}(\d{2})Z?$/m.exec(t.rrule); if (n === null)
    return "custom"; let e = u(t.rrule), r = e.get("FREQ"); if (e.get("COUNT") === "1" && e.size === 2 && r === "DAILY")
    return "once"; if (e.has("COUNT") || e.has("UNTIL") || e.has("BYSECOND"))
    return "custom"; let l = [...e.keys()], s = o => l.every(i => o.includes(i)); return r === "MINUTELY" && s(["FREQ", "INTERVAL"]) ? "minutely" : r === "HOURLY" && s(["FREQ", "INTERVAL"]) ? "hourly" : r === "DAILY" && n[1] === "00" && s(["FREQ", "INTERVAL", "BYHOUR", "BYMINUTE", "BYSETPOS"]) && (!e.has("BYHOUR") && !e.has("BYMINUTE") && !e.has("BYSETPOS") || /^\d{1,2}$/.test(e.get("BYHOUR") ?? "") && /^\d{1,2}$/.test(e.get("BYMINUTE") ?? "") && (!e.has("BYSETPOS") || e.get("BYSETPOS") === "1")) ? "daily" : r === "WEEKLY" && s(["FREQ", "INTERVAL", "BYDAY"]) && (e.get("BYDAY") ?? "").split(",").every(o => /^(MO|TU|WE|TH|FR|SA|SU)$/.test(o)) ? "weekly" : r === "MONTHLY" && s(["FREQ", "INTERVAL", "BYMONTHDAY", "BYSETPOS"]) && e.get("BYSETPOS") === "1" && /^\d{1,2},-1$/.test(e.get("BYMONTHDAY") ?? "") ? "monthly" : "custom"; }
export { E as hostFrequencyKind, u as ruleFields, a as taskInvolvesSession, c as taskNextRunAt, d as taskSessionId };
