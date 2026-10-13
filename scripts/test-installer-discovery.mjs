import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import assert from 'node:assert/strict'
import { test, after } from 'node:test'
import { discoverDsh, chooseDsh, validateDshCli, resolveHome, looksLikeDshProcess } from '../installer/bin/dsh-discovery.mjs'
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

test('stopped host defaults to terminal/global DSH without asking about old npx caches', async () => {
  const o = options('default-global'), prefix = fixture('default-global/prefix'), cache = fixture('default-global/cache')
  const cli = makeDsh(path.join(prefix, 'node_modules/@deepseek-ai/dsh'))
  makeDsh(path.join(cache, '_npx/aaaa/node_modules/@deepseek-ai/dsh'), '0.1.2-rc.1')
  makeDsh(path.join(cache, '_npx/bbbb/node_modules/@deepseek-ai/dsh'), '0.1.5-rc.2')
  const prompt = async () => { throw new Error('ordinary default must not ask') }
  assert.equal(await chooseDsh({ ...o, env: { PATH: prefix }, cache, prompt }), cli)
  assert.equal(await chooseDsh({ ...o, prefix, cache, prompt }), cli)
  for (let n = 0; n < 515; n++) fs.mkdirSync(path.join(cache, '_npx', (n + 10000).toString(16)))
  assert.equal(await chooseDsh({ ...o, env: { Path: prefix }, cache, prompt }), cli)
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
test('home resolution matches DSH defaults and tilde expansion', () => {
  assert.equal(resolveHome('', root), path.join(root, '.dsh'))
  assert.equal(resolveHome('~/custom', root), path.join(root, 'custom'))
  assert.equal(resolveHome('~', root), root)
})
test('CLI options preserve default behavior and reject ambiguity', () => {
  assert.deepEqual(parseArguments([]), {})
  assert.deepEqual(parseArguments(['--no-start']), { startAfterInstall: false })
  assert.deepEqual(parseArguments(['--profile', 'web', '--home', root, '--repair', '--dsh-cli', 'C:/test/lib/bin.js']),
    { profileName: 'web', home: root, repair: true, cli: 'C:/test/lib/bin.js' })
  for (const args of [['--profile'], ['--home', '--repair'], ['--unknown'], ['--repair', '--repair']]) {
    assert.throws(() => parseArguments(args))
  }
})

test('POSIX global and npx symlinks resolve to the same canonical CLI', { skip: process.platform === 'win32' }, async () => {
  const o = options('posix'), bin = fixture('posix/任意 prefix/bin')
  const cli = makeDsh(path.join(root, 'posix/cache/_npx/abcd/node_modules/@deepseek-ai/dsh'))
  const link = path.join(bin, 'dsh')
  fs.symlinkSync(path.relative(bin, cli), link)
  assert.equal(await chooseDsh({ ...o, env: { PATH: bin } }), cli)
})

test('running-host guard recognizes POSIX symlink entry points as well as Windows CLI', () => {
  for (const command of ['node /home/user/.npm/_npx/abc/node_modules/.bin/dsh web',
    'node /opt/homebrew/bin/dsh web', 'node /Users/u/cache with spaces/node_modules/@deepseek-ai/dsh/lib/bin.js web',
    'node C:\\npm\\node_modules\\@deepseek-ai\\dsh\\lib\\bin.js web',
    '"C:\\Program Files\\nodejs\\node.exe" "C:\\用户\\cache with spaces\\node_modules\\@deepseek-ai\\dsh\\lib\\bin.js" web',
    '/usr/local/bin/node --trace-warnings --inspect=127.0.0.1:9229 /usr/local/bin/dsh web',
    'node --require /tmp/register.cjs --import /tmp/register.mjs /opt/homebrew/bin/dsh web',
    'node -- /opt/homebrew/bin/dsh web']) assert(looksLikeDshProcess(command), command)
  for (const command of ['node server.js', 'npm exec @deepseek-ai/dsh web', '/bin/dsh-unrelated web']) assert(!looksLikeDshProcess(command))
})

test('DSH paths passed to another script do not incorrectly block installation', () => {
  for (const command of [
    'node test.mjs /usr/local/lib/node_modules/@deepseek-ai/dsh/lib/bin.js',
    'node /tmp/test.mjs /usr/local/lib/node_modules/@deepseek-ai/dsh/lib/bin.js',
    'node "/tmp/test with spaces.mjs" "/opt/cache with spaces/node_modules/@deepseek-ai/dsh/lib/bin.js"',
    'node /tmp/test with spaces.mjs /usr/local/lib/node_modules/@deepseek-ai/dsh/lib/bin.js',
    'node /tmp/inspector /usr/local/lib/node_modules/@deepseek-ai/dsh/lib/bin.js',
    'node /usr/local/lib/node_modules/npm/bin/npm-cli.js exec -- /usr/local/bin/dsh web',
    'node /usr/local/lib/node_modules/npm/bin/npm-cli.js inspect /usr/local/lib/node_modules/@deepseek-ai/dsh/lib/bin.js',
    'node --require /usr/local/lib/node_modules/@deepseek-ai/dsh/lib/bin.js /tmp/inspector.mjs',
    'node --eval "console.log(process.argv)" /usr/local/bin/dsh',
    'node --check /usr/local/lib/node_modules/@deepseek-ai/dsh/lib/bin.js',
    'node --test /usr/local/lib/node_modules/@deepseek-ai/dsh/lib/bin.js',
  ]) assert.equal(looksLikeDshProcess(command), false, command)
})

test('Linux argv recognizes only the actual script and preserves whitespace exactly', () => {
  const cli = '/home/user/cache with spaces/node_modules/@deepseek-ai/dsh/lib/bin.js'
  for (const args of [
    ['/usr/bin/node', cli, 'web'],
    ['node', '--import', '/tmp/preload with spaces.mjs', cli, 'web'],
    ['node', '--trace-warnings', '--', cli, '--profile', 'web'],
    ['nodejs', '/opt/homebrew/bin/dsh', 'web'],
  ]) assert.equal(looksLikeDshProcess(args), true, JSON.stringify(args))
  for (const args of [
    ['node', '/tmp/probe.mjs', cli],
    ['node', '/tmp/probe with spaces', cli],
    ['node', '-r', cli, '/tmp/probe.mjs'],
    ['node', '-e', 'console.log(process.argv)', cli],
    ['node', '--check', cli],
    ['npm', 'exec', cli, 'web'],
  ]) assert.equal(looksLikeDshProcess(args), false, JSON.stringify(args))
})

test('macOS process listing checks each command independently', () => {
  assert.equal(looksLikeDshProcess('node /tmp/test.mjs /usr/local/bin/dsh\nnode server.js\n'), false)
  assert.equal(looksLikeDshProcess('node /tmp/test.mjs /usr/local/bin/dsh\n/usr/bin/node /usr/local/bin/dsh web\n'), true)
})

test('running Desktop hosts do not block Web CLI installation on macOS or Windows', () => {
  const desktopCommands = [
    '/Applications/DeepSeek Harness.app/Contents/MacOS/DeepSeek Harness --expose-internals /Applications/DeepSeek Harness.app/Contents/Resources/app.asar/dsh/node_modules/@deepseek-ai/dsh-desktop-host/lib/index.js /Applications/DeepSeek Harness.app/Contents/Resources/app.asar/dsh /Users/test/.dsh/profiles/desktop',
    '"C:\\Users\\test\\AppData\\Local\\Programs\\DeepSeek Harness\\DeepSeek Harness.exe" --expose-internals "C:\\Users\\test\\AppData\\Local\\Programs\\DeepSeek Harness\\resources\\app.asar\\dsh\\node_modules\\@deepseek-ai\\dsh-desktop-host\\lib\\index.js"',
    'node /opt/dsh/node_modules/@deepseek-ai/dsh-desktop-host/lib/index.js /opt/dsh /home/test/.dsh/profiles/desktop',
  ]
  for (const command of desktopCommands) assert.equal(looksLikeDshProcess(command), false, command)
  assert.equal(looksLikeDshProcess(desktopCommands.join('\n')), false)
  assert.equal(looksLikeDshProcess(desktopCommands.join('\n') + '\n/usr/local/bin/node /usr/local/bin/dsh web'), true,
    'a real Web host still must stop before replacing its dependencies')
})
