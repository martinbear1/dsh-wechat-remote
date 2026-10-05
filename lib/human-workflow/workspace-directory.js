/** Explicitly shared, provenance-preserving local records; never an execution grant. */
import { createHmac, randomBytes } from 'node:crypto';
import { humanTaskRef, sameTaskRef } from '../human-tools/protocol.js';
import { bounded, copy, exact, fail, plain, revision, row, scopeValid, StateQueue } from './data.js';
import { WorkspaceAuthority, workspaceRef } from './workspace-authority.js';
import { receiverBinding } from './lifecycle.js';
import { recipientFacts } from './recipient-facts.js';
import { workspaceSourceProof } from './workspace-source.js';
const opaque = (value) => typeof value === 'string' && /^[A-Za-z0-9_-]{42}[AEIMQUYcgkosw048](?![\s\S])/.test(value);
const id = (value) => typeof value === 'string' && /^[a-f0-9]{32}(?![\s\S])/.test(value);
const digest = (value) => typeof value === 'string' && /^[a-f0-9]{64}(?![\s\S])/.test(value);
const MAX_BYTES = 16 * 1024 * 1024;
export class WorkspaceDirectory {
    state;
    options;
    authority;
    persisted = false;
    constructor(state, options, secret) {
        this.state = state;
        this.options = options;
        this.authority = new WorkspaceAuthority(options.transport, options.host, secret);
    }
    static async open(store, options) {
        let raw = await store.load();
        const persisted = raw !== undefined;
        if (raw === undefined)
            raw = { schema: 'human.workspace.directory.store.v1', nodeId: options.transport.nodeId, secret: randomBytes(32).toString('hex'), partitions: [] };
        const invalid = () => fail('workspace-store-invalid', '共享目录账本无效，未使用其中的身份或权限');
        if (!row(raw) || !exact(raw, ['schema', 'nodeId', 'secret', 'partitions']) || raw.schema !== 'human.workspace.directory.store.v1'
            || raw.nodeId !== options.transport.nodeId || !digest(raw.secret) || !Array.isArray(raw.partitions) || raw.partitions.length > 128)
            throw invalid();
        bounded(raw, MAX_BYTES);
        const seen = new Set();
        for (const p of raw.partitions) {
            if (!row(p) || !exact(p, ['bindingKey', 'workspaceRef', 'revision', 'sources', 'notes']) || !digest(p.bindingKey) || !workspaceRef(p.workspaceRef)
                || !revision(p.revision) || !Array.isArray(p.sources) || p.sources.length > 256 || !Array.isArray(p.notes) || p.notes.length > 5000)
                throw invalid();
            const key = p.bindingKey + ':' + p.workspaceRef.ref;
            if (seen.has(key))
                throw invalid();
            seen.add(key);
            const sourceIds = new Set();
            for (const s of p.sources) {
                if (!row(s) || !exact(s, ['id', 'revision', 'sourceSurfaceId', 'origin', 'taskRef', 'title', 'groupRef', 'snapshot', 'syncedAt', 'members'])
                    || !id(s.id) || sourceIds.has(s.id) || !revision(s.revision) || s.revision < 1 || !id(s.sourceSurfaceId)
                    || !scopeValid(s.origin) || s.origin.nodeId !== raw.nodeId || !humanTaskRef(s.taskRef) || !plain(s.title, 80)
                    || !opaque(s.groupRef) || !digest(s.snapshot) || !revision(s.syncedAt) || !Array.isArray(s.members) || s.members.length > 1000)
                    throw invalid();
                sourceIds.add(s.id);
                const people = new Set();
                for (let offset = 0; offset < s.members.length; offset += 20) {
                    const page = recipientFacts({ schema: 'human.recipient.facts.v1', taskRef: s.taskRef, roundId: null, asOf: s.syncedAt, revision: 0,
                        snapshot: s.snapshot, nextOffset: s.members.length > offset + 20 ? offset + 20 : null,
                        coverage: { kind: 'known-task-members', completeGroupRoster: false, totalKnown: s.members.length, roundScoped: false, excludedOwner: true },
                        recipients: s.members.slice(offset, offset + 20) }, s.taskRef, null, offset);
                    for (const member of page.recipients) {
                        if (member.identity.groupRef !== s.groupRef || people.has(member.identity.memberRef))
                            throw invalid();
                        people.add(member.identity.memberRef);
                    }
                }
            }
            const notes = new Set();
            for (const n of p.notes) {
                if (!row(n) || !exact(n, ['groupRef', 'memberRef', 'revision', 'value', 'authoredAt', 'author']) || !opaque(n.groupRef)
                    || n.memberRef !== null && !opaque(n.memberRef) || !revision(n.revision) || n.revision < 1 || !revision(n.authoredAt)
                    || !scopeValid(n.author) || n.author.nodeId !== raw.nodeId || !noteValue(n.value))
                    throw invalid();
                const key = n.groupRef + ':' + n.memberRef;
                if (notes.has(key))
                    throw invalid();
                notes.add(key);
            }
        }
        const directory = new WorkspaceDirectory(new StateQueue(store, raw, MAX_BYTES), options, raw.secret);
        directory.persisted = persisted;
        return directory;
    }
    close() { return this.state.close(); }
    authorRef(scope) { return createHmac('sha256', this.state.current().secret).update(JSON.stringify(scope)).digest('base64url'); }
    partition(context, ledger = this.state.current()) {
        return ledger.partitions.find(p => p.bindingKey === context.bindingKey && p.workspaceRef.ref === context.workspaceRef.ref);
    }
    source(context, sourceId) {
        const source = this.partition(context)?.sources.find(s => s.id === sourceId);
        if (!id(sourceId) || !source)
            throw fail('workspace-source-unavailable', '共享来源不属于当前账号与工作区');
        return source;
    }
    async authorize(context, source, signal) {
        await this.authority.register(context, source.origin, signal);
        await this.authority.register(context, context.scope, signal);
        // The original local action has bounded retention. Preserve its verified
        // provenance here, but obtain fresh server ownership/group/share evidence
        // on every use rather than treating that durable provenance as permission.
        if (await this.taskIdentity(context, source.origin, source.taskRef, signal) !== source.groupRef)
            throw fail('workspace-source-unavailable', '原任务所属群与已共享来源不一致，未改用其他群');
    }
    async access(scope, taskRef, signal) {
        // Ordinary same-session operations do not require a workspace or opt in.
        if (!this.state.current().partitions.some(p => p.sources.some(s => sameTaskRef(s.taskRef, taskRef) && s.origin.sessionId !== scope.sessionId)))
            return;
        const context = await this.authority.resolve(scope, signal), source = this.partition(context)?.sources.find(s => sameTaskRef(s.taskRef, taskRef));
        if (!source || source.origin.sessionId === scope.sessionId && source.origin.sessionGeneration === scope.sessionGeneration)
            return;
        await this.authorize(context, source, signal);
        return { workspaceRef: context.workspaceRef, sourceScope: copy(source.origin) };
    }
    async resolveSource(scope, sourceId, signal) {
        const context = await this.authority.resolve(scope, signal), source = this.source(context, sourceId);
        await this.authorize(context, source, signal);
        return { taskRef: copy(source.taskRef), sourceScope: copy(source.origin), sourceSurfaceId: source.sourceSurfaceId,
            workspaceRef: context.workspaceRef, proof: workspaceSourceProof(scope, source.taskRef) };
    }
    async taskIdentity(context, source, taskRef, signal) {
        const r = await this.options.transport.request('workspace', { operation: 'task-identity', scope: context.scope.sessionId,
            sessionGeneration: context.scope.sessionGeneration, workspaceRef: context.workspaceRef, taskRef }, signal);
        this.options.transport.assertIdentity();
        signal.throwIfAborted();
        if (!row(r) || r.schema !== 'human.workspace.task.identity.v1' || !sameTaskRef(humanTaskRef(r.taskRef), taskRef)
            || workspaceRef(r.workspaceRef)?.ref !== context.workspaceRef.ref || receiverBinding(r.binding, this.options.transport.nodeId).bindingKey !== context.bindingKey
            || r.bindingKey !== context.bindingKey || !row(r.origin) || r.origin.scope !== source.sessionId
            || r.origin.sessionGeneration !== source.sessionGeneration || !opaque(r.groupRef))
            throw fail('workspace-response-invalid', '共享群来源与已核对的任务不一致');
        return r.groupRef;
    }
    async sync(scope, input, signal) {
        if (!row(input) || !exact(input, ['expectedRevision'], ['sourceSurfaceId', 'workspaceSourceId']) || !revision(input.expectedRevision)
            || Object.hasOwn(input, 'sourceSurfaceId') === Object.hasOwn(input, 'workspaceSourceId')
            || input.sourceSurfaceId !== undefined && !id(input.sourceSurfaceId) || input.workspaceSourceId !== undefined && !id(input.workspaceSourceId))
            throw fail('workspace-input-invalid', '请选择一个准确来源，并提供当前目录版本');
        const context = await this.authority.resolve(scope, signal);
        const previous = input.workspaceSourceId ? this.source(context, input.workspaceSourceId)
            : this.partition(context)?.sources.find(s => s.origin.sessionId === scope.sessionId && s.origin.sessionGeneration === scope.sessionGeneration && s.sourceSurfaceId === input.sourceSurfaceId);
        if ((previous?.revision ?? 0) !== input.expectedRevision)
            throw fail('workspace-version-conflict', '共享来源已变化，请重新查询后更新');
        const evidence = previous ? { origin: previous.origin, taskRef: previous.taskRef, title: previous.title } : await this.options.published(scope, input.sourceSurfaceId, signal);
        const sourceScope = evidence.origin;
        // Persist the random workspace namespace before the first registration.
        // Merely mounting the service or reading an empty directory writes nothing.
        if (!this.persisted) {
            await this.state.update(() => null, signal);
            this.persisted = true;
        }
        await this.authority.register(context, sourceScope, signal);
        await this.authority.register(context, scope, signal);
        const groupRef = await this.taskIdentity(context, sourceScope, evidence.taskRef, signal);
        if (previous && groupRef !== previous.groupRef)
            throw fail('workspace-source-unavailable', '原任务所属群发生变化，未覆盖既有共享来源');
        const members = [];
        let snapshot, asOf = 0;
        const seen = new Set();
        for (let offset = 0;; offset += 20) {
            const result = await this.options.transport.request('lifecycle', { operation: 'recipients', scope: scope.sessionId, sessionGeneration: scope.sessionGeneration,
                workspaceRef: context.workspaceRef, taskRef: evidence.taskRef, roundId: null, offset, ...(snapshot ? { snapshot } : {}) }, signal);
            this.options.transport.assertIdentity();
            signal.throwIfAborted();
            if (!row(result) || !row(result.origin) || result.origin.scope !== sourceScope.sessionId || result.origin.sessionGeneration !== sourceScope.sessionGeneration
                || receiverBinding(result.binding, this.options.transport.nodeId).bindingKey !== context.bindingKey || result.bindingKey !== context.bindingKey)
                throw fail('workspace-response-invalid', '共享成员来源与已授权会话不一致');
            const page = recipientFacts(result, evidence.taskRef, null, offset, snapshot);
            if (Number(page.coverage.totalKnown) > 1000)
                throw fail('workspace-capacity', '此任务已知成员超过本地共享目录容量');
            snapshot = page.snapshot;
            asOf = page.asOf;
            for (const member of page.recipients) {
                if (member.identity.groupRef !== groupRef || seen.has(member.identity.memberRef))
                    throw fail('workspace-response-invalid', '共享名单混入其他群或重复身份');
                seen.add(member.identity.memberRef);
                members.push(member);
            }
            if (page.nextOffset === null)
                break;
        }
        const final = await this.authority.resolve(scope, signal);
        if (final.bindingKey !== context.bindingKey || final.workspaceRef.ref !== context.workspaceRef.ref)
            throw fail('workspace-source-unavailable', '采集期间工作区或账号已变更');
        return this.state.update(next => {
            let partition = this.partition(context, next);
            if (!partition) {
                if (next.partitions.length >= 128)
                    throw fail('workspace-capacity', '共享工作区数量已达上限');
                partition = { bindingKey: context.bindingKey, workspaceRef: context.workspaceRef, revision: 0, sources: [], notes: [] };
                next.partitions.push(partition);
            }
            const existing = partition.sources.find(s => previous ? s.id === previous.id : s.origin.sessionId === scope.sessionId && s.origin.sessionGeneration === scope.sessionGeneration && s.sourceSurfaceId === input.sourceSurfaceId);
            if ((existing?.revision ?? 0) !== input.expectedRevision)
                throw fail('workspace-version-conflict', '其他会话已更新这个来源，请重新查询');
            if (!existing && partition.sources.length >= 256)
                throw fail('workspace-capacity', '共享来源数量已达上限');
            const value = { id: existing?.id ?? randomBytes(16).toString('hex'), revision: (existing?.revision ?? 0) + 1,
                sourceSurfaceId: previous?.sourceSurfaceId ?? input.sourceSurfaceId, origin: copy(sourceScope), taskRef: copy(evidence.taskRef), title: evidence.title,
                groupRef, snapshot: snapshot, syncedAt: asOf, members };
            if (existing)
                partition.sources[partition.sources.indexOf(existing)] = value;
            else
                partition.sources.push(value);
            partition.revision++;
            return { schema: 'human.workspace.sync.v1', workspaceSourceId: value.id, revision: value.revision, groupRef,
                taskRef: value.taskRef, knownMembers: members.length, asOf, completeGroupRoster: false };
        }, signal);
    }
    async query(scope, input, signal) {
        if (!row(input) || !exact(input, [], ['workspaceSourceId', 'groupRef', 'offset']) || input.workspaceSourceId !== undefined && !id(input.workspaceSourceId)
            || input.groupRef !== undefined && !opaque(input.groupRef) || input.workspaceSourceId !== undefined && input.groupRef !== undefined
            || input.offset !== undefined && (!revision(input.offset) || input.offset > 10000))
            throw fail('workspace-input-invalid', '共享目录查询参数无效');
        const context = await this.authority.resolve(scope, signal), partition = this.partition(context), offset = input.offset ?? 0;
        const sources = input.workspaceSourceId ? [this.source(context, input.workspaceSourceId)] : (partition?.sources ?? []).filter(s => !input.groupRef || s.groupRef === input.groupRef);
        const summary = (s) => ({ workspaceSourceId: s.id, revision: s.revision, taskRef: s.taskRef, title: s.title, sourceAgentRef: this.authorRef(s.origin),
            groupRef: s.groupRef, knownMembers: s.members.length, asOf: s.syncedAt });
        const note = (groupRef, memberRef) => {
            const n = partition?.notes.find(n => n.groupRef === groupRef && n.memberRef === memberRef);
            return n ? { revision: n.revision, value: copy(n.value), authoredAt: n.authoredAt, authorRef: this.authorRef(n.author), source: 'agent-authored-business-record', verifiedIdentity: false } : { revision: 0, value: null };
        };
        if (!input.workspaceSourceId && !input.groupRef) {
            const groups = [...new Set(sources.map(s => s.groupRef))], slice = groups.slice(offset, offset + 20);
            return { schema: 'human.workspace.directory.v1', revision: partition?.revision ?? 0, coverage: 'explicitly-shared-sources-not-full-group-roster',
                groups: slice.map(groupRef => ({ groupRef, note: note(groupRef, null), sources: sources.filter(s => s.groupRef === groupRef).map(summary) })), nextOffset: offset + 20 < groups.length ? offset + 20 : null };
        }
        const known = new Map();
        for (const source of sources)
            for (const member of source.members) {
                const item = known.get(member.identity.memberRef) ?? { identity: member.identity, observations: [] };
                item.observations.push({ workspaceSourceId: source.id, asOf: source.syncedAt, recipient: copy(member) });
                known.set(member.identity.memberRef, item);
            }
        return { schema: 'human.workspace.members.v1', revision: partition?.revision ?? 0, cached: true, authorization: 'must-revalidate-before-action',
            completeGroupRoster: false, sources: sources.map(summary), members: [...known.values()].slice(offset, offset + 20).map(m => ({ ...m, note: note(m.identity.groupRef, m.identity.memberRef) })),
            nextOffset: offset + 20 < known.size ? offset + 20 : null };
    }
    async note(scope, input, signal) {
        if (!row(input) || !exact(input, ['groupRef', 'memberRef', 'expectedRevision', 'value']) || !opaque(input.groupRef)
            || input.memberRef !== null && !opaque(input.memberRef) || !revision(input.expectedRevision) || !noteValue(input.value))
            throw fail('workspace-input-invalid', '业务记录格式无效');
        const context = await this.authority.resolve(scope, signal);
        return this.state.update(next => {
            const partition = this.partition(context, next);
            if (!partition?.sources.some(s => s.groupRef === input.groupRef && (input.memberRef === null || s.members.some(m => m.identity.memberRef === input.memberRef))))
                throw fail('workspace-member-unavailable', '只能为已核实来源中的群或成员记录业务称呼，不可创建身份');
            const old = partition.notes.find(n => n.groupRef === input.groupRef && n.memberRef === input.memberRef);
            if ((old?.revision ?? 0) !== input.expectedRevision)
                throw fail('workspace-version-conflict', '其他会话已更新此记录，请重新查看后更正');
            if (!old && partition.notes.length >= 5000)
                throw fail('workspace-capacity', '业务记录数量已达上限');
            const note = { groupRef: input.groupRef, memberRef: input.memberRef, revision: (old?.revision ?? 0) + 1,
                value: copy(input.value), authoredAt: (this.options.now ?? Date.now)(), author: copy(scope) };
            if (old)
                partition.notes[partition.notes.indexOf(old)] = note;
            else
                partition.notes.push(note);
            partition.revision++;
            return { schema: 'human.workspace.note.v1', revision: note.revision, value: note.value, authoredAt: note.authoredAt,
                source: 'agent-authored-business-record', verifiedIdentity: false };
        }, signal);
    }
}
function noteValue(value) {
    return value === null || row(value) && exact(value, ['displayName', 'aliases', 'notes']) && typeof value.displayName === 'string'
        && value.displayName.length <= 120 && typeof value.notes === 'string' && value.notes.length <= 2000
        && Array.isArray(value.aliases) && value.aliases.length <= 12 && value.aliases.every(v => plain(v, 120))
        && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value.displayName + value.notes);
}
