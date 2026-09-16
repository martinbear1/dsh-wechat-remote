import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'

// Exercise real Node module resolution in separate processes. No patched
// require resolver, global npm state, host DSH, or model request is involved.
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-usage-中文 空格-'))
const adapter = new URL('../lib/turn-presentation.js', import.meta.url).href
function write(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, value)
}
function meter(base, id, exported = true) {
  const pkg = path.join(base, 'node_modules/@deepseek-ai/dsh-token-meter')
  write(path.join(pkg, 'package.json'), JSON.stringify({ name: '@deepseek-ai/dsh-token-meter', type: 'module',
    exports: exported ? { './client': './client.js' } : { '.': './client.js' } }))
  write(path.join(pkg, 'client.js'), `export function deriveTurnTokenUsage(events) {
    return { host: ${JSON.stringify(id)}, totalTokens: events.length }
  }`)
}
function host(base, id, available = true, exported = true) {
  const pkg = path.join(base, 'node_modules/@deepseek-ai/dsh')
  write(path.join(pkg, 'package.json'), JSON.stringify({ name: '@deepseek-ai/dsh', type: 'module' }))
  const entry = path.join(pkg, 'lib/bin.js')
  write(entry, `import { nativeTurnUsage } from ${JSON.stringify(adapter)};
    const [first, second] = await Promise.all([nativeTurnUsage(), nativeTurnUsage()]);
    const third = await nativeTurnUsage();
    console.log(JSON.stringify({ same: first === second && first === third,
      value: first?.([{ type: 'turn/start' }, { type: 'turn/end' }]) ?? null }));`)
  if (available) meter(pkg, id, exported)
  return entry
}
function check(entry, cwd, expected, args = []) {
  const result = spawnSync(process.execPath, [...args, entry], { cwd, encoding: 'utf8', windowsHide: true })
  assert.equal(result.status, 0, result.stderr)
  assert.deepEqual(JSON.parse(result.stdout), { same: true, value: expected })
}
try {
  const cwd = path.join(root, 'unrelated project')
  fs.mkdirSync(cwd)
  meter(cwd, 'wrong-cwd')
  const globalEntry = host(path.join(root, 'global/lib'), 'global-host')
  const npxEntry = host(path.join(root, 'cache/_npx/id'), 'npx-host')
  const bin = path.join(root, 'bin')
  fs.mkdirSync(bin)
  meter(bin, 'wrong-shim-directory')
  for (const [entry, id] of [[globalEntry, 'global-host'], [npxEntry, 'npx-host']]) {
    const expected = { host: id, totalTokens: 2 }
    check(entry, cwd, expected)
    if (process.platform !== 'win32') {
      const link = path.join(bin, id)
      const nested = path.join(bin, id + '-nested')
      fs.symlinkSync(path.relative(bin, entry), link)
      fs.symlinkSync(path.basename(link), nested)
      check(link, cwd, expected)
      check(nested, bin, expected)
      check(link, cwd, expected, ['--preserve-symlinks-main'])
    } else {
      // Windows npm shims pass a real JS path; directory junctions can still
      // appear in user-managed installations and need the same normalization.
      const junction = path.join(bin, id)
      fs.symlinkSync(path.dirname(entry), junction, 'junction')
      check(path.join(junction, path.basename(entry)), cwd, expected)
    }
  }
  // Genuine older hosts without the public export stay optional. A package
  // in cwd or next to the launcher must never supply another host's figures.
  check(host(path.join(root, 'older'), 'unused', true, false), cwd, null)
  check(host(path.join(root, 'absent'), 'unused', false), cwd, null)
  const noEntry = spawnSync(process.execPath, ['--input-type=module', '-e',
    `import { nativeTurnUsage } from ${JSON.stringify(adapter)}; console.log(await nativeTurnUsage());`],
  { cwd, encoding: 'utf8', windowsHide: true })
  assert.equal(noEntry.status, 0, noEntry.stderr)
  assert.equal(noEntry.stdout.trim(), 'undefined')
  console.log(`native turn usage: ${process.platform} real/global/npx entries, links, Unicode/spaces, cwd isolation, optional export and memoization passed`)
} finally {
  assert(path.dirname(root) === fs.realpathSync(os.tmpdir()) || path.dirname(root) === os.tmpdir())
  assert(path.basename(root).startsWith('dsh-usage-中文 空格-'))
  fs.rmSync(root, { recursive: true, force: true })
}
