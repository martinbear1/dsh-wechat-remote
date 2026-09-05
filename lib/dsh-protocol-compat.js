import { setTimeout as delay } from 'node:timers/promises';
const SINGLE_REQUEST_METHODS = new Set([
    'session.attachment',
    'session.cancel',
    'session.create',
    'session.fork',
    'session.openWorkspacePath',
    'session.rename',
    'session.search',
    'session.selectModel',
    'session.updateQueue',
    'workspace.archiveSession',
    'workspace.create',
    'workspace.delete',
    'workspace.insertBefore',
    'workspace.insertSessionBefore',
    'workspace.rename',
]);
function recordOf(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value)
        ? value
        : null;
}
function present(value, key) {
    return Object.hasOwn(value, key) ? { [key]: value[key] } : {};
}
function requestInvocation(method, payload) {
    const [namespace, remoteMethod] = method.split('.', 2);
    return {
        kind: 'invoke',
        namespace,
        method: remoteMethod,
        args: { request: payload },
    };
}
/**
 * Translate the stable mini-program RPC vocabulary into the post-0.1.2
 * Typert Remote vocabulary. This table deliberately lives on the Host: a
 * published mini program never needs a DSH-version switch or another review.
 */
export function planLegacyRpc(request) {
    const { method, payload } = request;
    if (method.includes('/')) {
        const split = method.indexOf('/');
        const namespace = method.slice(0, split);
        const remoteMethod = method.slice(split + 1);
        if (!namespace || !remoteMethod || remoteMethod.includes('/')) {
            throw new Error(`unsupported Remote endpoint: ${method}`);
        }
        const supplied = recordOf(payload.args);
        return { kind: 'invoke', namespace, method: remoteMethod, args: supplied ?? {} };
    }
    if (method === 'host.describe')
        return { kind: 'host-describe' };
    if (method === 'workspace.list')
        return { kind: 'workspace-list' };
    if (method === 'session.history') {
        return { kind: 'session-history', request: payload };
    }
    if (method === 'session.list') {
        return {
            kind: 'invoke',
            namespace: 'session',
            method: 'list',
            args: { _request: payload },
        };
    }
    if (method === 'session.models') {
        return { kind: 'session-models', request: payload };
    }
    if (method === 'session.prompt') {
        // Released clients carry the permission picker through session.prompt.
        // DSH's native UI uses commands.execute: sending this to the model neither
        // changes permissions nor provides an authoritative success receipt.
        const parts = Array.isArray(payload.content) ? payload.content : [];
        const first = recordOf(parts[0]);
        const text = first?.type === 'text' && typeof first.text === 'string' ? first.text.trim() : '';
        if (/^\/permission(?:\s|$)/.test(text)) {
            const match = /^\/permission(?:[ \t]+([a-z][a-z0-9-]*))?[ \t]*$/.exec(text);
            if (!match || parts.length !== 1 || typeof payload.sessionId !== 'string' || !payload.sessionId.trim()) {
                throw Object.assign(new Error('权限命令格式无效；未发送聊天消息，也未更改权限'), { code: 'adapter/invalid-permission-command' });
            }
            return { kind: 'permission-command', sessionId: payload.sessionId, line: text,
                ...(match[1] ? { preset: match[1] } : {}) };
        }
        return requestInvocation(method, {
            ...payload,
            requestId: typeof payload.requestId === 'string' && payload.requestId
                ? payload.requestId
                : request.rpcId,
        });
    }
    if (SINGLE_REQUEST_METHODS.has(method))
        return requestInvocation(method, payload);
    if (method === 'host.openPath') {
        return {
            kind: 'invoke',
            namespace: 'session',
            method: 'openWorkspacePath',
            args: { request: payload },
        };
    }
    if (method === 'agentPreset.list') {
        return { kind: 'invoke', namespace: 'agentPresets', method: 'list', args: {} };
    }
    if (method === 'agentPreset.select') {
        return {
            kind: 'invoke',
            namespace: 'agentPresets',
            method: 'select',
            args: { agentId: payload.sessionId, agentPreset: payload.agentPreset },
            transform: value => ({ agentPreset: value }),
        };
    }
    if (method === 'settings.update') {
        return {
            kind: 'invoke',
            namespace: 'settings',
            method: 'update',
            args: {
                ns: payload.ns,
                patch: payload.patch,
                ...present(payload, 'expectedRevision'),
            },
        };
    }
    if (method === 'llm.providers') {
        return {
            kind: 'invoke',
            namespace: 'llm',
            method: 'listConfigurableProviders',
            args: {},
            transform: value => ({ providers: Array.isArray(value) ? value : [] }),
        };
    }
    if (method === 'llm.models') {
        return {
            kind: 'invoke',
            namespace: 'session',
            method: 'modelCatalog',
            args: {},
        };
    }
    if (method === 'subagent.list') {
        return {
            kind: 'invoke',
            namespace: 'subagents',
            method: 'list',
            args: { parentSessionId: payload.parentSessionId },
        };
    }
    if (method === 'subagent.interrupt') {
        return {
            kind: 'invoke',
            namespace: 'subagents',
            method: 'interruptByParent',
            args: {
                childSessionId: payload.childSessionId,
                parentSessionId: payload.parentSessionId,
                mode: payload.mode,
            },
        };
    }
    if (method.startsWith('goal.')) {
        const remoteMethod = method.slice('goal.'.length);
        const args = { agentId: payload.sessionId };
        const mutation = {
            ...present(payload, 'objective'),
            ...present(payload, 'maxGoalRounds'),
        };
        if (remoteMethod === 'create')
            args.request = mutation;
        else {
            args.ref = payload.ref;
            if (remoteMethod === 'edit')
                args.request = mutation;
        }
        return {
            kind: 'invoke', namespace: 'goals', method: remoteMethod, args,
            transform: value => {
                if (remoteMethod === 'create')
                    return value;
                if (remoteMethod === 'clear')
                    return { cleared: true };
                const goal = recordOf(value);
                return { ref: { id: goal?.id, revision: goal?.revision } };
            },
        };
    }
    throw new Error(`unsupported legacy DSH RPC: ${method}`);
}
/** Feature detection keeps the same package loadable on pre-Gateway DSH. */
export function resolveTypertGateway(ctx) {
    const candidate = ctx.get('typertGateway');
    return candidate
        && typeof candidate.invoke === 'function'
        && typeof candidate.stream === 'function'
        ? candidate
        : null;
}
function errorResult(error) {
    const value = recordOf(error);
    const code = typeof value?.code === 'string' && value.code
        ? value.code
        : 'adapter/internal';
    const message = error instanceof Error && error.message
        ? error.message
        : typeof value?.message === 'string' && value.message
            ? value.message
            : String(error);
    return {
        ok: false,
        error: {
            code,
            message,
            ...value && Object.hasOwn(value, 'details') ? { details: value.details } : {},
        },
    };
}
function historyEvents(records) {
    if (!Array.isArray(records))
        return [];
    return records.flatMap((record) => {
        const row = recordOf(record);
        const event = recordOf(row?.event);
        if (row?.type === 'event' && event)
            return [{ event }];
        if (row?.type !== 'chunks' || !event)
            return [];
        return unpackChunkRow(event).map(item => ({ event: item }));
    });
}
/** Expand 0.1.2 packed history rows back into the stable event vocabulary. */
export function unpackChunkRow(event) {
    const data = recordOf(event.data);
    if (!data || !Number.isSafeInteger(event.seq) || !Number.isSafeInteger(event.time))
        return [];
    const type = event.type;
    const members = type === 'chunkrow/tool-call-chunks' ? data.args : data.texts;
    if (!Array.isArray(members) || members.length === 0
        || members.some(item => typeof item !== 'string'))
        return [];
    const gaps = Array.isArray(data.dt) ? data.dt : [];
    if (gaps.length !== members.length - 1
        || gaps.some(gap => !Number.isSafeInteger(gap)))
        return [];
    let time = Number(event.time);
    return members.map((member, index) => {
        if (index > 0)
            time += Number(gaps[index - 1]);
        let chunk;
        if (type === 'chunkrow/text-chunks') {
            chunk = { type: 'text-delta', index: data.index, text: member };
        }
        else if (type === 'chunkrow/reasoning-chunks') {
            chunk = { type: 'reasoning-delta', index: data.index, text: member };
        }
        else if (type === 'chunkrow/tool-call-chunks') {
            chunk = {
                type: 'tool-call-delta',
                index: data.index,
                id: data.id,
                ...present(data, 'name'),
                argumentsDelta: member,
            };
        }
        else
            return {};
        return {
            type: 'assistant/chunk',
            seq: Number(event.seq) + index,
            time,
            data: { turn: data.turn, step: data.step, chunk },
        };
    }).filter(item => typeof item.type === 'string');
}
async function firstStreamFrame(gateway, namespace, method, args, signal) {
    const iterable = await gateway.stream({ namespace, method, args, signal });
    const iterator = iterable[Symbol.asyncIterator]();
    try {
        const first = await iterator.next();
        if (first.done)
            throw new Error(`${namespace}/${method} ended before its baseline`);
        return first.value;
    }
    finally {
        await iterator.return?.();
    }
}
async function historyValue(gateway, request, signal) {
    const sessionId = typeof request.sessionId === 'string' ? request.sessionId : '';
    if (!sessionId)
        throw new Error('session.history requires sessionId');
    const maxMessages = Number.isSafeInteger(request.maxMessages)
        ? Math.max(1, Math.min(30, Number(request.maxMessages)))
        : 8;
    const address = { kind: 'session', sessionId };
    const first = recordOf(await firstStreamFrame(gateway, 'session', 'follow', { request: { address, maxMessages } }, signal));
    if (first?.type !== 'snapshot' || !Number.isSafeInteger(first.cursor)) {
        throw new Error('session/follow returned an invalid opening snapshot');
    }
    if (Number.isSafeInteger(request.beforeSeq)) {
        const page = recordOf(await gateway.invoke({
            namespace: 'session',
            method: 'page',
            args: {
                request: {
                    address,
                    throughSeq: first.cursor,
                    beforeSeq: request.beforeSeq,
                    maxMessages,
                },
            },
            signal,
        })) ?? {};
        return {
            events: historyEvents(page.records),
            hasMore: page.hasMore === true,
        };
    }
    return {
        events: historyEvents(first.records),
        hasMore: first.hasMore === true,
        projections: first.projections,
        historyEndSeq: first.cursor,
    };
}
async function workspaceValue(gateway, signal) {
    const frame = recordOf(await firstStreamFrame(gateway, 'workspace', 'follow', {}, signal));
    if (frame?.type !== 'baseline' || !recordOf(frame.value)) {
        throw new Error('workspace/follow returned an invalid baseline');
    }
    return frame.value;
}
async function permissionCommandValue(gateway, plan, signal, readHistory, flushPermission) {
    signal.throwIfAborted();
    const command = recordOf(await gateway.invoke({
        namespace: 'commands', method: 'execute',
        args: { agentId: plan.sessionId, line: plan.line, images: [] }, signal,
    }));
    const result = recordOf(command?.result);
    if (result?.kind !== 'success') {
        throw Object.assign(new Error(typeof result?.text === 'string' && result.text
            ? result.text : 'DSH 未成功执行权限命令；请检查主机权限预设服务'), { code: 'adapter/command-failed' });
    }
    // Native commands append eagerly; a success receipt alone need not mean the
    // buffered log reached disk (notably when Windows closes the process).
    await flushPermission?.(plan.sessionId);
    signal.throwIfAborted();
    // Do not trust a command acknowledgement or optimistically echo the picker.
    // Read the same persisted projection used when reopening the conversation.
    const history = recordOf(await readHistory(plan.sessionId, signal));
    const permissions = recordOf(recordOf(recordOf(history?.projections)?.values)?.permissions);
    const current = permissions?.currentValue;
    if (typeof current !== 'string' || (plan.preset && current !== plan.preset)) {
        throw Object.assign(new Error('权限命令已执行，但未确认目标权限；请刷新会话核对当前权限'), {
            code: 'adapter/permission-not-applied',
        });
    }
    return { accepted: true, command: true, permission: current, commandId: command?.commandId };
}
/** The 0.1.1 Gateway has invoke but no stream; retain its native history API. */
export async function invokeLegacyPermissionRpc(gateway, request, signal, readHistory, flushPermission) {
    let result;
    try {
        const plan = planLegacyRpc(request);
        if (plan.kind !== 'permission-command')
            return null;
        result = { ok: true, value: await permissionCommandValue(gateway, plan, signal, readHistory, flushPermission) };
    }
    catch (error) {
        result = errorResult(error);
    }
    return { type: 'server-response', rpcId: request.rpcId, result };
}
async function sessionModelsValue(gateway, request, signal) {
    const sessionId = typeof request.sessionId === 'string' ? request.sessionId : '';
    if (!sessionId)
        throw new Error('session.models requires sessionId');
    const [rawCatalog, rawSnapshot] = await Promise.all([
        gateway.invoke({ namespace: 'session', method: 'modelCatalog', args: {}, signal }),
        firstStreamFrame(gateway, 'session', 'follow', {
            request: { address: { kind: 'session', sessionId }, maxMessages: 1 },
        }, signal),
    ]);
    const catalog = recordOf(rawCatalog);
    const snapshot = recordOf(rawSnapshot);
    const projections = recordOf(snapshot?.projections);
    const selection = recordOf(recordOf(projections?.values)?.modelSelection);
    if (!catalog || snapshot?.type !== 'snapshot' || !projections) {
        throw new Error('DSH returned an invalid model catalog or Session snapshot');
    }
    // modelCatalog is deployment-wide. Session-local pending intent wins over
    // the last consumed selection; only a never-configured Session uses default.
    const current = selection?.next ?? selection?.lastUsed ?? catalog.default;
    if (!recordOf(current))
        throw new Error('DSH returned no usable model selection');
    return { ...catalog, current };
}
/** Execute one stable request and restore the pre-0.1.2 HTTP envelope. */
export async function invokeLegacyRpc(gateway, request, options) {
    let result;
    try {
        const plan = planLegacyRpc(request);
        let value;
        if (plan.kind === 'host-describe')
            value = options.describeHost();
        else if (plan.kind === 'workspace-list')
            value = await workspaceValue(gateway, options.signal);
        else if (plan.kind === 'session-history')
            value = await historyValue(gateway, plan.request, options.signal);
        else if (plan.kind === 'session-models')
            value = await sessionModelsValue(gateway, plan.request, options.signal);
        else if (plan.kind === 'permission-command')
            value = await permissionCommandValue(gateway, plan, options.signal, (sessionId, signal) => historyValue(gateway, { sessionId, maxMessages: 1 }, signal), options.flushPermission);
        else {
            for (let attempt = 0;; attempt++) {
                try {
                    options.signal.throwIfAborted();
                    value = await gateway.invoke({
                        namespace: plan.namespace,
                        method: plan.method,
                        args: plan.args,
                        signal: options.signal,
                    });
                    break;
                }
                catch (error) {
                    // 0.1.2's Windows atomic mkdir can vanish between the two persistence
                    // directory reads. Retry only this recognizable read-only listing
                    // race, never a mutation or a general persistence failure.
                    const failure = recordOf(error);
                    if (request.method !== 'session.list' || attempt >= 2
                        || failure?.code !== 'SESSION_QUERY_PERSISTENCE_FAILED'
                        || typeof failure.message !== 'string'
                        || !/ENOENT.*scandir.*[\\/]\.dsh-mkdir-[^\\/]+$/.test(failure.message))
                        throw error;
                    await delay(25 * (attempt + 1), undefined, { signal: options.signal });
                }
            }
            if (plan.transform)
                value = plan.transform(value);
        }
        result = { ok: true, value };
    }
    catch (error) {
        result = errorResult(error);
    }
    return { type: 'server-response', rpcId: request.rpcId, result };
}
/** Reject carrier smuggling and malformed JSON before a Host call executes. */
export function parseLegacyClientRequest(pathMethod, value) {
    const body = recordOf(value);
    if (body?.type !== 'client-request'
        || typeof body.rpcId !== 'string' || body.rpcId.length === 0 || body.rpcId.length > 256
        || typeof body.method !== 'string' || body.method !== pathMethod
        || body.method.length > 160
        || !recordOf(body.payload)) {
        throw new Error('invalid DSH client-request envelope');
    }
    return body;
}
