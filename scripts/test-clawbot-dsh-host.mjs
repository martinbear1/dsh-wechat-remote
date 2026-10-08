/** Isolated contract fixtures; never loads a profile, real session or model. */
import assert from 'node:assert/strict'
import test from 'node:test'
import { build } from 'esbuild'
import { fileURLToPath } from 'node:url'
import { pathToFileURL } from 'node:url'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'

const { outputFiles } = await build({ entryPoints: [fileURLToPath(new URL('../src/clawbot/dsh-host.ts', import.meta.url))],
  bundle: true, write: false, platform: 'node', format: 'esm', target: 'node22' })
const { DshClawbotHost, DshClawbotHostError } = await import('data:text/javascript;base64,' + Buffer.from(outputFiles[0].contents).toString('base64'))
const signal = () => new AbortController().signal
const input = (sessionId = 's1', requestId = 'r1') => ({ sessionId, requestId, text: 'my request', expectedGeneration: 100 })
const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b }); return { promise, resolve, reject } }
function fixture() {
  const listeners = new Map(), nativeCalls = [], started = deferred(), sessions = new Map(), agents = new Map()
  const session = (id, createdAt = 100) => ({ id, header: { id, createdAt, cwd: 'fixture-workspace' }, seq: 40 })
  sessions.set('s1', session('s1')); sessions.set('other', session('other'))
  const metadata = new Map([...sessions].map(([id, s]) => [id, { header: s.header, cursor: s.seq - 1 }]))
  const h = {
    rows: [{ sessionId: 's1', cwd: 'fixture-workspace', projections: { values: { title: 'Target' } } }],
    archived: [], observersDisposed: 0, prompt: async () => ({ accepted: true }),
    emit(name, ...args) { for (const listener of [...listeners.get(name) ?? []]) listener(...args) },
    event(type, data, id = 's1') { const s = sessions.get(id); h.emit('session/event', s, { seq: s.seq++, type, data }) },
    turn(turn = 3, requestId = 'r1') {
      h.event('turn/start', { turn })
      h.event('user/message', { id: 'm-' + requestId, source: { kind: 'user', rpcId: requestId }, content: [{ type: 'text', text: 'my request' }] })
    },
    assistant(text = 'the answer', turn = 3, extra = []) {
      h.event('assistant/message', { turn, step: 1, message: { content: [{ type: 'text', text }, ...extra] } })
    },
    end(turn = 3, kind = 'completed') { h.event('turn/end', { turn, reason: { kind } }) },
    listenerCount: () => [...listeners.values()].reduce((n, set) => n + set.size, 0),
    nativeCalls, sessions, agents, metadata, started: started.promise,
  }
  const services = {
    workspaceRegistry: { get archivedSessionIds() { return h.archived } },
    sessions: { get: id => sessions.get(id) }, agents: { get: id => agents.get(id) },
    sessionQuery: { async observeSession(id, options) {
      assert.equal(options.projectionMode, 'none')
      return { ...metadata.get(id), get events() { throw Error('Historical body must never be accessed') },
        [Symbol.dispose]() { h.observersDisposed++ } }
    } },
    typertGateway: { async invoke(request) {
      nativeCalls.push(request)
      if (request.namespace === 'session' && request.method === 'list') return { items: h.rows }
      assert.equal(request.namespace, 'session'); assert.equal(request.method, 'prompt')
      started.resolve(request)
      return h.prompt(request)
    } },
  }
  h.ctx = {
    get: name => services[name],
    on(name, listener, options) {
      assert.equal(options.global, true)
      const set = listeners.get(name) ?? new Set(); set.add(listener); listeners.set(name, set)
      return () => set.delete(listener)
    },
  }
  h.host = new DshClawbotHost(h.ctx)
  h.calls = () => nativeCalls.filter(c => c.method === 'prompt')
  return h
}
const failure = (code, submission) => error => {
  assert(error instanceof DshClawbotHostError)
  assert.equal(error.code, 'clawbot-host/' + code)
  if (submission) assert.equal(error.submission, submission)
  return true
}

test('directory includes ordinary cold/fork sessions, excludes archive/subagent and does no mutation', async () => {
  const h = fixture()
  h.rows.push({ sessionId: 'cold', cwd: 'fixture', agentAvailable: false },
    { sessionId: 'fork', cwd: 'fixture', parentSessionId: 'parent', projections: { values: { title: 'Fork' } } },
    { sessionId: 'child', cwd: 'fixture', origin: 'subagent' }, { sessionId: 'archived', cwd: 'fixture' }, { sessionId: 'no-workspace' })
  h.archived.push('archived')
  assert.deepEqual(await h.host.listSessions(signal()), [
    { id: 's1', title: 'Target' }, { id: 'cold', title: '未命名会话' }, { id: 'fork', title: 'Fork' },
  ])
  assert.equal(h.nativeCalls.length, 1); assert.equal(h.nativeCalls[0].method, 'list')
  assert.equal(h.listenerCount(), 0)
})

test('session picker grouping uses registered workspace membership and never exposes the directory path', async () => {
  const h = fixture(), registry = h.ctx.get('workspaceRegistry')
  registry.list = () => [{id:'workspace-1',name:'Project',path:'C:/private/Project',sessionIds:['s1']}]
  assert.deepEqual(await h.host.listSessions(signal()),[{id:'s1',title:'Target',workspaceId:'workspace-1',workspaceTitle:'Project'}])
  registry.list = () => [{id:'workspace-1',path:'C:/private/Project',sessionIds:['s1']}]
  assert.equal((await h.host.listSessions(signal()))[0].workspaceTitle,'Project')
  assert.equal(h.calls().length,0)
})

test('accepted is not completion; correlate exact request and return only final durable text', async () => {
  const h = fixture(), promise = h.host.run(input(), signal())
  let done = false; promise.finally(() => { done = true })
  const request = await h.started
  await Promise.resolve()
  assert.equal(done, false)
  assert.deepEqual(request.args, { request: { sessionId: 's1', requestId: 'r1', mode: 'queue', content: [{ type: 'text', text: 'my request' }] } })
  h.event('assistant/message', { turn: 2, message: { content: [{ type: 'text', text: 'other session secret' }] } }, 'other')
  h.emit('session/event', h.sessions.get('s1'), { seq: 2, type: 'assistant/message', data: { turn: 1, message: { content: [{ type: 'text', text: 'historical secret' }] } } })
  h.turn()
  h.event('assistant/chunk', { chunk: { type: 'reasoning-delta', text: 'thinking' } })
  h.assistant('tool preface', 3, [{ type: 'tool-call', name: 'read' }])
  h.event('tool/result', { turn: 3, message: { content: [{ type: 'text', text: 'tool secret' }] } })
  h.assistant('final answer', 3, [{ type: 'reasoning', text: 'reasoning secret' }])
  h.end()
  assert.deepEqual(await promise, { text: 'final answer' })
  assert.equal(h.calls().length, 1); assert.equal(h.listenerCount(), 0); assert.equal(h.observersDisposed, 1)
})

test('selection snapshots native generation without accessing historical bodies or activating an Agent', async () => {
  const h = fixture(); h.sessions.delete('s1')
  assert.deepEqual(await h.host.describeSession('s1', signal()), { id: 's1', title: 'Target', generation: 100 })
  assert.deepEqual(h.nativeCalls.map(c => c.method), ['list'])
  assert.equal(h.observersDisposed, 1); assert.equal(h.listenerCount(), 0)
})

test('old queued selection is rejected before native admission after same-id reset', async () => {
  const h = fixture(); h.metadata.get('s1').header.createdAt++
  await assert.rejects(h.host.run(input(), signal()), failure('session-changed', 'not-submitted'))
  assert.equal(h.calls().length, 0); assert.equal(h.listenerCount(), 0)
})

test('hot generation is checked immediately before dispatch even if observed metadata became stale', async () => {
  const h = fixture(); h.sessions.set('s1', { id: 's1', header: { ...h.metadata.get('s1').header, createdAt: 101 }, seq: 40 })
  await assert.rejects(h.host.run(input(), signal()), failure('session-changed', 'not-submitted'))
  assert.equal(h.calls().length, 0); assert.equal(h.listenerCount(), 0)
})

test('legacy inputs without a generation are not silently rebound', async () => {
  const h = fixture(), legacy = input(); delete legacy.expectedGeneration
  await assert.rejects(h.host.run(legacy, signal()), failure('invalid-input', 'not-submitted'))
  assert.equal(h.nativeCalls.length, 0)
})

test('cold session is resumed only by native prompt; no history or custom Agent construction', async () => {
  const h = fixture(), s = h.sessions.get('s1'); h.sessions.delete('s1')
  h.prompt = async () => { h.sessions.set('s1', s); h.turn(); h.assistant(); h.end(); return { accepted: true } }
  assert.deepEqual(await h.host.run(input(), signal()), { text: 'the answer' })
  assert.deepEqual(h.nativeCalls.map(c => c.method), ['list', 'prompt'])
})

test('completion may race acknowledgement without absorbing a later user turn', async () => {
  const h = fixture(), receipt = deferred()
  h.prompt = () => receipt.promise
  const promise = h.host.run(input(), signal()); await h.started
  h.turn(); h.assistant('mine'); h.end()
  h.turn(4, 'someone-else'); h.assistant('later secret', 4); h.end(4)
  receipt.resolve({ accepted: true })
  assert.deepEqual(await promise, { text: 'mine' })
})

test('unmatched turns never become the requested reply', async () => {
  const h = fixture(), promise = h.host.run(input(), signal()); await h.started
  h.turn(3, 'not-r1'); h.assistant('another request'); h.end()
  h.turn(4); h.assistant('mine', 4); h.end(4)
  assert.deepEqual(await promise, { text: 'mine' })
})

for (const before of [true, false]) test(`foreign input ${before ? 'before' : 'after'} target in same turn fails closed`, async () => {
  const h = fixture(), promise = h.host.run(input(), signal()), rejected = assert.rejects(promise, failure('ambiguous-turn'))
  await h.started
  if (before) h.turn(3, 'foreign'); else h.turn()
  h.event('user/message', { id: 'second', source: { kind: 'user', rpcId: before ? 'r1' : 'foreign' }, content: [{ type: 'text', text: 'my request' }] })
  h.assistant('mixed private reply'); h.end()
  await rejected; assert.equal(h.listenerCount(), 0); assert.equal(h.calls().length, 1)
})

for (const [type, data, code] of [
  ['approval/asked', { id: 'approval-1', toolName: 'shell' }, 'approval-required'],
  ['tool/call', { name: 'ask_user_question', turn: 3 }, 'question-required'],
]) test(`${code} hands off without native approval or cancellation`, async () => {
  const h = fixture(), promise = h.host.run(input(), signal()), rejected = assert.rejects(promise, failure(code))
  await h.started; h.turn(); h.event(type, data)
  await rejected; assert.equal(h.listenerCount(), 0); assert.deepEqual(h.nativeCalls.map(c => c.method), ['list', 'prompt'])
})

test('preexisting running/queued Agent is busy and sends nothing', async () => {
  for (const state of [{ status: 'running' }, { inbox: { nextTurn: [{}], nextStep: [] } }]) {
    const h = fixture(); h.agents.set('s1', state)
    await assert.rejects(h.host.run(input(), signal()), failure('busy', 'not-submitted'))
    assert.equal(h.calls().length, 0); assert.equal(h.listenerCount(), 0)
  }
})

test('native writer conflict is identifiable and never retried', async () => {
  const h = fixture(); h.prompt = async () => { throw Object.assign(Error('private diagnostic'), { code: 'session/writer-held' }) }
  await assert.rejects(h.host.run(input(), signal()), error => {
    failure('busy', 'unknown')(error); assert(!error.message.includes('private diagnostic')); return true
  })
  assert.equal(h.calls().length, 1); assert.equal(h.listenerCount(), 0)
})

test('external abort detaches observer but never aborts native admission or cancels task', async () => {
  const h = fixture(), receipt = deferred(), controller = new AbortController()
  h.prompt = () => receipt.promise
  const promise = h.host.run(input(), controller.signal), rejected = assert.rejects(promise, failure('observation-stopped', 'unknown'))
  const request = await h.started; controller.abort(); await rejected
  assert.equal(request.signal.aborted, false); assert.equal(h.listenerCount(), 0)
  h.turn(); h.assistant('late reply'); h.end(); receipt.resolve({ accepted: true })
  await Promise.resolve(); assert.deepEqual(h.nativeCalls.map(c => c.method), ['list', 'prompt'])
})

test('unknown receipt fails without resend or historical fallback', async () => {
  const h = fixture(); h.prompt = async () => ({ ok: true })
  await assert.rejects(h.host.run(input(), signal()), failure('delivery-unknown', 'unknown'))
  assert.equal(h.calls().length, 1); assert.equal(h.listenerCount(), 0)
})

test('changed session generation prevents disclosure', async () => {
  const h = fixture(), promise = h.host.run(input(), signal()), rejected = assert.rejects(promise, failure('session-changed'))
  await h.started; h.sessions.get('s1').header.createdAt++
  h.turn(); h.assistant('new session secret'); h.end(); await rejected
  assert.equal(h.listenerCount(), 0)
})

for (const kind of ['cancelled', 'blocked', 'error', 'max-tokens']) test(`${kind} is not successful completion`, async () => {
  const h = fixture(), promise = h.host.run(input(), signal()), rejected = assert.rejects(promise, failure('interrupted'))
  await h.started; h.turn(); h.assistant('partial text'); h.end(3, kind); await rejected
})

test('tool-call and reasoning-only messages are never returned as a final answer', async () => {
  const h = fixture(), promise = h.host.run(input(), signal()), rejected = assert.rejects(promise, failure('output-unavailable'))
  await h.started; h.turn(); h.assistant('not final', 3, [{ type: 'tool-call', name: 'done' }]); h.end(); await rejected
})

test('invalid, missing, archived and subagent selections never dispatch', async () => {
  for (const mutate of [h => { h.rows = [] }, h => { h.archived = ['s1'] }, h => { h.rows[0].origin = 'subagent' }]) {
    const h = fixture(); mutate(h)
    await assert.rejects(h.host.run(input(), signal()), failure('not-found'))
    assert.equal(h.calls().length, 0)
  }
  const h = fixture()
  await assert.rejects(h.host.run({ ...input(), text: ' ' }, signal()), failure('invalid-input'))
  assert.equal(h.nativeCalls.length, 0)
})

test('installed native prompt schema, SessionController and AgentLoop preserve request/turn correlation',
  { skip: !process.env.HARNESS_DSH_ASAR }, async () => {
    // Deliberately requires an explicit archive; no live profile discovery or
    // installed SDK imports through the repository's older development SDK.
    const archive = process.env.HARNESS_DSH_ASAR
    const work = fs.mkdtempSync(path.join(os.tmpdir(), 'clawbot-native-host-'))
    const fd = fs.openSync(archive, 'r')
    let ctx
    try {
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
      const anchor = path.join(work, 'dsh/node_modules/@deepseek-ai/dsh/package.json')
      const require = createRequire(anchor), load = name => import(pathToFileURL(require.resolve(name)).href)
      const { Context } = await load('@deepseek-ai/cordis')
      const { SessionStore } = await load('@deepseek-ai/dsh-session')
      const { default: AgentRegistry } = await load('@deepseek-ai/dsh-agent')
      const { AgentLoop } = await load('@deepseek-ai/dsh-agent-loop')
      const { ToolRuntime } = await load('@deepseek-ai/dsh-tools')
      const { SystemPrompt } = await load('@deepseek-ai/dsh-system-prompt')
      const { default: Projections } = await load('@deepseek-ai/dsh-session-projection')
      const { SessionController } = await load('@deepseek-ai/dsh-api-session-controller')
      const { TYPERT } = await load('@deepseek-ai/dsh-api-session-controller/typert')
      const { default: Typert } = await load('@deepseek-ai/dsh-typert-registry')
      const schema = TYPERT.invocations.find(v => v.namespace === 'session' && v.method === 'prompt').parameters[0].codec.create()
      // No generation CAS exists: its generated Zod object strips this unknown
      // field instead of conveying it to the native admission implementation.
      assert.equal(schema.parse({ sessionId: 'fixture', requestId: 'r', mode: 'queue',
        content: [{ type: 'text', text: 'fixture' }], expectedGeneration: 123 }).expectedGeneration, undefined)
      ctx = new Context()
      new SystemPrompt(ctx, {}); new SessionStore(ctx); new Projections(ctx); new AgentRegistry(ctx)
      new ToolRuntime(ctx, { mode: 'native' }); new Typert(ctx)
      const model = { provider: 'fixture', model: 'no-network' }
      let modelCalls = 0, nativePrompts = 0
      ctx.provide('llm', { listProviders: () => [{ id: 'fixture' }], resolveCallConfig: async v => v,
        resolveModelInfo: async () => ({ inputModalities: ['text'] }),
        async prepareCall(config) { return { config, stream: request => this.stream(request) } },
        async *stream() { modelCalls++; yield { type: 'reasoning-delta', index: 0, text: 'private reasoning' }
          yield { type: 'text-delta', index: 1, text: 'native final reply' }; yield { type: 'finish', reason: 'stop' } } })
      ctx.provide('agentDefaultModel', { currentSelection: () => model })
      ctx.provide('attachments', { admitPromptContent: async v => structuredClone(v) })
      ctx.provide('fileUploads', { registerAgentResolver: () => () => {}, resolve: () => { throw Error('no files') },
        bindPrompt: () => ({ commit() {}, [Symbol.dispose]() {} }) })
      ctx.provide('workspaceRegistry', { archivedSessionIds: [], list: () => [], get: () => undefined })
      ctx.provide('fs', { resolve() { throw Error('no filesystem tools') } })
      let agent
      ctx.provide('sessionQuery', { listSessions: async () => agent ? [{ header: agent.session.header }] : [],
        async observeSession(sessionId) { assert.equal(sessionId, agent.id); return { header: agent.session.header,
          cursor: agent.session.seq - 1, get events() { throw Error('no old transcript reads') }, [Symbol.dispose]() {} } } })
      const loop = new AgentLoop(ctx, { agents: [], maxParallelToolCalls: { get: () => 10 } })
      const controller = new SessionController(ctx)
      agent = await loop.create('clawbot-native-fixture', model, { cwd: work })
      ctx.systemPrompt.context({ name: 'fixture-context', order: 1, text: () => 'Native runtime context, not user input.' })
      ctx.provide('typertGateway', { invoke({ namespace, method, args, signal }) {
        assert.equal(namespace, 'session')
        if (method === 'list') return controller.list(args._request, signal)
        assert.equal(method, 'prompt'); nativePrompts++
        return controller.prompt(schema.parse(args.request), signal)
      } })
      const host = new DshClawbotHost(ctx), beforeTools = JSON.stringify(ctx.tools.schemas(agent))
      const target = await host.describeSession(agent.id, AbortSignal.timeout(5000))
      const result = await host.run({ sessionId: agent.id, requestId: 'clawbot-native-request', text: 'fixture request', expectedGeneration: target.generation }, AbortSignal.timeout(5000))
      await agent.whenIdle()
      assert.deepEqual(result, { text: 'native final reply' })
      assert.equal(nativePrompts, 1); assert.equal(modelCalls, 1)
      assert.equal(JSON.stringify(ctx.tools.schemas(agent)), beforeTools)
      const events = agent.session.snapshotEvents()
      assert.equal(events.find(e => e.type === 'user/message' && e.data.source.kind === 'user').data.source.rpcId, 'clawbot-native-request')
      assert(events.some(e => e.type === 'user/message' && e.data.source.kind === 'runtime-context'))
      assert.equal(events.at(-1).type, 'turn/end')
      assert.equal(events.at(-1).data.reason.kind, 'completed')
    } finally {
      await ctx?.fiber.dispose(); fs.closeSync(fd)
      assert.equal(path.dirname(path.resolve(work)), path.resolve(os.tmpdir()))
      assert(path.basename(work).startsWith('clawbot-native-host-'))
      fs.rmSync(work, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 })
    }
  })
