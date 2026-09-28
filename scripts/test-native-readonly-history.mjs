/** Execute the pinned, unmodified native history controller with synthetic
 * retained observations. This is call-path evidence, not a live storage test. */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { createRequire } from 'node:module'
import { execFileSync } from 'node:child_process'
import { build } from 'esbuild'
import { resolveTypertGateway, createHistoryPageReader } from '../lib/dsh-protocol-compat.js'
const source = process.env.HARNESS_DSH_SOURCE
assert(source, 'HARNESS_DSH_SOURCE required')
const packages = new Map(), require = createRequire(import.meta.url)
for (const file of execFileSync('git', ['-C', source, 'ls-files', 'packages/**/package.json', 'vendor/**/package.json'], { encoding: 'utf8' }).trim().split(/\r?\n/)) {
  const full = path.join(source, file)
  packages.set(JSON.parse(fs.readFileSync(full)).name, path.dirname(full))
}
const work = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-native-history-')))
try {
  const artifact = path.join(work, 'lib/history.mjs')
  fs.copyFileSync(path.join(packages.get('@deepseek-ai/dsh-app-boot'), 'package.json'), path.join(work, 'package.json'))
  await build({ entryPoints: [path.join(source, 'packages/api/session-controller/src/history.ts')], outfile: artifact,
    bundle: true, platform: 'node', format: 'esm', target: 'es2022', logLevel: 'warning', plugins: [{ name: 'pinned-native', setup(builder) {
      builder.onResolve({ filter: /^[^./]/ }, args => {
        if (args.path.startsWith('node:') || path.isAbsolute(args.path)) return
        const name = args.path.startsWith('@') ? args.path.split('/').slice(0, 2).join('/') : args.path.split('/')[0]
        const directory = packages.get(name)
        if (directory) return { path: path.join(directory, 'src', (args.path.slice(name.length + 1) || 'index') + '.ts') }
        return { path: pathToFileURL(require.resolve(args.path)).href, external: true }
      })
    } }] })
  const { SessionHistoryController } = await import(pathToFileURL(artifact))
  let promoted = 0, leases = 0
  const events = [
    { seq: 0, type: 'user/message', time: 1, data: { content: [{ type: 'text', text: 'saved' }] } },
    { seq: 1, type: 'assistant/message', time: 2, data: { content: [{ type: 'text', text: 'reply' }] } },
  ]
  function observation() {
    leases++
    return { source: 'prepared', cursor: 1, header: { id: 'cold', cwd: '/work', origin: 'user' },
      inheritedEventCount: 0, events, projections: { asOfSeq: 1, values: { title: 'saved' } },
      retain: observation, [Symbol.dispose]() { leases-- } }
  }
  const services = { sessionQuery: { observeSession: async () => observation() }, agents: { get() {} } }
  const ctx = { ...services, get: key => services[key], on: () => () => {}, effect() {} }
  const native = new SessionHistoryController(ctx, value => {
    promoted++; value[Symbol.dispose]()
    // Native promotion is asynchronous in the host; count it without mutation.
  })
  const abort = new AbortController(), request = { address: { kind: 'session', sessionId: 'cold' }, maxMessages: 8 }
  const stream = native.follow(request, abort.signal)[Symbol.asyncIterator]()
  assert.equal((await stream.next()).value.type, 'snapshot')
  const next = stream.next()
  await new Promise(r => setImmediate(r))
  assert.equal(promoted, 1, 'unchanged native follow activates after opening a cold snapshot')
  abort.abort(); await next; await stream.return()
  services.typertGateway = {
    async invoke({ method, args, signal }) {
      if (method === 'list') return { items: [{ sessionId: 'cold', origin: 'user' }] }
      if (method === 'page') return native.page(args.request, signal)
      assert.fail(method)
    }, async stream() { assert.fail('readonly adapter must never follow') },
  }
  const value = await createHistoryPageReader(resolveTypertGateway(ctx), 'cold', new AbortController().signal)({ maxMessages: 8 })
  assert.equal(value.historyEndSeq, 1); assert.equal(value.events.length, 2)
  assert.equal(promoted, 1, 'reading through the adapter cannot activate another writer')
  assert.equal(leases, 0, 'native observation leases must be released')
  console.log('PASS pinned native history: follow promotion reproduced; read-only adapter uses validated native page and releases all leases')
} finally {
  assert.equal(path.dirname(work), fs.realpathSync(os.tmpdir())); assert(path.basename(work).startsWith('dsh-native-history-'))
  fs.rmSync(work, { recursive: true, force: true })
}
