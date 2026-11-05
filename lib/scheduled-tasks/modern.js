import { taskInvolvesSession, taskSessionId, taskNextRunAt, hostFrequencyKind, ruleFields } from './record-native.js';
const object = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
const kinds = ['after', 'at', 'every', 'daily', 'weekly', 'cron', 'rrule'];
export function modernSchedule(service) {
    return typeof service?.edit === 'function' && typeof service?.view === 'function';
}
export function modernItems(value) {
    if (!Array.isArray(value))
        throw Error('Invalid native Schedule catalog');
    return value.map(item => {
        if (!object(item) || !['id', 'title', 'prompt', 'scheduledAt'].every(key => typeof item[key] === 'string')
            || !kinds.includes(item.kind) || !['active', 'paused', 'ended'].includes(item.status)
            || !object(item.target) || !['session', 'new_once', 'new'].includes(item.target.kind)
            || item.target.kind !== 'new' && typeof item.target.sessionId !== 'string'
            || !Array.isArray(item.involvedSessionIds) || !item.involvedSessionIds.every((id) => typeof id === 'string')
            || item.kind === 'rrule' && typeof item.rrule !== 'string'
            || item.updatedAt !== undefined && typeof item.updatedAt !== 'string')
            throw Error('Invalid native Schedule entry');
        const result = { protocolVersion: 2 };
        for (const key of ['id', 'kind', 'title', 'prompt', 'scheduledAt', 'afterSeconds', 'everySeconds', 'time', 'timeZone',
            'weekdays', 'expression', 'rrule', 'status', 'target', 'involvedSessionIds', 'createdAt', 'updatedAt', 'lastDelivery',
            'executionActive', 'deliveryFloorEndsAt'])
            if (Object.hasOwn(item, key))
                result[key] = item[key];
        // Only a real existing-session destination has the released phone identity.
        if (item.target.kind === 'session')
            result.sessionId = item.target.sessionId;
        result.linkedSessionId = taskSessionId(item);
        result.nextRunAt = taskNextRunAt(item);
        if (item.kind === 'rrule') {
            const kind = hostFrequencyKind(item), fields = ruleFields(item.rrule), anchor = /^DTSTART(?:;TZID=([^:]+))?:\d{8}T(\d{2})(\d{2})(\d{2})Z?$/m.exec(item.rrule);
            const count = fields.get('INTERVAL') || '1', clock = `${String(fields.get('BYHOUR') ?? anchor?.[2]).padStart(2, '0')}:${String(fields.get('BYMINUTE') ?? anchor?.[3]).padStart(2, '0')}`;
            const days = { MO: '周一', TU: '周二', WE: '周三', TH: '周四', FR: '周五', SA: '周六', SU: '周日' };
            result.nativeRuleText = kind === 'once' ? '仅一次' : kind === 'daily' ? `${count === '1' ? '每天' : `每 ${count} 天`} ${clock}`
                : kind === 'hourly' ? `每 ${count} 小时` : kind === 'minutely' ? `每 ${count} 分钟`
                    : kind === 'weekly' ? `${count === '1' ? '每周' : `每 ${count} 周`} ${(fields.get('BYDAY') || '').split(',').map((d) => days[d]).join('、')} ${clock}`
                        : kind === 'monthly' ? `每 ${count} 月 ${fields.get('BYMONTHDAY')?.split(',')[0]} 日 ${clock}` : '自定义周期';
            result.nativeTimeZone = anchor?.[1] || 'UTC';
        }
        return result;
    });
}
export function legacyScheduleItem(item) {
    if (item.target.kind !== 'session' || item.kind === 'rrule' || item.status === 'paused')
        return;
    const { protocolVersion: _v, target: _t, involvedSessionIds: _i, createdAt: _c, linkedSessionId: _l, nextRunAt: _n, nativeRuleText: _r, nativeTimeZone: _z, executionActive: _e, deliveryFloorEndsAt: _f, ...legacy } = item;
    return { ...legacy, status: item.status === 'ended' ? 'inactive' : 'active' };
}
export function scheduleRelated(item, sessionId) {
    // Match native UI taskInvolvesSession, independently of execution targets.
    return item.target ? taskInvolvesSession(item, sessionId) : item.sessionId === sessionId;
}
export function scheduleTiming(input, modernClient) {
    const selectors = { after: 'after_seconds', at: 'at', every: 'every_seconds',
        daily: 'daily', weekly: 'weekly', cron: 'cron', rrule: 'rrule' };
    const supplied = Object.entries(selectors).filter(([, key]) => Object.hasOwn(input, key));
    if (supplied.length !== 1)
        throw Object.assign(Error('请选择一种定时方式。'), { code: 'invalid_selector' });
    const [kind, key] = supplied[0];
    if (input.kind !== undefined && input.kind !== kind || kind === 'rrule' && !modernClient
        || Object.keys(input).some(key => !['kind', 'title', 'prompt', ...Object.values(selectors)].includes(key))) {
        throw Object.assign(Error('任务时间规则无效。'), { code: 'invalid_rule' });
    }
    return { kind, [key]: input[key] };
}
