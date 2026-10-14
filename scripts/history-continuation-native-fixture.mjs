/** Runs only inside test-history-continuation-native's isolated ASAR extraction. */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'
import { randomUUID, createHash } from 'node:crypto'

export async function verifyHistoryContinuation(work) {
  let forbiddenNetworkCalls = 0
  const forbidNetwork = async () => { forbiddenNetworkCalls++; throw Error('No network is allowed in this fixture') }
  globalThis.fetch = forbidNetwork
  const anchor = path.join(work, 'dsh/node_modules/@deepseek-ai/dsh/package.json')
  const require = createRequire(anchor), load = name => import(pathToFileURL(require.resolve(name)).href)
  const packedProduct = process.env.HARNESS_HISTORY_CONTINUATION_PACKAGE
  const productRoot = path.join(work, packedProduct ? 'dsh/node_modules/dsh-wechat-remote/native/lib/history-import'
    : 'dsh/node_modules/@harness-remote/dsh-wechat-remote/lib/history-import')
  const product = await import(pathToFileURL(path.join(productRoot, 'continuation-preset.js')).href)
  const definition = product.historyContinuationDefinition({
    compactionModule: pathToFileURL(path.join(productRoot, 'continuation-compaction.js')).href,
  })
  assert.equal(definition.id, product.HISTORY_CONTINUATION_ID)
  const actualDefinition = product.historyContinuationDefinition()
  const resolvedCompactionModule = actualDefinition.plugins.find(row => row.id === 'compaction').config[0].name
  assert.equal(resolvedCompactionModule, packedProduct ? 'dsh-wechat-remote/history-import/compaction'
    : '@harness-remote/dsh-wechat-remote/history-import/compaction')
  const { Context } = await load('@deepseek-ai/cordis')
  const { default: Loader } = await load('@deepseek-ai/cordis-plugin-loader')
  const { default: Group } = await load('@deepseek-ai/cordis-plugin-group')
  const { default: Llm, LlmAdapter, LlmError, CONTEXT_WINDOW_EXCEEDED_CODE,
    createUserMessage, createAssistantMessage, createSystemMessage } = await load('@deepseek-ai/dsh-llm')
  const { default: SessionStore } = await load('@deepseek-ai/dsh-session')
  const { default: Projection } = await load('@deepseek-ai/dsh-session-projection')
  const { default: SystemPrompt, renderPrompt } = await load('@deepseek-ai/dsh-system-prompt')
  const { default: Tools } = await load('@deepseek-ai/dsh-tools')
  const { default: Agents } = await load('@deepseek-ai/dsh-agent')
  const { default: AgentLoop } = await load('@deepseek-ai/dsh-agent-loop')
  const { default: AgentPresets, serviceForAgent } = await load('@deepseek-ai/dsh-agent-preset-registry')
  const { default: AgentPreset } = await load('@deepseek-ai/dsh-agent-preset')
  const { default: JsonlPersistence } = await load('@deepseek-ai/dsh-session-persistence-jsonl')
  const { default: SessionQuery } = await load('@deepseek-ai/dsh-session-query')
  const { default: TokenMeter } = await load('@deepseek-ai/dsh-token-meter')
  const { default: Commands } = await load('@deepseek-ai/dsh-commands')
  const { default: Web } = await load('@deepseek-ai/dsh-web')
  const { default: Typert } = await load('@deepseek-ai/dsh-typert-registry')
  const { SessionController } = await load('@deepseek-ai/dsh-api-session-controller')
  const checks = []
  const firstUser = '用中文讨论阳台园艺，不作小说。预算2000元，每周只能花1小时。必须分清已知事实与假设。'
  const correction = '修正之前的约定：预算改为2300元，每周可以花2小时。后续以这次修正为准。'
  const summaryOutput = '用户继续用中文规划阳台园艺，须区分事实与假设。最新修正后的预算为2300元，每周可花2小时；旧2000元与1小时约定已失效。当前正在比较盆栽选择，尚未决定。'
  const reasoning = '公开的源网页思考文本；不代表隐藏运行状态。'
  const model = { provider: 'fixture', model: 'synthetic-model' }
  const messageText = row => row.content.map(block => block.text ?? '').join('\n')
  const requestText = request => request.messages.map(messageText).join('\n')
  const user = text => createUserMessage({ content: [{ type: 'text', text }], source: { kind: 'user' } })
  class CaptureAdapter extends LlmAdapter {
    constructor(inHistory) { super(); this.inHistory = inHistory; this.requests = []; this.window = 1_000_000; this.overflowNext = false }
    async resolveModel(provider, id) {
      return { provider, id, name: id, context: { contextWindow: this.window }, inputModalities: ['text'],
        ...(this.inHistory ? { systemPromptUpdate: 'in-history' } : {}) }
    }
    async *stream(request) {
      this.requests.push({ ...request, messages: structuredClone(request.messages), tools: structuredClone(request.tools ?? []) })
      if (this.summaryFailure && request.purpose === 'compaction')
        throw new LlmError('Synthetic summary stream failure', 'SYNTHETIC_SUMMARY_FAILURE')
      if (this.overflowNext && request.purpose !== 'compaction') {
        this.overflowNext = false
        throw new LlmError('Synthetic provider context overflow', CONTEXT_WINDOW_EXCEEDED_CODE)
      }
      const text = request.purpose === 'compaction'
        ? summaryOutput
        : '合成回答：继续之前的讨论；未请求真实模型。'
      yield { type: 'block-start', index: 0, blockType: 'text' }
      yield { type: 'text-delta', index: 0, text }
      yield { type: 'block-end', index: 0, block: { type: 'text', text } }
      yield { type: 'finish', reason: { kind: 'stop' } }
    }
  }
  function seedHistory(long = false) {
    const events = []
    const append = (type, data, surface = false) => events.push({ type, data, seq: events.length, time: 1000 + events.length,
      ...(surface ? { surfaceOp: 'append' } : {}) })
    const turns = long ? 10 : 1
    for (let turn = 1; turn <= turns; turn++) {
      append('turn/start', { turn }); append('step/start', { turn, step: 1 })
      if (turn === 1) append('system/message', { turn, step: 1, message: createSystemMessage('') }, true)
      append('user/message', user(turn === 1 ? firstUser : `${turn === 2 ? correction : ''}第${turn}轮：比较光照和浇水。${'已有园艺事实。'.repeat(long ? 1200 : 0)}`), true)
      append('assistant/message', { turn, step: 1, stream: [], message: createAssistantMessage({
        source: { provider: 'source-web', model: 'source-unknown' }, content: [
          ...(turn === 1 ? [{ type: 'reasoning', text: reasoning }] : []),
          { type: 'text', text: `源网页第${turn}轮完整答复。${'比较可选植物。'.repeat(long ? 1200 : 0)}` },
        ],
      }) }, true)
      append('step/end', { turn, step: 1 }); append('turn/end', { turn, reason: { kind: 'completed' } })
    }
    return events
  }
  async function harness(root, inHistory, withContinuation = true) {
    const ctx = new Context()
    ctx.baseUrl = pathToFileURL(path.join(work, 'dsh/')).href
    await ctx.plugin(Loader); ctx.loader.builtins.group = Group
    for (const plugin of [Llm, SessionStore, Projection, SystemPrompt, Tools, Agents, TokenMeter, Commands, Web, Typert]) await ctx.plugin(plugin)
    await ctx.plugin(JsonlPersistence, { root, compression: 'none' })
    await ctx.plugin(SessionQuery)
    const adapter = new CaptureAdapter(inHistory)
    ctx.llm.registerAdapter(['fixture'], adapter)
    ctx.provide('agentDefaultModel', { currentSelection: () => model })
    ctx.provide('attachments', { admitPromptContent: async content => structuredClone(content),
      imageLimits: { maxImageBytes: 1, maxImagesPerMessage: 1, maxMessageImageBytes: 1,
        maxImagePixels: 1, maxImageDimension: 1, mediaTypes: [] } })
    ctx.provide('fileUploads', { registerAgentResolver: () => () => {} })
    ctx.provide('workspaceRegistry', { archivedSessionIds: [], list: () => [{ id: 'synthetic-workspace', path: work }],
      get: id => id === 'synthetic-workspace' ? { id, path: work, attachSession: async () => {} } : undefined })
    ctx.provide('fs', { resolve() { assert.fail('no file tools may execute') } })
    await ctx.plugin(AgentLoop, { agents: [] })
    const controller = new SessionController(ctx, {})
    await ctx.plugin(AgentPresets, { default: 'standard' })
    await ctx.plugin(AgentPreset, { id: 'standard', name: 'Synthetic independent native preset', plugins: [
      { id: 'persona', name: '@deepseek-ai/dsh-persona', config: { prefix: 'Independent native mode remains unchanged.' } },
    ] })
    const continuationOwner = withContinuation ? await ctx.plugin(product.default) : undefined
    if (withContinuation) assert.equal((await ctx.agentPresets.resolve(definition.id)).broken, undefined)
    assert.equal(ctx.agentPresets.defaultId, 'standard')
    assert.equal(ctx.get('compaction'), undefined, 'preset compaction must not become the global service')
    assert.deepEqual(ctx.tools.schemas().map(row => row.name), [], 'preset tools must not leak globally')
    return { ctx, controller, adapter, continuationOwner }
  }
  async function createImported(h, id, seed) {
    const handle = await h.ctx.agents.create({ sessionId: id, seed,
      meta: { cwd: work, delegationDepth: 0, agentPreset: definition.id }, agentOptions: model,
      setup: async agentCtx => { await h.ctx.agentPresets.mount(agentCtx, definition.id) },
    })
    assert.equal(h.ctx.agentPresets.composedPreset(handle.agent.ctx), definition.id)
    const prompt = renderPrompt(await h.ctx.systemPrompt.assemble({ scope: handle.agent }))
    assert(!/coding agent|software engineer|Your working directory is/i.test(prompt), 'preset must not inherit coding persona/cwd')
    assert(!prompt.includes(firstUser), 'source user settings are not root system instructions')
    assert.deepEqual(h.ctx.tools.schemas(handle.agent).map(row => row.name).sort(), ['web_fetch', 'web_search'])
    assert(serviceForAgent(h.ctx, handle.agent, 'compaction'), 'real isolated native compaction must mount')
    await handle.agent.whenIdle()
    await handle.dispose()
  }
  for (const inHistory of [false, true]) {
    const root = path.join(work, `sessions-${inHistory}`), id = `continuation-${inHistory}`, seed = seedHistory()
    let h = await harness(root, inHistory)
    try { await createImported(h, id, seed) } finally { await h.ctx.fiber.dispose() }
    h = await harness(root, inHistory)
    try {
      assert.equal(h.ctx.agents.get(id), undefined, 'cold restore starts with no loaded agent')
      const result = await h.controller.create({ sessionId: id, workspaceId: 'synthetic-workspace' })
      const agent = h.ctx.agents.get(result.sessionId)
      assert.equal(result.agentPreset, definition.id)
      assert.equal(h.ctx.agentPresets.composedPreset(agent.ctx), definition.id, 'controller must remount durable preset')
      assert.deepEqual(agent.session.snapshotEvents().slice(0, seed.length), seed, 'cold restore preserves imported event identity/order')
      agent.followup(user('第一次继续：列出下一步。')); await agent.whenIdle()
      assert.equal(h.adapter.requests.length, 1)
      const first = h.adapter.requests[0]
      assert(requestText(first).includes(firstUser)); assert(requestText(first).includes(reasoning))
      assert.deepEqual(first.tools.map(row => row.name).sort(), ['web_fetch', 'web_search'])
      assert(!first.messages.filter(row => row.role === 'system').some(row => messageText(row).includes(firstUser)))
      assert.equal(first.messages.findIndex(row => row.role === 'system'), inHistory ? 2 : 0)
      const systemCount = agent.session.snapshotEvents().filter(row => row.type === 'system/message').length
      agent.followup(user('第二次继续：比较两种方案。')); await agent.whenIdle()
      assert.equal(h.adapter.requests.length, 2)
      assert.equal(agent.session.snapshotEvents().filter(row => row.type === 'system/message').length, systemCount)
      assert(requestText(h.adapter.requests[1]).includes(firstUser))
      assert(!agent.session.snapshotEvents().some(row => row.type.startsWith('compaction/')))
      const standard = await h.controller.create({ workspaceId: 'synthetic-workspace', agentPreset: 'standard' })
      assert.deepEqual(h.ctx.tools.schemas(h.ctx.agents.get(standard.sessionId)).map(row => row.name), [])
      checks.push({ scenario: `native-preset-cold-resume-${inHistory ? 'in-history' : 'leading-only'}`,
        firstRoles: first.messages.map(row => row.role), secondRoles: h.adapter.requests[1].messages.map(row => row.role),
        tools: first.tools.map(row => row.name), originalSettingsAndPublishedReasoningRetained: true,
        otherPresetAndDefaultUnchanged: true })
    } finally { await h.ctx.fiber.dispose() }
  }
  const root = path.join(work, 'long-sessions'), id = 'continuation-long'
  let h = await harness(root, true)
  const longSeed = seedHistory(true)
  try { await createImported(h, id, longSeed) } finally { await h.ctx.fiber.dispose() }
  h = await harness(root, true)
  try {
    await h.controller.create({ sessionId: id, workspaceId: 'synthetic-workspace' })
    const agent = h.ctx.agents.get(id)
    agent.followup(user('继续讨论，遵守修正后的预算和时间约定。')); await agent.whenIdle()
    const engine = serviceForAgent(h.ctx, agent, 'compaction')
    const compacted = await engine.compactNow(agent, new AbortController().signal)
    assert(compacted, 'long synthetic history must have a valid native compaction region')
    const summaries = agent.session.snapshotEvents().filter(row => row.type === 'compaction/summary')
    assert.equal(summaries.length, 1)
    const summaryCalls = h.adapter.requests.filter(row => row.purpose === 'compaction')
    assert.equal(summaryCalls.length, 1, 'product hook must call native llm seam exactly once')
    assert(!/compaction engine for this AI coding assistant|Write concise English engineering prose/.test(requestText(summaryCalls[0])))
    assert(requestText(summaryCalls[0]).includes(firstUser), 'summary input retains the original user request')
    assert(requestText(summaryCalls[0]).includes(correction), 'summary input also retains later user corrections')
    const active = agent.session.deriveMessages()
    assert(active.some(row => row.role === 'user' && messageText(row).includes(summaryOutput)),
      'the returned neutral summary must land in the actual native user checkpoint')
    assert(!active.filter(row => row.role === 'system').some(row => messageText(row).includes(firstUser)), 'no fabricated root system copy')
    assert.deepEqual(agent.session.snapshotEvents().slice(0, longSeed.length), longSeed, 'compaction keeps original durable evidence')
    agent.followup(user('压缩后继续：给我可执行的选择。')); await agent.whenIdle()
    assert(requestText(h.adapter.requests.at(-1)).includes('2300'))
    checks.push({ scenario: 'long-history-native-manual-compaction', summaries: 1,
      originalRequestAndCorrectionPresentInSummaryInput: true, returnedSummaryRetainedInNativeUserCheckpoint: true,
      nativeTransactionAndOriginalEventsPreserved: true, automaticPressureTriggerTested: false,
      realModelSemanticFidelityTested: false })
  } finally { await h.ctx.fiber.dispose() }
  h = await harness(root, true)
  try {
    await h.controller.create({ sessionId: id, workspaceId: 'synthetic-workspace' })
    const agent = h.ctx.agents.get(id)
    assert.equal(h.ctx.agentPresets.composedPreset(agent.ctx), definition.id)
    agent.followup(user('重新打开后继续讨论。')); await agent.whenIdle()
    assert.equal(h.adapter.requests.length, 1)
    assert(requestText(h.adapter.requests[0]).includes(summaryOutput), 'native checkpoint survives a second cold restore')
    assert(!h.adapter.requests[0].messages.filter(row => row.role === 'system').some(row => messageText(row).includes(firstUser)))
    checks.push({ scenario: 'native-checkpoint-cold-resume', returnedSummaryRetained: true,
      presetRemounted: true, rootSystemCopyCreated: false })
  } finally { await h.ctx.fiber.dispose() }
  for (const scenario of ['pressure', 'overflow']) {
    h = await harness(path.join(work, `automatic-${scenario}`), true)
    try {
      const sessionId = `continuation-automatic-${scenario}`
      await createImported(h, sessionId, seedHistory(true))
      await h.controller.create({ sessionId, workspaceId: 'synthetic-workspace' })
      const agent = h.ctx.agents.get(sessionId)
      if (scenario === 'pressure') {
        agent.followup(user('先继续，建立该会话的原生请求路由。')); await agent.whenIdle()
        assert.equal(h.adapter.requests.length, 1)
        h.adapter.window = 100_000
      } else h.adapter.overflowNext = true
      agent.followup(user('请按最新修正继续。')); await agent.whenIdle()
      const summaryCalls = h.adapter.requests.filter(row => row.purpose === 'compaction')
      assert(summaryCalls.length >= 1, `${scenario} must invoke the original native automatic compaction hook`)
      assert(requestText(summaryCalls[0]).includes(firstUser)); assert(requestText(summaryCalls[0]).includes(correction))
      const last = h.adapter.requests.at(-1)
      assert.notEqual(last.purpose, 'compaction')
      assert(requestText(last).includes(summaryOutput))
      assert.deepEqual(last.tools.map(row => row.name).sort(), ['web_fetch', 'web_search'])
      assert(agent.session.snapshotEvents().some(row => row.type === 'compaction/summary'))
      checks.push({ scenario: `native-automatic-compaction-${scenario}`, summaryCalls: summaryCalls.length,
        originalAndCorrectedConstraintsPresent: true, continuedFromNativeCheckpoint: true,
        syntheticProvider: true, realModelSemanticFidelityTested: false })
    } finally { await h.ctx.fiber.dispose() }
  }
  h = await harness(path.join(work, 'failed-compaction'), true)
  try {
    const sessionId = 'continuation-failed-compaction', seed = seedHistory(true)
    await createImported(h, sessionId, seed)
    await h.controller.create({ sessionId, workspaceId: 'synthetic-workspace' })
    const agent = h.ctx.agents.get(sessionId)
    agent.followup(user('继续，准备合成摘要失败测试。')); await agent.whenIdle()
    const originalSurface = structuredClone(agent.session.deriveMessages())
    h.adapter.summaryFailure = true
    const engine = serviceForAgent(h.ctx, agent, 'compaction')
    await assert.rejects(engine.compactNow(agent, new AbortController().signal))
    assert(h.adapter.requests.some(row => row.purpose === 'compaction'), 'failure must happen inside the real summary lifecycle')
    assert.deepEqual(agent.session.deriveMessages(), originalSurface, 'failed summary must not replace the active history')
    const events = agent.session.snapshotEvents()
    assert(!events.some(row => row.type === 'compaction/summary'))
    assert(events.some(row => row.type === 'compaction/end' && row.data.error), 'failed native transaction must close with an error')
    assert.deepEqual(events.slice(0, seed.length), seed)
    checks.push({ scenario: 'native-summary-failure-preserves-history', activeSurfaceUnchanged: true,
      checkpointCreated: false, originalEventsRetained: true, nativeFailureTransactionClosed: true })
  } finally { await h.ctx.fiber.dispose() }
  h = await harness(path.join(work, 'declaration-disposal'), false)
  try {
    await h.continuationOwner.dispose()
    await assert.rejects(h.ctx.agentPresets.resolve(definition.id), { code: 'agent-preset/not-found' })
    assert.equal(h.ctx.agentPresets.defaultId, 'standard')
    assert.deepEqual(h.ctx.tools.schemas().map(row => row.name), [])
    assert.equal(h.ctx.get('compaction'), undefined)
    checks.push({ scenario: 'product-declaration-disposal', nativeRegistrationWithdrawn: true, otherDefaultUnchanged: true })
  } finally { await h.ctx.fiber.dispose() }
  // Exercise the public import service's actual constructor/inject ownership,
  // not merely the standalone declaration's Service.init registration.
  h = await harness(path.join(work, 'service-disposal'), false, false)
  try {
    const { WechatImportService } = await import(pathToFileURL(path.join(productRoot, 'service.js')).href)
    await assert.rejects(h.ctx.agentPresets.resolve(definition.id), { code: 'agent-preset/not-found' })
    const serviceOwner = await h.ctx.plugin({
      name: 'synthetic-import-service-owner',
      apply(owner) { new WechatImportService(owner, { receiptDirectory: path.join(work, 'synthetic-receipts') }) },
    })
    await h.ctx.loader.await()
    assert.equal((await h.ctx.agentPresets.resolve(definition.id)).broken, undefined)
    assert.equal(h.ctx.agentPresets.defaultId, 'standard')
    assert.deepEqual(h.ctx.tools.schemas().map(row => row.name), [])
    await serviceOwner.dispose()
    await assert.rejects(h.ctx.agentPresets.resolve(definition.id), { code: 'agent-preset/not-found' })
    assert.equal(fs.existsSync(path.join(work, 'synthetic-receipts')), false, 'registration/unload must not create import data')
    checks.push({ scenario: 'actual-import-service-parent-disposal', injectedNativePresetRegistered: true,
      parentUnloadWithdrawsPreset: true, defaultAndGlobalToolsUnchanged: true, receiptsCreated: false })
  } finally { await h.ctx.fiber.dispose() }

  // Product importer -> real durable session/controller -> actual DeepSeek
  // Anthropic-compatible serializer. fetch is captured and immediately fails;
  // this verifies the request envelope, not remote API acceptance/semantics.
  const { buildNativeImportSeed } = await import(pathToFileURL(path.join(productRoot, 'native.js')).href)
  const { DeepSeekAdapter, resolveAdapterOptions } = await load('@deepseek-ai/dsh-llm-deepseek')
  const sourceMessages = [
    { id: 'u1', parentId: null, role: 'user', text: firstUser, reasoning: '', fragments: [], metadata: {}, warnings: [] },
    { id: 'a1', parentId: 'u1', role: 'assistant', text: '源网页最后答复。', reasoning: '', metadata: {}, warnings: [], fragments: [
      { type: 'THINK', content: 'THINK BEFORE SEARCH\n', data: {} },
      { type: 'TOOL_SEARCH', content: '原网页检索', data: { id: 1, status: 'FINISHED', queries: [{ query: 'synthetic balcony plants' }],
        results: [{ url: 'https://example.org/garden', title: 'Synthetic garden', snippet: 'Original garden search excerpt.' }] } },
      { type: 'THINK', content: 'THINK AFTER SEARCH\n', data: {} },
      { type: 'TOOL_OPEN', data: { id: 2, status: 'FINISHED', result: { url: 'https://example.org/garden', title: 'Synthetic garden',
        snippet: 'Original opened page excerpt.' }, reference: { id: 1, type: 'TOOL_SEARCH' } } },
      { type: 'RESPONSE', content: '源网页最后答复。', data: {} },
    ] },
  ]
  let capturedWireRequests = 0
  for (const inHistory of [false, true]) {
    const root = path.join(work, `wire-${inHistory}`), sessionId = `session-dsimport-${randomUUID()}`
    const seed = buildNativeImportSeed({ sessionId, workspaceId: 'synthetic-workspace', sourceHash: 'a'.repeat(64),
      presetId: definition.id, conversation: { id: 'synthetic-source', title: 'Synthetic source', messages: sourceMessages,
        leafIds: ['a1'], warnings: [] } }, 1000)
    h = await harness(root, inHistory)
    try { await createImported(h, sessionId, seed) } finally { await h.ctx.fiber.dispose() }
    h = await harness(root, inHistory)
    try {
      await h.controller.create({ sessionId, workspaceId: 'synthetic-workspace' })
      const agent = h.ctx.agents.get(sessionId)
      agent.followup(user('继续这个网页讨论。')); await agent.whenIdle()
      assert.equal(h.adapter.requests.length, 1)
      let wire
      globalThis.fetch = async (url, init) => {
        assert.equal(String(url), 'https://history-fixture.invalid/anthropic/v1/messages')
        assert.equal(init.method, 'POST')
        capturedWireRequests++
        wire = JSON.parse(init.body)
        throw Error('Request envelope captured locally; network deliberately blocked')
      }
      const adapter = new DeepSeekAdapter({
        options: () => resolveAdapterOptions({ baseURL: 'https://history-fixture.invalid/anthropic',
          models: [{ id: 'synthetic-wire-model', ...(inHistory ? { systemPromptUpdate: 'in-history' } : {}) }] }),
        resolveAuth: async () => ({ headers: {} }), resolveUserId: () => 'synthetic-fixture-user',
        prepareExtensions: async () => ({ fields: {}, accept: async () => {} }),
      })
      try {
        await assert.rejects(async () => {
          for await (const event of adapter.stream({ ...h.adapter.requests[0], model: 'synthetic-wire-model' })) void event
        })
      } finally { globalThis.fetch = forbidNetwork }
      assert(wire, 'actual native adapter must reach the captured request boundary')
      assert.deepEqual(wire.tools.map(row => row.name).sort(), ['web_fetch', 'web_search'])
      const sequence = wire.messages.flatMap(message => message.content.map(block => ({ role: message.role, ...block })))
      const before = sequence.findIndex(block => block.type === 'thinking' && block.thinking === 'THINK BEFORE SEARCH\n')
      const search = sequence.findIndex(block => block.type === 'tool_use' && block.name === 'web_search')
      const searchResult = sequence.findIndex(block => block.type === 'tool_result' && block.tool_use_id === sequence[search]?.id)
      const after = sequence.findIndex(block => block.type === 'thinking' && block.thinking === 'THINK AFTER SEARCH\n')
      const open = sequence.findIndex(block => block.type === 'tool_use' && block.name === 'web_fetch')
      const openResult = sequence.findIndex(block => block.type === 'tool_result' && block.tool_use_id === sequence[open]?.id)
      const answer = sequence.findIndex(block => block.type === 'text' && block.text === '源网页最后答复。')
      const continuation = sequence.findIndex(block => block.type === 'text' && block.text === '继续这个网页讨论。')
      const indices = [before, search, searchResult, after, open, openResult, answer, continuation]
      assert(indices.every((index, at) => index >= 0 && (!at || index > indices[at - 1])), 'source THINK/search/open/answer order must survive wire serialization')
      assert.deepEqual(sequence[search].input, { queries: ['synthetic balcony plants'] })
      assert.deepEqual(sequence[open].input, { url: 'https://example.org/garden' })
      assert.match(JSON.stringify(sequence[searchResult].content), /Original garden search excerpt/)
      assert.match(JSON.stringify(sequence[openResult].content), /Original opened page excerpt/)
      assert(!sequence[before].signature && !sequence[after].signature, 'source thinking has no fabricated provider signature')
      checks.push({ scenario: `actual-deepseek-wire-${inHistory ? 'in-history' : 'leading-only'}`,
        transport: 'Anthropic-compatible /v1/messages', chronologicalThinkingAndClosedToolCycles: true,
        originalToolArgumentsAndExcerptsRetained: true, providerSignatureFabricated: false,
        externalApiAcceptanceTested: false })
    } finally { globalThis.fetch = forbidNetwork; await h.ctx.fiber.dispose() }
  }
  assert.equal(forbiddenNetworkCalls, 0)
  console.log(JSON.stringify({ passed: true, nativeVersion: JSON.parse(fs.readFileSync(anchor)).version,
    productLayout: packedProduct ? 'packed-dsh-wechat-remote/native' : 'core-checkout-copy', resolvedCompactionModule,
    ...(packedProduct ? { archiveSha256: createHash('sha256').update(fs.readFileSync(packedProduct)).digest('hex') } : {}),
    realNetworkRequests: 0, capturedWireRequests, realModelRequests: 0, liveProfilesTouched: false, checks }, null, 2))
}
