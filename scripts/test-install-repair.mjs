/** Offline real-pnpm primitive regression. No DSH server, user profile or global
 * store is touched. A small CLI fixture forwards the native add arguments. */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { gzipSync } from 'node:zlib'
import { fileURLToPath } from 'node:url'
import { installProfile, PLUGIN_PACKAGE } from '../lib/install-profile.js'
import { resolveInstallRuntime } from '../lib/install-runtime.js'

const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-repair-pnpm-test-')))
const runtime = resolveInstallRuntime(fileURLToPath(new URL('../', import.meta.url)))
const version = '1.7.7'
function archiveFor(name, value) {
  const chunks = []
  for (const [filename, content] of [['package/package.json', JSON.stringify({ name, version, main: 'index.js' })],
    ['package/index.js', `module.exports=${JSON.stringify(value)};\n`]]) {
    const data = Buffer.from(content), header = Buffer.alloc(512)
    header.write(filename); header.write('0000644\0', 100)
    header.write(data.length.toString(8).padStart(11, '0') + '\0', 124); header.write('0', 156)
    header.fill(32, 148, 156)
    header.write([...header].reduce((a, b) => a + b, 0).toString(8).padStart(6, '0') + '\0 ', 148)
    chunks.push(header, data, Buffer.alloc((512 - data.length % 512) % 512))
  }
  return gzipSync(Buffer.concat([...chunks, Buffer.alloc(1024)]))
}
try {
  const bytes = archiveFor(PLUGIN_PACKAGE, 'original plugin')
  const digest = createHash('sha256').update(bytes).digest('hex')
  for (const linker of ['isolated', 'hoisted']) {
    const home = path.join(root, linker + ' 中文 空格 !%&()'), profile = path.join(home, 'profiles', 'web')
    const store = path.join(home, 'private store'), cli = path.join(home, 'native fixture.cjs')
    fs.mkdirSync(profile, { recursive: true })
    fs.writeFileSync(path.join(home, 'profiles', 'other.tgz'), archiveFor('fixture-other-plugin', 'keep other plugin'))
    const source = 'file:../other.tgz'
    fs.writeFileSync(path.join(profile, 'package.json'), JSON.stringify({ private: true,
      dependencies: { 'fixture-other-plugin': source }, dsh: { profile: { bundles: ['fixture-other-plugin'] } } }))
    fs.writeFileSync(cli, `const fs=require('fs'),path=require('path'),assert=require('assert/strict'),{spawnSync}=require('child_process');
      assert.equal(process.argv[2],'plugin');assert.equal(process.argv[3],'--profile');
      const profile=path.join(process.env.DSH_HOME,'profiles',process.argv[4]);
      const args=process.argv.slice(5);assert(!args.includes('--force'));
      const result=spawnSync(process.env.HARNESS_INSTALL_NODE,[process.env.HARNESS_INSTALL_PNPM,...args,
        '--offline','--store-dir',${JSON.stringify(store)},'--package-import-method=copy','--node-linker=${linker}'],
        {cwd:profile,env:process.env,windowsHide:true,stdio:'inherit'});
      if(result.status!==0)process.exit(result.status??1);
      const file=path.join(profile,'package.json'),manifest=JSON.parse(fs.readFileSync(file));
      if(!manifest.dsh.profile.bundles.includes(${JSON.stringify(PLUGIN_PACKAGE)}))manifest.dsh.profile.bundles.push(${JSON.stringify(PLUGIN_PACKAGE)});
      fs.writeFileSync(file,JSON.stringify(manifest));`)
    const install = async index => {
      const directory = path.join(home, '事务 空格 !%&() ' + index); fs.mkdirSync(directory)
      fs.writeFileSync(path.join(directory, 'release.tgz'), bytes)
      await installProfile({ profile, directory, cli, runtime, targetVersion: version })
      return JSON.parse(fs.readFileSync(path.join(profile, 'package.json'), 'utf8'))
    }
    const first = await install(0)
    assert.equal(first.dependencies[PLUGIN_PACKAGE], `file:harness-remote-${version}-${digest}.tgz`)
    const entry = path.join(profile, 'node_modules', PLUGIN_PACKAGE, 'index.js')
    const manifest = path.join(profile, 'node_modules', PLUGIN_PACKAGE, 'package.json')
    const other = path.join(profile, 'node_modules', 'fixture-other-plugin', 'index.js')
    const expected = fs.readFileSync(entry, 'utf8'), untouched = fs.readFileSync(other, 'utf8')
    const sources = [first.dependencies[PLUGIN_PACKAGE]]
    for (let i = 1; i <= 3; i++) {
      fs.unlinkSync(entry)
      if (i === 3) fs.unlinkSync(manifest)
      const repaired = await install(i)
      const selected = repaired.dependencies[PLUGIN_PACKAGE]; sources.push(selected)
      assert.match(selected, new RegExp(`^file:harness-remote-${version}-${digest}-[a-f0-9]{16}\\.tgz$`))
      assert.equal(fs.readFileSync(entry, 'utf8'), expected, 'same bytes must restore the missing installed entry')
      assert.equal(JSON.parse(fs.readFileSync(manifest, 'utf8')).version, version, 'native add must restore a missing installed manifest')
      assert.equal(repaired.dependencies['fixture-other-plugin'], source)
      assert.equal(fs.readFileSync(other, 'utf8'), untouched)
      assert.deepEqual(repaired.dsh.profile.bundles, ['fixture-other-plugin', PLUGIN_PACKAGE])
      assert.deepEqual(fs.readFileSync(path.join(profile, selected.slice(5))), bytes)
    }
    assert.equal(new Set(sources).size, 4)
    console.log(`PASS ${linker}: real pnpm repairs repeated file loss and a missing manifest; unrelated source/bytes and special paths preserved`)
  }
} finally {
  assert(path.dirname(root) === fs.realpathSync(os.tmpdir()) && path.basename(root).startsWith('dsh-repair-pnpm-test-'))
  fs.rmSync(root, { recursive: true })
}
