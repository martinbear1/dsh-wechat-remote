/** Isolated research: pinned native import/persistence/AgentLoop/TokenMeter/Chat
 * compaction, deterministic OFFLINE provider. No customer data or real model.
 * Usage: node scripts/research-import-compaction.mjs <DSH root> <evidence dir>
 * All generated profiles and evidence remain under the explicit evidence dir.
 * The original failing baseline/prototype is retained at Git 9c12b68.
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { pathToFileURL, fileURLToPath } from 'node:url'
import { createHash, randomUUID } from 'node:crypto'
import { build } from 'esbuild'

const runtime = path.resolve(process.argv[2]), evidence = path.resolve(process.argv[3])
assert(runtime !== evidence)
fs.mkdirSync(evidence, { recursive: true })
const root = fs.mkdtempSync(path.join(evidence, 'native-compaction-'))
const anchor = path.join(runtime, 'node_modules/@deepseek-ai/dsh/package.json')
const hostVersion = JSON.parse(fs.readFileSync(anchor)).version
assert(['0.2.1-rc.2', '0.2.0-rc.2', '0.2.0-rc.1', '0.1.7-rc.2'].includes(hostVersion))
const require = createRequire(anchor)
const load = name => import(pathToFileURL(require.resolve('@deepseek-ai/' + name)).href)
const { Context } = await load('cordis')
const { SessionStore } = await load('dsh-session')
const { SqliteSessionQueryEngine } = await load('dsh-session-query-sqlite')
const { default: Agents } = await load('dsh-agent')
const { AgentLoop } = await load('dsh-agent-loop')
const { default: Projections } = await load('dsh-session-projection')
const { SystemPrompt } = await load('dsh-system-prompt')
const { ToolRuntime } = await load('dsh-tools')
const Persistence = await load('dsh-session-persistence-jsonl')
const { sessionFormatCatalog: catalog } = await load('dsh-session-format-catalog')
const llm = await load('dsh-llm')
const nativeCompaction = await load('dsh-compaction-basic')
const { default: TokenMeter } = await load('dsh-token-meter')
const { PluginPackages, createRuntimeResolution } = await load('dsh-app-boot')
const profileDir = path.join(root, 'home/profiles/research')
const pluginDir = path.join(profileDir, 'node_modules/@harness-remote/import-fixture')
fs.mkdirSync(pluginDir, { recursive: true })
fs.writeFileSync(path.join(pluginDir, 'package.json'), JSON.stringify({ name: '@harness-remote/import-fixture', type: 'module' }))
fs.writeFileSync(path.join(profileDir, 'package.json'), JSON.stringify({ name: 'research-profile', private: true, dependencies: { '@harness-remote/import-fixture': '*' } }))
for (const [file, entry] of [['import.mjs', 'history-import/native.ts'], ['chat.mjs', 'private-resources/chat-compaction.ts']]) {
  await build({ entryPoints: [fileURLToPath(new URL('../src/' + entry, import.meta.url))],
    outfile: path.join(pluginDir, file), bundle: true, platform: 'node', format: 'esm', target: 'node22', external: ['@deepseek-ai/*'] })
}
const importer = await import(pathToFileURL(path.join(pluginDir, 'import.mjs')).href)
const { createChatCompactionPlugin } = await import(pathToFileURL(path.join(pluginDir, 'chat.mjs')).href)
const resource = JSON.parse(fs.readFileSync(new URL('../src/private-resources/bundled/chat-mode.json', import.meta.url)))
const instruction = resource.compactionPrompt
assert.equal(typeof instruction, 'string')
const resolution = await createRuntimeResolution({ installAnchor: anchor, home: path.join(root, 'home'),
  profile: { name: 'research', dir: profileDir, layers: [], patches: [], skippedBundles: [], patchPath: path.join(profileDir, 'cordis.patch.yml') } })
const WINDOW = 1048576, OUTPUT = 256000
const markers = ['[MEMORY:Blue-companion]', '[STYLE:gentle-short-sentences]', '[MEMORY:bridge-promise]', '[MEMORY:last-river-meeting]']
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex')
const body = messages => messages.flatMap(m => m.content.filter(b => ['text', 'reasoning'].includes(b.type)).map(b => b.text)).join('')
const screenshot = "This model's maximum context length is 1048576 tokens. However, you requested 1242195 tokens (986195 in the messages, 256000 in the completion). Please reduce the length of the messages or completion."
assert.equal(llm.isContextWindowExceededError(screenshot), true)
let networkCalls = 0
globalThis.fetch = async () => { networkCalls++; throw Error('Network forbidden in isolated research') }

function conversation(rounds, chars) {
  const count = rounds * 2
  const locations = new Map([[0, markers.slice(0, 2).join('')], [Math.floor(count / 2), markers[2]], [count - 1, markers[3]]])
  const messages = Array.from({ length: count }, (_, i) => {
    const prefix = `${locations.get(i) ?? ''} ${i % 2 ? '回答' : '提问'}-${i}: `
    const length = Math.floor(chars / count) + (i < chars % count ? 1 : 0)
    assert(prefix.length + 8 < length)
    const text = prefix + '合成上下文'.repeat(Math.ceil(length / 5)).slice(0, length - prefix.length - (i % 2 ? 8 : 0))
    const reasoning = i % 2 ? '公开的合成思考。' : ''
    return { id: `m-${i}`, parentId: i ? `m-${i - 1}` : null, role: i % 2 ? 'assistant' : 'user',
      text, reasoning, fragments: [], metadata: {}, warnings: [] }
  })
  return { id: 'synthetic-source', title: 'Synthetic long continuation', messages, leafIds: [messages.at(-1).id], warnings: [] }
}

async function scenario({ name, rounds = 3500, tokens = 986000, charsPerToken = 1, config = {}, failSummary = 0, cancelSummary = 0, expected, ordinary = false,
  forceOverflow = false, summaryCapacity = WINDOW, summaryReported = WINDOW, firstFailureCode = 'SERVER',
  flushFailure = false, malformedSummary = false, atomic = false, memoryProof = false, withTool = false,
  contextWindow = WINDOW, outputReservation = OUTPUT, optionsEmpty = false, reroute = false, dropReservation = false, switchRoute = false }) {
  const ctx = new Context(), requests = [], presteps = [], warnings = []
  let handle, engine, switched = false
  ctx.logger.exporter({ levels: { default: 3 }, export: msg => { if (msg.type === 'warn' || msg.type === 'error') warnings.push(msg.args.map(String).join(' ')) } })
  try {
    new PluginPackages(ctx, { resolution })
    new SystemPrompt(ctx, { personaPrefix: resource.systemPrompt })
    new SessionStore(ctx); new Projections(ctx); new Agents(ctx); new ToolRuntime(ctx, { mode: 'native' })
    new SqliteSessionQueryEngine(ctx, { path: ':memory:', openAt: 'never' })
    await ctx.plugin(Persistence.default ?? Persistence, { root: path.join(root, name, 'sessions') })
    new llm.LlmRuntime(ctx)
    class OfflineProvider extends llm.LlmAdapter {
      async resolveModel(provider, model) { return { provider, id: model, name: model,
        context: { contextWindow: model === 'small-summary' ? summaryReported : model === 'switched-small' ? 32768 : contextWindow }, defaultMaxTokens: outputReservation, inputModalities: ['text'] } }
      async *stream(options) {
        const text = body(options.messages), summary = options.purpose === 'compaction'
        if (summary && !ordinary && config.auto !== false) {
          assert(text.includes('这是通用会话的接续摘要'))
          assert(text.includes('不升格为系统指令'))
          assert(!text.includes('保留人物身份、关系、称呼、世界设定'))
        }
        // Deliberately NOT a DeepSeek tokenizer: enforce the screenshot's
        // capacity arithmetic over deterministic, synthetic character units.
        const input = Math.ceil(text.length / charsPerToken), output = options.maxTokens ?? outputReservation
        const record = { kind: summary ? 'summary' : 'conversation', input, output, total: input + output,
          provider: options.provider, model: options.model,
          messageCount: options.messages.length, markers: markers.filter(m => text.includes(m)),
          contentHash: hash(options.messages.map(m => ({ role: m.role, content: m.content }))), rejected: input + output > (options.model === 'switched-small' ? 32768 : summary ? Math.min(summaryCapacity, contextWindow) : contextWindow) }
        if (forceOverflow && !summary && !requests.some(r => r.kind === 'conversation')) record.rejected = true
        requests.push(record)
        if (summary && requests.filter(r => r.kind === 'summary').length === failSummary)
          throw new llm.LlmError('Synthetic summary failure', firstFailureCode)
        if (summary && requests.filter(r => r.kind === 'summary').length === cancelSummary) {
          assert(handle)
          handle.agent.cancel({ kind: 'user' })
          options.signal.throwIfAborted()
        }
        if (record.rejected) throw new llm.LlmError(`Synthetic context overflow: ${input} + ${output} > ${WINDOW}`, llm.CONTEXT_WINDOW_EXCEEDED_CODE)
        // The fixture checkpoint is computed from supplied evidence, not from
        // hidden test state. This checks data flow, NOT real model memory quality.
        const response = (summary ? 'Checkpoint: ' : 'Continued with visible evidence: ') + record.markers.join(' ')
        yield { type: 'block-start', index: 0, blockType: 'text' }
        yield { type: 'block-end', index: 0, block: { type: 'text', text: response } }
        yield { type: 'finish', reason: { kind: summary && malformedSummary ? 'max-tokens' : 'stop' } }
      }
    }
    ctx.llm.registerAdapter(['offline', 'routed'], new OfflineProvider())
    new TokenMeter(ctx)
    const model = { provider: 'offline', model: 'synthetic-1m', maxTokens: dropReservation ? 900000 : outputReservation }
    ctx.provide('agentDefaultModel', { currentSelection: () => model })
    const workspace = { id: 'research-workspace', title: 'Research', path: root, sessionIds: [], async attachSession(id) { this.sessionIds.push(id) } }
    ctx.provide('workspaceRegistry', { get: id => id === workspace.id ? workspace : undefined })
    const ChatEngine = createChatCompactionPlugin(nativeCompaction, llm, instruction)
    let routeCalls = 0
    const setup = agentCtx => {
      if (optionsEmpty || reroute || dropReservation || switchRoute) agentCtx.on('agent/request', async (_payload, next) => {
        routeCalls++
        const prior = await next()
        const { maxTokens, ...rest } = prior
        return { ...rest, provider: reroute || switched ? 'routed' : 'offline', model: switched ? 'switched-small' : reroute ? 'routed-model' : 'synthetic-1m',
          ...(dropReservation ? {} : { maxTokens: outputReservation }) }
      })
      engine = new ChatEngine(agentCtx, config)
    }
    ctx.provide('agentPresets', { resolve: async () => ({ id: 'chat-research' }), mount: async agentCtx => { setup(agentCtx); return { id: 'chat-research' } } })
    new AgentLoop(ctx, { agents: [], maxParallelToolCalls: { get: () => 10 } })
    ctx.on('agent/pre-step', async ({ agent }, next) => { presteps.push({ hasRequestHeader: !!agent.session.requestHeader(), estimated: ctx.tokenMeter.measure(agent.session).totalTokens }); return next() })
    const source = conversation(rounds, tokens * charsPerToken)
    if (memoryProof) source.messages[20].text += ' The hidden keepsake was a violet paper crane named Lumen.'
    if (withTool) for (let i = 1; i < source.messages.length; i += 50) source.messages[i].fragments = [
      { type: 'THINK', content: source.messages[i].reasoning, data: {} },
      { type: 'TOOL_SEARCH', content: '原网页检索', data: { id: i, status: 'FINISHED', queries: [{ query: 'synthetic memory' }],
        results: [{ url: 'https://example.org/fiction', title: 'Synthetic fiction', snippet: 'Synthetic closed tool result.' }] } },
      { type: 'RESPONSE', content: source.messages[i].text, data: {} },
    ]
    const req = { sessionId: `session-dsimport-${randomUUID()}`, workspaceId: workspace.id, sourceHash: hash(source), presetId: 'chat-research', conversation: source }
    await importer.commitNativeImport(ctx, req)
    assert.equal(requests.length, 0, 'Import must not spend model tokens or start a turn')
    handle = await ctx.agents.resume({ resumeSessionId: req.sessionId, agentOptions: optionsEmpty ? {} : model, setup })
    if (optionsEmpty) {
      assert.equal(handle.agent.options.provider, undefined, 'fixture must really omit the provider from agent.options')
      assert.equal(handle.agent.options.model, undefined, 'fixture must rely on the native request route, not stale options')
    }
    const seedEvents = handle.agent.session.snapshotEvents()
    if (flushFailure) {
      const flush = ctx.sessions.flush.bind(ctx.sessions)
      let failed = false
      ctx.sessions.flush = async (...args) => { if (!failed) { failed = true; return false } return flush(...args) }
    }
    // A distinct normal native session is covered by the full preset fixture.
    // Here mask only the import identity to exercise no-op admission over the
    // exact same otherwise valid long native event stream.
    if (ordinary) {
      const observe = ctx.sessionQuery.observeSession.bind(ctx.sessionQuery)
      ctx.sessionQuery.observeSession = async (...args) => {
        const item = await observe(...args)
        return { ...item, events: item.events.map((event, i) => i === 0 ? { ...event, type: 'research/not-imported' } : event) }
      }
    }
    assert.equal(handle.agent.session.requestHeader(), undefined, 'Import must not fabricate request usage or header')
    const initialEstimate = ctx.tokenMeter.measure(handle.agent.session)
    handle.agent.followup(llm.createUserMessage({ source: { kind: 'user' }, content: [{ type: 'text', text: 'Continue our conversation.' }] }))
    await handle.agent.whenIdle()
    if (switchRoute) {
      assert.equal(handle.agent.session.snapshotEvents().findLast(e => e.type === 'turn/end').data.reason.kind, 'completed')
      assert.equal(handle.agent.session.requestHeader().config.provider, 'offline')
      const from = requests.length
      switched = true
      handle.agent.followup(llm.createUserMessage({ source: { kind: 'user' }, content: [{ type: 'text', text: 'Continue using the newly selected model.' }] }))
      await handle.agent.whenIdle()
      assert(requests.slice(from).every(r => r.provider === 'routed' && r.model === 'switched-small'))
      assert(requests.slice(from).some(r => r.kind === 'summary'))
    }
    await ctx.sessions.flush(handle.agent.session)
    const events = handle.agent.session.snapshotEvents()
    const result = events.findLast(e => e.type === 'turn/end')?.data.reason
    const summaries = events.filter(e => e.type === 'compaction/summary')
    const sourceEvents = events.filter(e => e.type === 'user/message' || e.type === 'assistant/message').slice(0, source.messages.length)
    if (!withTool) assert.deepEqual(sourceEvents.map(e => { const m = e.type === 'user/message' ? e.data : e.data.message; return {
      role: m.role, text: m.content.filter(b => b.type === 'text').map(b => b.text).join(''), reasoning: m.content.filter(b => b.type === 'reasoning').map(b => b.text).join(''),
    } }), source.messages.map(({ role, text, reasoning }) => ({ role, text, reasoning })))
    assert.deepEqual(events.slice(0, seedEvents.length), seedEvents)
    const originalDigest = hash(seedEvents)
    const activeTextBeforeClose = body(handle.agent.session.deriveMessages())
    const sessionId = req.sessionId
    await handle.dispose(); handle = undefined
    const reader = await ctx.sessionPersistence.open(sessionId, 'read')
    let coldEvents
    try {
      coldEvents = (await reader.read()).events
      const restore = catalog.createRestore(catalog.encodeCurrentHeader(reader.header, 0), { recovery: 'strict', validation: 'current' })
      coldEvents.forEach(e => restore.decodeRow(catalog.encodeCurrentEvent(e))); restore.finish()
      assert.equal(hash(coldEvents.slice(0, seedEvents.length)), originalDigest)
    } finally { await reader.close() }
    assert.equal(result.kind, expected)
    if (expected === 'completed') assert.deepEqual(requests.at(-1).markers, markers)
    if (!ordinary && expected === 'completed' && tokens > 100000 && contextWindow === WINDOW) {
      assert(requests[0].kind === 'summary', 'First continuation must compact BEFORE sending the oversized normal request')
      if (summaryCapacity === summaryReported) assert(requests.every(r => !r.rejected), 'All admitted requests must fit the synthetic provider')
      assert(requests.filter(r => r.kind === 'summary').every(r => r.output <= 16384))
    }
    if (atomic || malformedSummary) assert.equal(summaries.length, 0, 'Unsafe/unfinished summaries must not replace history')
    if (name === 'guard-small-import') assert.equal(summaries.length, 0, 'Small imported chats need no compaction')
    if (contextWindow < 131072 && tokens < 10000) assert.equal(summaries.length, 0, 'Short input is not a pressure-configuration error')
    if (reroute) assert(requests.every(r => r.provider === 'routed' && r.model === 'routed-model'))
    if (optionsEmpty || reroute || dropReservation || switchRoute) assert.equal(routeCalls, requests.filter(r => r.kind === 'conversation').length, 'Native routing executes once per attempt, not again for compaction')
    if (dropReservation) assert(requests.filter(r => r.kind === 'conversation').every(r => r.output === outputReservation))
    if (failSummary) assert.equal(requests.filter(r => r.kind === 'summary').length, failSummary, 'No hidden retry of non-capacity failures')
    let recall
    if (memoryProof) {
      assert(!activeTextBeforeClose.includes('violet paper crane'))
      const query = ctx.sessionQuery
      await new Promise(resolve => setImmediate(resolve)) // let native optional persistence injection settle
      // Native exact/semantic reads work even when the default full-text index
      // is disabled. Deliberately retrieve a detail the summary did NOT keep.
      const hits = await query.filterEvents(sessionId, [{ kind: 'text', text: 'violet paper crane' }, { kind: 'surface', values: ['shadowed'] }])
      assert.equal(hits.length, 1)
      const exact = await query.readEvent({ sessionId, seq: hits[0].seq, before: 1, after: 1 })
      assert(JSON.stringify(exact.target).includes('Lumen'))
      await assert.rejects(query.searchEvents({ sessionId, query: 'violet' }), { code: 'SESSION_QUERY_SEARCH_DISABLED' })
      recall = { nativeShadowedHistoryLookup: true, foundSeq: hits[0].seq, exactBodyRecovered: true,
        detailWasNotInSummary: true, defaultFullTextSearchDisabled: true, modelToolSelectionTested: false }
    }
    let afterReopen
    if (summaries.length && (expected === 'completed' || failSummary || cancelSummary || flushFailure)) {
      handle = await ctx.agents.resume({ resumeSessionId: sessionId, agentOptions: model, setup })
      handle.agent.followup(llm.createUserMessage({ source: { kind: 'user' }, content: [{ type: 'text', text: 'Continue after closing and reopening.' }] }))
      await handle.agent.whenIdle(); await ctx.sessions.flush(handle.agent.session)
      assert.equal(handle.agent.session.snapshotEvents().findLast(e => e.type === 'turn/end').data.reason.kind, 'completed')
      assert.deepEqual(requests.at(-1).markers, markers)
      afterReopen = { completed: true, checkpointMarkersInRequest: requests.at(-1).markers, messageCount: requests.at(-1).messageCount }
      await handle.dispose(); handle = undefined
      const finalReader = await ctx.sessionPersistence.open(sessionId, 'read')
      try {
        const finalEvents = (await finalReader.read()).events
        const restore = catalog.createRestore(catalog.encodeCurrentHeader(finalReader.header, 0), { recovery: 'strict', validation: 'current' })
        finalEvents.forEach(e => restore.decodeRow(catalog.encodeCurrentEvent(e))); restore.finish()
        assert.equal(hash(finalEvents.slice(0, seedEvents.length)), originalDigest)
        afterReopen.nativeColdFormatAndOriginalHistoryVerified = true
      } finally { await finalReader.close() }
    }
    assert.equal(events.filter(e => e.type === 'compaction/start').length, events.filter(e => e.type === 'compaction/end').length)
    const report = { name, rounds, simulatedProvider: true, charsPerToken, config, failSummary, cancelSummary, afterReopen,
      guard: true, ordinary, recall, withTool, initialEstimate: { kind: initialEstimate.baseline.kind, tokens: initialEstimate.totalTokens }, presteps, requests,
      result, successfulCheckpoints: summaries.length, compactionStarts: events.filter(e => e.type === 'compaction/start').length,
      compactionErrors: events.filter(e => e.type === 'compaction/end' && e.data.error).map(e => e.data.error),
      allOriginalMessagesAndReasoningRetainedOnColdRead: true, nativeColdFormatValidation: true, sessionId, warnings }
    fs.writeFileSync(path.join(root, name + '.json'), JSON.stringify(report, null, 2))
    console.log(JSON.stringify(report))
    return report
  } finally { if (handle) await handle.dispose(); await ctx.fiber.dispose() }
}

const reports = []
for (const options of [
  ...[32768, 65536].flatMap(contextWindow => [
    { name: `small-${contextWindow}-short`, contextWindow, outputReservation: 4096, rounds: 4, tokens: 2000, expected: 'completed' },
    { name: `small-${contextWindow}-long`, contextWindow, outputReservation: 4096, rounds: 100, tokens: 90000, expected: 'completed' },
    { name: `small-${contextWindow}-explicit-headroom`, contextWindow, outputReservation: 4096, rounds: 4, tokens: 2000, config: { headroomTokens: 100000 }, expected: 'completed' },
  ]),
  { name: 'route-options-empty', optionsEmpty: true, rounds: 100, tokens: 20000, expected: 'completed' },
  { name: 'route-rerouted-long', reroute: true, expected: 'completed' },
  { name: 'route-default-output-not-old-options', dropReservation: true, outputReservation: 4096, rounds: 200, tokens: 100000, expected: 'completed' },
  { name: 'route-live-model-switch-after-header', switchRoute: true, outputReservation: 4096, rounds: 100, tokens: 90000, expected: 'completed' },
  { name: 'guard-small-import', rounds: 100, tokens: 20000, expected: 'completed' },
  { name: 'guard-screenshot', expected: 'completed' },
  { name: 'guard-accurate-estimate', charsPerToken: 4, expected: 'completed' },
  { name: 'guard-five-thousand', rounds: 5000, tokens: 1500000, expected: 'completed' },
  { name: 'guard-failure-resume', rounds: 5000, tokens: 1500000, failSummary: 2, expected: 'error' },
  { name: 'guard-cancel-resume', rounds: 5000, tokens: 1500000, cancelSummary: 2, expected: 'aborted' },
  { name: 'guard-disabled-by-native-config', config: { auto: false }, expected: 'error' },
  { name: 'guard-ordinary-no-change', ordinary: true, expected: 'error' },
  { name: 'guard-confirmed-overflow', rounds: 100, tokens: 20000, forceOverflow: true, expected: 'completed' },
  { name: 'guard-summary-capacity-retry', rounds: 3500, tokens: 986000, summaryCapacity: 150000, expected: 'completed' },
  { name: 'guard-small-summary-model', rounds: 500, tokens: 300000, summaryCapacity: 200000, summaryReported: 200000,
    config: { summarizationProvider: 'offline', summarizationModel: 'small-summary' }, expected: 'completed' },
  { name: 'guard-auth-failure-no-retry', failSummary: 1, firstFailureCode: 'AUTHENTICATION', expected: 'error' },
  { name: 'guard-atomic-message-too-large', rounds: 2, tokens: 1500000, atomic: true, expected: 'error' },
  { name: 'guard-truncated-summary', malformedSummary: true, expected: 'error' },
  { name: 'guard-storage-failure-resume', flushFailure: true, expected: 'error' },
  { name: 'guard-native-memory-proof', memoryProof: true, expected: 'completed' },
  { name: 'guard-native-tool-pair-boundaries', withTool: true, expected: 'completed' },
  { name: 'guard-few-large-messages', rounds: 3, expected: 'completed' },
]) reports.push(await scenario(options))
assert.equal(networkCalls, 0)
fs.writeFileSync(path.join(root, 'summary.json'), JSON.stringify({ host: hostVersion, guard: true, networkCalls, reports }, null, 2))
console.log(JSON.stringify({ evidence: root, scenarios: reports.length, networkCalls }))
