/** Exercise the same ASCII pnpm entry used by CLI and WebUI installation. */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { installToolPath } from '../lib/install-profile.js'

if (process.argv[2] === '--worker') {
  const result = spawnSync('cmd.exe', ['/d', '/c', `chcp ${Number(process.argv[3])}>nul & pnpm.cmd --version --reporter=append-only`], { encoding: 'utf8', windowsHide: true })
  process.stdout.write(result.stdout || '')
  process.stderr.write(result.stderr || '')
  process.exit(result.status ?? 1)
}

const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-tool-path-')))
try {
  // No alternate Node installation: a directory link exposes the real executable
  // through paths that previously failed. Only disposable fixture files are made.
  for (const suffix of ['plain', '软件 空格', '符号 !百分% &括号()']) {
    const directory = path.join(root, suffix)
    fs.mkdirSync(directory)
    const linked = path.join(directory, 'runtime')
    fs.symlinkSync(path.dirname(process.execPath), linked, process.platform === 'win32' ? 'junction' : 'dir')
    const executable = path.join(linked, path.basename(process.execPath))
    const cli = path.join(directory, 'check args.cjs')
    fs.writeFileSync(cli, 'console.log(JSON.stringify(process.argv.slice(2)))\n')
    const runtime = { executable, cli, version: 'fixture' }
    const bin = installToolPath(directory, runtime)
    const env = { ...process.env, HARNESS_INSTALL_NODE: executable, HARNESS_INSTALL_PNPM: cli }
    const file = path.join(bin, process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm')
    assert([...fs.readFileSync(file)].every(byte => byte < 128), 'shell entry never embeds Unicode paths')
    for (const cp of process.platform === 'win32' ? [936, 65001] : [null]) {
      const command = process.platform === 'win32'
        ? [process.execPath, [fileURLToPath(import.meta.url), '--worker', String(cp)]]
        : [file, ['--version', '--reporter=append-only']]
      const result = spawnSync(command[0], command[1], { cwd: bin, env, encoding: 'utf8', windowsHide: true, detached: true })
      assert.equal(result.status, 0, `${suffix} cp=${cp}: ${result.stderr}`)
      assert(result.stdout.trim(), `No output: ${suffix} cp=${cp}; stderr=${result.stderr}`)
      assert.deepEqual(JSON.parse(result.stdout.trim()), ['--version', '--reporter=append-only'])
    }
  }
  console.log('PASS native pnpm entry: Unicode, spaces, shell characters, detached workers; no code-page changes')
} finally {
  assert(path.dirname(root) === fs.realpathSync(os.tmpdir()) && path.basename(root).startsWith('dsh-tool-path-'))
  // Remove directory links first so cleanup cannot traverse the real Node folder.
  for (const name of fs.readdirSync(root)) {
    const linked = path.join(root, name, 'runtime')
    if (fs.lstatSync(linked).isSymbolicLink()) fs.unlinkSync(linked)
  }
  fs.rmSync(root, { recursive: true })
}
