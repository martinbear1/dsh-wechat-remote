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
    return { async invoke(request) {
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
  assert.equal(nativePrompts, 3); assert.equal(modelCalls, 5); assert.equal(networkCalls, 0)
  assert.equal(coldResult.sessionCreated, false); assert.equal(coldResult.agentCreated, false)
  await unregister()
  }
} finally {
  await ctx?.fiber.dispose(); if (fd !== undefined) fs.closeSync(fd); globalThis.fetch = originalFetch
  assert.equal(path.dirname(path.resolve(work)), path.resolve(os.tmpdir()))
  assert(path.basename(work).startsWith('clawbot-gateway-native-'))
  if (!stage) fs.rmSync(work, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 })
}
