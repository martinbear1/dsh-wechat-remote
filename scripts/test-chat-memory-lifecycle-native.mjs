/** Real native SystemPrompt/providers/waterfalls; synthetic live session only.
 * No profile, real account, sockets or model. Usage: node this-file <DSH root>. */
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL, fileURLToPath } from 'node:url'
import path from 'node:path'
import { build } from 'esbuild'
const runtime = path.resolve(process.argv[2])
const require = createRequire(path.join(runtime, 'node_modules/@deepseek-ai/dsh/package.json'))
const load = name => import(pathToFileURL(require.resolve('@deepseek-ai/' + name)).href)
const { Context } = await load('cordis'), { SystemPrompt } = await load('dsh-system-prompt')
const native = await load('dsh-session-query')
const built = await build({ entryPoints: [fileURLToPath(new URL('../src/private-resources/chat-memory.ts', import.meta.url))],
  bundle: true, platform: 'node', format: 'esm', write: false })
const { installChatMemory } = await import('data:text/javascript;base64,' + Buffer.from(built.outputFiles[0].text).toString('base64'))
globalThis.fetch = async () => { throw Error('Network forbidden') }
const user = text => ({ source: { kind: 'user' }, content: [{ type: 'text', text }] })
const checks = []
async function run(name, action) {
  const ctx = new Context(), tools = []
  new SystemPrompt(ctx, {})
  const events = [{ type: 'harness-remote/history-import/source' }, { type: 'user/message', data: user('OLD_SECRET archived fact') }]
  const agent = { id: 'synthetic', session: { id: 'synthetic', header: { id: 'synthetic' }, eventAt() { throw Error('Deprecated read forbidden') } } }
  let turn = 2, active = agent, providerFault = false, waterfallFault = false, pause, release, readPause, readRelease, opened = 0, closed = 0
  ctx.provide('tools', { register: t => tools.push(t) })
  ctx.provide('agents', { get: () => active })
  ctx.provide('sessions', { get: () => active?.session })
  ctx.provide('sessionQuery', { async observeSession() {
    if (readPause) { const pending = readPause; readPause = undefined; await pending }
    opened++
    return { source: 'live', header: agent.session.header, events: events.slice(), [Symbol.dispose]() { closed++ } }
  } })
  ctx.provide('sessionProjections', { stateOf: () => ({ openTurnStartSeq: turn }) })
  // Downstream routing/provider failure is independent of our component.
  ctx.systemPrompt.variable('fault', () => { if (providerFault) throw Error('provider failed'); return '' })
  ctx.on('system-prompt/assemble', async (_value, _context, next) => {
    if (waterfallFault) throw Error('waterfall failed')
    if (pause) { const current = pause; pause = undefined; await current }
    return next()
  })
  installChatMemory(ctx, native)
  const claim = text => ctx.emit('agent/inbox/claimed', { agent, turn, message: user(text) })
  const assemble = (signal = new AbortController().signal) => ctx.systemPrompt.assemble({ agent, signal })
  const packet = assembly => {
    const s = assembly.variables.harness_chat_history_evidence
    return s ? JSON.parse(s.slice(s.indexOf('\n') + 1)) : undefined
  }
  const f = { ctx, tools, agent, events, claim, assemble, packet, nextTurn() { turn++ },
    providerFault(v) { providerFault = v }, waterfallFault(v) { waterfallFault = v },
    pause() { pause = new Promise(resolve => { release = resolve }); return () => release() },
    pauseRead() { readPause = new Promise(resolve => { readRelease = resolve }); return () => readRelease() },
    replaceAgent() { active = { ...agent } },
    idle() { ctx.emit('agent/status', { agent, status: 'idle' }) } }
  try { await action(f); assert.equal(opened, closed, 'every observation released'); checks.push(name) }
  finally { await ctx.fiber.dispose() }
}
await run('provider-fails-before-assembly-next-turn-clean', async f => {
  f.providerFault(true); f.claim('OLD_SECRET failed input')
  await assert.rejects(f.assemble(), /provider failed/)
  f.providerFault(false); f.nextTurn(); f.claim('weather today')
  const p = f.packet(await f.assemble())
  assert.equal(p.latestUserRequest, 'weather today'); assert.equal(p.hits.length, 0)
})
await run('waterfall-fails-next-turn-clean', async f => {
  f.waterfallFault(true); f.claim('OLD_SECRET failed input')
  await assert.rejects(f.assemble(), /waterfall failed/)
  f.waterfallFault(false); f.nextTurn(); f.claim('weather today')
  assert.equal(f.packet(await f.assemble()).latestUserRequest, 'weather today')
})
await run('abort-next-turn-clean', async f => {
  f.claim('OLD_SECRET cancelled input')
  const c = new AbortController(); c.abort()
  await assert.rejects(f.assemble(c.signal))
  f.nextTurn(); f.claim('weather today')
  assert.equal(f.packet(await f.assemble()).latestUserRequest, 'weather today')
})
await run('same-turn-steering-combines-only-same-turn', async f => {
  f.claim('find original'); f.claim('OLD_SECRET')
  const p = f.packet(await f.assemble())
  assert.equal(p.latestUserRequest, 'find original\nOLD_SECRET'); assert.equal(p.hits.length, 1)
  f.nextTurn(); f.claim('weather today')
  assert.equal(f.packet(await f.assemble()).latestUserRequest, 'weather today')
})
await run('late-old-assembly-does-not-consume-new-claim', async f => {
  f.claim('OLD_SECRET old input'); const resume = f.pause()
  const old = f.assemble(); await new Promise(resolve => setImmediate(resolve))
  f.nextTurn(); f.claim('weather today'); resume()
  assert.equal(f.packet(await old), undefined)
  assert.equal(f.packet(await f.assemble()).latestUserRequest, 'weather today')
})
await run('idle-clears-failed-claim-and-evidence', async f => {
  f.claim('OLD_SECRET'); await f.assemble(); f.idle()
  assert.equal(f.packet(await f.assemble()), undefined)
})
await run('ordinary-chat-no-tools-or-prompt', async f => {
  f.events[0] = { type: 'ordinary' }; f.claim('OLD_SECRET')
  const a = await f.assemble(); assert.equal(f.packet(a), undefined)
  assert(!(a.tools ?? []).some(t => t.name.startsWith('chat_history_')))
  await assert.rejects(f.tools[0].execute({ query: 'OLD_SECRET' }, { agent: f.agent, signal: new AbortController().signal }), { code: 'CHAT_HISTORY_SCOPE' })
})
await run('replacement-agent-cannot-read-old-session', async f => {
  f.replaceAgent()
  await assert.rejects(f.tools[0].execute({ query: 'OLD_SECRET' }, { agent: f.agent, signal: new AbortController().signal }), { code: 'CHAT_HISTORY_SCOPE' })
})
await run('replacement-during-observation-disposes-and-denies', async f => {
  const resume = f.pauseRead()
  const pending = f.tools[0].execute({ query: 'OLD_SECRET' }, { agent: f.agent, signal: new AbortController().signal })
  const rejected = assert.rejects(pending, { code: 'CHAT_HISTORY_SCOPE' })
  await new Promise(resolve => setImmediate(resolve)); f.replaceAgent(); resume()
  await rejected
})
await run('cancel-during-observation-disposes-and-denies', async f => {
  const resume = f.pauseRead(), controller = new AbortController()
  const pending = f.tools[0].execute({ query: 'OLD_SECRET' }, { agent: f.agent, signal: controller.signal })
  const rejected = assert.rejects(pending, { name: 'AbortError' })
  await new Promise(resolve => setImmediate(resolve)); controller.abort(); resume()
  await rejected
})
console.log(JSON.stringify({ host: require('./package.json').version, checks, passed: checks.length, networkCalls: 0 }))
