/** Real setup/installProfile orchestration, isolated native CLI fixture.
 * Process discovery/runtime discovery/catalog IO are deterministic doubles;
 * no real DSH profile, service, network request or user configuration is used. */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { gzipSync } from 'node:zlib'
import { createHash } from 'node:crypto'

const setupUrl = new URL('../installer/bin/setup.mjs', import.meta.url)
const version = '1.7.14-rc.24', core = '@harness-remote/dsh-wechat-remote'
function archive() {
  const entries = [['package/package.json', JSON.stringify({ name: core, version })], ['package/lib/index.js', ''], ['package/lib/client.js', '']]
  const chunks = []
  for (const [name, content] of entries) {
    const bytes = Buffer.from(content), header = Buffer.alloc(512)
    header.write(name); header.write(bytes.length.toString(8).padStart(11, '0') + '\0', 124); header.write('0', 156)
    header.fill(32, 148, 156); header.write([...header].reduce((a, b) => a + b, 0).toString(8).padStart(6, '0') + '\0 ', 148)
    chunks.push(header, bytes, Buffer.alloc((512 - bytes.length % 512) % 512))
  }
  return gzipSync(Buffer.concat([...chunks, Buffer.alloc(1024)]))
}
async function fixture(t, running) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-stopped-installer-')))
  t.after(() => { assert.equal(path.dirname(root), fs.realpathSync(os.tmpdir())); assert(path.basename(root).startsWith('dsh-stopped-installer-')); fs.rmSync(root, { recursive: true }) })
  const home = path.join(root, 'home'), profile = path.join(home, 'profiles/web'), assets = path.join(root, 'assets')
  const cliRoot = path.join(root, 'fixture-dsh'), cli = path.join(cliRoot, 'lib/bin.js')
  fs.mkdirSync(profile, { recursive: true }); fs.mkdirSync(assets); fs.mkdirSync(path.dirname(cli), { recursive: true })
  fs.writeFileSync(path.join(cliRoot, 'package.json'), JSON.stringify({ name: '@deepseek-ai/dsh', version: '0.2.0-rc.1', bin: { dsh: 'lib/bin.js' } }))
  const original = { dependencies: { 'other-plugin': '1.0.0' }, dsh: { profile: { bundles: ['other-plugin'] } } }
  const manifest = path.join(profile, 'package.json'), patch = path.join(profile, 'cordis.patch.yml')
  fs.writeFileSync(manifest, JSON.stringify(original)); fs.writeFileSync(patch, '# user patch\n[]\n')
  for (const file of ['settings.json', 'credentials.yaml', 'session.json']) fs.writeFileSync(path.join(home, file), 'preserved ' + file)
  const called = path.join(root, 'native-called')
  fs.writeFileSync(cli, `const fs=require('fs'),path=require('path'),assert=require('assert/strict');
    assert.equal(process.argv[2],'plugin');assert.equal(process.argv[3],'--profile');assert.equal(process.argv[4],'web');assert.equal(process.argv[5],'add');
    assert.equal(process.env.DSH_HOME,${JSON.stringify(home)});assert.equal(process.cwd(),${JSON.stringify(home)});
    const p=${JSON.stringify(profile)},m=JSON.parse(fs.readFileSync(path.join(p,'package.json')));
    assert.deepEqual(m,${JSON.stringify(original)});assert(process.argv[6].startsWith('file:'));assert(fs.existsSync(path.join(p,process.argv[6].slice(5))));
    const installed=path.join(p,'node_modules',${JSON.stringify(core)});fs.mkdirSync(installed,{recursive:true});fs.writeFileSync(path.join(installed,'package.json'),JSON.stringify({name:${JSON.stringify(core)},version:${JSON.stringify(version)}}));
    m.dependencies[${JSON.stringify(core)}]=process.argv[6];m.dsh.profile.bundles.push(${JSON.stringify(core)});fs.writeFileSync(path.join(p,'package.json'),JSON.stringify(m));fs.writeFileSync(${JSON.stringify(called)},'native add');`)
  const bytes = archive(), now = Date.now()
  fs.writeFileSync(path.join(assets, 'plugin.tgz'), bytes)
  fs.writeFileSync(path.join(assets, 'release.json'), JSON.stringify({ version, catalog: {
    schemaVersion: 1, revision: 'offline-admission', issuedAt: now - 1000, expiresAt: now + 60000, blocked: [], retiredDsh: [],
    releases: [{ version, channel: 'preview', dsh: [], platforms: [], architectures: [], asset: {
      url: `https://github.com/martinbear1/dsh-wechat-remote/releases/download/v${version}/plugin.tgz`, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex'),
    } }],
  } }))
  const harness = path.join(root, 'harness.mjs'), harnessUrl = pathToFileURL(harness).href
  fs.writeFileSync(harness, `import fs from 'node:fs';
    export {validateDshCli,resolveHome} from ${JSON.stringify(new URL('../installer/bin/dsh-discovery.mjs', import.meta.url).href)};
    export {auditArchive,downloadRelease,DownloadUnavailableError} from ${JSON.stringify(new URL('../lib/update-download.js', import.meta.url).href)};
    export const calls=[]; const running=${JSON.stringify(running)};
    export async function mayHaveRunningDsh(){calls.push('running');return running.shift()??false}
    export async function chooseDsh(){calls.push('choose');return ${JSON.stringify(cli)}}
    export function resolveInstallRuntime(){calls.push('runtime');return {executable:process.execPath,cli:process.execPath,version:'fixture'}}
    export async function verifyInstallRuntime(){calls.push('verify-runtime')}
    export async function boundedFetch(){calls.push('catalog-offline');throw Error('offline fixture')}
  `)
  const copy = path.join(root, 'setup.mjs')
  const source = fs.readFileSync(setupUrl, 'utf8').replace(/from '(\.\.?\/[^']+)'/g, (_match, value) => {
    const fixtureDependency = /(?:install-runtime\.js|dsh-discovery\.mjs|update-download\.js)$/.test(value)
    return `from ${JSON.stringify(fixtureDependency ? harnessUrl : new URL(value, setupUrl).href)}`
  })
  fs.writeFileSync(copy, source)
  const { install } = await import(pathToFileURL(copy).href), { calls } = await import(harnessUrl)
  return { home, profile, called, calls, manifest, patch, original, install: () => install({ home, cli, assetsRoot: assets, open: false, startAfterInstall: false, companion: false, bundledOnly: true }) }
}

test('online CLI installation is refused before runtime checks, locks, HMR or profile mutation', async t => {
  const f = await fixture(t, [true])
  await assert.rejects(f.install(), /正在运行/)
  assert.deepEqual(f.calls, ['running'])
  assert.deepEqual(JSON.parse(fs.readFileSync(f.manifest)), f.original)
  assert.equal(fs.existsSync(f.called), false)
  assert.equal(fs.existsSync(path.join(f.home, 'harness-remote-updates')), false)
  assert.equal(fs.existsSync(path.join(f.profile, '.harness-remote-update.lock')), false)
})
test('stopped CLI first install retains native add and does not edit user settings or patches', async t => {
  const f = await fixture(t, [false, false])
  assert.deepEqual(await f.install(), { version, changed: true, starting: false })
  assert.equal(fs.readFileSync(f.called, 'utf8'), 'native add')
  assert.equal(fs.readFileSync(f.patch, 'utf8'), '# user patch\n[]\n')
  for (const file of ['settings.json', 'credentials.yaml', 'session.json']) assert.equal(fs.readFileSync(path.join(f.home, file), 'utf8'), 'preserved ' + file)
  assert.equal(JSON.parse(fs.readFileSync(f.manifest)).dependencies['other-plugin'], '1.0.0')
  assert.equal(fs.existsSync(path.join(f.profile, '.harness-remote-update.lock')), false)
})
test('host starting during offline preparation wins over installation without being stopped', async t => {
  const f = await fixture(t, [false, true])
  await assert.rejects(f.install(), /已开始运行/)
  assert.equal(fs.existsSync(f.called), false)
  assert.deepEqual(JSON.parse(fs.readFileSync(f.manifest)), f.original)
  assert.equal(fs.existsSync(path.join(f.profile, '.harness-remote-update.lock')), false)
})
