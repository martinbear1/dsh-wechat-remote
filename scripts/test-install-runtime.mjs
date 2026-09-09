import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { resolveInstallRuntime, verifyInstallRuntime, INSTALL_PNPM_VERSION } from '../lib/install-runtime.js'
const owner = fileURLToPath(new URL('../', import.meta.url))
const runtime = resolveInstallRuntime(owner)
assert.equal(runtime.version, INSTALL_PNPM_VERSION)
assert(runtime.cli.endsWith('pnpm.mjs'), 'resolve declared bin, not guessed pnpm.cjs')
const oldPath = process.env.PATH
try { process.env.PATH = ''; await verifyInstallRuntime(runtime) } finally { process.env.PATH = oldPath }
assert.throws(() => resolveInstallRuntime(owner, process.execPath, '20.19.0'))
assert.throws(() => resolveInstallRuntime(owner, process.execPath, '22.12.0'))
const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-runtime-test-')))
try {
  const pkg = path.join(root, 'node_modules/pnpm'); fs.mkdirSync(pkg, { recursive: true })
  fs.writeFileSync(path.join(root, 'package.json'), '{}')
  const manifest = (version, bin) => fs.writeFileSync(path.join(pkg, 'package.json'), JSON.stringify({ name: 'pnpm', version, bin, exports: { '.': './package.json' } }))
  manifest('10.0.0', { pnpm: 'cli.cjs' }); assert.throws(() => resolveInstallRuntime(root))
  fs.writeFileSync(path.join(root, 'outside.cjs'), '')
  manifest(INSTALL_PNPM_VERSION, { pnpm: '../../outside.cjs' }); assert.throws(() => resolveInstallRuntime(root))
  manifest(INSTALL_PNPM_VERSION, { pnpm: 'cli.cjs' }); fs.writeFileSync(path.join(pkg, 'cli.cjs'), `console.log('${INSTALL_PNPM_VERSION}')`)
  await verifyInstallRuntime(resolveInstallRuntime(root))
  fs.writeFileSync(path.join(pkg, 'cli.cjs'), `console.log('10.0.0')`)
  await assert.rejects(verifyInstallRuntime(resolveInstallRuntime(root)))
} finally {
  assert(path.basename(root).startsWith('dsh-runtime-test-') && path.dirname(root) === fs.realpathSync(os.tmpdir()))
  fs.rmSync(root, { recursive: true })
}
console.log(JSON.stringify({ ok: true, cases: 8, globalPnpmRequired: false }))
