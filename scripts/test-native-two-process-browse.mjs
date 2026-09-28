/** Isolated upstream reproduction: real JSONL + Windows/POSIX write lease,
 * real query/history/agent activation code, no WeChat plugin or phone loaded.
 * Direct controller calls exercise the native UI's API, not an Electron UI.
 * HARNESS_DSH_SOURCE selects the unmodified pinned source; external runtime
 * dependencies may be supplied by HARNESS_DSH_DEPENDENCIES. */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { pathToFileURL, fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
import { execFileSync, fork } from 'node:child_process'
import { once } from 'node:events'
import { build } from 'esbuild'

async function runtime(artifact, root) {
  const n = await import(pathToFileURL(artifact))
  const ctx = new n.Context()
  await ctx.plugin(n.SessionStore)
  await ctx.plugin(n.Persistence, { root, compression: 'none' })
  return { n, ctx }
}

if (process.argv[2] === '--holder') {
  const { n, ctx } = await runtime(process.argv[3], process.argv[4])
  const writer = await ctx.sessionPersistence.create({ version: n.SESSION_FORMAT_VERSION,
    id: 'native-browse-conflict', createdAt: 1000, cwd: process.argv[4], isSeeded: false })
  await writer.append([
    { type: 'turn/start', seq: 0, time: 1, data: { turn: 1 } },
    { type: 'turn/end', seq: 1, time: 2, data: { turn: 1, reason: { kind: 'completed' } } },
  ])
  await writer.flush()
  process.send({ ready: true })
  process.once('message', async () => {
    await writer.close(); await ctx.fiber.dispose(); process.disconnect()
  })
} else {
  const source = process.env.HARNESS_DSH_SOURCE
  assert(source, 'HARNESS_DSH_SOURCE required')
  const readonlyCandidate = process.env.HARNESS_NATIVE_READONLY_CANDIDATE === '1'
  const sha = execFileSync('git', ['-C', source, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()
  assert.equal(execFileSync('git', ['-C', source, 'status', '--porcelain', '--', 'packages', 'vendor'], { encoding: 'utf8' }).trim(), '', 'native source must be unmodified')
  const require = createRequire(import.meta.url)
  const dependencies = process.env.HARNESS_DSH_DEPENDENCIES
    ? createRequire(path.join(process.env.HARNESS_DSH_DEPENDENCIES, 'package.json')) : require
  const packages = new Map()
  for (const file of execFileSync('git', ['-C', source, 'ls-files', 'packages/**/package.json', 'vendor/**/package.json'], { encoding: 'utf8' }).trim().split(/\r?\n/)) {
    const full = path.join(source, file)
    packages.set(JSON.parse(fs.readFileSync(full)).name, path.dirname(full))
  }
  const work = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-native-browse-')))
  let holder, ctx, stream, abort, next
  try {
    const artifact = path.join(work, 'lib/native.mjs'), root = path.join(work, 'sessions')
    fs.copyFileSync(path.join(packages.get('@deepseek-ai/dsh-app-boot'), 'package.json'), path.join(work, 'package.json'))
    await build({ stdin: { contents: `
      export {Context} from '@deepseek-ai/cordis';
      export {default as SessionStore, SESSION_FORMAT_VERSION} from '@deepseek-ai/dsh-session';
      export {default as Persistence} from '@deepseek-ai/dsh-session-persistence-jsonl';
      export {default as Projections} from '@deepseek-ai/dsh-session-projection';
      export {default as Query} from '@deepseek-ai/dsh-session-query';
      export {default as Agents} from '@deepseek-ai/dsh-agent';
      export {default as AgentLoop} from '@deepseek-ai/dsh-agent-loop';
      export {default as Controller} from '@deepseek-ai/dsh-api-session-controller';
      export {ApiSessionAgentController} from '${path.join(source, 'packages/api/session-controller/src/agent.ts').replaceAll('\\', '/')}';
      export {SessionHistoryController} from '${path.join(source, 'packages/api/session-controller/src/history.ts').replaceAll('\\', '/')}';
    `, resolveDir: process.cwd() }, outfile: artifact, bundle: true, platform: 'node', format: 'esm', target: 'es2022',
    logLevel: 'warning', plugins: [{ name: 'unchanged-native-source', setup(builder) {
      // Explicit experimental upstream candidate, never an installed-host
      // monkey patch. Default run always compiles unmodified upstream code.
      if (readonlyCandidate) builder.onLoad({ filter: /session-controller[\\/]src[\\/]history\.ts$/ }, args => {
        const original = fs.readFileSync(args.path, 'utf8')
        const condition = "if (address.kind === 'session' && source.source === 'prepared') {"
        assert.equal(original.split(condition).length, 2)
        return { contents: original.replace(condition, "if (request.activation !== 'read-only' && address.kind === 'session' && source.source === 'prepared') {"), loader: 'ts', resolveDir: path.dirname(args.path) }
      })
      builder.onResolve({ filter: /^[^./]/ }, args => {
        if (args.path.startsWith('node:') || path.isAbsolute(args.path)) return
        const name = args.path.startsWith('@') ? args.path.split('/').slice(0, 2).join('/') : args.path.split('/')[0]
        const directory = packages.get(name)
        if (directory) return { path: path.join(directory, 'src', (args.path.slice(name.length + 1) || 'index') + '.ts') }
        let file
        try { file = dependencies.resolve(args.path) } catch { file = require.resolve(args.path) }
        return { path: pathToFileURL(file).href, external: true }
      })
    } }] })
    holder = fork(fileURLToPath(import.meta.url), ['--holder', artifact, root], { stdio: ['ignore', 'inherit', 'inherit', 'ipc'] })
    const ready = await Promise.race([
      once(holder, 'message').then(([value]) => value),
      once(holder, 'exit').then(([code]) => { throw Error('holder exited early: ' + code) }),
      new Promise((_, reject) => { const timer = setTimeout(() => reject(Error('holder timeout')), 20000); timer.unref() }),
    ])
    assert.equal(ready.ready, true)
    const mounted = await runtime(artifact, root); ctx = mounted.ctx
    const n = mounted.n
    await ctx.plugin(n.Projections)
    await ctx.plugin(n.Query)
    await ctx.plugin(n.Agents)
    // No model calls or presets: we exercise native resume through the real
    // factory until persistence denies its write acquisition.
    ctx.provide('llm', {})
    ctx.provide('tools', {})
    ctx.provide('systemPrompt', { variable() {} })
    ctx.provide('agentDefaultModel', { currentSelection: () => ({ provider: 'fixture', model: 'fixture' }) })
    ctx.provide('typert', { lookups: { configure() {} }, contexts: { configureHost() {} } })
    await ctx.plugin(n.AgentLoop, { agents: [], maxParallelToolCalls: 1 })
    assert(ctx.get('agentLoop'), 'native agent loop must load')
    const agents = new n.ApiSessionAgentController(ctx)
    // Invoke the actual native promotion method unchanged, with only its
    // owning fields assembled. Unrelated UI/files/upload services not mounted.
    const facade = { ctx, agents, promotions: new Set() }
    const history = new n.SessionHistoryController(ctx, observation => n.Controller.prototype.promote.call(facade, observation))
    const errors = []
    ctx.on('api-session/error', (id, message) => errors.push({ id, message }))
    const address = { kind: 'session', sessionId: 'native-browse-conflict' }
    const page = await history.page({ address, throughSeq: 1 }, new AbortController().signal)
    assert.equal(page.records.length, 2)
    assert.equal(errors.length, 0, 'native page-only history is safe while writer is held')
    if (readonlyCandidate) {
      for (let round = 0; round < 3; round++) {
        abort = new AbortController()
        stream = history.follow({ address, activation: 'read-only' }, abort.signal)[Symbol.asyncIterator]()
        assert.equal((await stream.next()).value.type, 'snapshot')
        next = stream.next()
        await new Promise(r => setTimeout(r, 50))
        assert.equal(errors.length, 0, 'candidate readonly browse must not try activation')
        assert.equal(facade.promotions.size, 0)
        assert.equal(ctx.agents.get(address.sessionId), undefined)
        abort.abort(); await next; await stream.return(); stream = undefined
      }
    }
    for (let round = 0; round < 3; round++) {
      abort = new AbortController()
      stream = history.follow({ address }, abort.signal)[Symbol.asyncIterator]()
      const snapshot = (await stream.next()).value
      assert.equal(snapshot.type, 'snapshot'); assert.equal(snapshot.cursor, 1)
      next = stream.next()
      for (let i = 0; i < 400 && errors.length <= round; i++) await new Promise(r => setTimeout(r, 10))
      assert.equal(errors.length, round + 1, 'native browsing must reproduce an error without any WeChat plugin')
      assert.equal(errors.at(-1).message, 'session "native-browse-conflict" is already owned by an active write handle')
      assert.equal(ctx.agents.get(address.sessionId), undefined)
      assert.equal(ctx.sessions.get(address.sessionId), undefined)
      abort.abort(); await next; await stream.return(); stream = undefined
    }
    const direct = await agents.resolveAgent(address.sessionId)
    assert.equal(direct.error?.code, 'session/writer-held')
    // Failed browsing must not modify the source conversation or steal its lock.
    const reader = await ctx.sessionPersistence.open(address.sessionId, 'read')
    assert.equal((await reader.read()).events.length, 2); await reader.close()
    const exited = once(holder, 'exit'); holder.send({ release: true }); await exited; holder = undefined
    // Release of the native owner, not a plugin upgrade, removes contention.
    const writable = await ctx.sessionPersistence.open(address.sessionId, 'write'); await writable.close()
    console.log(JSON.stringify({ result: 'PASS', source: sha, pluginLoaded: false, separateProcesses: true,
      readonlyCandidate, ...(readonlyCandidate ? { readonlyBrowseErrors: 0, readonlyBrowseRounds: 3 } : {}),
      coldPageErrors: 0, nativeBrowseErrors: errors.length, nativeAgentError: direct.error.code,
      historyUnchanged: true, writeAvailableAfterOwnerRelease: true }))
  } finally {
    abort?.abort(); if (next) await next.catch(() => {}); await stream?.return()
    await ctx?.fiber.dispose()
    if (holder && holder.exitCode === null) { const exit = once(holder, 'exit'); holder.kill(); await exit }
    assert.equal(path.dirname(work), fs.realpathSync(os.tmpdir())); assert(path.basename(work).startsWith('dsh-native-browse-'))
    fs.rmSync(work, { recursive: true, force: true })
  }
}
