/** Host-derived workspace identity. No tool argument supplies a path or scope. */
import { realpath, stat } from 'node:fs/promises';
import path from 'node:path';
import { createHmac } from 'node:crypto';
import { assertScope, exact, fail, plain, revision, row } from './data.js';
import { receiverBinding } from './lifecycle.js';
export function workspaceRef(value) {
    return row(value) && exact(value, ['schema', 'ref']) && value.schema === 'human.workspace.ref.v1'
        && typeof value.ref === 'string' && /^[A-Za-z0-9_-]{42}[AEIMQUYcgkosw048](?![\s\S])/.test(value.ref)
        ? { schema: 'human.workspace.ref.v1', ref: value.ref } : undefined;
}
export class WorkspaceAuthority {
    transport;
    host;
    secret;
    constructor(transport, host, secret) {
        this.transport = transport;
        this.host = host;
        this.secret = secret;
    }
    async physical(scope, signal) {
        try {
            return await this.physicalUnchecked(scope, signal);
        }
        catch (cause) {
            signal.throwIfAborted();
            this.transport.assertIdentity();
            if (String(cause?.code).startsWith('workspace-'))
                throw cause;
            throw fail('workspace-unavailable', '无法核实工作区目录或来源会话，未共享其身份或权限');
        }
    }
    async physicalUnchecked(scope, signal) {
        assertScope(scope, this.transport.nodeId);
        this.transport.assertIdentity();
        signal.throwIfAborted();
        const header = await this.host.header(scope.sessionId, signal);
        if (!row(header) || header.id !== scope.sessionId || !revision(header.createdAt)
            || String(header.createdAt) !== scope.sessionGeneration || !plain(header.cwd, 32768) || !path.isAbsolute(header.cwd)
            || this.host.archived().includes(scope.sessionId))
            throw fail('workspace-source-unavailable', '来源会话已变更、归档或没有可靠工作区，不能共享其权限');
        const canonical = await realpath(header.cwd), info = await stat(canonical);
        if (!info.isDirectory())
            throw fail('workspace-unavailable', '当前会话没有可核实的工作区目录');
        const normalized = process.platform === 'win32' ? canonical.toLowerCase() : canonical;
        const matches = [];
        for (const workspace of this.host.workspaces()) {
            if (!workspace.sessionIds.includes(scope.sessionId))
                continue;
            const registered = await realpath(workspace.path);
            if ((process.platform === 'win32' ? registered.toLowerCase() : registered) === normalized)
                matches.push(workspace);
        }
        if (matches.length !== 1 || !plain(matches[0].id, 256))
            throw fail('workspace-unavailable', '当前会话不属于唯一可核实的原生工作区');
        const again = await this.host.header(scope.sessionId, signal);
        if (!row(again) || again.id !== header.id || again.createdAt !== header.createdAt || again.cwd !== header.cwd
            || this.host.archived().includes(scope.sessionId))
            throw fail('workspace-source-unavailable', '核对期间会话工作区发生变化');
        this.transport.assertIdentity();
        signal.throwIfAborted();
        return [matches[0].id, normalized, String(info.dev), String(info.ino), info.birthtimeMs];
    }
    async resolve(scope, signal) {
        const physical = await this.physical(scope, signal);
        const response = await this.transport.request('sync', { mode: 'binding' }, signal);
        this.transport.assertIdentity();
        signal.throwIfAborted();
        if (!row(response) || response.schema !== 'human.workflow.binding.v1' || !revision(response.asOf))
            throw fail('workspace-binding-invalid', '无法核对当前工作区的账号绑定');
        const { bindingKey } = receiverBinding(response.binding, this.transport.nodeId);
        if (bindingKey !== response.bindingKey)
            throw fail('workspace-binding-invalid', '当前工作区账号绑定不一致');
        if (JSON.stringify(await this.physical(scope, signal)) !== JSON.stringify(physical))
            throw fail('workspace-source-unavailable', '核对期间工作区目录身份发生变化');
        const ref = createHmac('sha256', this.secret).update(JSON.stringify([this.transport.nodeId, bindingKey, physical])).digest('base64url');
        return { workspaceRef: { schema: 'human.workspace.ref.v1', ref }, bindingKey, scope: { ...scope } };
    }
    async register(context, scope, signal) {
        const current = await this.resolve(scope, signal);
        if (current.bindingKey !== context.bindingKey || current.workspaceRef.ref !== context.workspaceRef.ref)
            throw fail('workspace-source-unavailable', '来源会话已不属于当前账号的同一工作区');
        const result = await this.transport.request('workspace', { operation: 'register-session', scope: scope.sessionId,
            sessionGeneration: scope.sessionGeneration, workspaceRef: context.workspaceRef }, signal);
        this.transport.assertIdentity();
        signal.throwIfAborted();
        if (!row(result) || result.schema !== 'human.workspace.registration.v1' || result.scope !== scope.sessionId
            || result.sessionGeneration !== scope.sessionGeneration || workspaceRef(result.workspaceRef)?.ref !== context.workspaceRef.ref
            || receiverBinding(result.binding, this.transport.nodeId).bindingKey !== context.bindingKey || result.bindingKey !== context.bindingKey
            || !revision(result.registeredAt))
            throw fail('workspace-registration-invalid', '工作区登记与真实会话不符');
        const final = await this.resolve(scope, signal);
        if (final.bindingKey !== context.bindingKey || final.workspaceRef.ref !== context.workspaceRef.ref)
            throw fail('workspace-source-unavailable', '登记期间会话工作区发生变化');
    }
}
