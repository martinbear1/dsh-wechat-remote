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
import { createHash } from 'node:crypto'

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
    } else if (/\.(?:[mc]?js|json|node|dll|wasm|ya?ml)$/.test(relative)) {
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
  const { LocalAttachmentStore } = await load('@deepseek-ai/dsh-attachment-local')
  const { default: FileUploads } = await load('@deepseek-ai/dsh-client-file-upload')
  const { default: JsonlSessionPersistence } = await load('@deepseek-ai/dsh-session-persistence-jsonl')
  const { LocalFileSystem } = await load('@deepseek-ai/dsh-fs-local')
  const { WorkspaceFiles } = await load('@deepseek-ai/dsh-api-workspace-files')
  const { TYPERT: workspaceFilesTypert } = await load('@deepseek-ai/dsh-api-workspace-files/typert')
  const toolPresent = await load('@deepseek-ai/dsh-tool-present')
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
  let modelCalls = 0, nativePrompts = 0, questionScenario = false, questionModelCalls = 0, approvalScenario = false, approvalModelCalls = 0, imageModel = false, presentScenario = false, presentCalls = 0, assistantImage
  ctx.provide('llm', { listProviders: () => [{ id: 'fixture' }], resolveCallConfig: async v => v,
    resolveModelInfo: async () => ({ inputModalities: imageModel ? ['text', 'image'] : ['text'] }),
    async prepareCall(config) { return { config, stream: request => this.stream(request) } },
    async *stream() {
      modelCalls++
      if (presentScenario && presentCalls++ === 0) {
        yield { type: 'tool-call-delta', index: 0, id: 'synthetic-present-call', name: 'present', argumentsDelta: JSON.stringify({ files: [
          { path: 'synthetic-output.png' }, { path: 'synthetic-output.pdf' },
        ] }) }
        yield { type: 'finish', reason: 'tool_calls' }; return
      }
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
      if (assistantImage) yield { type: 'block-end', index: 1, block: { type: 'image', attachment: assistantImage } }
      yield { type: 'finish', reason: 'stop' }
    } })
  ctx.provide('agentDefaultModel', { currentSelection: () => model })
  new LocalAttachmentStore(ctx, { dshHome: path.join(work, 'synthetic-attachments') })
  new HostConnectionService(ctx, [], {})
  ctx.provide('commands', { registerFileReceiptResolver: () => () => {} })
  new FileUploads(ctx)
  ctx.provide('workspaceRegistry', { archivedSessionIds: [], list: () => [], get: () => undefined })
  new LocalFileSystem(ctx, { cwd: work, diffBasisMaxBytes: 1024 * 1024 })
  let agent, coldMedia
  const coldHeader = { id: 'clawbot-cold-synthetic-session', createdAt: 100, cwd: work, agentPreset: 'harness-teacher' }
  ctx.provide('sessionQuery', { listSessions: async () => [...(agent ? [{ header: agent.session.header }] : []), { header: coldHeader }, ...(coldMedia ? [{ header: coldMedia.header }] : [])],
    async observeSession(sessionId) {
      if (sessionId === coldMedia?.header.id) {
        const live = ctx.sessions.get(sessionId)
        return { header: live?.header ?? coldMedia.header, cursor: live ? live.seq - 1 : coldMedia.cursor,
          projections: { values: {} }, get events() { throw Error('adapter must never read cold transcript') }, [Symbol.dispose]() {} }
      }
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
    if (name === 'fileUploads') return { async uploadStream(request) {
      try { return await ctx.fileUploads.uploadStream(request) }
      catch (error) { console.error(JSON.stringify({ syntheticUploadFailure: { code: error?.code, message: error?.message, details: error?.details } })); throw error }
    } }
    if (name !== 'typertGateway') return ctx.get(name)
    return { wireStream: gateway.wireStream, async invoke(request) {
      if (request.method === 'prompt') nativePrompts++
      try { return await gateway.invoke(request) }
      catch (error) { const failure = { method: request.method, code: error?.code, name: error?.name, message: error?.message, details: error?.details }; safeFailures.push(failure); console.error(JSON.stringify({ syntheticNativeFailure: failure })); throw error }
    } }
  }, on(name, listener, options) {
    assert(!['user-questions/request', 'approval/request'].includes(name),
      'ClawBot must not register a native question or approval answerer')
    return ctx.on(name, listener, options)
  } }
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
  // Only the synthetic Desktop uses Remote Events. ClawBot observes the
  // durable session log; it must never claim questions or pending deliveries.
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
  for (const observer of ['active', 'stopped']) {
    questionModelCalls = 0
    const privateNotices = [], beforePrivate = agent.session.seq, observation = new AbortController()
    let privateSettled = false
    const privateRun = host.run({ sessionId: agent.id, requestId: 'clawbot-' + (observer === 'active' ? 'e' : 'f').repeat(64),
      text: 'native ' + observer + ' observer question test', expectedGeneration: target.generation },
      AbortSignal.any([observation.signal, AbortSignal.timeout(10000)]), kind => privateNotices.push(kind))
      .finally(() => { privateSettled = true })
    const desktopFrame = await nextDesktop('waterfall')
    assert.equal(desktopFrame.event, 'user-questions/request', 'native card must be delivered without a private handoff')
    assert.equal(desktopFrame.agentId, agent.id)
    assert.deepEqual(privateNotices, ['question'])
    assert.equal(privateSettled, false, 'only native human interaction may continue this task')
    assert.equal(questionModelCalls, 1)
    const humanAnswer = { answers: [{ id: 'confirm', selected: ['Continue'] }] }
    if (observer === 'stopped') {
      const stopped = assert.rejects(privateRun, error => error.code === 'clawbot-host/observation-stopped'
        && error.submission === 'accepted')
      observation.abort()
      await stopped
      assert.equal(questionModelCalls, 1, 'stopping the observer must not cancel, answer or replay the native task')
    }
    await respondDesktop(desktopFrame, humanAnswer)
    if (observer === 'active') assert.deepEqual(await privateRun, { text: 'synthetic answer continued' })
    await agent.whenIdle()
    const privateEvents = agent.session.snapshotEvents().filter(event => event.seq >= beforePrivate)
    assert.equal(privateEvents.filter(event => event.type === 'user/message' && event.data.source.kind === 'user').length, 1)
    assert.equal(privateEvents.filter(event => event.type === 'turn/end').length, 1)
    assert.equal(questionModelCalls, 2)
    assert.equal(networkCalls, 0)
    console.log(JSON.stringify({ scenario: `native card remains answerable with ${observer} ClawBot observer`, nativePrompts, modelCalls,
      networkCalls, userMessageCount: 1, turnEnds: 1 }, null, 2))
  }
  // Begin a real native question before ClawBot starts. Its sole Desktop
  // next must still reach NO_PROVIDER while another native card is pending.
  const otherAgent = await loop.create('other-native-question-agent', model, { cwd: work })
  const foreignAsk = ctx.userQuestions.ask({ agent: otherAgent, questions: [{ id: 'other', question: 'Foreign question' }],
    signal: AbortSignal.timeout(5000) })
  const foreignFailure = assert.rejects(foreignAsk, error => error.code === 'NO_PROVIDER')
  const foreignFrame = await nextDesktop('waterfall')
  assert.equal(foreignFrame.agentId, otherAgent.id)
  questionModelCalls = 0
  const foreignNotices = []
  const foreignRun = host.run({ sessionId: agent.id, requestId: 'clawbot-' + 'g'.repeat(64), text: 'foreign isolation test',
    expectedGeneration: target.generation }, AbortSignal.timeout(10000), kind => foreignNotices.push(kind))
  const ownedFrame = await nextDesktop('waterfall')
  assert.equal(ownedFrame.event, 'user-questions/request'); assert.equal(ownedFrame.agentId, agent.id)
  await respondDesktopOutcome(foreignFrame, { kind: 'next' })
  await foreignFailure
  assert.deepEqual(foreignNotices, ['question'])
  assert.equal(questionModelCalls, 1, 'another card ending must not answer or consume this card')
  await respondDesktop(ownedFrame, { answers: [{ id: 'confirm', selected: ['Continue'] }] })
  assert.deepEqual(await foreignRun, { text: 'synthetic answer continued' }); await agent.whenIdle()
  assert.equal(nativePrompts, 6); assert.equal(modelCalls, 11); assert.equal(networkCalls, 0)
  console.log(JSON.stringify({ scenario: 'preexisting foreign Desktop question delegates independently of ClawBot observed card',
    nativePrompts, modelCalls, networkCalls }, null, 2))
  // Both approval and questions remain in the real native Desktop chain.
  questionModelCalls = 0
  const nativeApprovalNotices = []
  const approvalIsolationRun = host.run({ sessionId: agent.id, requestId: 'clawbot-' + 'h'.repeat(64), text: 'approval isolation test',
    expectedGeneration: target.generation }, AbortSignal.timeout(10000), kind => nativeApprovalNotices.push(kind))
  const pendingQuestionFrame = await nextDesktop('waterfall')
  assert.equal(pendingQuestionFrame.event, 'user-questions/request'); assert.equal(pendingQuestionFrame.agentId, agent.id)
  const approvalPending = ctx.approval.request({ agent, toolName: 'synthetic_native_external_approval', signal: AbortSignal.timeout(5000) })
  const nativeApprovalFrame = await nextDesktop('waterfall')
  assert.equal(nativeApprovalFrame.event, 'approval/request')
  await respondDesktop(nativeApprovalFrame, 'allowed-once'); assert.equal(await approvalPending, 'allowed-once')
  assert.equal(questionModelCalls, 1, 'native approval must not consume the pending question')
  await respondDesktop(pendingQuestionFrame, { answers: [{ id: 'confirm', selected: ['Continue'] }] })
  assert.deepEqual(await approvalIsolationRun, { text: 'synthetic answer continued' }); await agent.whenIdle()
  assert(nativeApprovalNotices.includes('approval'))
  assert.equal(nativePrompts, 7); assert.equal(modelCalls, 13); assert.equal(networkCalls, 0)
  console.log(JSON.stringify({ scenario: 'native approval and ordinary native question remain independently answerable',
    nativePrompts, modelCalls, networkCalls }, null, 2))
  // Full local channel path: fake Tencent updates -> actual passive runtime ->
  // installed native ask() -> native Desktop answer -> same-turn final reply.
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
    const runtimeQuestionFrame = await nextDesktop('waterfall')
    assert.equal(runtimeQuestionFrame.event, 'user-questions/request'); assert.equal(runtimeQuestionFrame.agentId, agent.id)
    await until(() => sent.some(text => text.includes('小程序') && text.includes('回答问题')))
    assert.equal(sent.some(text => /\/回答 Q[A-F0-9]{10}/.test(text)), false, 'no private question ownership or command syntax')
    assert.equal(nativePrompts, promptsBeforeRuntime + 1); assert.equal(questionModelCalls, 1)
    const noticesBeforeReply = sent.length
    await receive('5')
    await until(() => sent.length > noticesBeforeReply)
    assert(sent.slice(noticesBeforeReply).some(text => text.includes('小程序') && text.includes('电脑')),
      'a plain reply while the native card is pending must receive actionable native guidance')
    assert.equal(questionModelCalls, 1, 'ordinary text is not a structured native answer')
    assert.equal(nativePrompts, promptsBeforeRuntime + 1)
    const guidanceBeforeOldCommand = sent.length
    await receive('/回答 Q1234567890 5')
    await until(() => sent.length > guidanceBeforeOldCommand)
    assert(sent.slice(guidanceBeforeOldCommand).some(text => text.includes('原生卡片')),
      'obsolete private question instructions must not become a native prompt or answer')
    assert.equal(questionModelCalls, 1); assert.equal(nativePrompts, promptsBeforeRuntime + 1)
    await respondDesktop(runtimeQuestionFrame, { answers: [{ id: 'confirm', selected: ['Continue'] }] })
    await until(() => sent.filter(text => text.includes('synthetic answer continued')).length === 1)
    await until(() => memory.data.receipts.every(receipt => receipt.state === 'done' || receipt.state === 'uncertain'))
    await agent.whenIdle()
    const runtimeEvents = agent.session.snapshotEvents().filter(event => event.seq >= beforeRuntime)
    const userInputs = runtimeEvents.filter(event => event.type === 'user/message' && event.data.source.kind === 'user')
    assert.equal(userInputs.length, 1, 'plain private reply must not queue a second prompt after the native answer')
    assert.equal(nativePrompts, promptsBeforeRuntime + 1)
    assert.equal(runtimeEvents.filter(event => event.type === 'tool/call').length, 1)
    assert.equal(runtimeEvents.filter(event => event.type === 'turn/end').length, 1)
    assert.equal(networkCalls, 0)
    console.log(JSON.stringify({ scenario: 'native card survives private 5; native answer completes once without resubmission',
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
  assert.equal(nativePrompts, 8); assert.equal(modelCalls, 15); assert.equal(networkCalls, 0)
  assert.equal(coldResult.sessionCreated, false); assert.equal(coldResult.agentCreated, false)
  // Real installed native attachment storage, model image admission, and
  // session-scoped receipts. Every byte and Session here remains synthetic.
  questionScenario = false
  const fileBytes = Buffer.from('synthetic CSV\nrow,1\n'), voiceBytes = Buffer.from('synthetic voice bytes')
  const sharp = createRequire(require.resolve('@deepseek-ai/dsh-attachment-local'))('sharp')
  const png = await sharp({ create: { width: 1, height: 1, channels: 4, background: { r: 2, g: 3, b: 4, alpha: 1 } } }).png().toBuffer()
  const mediaInput = suffix => ({ sessionId: agent.id, requestId: 'clawbot-media-' + suffix, expectedGeneration: target.generation, text: '' })
  const retained = await ctx.fileUploads.uploadStream({ sessionId: otherAgent.id, name: 'unrelated.csv',
    data: (async function* () { yield fileBytes })() })
  const beforeFile = agent.session.seq
  assert.deepEqual(await host.run({ ...mediaInput('file-voice'), attachments: [
    { kind: 'file', name: 'result.csv', data: fileBytes }, { kind: 'voice', name: 'voice.silk', data: voiceBytes },
  ] }, AbortSignal.timeout(10000)), { text: 'synthetic gateway reply' })
  await agent.whenIdle()
  const fileEvent = agent.session.snapshotEvents().find(event => event.seq >= beforeFile && event.type === 'user/message')
  assert.deepEqual(fileEvent.data.content.map(part => part.type), ['file', 'file'])
  for (const [index, bytes] of [fileBytes, voiceBytes].entries()) {
    const ref = fileEvent.data.content[index].attachment
    assert.equal(ref.attachmentId, 'sha256:' + createHash('sha256').update(bytes).digest('hex'))
    assert.deepEqual(fs.readFileSync(ctx.attachments.fileHostPath(ref)), bytes)
  }
  assert.equal(ctx.fileUploads.resolve(agent, retained.receiptId), undefined, 'a different session cannot claim the staged native receipt')
  assert.deepEqual(ctx.fileUploads.resolve(otherAgent, retained.receiptId), retained.file)
  const beforeUnsupported = agent.session.seq, callsBeforeUnsupported = modelCalls
  await assert.rejects(host.run({ ...mediaInput('text-model'), attachments: [{ kind: 'image', name: 'one.png', data: png }] }, AbortSignal.timeout(10000)),
    error => error.code === 'clawbot-host/attachment-rejected' && error.submission === 'not-submitted')
  assert.equal(agent.session.seq, beforeUnsupported); assert.equal(modelCalls, callsBeforeUnsupported)
  assert.equal(agent.options.model, model.model, 'unsupported image never changes the model')
  imageModel = true
  const beforeImage = agent.session.seq
  assert.deepEqual(await host.run({ ...mediaInput('image-file'), text: 'inspect these synthetic attachments', attachments: [
    { kind: 'image', name: 'one.png', data: png }, { kind: 'file', name: 'result.csv', data: fileBytes },
  ] }, AbortSignal.timeout(10000)), { text: 'synthetic gateway reply' })
  await agent.whenIdle()
  const imageEvent = agent.session.snapshotEvents().find(event => event.seq >= beforeImage && event.type === 'user/message')
  assert.deepEqual(imageEvent.data.content.map(part => part.type), ['text', 'image', 'file'])
  const image = imageEvent.data.content[1].attachment
  assert.match(image.attachmentId, /^sha256:[a-f0-9]{64}$/); assert.equal(image.name, 'one.png')
  assert.equal(image.width, 1); assert.equal(image.height, 1)
  assert((await ctx.attachments.readImage(image)).data.byteLength > 0)
  assert.deepEqual(fs.readFileSync(ctx.attachments.fileHostPath(retained.file)), fileBytes,
    'admission failure or receipt retirement must not remove shared native attachment objects')
  // Real cold native resume via FileUploads -> SessionController -> AgentLoop
  // -> installed persistence; no plugin-made Agent or manual Session mutation.
  new JsonlSessionPersistence(ctx, { root: path.join(work, 'synthetic-sessions') })
  const coldHandle = await ctx.agents.create({ sessionId: 'clawbot-cold-media', agentOptions: model, meta: { cwd: work } })
  await gateway.invoke({ namespace: 'session', method: 'prompt', args: { request: { sessionId: coldHandle.agent.id,
    requestId: 'synthetic-before-cold', mode: 'queue', content: [{ type: 'text', text: 'synthetic before unload' }] } }, signal: AbortSignal.timeout(5000) })
  await coldHandle.agent.whenIdle()
  coldMedia = { header: structuredClone(coldHandle.agent.session.header), cursor: coldHandle.agent.session.seq - 1 }
  await coldHandle.agent.whenIdle(); await coldHandle.dispose()
  assert.equal(ctx.agents.get(coldMedia.header.id), undefined); assert.equal(ctx.sessions.get(coldMedia.header.id), undefined)
  assert.deepEqual(await host.run({ sessionId: coldMedia.header.id, expectedGeneration: coldMedia.header.createdAt,
    requestId: 'clawbot-cold-media-file', text: '', attachments: [{ kind: 'file', name: 'cold.csv', data: fileBytes }] },
    AbortSignal.timeout(10000)), { text: 'synthetic gateway reply' })
  const resumed = ctx.agents.get(coldMedia.header.id); await resumed.whenIdle()
  assert.equal(resumed.session.header.createdAt, coldMedia.header.createdAt)
  assert.equal(resumed.session.snapshotEvents().filter(event => event.type === 'user/message' && event.data.source.kind === 'user').length, 2)
  assert.equal(networkCalls, 0)
  assert.equal(nativePrompts, 12); assert.equal(modelCalls, 19)
  assert.deepEqual(safeFailures.map(item => item.code), ['session/attachment-invalid'])
  console.log(JSON.stringify({ scenario: 'native files, image model gating, durable normalized image, isolated receipts and cold file resume',
    nativePrompts, modelCalls, networkCalls, image: { width: image.width, height: image.height, mediaType: image.mediaType },
    coldAgentResumed: true, sharedFileRetained: true }, null, 2))
  // Installed present tool declares outputs. The production neutral resource
  // adapter reads them through installed WorkspaceFiles containment/version
  // checks, never through model prose paths or a second filesystem reader.
  ctx.provide('sandboxPolicy', { workspaceRoot: work })
  new WorkspaceFiles(ctx, { maxBytes: 2 * 1024 * 1024, maxFileBytes: 32 * 1024 * 1024, maxLines: 5000, maxEntries: 2000 })
  const unregisterFiles = ctx.typert.register(workspaceFilesTypert)
  const resourcesModule = path.join(work, 'dsh', 'clawbot-resources-fixture.mjs')
  await build({ entryPoints: [fileURLToPath(new URL('../src/agent-resources.ts', import.meta.url))], outfile: resourcesModule,
    bundle: true, write: true, platform: 'node', format: 'esm', target: 'node22', external: ['@deepseek-ai/*'] })
  const { AgentResourcesService } = await import(pathToFileURL(resourcesModule).href)
  new AgentResourcesService(ctx)
  await ctx.plugin(toolPresent, { maxFiles: 8 })
  fs.writeFileSync(path.join(work, 'synthetic-output.png'), png)
  fs.writeFileSync(path.join(work, 'synthetic-output.pdf'), fileBytes)
  presentScenario = true
  const beforePresentation = agent.session.seq
  const delivered = await host.run({ ...mediaInput('present'), text: 'deliver synthetic output files' }, AbortSignal.timeout(10000))
  await agent.whenIdle()
  assert.equal(delivered.text, 'synthetic gateway reply')
  assert.deepEqual(delivered.attachments, [{ kind: 'image', name: 'synthetic-output.png', data: png },
    { kind: 'file', name: 'synthetic-output.pdf', data: fileBytes }])
  const presentationEvents = agent.session.snapshotEvents().filter(event => event.seq >= beforePresentation)
  assert.equal(presentationEvents.filter(event => event.type === 'deliverables/presented').length, 1)
  assert.equal(presentationEvents.filter(event => event.type === 'turn/end').length, 1)
  assert.equal(presentCalls, 2); assert.equal(nativePrompts, 13); assert.equal(modelCalls, 21); assert.equal(networkCalls, 0)
  console.log(JSON.stringify({ scenario: 'actual native present outputs -> scoped WorkspaceFiles -> ClawBot image and document bytes',
    attachments: delivered.attachments.map(({ kind, name, data }) => ({ kind, name, bytes: data.length })), nativePrompts, modelCalls, networkCalls }, null, 2))
  presentScenario = false; assistantImage = image
  const imageReply = await host.run({ ...mediaInput('assistant-image'), text: 'synthetic final image block' }, AbortSignal.timeout(10000))
  await agent.whenIdle()
  assert.deepEqual(imageReply, { text: 'synthetic gateway reply', attachments: [{ kind: 'image', name: 'one.png', data: Buffer.from((await ctx.attachments.readImage(image)).data) }] })
  assert.equal(nativePrompts, 14); assert.equal(modelCalls, 22); assert.equal(networkCalls, 0)
  console.log(JSON.stringify({ scenario: 'native BlockAssembler durable final image block -> verified attachment bytes', nativePrompts, modelCalls, networkCalls }, null, 2))
  await unregisterFiles()
  await unregister()
  }
} catch (error) {
  console.error(JSON.stringify({ name: error?.name, code: error?.code, message: error?.message?.replace(/data:text\/javascript;base64,[A-Za-z0-9+/=]+/g, '<bundled-fixture>'),
    stack: error?.stack?.replace(/data:text\/javascript;base64,[A-Za-z0-9+/=]+/g, '<bundled-fixture>').slice(0, 6000) }))
  process.exitCode = 1
} finally {
  await ctx?.fiber.dispose(); if (fd !== undefined) fs.closeSync(fd); globalThis.fetch = originalFetch
  assert.equal(path.dirname(path.resolve(work)), path.resolve(os.tmpdir()))
  assert(path.basename(work).startsWith('clawbot-gateway-native-'))
  if (!stage) fs.rmSync(work, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 })
}
