/** Opt-in installed-archive native gateway contract test. No real messages,
 * credentials, model/network calls or live profile reads. All sessions and
 * deferred human answers are synthetic and confined to a disposable runtime.
 * Run: HARNESS_DSH_ASAR=<installed app.asar> node scripts/test-clawbot-gateway-native.mjs */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'
import { execFileSync } from 'node:child_process'
import { pathToFileURL, fileURLToPath } from 'node:url'
import { build } from 'esbuild'

const archive = process.env.HARNESS_DSH_ASAR
if (!archive) {
  console.log('SKIP native ClawBot gateway: set HARNESS_DSH_ASAR to an installed app.asar; no native verification performed')
  process.exit(0)
}
const stage = process.env.HARNESS_CLAWBOT_GATEWAY_NATIVE_STAGE
const work = stage || fs.mkdtempSync(path.join(os.tmpdir(), 'clawbot-gateway-native-'))
assert.equal(path.dirname(path.resolve(work)), path.resolve(os.tmpdir()))
assert(path.basename(work).startsWith('clawbot-gateway-native-'))
const fd = stage ? undefined : fs.openSync(archive, 'r')
let ctx
const originalFetch = globalThis.fetch
let networkCalls = 0
globalThis.fetch = async () => { networkCalls++; throw Error('Native gateway test forbids network') }
try {
  if (!stage) {
  const prefix = Buffer.alloc(16); fs.readSync(fd, prefix, 0, 16, 0)
  const bytes = Buffer.alloc(prefix.readUInt32LE(12)); fs.readSync(fd, bytes, 0, bytes.length, 16)
  const tree = JSON.parse(bytes), dataStart = 8 + prefix.readUInt32LE(4)
  function materialize(entry, relative) {
    const target = path.resolve(work, relative)
    assert(target.startsWith(work + path.sep)); assert(!entry.link)
    if (entry.files) {
      for (const [name, child] of Object.entries(entry.files)) materialize(child, path.join(relative, name))
    } else if (/\.(?:[mc]?js|json|node|wasm|ya?ml)$/.test(relative)) {
      fs.mkdirSync(path.dirname(target), { recursive: true })
      if (entry.unpacked) fs.copyFileSync(path.join(archive + '.unpacked', relative), target)
      else { const data = Buffer.alloc(entry.size); fs.readSync(fd, data, 0, data.length, dataStart + Number(entry.offset)); fs.writeFileSync(target, data) }
    }
  }
  materialize(tree.files.dsh, 'dsh')
  process.stdout.write(execFileSync(process.execPath, [fileURLToPath(import.meta.url)], {
    env: { ...process.env, HARNESS_CLAWBOT_GATEWAY_NATIVE_STAGE: work },
    encoding: 'utf8', windowsHide: true, timeout: 60000,
  }))
  } else {
  const anchor = path.join(work, 'dsh/node_modules/@deepseek-ai/dsh/package.json')
  const require = createRequire(anchor), load = name => import(pathToFileURL(require.resolve(name)).href)
  const { Context } = await load('@deepseek-ai/cordis')
  const { SessionStore } = await load('@deepseek-ai/dsh-session')
  const { default: AgentRegistry } = await load('@deepseek-ai/dsh-agent')
  const { AgentLoop } = await load('@deepseek-ai/dsh-agent-loop')
  const { ToolRuntime, defineContentToolFixture } = await load('@deepseek-ai/dsh-tools')
  const { SystemPrompt } = await load('@deepseek-ai/dsh-system-prompt')
  const { default: Projections } = await load('@deepseek-ai/dsh-session-projection')
  const { SessionController } = await load('@deepseek-ai/dsh-api-session-controller')
  const { TYPERT } = await load('@deepseek-ai/dsh-api-session-controller/typert')
  const { default: Typert } = await load('@deepseek-ai/dsh-typert-registry')
  const { TypertGatewayService } = await load('@deepseek-ai/dsh-api-gateway')
  const { HostConnectionService } = await load('@deepseek-ai/dsh-client-connection')
  const remoteEvents = await load('@deepseek-ai/dsh-api-remotes')
  const { default: Loader } = await load('@deepseek-ai/cordis-plugin-loader')
  const { default: AgentPresets } = await load('@deepseek-ai/dsh-agent-preset-registry')
  const { default: UserQuestionService } = await load('@deepseek-ai/dsh-user-questions')
  const { default: ApprovalService } = await load('@deepseek-ai/dsh-user-approval')
  const toolAskUser = await load('@deepseek-ai/dsh-tool-ask-user')
  const { outputFiles } = await build({ entryPoints: [fileURLToPath(new URL('../src/clawbot/dsh-host.ts', import.meta.url))],
    bundle: true, write: false, platform: 'node', format: 'esm', target: 'node22' })
  const { DshClawbotHost } = await import('data:text/javascript;base64,' + Buffer.from(outputFiles[0].contents).toString('base64'))
  ctx = new Context()
  new SystemPrompt(ctx, {}); new SessionStore(ctx); new Projections(ctx); new AgentRegistry(ctx)
  new ToolRuntime(ctx, { mode: 'native' }); new Typert(ctx)
  const model = { provider: 'fixture', model: 'no-network' }
  let modelCalls = 0, nativePrompts = 0, questionScenario = false, questionModelCalls = 0, approvalScenario = false, approvalModelCalls = 0
  ctx.provide('llm', { listProviders: () => [{ id: 'fixture' }], resolveCallConfig: async v => v,
    resolveModelInfo: async () => ({ inputModalities: ['text'] }),
    async prepareCall(config) { return { config, stream: request => this.stream(request) } },
    async *stream() {
      modelCalls++
      if (approvalScenario && approvalModelCalls++ === 0) {
        yield { type: 'tool-call-delta', index: 0, id: 'synthetic-approval-call', name: 'synthetic_approval', argumentsDelta: '{}' }
        yield { type: 'finish', reason: 'tool_calls' }
        return
      }
      if (questionScenario && questionModelCalls++ === 0) {
        yield { type: 'tool-call-delta', index: 0, id: 'synthetic-question-call', name: 'ask_user_question',
          argumentsDelta: JSON.stringify({ questions: [{ id: 'confirm', question: 'Synthetic continue?', options: [{ label: 'Continue' }] }] }) }
        yield { type: 'finish', reason: 'tool_calls' }
        return
      }
      yield { type: 'text-delta', index: 0, text: approvalScenario ? 'synthetic approval continued' : questionScenario ? 'synthetic answer continued' : 'synthetic gateway reply' }
      yield { type: 'finish', reason: 'stop' }
    } })
  ctx.provide('agentDefaultModel', { currentSelection: () => model })
  ctx.provide('attachments', { admitPromptContent: async v => structuredClone(v) })
  ctx.provide('fileUploads', { registerAgentResolver: () => () => {}, resolve: () => { throw Error('no files') },
    bindPrompt: () => ({ commit() {}, [Symbol.dispose]() {} }) })
  ctx.provide('workspaceRegistry', { archivedSessionIds: [], list: () => [], get: () => undefined })
  ctx.provide('fs', { resolve() { throw Error('no filesystem tools') } })
  let agent
  const coldHeader = { id: 'clawbot-cold-synthetic-session', createdAt: 100, cwd: work, agentPreset: 'harness-teacher' }
  ctx.provide('sessionQuery', { listSessions: async () => [...(agent ? [{ header: agent.session.header }] : []), { header: coldHeader }],
    async observeSession(sessionId) {
      if (sessionId === coldHeader.id) return { header: coldHeader, cursor: -1,
        projections: { values: { agentPreset: 'harness-teacher' } },
        get events() { throw Error('no old transcript reads') }, [Symbol.dispose]() {} }
      assert.equal(sessionId, agent.id); return { header: agent.session.header,
      cursor: agent.session.seq - 1, get events() { throw Error('no old transcript reads') }, [Symbol.dispose]() {} } } })
  const loop = new AgentLoop(ctx, { agents: [], maxParallelToolCalls: { get: () => 10 } })
  const controller = new SessionController(ctx)
  await ctx.plugin(TypertGatewayService, {})
  const unregister = ctx.typert.register(TYPERT)
  agent = await loop.create('clawbot-gateway-synthetic-session', model, { cwd: work })
  const gateway = ctx.typertGateway, promptDescriptor = ctx.typert.local.get('session/prompt')
  assert(promptDescriptor)
  const safeFailures = []
  const hostCtx = { get(name) {
    if (name !== 'typertGateway') return ctx.get(name)
    return { wireStream: gateway.wireStream, async invoke(request) {
      if (request.method === 'prompt') nativePrompts++
      try { return await gateway.invoke(request) }
      catch (error) { safeFailures.push({ method: request.method, code: error?.code, name: error?.name, message: error?.message }); throw error }
    } }
  }, on: (name, listener, options) => ctx.on(name, listener, options) }
  const host = new DshClawbotHost(hostCtx)
  const target = await host.describeSession(agent.id, AbortSignal.timeout(5000))
  let result, failure
  try { result = await host.run({ sessionId: agent.id, requestId: 'clawbot-' + 'a'.repeat(64),
    text: 'synthetic gateway request', expectedGeneration: target.generation }, AbortSignal.timeout(5000)) }
  catch (error) { failure = { code: error?.code, submission: error?.submission, message: error?.message } }
  await agent.whenIdle()
  const events = agent.session.snapshotEvents()
  console.log(JSON.stringify({ installedDsh: JSON.parse(fs.readFileSync(anchor, 'utf8')).version,
    descriptor: { service: promptDescriptor.service, parameters: promptDescriptor.parameters.map(p => ({ name: p.name, wire: p.wire, source: p.source })), cancellation: promptDescriptor.cancellation },
    result, failure, safeFailures, nativePrompts, modelCalls, networkCalls,
    userMessageCount: events.filter(e => e.type === 'user/message' && e.data.source.kind === 'user').length,
    lastEvent: events.at(-1)?.type }, null, 2))
  assert.equal(networkCalls, 0)
  assert.deepEqual(result, { text: 'synthetic gateway reply' })
  assert.equal(nativePrompts, 1); assert.equal(modelCalls, 1)
  await ctx.plugin(UserQuestionService)
  await ctx.plugin(toolAskUser)
  const answer = Promise.withResolvers(), waiting = Promise.withResolvers()
  const stopAnswerer = ctx.on('user-questions/request', request => {
    assert.equal(request.agent, agent)
    assert.equal(request.questions[0].id, 'confirm')
    waiting.resolve()
    return answer.promise
  })
  questionScenario = true
  const notices = [], beforeQuestion = agent.session.seq
  let questionSettled = false
  const questionRun = host.run({ sessionId: agent.id, requestId: 'clawbot-' + 'c'.repeat(64),
    text: 'synthetic question request', expectedGeneration: target.generation }, AbortSignal.timeout(5000),
    kind => notices.push(kind)).finally(() => { questionSettled = true })
  await waiting.promise
  assert.equal(questionSettled, false, 'question must wait for the native answerer')
  assert.deepEqual(notices, ['question'])
  assert.equal(questionModelCalls, 1, 'no extra model call while awaiting an answer')
  answer.resolve({ answers: [{ id: 'confirm', selected: ['Continue'] }] })
  const questionResult = await questionRun
  await agent.whenIdle()
  const questionEvents = agent.session.snapshotEvents().filter(event => event.seq >= beforeQuestion)
  const questionInputs = questionEvents.filter(event => event.type === 'user/message' && event.data.source.kind === 'user')
  assert.deepEqual(questionResult, { text: 'synthetic answer continued' })
  assert.equal(questionInputs.length, 1, 'native answer resumes the tool, not a second user prompt')
  assert.equal(questionEvents.filter(event => event.type === 'tool/call').length, 1)
  assert.equal(questionEvents.filter(event => event.type === 'turn/end').length, 1)
  assert.equal(questionModelCalls, 2)
  assert.equal(nativePrompts, 2); assert.equal(modelCalls, 3); assert.equal(networkCalls, 0)
  console.log(JSON.stringify({ scenario: 'native question, deferred human answer, same-turn final',
    notices, questionResult, nativePrompts, modelCalls, networkCalls, userMessageCount: questionInputs.length,
    turnEnds: questionEvents.filter(event => event.type === 'turn/end').length }, null, 2))
  stopAnswerer()
  questionScenario = false
  await ctx.plugin(ApprovalService)
  const decision = Promise.withResolvers(), asked = Promise.withResolvers()
  const stopApprover = ctx.on('approval/request', request => {
    assert.equal(request.agent, agent); assert.equal(request.toolName, 'synthetic_approval')
    asked.resolve(); return decision.promise
  })
  const stopTool = ctx.tools.register(defineContentToolFixture({ name: 'synthetic_approval', description: 'Isolated approval fixture', parameters: {},
    async execute(_args, exec) {
      const outcome = await ctx.approval.request({ agent: exec.agent, toolName: 'synthetic_approval', signal: exec.signal })
      assert.equal(outcome, 'allowed-once')
      return [{ type: 'text', text: 'synthetic allowed result' }]
    } }))
  approvalScenario = true
  const beforeApproval = agent.session.seq, approvalNotices = []
  let approvalSettled = false
  const approvalRun = host.run({ sessionId: agent.id, requestId: 'clawbot-' + 'd'.repeat(64), text: 'synthetic approval request',
    expectedGeneration: target.generation }, AbortSignal.timeout(5000), kind => approvalNotices.push(kind))
    .finally(() => { approvalSettled = true })
  await asked.promise
  assert.equal(approvalSettled, false); assert.equal(approvalModelCalls, 1); assert.deepEqual(approvalNotices, ['approval'])
  decision.resolve('allowed-once')
  const approvalResult = await approvalRun
  await agent.whenIdle()
  const approvalEvents = agent.session.snapshotEvents().filter(event => event.seq >= beforeApproval)
  assert.deepEqual(approvalResult, { text: 'synthetic approval continued' })
  assert.deepEqual(approvalEvents.filter(event => event.type.startsWith('approval/')).map(event => event.type), ['approval/asked', 'approval/decided'])
  assert.equal(approvalEvents.filter(event => event.type === 'user/message' && event.data.source.kind === 'user').length, 1)
  assert.equal(approvalEvents.filter(event => event.type === 'turn/end').length, 1)
  assert.equal(approvalModelCalls, 2); assert.equal(nativePrompts, 3); assert.equal(modelCalls, 5); assert.equal(networkCalls, 0)
  console.log(JSON.stringify({ scenario: 'native approval audit pair, deferred decision, same-turn final', approvalNotices, approvalResult,
    nativePrompts, modelCalls, networkCalls }, null, 2))
  stopApprover(); stopTool()
  // Only the synthetic Desktop uses Remote Events. The plugin's scoped
  // answerer must never register a global client or touch pending deliveries.
  new HostConnectionService(ctx, [], {})
  ctx.provide('profileContext', { name: 'native-question-fixture', home: work, dir: work, installAnchor: anchor })
  await ctx.plugin(remoteEvents)
  const desktopLife = new AbortController()
  const empty = { async *[Symbol.asyncIterator]() {} }
  const desktopEvents = (await gateway.wireStream.open('$events', { args: {} }, empty, undefined, desktopLife.signal))[Symbol.asyncIterator]()
  const desktopReady = (await desktopEvents.next()).value
  assert.equal(desktopReady.type, 'ready')
  const nextDesktop = async type => {
    for (;;) {
      const frame = await desktopEvents.next()
      assert.equal(frame.done, false)
      if (frame.value.type === type) return frame.value
    }
  }
  const respondDesktopOutcome = async (frame, outcome) => {
    const response = await ctx.connection.createSharedFetchHandler('/api').fetch(new Request('http://dsh.local/api/$events/result', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ type: 'client-request',
        rpcId: 'native-desktop-' + frame.eventId, method: '$events/result', payload: { args: {
          clientId: desktopReady.clientId, eventId: frame.eventId, outcome,
        } } }),
    }))
    const reply = await response.json(); assert.equal(reply.result.ok, true)
  }
  const respondDesktop = (frame, value) => respondDesktopOutcome(frame, { kind: 'result', value })
  approvalScenario = false; questionScenario = true
  for (const winner of ['clawbot', 'handoff']) {
    questionModelCalls = 0
    const questionReady = Promise.withResolvers(), privateNotices = [], beforePrivate = agent.session.seq
    const privateRun = host.run({ sessionId: agent.id, requestId: 'clawbot-' + (winner === 'clawbot' ? 'e' : 'f').repeat(64),
      text: 'native ' + winner + ' question test', expectedGeneration: target.generation }, AbortSignal.timeout(10000),
      kind => privateNotices.push(kind), question => questionReady.resolve(question))
    const question = await questionReady.promise
    assert.deepEqual(privateNotices, [], 'no duplicate generic handoff notice')
    const humanAnswer = { answers: [{ id: 'confirm', selected: ['Continue'] }] }
    if (winner === 'clawbot') {
      await question.answer(humanAnswer)
    } else {
      question.handoff()
      const desktopFrame = await nextDesktop('waterfall')
      assert.equal(desktopFrame.event, 'user-questions/request')
      await respondDesktop(desktopFrame, humanAnswer)
      await new Promise(setImmediate)
      assert.equal(question.signal.aborted, true)
      await assert.rejects(question.answer(humanAnswer), /已结束/)
    }
    assert.deepEqual(await privateRun, { text: 'synthetic answer continued' })
    await agent.whenIdle()
    const privateEvents = agent.session.snapshotEvents().filter(event => event.seq >= beforePrivate)
    assert.equal(privateEvents.filter(event => event.type === 'user/message' && event.data.source.kind === 'user').length, 1)
    assert.equal(privateEvents.filter(event => event.type === 'turn/end').length, 1)
    assert.equal(questionModelCalls, 2)
    assert.equal(networkCalls, 0)
    console.log(JSON.stringify({ scenario: `native scoped question, ${winner}, same-turn final`, nativePrompts, modelCalls,
      networkCalls, userMessageCount: 1, turnEnds: 1 }, null, 2))
  }
  // Begin a real native question before ClawBot starts. Its sole Desktop
  // next must still reach NO_PROVIDER while the owned question is claimed.
  const otherAgent = await loop.create('other-native-question-agent', model, { cwd: work })
  const foreignAsk = ctx.userQuestions.ask({ agent: otherAgent, questions: [{ id: 'other', question: 'Foreign question' }],
    signal: AbortSignal.timeout(5000) })
  const foreignFailure = assert.rejects(foreignAsk, error => error.code === 'NO_PROVIDER')
  const foreignFrame = await nextDesktop('waterfall')
  assert.equal(foreignFrame.agentId, otherAgent.id)
  questionModelCalls = 0
  const ownedQuestion = Promise.withResolvers()
  const foreignRun = host.run({ sessionId: agent.id, requestId: 'clawbot-' + 'g'.repeat(64), text: 'foreign isolation test',
    expectedGeneration: target.generation }, AbortSignal.timeout(10000), () => {}, q => ownedQuestion.resolve(q))
  const owned = await ownedQuestion.promise
  assert.equal(owned.signal.aborted, false)
  await respondDesktopOutcome(foreignFrame, { kind: 'next' })
  await foreignFailure
  await owned.answer({ answers: [{ id: 'confirm', selected: ['Continue'] }] })
  assert.deepEqual(await foreignRun, { text: 'synthetic answer continued' }); await agent.whenIdle()
  assert.equal(nativePrompts, 6); assert.equal(modelCalls, 11); assert.equal(networkCalls, 0)
  console.log(JSON.stringify({ scenario: 'preexisting foreign Desktop question completes next without a ClawBot delivery',
    nativePrompts, modelCalls, networkCalls }, null, 2))
  // Approval is not claimed: the real native Desktop remains its owner,
  // while an ordinary owned private question keeps its independent lifetime.
  questionModelCalls = 0
  const beforeApprovalQuestion = Promise.withResolvers(), nativeApprovalNotices = []
  const approvalIsolationRun = host.run({ sessionId: agent.id, requestId: 'clawbot-' + 'h'.repeat(64), text: 'approval isolation test',
    expectedGeneration: target.generation }, AbortSignal.timeout(10000), kind => nativeApprovalNotices.push(kind), q => beforeApprovalQuestion.resolve(q))
  const approvalOwned = await beforeApprovalQuestion.promise
  const approvalPending = ctx.approval.request({ agent, toolName: 'synthetic_native_external_approval', signal: AbortSignal.timeout(5000) })
  const nativeApprovalFrame = await nextDesktop('waterfall')
  assert.equal(nativeApprovalFrame.event, 'approval/request'); assert.equal(approvalOwned.signal.aborted, false)
  await respondDesktop(nativeApprovalFrame, 'allowed-once'); assert.equal(await approvalPending, 'allowed-once')
  await approvalOwned.answer({ answers: [{ id: 'confirm', selected: ['Continue'] }] })
  assert.deepEqual(await approvalIsolationRun, { text: 'synthetic answer continued' }); await agent.whenIdle()
  assert(nativeApprovalNotices.includes('approval'))
  assert.equal(nativePrompts, 7); assert.equal(modelCalls, 13); assert.equal(networkCalls, 0)
  console.log(JSON.stringify({ scenario: 'native approval stays in Desktop without changing the claimed ordinary question',
    nativePrompts, modelCalls, networkCalls }, null, 2))
  // Full local channel path: fake Tencent updates -> actual runtime parser ->
  // actual host answerer -> installed native ask() -> same-turn final reply.
  // No private method invocation, real account, network or live profile.
  const sourceModule = async name => {
    const built = await build({ entryPoints: [fileURLToPath(new URL(`../src/clawbot/${name}.ts`, import.meta.url))],
      bundle: true, write: false, platform: 'node', format: 'esm', target: 'node22',
      banner: { js: `import { createRequire } from 'node:module'; const require = createRequire(${JSON.stringify(import.meta.url)});` } })
    return import('data:text/javascript;base64,' + Buffer.from(built.outputFiles[0].contents).toString('base64'))
  }
  const { ClawbotRuntime } = await sourceModule('runtime')
  const { emptyClawbotData } = await sourceModule('storage')
  const auth = { token: 'synthetic-token', baseUrl: 'https://ilinkai.weixin.qq.com', accountId: 'fixture@im.bot', userId: 'fixture@im.wechat' }
  const memory = { data: { ...emptyClawbotData(), credentials: auth, target },
    read() { return structuredClone(this.data) }, write(value) { this.data = structuredClone(value) }, close() {} }
  let pollReply
  const sent = [], fakeClient = {
    getUpdates(_auth, _cursor, signal) {
      return new Promise((resolve, reject) => {
        const abort = () => { pollReply = undefined; reject(signal.reason) }
        pollReply = value => { pollReply = undefined; signal.removeEventListener('abort', abort); resolve(value) }
        if (signal.aborted) abort(); else signal.addEventListener('abort', abort, { once: true })
      })
    },
    async sendText(_auth, request) { sent.push(request.text) },
  }
  const until = async predicate => {
    for (let i = 0; i < 300; i++) { if (predicate()) return; await new Promise(setImmediate) }
    assert.fail('synthetic channel did not reach expected state')
  }
  let incomingCount = 0
  const receive = async text => {
    await until(() => pollReply)
    pollReply({ cursor: 'fixture-' + ++incomingCount, messages: [{ id: String(incomingCount), text,
      userId: auth.userId, contextToken: 'synthetic-context' }] })
    await new Promise(setImmediate)
  }
  questionModelCalls = 0
  const promptsBeforeRuntime = nativePrompts, beforeRuntime = agent.session.seq
  const runtime = new ClawbotRuntime(memory, host, fakeClient)
  try {
    await runtime.control({ action: 'enabled', enabled: true, expectedRevision: runtime.snapshot().revision }, AbortSignal.timeout(5000))
    await receive('synthetic runtime question')
    await until(() => sent.some(text => /\/回答 Q[A-F0-9]{10}/.test(text)))
    const code = sent.find(text => /\/回答 Q[A-F0-9]{10}/.test(text)).match(/\/回答 (Q[A-F0-9]{10})/)[1]
    assert.equal(nativePrompts, promptsBeforeRuntime + 1); assert.equal(questionModelCalls, 1)
    await receive('1')
    assert.equal(questionModelCalls, 1, 'ordinary text is not a structured native answer')
    assert.equal(nativePrompts, promptsBeforeRuntime + 1)
    await receive(`/回答 ${code} 1`)
    await until(() => sent.some(text => text.includes('回答已提交'))
      && sent.filter(text => text.includes('synthetic answer continued')).length === 2)
    await until(() => memory.data.receipts.every(receipt => receipt.state === 'done' || receipt.state === 'uncertain'))
    await agent.whenIdle()
    const runtimeEvents = agent.session.snapshotEvents().filter(event => event.seq >= beforeRuntime)
    const userInputs = runtimeEvents.filter(event => event.type === 'user/message' && event.data.source.kind === 'user')
    assert.equal(userInputs.length, 2, 'only the original request and separately queued ordinary text are prompts')
    assert.equal(nativePrompts, promptsBeforeRuntime + 2, 'the /回答 command creates no prompt')
    assert.equal(runtimeEvents.filter(event => event.type === 'tool/call').length, 1)
    assert.equal(runtimeEvents.filter(event => event.type === 'turn/end').length, 2)
    assert.equal(networkCalls, 0)
    console.log(JSON.stringify({ scenario: 'runtime /回答 -> native ask -> final; ordinary text queues separately',
      nativePrompts, modelCalls, networkCalls, nativeInputs: userInputs.length }, null, 2))
  } finally { await runtime.dispose() }
  desktopLife.abort(); await desktopEvents.return?.()
  ctx.baseUrl = pathToFileURL(path.join(work, 'dsh/')).href
  await ctx.plugin(Loader)
  await ctx.plugin(AgentPresets, { default: 'standard' })
  await ctx.agentPresets.register({ id: 'standard', name: 'synthetic standard', plugins: [] })
  let coldFailure
  try { await host.describeSession(coldHeader.id, AbortSignal.timeout(5000)) }
  catch (error) { coldFailure = { code: error?.code, submission: error?.submission, message: error?.message } }
  const coldResult = { coldFailure, safeFailures, nativePrompts, modelCalls, networkCalls,
    sessionCreated: Boolean(ctx.sessions.get(coldHeader.id)), agentCreated: Boolean(ctx.agents.get(coldHeader.id)) }
  console.log(JSON.stringify({ scenario: 'cold session whose saved harness-teacher preset is absent', ...coldResult }, null, 2))
  assert.equal(coldFailure?.code, 'clawbot-host/preset-unavailable')
  assert.equal(coldFailure?.submission, 'not-submitted')
  assert.equal(safeFailures.length, 0)
  assert.equal(nativePrompts, 9); assert.equal(modelCalls, 16); assert.equal(networkCalls, 0)
  assert.equal(coldResult.sessionCreated, false); assert.equal(coldResult.agentCreated, false)
  await unregister()
  }
} finally {
  await ctx?.fiber.dispose(); if (fd !== undefined) fs.closeSync(fd); globalThis.fetch = originalFetch
  assert.equal(path.dirname(path.resolve(work)), path.resolve(os.tmpdir()))
  assert(path.basename(work).startsWith('clawbot-gateway-native-'))
  if (!stage) fs.rmSync(work, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 })
}
