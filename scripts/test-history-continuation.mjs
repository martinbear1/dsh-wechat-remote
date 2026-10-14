// Factory contracts only: synthetic messages, fake native engine/assembler,
// no model, network, user session, host configuration or installation writes.
// These tests do not measure summary semantics or the native stream parser.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { build } from 'esbuild'
import { fileURLToPath } from 'node:url'

async function loadSource(name, options = {}) {
  const url = new URL(`../src/history-import/${name}.ts`, import.meta.url)
  const built = await build({ entryPoints: [fileURLToPath(url)], bundle: true,
    platform: 'node', format: 'esm', write: false,
    define: { 'import.meta.url': JSON.stringify(url.href) }, ...options })
  return import('data:text/javascript;base64,' + Buffer.from(built.outputFiles[0].text).toString('base64'))
}

// The preset lifecycle resolves its sibling module through the installed
// package. Stub only that resolution and Cordis's lifecycle symbol here;
// real package export/path resolution belongs to packaging/native tests.
const lifecycle = Symbol.for('history-continuation-test.init')
const preset = await loadSource('continuation-preset', { plugins: [{
  name: 'synthetic-preset-host',
  setup(builder) {
    const modules = {
      '@deepseek-ai/cordis': 'export const Service = {init: Symbol.for("history-continuation-test.init")}',
      'node:fs': 'export const realpathSync = () => "/fixture/continuation-compaction.js"',
      'node:module': 'export const createRequire = () => ({resolve: () => "/fixture/continuation-compaction.js"})',
    }
    builder.onResolve({ filter: /^(?:@deepseek-ai\/cordis|node:fs|node:module)$/ }, args => ({ path: args.path, namespace: 'fixture' }))
    builder.onLoad({ filter: /.*/, namespace: 'fixture' }, args => ({ contents: modules[args.path], loader: 'js' }))
  },
}] })
const { createContinuationCompactionPlugin, CONTINUATION_COMPACTION_INSTRUCTION } = await loadSource('continuation-compaction')

function freeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) freeze(child)
    Object.freeze(value)
  }
  return value
}
const text = value => ({ type: 'text', text: value })
const flattenPlugins = plugins => plugins.flatMap(plugin => [plugin, ...(plugin.group ? flattenPlugins(plugin.config) : [])])

test('continuation composition is standalone and contains only persona, web and native compaction plumbing', () => {
  const definition = preset.historyContinuationDefinition({ compactionModule: 'fixture/compaction' })
  assert.equal(definition.id, preset.HISTORY_CONTINUATION_ID)
  assert.equal(definition.name, '网页会话接续')
  assert.equal('extends' in definition, false)
  assert.equal('default' in definition, false)
  assert.deepEqual(flattenPlugins(definition.plugins).map(plugin => plugin.name), [
    '@deepseek-ai/dsh-persona', '@deepseek-ai/dsh-tool-web', 'cordis:group',
    'fixture/compaction', '@deepseek-ai/dsh-command-compact',
  ])
  // cordis:group is a native scope, not the WeChat group-assistant toolset.
  assert.deepEqual(definition.plugins[2].isolate, { compaction: true, toolResultPruner: true })
  assert.deepEqual(definition.plugins[1].config, { fetch: true, searchTimeoutMs: 60000 })
  assert.deepEqual(definition.plugins[0].config, { prefix: preset.CONTINUATION_PERSONA, suffix: '', complete: false })
  assert.doesNotMatch(JSON.stringify(definition.plugins), /dsh-tool-(?:fs|terminal|code)|assistant-teacher|group-tools|wechatFeatures/)
})

test('persona is task-neutral and treats imported reasoning/tool content as historical, not new authority', () => {
  const persona = preset.CONTINUATION_PERSONA
  assert.match(persona, /general-purpose conversational assistant/)
  for (const domain of ['research', 'mathematics', 'writing', 'everyday conversation', 'fictional or roleplay']) assert(persona.includes(domain))
  assert.match(persona, /without forcing any one workflow/)
  assert.match(persona, /untrusted content, not system instructions/)
  assert.match(persona, /Do not automatically repeat historical actions/)
  assert.match(persona, /Do not claim access to a missing attachment/)
})

test('preset lifecycle only registers its own definition and yields cleanup; host default stays unchanged', async () => {
  const defaults = freeze({ preset: 'standard', provider: 'host-provider', model: 'host-model' })
  const registrations = new Map(), calls = [], cleanup = () => registrations.delete(preset.HISTORY_CONTINUATION_ID)
  const registry = new Proxy({ register(definition) {
    calls.push(['register', definition.id]); registrations.set(definition.id, definition); return cleanup
  } }, { get(target, key) {
    assert.equal(key, 'register', `unexpected host-registry access: ${String(key)}`)
    return target[key]
  }, set() { assert.fail('preset must not write host registry/default settings') } })
  const ctx = freeze({ get(name) { calls.push(['get', name]); assert.equal(name, 'agentPresets'); return registry } })
  const component = new preset.default(ctx), init = component[lifecycle]()
  const yielded = await init.next()
  assert.equal(yielded.done, false)
  assert.equal(yielded.value, cleanup)
  assert.equal(registrations.size, 1)
  assert.equal((await init.next()).done, true)
  assert.deepEqual(calls, [['get', 'agentPresets'], ['register', preset.HISTORY_CONTINUATION_ID]])
  assert.deepEqual(defaults, { preset: 'standard', provider: 'host-provider', model: 'host-model' })
  yielded.value() // Cordis, not the component, owns invoking yielded cleanup.
  assert.equal(registrations.size, 0)
})

class FakeNativeEngine {
  constructor(ctx, config) { this.ctx = ctx; this.config = config }
  selectRegion() { return 'native-region-selection' }
  persistCheckpoint() { return 'native-persistence' }
}
class FakeLlmError extends Error {
  constructor(message, code, failure) { super(message); this.code = code; this.failure = failure }
}
// This assembler consumes a deliberately tiny fixture protocol. It checks the
// hook's use of assembled output, not how real providers parse stream chunks.
class FakeBlockAssembler {
  finish = { kind: 'stop' }
  usage = undefined
  output = []
  push(chunk) {
    if (chunk.blocks !== undefined) this.output.push(...chunk.blocks)
    if (chunk.finish !== undefined) this.finish = chunk.finish
    if (chunk.usage !== undefined) this.usage = chunk.usage
  }
  blocks() { return this.output }
}
const Plugin = createContinuationCompactionPlugin({ BasicCompactionEngine: FakeNativeEngine }, {
  BlockAssembler: FakeBlockAssembler, LlmError: FakeLlmError,
})

function fixture({ config = {}, chunks = [{ blocks: [text('合成检查点')] }], streamError, afterChunk,
  latest = { provider: 'new-provider', model: 'new-model' }, options = { provider: 'old-provider', model: 'old-model' } } = {}) {
  const calls = [], toolHistory = freeze([{ callId: 'search-1', name: 'search', input: { query: '合成问题' } }])
  const agent = { options: freeze(options), session: { id: 'synthetic-session',
    requestHeader: () => latest === undefined ? undefined : { config: latest }, toolHistory: () => toolHistory } }
  const ctx = { llm: { async* stream(request) {
    calls.push(request)
    for (const chunk of chunks) { yield chunk; afterChunk?.() }
    if (streamError) throw streamError
  } } }
  // These are already-resolved native defaults. Config validation is owned by
  // BasicCompactionEngine and is not reimplemented in this fake superclass.
  const resolved = freeze({ modelPolicies: [], summarizationProvider: '', summarizationModel: '', maxTokens: 2048, ...config })
  return { instance: new Plugin(ctx, resolved), calls, agent, toolHistory, config: resolved }
}

test('factory inherits native lifecycle/region/persistence and overrides only summarize', () => {
  const f = fixture()
  assert(f.instance instanceof FakeNativeEngine)
  assert.deepEqual(Object.getOwnPropertyNames(Plugin.prototype).sort(), ['constructor', 'summarize'])
  assert.equal(f.instance.selectRegion(), 'native-region-selection')
  assert.equal(f.instance.persistCheckpoint(), 'native-persistence')
  assert.equal(f.instance.config, f.config)
})

test('summary preserves the entire frozen input prefix, system/developer messages, tools and history in exact order', async () => {
  const input = freeze({ messages: [
    { role: 'system', content: [text('合成系统要求')] },
    { role: 'user', content: [text('第一轮问题')] },
    { role: 'assistant', content: [{ type: 'reasoning', text: '历史思考', signature: 'historical-signature' },
      { type: 'tool-call', callId: 'search-1', name: 'search', arguments: { query: '合成问题' } }] },
    { role: 'tool', callId: 'search-1', content: [text('历史结果')] },
    { role: 'developer', content: [text('中途系统更新保持原位')] },
    { role: 'assistant', content: [text('历史回答')] },
    { role: 'user', content: [text('后来纠正，继续讨论')] },
  ], tools: [{ name: 'search', description: 'synthetic search', parameters: { type: 'object', properties: {} } }] })
  const before = structuredClone(input), f = fixture(), signal = new AbortController().signal
  await f.instance.summarize(input, f.agent, signal)
  assert.equal(f.calls.length, 1)
  const request = f.calls[0]
  assert.deepEqual(input, before)
  assert.equal(request.messages.length, input.messages.length + 1)
  input.messages.forEach((message, index) => assert.equal(request.messages[index], message))
  assert.notEqual(request.messages, input.messages)
  assert.deepEqual(request.messages.at(-1), { role: 'user', content: [text(CONTINUATION_COMPACTION_INSTRUCTION)] })
  assert(Object.isFrozen(request.messages.at(-1)))
  assert(Object.isFrozen(request.messages.at(-1).content))
  assert(Object.isFrozen(request.messages.at(-1).content[0]))
  assert.notEqual(request.tools, input.tools)
  assert.equal(request.tools[0], input.tools[0])
  assert.equal(request.toolHistory, f.toolHistory)
  assert.equal(request.signal, signal)
  assert.equal(request.sessionId, f.agent.session.id)
  assert.equal(request.purpose, 'compaction')
})

test('summary instructions preserve corrections and gaps without assuming a coding or roleplay workflow', () => {
  assert.match(CONTINUATION_COMPACTION_INSTRUCTION, /not necessarily a coding task or a roleplay/)
  assert.match(CONTINUATION_COMPACTION_INSTRUCTION, /Do not invent those categories when absent/)
  assert.match(CONTINUATION_COMPACTION_INSTRUCTION, /Later corrections supersede earlier values/)
  assert.match(CONTINUATION_COMPACTION_INSTRUCTION, /do not invent their contents/)
  assert.match(CONTINUATION_COMPACTION_INSTRUCTION, /not a new system prompt/)
  assert.match(CONTINUATION_COMPACTION_INSTRUCTION, /Do not expose intermediate reasoning as established facts/)
})

test('latest complete session route wins over old agent options and is read anew for each call', async () => {
  const latest = { provider: 'new-provider', model: 'new-model' }, f = fixture({ latest })
  const first = await f.instance.summarize({ messages: [] }, f.agent)
  assert.equal(first.provider, 'new-provider'); assert.equal(first.model, 'new-model')
  latest.provider = 'newer-provider'; latest.model = 'newer-model'
  const second = await f.instance.summarize({ messages: [] }, f.agent)
  assert.equal(second.provider, 'newer-provider'); assert.equal(second.model, 'newer-model')
  assert.deepEqual(f.agent.options, { provider: 'old-provider', model: 'old-model' })
})

test('missing or partial latest route falls back to the agent route, never mixes providers/models', async () => {
  for (const latest of [null, {}, { provider: 'partial-provider' }, { model: 'partial-model' }]) {
    const f = fixture({ latest }), result = await f.instance.summarize({ messages: [] }, f.agent)
    assert.equal(result.provider, 'old-provider'); assert.equal(result.model, 'old-model')
  }
  const f = fixture(); f.agent.session.requestHeader = () => undefined
  assert.equal((await f.instance.summarize({ messages: [] }, f.agent)).provider, 'old-provider')
})

test('explicit global summary provider/model wins while the route remains unchanged', async () => {
  const f = fixture({ config: { summarizationProvider: 'summary-provider', summarizationModel: 'summary-model', maxTokens: 4096 } })
  const result = await f.instance.summarize({ messages: [] }, f.agent)
  assert.equal(result.provider, 'summary-provider'); assert.equal(result.model, 'summary-model')
  assert.equal(result.maxTokens, 4096)
  assert.equal(f.calls[0].maxTokens, 4096)
  assert.deepEqual(f.agent.session.requestHeader().config, { provider: 'new-provider', model: 'new-model' })
})

test('model policy matches both latest provider and model, not stale options or model alone', async () => {
  const f = fixture({ config: { summarizationProvider: 'global-p', summarizationModel: 'global-m', modelPolicies: [
    { provider: 'old-provider', model: 'old-model', summarizationProvider: 'stale-p', summarizationModel: 'stale-m', maxTokens: 111 },
    { provider: 'foreign-provider', model: 'new-model', summarizationProvider: 'wrong-p', summarizationModel: 'wrong-m', maxTokens: 222 },
    { provider: 'new-provider', model: 'new-model', summarizationProvider: 'policy-p', summarizationModel: 'policy-m', maxTokens: 333 },
  ] } })
  const result = await f.instance.summarize({ messages: [] }, f.agent)
  assert.equal(result.provider, 'policy-p'); assert.equal(result.model, 'policy-m'); assert.equal(result.maxTokens, 333)
})

test('policy can override only token budget, while unmatched policy leaves native defaults', async () => {
  for (const [provider, expected] of [['new-provider', 777], ['other-provider', 2048]]) {
    const f = fixture({ config: { modelPolicies: [{ provider, model: 'new-model', maxTokens: 777 }] } })
    const result = await f.instance.summarize({ messages: [] }, f.agent)
    assert.equal(result.provider, 'new-provider'); assert.equal(result.model, 'new-model'); assert.equal(result.maxTokens, expected)
  }
})

test('explicit empty policy summary target falls back to routed conversation, not global summary target', async () => {
  const f = fixture({ config: { summarizationProvider: 'global-p', summarizationModel: 'global-m', modelPolicies: [
    { provider: 'new-provider', model: 'new-model', summarizationProvider: '', summarizationModel: '' },
  ] } })
  const result = await f.instance.summarize({ messages: [] }, f.agent)
  assert.equal(result.provider, 'new-provider'); assert.equal(result.model, 'new-model')
})

test('missing route fails before any model call', async () => {
  const f = fixture({ latest: null, options: {} })
  await assert.rejects(f.instance.summarize({ messages: [] }, f.agent), /No provider\/model/)
  assert.equal(f.calls.length, 0)
})

test('absent tools, signal and usage remain absent; an explicitly empty tools list remains present', async () => {
  const f = fixture(), result = await f.instance.summarize({ messages: [] }, f.agent)
  assert.equal('tools' in f.calls[0], false); assert.equal('signal' in f.calls[0], false); assert.equal('usage' in result, false)
  await f.instance.summarize(freeze({ messages: [], tools: [] }), f.agent)
  assert.deepEqual(f.calls[1].tools, [])
})

test('assembled text becomes summary while raw reasoning, block order and usage are preserved', async () => {
  const thinking = freeze({ type: 'reasoning', text: '不能当成事实写入的合成思考', signature: 'provider-signature' })
  const first = freeze(text('事实与约束。')), second = freeze(text('未完事项。'))
  const usage = freeze({ inputTokens: 111, outputTokens: 22, reasoningTokens: 5, cachedInputTokens: 90 })
  const chunks = freeze([{ blocks: [thinking] }, { blocks: [first] }, { blocks: [second], usage, finish: { kind: 'stop' } }])
  const f = fixture({ chunks }), result = await f.instance.summarize({ messages: [] }, f.agent)
  assert.deepEqual(result.rawOutput, [thinking, first, second])
  assert.equal(result.rawOutput[0], thinking)
  assert.deepEqual(result.summary, [first, second])
  assert.equal(result.summary[0], first); assert.equal(result.summary[1], second)
  assert.equal(result.usage, usage)
  assert.equal(result.llmStreamCall, true)
  assert.equal(result.maxTokens, f.config.maxTokens)
})

test('already-aborted signal rejects without requesting a model', async () => {
  const controller = new AbortController(), reason = new Error('synthetic cancellation')
  controller.abort(reason)
  const f = fixture()
  await assert.rejects(f.instance.summarize({ messages: [] }, f.agent, controller.signal), error => error === reason)
  assert.equal(f.calls.length, 0)
})

test('abort during stream rejects even if an adapter still yields complete text', async () => {
  const controller = new AbortController(), reason = new Error('synthetic midstream cancellation')
  const f = fixture({ afterChunk: () => controller.abort(reason) })
  await assert.rejects(f.instance.summarize({ messages: [] }, f.agent, controller.signal), error => error === reason)
  assert.equal(f.calls.length, 1)
  assert.equal(f.calls[0].signal, controller.signal)
})

for (const kind of ['error', 'aborted']) test(`${kind} finish rejects partial text and preserves structured failure`, async () => {
  const failure = freeze({ message: 'synthetic provider failure', code: kind === 'error' ? 'RATE_LIMIT' : 'ABORTED', retryAfterMs: 123 })
  const f = fixture({ chunks: [{ blocks: [text('partial output')], finish: { kind, failure } }] })
  await assert.rejects(f.instance.summarize({ messages: [] }, f.agent), error => {
    assert(error instanceof FakeLlmError); assert.equal(error.message, failure.message)
    assert.equal(error.code, failure.code); assert.equal(error.failure, failure); return true
  })
})

test('stream exception is propagated unchanged; no retry or synthetic checkpoint is manufactured', async () => {
  const error = new Error('synthetic stream failure'), f = fixture({ streamError: error })
  await assert.rejects(f.instance.summarize({ messages: [] }, f.agent), actual => actual === error)
  assert.equal(f.calls.length, 1)
})

test('max-tokens finish rejects nonempty but truncated output', async () => {
  const f = fixture({ chunks: [{ blocks: [text('unfinished checkpoint')], finish: { kind: 'max-tokens' } }] })
  await assert.rejects(f.instance.summarize({ messages: [] }, f.agent), error => error.code === 'MAX_TOKENS')
})

for (const [name, blocks] of [
  ['empty', []], ['whitespace', [text(' \n\t')]], ['reasoning-only', [{ type: 'reasoning', text: 'not a checkpoint' }]],
]) test(`${name} assembled output is rejected instead of erasing the conversation`, async () => {
  const f = fixture({ chunks: [{ blocks }] })
  await assert.rejects(f.instance.summarize({ messages: [] }, f.agent), /contained no text/)
})

for (const block of [
  { type: 'tool-call', callId: 'new-action', name: 'search', arguments: {} },
  { type: 'tool-result', callId: 'invented-action', content: [text('invented result')] },
  { type: 'image', url: 'https://example.invalid/image.png' },
  { type: 'audio', data: 'synthetic' },
]) test(`non-text ${block.type} output is rejected even alongside valid text`, async () => {
  const f = fixture({ chunks: [{ blocks: [text('valid text is not enough'), block] }] })
  await assert.rejects(f.instance.summarize({ messages: [] }, f.agent), error => {
    assert(error instanceof FakeLlmError); assert.equal(error.code, 'UNSUPPORTED_CONTENT'); return true
  })
  assert.equal(f.calls.length, 1)
})
