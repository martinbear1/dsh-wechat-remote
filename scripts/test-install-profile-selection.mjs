// Current source in memory; native command completion is synthetic. No actual
// DSH/pnpm, host, network, model or user's profile is launched or accessed.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import vm from 'node:vm'
import { EventEmitter } from 'node:events'
import { createRequire } from 'node:module'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'

const require = createRequire(import.meta.url)
const targetVersion = '1.7.14-test.1'
const packages = ['dsh-wechat-remote', '@harness-remote/dsh-wechat-remote']
const bundle = await build({ entryPoints: [fileURLToPath(new URL('../src/install-profile.ts', import.meta.url))],
  bundle: true, write: false, platform: 'node', format: 'cjs', target: 'node22',
  plugins: [{ name: 'synthetic-process', setup(builder) {
    builder.onResolve({ filter: /^node:child_process$/ }, () => ({ path: 'process', namespace: 'fixture' }))
    builder.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({ contents:
      'export const spawn = (...args) => globalThis.fixtureSpawn(...args); export const execFile = () => { throw new Error("No native process permitted") }', loader: 'js' }))
  } }],
})
const write = (file, value) => { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, value) }
const json = (file, value) => write(file, JSON.stringify(value))
const readJson = file => JSON.parse(fs.readFileSync(file, 'utf8'))

function fixture(t, packageName, initial = 'enabled', result = {}) {
  const home = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-install-selection-')))
  t.after(() => {
    assert.equal(path.dirname(home), fs.realpathSync(os.tmpdir()))
    assert(path.basename(home).startsWith('dsh-install-selection-'))
    fs.rmSync(home, { recursive: true, force: true })
  })
  const profile = path.join(home, 'profiles', 'web'), directory = path.join(home, 'job')
  const manifestPath = path.join(profile, 'package.json')
  const before = { dependencies: { first: '1.0.0', last: 'file:../last.tgz',
    ...(initial === 'fresh' ? {} : { [packageName]: 'file:old.tgz' }) },
    dsh: { profile: { bundles: initial === 'enabled' ? ['first', packageName, 'last'] : ['first', 'last'] } },
    packageManager: 'pnpm@10.0.0', custom: { preserve: true } }
  json(manifestPath, before)
  write(path.join(directory, 'release.tgz'), 'synthetic archive; never executed')
  const patch = '# retained component preference\n- id: wechat-clawbot\n  disabled: true\n'
  write(path.join(profile, 'cordis.patch.yml'), patch)
  write(path.join(home, 'cordis.patch.yml'), '# retained home patch\n[]\n')
  write(path.join(home, 'harness-remote', 'fixture-state.json'), 'synthetic pairing and resource data')
  let calls = 0
  const fixtureSpawn = (_executable, args, options) => {
    calls++
    assert.deepEqual(Array.from(args.slice(1, 5)), ['plugin', '--profile', 'web', 'add'])
    assert.equal(options.env.DSH_HOME, home)
    assert.deepEqual(readJson(manifestPath), before, 'installer must not pre-edit selection or dependency sources')
    const child = new EventEmitter()
    queueMicrotask(() => {
      try {
        // These are native operation outcomes, not a replacement package manager.
        const after = structuredClone(before)
        after.dependencies[packageName] = args[5]
        if (initial === 'fresh') after.dsh.profile.bundles.push(packageName)
        if (result.enabled === true && !after.dsh.profile.bundles.includes(packageName)) after.dsh.profile.bundles.push(packageName)
        if (result.enabled === false) after.dsh.profile.bundles = after.dsh.profile.bundles.filter(name => name !== packageName)
        if (result.owner === 'missing' || result.owner === 'foreign') {
          delete after.dependencies[packageName]
          after.dsh.profile.bundles = after.dsh.profile.bundles.filter(name => name !== packageName)
        }
        if (result.owner === 'foreign' || result.owner === 'mixed') {
          const other = packages.find(name => name !== packageName)
          after.dependencies[other] = '1.0.0'
        }
        json(manifestPath, after)
        json(path.join(profile, 'node_modules', packageName, 'package.json'), { name: packageName, version: result.version ?? targetVersion })
        child.emit('close', 0, null)
      } catch (error) { child.emit('error', error) }
    })
    return child
  }
  const context = { module: { exports: {} }, exports: {}, require, process, Buffer, setTimeout, clearTimeout, fixtureSpawn }
  vm.createContext(context); vm.runInContext(bundle.outputFiles[0].text, context)
  const job = { profile, directory, packageName, targetVersion, cli: 'fixture-cli-never-executed',
    runtime: { executable: process.execPath, cli: 'fixture-pnpm-never-executed', version: 'fixture' } }
  return { before, read: () => readJson(manifestPath), run: () => context.module.exports.installProfile(job), verifyUntouched() {
    assert.equal(calls, 1)
    assert.equal(fs.readFileSync(path.join(profile, 'cordis.patch.yml'), 'utf8'), patch)
    assert.equal(fs.readFileSync(path.join(home, 'cordis.patch.yml'), 'utf8'), '# retained home patch\n[]\n')
    assert.equal(fs.readFileSync(path.join(home, 'harness-remote', 'fixture-state.json'), 'utf8'), 'synthetic pairing and resource data')
    const after = readJson(manifestPath)
    assert.equal(after.dependencies.first, before.dependencies.first)
    assert.equal(after.dependencies.last, before.dependencies.last)
    assert.equal(after.packageManager, before.packageManager)
    assert.deepEqual(after.custom, before.custom)
  } }
}

for (const packageName of packages) {
  for (const initial of ['enabled', 'disabled', 'fresh']) {
    test(`${packageName}: ${initial} installation preserves native selection and user data`, async t => {
      const f = fixture(t, packageName, initial)
      await f.run()
      const expected = initial === 'fresh' ? [...f.before.dsh.profile.bundles, packageName] : f.before.dsh.profile.bundles
      assert.deepEqual(f.read().dsh.profile.bundles, expected)
      f.verifyUntouched()
    })
  }
  for (const initial of ['enabled', 'disabled', 'fresh']) {
    test(`${packageName}: refuses native outcome that unexpectedly changes ${initial} selection`, async t => {
      const f = fixture(t, packageName, initial, { enabled: initial === 'disabled' })
      await assert.rejects(f.run(), /启用状态与原设置不一致/)
      f.verifyUntouched()
    })
  }
  test(`${packageName}: wrong installed version is still rejected while disabled`, async t => {
    const f = fixture(t, packageName, 'disabled', { version: '1.7.14-test.0' })
    await assert.rejects(f.run(), /版本不匹配/)
    f.verifyUntouched()
  })
  for (const owner of ['missing', 'foreign', 'mixed']) {
    test(`${packageName}: ${owner} installation owner is still rejected while disabled`, async t => {
      const f = fixture(t, packageName, 'disabled', { owner })
      await assert.rejects(f.run(), /唯一的原生安装|两种微信连接/)
      f.verifyUntouched()
    })
  }
}
