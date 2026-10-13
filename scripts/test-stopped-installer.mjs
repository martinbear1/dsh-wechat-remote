/** Real setup/installProfile orchestration, isolated native CLI fixture.
 * Process/runtime discovery, self-packing and catalog IO are deterministic doubles;
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
const version = '1.7.14-rc.24', core = '@harness-remote/dsh-wechat-remote', native = 'dsh-wechat-remote'
function archive(entries) {
  const chunks = []
  for (const [name, content] of entries) {
    const bytes = Buffer.from(content), header = Buffer.alloc(512)
    header.write(name); header.write(bytes.length.toString(8).padStart(11, '0') + '\0', 124); header.write('0', 156)
    header.fill(32, 148, 156); header.write([...header].reduce((a, b) => a + b, 0).toString(8).padStart(6, '0') + '\0 ', 148)
    chunks.push(header, bytes, Buffer.alloc((512 - bytes.length % 512) % 512))
  }
  return gzipSync(Buffer.concat([...chunks, Buffer.alloc(1024)]))
}
function snapshot(root) {
  return Object.fromEntries(fs.readdirSync(root, { recursive: true }).sort().map(name => {
    const file = path.join(root, name)
    return [name, fs.statSync(file).isDirectory() ? '<directory>' : fs.readFileSync(file).toString('base64')]
  }))
}
async function fixture(t, { running = [], owner, installedVersion = '1.7.13', failNative = false, packOwnerRace = false, peerRefresh = false } = {}) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-stopped-installer-')))
  const home = path.join(root, 'home'), profile = path.join(home, 'profiles/web'), assets = path.join(root, 'assets')
  const cliRoot = path.join(root, 'fixture-dsh'), cli = path.join(cliRoot, 'lib/bin.js')
  fs.mkdirSync(profile, { recursive: true }); fs.mkdirSync(assets); fs.mkdirSync(path.dirname(cli), { recursive: true })
  fs.writeFileSync(path.join(cliRoot, 'package.json'), JSON.stringify({ name: '@deepseek-ai/dsh', version: '0.2.0-rc.1', bin: { dsh: 'lib/bin.js' } }))
  const original = { dependencies: { 'other-plugin': '1.0.0' }, dsh: { profile: { bundles: ['other-plugin'] } } }
  if (owner) {
    original.dependencies[owner] = installedVersion
    original.dsh.profile.bundles.push(owner)
    const installed = path.join(profile, 'node_modules', owner)
    fs.mkdirSync(installed, { recursive: true })
    fs.writeFileSync(path.join(installed, 'package.json'), JSON.stringify({ name: owner, version: installedVersion }))
  }
  const manifest = path.join(profile, 'package.json'), patch = path.join(profile, 'cordis.patch.yml')
  fs.writeFileSync(manifest, JSON.stringify(original)); fs.writeFileSync(patch, '# user patch\n[]\n')
  for (const file of ['settings.json', 'credentials.yaml', 'session.json']) fs.writeFileSync(path.join(home, file), 'preserved ' + file)
  const desktop = path.join(home, 'profiles/desktop')
  fs.mkdirSync(desktop)
  fs.writeFileSync(path.join(desktop, 'package.json'), JSON.stringify({ dependencies: { [native]: '1.7.14-rc.33' }, dsh: { profile: { bundles: [native] } } }))
  fs.writeFileSync(path.join(desktop, 'settings.json'), 'desktop fixture settings')
  const desktopState = path.join(home, 'harness-remote/instances/desktop-fixture')
  fs.mkdirSync(desktopState, { recursive: true })
  const desktopFacts = path.join(desktopState, 'human-workflow-fixture-facts.json')
  const factsBefore = JSON.stringify({ schema: 1, asOf: 1000, records: [] })
  const factsAfter = JSON.stringify({ schema: 1, asOf: 2000, records: [] })
  fs.writeFileSync(desktopFacts, factsBefore)
  const desktopBefore = snapshot(desktop), profileBefore = snapshot(profile), called = path.join(root, 'native-called')
  t.after(() => {
    try {
      assert.deepEqual(snapshot(desktop), desktopBefore)
      assert.equal(fs.readFileSync(desktopFacts, 'utf8'), peerRefresh && fs.existsSync(called) ? factsAfter : factsBefore,
        'Web installation/rollback must neither reject nor undo an independent Desktop refresh')
      for (const file of ['settings.json', 'credentials.yaml', 'session.json']) assert.equal(fs.readFileSync(path.join(home, file), 'utf8'), 'preserved ' + file)
      assert.equal(fs.existsSync(path.join(home, 'harness-remote/installation-offers')), false, 'NPX does not publish a Desktop update offer')
    } finally {
      assert.equal(path.dirname(root), fs.realpathSync(os.tmpdir())); assert(path.basename(root).startsWith('dsh-stopped-installer-')); fs.rmSync(root, { recursive: true })
    }
  })
  const expectedOwner = owner ?? native
  fs.writeFileSync(cli, `const fs=require('fs'),path=require('path'),assert=require('assert/strict'),zlib=require('zlib');
    assert.equal(process.argv[2],'plugin');assert.equal(process.argv[3],'--profile');assert.equal(process.argv[4],'web');assert.equal(process.argv[5],'add');
    assert.equal(process.env.DSH_HOME,${JSON.stringify(home)});assert.equal(process.cwd(),${JSON.stringify(home)});
    const p=${JSON.stringify(profile)},m=JSON.parse(fs.readFileSync(path.join(p,'package.json')));
    assert.deepEqual(m,${JSON.stringify(original)});assert(process.argv[6].startsWith('file:'));
    const source=path.join(p,process.argv[6].slice(5));assert(fs.existsSync(source));
    const tar=zlib.gunzipSync(fs.readFileSync(source));let packageManifest;
    for(let at=0;at+512<=tar.length;){const head=tar.subarray(at,at+512);const name=head.subarray(0,100).toString().replace(/\\0.*$/s,'');if(!name)break;
      const size=parseInt(head.subarray(124,136).toString().replace(/\\0.*$/s,'').trim(),8);at+=512;
      if(name==='package/package.json')packageManifest=JSON.parse(tar.subarray(at,at+size));at+=Math.ceil(size/512)*512;}
    assert.equal(packageManifest.name,${JSON.stringify(expectedOwner)});assert.equal(packageManifest.version,${JSON.stringify(version)});
    fs.writeFileSync(${JSON.stringify(called)},'native add');
    // Deterministic peer activity during native add, not an installer write:
    // the old full-home checksum rejected even this timestamp-only change.
    if(${JSON.stringify(peerRefresh)})fs.writeFileSync(${JSON.stringify(desktopFacts)},${JSON.stringify(factsAfter)});
    const installed=path.join(p,'node_modules',packageManifest.name);fs.mkdirSync(installed,{recursive:true});fs.writeFileSync(path.join(installed,'package.json'),JSON.stringify(packageManifest));
    m.dependencies[packageManifest.name]=process.argv[6];m.dsh.profile.bundles=[...new Set([...m.dsh.profile.bundles,packageManifest.name])];fs.writeFileSync(path.join(p,'package.json'),JSON.stringify(m));
    if(${JSON.stringify(failNative)}){fs.writeFileSync(path.join(p,'cordis.patch.yml'),'partial failed mutation');process.exit(9);}`)
  const bytes = archive([['package/package.json', JSON.stringify({ name: core, version })], ['package/lib/index.js', ''], ['package/lib/client.js', '']]), now = Date.now()
  fs.writeFileSync(path.join(assets, 'plugin.tgz'), bytes)
  const metadata = { version, catalog: {
    schemaVersion: 1, revision: 'offline-admission', issuedAt: now - 1000, expiresAt: now + 60000, blocked: [], retiredDsh: [],
    releases: [{ version, channel: 'preview', dsh: [], platforms: [], architectures: [], asset: {
      url: `https://github.com/martinbear1/dsh-wechat-remote/releases/download/v${version}/plugin.tgz`, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex'),
    } }],
  } }
  fs.writeFileSync(path.join(assets, 'release.json'), JSON.stringify(metadata))
  const outer = path.join(root, 'fixture-outer.tgz')
  fs.writeFileSync(outer, archive([
    ['package/package.json', JSON.stringify({ name: native, version, dsh: { bundle: { patch: './cordis.patch.yml' } } })],
    ['package/native/lib/index.js', ''], ['package/native/lib/client.js', ''], ['package/cordis.patch.yml', '[]'],
    ['package/assets/release.json', JSON.stringify(metadata)], ['package/assets/plugin.tgz', bytes],
  ]))
  const racedManifest = { dependencies: { 'other-plugin': '1.0.0', [core]: installedVersion }, dsh: { profile: { bundles: ['other-plugin', core] } } }
  const harness = path.join(root, 'harness.mjs'), harnessUrl = pathToFileURL(harness).href
  fs.writeFileSync(harness, `import fs from 'node:fs';import assert from 'node:assert/strict';
    import {auditNativeArchive} from ${JSON.stringify(new URL('../lib/update-download.js', import.meta.url).href)};
    export {validateDshCli,resolveHome} from ${JSON.stringify(new URL('../installer/bin/dsh-discovery.mjs', import.meta.url).href)};
    export {auditArchive,downloadRelease,DownloadUnavailableError} from ${JSON.stringify(new URL('../lib/update-download.js', import.meta.url).href)};
    export const calls=[]; const running=${JSON.stringify(running)};
    export async function mayHaveRunningDsh(){calls.push('running');return running.shift()??false}
    export async function chooseDsh(){calls.push('choose');return ${JSON.stringify(cli)}}
    export function resolveInstallRuntime(){calls.push('runtime');return {executable:process.execPath,cli:process.execPath,version:'fixture'}}
    export async function verifyInstallRuntime(){calls.push('verify-runtime')}
    export async function boundedFetch(){calls.push('catalog-offline');throw Error('offline fixture')}
    export async function packNativeArchive(_source,version){calls.push('pack');assert.equal(version,${JSON.stringify(version)});auditNativeArchive(fs.readFileSync(${JSON.stringify(outer)}),version);
      if(${JSON.stringify(packOwnerRace)})fs.writeFileSync(${JSON.stringify(manifest)},${JSON.stringify(JSON.stringify(racedManifest))});return ${JSON.stringify(outer)}}
  `)
  const copy = path.join(root, 'setup.mjs')
  const source = fs.readFileSync(setupUrl, 'utf8').replace(/from '(\.\.?\/[^']+)'/g, (_match, value) => {
    const fixtureDependency = /(?:install-runtime\.js|install-archive\.js|dsh-discovery\.mjs|update-download\.js)$/.test(value)
    return `from ${JSON.stringify(fixtureDependency ? harnessUrl : new URL(value, setupUrl).href)}`
  })
  fs.writeFileSync(copy, source)
  const { install } = await import(pathToFileURL(copy).href), { calls } = await import(harnessUrl)
  const phases = []
  return { home, profile, called, calls, phases, manifest, patch, original, profileBefore, racedManifest, desktopFacts, factsAfter,
    install: () => install({ home, cli, assetsRoot: assets, open: false, startAfterInstall: false, bundledOnly: true, onProgress: row => phases.push(row.phase) }) }
}

test('online CLI installation is refused before runtime checks, locks, HMR or profile mutation', async t => {
  const f = await fixture(t, { running: [true], owner: native })
  await assert.rejects(f.install(), /正在运行/)
  assert.deepEqual(f.calls, ['running'])
  assert.deepEqual(snapshot(f.profile), f.profileBefore)
  assert.equal(fs.existsSync(f.called), false)
  assert.equal(fs.existsSync(path.join(f.home, 'harness-remote-updates')), false)
})

for (const owner of [undefined, native, core]) test(`stopped install ${owner ?? 'fresh'} keeps one native package and preserves settings`, async t => {
  const f = await fixture(t, { owner })
  assert.deepEqual(await f.install(), { version, changed: true, starting: false })
  assert.equal(fs.readFileSync(f.called, 'utf8'), 'native add')
  assert.equal(fs.readFileSync(f.patch, 'utf8'), '# user patch\n[]\n')
  const manifest = JSON.parse(fs.readFileSync(f.manifest)), expectedOwner = owner ?? native
  assert.equal(manifest.dependencies['other-plugin'], '1.0.0')
  assert.deepEqual([native, core].filter(name => Object.hasOwn(manifest.dependencies, name)), [expectedOwner])
  assert.deepEqual(manifest.dsh.profile.bundles, ['other-plugin', expectedOwner])
  assert.equal(JSON.parse(fs.readFileSync(path.join(f.profile, 'node_modules', expectedOwner, 'package.json'))).version, version)
  assert.equal(f.calls.includes('pack'), expectedOwner === native)
  assert.equal(fs.existsSync(path.join(f.profile, '.harness-remote-update.lock')), false)
})

for (const owner of [undefined, native, core]) test(`Desktop facts changing during Web ${owner ?? 'fresh'} install do not cause checksum rejection`, async t => {
  const f = await fixture(t, { owner, peerRefresh: true })
  assert.deepEqual(await f.install(), { version, changed: true, starting: false })
  assert.deepEqual(f.phases, ['preparing', 'installing'], 'peer activity must not roll back a successful Web install')
  assert.equal(fs.readFileSync(f.desktopFacts, 'utf8'), f.factsAfter)
  const manifest = JSON.parse(fs.readFileSync(f.manifest))
  assert.deepEqual([native, core].filter(name => Object.hasOwn(manifest.dependencies, name)), [owner ?? native])
  assert.equal(fs.existsSync(path.join(f.profile, '.harness-remote-update.lock')), false)
})

for (const owner of [native, core]) test(`Web ${owner} native failure rolls back only Web, preserving concurrent Desktop changes`, async t => {
  const f = await fixture(t, { owner, peerRefresh: true, failNative: true })
  await assert.rejects(f.install(), /退出码 9/)
  assert.deepEqual(snapshot(f.profile), f.profileBefore)
  assert.equal(fs.readFileSync(f.desktopFacts, 'utf8'), f.factsAfter)
  assert.deepEqual(f.phases, ['preparing', 'installing', 'rolling-back'])
  assert.equal(fs.existsSync(path.join(f.profile, '.harness-remote-update.lock')), false)
})

for (const running of [[false, true], [false, false, true]]) test(`host starting during preparation ${running.length} wins without being stopped`, async t => {
  const f = await fixture(t, { running, owner: native })
  await assert.rejects(f.install(), /已开始运行/)
  assert.equal(fs.existsSync(f.called), false)
  assert.deepEqual(snapshot(f.profile), f.profileBefore)
  assert.equal(f.calls.includes('pack'), running.length === 3)
})

test('native owner changed during self-packing is not overwritten or combined', async t => {
  const f = await fixture(t, { owner: native, packOwnerRace: true })
  await assert.rejects(f.install(), /归属已变化/)
  assert.equal(fs.existsSync(f.called), false)
  assert.deepEqual(JSON.parse(fs.readFileSync(f.manifest)), f.racedManifest, 'concurrent owner change survives installer failure')
  assert.equal(fs.readFileSync(f.patch, 'utf8'), '# user patch\n[]\n')
  assert.equal(fs.existsSync(path.join(f.profile, '.harness-remote-update.lock')), false)
})

for (const owner of [native, core]) test(`newer installed ${owner} is not downgraded or packed`, async t => {
  const f = await fixture(t, { owner, installedVersion: '9.0.0' })
  assert.deepEqual(await f.install(), { version: '9.0.0', changed: false, starting: false })
  assert.equal(fs.existsSync(f.called), false)
  assert.equal(f.calls.includes('pack'), false)
  assert.deepEqual(snapshot(f.profile), f.profileBefore)
})

test('failed native outer add restores original profile including package version and user patch', async t => {
  const f = await fixture(t, { owner: native, failNative: true })
  await assert.rejects(f.install(), /退出码 9/)
  assert.equal(fs.readFileSync(f.called, 'utf8'), 'native add')
  assert.deepEqual(snapshot(f.profile), f.profileBefore)
  assert.deepEqual(f.phases, ['preparing', 'installing', 'rolling-back'])
})

test('mixed native/core registration is refused before discovery or mutation', async t => {
  const f = await fixture(t, { owner: native })
  const mixed = structuredClone(f.original)
  mixed.dependencies[core] = '1.7.13'; mixed.dsh.profile.bundles.push(core)
  fs.writeFileSync(f.manifest, JSON.stringify(mixed))
  const before = snapshot(f.profile)
  await assert.rejects(f.install(), /两种/)
  assert.deepEqual(f.calls, [])
  assert.deepEqual(snapshot(f.profile), before)
  assert.equal(fs.existsSync(f.called), false)
  assert.equal(fs.existsSync(path.join(f.home, 'harness-remote-updates')), false)
})
