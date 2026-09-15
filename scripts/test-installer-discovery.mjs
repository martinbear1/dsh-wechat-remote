import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import assert from 'node:assert/strict'
import { test, after } from 'node:test'
import { discoverDsh, chooseDsh, validateDshCli, assertInstallTarget, resolveHome, installHostArgv, looksLikeDshProcess } from '../installer/bin/dsh-discovery.mjs'
import { parseArguments } from '../installer/bin/setup.mjs'

const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-discovery-test-')))
const fixture = name => { const dir = path.join(root, name); fs.mkdirSync(dir, { recursive: true }); return dir }
const makeDsh = (pkg, version = '0.1.5-rc.1') => {
  fs.mkdirSync(path.join(pkg, 'lib'), { recursive: true })
  fs.writeFileSync(path.join(pkg, 'package.json'), JSON.stringify({ name: '@deepseek-ai/dsh', version, bin: { dsh: 'lib/bin.js' } }))
  const cli = path.join(pkg, 'lib/bin.js')
  fs.writeFileSync(cli, 'throw Error("Fixture must never be executed")\n')
  return fs.realpathSync(cli)
}
const options = name => ({ cwd: fixture(name), env: { PATH: '' }, cache: '', prefix: '' })
after(() => {
  assert(path.dirname(root) === fs.realpathSync(os.tmpdir()) && path.basename(root).startsWith('dsh-discovery-test-'))
  fs.rmSync(root, { recursive: true })
})

test('global npm installation resolves without executing a shim', async () => {
  const o = options('global'), prefix = fixture('global/npm prefix')
  const cli = makeDsh(path.join(prefix, 'node_modules/@deepseek-ai/dsh'))
  assert.equal(await chooseDsh({ ...o, env: { PATH: prefix } }), cli)
})
test('npx-only cache with spaces/Chinese path resolves from a fresh terminal', async () => {
  const o = options('npx'), cache = fixture('缓存 with spaces')
  const cli = makeDsh(path.join(cache, '_npx/a1234/node_modules/@deepseek-ai/dsh'))
  assert.equal(await chooseDsh({ ...o, cache }), cli)
})
test('Windows .bin text shims resolve the adjacent package, not arbitrary script content', async () => {
  const o = options('shims'), modules = fixture('shims/node_modules'), bin = fixture('shims/node_modules/.bin')
  const cli = makeDsh(path.join(modules, '@deepseek-ai/dsh'))
  for (const name of ['dsh', 'dsh.cmd', 'dsh.ps1']) fs.writeFileSync(path.join(bin, name), 'do not execute fixture shim')
  assert.equal(await chooseDsh({ ...o, env: { PATH: bin } }), cli)
})
test('project-local package is found walking only parent directories', async () => {
  const o = options('project/subdir'), cli = makeDsh(path.join(root, 'project/node_modules/@deepseek-ai/dsh'))
  assert.equal(await chooseDsh(o), cli)
})
test('built official source checkout is a candidate', async () => {
  const o = options('source/docs'), cli = makeDsh(path.join(root, 'source/apps/cli'))
  assert.equal(await chooseDsh(o), cli)
})
test('custom global prefix is respected without assuming the OS npm default', async () => {
  const o = options('custom'), prefix = fixture('custom-prefix')
  const cli = makeDsh(path.join(prefix, 'lib/node_modules/@deepseek-ai/dsh'))
  assert.equal(await chooseDsh({ ...o, prefix }), cli)
})
test('missing DSH does not download or initialize a host', async () => {
  await assert.rejects(chooseDsh(options('missing')), /未找到 DSH/)
})
test('stale and malformed cache entries are ignored', async () => {
  const o = options('stale'), cache = fixture('stale/cache')
  const broken = fixture('stale/cache/_npx/aaaa/node_modules/@deepseek-ai/dsh/lib')
  fs.writeFileSync(path.join(broken, 'bin.js'), 'untrusted fixture')
  const cli = makeDsh(path.join(cache, '_npx/bbbb/node_modules/@deepseek-ai/dsh'))
  assert.equal(await chooseDsh({ ...o, cache }), cli)
})
test('same canonical CLI discovered in several locations is deduplicated', async () => {
  const o = options('dedup'), prefix = fixture('dedup/prefix')
  makeDsh(path.join(prefix, 'node_modules/@deepseek-ai/dsh'))
  assert.equal((await discoverDsh({ ...o, prefix, env: { PATH: prefix + path.delimiter + prefix } })).length, 1)
})
test('multiple cached versions require choice, never select newest cache by timestamp', async () => {
  const o = options('multiple'), cache = fixture('multiple/cache')
  const oldCli = makeDsh(path.join(cache, '_npx/aaaa/node_modules/@deepseek-ai/dsh'), '0.1.2-rc.1')
  makeDsh(path.join(cache, '_npx/bbbb/node_modules/@deepseek-ai/dsh'), '0.1.5-rc.1')
  assert.equal(await chooseDsh({ ...o, cache, prompt: async () => '1' }), oldCli)
  await assert.rejects(chooseDsh({ ...o, cache, prompt: async () => '' }), /取消/)
  if (!process.stdin.isTTY) await assert.rejects(chooseDsh({ ...o, cache }), /多份 DSH/)
})
test('explicit CLI is validated; no arbitrary executable or invalid metadata', async () => {
  const o = options('explicit'), cli = makeDsh(path.join(o.cwd, 'dsh'))
  assert.equal(await chooseDsh({ ...o, cli }), cli)
  fs.writeFileSync(path.resolve(cli, '../../package.json'), '{"name":"not-dsh","bin":{"dsh":"lib/bin.js"}}')
  assert.throws(() => validateDshCli(cli), /不是有效/)
})
test('live npx handshake remains authoritative when another global CLI exists', () => {
  const home = fixture('target/home'), profile = fixture('target/home/profiles/web')
  const live = makeDsh(path.join(root, 'target/npx/dsh')), other = makeDsh(path.join(root, 'target/global/dsh'))
  const host = { home, profile, cli: live, pid: 123 }
  assert.doesNotThrow(() => assertInstallTarget(host, { home, profile, pid: 123 }))
  assert.throws(() => assertInstallTarget(host, { home, profile, cli: other, pid: 123 }), /身份/)
  for (const bad of [{ home: root }, { profile: root }, { pid: 321 }]) {
    assert.throws(() => assertInstallTarget({ ...host, ...bad }, { home, profile, pid: 123 }), /身份/)
  }
})
test('home resolution matches DSH defaults and tilde expansion', () => {
  assert.equal(resolveHome('', root), path.join(root, '.dsh'))
  assert.equal(resolveHome('~/custom', root), path.join(root, 'custom'))
  assert.equal(resolveHome('~', root), root)
})
test('CLI options preserve default behavior and reject ambiguity', () => {
  assert.deepEqual(parseArguments([]), {})
  assert.deepEqual(parseArguments(['--profile', 'web', '--home', root, '--repair', '--dsh-cli', 'C:/test/lib/bin.js']),
    { profileName: 'web', home: root, repair: true, cli: 'C:/test/lib/bin.js' })
  for (const args of [['--profile'], ['--home', '--repair'], ['--unknown'], ['--repair', '--repair']]) {
    assert.throws(() => parseArguments(args))
  }
})

test('POSIX global and npx symlinks resolve and restart with the same canonical CLI', { skip: process.platform === 'win32' }, async () => {
  const o = options('posix'), bin = fixture('posix/任意 prefix/bin')
  const cli = makeDsh(path.join(root, 'posix/cache/_npx/abcd/node_modules/@deepseek-ai/dsh'))
  const link = path.join(bin, 'dsh')
  fs.symlinkSync(path.relative(bin, cli), link)
  assert.equal(await chooseDsh({ ...o, env: { PATH: bin } }), cli)
  assert.deepEqual(installHostArgv({ cli, argv: [link, 'web', '--port', '7280'] }), [cli, 'web', '--port', '7280'])
})

test('restart arguments cannot select a different DSH or arbitrary command', () => {
  const o = options('argv'), cli = makeDsh(path.join(o.cwd, 'dsh'))
  const other = makeDsh(path.join(o.cwd, 'other/dsh'))
  assert.deepEqual(installHostArgv({ cli, argv: [cli, 'web'] }), [cli, 'web'])
  assert.throws(() => installHostArgv({ cli, argv: [other, 'web'] }), /启动参数/)
  assert.throws(() => installHostArgv({ cli, argv: [cli, {}] }), /启动参数/)
})

test('running-host guard recognizes POSIX symlink entry points as well as Windows CLI', () => {
  for (const command of ['node /home/user/.npm/_npx/abc/node_modules/.bin/dsh web',
    'node /opt/homebrew/bin/dsh web', 'node /Users/u/cache with spaces/node_modules/@deepseek-ai/dsh/lib/bin.js web',
    'node C:\\npm\\node_modules\\@deepseek-ai\\dsh\\lib\\bin.js web']) assert(looksLikeDshProcess(command))
  for (const command of ['node server.js', 'npm exec @deepseek-ai/dsh web', '/bin/dsh-unrelated web']) assert(!looksLikeDshProcess(command))
})
