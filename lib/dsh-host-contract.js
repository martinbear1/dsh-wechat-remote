/** Host-only contract differences. No network probing or per-request retries. */
import { hostRuntimeVersion } from './dsh-host-context.js';
const contracts = new WeakMap();
/** Inspect only the RUNNING CLI, never another global/npm cache install. */
export function runningDshVersion(entry = process.argv[1], ctx) {
    return hostRuntimeVersion(ctx, entry);
}
/** No carrier-arity capability exists. Follow the official 0.1.7-alpha.1
 * boundary centrally, not Function.length or trial calls. Retire the legacy
 * branch once pre-0.1.7 hosts leave the support matrix. */
export function usesDuplexEvents(version) {
    if (!version)
        return false; // Pre-packaged/source hosts use the legacy carrier.
    const match = /^(\d+)\.(\d+)\.(\d+)(?:-[\w.-]+)?(?:\+[\w.-]+)?$/.exec(version);
    if (!match)
        throw new Error('无法识别当前 DSH 事件协议版本');
    const [, major, minor, patch] = match.map(Number);
    return major > 0 || minor > 1 || minor === 1 && patch >= 7;
}
export function openHostEvents(gateway, endpoint, payload, signal, ctx) {
    let contract = contracts.get(gateway);
    if (!contract) {
        contract = { duplex: usesDuplexEvents(hostRuntimeVersion(ctx)) };
        contracts.set(gateway, contract);
    }
    signal.throwIfAborted();
    // Same in-process operator identity as before. No new network authority,
    // buffered uplink, background task or duplicate subscription.
    const empty = { async *[Symbol.asyncIterator]() { } };
    return contract.duplex
        ? gateway.wireStream.open(endpoint, payload, empty, undefined, signal)
        : gateway.wireStream.open(endpoint, payload, signal);
}
export function workspaceReadArguments(ctx, args) {
    const registry = ctx.get('typert');
    const descriptor = registry?.local?.get('workspaceFiles/readBytes');
    const names = descriptor?.parameters?.map((parameter) => parameter.wire);
    if (names?.includes('options') && !names.includes('range')) {
        const { range, ...rest } = args;
        return { ...rest, options: { range } };
    }
    if (names?.includes('range') && !names.includes('options'))
        return args;
    if (descriptor || registry?.local?.hasSeen?.('workspaceFiles/readBytes'))
        throw new Error('DSH 文件接口暂不可用，请稍后重试');
    // Old SRC mode has no strict descriptors; use the running host contract.
    if (usesDuplexEvents(hostRuntimeVersion(ctx))) {
        const { range, ...rest } = args;
        return { ...rest, options: { range } };
    }
    return args;
}
export function nativeFileBytes(value) {
    if (value instanceof Uint8Array)
        return Buffer.from(value);
    if (typeof value === 'string')
        return Buffer.from(value, 'base64');
    throw new Error('DSH 返回了无效的文件字节');
}
/** DSH 0.1.7 moved the browser child catalog to parent projections. Keep the
 * shipped phone vocabulary here, without resurrecting a removed Remote method
 * or inspecting native log files. Mutations still use native admission checks.
 * Remove this projection when the phone contract adopts parent projections. */
export function projectedSubagentCatalog(parent, projection, rows) {
    const entries = projection?.values?.subagentCatalog;
    if (!Array.isArray(entries) || !Array.isArray(rows))
        throw new Error('DSH 子代理目录暂不可读取');
    const byId = new Map(rows.map(row => [row.sessionId, row]));
    const parents = new Set(rows.filter(row => row.origin === 'subagent').map(row => row.parentSessionId));
    const ids = new Set();
    return { parentAvailable: byId.get(parent)?.agentAvailable === true, entries: entries.map((entry) => {
            if (typeof entry.id !== 'string' || !entry.id || ids.has(entry.id))
                throw new Error('DSH 子代理目录不完整');
            ids.add(entry.id);
            if (entry.mode !== 'one-shot' && entry.mode !== 'continuable')
                return { id: entry.id, kind: 'diagnostic', reason: 'unsupported' };
            const row = byId.get(entry.id);
            if (row && (row.origin !== 'subagent' || row.parentSessionId !== parent))
                throw new Error('DSH 子代理归属不一致');
            return { id: entry.id, kind: 'child', mode: entry.mode,
                ...(typeof entry.label === 'string' ? { label: entry.label } : {}),
                activity: row?.running === true ? 'running' : 'inactive', hasChildren: parents.has(entry.id) };
        }) };
}
export async function invokeHostRemote(ctx, gateway, request) {
    if (request.namespace === 'settings' && request.method === 'update'
        && request.args?.ns === 'agent-presets' && request.args.patch
        && Object.hasOwn(request.args.patch, 'default')) {
        // The shipped phone names the old form. Discover the live native form
        // before ONE mutation: version guesses and write-then-retry are unsafe.
        request.signal?.throwIfAborted();
        const description = await gateway.invoke({ namespace: 'settings', method: 'describe', args: {}, signal: request.signal });
        request.signal?.throwIfAborted();
        const rows = description?.namespaces;
        if (!Array.isArray(rows))
            throw new Error('DSH 预设配置暂不可读取，未修改默认预设');
        const old = rows.filter((row) => row.ns === 'agent-presets');
        const modern = rows.filter((row) => row.ns === 'agent-preset-registry');
        if (old.length === 1 && modern.length === 0)
            return gateway.invoke(request);
        if (modern.length !== 1 || old.length !== 0)
            throw new Error('DSH 预设配置入口不唯一或未就绪，未修改默认预设');
        // Map only the known phone operation, never forward arbitrary old fields
        // into a different form or reinterpret an old form's revision number.
        if (Object.keys(request.args.patch).length !== 1 || typeof request.args.patch.default !== 'string') {
            throw new Error('默认预设设置参数无效');
        }
        if (request.args.expectedRevision !== undefined)
            throw new Error('预设配置已迁移，请刷新后重试');
        const row = modern[0];
        if (!Number.isSafeInteger(row.revision))
            throw new Error('DSH 预设配置版本无效');
        return gateway.invoke({ ...request, args: { ns: row.ns,
                patch: { selectedDefault: request.args.patch.default }, expectedRevision: row.revision } });
    }
    if (request.namespace !== 'subagents' || request.method !== 'list')
        return gateway.invoke(request);
    const registry = ctx.get('typert')?.local;
    // A withdrawn descriptor is a host error, not permission to bypass it.
    if (registry?.get('subagents/list') || registry?.hasSeen?.('subagents/list') || !usesDuplexEvents(hostRuntimeVersion(ctx)))
        return gateway.invoke(request);
    const parent = request.args.parentSessionId;
    if (typeof parent !== 'string' || !parent || parent.length > 256)
        throw new Error('父会话标识无效');
    request.signal?.throwIfAborted();
    const [projection, listing] = await Promise.all([
        gateway.invoke({ namespace: 'session', method: 'projections', args: { request: { sessionId: parent } }, signal: request.signal }),
        gateway.invoke({ namespace: 'session', method: 'list', args: { _request: {} }, signal: request.signal }),
    ]);
    request.signal?.throwIfAborted();
    return projectedSubagentCatalog(parent, projection, listing?.items);
}
