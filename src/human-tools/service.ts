import { randomBytes } from 'node:crypto'
import path from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import type { ToolRuntime } from '@deepseek-ai/dsh-tools'
import type { SessionId, SessionStore } from '@deepseek-ai/dsh-session'
import { defaultGateStatePath } from '../agent-metadata.js'
import { HumanToolsCore, type HumanStore } from './core.js'
import { HumanFileStore } from './store.js'
import { registerHumanContext, dshHumanToolsAvailable, humanShareTool, humanMembersTool, humanRemindTool } from './dsh.js'
import { object, type HumanAckWireRequest, type HumanActionRequest, type HumanSurface } from './protocol.js'
import { createCapabilityManifest } from '../human-workflow/capabilities.js'
import { WorkflowFileStore } from '../human-workflow/persistence.js'
import { ModeRegistry } from '../human-workflow/mode-package.js'
import { WorkflowRecords } from '../human-workflow/workflow-records.js'
import { humanWorkflowTools, registerHumanWorkflowContext } from '../human-workflow/dsh-tools.js'
import { WorkflowReplica, REPLICA_MAX_BYTES, WORKFLOW_DRAFT_TTL_MS, WORKFLOW_SOURCE_GRANT_TTL_MS } from '../human-workflow/replica.js'
import { workflowQueryTools } from '../human-workflow/query-tools.js'
import { fail, row, type WorkflowDataStore, type WorkflowScope } from '../human-workflow/data.js'
import type { WorkflowTransport } from '../human-workflow/transport.js'
import { registerHumanWorkflowSkill } from '../human-workflow/dsh-skill.js'
import { AssistantRegistry } from '../assistant-presets/registry.js'
import { createNativeAssistantAdapter } from '../assistant-presets/native-adapter.js'
import type { NativeAssistantAdapter } from '../assistant-presets/types.js'
import { AssistantBusinessRecords } from '../assistant-presets/business.js'
import { assistantTools, registerAssistantContext, nativeComposedPreset } from '../assistant-presets/tools.js'
import type { AttachmentStore } from '@deepseek-ai/dsh-attachment'
import { ReceiverKeyring, ReceiverKeyFileStore } from '../human-workflow/receiver-keyring.js'
import { SubmissionReceiver } from '../human-workflow/receiver.js'
import { downloadSubmission } from '../human-workflow/receiver-download.js'
import { WorkflowLifecycle } from '../human-workflow/lifecycle.js'
import { lifecycleTools } from '../human-workflow/lifecycle-tools.js'

export interface HumanToolsConfig { readonly enabled?: boolean; readonly store?: HumanStore
  readonly assistants?: false | { native?: NativeAssistantAdapter; registryStore?: WorkflowDataStore; businessStore?: WorkflowDataStore }
  readonly workflow?: { transport: WorkflowTransport; modeStore?: WorkflowDataStore; recordStore?: WorkflowDataStore; replicaStore?: WorkflowDataStore
    lifecycleStore?: WorkflowDataStore; receiverKeyStore?: WorkflowDataStore; receiverRoot?: string } }
export interface ModeVersionRequest { scope: string; id: string; version: number }
export interface ModeApprovalRequest extends ModeVersionRequest { digest: string; previewId: string; expectedActivationVersion: number }
export interface AssistantVersionRequest { id: string; version: number }
export interface AssistantInstallRequest extends AssistantVersionRequest { digest: string; previewId: string }
export interface AssistantDraftRequest { templateId?: string; definitionJson?: string; id?: string; expectedVersion?: number }
export interface HumanResult { readonly ok: boolean; readonly valueJson?: string; readonly error?: { readonly code: string; readonly message: string } }
/** Private owner RPC only. Never mount this namespace on a published/guest route. */
export class HumanToolsService extends TypertRemoteService {
  static inject = ['tools', 'agents', 'sessions', 'systemPrompt']
  private core?: HumanToolsCore
  private ready?: Promise<void>
  private readonly lifetime = new AbortController()
  private unregister?: () => void
  private workflow?: { transport: WorkflowTransport; modes: ModeRegistry; records: WorkflowRecords; replica: WorkflowReplica }
  private assistants?: { registry: AssistantRegistry; business: AssistantBusinessRecords; native: NativeAssistantAdapter }
  private lifecycle?: { runtime: WorkflowLifecycle; keys: ReceiverKeyring; receiver?: SubmissionReceiver; unsubscribe(): void }
  constructor(private readonly host: Context, config: HumanToolsConfig = {}) {
    super(host, 'humanTools')
    host.effect(() => async () => {
      this.lifetime.abort(disabled())
      const drained = this.core?.close()
      try { this.unregister?.() } finally { await Promise.all([drained, this.workflow?.modes.close(), this.workflow?.records.close(), this.workflow?.replica.close(), this.closeAssistants(), this.closeLifecycle()]) }
    })
    if (!config.enabled) return
    this.ready = this.initialize(config)
    // Failure disables this optional experiment, never the mature gate/host.
    void this.ready.catch(cause => console.warn('[human-tools] unavailable:', cause instanceof Error ? cause.message : String(cause)))
  }
  private async initialize(config: HumanToolsConfig): Promise<void> {
    if (!dshHumanToolsAvailable(this.host)) throw new Error('此DSH不支持原生工具/会话上下文')
    // Resolve the actual host profile, including linked/native installations.
    // Web and Desktop must never share one action ledger on the same computer.
    const store = config.store || new HumanFileStore(path.join(path.dirname(defaultGateStatePath(this.host)), 'human-tools-v1.json'))
    const core = await HumanToolsCore.open(store, () => randomBytes(16).toString('hex'))
    if (this.lifetime.signal.aborted) { core.close(); return }
    this.core = core
    const unregisterTools: (() => void)[] = []
    try {
      if (config.workflow) {
        const { transport } = config.workflow
        transport.assertIdentity()
        if (!/^[A-Za-z0-9_-]{16,128}$/.test(transport.nodeId)) throw fail('workflow-node-invalid', '节点身份无效')
        const file = (kind: string) => new WorkflowFileStore(path.join(path.dirname(defaultGateStatePath(this.host)), `human-workflow-${transport.nodeId}-${kind}.json`),
          kind === 'facts' ? REPLICA_MAX_BYTES : undefined)
        const replica = await WorkflowReplica.open(config.workflow.replicaStore || file('facts'), transport)
        let modes: ModeRegistry | undefined, records: WorkflowRecords | undefined
        try {
          const capabilities = () => { transport.assertIdentity(); return createCapabilityManifest(transport.nodeId, { 'task.query': { status: 'available' },
            ...(this.lifecycle ? { 'surface.form-collection': { status: 'available' as const }, 'task.lifecycle': { status: 'available' as const },
              'recipient.query': { status: 'available' as const }, 'result.private': { status: 'available' as const },
              ...(this.lifecycle.receiver ? { 'submission.receive': { status: 'available' as const } } : {}) } : {}) }) }
          modes = await ModeRegistry.open(config.workflow.modeStore || file('modes'),
            { nodeId: transport.nodeId, capabilities, randomId: () => randomBytes(16).toString('hex') })
          records = await WorkflowRecords.open(config.workflow.recordStore || file('records'),
            { nodeId: transport.nodeId, modes, randomId: () => randomBytes(16).toString('hex'), validateReferences: (scope, refs) => replica.validateReferences(scope, refs) })
          this.lifetime.signal.throwIfAborted(); transport.assertIdentity()
          this.workflow = { transport, modes, records, replica }
          const keyFile = path.join(path.dirname(defaultGateStatePath(this.host)), `human-workflow-${transport.nodeId}-receiver-keys.json`)
          const keys = await ReceiverKeyring.open(config.workflow.receiverKeyStore || new ReceiverKeyFileStore(keyFile), transport.nodeId)
          let receiver: SubmissionReceiver | undefined, runtime: WorkflowLifecycle | undefined
          try {
            const attachments = this.host.get('attachments') as AttachmentStore | undefined
            if (typeof attachments?.validateImage === 'function' && typeof attachments?.saveImage === 'function') {
              receiver = await SubmissionReceiver.open({ root: config.workflow.receiverRoot || path.join(path.dirname(keyFile), `human-workflow-${transport.nodeId}-received`),
                nodeId: transport.nodeId, keys, assertIdentity: () => transport.assertIdentity(), download: downloadSubmission,
                validateImage: (image, mediaType) => attachments.validateImage({ data: image, mediaType }),
                ack: (origin, taskRef, delivery, signal) => transport.request('objects/ack', { scope: origin.sessionId, sessionGeneration: origin.sessionGeneration,
                  taskRef, submissionId: delivery.submissionId, claimId: delivery.claimId, version: delivery.version,
                  manifestDigest: delivery.envelope.manifestDigest, cipherDigest: delivery.envelope.cipherDigest }, signal) })
            }
            runtime = await WorkflowLifecycle.open({ transport, keys, receiver, store: config.workflow.lifecycleStore || file('lifecycle') })
            this.lifetime.signal.throwIfAborted(); transport.assertIdentity()
            const current = runtime
            this.lifecycle = { runtime, keys, receiver, unsubscribe: replica.onSynchronized((binding, tasks) => {
              void current.synced(binding, tasks, this.lifetime.signal).catch(() => {})
            }) }
            for (const tool of lifecycleTools({ nodeId: transport.nodeId, lifecycle: runtime, core,
              assertAgent: exec => {
                this.lifetime.signal.throwIfAborted(); transport.assertIdentity()
                const agents = this.host.get('agents') as { get(id: string): unknown } | undefined
                if (!exec.agent || agents?.get(String(exec.agent.id)) !== exec.agent) throw fail('workflow-scope-invalid', '调用者不是当前真实Agent')
              }, ...(receiver && attachments ? { saveImage: (data: Uint8Array, mediaType: 'image/png' | 'image/jpeg') => attachments.saveImage({ data, mediaType }) } : {}) }))
              unregisterTools.push((this.host.get('tools') as ToolRuntime).register(tool))
          } catch (cause) { await Promise.all([runtime?.close(), receiver?.close()]); await keys.close(); throw cause }
          const options = { nodeId: transport.nodeId, modes, records, capabilities,
            prepareCard: (input: { scope: WorkflowScope; callId: string; rootCallId: string; title: string; body: string; sourceSurfaceId?: string }, signal: AbortSignal) => {
              transport.assertIdentity()
              return core.create({ scope: input.scope.sessionId, generation: input.scope.sessionGeneration, callId: input.callId,
                rootCallId: input.rootCallId }, input.title, input.body, signal, input.sourceSurfaceId)
            } }
          for (const tool of [...humanWorkflowTools(options), ...workflowQueryTools(transport.nodeId, replica)]) {
            const execute = tool.execute
            unregisterTools.push((this.host.get('tools') as ToolRuntime).register({ ...tool, async execute(args, exec) {
              transport.assertIdentity(); const result = await execute(args, exec); transport.assertIdentity(); return result
            } }))
          }
          unregisterTools.push(registerHumanWorkflowContext(this.host, options))
          const unregisterSkill = registerHumanWorkflowSkill(this.host)
          if (unregisterSkill) unregisterTools.push(unregisterSkill)
          if (config.assistants !== false) {
            const assistantConfig = config.assistants || {}, native = assistantConfig.native || createNativeAssistantAdapter(this.host)
            let registry: AssistantRegistry | undefined, business: AssistantBusinessRecords | undefined
            try {
              registry = await AssistantRegistry.open(assistantConfig.registryStore || file('assistants'), {
                nodeId: transport.nodeId, native, assertIdentity: () => transport.assertIdentity(),
              })
              business = await AssistantBusinessRecords.open(assistantConfig.businessStore || file('assistant-work'), {
                nodeId: transport.nodeId, registry, assertIdentity: () => transport.assertIdentity(),
              })
              this.lifetime.signal.throwIfAborted(); transport.assertIdentity()
              this.assistants = { registry, business, native }
              const assistantOptions = { nodeId: transport.nodeId, registry, business, assertIdentity: () => transport.assertIdentity(),
                composedPreset: (agent: Parameters<typeof nativeComposedPreset>[1]) => nativeComposedPreset(this.host, agent) }
              for (const tool of assistantTools(assistantOptions)) unregisterTools.push((this.host.get('tools') as ToolRuntime).register(tool))
              unregisterTools.push(registerAssistantContext(this.host, assistantOptions))
            } catch (cause) {
              await native.close(); await Promise.all([registry?.close(), business?.close()]); throw cause
            }
          }
          replica.start()
        } catch (cause) { await Promise.all([replica.close(), modes?.close(), records?.close()]); this.workflow = undefined; throw cause }
      }
      for (const tool of [humanShareTool(core), humanMembersTool(core), humanRemindTool(core)])
        unregisterTools.push((this.host.get('tools') as ToolRuntime).register(tool))
      const unregisterContext = registerHumanContext(this.host, core)
      this.unregister = () => { unregisterContext(); unregisterTools.reverse().forEach(remove => remove()) }
    } catch (cause) { unregisterTools.reverse().forEach(remove => remove()); await Promise.all([core.close(), this.workflow?.modes.close(), this.workflow?.records.close(), this.workflow?.replica.close(), this.closeAssistants(), this.closeLifecycle()]); this.core = undefined; this.workflow = undefined; throw cause }
  }
  private async closeLifecycle() {
    const current = this.lifecycle; if (!current) return
    current.unsubscribe(); await Promise.all([current.runtime.close(), current.receiver?.close()]); await current.keys.close()
  }
  @Remote('workflowDraft')
  async workflowDraft(request: HumanActionRequest, signal: AbortSignal): Promise<HumanResult> {
    return this.result(async () => {
      const active = AbortSignal.any([signal, this.lifetime.signal]), core = await this.use(active)
      if (!this.lifecycle) throw fail('lifecycle-unavailable', '此节点尚未提供任务生命周期')
      const source = core.grantSource(request), generation = await this.claimGeneration(request.scope, active)
      core.assertGeneration(request.scope, request.surfaceId, generation)
      if (source.surface.actions[0].id !== 'workflow-approve' || !source.surface.workflowRef || !source.surface.targetTaskRef)
        throw fail('lifecycle-draft-invalid', '此按钮不是工作流审核入口')
      return this.lifecycle.runtime.preview({ nodeId: this.workflow!.transport.nodeId, sessionId: source.origin.scope, sessionGeneration: generation },
        source.surface.targetTaskRef, source.surface.workflowRef, active)
    })
  }
  private async closeAssistants() {
    const assistants = this.assistants
    if (!assistants) return
    await Promise.all([assistants.native.close(), assistants.registry.close(), assistants.business.close()])
  }
  private async assistantRegistry(signal: AbortSignal) {
    await this.use(signal)
    if (!this.assistants) throw fail('assistant-unavailable', '此节点尚未提供助手管理能力')
    return this.assistants.registry
  }
  @Remote('assistantCatalog')
  async assistantCatalog(request: {}, signal: AbortSignal): Promise<HumanResult> {
    return this.result(async () => (await this.assistantRegistry(signal)).catalog(AbortSignal.any([signal, this.lifetime.signal])))
  }
  @Remote('assistantDraft')
  async assistantDraft(request: AssistantDraftRequest, signal: AbortSignal): Promise<HumanResult> {
    return this.result(async () => {
      const registry = await this.assistantRegistry(signal), { definitionJson, ...input } = request
      if (definitionJson !== undefined && (typeof definitionJson !== 'string' || Buffer.byteLength(definitionJson) > 24 * 1024))
        throw fail('assistant-definition-invalid', '助手定义过大或无效')
      return registry.draft({ ...input, ...(definitionJson === undefined ? {} : { definition: JSON.parse(definitionJson) }) }, AbortSignal.any([signal, this.lifetime.signal]))
    })
  }
  @Remote('assistantPreview')
  async assistantPreview(request: AssistantVersionRequest, signal: AbortSignal): Promise<HumanResult> {
    return this.result(async () => (await this.assistantRegistry(signal)).preview(request, AbortSignal.any([signal, this.lifetime.signal])))
  }
  @Remote('assistantInstall')
  async assistantInstall(request: AssistantInstallRequest, signal: AbortSignal): Promise<HumanResult> {
    return this.result(async () => (await this.assistantRegistry(signal)).install(request, AbortSignal.any([signal, this.lifetime.signal])))
  }
  @Remote('assistantStatus')
  async assistantStatus(request: AssistantVersionRequest, signal: AbortSignal): Promise<HumanResult> {
    return this.result(async () => (await this.assistantRegistry(signal)).status(request, AbortSignal.any([signal, this.lifetime.signal])))
  }
  private async use(signal: AbortSignal): Promise<HumanToolsCore> {
    signal.throwIfAborted()
    if (!this.ready || this.lifetime.signal.aborted) throw disabled()
    await waitForReady(this.ready, AbortSignal.any([signal, this.lifetime.signal]))
    signal.throwIfAborted()
    if (this.lifetime.signal.aborted || !this.core) throw disabled()
    this.workflow?.transport.assertIdentity()
    return this.core
  }
  private async result(operation: () => Promise<unknown>): Promise<HumanResult> {
    try {
      const value = await operation()
      this.lifetime.signal.throwIfAborted(); this.workflow?.transport.assertIdentity()
      return { ok: true, valueJson: JSON.stringify(value) }
    }
    catch (cause) { return { ok: false, error: { code: typeof (cause as { code?: unknown })?.code === 'string'
      ? (cause as { code: string }).code : 'human-tools-unavailable', message: cause instanceof Error ? cause.message : '测试卡片不可用' } } }
  }
  /** Synchronous bounded lookup used identically by history and live projection. */
  present(scope: string, callId: string): HumanSurface | undefined {
    const session = (this.host.get('sessions') as SessionStore | undefined)?.get(scope as SessionId)
    return this.core?.forResult(scope, callId, session ? String(session.header.createdAt) : undefined)
  }
  /** Host-only cold-history barrier. Shares the one ledger load; cancelling a
   * reader never cancels initialization or another reader. Optional failure
   * must not hide the ordinary history, and adds no retry or polling. */
  async prepareProjection(signal: AbortSignal): Promise<boolean> {
    try { await this.use(signal); return true }
    catch { signal.throwIfAborted(); return false }
  }
  @Remote('capabilities')
  async capabilities(request: { scope: string }, signal: AbortSignal): Promise<HumanResult> {
    return this.result(async () => { await this.use(signal); return { schema: 'human.tools.v1', enabled: true, shareTest: true, members: true, remind: true,
      ...(this.workflow ? { workflow: this.workflow.modes.manifest() } : {}) } })
  }
  @Remote('sourceGrant')
  async sourceGrant(request: HumanActionRequest, signal: AbortSignal): Promise<HumanResult> {
    return this.result(async () => {
      const active = AbortSignal.any([signal, this.lifetime.signal]), core = await this.use(active)
      if (!this.workflow) throw fail('workflow-unavailable', '此节点尚未连接群任务服务')
      const source = core.grantSource(request), generation = await this.claimGeneration(request.scope, active)
      core.assertGeneration(request.scope, request.surfaceId, generation)
      const grant = await this.workflow.transport.request('grant', { scope: source.origin.scope, sessionGeneration: generation,
        surfaceId: request.surfaceId, attemptId: request.attemptId, surface: source.surface }, active)
      active.throwIfAborted(); this.workflow.transport.assertIdentity()
      if (!row(grant) || grant.schema !== 'human.source.grant.v1' || typeof grant.sourceGrant !== 'string' || grant.sourceGrant.length > 4096
        || !Number.isSafeInteger(grant.expiresAt) || Number(grant.expiresAt) <= Date.now()) throw fail('workflow-response-invalid', '任务来源凭证无效')
      await this.workflow.replica.keepDiscovering(Number(grant.expiresAt) + WORKFLOW_DRAFT_TTL_MS, active)
      return grant
    })
  }
  private async workflowScope(scope: string, signal: AbortSignal): Promise<WorkflowScope> {
    await this.use(signal)
    if (!this.workflow) throw fail('workflow-unavailable', '此节点尚未启用群任务模式')
    if (typeof scope !== 'string' || !scope.trim() || scope.length > 256) throw originUnavailable()
    const sessionGeneration = await this.claimGeneration(scope, signal)
    this.workflow.transport.assertIdentity(); signal.throwIfAborted(); this.lifetime.signal.throwIfAborted()
    return { nodeId: this.workflow.transport.nodeId, sessionId: scope, sessionGeneration }
  }
  @Remote('modeList')
  async modeList(request: { scope: string }, signal: AbortSignal): Promise<HumanResult> {
    return this.result(async () => { const scope = await this.workflowScope(request.scope, signal); return this.workflow!.modes.list(scope) })
  }
  @Remote('modePreview')
  async modePreview(request: ModeVersionRequest, signal: AbortSignal): Promise<HumanResult> {
    return this.result(async () => { const scope = await this.workflowScope(request.scope, signal)
      return this.workflow!.modes.preview(scope, { id: request.id, version: request.version }, AbortSignal.any([signal, this.lifetime.signal])) })
  }
  @Remote('modeApprove')
  async modeApprove(request: ModeApprovalRequest, signal: AbortSignal): Promise<HumanResult> {
    return this.result(async () => { const scope = await this.workflowScope(request.scope, signal), { scope: _scope, ...approval } = request
      return this.workflow!.modes.approve(scope, approval, AbortSignal.any([signal, this.lifetime.signal])) })
  }
  @Remote('modeRollback')
  async modeRollback(request: ModeApprovalRequest, signal: AbortSignal): Promise<HumanResult> {
    return this.result(async () => { const scope = await this.workflowScope(request.scope, signal), { scope: _scope, ...approval } = request
      return this.workflow!.modes.rollback(scope, approval, AbortSignal.any([signal, this.lifetime.signal])) })
  }
  @Remote('claim')
  async claim(request: HumanActionRequest, signal: AbortSignal): Promise<HumanResult> {
    return this.result(async () => {
      const claimSignal = AbortSignal.any([signal, this.lifetime.signal])
      const core = await this.use(claimSignal)
      // Check our own bounded scope first, before querying any host directory.
      core.status(request.scope, request.surfaceId)
      const generation = await this.claimGeneration(request.scope, claimSignal)
      claimSignal.throwIfAborted()
      core.assertGeneration(request.scope, request.surfaceId, generation)
      return core.claim(request, claimSignal)
    })
  }
  /** A missing live Session is not evidence that its durable generation still
   * exists. Query headers only; never acquire a Session/Agent writer to claim. */
  private async claimGeneration(scope: string, signal: AbortSignal): Promise<string> {
    try {
      signal.throwIfAborted()
      const sessions = this.host.get('sessions') as SessionStore | undefined
      const session = sessions?.get(scope as SessionId)
      if (session) return headerGeneration(session.header, scope)
      // These optional public APIs return SessionRecord[] with a cloned header.
      // Older hosts keep working for live sessions without a new SDK import.
      const query = this.host.get('sessionQuery') as {
        filterSessions?: (filters: readonly { kind: 'id'; values: readonly string[] }[], signal: AbortSignal) => Promise<unknown>
        listSessions?: (signal: AbortSignal) => Promise<unknown>
      } | undefined
      let pending: Promise<unknown>
      if (typeof query?.filterSessions === 'function') pending = query.filterSessions([{ kind: 'id', values: [scope] }], signal)
      else if (typeof query?.listSessions === 'function') pending = query.listSessions(signal)
      else throw originUnavailable()
      const rows = await waitForReady(Promise.resolve(pending), signal)
      signal.throwIfAborted()
      if (!Array.isArray(rows) || rows.some(row => !object(row) || !object(row.header) || typeof row.header.id !== 'string')) throw originUnavailable()
      const matches = rows.filter(row => row.header.id === scope)
      if (matches.length !== 1) throw originUnavailable()
      const generation = headerGeneration(matches[0].header, scope)
      // A native activation during the read must agree with the observed header.
      const current = sessions?.get(scope as SessionId)
      if (current && headerGeneration(current.header, scope) !== generation) throw originUnavailable()
      return generation
    } catch {
      signal.throwIfAborted()
      throw originUnavailable()
    }
  }
  @Remote('ack')
  async ack(request: HumanAckWireRequest, signal: AbortSignal): Promise<HumanResult> {
    return this.result(async () => {
      const active = AbortSignal.any([signal, this.lifetime.signal]), receipt = await (await this.use(active)).ack(request, active)
      if (this.workflow && request.actionId === 'share' && ['success', 'unknown'].includes(receipt.outcome)) {
        // Also cover a late native result and pre-upgrade ledgers which never
        // retained a grant intent. This is only read-only discovery, not replay.
        // Authoritative sync time, never this local clock, decides retirement.
        await this.workflow.replica.keepDiscovering(Date.now() + WORKFLOW_SOURCE_GRANT_TTL_MS + WORKFLOW_DRAFT_TTL_MS, active)
      }
      return receipt
    })
  }
  @Remote('status')
  async status(request: { scope: string; surfaceId: string }, signal: AbortSignal): Promise<HumanResult> {
    return this.result(async () => (await this.use(signal)).status(request.scope, request.surfaceId))
  }
}

function disabled(): Error & { code: string } {
  return Object.assign(new Error('此节点尚未启用测试卡片功能'), { code: 'human-tools-disabled' })
}

function originUnavailable(): Error & { code: string } {
  return Object.assign(new Error('无法确认原会话身份，请在电脑端确认会话仍然存在后重试'), { code: 'human-origin-unavailable' })
}

function headerGeneration(header: unknown, scope: string): string {
  if (!object(header) || header.id !== scope || !Number.isSafeInteger(header.createdAt) || Number(header.createdAt) < 0) throw originUnavailable()
  return String(header.createdAt)
}

function waitForReady<T>(ready: Promise<T>, signal: AbortSignal): Promise<T> {
  signal.throwIfAborted()
  return new Promise((resolve, reject) => {
    const cleanup = () => signal.removeEventListener('abort', abort)
    const abort = () => { cleanup(); reject(signal.reason) }
    signal.addEventListener('abort', abort, { once: true })
    ready.then(value => { cleanup(); resolve(value) }, cause => { cleanup(); reject(cause) })
    if (signal.aborted) abort()
  })
}
