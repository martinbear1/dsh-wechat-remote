/** All writes are synthetic and confined to a disposable directory. Optional
 * installed-archive verification executes DSH modules, never a real profile or
 * the reference importer. HARNESS_HISTORY_IMPORT_EXISTING is read-only: only
 * counts/schema coordinates and a native validation error leave memory. */
import assert from 'node:assert/strict'
import test from 'node:test'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import zlib from 'node:zlib'
import { createRequire } from 'node:module'
import { pathToFileURL, fileURLToPath } from 'node:url'
import { createHash, randomUUID } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { build } from 'esbuild'

const entry = fileURLToPath(new URL('../src/history-import/native.ts', import.meta.url))
const compiled = await build({ entryPoints: [entry], bundle: true, write: false, platform: 'node', format: 'esm', target: 'node22' })
const pure = await import('data:text/javascript;base64,' + Buffer.from(compiled.outputFiles[0].contents).toString('base64'))
const conversation = (messages = [
  { id: 'u1', parentId: null, role: 'user', text: 'Remember my fictional companion is Blue.', reasoning: '', fragments: [], metadata: {}, warnings: [] },
  { id: 'a1', parentId: 'u1', role: 'assistant', text: 'Blue is waiting beside the river.', reasoning: 'Public visible reasoning.', fragments: [], metadata: {}, warnings: [] },
]) => ({ id: 'source-conversation', title: 'Synthetic history', messages, leafIds: [messages.at(-1).id], warnings: [] })
const request = (extra = {}) => ({ sessionId: `session-dsimport-${randomUUID()}`, workspaceId: 'fixture-workspace', sourceHash: 'a'.repeat(64), conversation: conversation(), ...extra })
const searchConversation = () => {
  const value = conversation()
  value.messages[1].fragments = [
    { type: 'THINK', content: 'First reasoning.\n', data: {} },
    { type: 'TOOL_SEARCH', content: 'Searching original sources', data: { id: 1, status: 'FINISHED', queries: [{ query: 'Blue river' }], results: [
      { url: 'https://example.org/river', title: 'The river', snippet: 'Blue waits by the river.', cite_index: null },
      { url: 'https://example.org/bridge', title: 'The bridge', snippet: 'A bridge crosses the river.', cite_index: null },
    ] } },
    { type: 'THINK', content: 'Second reasoning after search.  ', data: {} },
    { type: 'TOOL_OPEN', data: { id: 2, status: 'FINISHED', result: { url: 'https://example.org/river', title: 'The river', snippet: 'Blue waits by the river.' }, reference: { id: 1, type: 'TOOL_SEARCH' } } },
    { type: 'RESPONSE', content: 'Blue is there[reference:0].\n\n', data: { references: [{ id: 2, type: 'TOOL_OPEN' }] } },
  ]
  return value
}
const longConversation = () => conversation(Array.from({ length: 2000 }, (_, index) => ({
  id: `message-${index}`, parentId: index ? `message-${index - 1}` : null, role: index % 2 ? 'assistant' : 'user',
  text: `原始角色扮演第 ${index} 条正文。\n保留空格  与 emoji 🐬。`, reasoning: '',
  fragments: [{ type: index % 2 ? 'RESPONSE' : 'REQUEST', content: `原始角色扮演第 ${index} 条正文。\n保留空格  与 emoji 🐬。`, data: {} }], metadata: {}, warnings: [],
})))
test('import seed reserves an empty native system head and retains exact roles/text/reasoning', () => {
  const r = request(), seed = pure.buildNativeImportSeed(r, 1000)
  const surface = seed.filter(event => event.surfaceOp === 'append')
  assert.equal(surface[0].type, 'system/message'); assert.deepEqual(surface[0].data.message.content, [])
  assert.equal(surface[1].data.content[0].text, r.conversation.messages[0].text)
  assert.deepEqual(surface[2].data.message.content, [{ type: 'reasoning', text: r.conversation.messages[1].reasoning }, { type: 'text', text: r.conversation.messages[1].text }])
  assert.equal(seed.filter(e => e.type === 'tool/call' || e.type === 'tool/result' || e.type === 'request/header').length, 0)
  assert.equal(seed.filter(e => e.type.startsWith('permission/') || e.type.startsWith('sandbox/')).length, 0)
  const marker = seed.at(-1)
  assert.equal(marker.data.prefixCount, marker.seq)
  assert.equal(marker.data.prefixHash, createHash('sha256').update(JSON.stringify(seed.slice(0, -1))).digest('hex'))
})
test('archived search and file metadata do not forge host tools/attachments', () => {
  const r = request(); r.conversation.messages[1].fragments = [{ type: 'SEARCH', content: 'query', data: { results: [{ title: 'Reference', url: 'https://example.org', snippet: 'Public fact' }] } },
    { type: 'FILE', files: [{ name: '../source.pdf', metadata: {} }], data: {} }]
  const seed = pure.buildNativeImportSeed(r, 1000), message = seed.find(e => e.type === 'assistant/message').data.message
  assert(message.content.every(block => ['text', 'reasoning'].includes(block.type)))
  assert(message.content.some(block => block.text.includes('Public fact')))
  assert(message.content.some(block => block.text.includes('源文件未包含')))
  assert(message.content.every(block => !block.text.includes('"results":')))
  assert.equal(seed.some(event => event.type === 'tool/call' || event.type === 'tool/result'), false)
  assert(seed.some(e => e.type.endsWith('/record') && e.ignorable === true))
})
test('unknown roles and caller-selected existing IDs never pass seed admission', () => {
  const r = request(); r.conversation.messages[0].role = 'unknown'
  assert.throws(() => pure.buildNativeImportSeed(r), /unsupported-message-role/)
  assert.throws(() => pure.buildNativeImportSeed(request({ sessionId: 'existing-user-session' })), /invalid-identity/)
})
test('interleaved public reasoning, search and response retain source order and exact fragment bytes', () => {
  const r = request({ conversation: searchConversation() }), fragments = r.conversation.messages[1].fragments
  const events = pure.buildNativeImportSeed(r), visible = events.filter(e => ['assistant/message', 'tool/result'].includes(e.type))
  assert.deepEqual(visible.map(e => e.data.message.role), ['assistant', 'tool', 'assistant', 'tool', 'assistant'])
  const first = visible[0].data.message.content, middle = visible[2].data.message.content, last = visible[4].data.message.content
  assert.deepEqual(first.map(b => b.type), ['reasoning', 'tool-call'])
  assert.equal(first[0].text, fragments[0].content)
  assert.equal(middle[0].text, fragments[2].content)
  assert.match(last.at(-1).text, /https:\/\/example\.org\/river/)
  assert.match(visible[1].data.message.content[0].text, /未重新检索/)
  assert.deepEqual(JSON.parse(first[1].arguments), { queries: ['Blue river'] })
  assert.equal(events.filter(e => e.type === 'tool/call').length, 2)
  assert.deepEqual(JSON.parse(middle[1].arguments), { url: 'https://example.org/river' })
  assert.equal(visible[3].data.meta, undefined, 'TOOL_OPEN has no HTTP status and must use generic native presentation')
  assert.match(visible[3].data.message.content[0].text, /历史摘录，非完整正文/)
  assert.equal(visible[1].data.meta.sources.length, fragments[1].data.results.length)
  assert.equal(visible[1].data.meta.truncated, false)
  assert.match(visible[1].data.meta.answer, /原始检索是否截断未知/)
  assert.deepEqual(events.find(e => e.type.endsWith('/record') && e.data.index === 1).data.fragments, fragments)
})

test('incomplete, unverified and partly unsafe searches never invent a native tool execution', () => {
  for (const change of [part => { delete part.data.queries }, part => { delete part.data.status },
    part => { part.data.status = 'RUNNING' }, part => { part.data.queries = [{ query: '' }] },
    part => { part.data.results.push({ url: 'javascript:alert(1)', title: 'Unsafe' }) }]) {
    const r = request({ conversation: searchConversation() }); change(r.conversation.messages[1].fragments[1])
    const events = pure.buildNativeImportSeed(r)
    assert.equal(events.some(e => e.type === 'tool/call' && e.data.name === 'web_search'), false)
    assert.equal(events.some(e => e.type === 'request/header'), false)
    assert.deepEqual(events.find(e => e.type.endsWith('/record') && e.data.index === 1).data.fragments, r.conversation.messages[1].fragments)
  }
  for (const change of [part => { delete part.data.status }, part => { part.data.result = null },
    part => { part.data.result.url = 'javascript:alert(1)' }]) {
    const r = request({ conversation: searchConversation() }); change(r.conversation.messages[1].fragments[3])
    assert.equal(pure.buildNativeImportSeed(r).some(e => e.type === 'tool/call' && e.data.name === 'web_fetch'), false)
  }
})

test('web UI tips are archived, not impersonated as assistant response content', () => {
  const r = request(), tip = { type: 'TIP', content: 'Source website UI advice', data: { style: 'UNKNOWN' } }
  r.conversation.messages[1].fragments = [tip, { type: 'RESPONSE', content: 'Actual response.', data: {} }]
  const events = pure.buildNativeImportSeed(r)
  assert.deepEqual(events.find(event => event.type === 'assistant/message').data.message.content, [{ type: 'text', text: 'Actual response.' }])
  assert.deepEqual(events.find(event => event.type.endsWith('/record') && event.data.index === 1).data.fragments[0], tip)
})

test('native seed byte limit accepts exactly 24 MiB and rejects one extra byte without truncating', () => {
  const r = request(); r.conversation = conversation([{ ...r.conversation.messages[0], text: 'a' }])
  const limit = 24 * 1024 * 1024, base = pure.buildNativeImportSeed(r, 1000)
  const length = limit - Buffer.byteLength(JSON.stringify(base)) + 1
  r.conversation.messages[0].text = 'a'.repeat(length)
  assert.equal(Buffer.byteLength(JSON.stringify(pure.buildNativeImportSeed(r, 1000))), limit)
  r.conversation.messages[0].text += 'a'
  assert.throws(() => pure.buildNativeImportSeed(r, 1000), /conversation-too-large/)
  assert.equal(r.conversation.messages[0].text.length, length + 1)
})
test('display title limits do not discard the original title or timestamp metadata', () => {
  const r = request(), title = '  原始长标题'.repeat(80)
  r.conversation.title = title
  r.conversation.metadata = { inserted_at: '2026-10-01T01:02:03.123456Z', model_type: 'unknown-web-route' }
  const events = pure.buildNativeImportSeed(r), origin = events[0].data
  assert.equal(origin.originalTitle, title)
  assert.deepEqual(origin.metadata, r.conversation.metadata)
  assert(events.find(e => e.type === 'session/title').data.title.length <= 160)
})

test('an explicit new-session title changes only presentation, preserving source and original message bytes', () => {
  const r = request({ title: '  我的角色续聊  ' }), original = structuredClone(r.conversation)
  const events = pure.buildNativeImportSeed(r), origin = events[0].data
  assert.equal(origin.title, '我的角色续聊'); assert.equal(origin.originalTitle, original.title)
  assert.equal(events.find(e => e.type === 'session/title').data.title, '我的角色续聊')
  assert.deepEqual(r.conversation, original)
  const body = events.find(e => e.type === 'assistant/message').data.message.content
  assert.equal(body.at(-1).text, original.messages[1].text)
  for (const title of ['', ' ', 'a'.repeat(161), '换\n行', '控制\u0085', null]) {
    assert.throws(() => pure.buildNativeImportSeed(request({ title })), /invalid-title/)
  }
})
test('empty user tail and multiple assistants have closed monotone turn/step boundaries', () => {
  const items = conversation().messages
  const seed = pure.buildNativeImportSeed(request({ conversation: conversation([...items, { ...items[1], id: 'a2', parentId: 'a1' },
    { ...items[0], id: 'u2', parentId: 'a2', text: '' }]) }))
  assert.deepEqual(seed.filter(e => e.type === 'step/start').map(e => e.data), [{ turn: 1, step: 1 }, { turn: 1, step: 2 }])
  assert.deepEqual(seed.filter(e => e.type === 'turn/end').map(e => e.data.turn), [1, 2])
})
test('one thousand turns are retained in full without importer summarization or text rewriting', () => {
  const r = request({ conversation: longConversation() }), events = pure.buildNativeImportSeed(r)
  const messages = events.filter(e => ['user/message', 'assistant/message'].includes(e.type)).map(e => e.type === 'user/message' ? e.data : e.data.message)
  assert.equal(messages.length, 2000)
  for (const [index, message] of messages.entries()) {
    assert.equal(message.role, r.conversation.messages[index].role)
    assert.equal(message.content[0].text, r.conversation.messages[index].text)
  }
  assert.equal(events.some(e => e.type.startsWith('compaction/') || e.type === 'tool/call'), false)
})

test('installed native factory, cold reader, actual continuation, isolation and read-only old import diagnosis',
  { skip: !process.env.HARNESS_DSH_ASAR }, async () => {
  // Windows locks loaded native DLLs until process exit. The parent owns the
  // scratch directory and removes it only after the isolated child exits.
  if (!process.env.HARNESS_NATIVE_IMPORT_CHILD_WORK) {
    const work = fs.mkdtempSync(path.join(os.tmpdir(), 'history-import-native-'))
    try {
      const environment = { ...process.env, HARNESS_NATIVE_IMPORT_CHILD_WORK: work }
      delete environment.NODE_TEST_CONTEXT
      const child = spawnSync(process.execPath, ['--test', '--test-name-pattern=installed native factory', fileURLToPath(import.meta.url)], {
        env: environment, encoding: 'utf8', timeout: 60000, maxBuffer: 1024 * 1024,
      })
      if (child.stdout) console.log(child.stdout)
      assert.equal(child.status, 0, child.stderr || child.error?.message)
      assert.match(child.stdout, /"installedNativeImport":true/)
    } finally {
      assert.equal(path.dirname(path.resolve(work)), path.resolve(os.tmpdir()))
      assert(path.basename(work).startsWith('history-import-native-')); fs.rmSync(work, { recursive: true, force: true })
    }
    return
  }
  const work = process.env.HARNESS_NATIVE_IMPORT_CHILD_WORK
  let ctx, createCalls = 0, modelCalls = 0, networkCalls = 0, toolExecutions = 0
  const originalFetch = globalThis.fetch
  globalThis.fetch = async () => { networkCalls++; throw Error('No network permitted in native import test') }
  try {
    const archive = process.env.HARNESS_DSH_ASAR, fd = fs.openSync(archive, 'r')
    try {
      const prefix = Buffer.alloc(16); fs.readSync(fd, prefix, 0, 16, 0)
      const bytes = Buffer.alloc(prefix.readUInt32LE(12)); fs.readSync(fd, bytes, 0, bytes.length, 16)
      const tree = JSON.parse(bytes), start = 8 + prefix.readUInt32LE(4)
      const copy = (node, relative) => {
        const target = path.resolve(work, relative); assert(target.startsWith(work + path.sep)); assert(!node.link)
        if (node.files) { for (const [name, child] of Object.entries(node.files)) copy(child, path.join(relative, name)) }
        else if (/\.(?:[mc]?js|json|node|dll|wasm|ya?ml)$/.test(relative)) {
          fs.mkdirSync(path.dirname(target), { recursive: true })
          if (node.unpacked) fs.copyFileSync(path.join(archive + '.unpacked', relative), target)
          else { const bytes = Buffer.alloc(node.size); fs.readSync(fd, bytes, 0, bytes.length, start + Number(node.offset)); fs.writeFileSync(target, bytes) }
        }
      }
      copy(tree.files.dsh, 'dsh')
    } finally { fs.closeSync(fd) }
    const anchor = path.join(work, 'dsh/node_modules/@deepseek-ai/dsh/package.json'), require = createRequire(anchor)
    const load = name => import(pathToFileURL(require.resolve('@deepseek-ai/' + name)).href)
    const { Context } = await load('cordis'), { SessionStore, Session } = await load('dsh-session')
    const { default: Agents } = await load('dsh-agent'), { AgentLoop } = await load('dsh-agent-loop')
    const { default: Projections } = await load('dsh-session-projection'), { SystemPrompt } = await load('dsh-system-prompt')
    const { ToolRuntime } = await load('dsh-tools'), { default: Persistence } = await load('dsh-session-persistence-jsonl')
    const { sessionFormatCatalog: catalog } = await load('dsh-session-format-catalog'), { createUserMessage } = await load('dsh-llm')
    const { PluginPackages, createRuntimeResolution } = await load('dsh-app-boot')
    const { presentSearchResult, presentFetchResult } = await load('dsh-tool-web')
    // Match a profile-installed plugin: no host packages in its ancestor
    // node_modules. Resolution must come from the official host, not a test
    // alias, custom resolver, symlink, bundled copy, or import beside dsh.
    const profileDir = path.join(work, 'home/profiles/web')
    const pluginDir = path.join(profileDir, 'node_modules/@harness-remote/import-fixture')
    fs.mkdirSync(pluginDir, { recursive: true })
    fs.writeFileSync(path.join(pluginDir, 'package.json'), JSON.stringify({ name: '@harness-remote/import-fixture', type: 'module' }))
    fs.writeFileSync(path.join(profileDir, 'package.json'), JSON.stringify({ name: 'fixture-profile', private: true, dependencies: { '@harness-remote/import-fixture': '*' } }))
    const generated = path.join(pluginDir, 'import-adapter.mjs')
    await build({ entryPoints: [entry], outfile: generated, bundle: true, platform: 'node', format: 'esm', target: 'node22', external: ['@deepseek-ai/*'] })
    const adapter = await import(pathToFileURL(generated).href)
    const validate = (header, events) => {
      const restored = catalog.createRestore(catalog.encodeCurrentHeader(header, 0), { recovery: 'strict', validation: 'current' })
      events.forEach(e => restored.decodeRow(catalog.encodeCurrentEvent(e))); return restored.finish()
    }
    // The real user's old log is never given to a writer/Agent. It is decoded
    // from bytes and validated in memory, with no body printed or copied.
    if (process.env.HARNESS_HISTORY_IMPORT_EXISTING) {
      const file = process.env.HARNESS_HISTORY_IMPORT_EXISTING, before = fs.readFileSync(file)
      const chunks = []
      for (let offset = 0; offset < before.length;) {
        const decoded = zlib.zstdDecompressSync(before.subarray(offset), { info: true })
        assert(decoded.engine.bytesWritten > 0 && decoded.engine.bytesWritten <= before.length - offset)
        chunks.push(decoded.buffer); offset += decoded.engine.bytesWritten
      }
      const rows = Buffer.concat(chunks).toString().trim().split('\n').map(JSON.parse)
      let failure
      try { const restore = catalog.createRestore(rows[0], { recovery: 'strict', validation: 'current' }); rows.slice(1).forEach(e => restore.decodeRow(e)); restore.finish() }
      catch (error) { failure = error.message }
      console.log(JSON.stringify({ oldImportReadOnly: true, eventCount: rows.length - 1, firstSurface: rows.slice(1).find(e => e.surfaceOp)?.type,
        firstSystemSeq: rows.slice(1).find(e => e.type === 'system/message')?.seq, failure }))
      assert.deepEqual(fs.readFileSync(file), before)
    }
    ctx = new Context()
    const resolution = await createRuntimeResolution({ installAnchor: anchor, home: path.join(work, 'home'),
      profile: { name: 'web', dir: profileDir, layers: [], patches: [], skippedBundles: [], patchPath: path.join(profileDir, 'cordis.patch.yml') } })
    for (const name of ['@deepseek-ai/dsh-session', '@deepseek-ai/dsh-session-format-catalog']) {
      assert(resolution.entries.some(entry => entry.name === name && entry.scope === 'installation'))
    }
    new PluginPackages(ctx, { resolution })
    for (const name of ['@deepseek-ai/dsh-session', '@deepseek-ai/dsh-session-format-catalog']) {
      const selected = ctx.pluginPackages.packageOf(name, pathToFileURL(generated).href)
      assert(selected.dir.startsWith(path.join(work, 'dsh', 'node_modules')))
    }
    new SystemPrompt(ctx, { personaPrefix: 'Synthetic native host system prompt.' })
    new SessionStore(ctx); new Projections(ctx); new Agents(ctx); new ToolRuntime(ctx, { mode: 'native' })
    const execute = ctx.tools.execute.bind(ctx.tools)
    ctx.tools.execute = (...args) => { toolExecutions++; return execute(...args) }
    new Persistence(ctx, { root: path.join(work, 'synthetic-sessions') })
    const model = { provider: 'fixture', model: 'never-network' }
    let observedRequest, inHistory = false
    ctx.provide('llm', { listProviders: () => [{ id: 'fixture' }], resolveCallConfig: async value => value,
      resolveModelInfo: async () => ({ inputModalities: ['text'] }), async prepareCall(config) { return { config,
        ...(inHistory ? { systemPromptUpdate: 'in-history' } : {}), stream: request => this.stream(request) } },
      async *stream(request) { modelCalls++; observedRequest = request; yield { type: 'text-delta', index: 0, text: 'Blue remembers the river.' }; yield { type: 'finish', reason: 'stop' } } })
    ctx.provide('agentDefaultModel', { currentSelection: () => model })
    const workspace = { id: 'fixture-workspace', title: 'Fixture', path: work, sessionIds: [], async attachSession(id) { if (!this.sessionIds.includes(id)) this.sessionIds.push(id) } }
    const registry = { get: id => id === workspace.id ? workspace : undefined, list: () => [workspace], archivedSessionIds: [] }
    ctx.provide('workspaceRegistry', registry)
    const presetMounts = []
    ctx.provide('agentPresets', { resolve: async id => {
      if (id === 'missing') throw Error('preset unavailable')
      return { id: id === 'fallback' ? 'standard' : id ?? 'standard', ...(id === 'broken' ? { broken: true } : {}),
        ...(id === 'disabled' ? { disabled: true } : {}), ...(id === 'not-enabled' ? { enabled: false } : {}) }
    }, mount: async (agentCtx, id) => {
      presetMounts.push(id); agentCtx.systemPrompt.section({ name: 'fixture-preset', order: 90, text: 'Standard native preset.' })
      return { id }
    } })
    new AgentLoop(ctx, { agents: [], maxParallelToolCalls: { get: () => 10 } })
    assert.equal((await adapter.nativeCapabilities(ctx)).supported, true)
    const unrelated = await ctx.agents.create({ sessionId: 'unrelated-existing-session', meta: { cwd: work }, agentOptions: model })
    const unrelatedEvents = structuredClone(unrelated.agent.session.snapshotEvents())
    const wrapped = { get(name) {
      if (name !== 'agents') return ctx.get(name)
      return { get: id => ctx.agents.get(id), async create(options) { createCalls++; return ctx.agents.create(options) } }
    } }
    const r = request(), seed = adapter.buildNativeImportSeed(r, 1000)
    const header = { version: 4, id: r.sessionId, createdAt: 1000, cwd: work, isSeeded: false, delegationDepth: 0, agentPreset: 'standard' }
    validate(header, seed)
    // Regression: old algorithm passed Session.create but first actual system
    // append after imported surface fails the official cold reader.
    const broken = seed.filter(e => e.type !== 'system/message').map((e, seq) => ({ ...e, seq }))
    const nextTurn = 2, offset = broken.length
    broken.push({ type: 'turn/start', seq: offset, time: 1001, data: { turn: nextTurn } },
      { type: 'step/start', seq: offset + 1, time: 1001, data: { turn: nextTurn, step: 1 } },
      { type: 'system/message', seq: offset + 2, time: 1001, surfaceOp: 'append', data: { turn: nextTurn, step: 1, message: { id: 'native-later-system', role: 'system', content: [{ type: 'text', text: 'native prompt' }], source: { kind: 'system-prompt' } } } })
    assert.doesNotThrow(() => Session.create(r.sessionId, broken, header))
    assert.throws(() => validate(header, broken), /protected first surface head/)
    const receipt = await adapter.commitNativeImport(wrapped, r)
    assert.equal(receipt.messageCount, 2); assert.equal(createCalls, 1); assert.equal(modelCalls, 0)
    assert.deepEqual(presetMounts, ['standard']); assert.equal(ctx.agents.get(r.sessionId), undefined)
    assert.equal((await adapter.inspectNativeImport(ctx, r)).state, 'succeeded')
    assert.deepEqual(unrelated.agent.session.snapshotEvents(), unrelatedEvents)
    const rejectedBeforeCreate = code => error => error instanceof adapter.NativeImportPreflightError
      && error.rejectedBeforeCreate === true && error.code === code
    await assert.rejects(adapter.commitNativeImport(wrapped, r), rejectedBeforeCreate('session-exists'))
    assert.equal(createCalls, 1)
    assert.equal((await adapter.inspectNativeImport(ctx, { ...r, sourceHash: 'b'.repeat(64) })).state, 'uncertain')
    workspace.sessionIds.length = 0
    assert.equal((await adapter.inspectNativeImport(ctx, r)).state, 'uncertain')
    workspace.sessionIds.push(r.sessionId)
    for (const presetId of ['missing', 'broken', 'disabled', 'not-enabled', 'fallback']) {
      await assert.rejects(adapter.commitNativeImport(wrapped, request({ presetId })), rejectedBeforeCreate('preset-unavailable'))
    }
    await assert.rejects(adapter.commitNativeImport(wrapped, request({ workspaceId: 'missing' })), rejectedBeforeCreate('workspace-unavailable'))
    assert.equal(createCalls, 1)
    const oversized = request(), oversizedBody = 'x'.repeat(13 * 1024 * 1024)
    oversized.conversation.messages[0].text = oversizedBody
    oversized.conversation.messages[0].fragments = [{ type: 'REQUEST', content: oversizedBody, data: {} }]
    await assert.rejects(adapter.commitNativeImport(wrapped, oversized), rejectedBeforeCreate('conversation-too-large'))
    assert.equal(createCalls, 1, 'expanded seed limit is checked before any native write')
    await assert.rejects(adapter.commitNativeImport(wrapped, request(), AbortSignal.abort()), rejectedBeforeCreate('aborted'))
    assert.equal(createCalls, 1)
    let finalAdmission = 0
    await assert.rejects(adapter.commitNativeImport(wrapped, request(), undefined, () => { finalAdmission++; throw Error('revoked during preflight') }), rejectedBeforeCreate('authorization-changed'))
    assert.equal(finalAdmission, 1); assert.equal(createCalls, 1, 'revocation at final admission must never call native create')
    const missingModel = { get: name => name === 'agentDefaultModel' ? { currentSelection: () => ({}) } : wrapped.get(name) }
    await assert.rejects(adapter.commitNativeImport(missingModel, request()), rejectedBeforeCreate('model-unavailable'))
    assert.equal(createCalls, 1)
    // A broken provider returning somebody else's handle must not make the
    // importer dispose or flush that existing Agent.
    const foreignHandle = { get: name => name === 'agents'
      ? { get: id => ctx.agents.get(id), create: async () => unrelated } : ctx.get(name) }
    await assert.rejects(adapter.commitNativeImport(foreignHandle, request()), error => error.code === 'uncertain' && error.rejectedBeforeCreate !== true)
    assert.equal(ctx.agents.get(unrelated.agent.id), unrelated.agent)
    assert.deepEqual(unrelated.agent.session.snapshotEvents(), unrelatedEvents)
    const audited = request(), mutations = [], reads = []
    const auditHost = { get(name) {
      if (name === 'agents') return { get: id => { reads.push(id); return ctx.agents.get(id) }, async create(options) {
        mutations.push(['create', options.sessionId]); const handle = await ctx.agents.create(options)
        return { agent: handle.agent, dispose: async () => { mutations.push(['dispose', handle.agent.session.id]); await handle.dispose() } }
      } }
      if (name === 'sessions') return { get: id => { reads.push(id); return ctx.sessions.get(id) }, flush: session => { mutations.push(['flush', session.id]); return ctx.sessions.flush(session) } }
      if (name === 'sessionPersistence') return { stat: id => { reads.push(id); return ctx.sessionPersistence.stat(id) }, open: (id, mode, options) => {
        reads.push(id); assert.equal(mode, 'read'); return ctx.sessionPersistence.open(id, mode, options)
      } }
      return ctx.get(name)
    } }
    await adapter.commitNativeImport(auditHost, audited)
    assert.deepEqual(mutations.map(([kind]) => kind), ['create', 'flush', 'dispose'])
    assert(mutations.every(([, id]) => id === audited.sessionId)); assert(reads.every(id => id === audited.sessionId))
    assert.equal(modelCalls, 0)
    const notPreflight = error => error.rejectedBeforeCreate !== true
    // Failure after persistence is intentionally uncertain, never labelled a
    // safe retry and never repaired/deleted. Only this new Agent is disposed.
    const failedFlush = request(), flushFailure = { get(name) {
      if (name !== 'sessions') return ctx.get(name)
      return { get: id => ctx.sessions.get(id), async flush(session) { await ctx.sessions.flush(session); return false } }
    } }
    await assert.rejects(adapter.commitNativeImport(flushFailure, failedFlush), notPreflight)
    assert.equal(ctx.agents.get(failedFlush.sessionId), undefined)
    assert.equal((await adapter.inspectNativeImport(ctx, failedFlush)).state, 'uncertain')
    assert(!workspace.sessionIds.includes(failedFlush.sessionId))
    const cancelled = request(), abortAtColdRead = new AbortController()
    const cancelledHost = { get(name) {
      if (name !== 'sessionPersistence') return ctx.get(name)
      return { stat: id => ctx.sessionPersistence.stat(id), async open(...args) {
        const reader = await ctx.sessionPersistence.open(...args)
        return { header: reader.header, read: (...values) => reader.read(...values), async close() { await reader.close(); abortAtColdRead.abort() } }
      } }
    } }
    await assert.rejects(adapter.commitNativeImport(cancelledHost, cancelled, abortAtColdRead.signal), notPreflight)
    assert.equal(ctx.agents.get(cancelled.sessionId), undefined)
    assert(!workspace.sessionIds.includes(cancelled.sessionId), 'cancellation after cold read must not attach')
    assert.equal((await adapter.inspectNativeImport(ctx, cancelled)).state, 'uncertain')
    const simultaneous = request()
    const raced = await Promise.allSettled([adapter.commitNativeImport(ctx, simultaneous), adapter.commitNativeImport(ctx, simultaneous)])
    assert.equal(raced.filter(result => result.status === 'fulfilled').length, 1)
    assert.equal(raced.filter(result => result.status === 'rejected').length, 1)
    assert.equal((await adapter.inspectNativeImport(ctx, simultaneous)).state, 'succeeded')
    assert.deepEqual(unrelated.agent.session.snapshotEvents(), unrelatedEvents)
    const corrupted = { get(name) {
      if (name !== 'sessionPersistence') return ctx.get(name)
      return { stat: id => ctx.sessionPersistence.stat(id), async open(...args) {
        const reader = await ctx.sessionPersistence.open(...args)
        return { header: reader.header, close: () => reader.close(), async read(...readArgs) {
          const stored = await reader.read(...readArgs), events = structuredClone(stored.events)
          events.find(e => e.type === 'user/message').data.content[0].text += 'tampered'
          return { ...stored, events }
        } }
      } }
    } }
    assert.equal((await adapter.inspectNativeImport(corrupted, r)).state, 'uncertain')
    const longRequest = request({ conversation: longConversation() })
    const longReceipt = await adapter.commitNativeImport(wrapped, longRequest)
    assert.equal(longReceipt.messageCount, 2000); assert.equal(modelCalls, 0)
    const longReader = await ctx.sessionPersistence.open(longRequest.sessionId, 'read')
    try {
      const { events: longEvents } = await longReader.read()
      validate(longReader.header, longEvents)
      const messages = longEvents.filter(e => ['user/message', 'assistant/message'].includes(e.type)).map(e => e.type === 'user/message' ? e.data : e.data.message)
      assert.equal(messages.length, 2000)
      messages.forEach((message, index) => assert.equal(message.content[0].text, longRequest.conversation.messages[index].text))
    } finally { await longReader.close() }
    // Fresh native owner, after importer has released its handle. Only this
    // explicit synthetic test now starts a turn; production adapter never does.
    const resumed = await ctx.agents.resume({ resumeSessionId: r.sessionId, agentOptions: model })
    resumed.agent.followup(createUserMessage({ source: { kind: 'user' }, content: [{ type: 'text', text: 'Where is Blue?' }] }))
    await resumed.agent.whenIdle(); await ctx.sessions.flush(resumed.agent.session)
    assert.equal(modelCalls, 1)
    const events = resumed.agent.session.snapshotEvents()
    validate(resumed.agent.session.header, events)
    const systemEvents = events.filter(e => e.type === 'system/message')
    assert(systemEvents.length >= 2); assert.notEqual(systemEvents.at(-1).surfaceOp, 'append')
    assert(JSON.stringify(observedRequest).includes('Blue is waiting beside the river.'))
    assert(JSON.stringify(observedRequest).includes('Synthetic native host system prompt.'))
    assert.deepEqual(observedRequest.messages.filter(message => message.role !== 'system').map(message => ({ role: message.role, content: message.content })), [
      { role: 'user', content: [{ type: 'text', text: r.conversation.messages[0].text }] },
      { role: 'assistant', content: [{ type: 'reasoning', text: r.conversation.messages[1].reasoning }, { type: 'text', text: r.conversation.messages[1].text }] },
      { role: 'user', content: [{ type: 'text', text: 'Where is Blue?' }] },
    ])
    await resumed.dispose()
    assert.equal((await adapter.inspectNativeImport(ctx, r)).state, 'succeeded', 'later native appends retain verified import receipt')
    const cold = await ctx.sessionPersistence.open(r.sessionId, 'read'); try { await cold.read() } finally { await cold.close() }
    // Reproduce the real DeepSeek route capability, not just the fallback
    // route above. Its system prompt is legitimately appended in history.
    // Runtime initialization is separate from the imported user/assistant
    // messages and must never replace them or relabel them as a new user dump.
    inHistory = true
    ctx.systemPrompt.context({ name: 'fixture-runtime', order: 10, text: 'Synthetic runtime permissions remain native.' })
    const searchRequest = request({ conversation: searchConversation() })
    const searchSeed = adapter.buildNativeImportSeed(searchRequest)
    validate({ ...header, id: searchRequest.sessionId }, searchSeed)
    const searchReceipt = await adapter.commitNativeImport(ctx, searchRequest)
    assert.equal(searchReceipt.messageCount, 2); assert.equal(modelCalls, 1); assert.equal(toolExecutions, 0)
    const searchReader = await ctx.sessionPersistence.open(searchRequest.sessionId, 'read')
    let durableSearch
    try { durableSearch = (await searchReader.read()).events; validate(searchReader.header, durableSearch) }
    finally { await searchReader.close() }
    const searchCall = durableSearch.find(event => event.type === 'tool/call'), searchResult = durableSearch.find(event => event.type === 'tool/result')
    // The actual built-in presenter recognizes this persisted meta, without a
    // plugin renderer or registration. Historical web_fetch has no fabricated
    // HTTP status, so it uses native generic tool-result presentation.
    const card = presentSearchResult(JSON.parse(searchCall.data.arguments), {
      content: searchResult.data.message.content, isError: false, meta: searchResult.data.meta,
    })
    assert.equal(card.card, 'web'); assert.equal(card.kind, 'search'); assert.equal(card.title, 'Blue river')
    assert.deepEqual(card.sources, searchRequest.conversation.messages[1].fragments[1].data.results.map(({ url, title, snippet }) => ({ url, title, snippet })))
    assert.match(card.answer, /网页历史检索/)
    const fetchCall = durableSearch.find(event => event.type === 'tool/call' && event.data.name === 'web_fetch')
    const fetchResult = durableSearch.find(event => event.type === 'tool/result' && event.data.message.toolCallId === fetchCall.data.callId)
    assert.equal(presentFetchResult(JSON.parse(fetchCall.data.arguments), { content: fetchResult.data.message.content, isError: false }), undefined)
    assert.equal(fetchResult.data.meta, undefined)
    const importedSurface = durableSearch.filter(event => ['user/message', 'assistant/message', 'tool/result'].includes(event.type))
      .map(event => event.type === 'user/message' ? event.data : event.data.message)
    const normalMessages = messages => messages.filter(message => message.role !== 'system' && message.source.kind !== 'runtime-context')
    const historyResume = await ctx.agents.resume({ resumeSessionId: searchRequest.sessionId, agentOptions: model })
    historyResume.agent.followup(createUserMessage({ source: { kind: 'user' }, content: [{ type: 'text', text: 'Continue our original story.' }] }))
    await historyResume.agent.whenIdle(); await ctx.sessions.flush(historyResume.agent.session)
    assert.equal(modelCalls, 2); assert.equal(toolExecutions, 0)
    assert.deepEqual(normalMessages(observedRequest.messages).slice(0, importedSurface.length), importedSurface)
    assert.equal(normalMessages(observedRequest.messages).at(-1).content[0].text, 'Continue our original story.')
    assert.equal(observedRequest.messages.filter(message => message.source.kind === 'runtime-context').length, 1)
    const firstContinuationEvents = historyResume.agent.session.snapshotEvents()
    assert.equal(firstContinuationEvents.filter(event => event.type === 'system/message').at(-1).surfaceOp, 'append')
    assert.equal(firstContinuationEvents.find(event => event.type === 'request/header').data.reason, 'initial')
    assert.equal(firstContinuationEvents.find(event => event.type === 'request/context').data.systemPromptUpdate, 'in-history')
    validate(historyResume.agent.session.header, firstContinuationEvents)
    const firstRequestMessages = structuredClone(normalMessages(observedRequest.messages))
    await historyResume.dispose()
    const twiceReader = await ctx.sessionPersistence.open(searchRequest.sessionId, 'read')
    try { validate(twiceReader.header, (await twiceReader.read()).events) } finally { await twiceReader.close() }
    const secondResume = await ctx.agents.resume({ resumeSessionId: searchRequest.sessionId, agentOptions: model })
    secondResume.agent.followup(createUserMessage({ source: { kind: 'user' }, content: [{ type: 'text', text: 'And what happened next?' }] }))
    await secondResume.agent.whenIdle(); await ctx.sessions.flush(secondResume.agent.session)
    assert.equal(modelCalls, 3); assert.equal(toolExecutions, 0)
    const secondMessages = normalMessages(observedRequest.messages)
    assert.deepEqual(secondMessages.slice(0, firstRequestMessages.length), firstRequestMessages)
    assert.equal(secondMessages.at(-2).role, 'assistant'); assert.equal(secondMessages.at(-2).content[0].text, 'Blue remembers the river.')
    assert.equal(secondMessages.at(-1).role, 'user'); assert.equal(secondMessages.at(-1).content[0].text, 'And what happened next?')
    const twiceEvents = secondResume.agent.session.snapshotEvents()
    validate(secondResume.agent.session.header, twiceEvents)
    assert.equal(twiceEvents.filter(event => event.type === 'request/header').at(-1).data.reason, 'resume')
    assert.equal(twiceEvents.filter(event => event.type === 'user/message' && event.data.source.kind === 'runtime-context').length, 1)
    assert.equal(twiceEvents.filter(event => event.type === 'system/message').length, 2, 'unchanged runtime owner does not append another system prompt')
    await secondResume.dispose()
    assert.equal((await adapter.inspectNativeImport(ctx, searchRequest)).state, 'succeeded')
    assert.deepEqual(unrelated.agent.session.snapshotEvents(), unrelatedEvents)
    assert.equal(networkCalls, 0); await unrelated.dispose()
    console.log(JSON.stringify({ installedNativeImport: true, nativeVersion: JSON.parse(fs.readFileSync(anchor)).version,
      modelCalls, networkCalls, toolExecutions, importedMessages: receipt.messageCount, officialProfileModuleResolution: true,
      scopedWritesOnly: true, cancellationBeforeAttach: true, simultaneousCollisionSafe: true,
      coldReadAfterContinue: true, coldReadAfterSecondContinue: true, nativeSearchCard: true,
      exactHistoryInBothRequests: true, inHistorySystemAppend: true, emptySystemHeadReplaced: true, existingSessionUntouched: true }))
  } finally {
    await ctx?.fiber.dispose(); globalThis.fetch = originalFetch
  }
})
