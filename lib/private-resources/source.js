import { createAgentHttpProof } from '../agent-http-proof.js';
import { DEFAULT_TRUSTED_OBJECT_ORIGINS } from '../public-object-client.js';
import { ResourceError, RESOURCE_MAX_BYTES, validateResourceRelease } from './contract.js';
const fail = (code, message) => { throw new ResourceError(code, message); };
const invalid = () => fail('resources-invalid', '资源信息暂不可用，请刷新重试。');
function connectionKey(value) {
    return `${value.origin}\n${value.identity.nodeId}\n${value.identity.publicKeyPem}`;
}
function release(value) {
    const item = value;
    try {
        validateResourceRelease(item);
    }
    catch {
        invalid();
    }
    if (item.kind !== 'preset' || typeof item.name !== 'string' || !item.name.trim() || item.name.length > 120
        || typeof item.description !== 'string' || item.description.length > 2000
        || item.schemaVersion !== undefined && ![1, 2, 3].includes(item.schemaVersion)
        || item.access !== undefined && !['public', 'private'].includes(item.access))
        invalid();
    return { resourceId: item.resourceId, version: item.version, sha256: item.sha256, bytes: item.bytes,
        kind: 'preset', name: item.name, description: item.description,
        ...(item.schemaVersion !== undefined ? { schemaVersion: item.schemaVersion } : {}),
        ...(item.access !== undefined ? { access: item.access } : {}) };
}
function scope(value, nodeId) {
    if (value?.schemaVersion !== 1 || value.nodeId !== nodeId || typeof value.accountInstance !== 'string'
        || !value.accountInstance || value.accountInstance.length > 256)
        invalid();
    return { accountInstance: value.accountInstance };
}
async function readBytes(response, maximum) {
    const advertised = response.headers.get('content-length');
    if (advertised !== null && (!/^\d+$/.test(advertised) || Number(advertised) > maximum)) {
        await response.body?.cancel();
        invalid();
    }
    if (!response.body)
        return new Uint8Array();
    const reader = response.body.getReader(), chunks = [];
    let length = 0;
    try {
        for (;;) {
            const part = await reader.read();
            if (part.done)
                break;
            length += part.value.byteLength;
            if (length > maximum) {
                await reader.cancel();
                invalid();
            }
            chunks.push(part.value);
        }
    }
    finally {
        reader.releaseLock();
    }
    return Buffer.concat(chunks, length);
}
/** On-demand control requests plus a direct OSS download. Never uses the
 * realtime tunnel, feature leases, quota ledger or a background refresh timer. */
export class ResourceDeliveryClient {
    source;
    constructor(source) {
        this.source = source;
    }
    capture() {
        let connection;
        try {
            connection = this.source.current();
        }
        catch {
            return fail('resources-unavailable', '当前节点尚未准备好，请稍后刷新。');
        }
        let origin;
        try {
            origin = new URL(connection.origin);
        }
        catch {
            return invalid();
        }
        if (origin.protocol !== 'https:' || origin.username || origin.password || origin.search || origin.hash
            || origin.pathname !== '/')
            invalid();
        const key = connectionKey(connection);
        const check = () => {
            let current;
            try {
                current = this.source.current();
            }
            catch { /* Removed bindings invalidate in-flight results too. */ }
            if (!current || connectionKey(current) !== key)
                fail('resources-closed', '节点连接已变化，请刷新资源。');
        };
        return { connection, origin: origin.origin, check, fetch: connection.fetchImpl ?? fetch };
    }
    async json(captured, method, pathname, signal) {
        const body = method === 'POST' ? '{}' : undefined;
        const headers = createAgentHttpProof(captured.connection.identity, method, pathname, body);
        const response = await captured.fetch(`${captured.origin}${pathname}`, {
            method, body, headers: { ...headers, 'x-hr-resource-schema': '3', ...(body ? { 'content-type': 'application/json' } : {}) },
            redirect: 'error', signal,
        });
        captured.check();
        signal.throwIfAborted();
        if (!response.ok) {
            await response.body?.cancel();
            if (response.status === 401 || response.status === 403)
                fail('resources-forbidden', '请确认当前节点已绑定领取资源的账户。');
            if (response.status === 404)
                fail('resources-unavailable', '资源暂不可用，请稍后刷新。');
            fail('resources-network', '暂时无法连接资源服务，请稍后重试。');
        }
        const bytes = await readBytes(response, 2 * 1024 * 1024);
        captured.check();
        signal.throwIfAborted();
        try {
            return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
        }
        catch {
            return invalid();
        }
    }
    async catalog(signal) {
        const captured = this.capture();
        signal = AbortSignal.any([signal, AbortSignal.timeout(15_000)]);
        const nodeId = captured.connection.identity.nodeId;
        const value = await this.json(captured, 'GET', `/v1/resources/agents/${encodeURIComponent(nodeId)}/library`, signal);
        const { accountInstance } = scope(value, nodeId);
        if (!Array.isArray(value.items))
            invalid();
        const items = value.items.map(release);
        if (new Set(items.map(item => `${item.resourceId}@${item.version}`)).size !== items.length)
            invalid();
        return { schemaVersion: 1, nodeId, accountInstance, items };
    }
    async download(expected, accountInstance, signal) {
        const captured = this.capture();
        signal = AbortSignal.any([signal, AbortSignal.timeout(45_000)]);
        const nodeId = captured.connection.identity.nodeId;
        const pathname = `/v1/resources/agents/${encodeURIComponent(nodeId)}/releases/${encodeURIComponent(expected.resourceId)}/${encodeURIComponent(expected.version)}/download`;
        const ticket = await this.json(captured, 'POST', pathname, signal);
        if (scope(ticket, nodeId).accountInstance !== accountInstance)
            fail('resources-closed', '账户绑定已变化，请刷新资源。');
        const actual = release(ticket.release);
        for (const key of ['resourceId', 'version', 'sha256', 'bytes', 'name', 'description'])
            if (actual[key] !== expected[key])
                invalid();
        if (expected.schemaVersion !== undefined && actual.schemaVersion !== expected.schemaVersion)
            invalid();
        let url;
        try {
            url = new URL(ticket.download.url);
        }
        catch {
            return invalid();
        }
        const origins = captured.connection.objectOrigins ?? DEFAULT_TRUSTED_OBJECT_ORIGINS;
        if (url.protocol !== 'https:' || url.username || url.password || url.hash || !origins.includes(url.origin)
            || !url.pathname.startsWith('/resource-delivery/') || !Number.isFinite(ticket.download.expiresIn)
            || ticket.download.expiresIn <= 0 || ticket.download.expiresIn > 600)
            invalid();
        // Do not forward node proof headers to object storage. No redirects or HTML fallback.
        const response = await captured.fetch(url.href, { method: 'GET', redirect: 'error', signal });
        if (!response.ok) {
            await response.body?.cancel();
            fail('resources-network', '资源下载未完成，请重新安装。');
        }
        const bytes = await readBytes(response, Math.min(expected.bytes, RESOURCE_MAX_BYTES));
        captured.check();
        signal.throwIfAborted();
        // A signed ticket already binds this release to the account. Content hash,
        // exact length and data schema are checked by the local installation layer.
        return bytes;
    }
}
