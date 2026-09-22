import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { tmpdir } from 'node:os'
import { test } from 'node:test'
import { inspectPackedPlugin } from './verify-packed-plugin.mjs'

function fixture(t) {
  const parent = path.resolve(tmpdir()), root = fs.mkdtempSync(path.join(parent, 'packed-plugin-fixture-'))
  const write = (file, text) => { fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true }); fs.writeFileSync(path.join(root, file), text) }
  write('package.json', JSON.stringify({ main: 'lib/index.js', exports: { '.': { default: './lib/index.js', types: './lib/index.d.ts' } } }))
  write('lib/index.js', "export { proof } from './agent-http-proof.js'; new URL('./worker.js', import.meta.url); new URL('../', import.meta.url)")
  write('lib/index.d.ts', "export { Proof } from './agent-http-proof.js'")
  write('lib/agent-http-proof.js', 'export const proof = true')
  write('lib/agent-http-proof.d.ts', 'export interface Proof {}')
  write('lib/worker.js', '// inert worker fixture')
  t.after(() => { assert.equal(path.dirname(root), parent); assert(path.basename(root).startsWith('packed-plugin-fixture-')); fs.rmSync(root, { recursive: true, force: true }) })
  return { root, write }
}

test('packed closure accepts present runtime, type export and worker targets', t => {
  const f = fixture(t)
  assert.equal(inspectPackedPlugin(f.root).modules, 5)
})
test('missing runtime helper fails even though the checkout could contain it', t => {
  const f = fixture(t)
  fs.unlinkSync(path.join(f.root, 'lib/agent-http-proof.js'))
  assert.throws(() => inspectPackedPlugin(f.root), /missing packed file.*agent-http-proof\.js/)
})
test('missing public declaration and deferred worker fail closed', t => {
  const f = fixture(t)
  fs.unlinkSync(path.join(f.root, 'lib/index.d.ts'))
  assert.throws(() => inspectPackedPlugin(f.root), /missing packed file.*index\.d\.ts/)
  f.write('lib/index.d.ts', '')
  fs.unlinkSync(path.join(f.root, 'lib/worker.js'))
  assert.throws(() => inspectPackedPlugin(f.root), /missing packed file.*worker\.js/)
})
test('a present JavaScript helper cannot conceal its omitted declaration', t => {
  const f = fixture(t)
  fs.unlinkSync(path.join(f.root, 'lib/agent-http-proof.d.ts'))
  assert.throws(() => inspectPackedPlugin(f.root), /missing packed file.*agent-http-proof\.d\.ts/)
})
test('relative import cannot escape to a parent checkout or module', t => {
  const f = fixture(t)
  f.write('lib/index.js', "import '../../outside.js'")
  assert.throws(() => inspectPackedPlugin(f.root), /path escapes package/)
})
test('undeclared external runtime dependency is not supplied by development modules', t => {
  const f = fixture(t)
  f.write('lib/index.js', "import 'accidental-dev-dependency'")
  assert.throws(() => inspectPackedPlugin(f.root), /undeclared dependency accidental-dev-dependency/)
})
