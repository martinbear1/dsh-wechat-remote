import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile, readFile, readdir, rm } from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { pathToFileURL, fileURLToPath } from 'node:url'
import { createHash } from 'node:crypto'
import { build } from 'esbuild'

// Compile only this implementation into an isolated directory; no repository
// build, profile, account, network, native package install or model call.
const compiled = await mkdtemp(path.join(os.tmpdir(), 'private-resources-library-code-'))
await build({ entryPoints: [fileURLToPath(new URL('../src/private-resources/library.ts', import.meta.url))], bundle: true,
  platform: 'node', format: 'esm', packages: 'external', outfile: path.join(compiled, 'library.mjs'), logLevel: 'silent' })
const { PrivateResourceLibrary } = await import(pathToFileURL(path.join(compiled, 'library.mjs')).href)
test.after(async () => { await rm(compiled, { recursive: true, force: true }) })
const sha = bytes => createHash('sha256').update(bytes).digest('hex')
const preset = (patch = {}) => ({ schemaVersion: 1, kind: 'preset', resourceId: 'story-helper', version: '1.0.0',
  name: '故事角色', description: '已交付的角色', basePreset: 'standard', systemPrompt: '  你是 {{user}} 的朋友。\r\n保留 {{bad syntax!}} 和中文 😊\n  ', ...patch })
const pack = (value = preset()) => { const bytes = Buffer.from(JSON.stringify(value)); return { bytes,
  release: { resourceId: value.resourceId, version: value.version, bytes: bytes.length, sha256: sha(bytes) } } }
async function fixture(t, options = {}) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'private-resources-library-')), directory = path.join(root, 'resources')
  const definitions = new Map([['standard', { id: 'standard', name: 'Standard', plugins: [
    { id: 'persona', name: '@deepseek-ai/dsh-persona', config: { prefix: 'Stock {{model}}', suffix: 'Base suffix', includeRuntimeContext: true } },
    { id: 'native-tool', name: '@deepseek-ai/dsh-tool-fs' },
  ] }]])
  const calls = [], registry = {
    async list() { return [...definitions.values()].map(({ plugins, ...value }) => value) },
    async resolve(id) { if (!definitions.has(id)) throw Error('not found'); return definitions.get(id) },
    async readDocument(id) { return { agentPreset: id, content: JSON.stringify(definitions.get(id).plugins) } },
    async register(value) {
      assert(!definitions.has(value.id)); calls.push(value); definitions.set(value.id, { ...value, ...(options.broken ? { broken: 'bad native mount' } : {}) })
      return async () => { definitions.delete(value.id) }
    },
  }
  const host = { get(name) { if (name === 'agentPresets') return registry; assert.fail(`unexpected host service: ${name}`) } }
  const create = () => new PrivateResourceLibrary(host, directory, { codec: { load: JSON.parse }, promptModule: 'cordis:privateResourcePrompt' })
  const libraries = [], library = create(); libraries.push(library)
  t.after(async () => { for (const item of libraries) await item.close(); await rm(root, { recursive: true, force: true }) })
  return { root, directory, definitions, calls, library, create() { const next = create(); libraries.push(next); return next } }
}
test('startup on a new node reads locally and creates no files', async t => {
  const f = await fixture(t); await f.library.start(); assert.deepEqual(f.library.list(), [])
  assert.deepEqual(await readdir(f.root), []); assert.equal(f.calls.length, 0)
})
test('installs an immutable version without occupational instructions or changing base', async t => {
  const f = await fixture(t), original = structuredClone(f.definitions.get('standard')), item = pack()
  const result = await f.library.install(item.bytes, item.release)
  assert.equal(result.status, 'installed'); assert.match(result.presetId, /^hr-resource-story-helper-[a-f0-9]{12}$/)
  assert.equal(result.name, '故事角色'); assert.equal(f.calls[0].name, '故事角色 · 1.0.0')
  assert.deepEqual(f.definitions.get('standard'), original)
  const composition = f.calls[0].plugins
  assert.deepEqual(composition[1], original.plugins[1]); assert.deepEqual(composition[0].config,
    { ...original.plugins[0].config, prefix: '{{harness_private_resource_prompt}}' })
  assert.equal(composition[2].config.text, preset().systemPrompt)
  assert(!JSON.stringify(composition).includes('human-workflow'))
  assert.deepEqual(await readFile(path.join(f.directory, sha(['story-helper', '1.0.0'].join('\0')), 'resource.json')), item.bytes)
})
test('same bytes are idempotent; another digest for the same version never replaces them', async t => {
  const f = await fixture(t), item = pack(); const installed = await f.library.install(item.bytes, item.release)
  assert.deepEqual(await f.library.install(item.bytes, item.release), installed); assert.equal(f.calls.length, 1)
  const changed = pack(preset({ systemPrompt: 'Different' }))
  await assert.rejects(f.library.install(changed.bytes, changed.release), /不同内容/)
  assert.equal(f.calls.length, 1); assert.equal(f.definitions.get(installed.presetId).plugins.at(-1).config.text, preset().systemPrompt)
})
test('each version remains registered and a fresh library restores solely from local files', async t => {
  const f = await fixture(t)
  const one = pack(), two = pack(preset({ version: '1.1.0-beta.1', systemPrompt: 'New role' }))
  const a = await f.library.install(one.bytes, one.release), b = await f.library.install(two.bytes, two.release)
  assert.notEqual(a.presetId, b.presetId); assert.equal(f.library.list().length, 2)
  await f.library.close(); assert.equal(f.definitions.size, 1)
  const next = f.create(); await next.start()
  assert.equal(next.list().length, 2); assert(next.list().every(item => item.status === 'installed')); assert.equal(f.definitions.size, 3)
})
test('hash, declared length and release identity are checked before any write', async t => {
  const f = await fixture(t), item = pack()
  assert.throws(() => f.library.install(item.bytes, { ...item.release, sha256: '0'.repeat(64) }), /不一致/)
  assert.throws(() => f.library.install(item.bytes, { ...item.release, bytes: item.bytes.length - 1 }), /不一致/)
  assert.throws(() => f.library.install(item.bytes, { ...item.release, resourceId: 'another' }), /格式/)
  assert.deepEqual(await readdir(f.root), []); assert.equal(f.calls.length, 0)
})
test('rejects code fields, invalid paths, floating versions, malformed UTF8 and oversized data', async t => {
  const f = await fixture(t)
  for (const patch of [{ scripts: 'process.exit()' }, { resourceId: '../outside' }, { version: '^1.0.0' }, { version: '1.0.0-01' },
    { systemPrompt: '' }, { systemPrompt: '\uD800' }, { systemPrompt: '\uDC00' }, { systemPrompt: '\u0000' },
    { basePreset: 'standard\n' }, { basePreset: 'standard\t' }, { basePreset: 'standard\r' },
    { systemPrompt: 'x'.repeat(1024 * 1024 + 1) }, { plugins: [] }]) {
    const item = pack(preset(patch)); assert.throws(() => f.library.install(item.bytes, item.release))
  }
  const invalid = Buffer.from([0xff, 0xff]); assert.throws(() => f.library.install(invalid, { ...pack().release, bytes: 2, sha256: sha(invalid) }), /UTF-8/)
  assert.throws(() => f.library.install(Buffer.alloc(2 * 1024 * 1024 + 1), pack().release))
  assert.equal(f.calls.length, 0)
})
test('broken native mount is disposed, reported unavailable, and cannot take down another resource', async t => {
  const f = await fixture(t, { broken: true }), item = pack()
  const result = await f.library.install(item.bytes, item.release)
  assert.equal(result.status, 'unavailable'); assert.equal(f.definitions.size, 1)
  assert.equal((await readdir(f.directory)).length, 1, 'download is retained, not falsely shown installed')
})
test('a preexisting native id is not adopted or overwritten', async t => {
  const f = await fixture(t), item = pack(), id = `hr-resource-story-helper-${sha('1.0.0').slice(0, 12)}`
  const existing = { id, name: 'Someone else', plugins: [] }; f.definitions.set(id, existing)
  const result = await f.library.install(item.bytes, item.release)
  assert.equal(result.status, 'unavailable'); assert.match(result.message, /未覆盖/); assert.equal(f.definitions.get(id), existing)
  await f.library.close(); assert.equal(f.definitions.get(id), existing)
})
test('failed persistence never registers a native preset', async t => {
  const f = await fixture(t), item = pack(); await writeFile(f.directory, 'not a directory')
  await assert.rejects(f.library.install(item.bytes, item.release)); assert.equal(f.calls.length, 0)
})
test('damaged local resource does not suppress healthy resources or create a repair write', async t => {
  const f = await fixture(t), one = pack(), two = pack(preset({ resourceId: 'other' }))
  await f.library.install(one.bytes, one.release); await f.library.install(two.bytes, two.release); await f.library.close()
  const bad = path.join(f.directory, sha(['story-helper', '1.0.0'].join('\0')), 'resource.json'); await writeFile(bad, '{}')
  const next = f.create(); await next.start(); assert.equal(next.list().length, 1); assert.equal(next.list()[0].resourceId, 'other')
  assert.equal(next.issues().length, 1); assert.equal(await readFile(bad, 'utf8'), '{}')
})
test('uncommitted staging directories are ignored on restart', async t => {
  const f = await fixture(t); await mkdir(path.join(f.directory, '.pending-interrupted'), { recursive: true })
  await writeFile(path.join(f.directory, '.pending-interrupted', 'resource.json'), '{')
  await f.library.start(); assert.deepEqual(f.library.list(), []); assert.deepEqual(f.library.issues(), [])
})
test('parallel installs serialize once and caller mutation cannot change queued bytes', async t => {
  const f = await fixture(t), item = pack(), input = Buffer.from(item.bytes)
  const first = f.library.install(input, item.release); input.fill(0)
  const [a, b] = await Promise.all([first, f.library.install(item.bytes, item.release)])
  assert.equal(a.status, 'installed'); assert.deepEqual(a, b); assert.equal(f.calls.length, 1)
})
test('close withdraws only owned native definitions and never deletes saved versions', async t => {
  const f = await fixture(t), item = pack(); await f.library.install(item.bytes, item.release); await f.library.close()
  assert.equal(f.definitions.size, 1); assert.equal((await readdir(f.directory)).length, 1)
  await assert.rejects(f.library.install(item.bytes, item.release), /已停止/)
})
test('disabled versions retain files, remain disabled after install/restart and can be enabled offline', async t => {
  const f = await fixture(t), item = pack(), installed = await f.library.install(item.bytes, item.release)
  assert.equal(installed.enabled, true)
  const disabled = await f.library.setEnabled('story-helper', '1.0.0', false)
  assert.equal(disabled.enabled, false); assert.equal(disabled.status, 'disabled'); assert(!f.definitions.has(installed.presetId))
  assert.deepEqual(await f.library.install(item.bytes, item.release), disabled, 'reinstall is not consent to turn a disabled resource on')
  await f.library.close(); const next = f.create(); await next.start()
  assert.deepEqual(next.list(), [disabled]); assert.equal(f.definitions.size, 1)
  const enabled = await next.setEnabled('story-helper', '1.0.0', true)
  assert.equal(enabled.enabled, true); assert.equal(enabled.status, 'installed'); assert(f.definitions.has(installed.presetId))
  await next.close(); const restored = f.create(); await restored.start()
  assert.deepEqual(restored.list(), [enabled]); assert.equal(f.calls.length, 3)
})
test('failed state persistence preserves the active native registration', async t => {
  const f = await fixture(t), item = pack(), installed = await f.library.install(item.bytes, item.release)
  const file = path.join(f.directory, sha(['story-helper', '1.0.0'].join('\0')), 'state.json')
  await mkdir(file)
  await assert.rejects(f.library.setEnabled('story-helper', '1.0.0', false))
  assert(f.definitions.has(installed.presetId)); assert.equal(f.library.list()[0].enabled, true)
})
test('state changes validate identity and do not invent unknown resources', async t => {
  const f = await fixture(t)
  assert.throws(() => f.library.setEnabled('../elsewhere', '1.0.0', true), /无效/)
  assert.throws(() => f.library.setEnabled('story-helper', '*', true), /无效/)
  assert.throws(() => f.library.setEnabled('story-helper', '1.0.0', 'yes'), /无效/)
  await assert.rejects(f.library.setEnabled('unknown', '1.0.0', false))
  assert.deepEqual(await readdir(f.root), []); assert.deepEqual(f.library.list(), [])
})
