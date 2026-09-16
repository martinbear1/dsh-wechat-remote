import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { backupProfile, installProfile, runNativePlugin, safeProfileName } from '../lib/install-profile.js'

for (const name of ['web', 'test-2', 'custom_profile']) assert(safeProfileName(name))
for (const name of ['', '..', 'a/b', 'a\\b', 'web & run', 'a'.repeat(81)]) assert(!safeProfileName(name))
const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-profile-safety-test-')))
try {
  const profile = path.join(root, 'profile'), packages = path.join(profile, 'packages')
  fs.mkdirSync(packages, { recursive: true })
  fs.writeFileSync(path.join(packages, 'fixture.txt'), 'fixture')
  const outside = path.join(root, 'outside'); fs.mkdirSync(outside)
  fs.writeFileSync(path.join(outside, 'keep.txt'), 'external data')
  const link = path.join(profile, 'dependency')
  fs.symlinkSync(outside, link, 'junction')
  const internal = path.join(profile, 'internal')
  fs.symlinkSync(packages, internal, 'junction')
  if (process.platform !== 'win32') {
    fs.symlinkSync('packages', path.join(profile, 'relative'))
    fs.symlinkSync('../missing', path.join(profile, 'dangling'))
  }
  const saved = path.join(root, 'saved')
  backupProfile(profile, saved)
  assert.throws(() => backupProfile(profile, saved), /已存在/)
  assert.equal(fs.readlinkSync(path.join(saved, 'dependency')), fs.readlinkSync(link))
  assert.equal(fs.readlinkSync(path.join(saved, 'internal')), fs.readlinkSync(internal))
  fs.writeFileSync(path.join(packages, 'fixture.txt'), 'changed')
  fs.renameSync(profile, path.join(root, 'failed'))
  fs.renameSync(saved, profile)
  assert.equal(fs.readFileSync(path.join(profile, 'internal', 'fixture.txt'), 'utf8'), 'fixture')
  assert.equal(fs.readFileSync(path.join(profile, 'dependency', 'keep.txt'), 'utf8'), 'external data')
  console.log('PASS rollback copy preserves link text and restores original path semantics')

  const home = path.join(root, 'actual home'), active = path.join(home, 'profiles', 'custom')
  const job = path.join(root, 'job'); fs.mkdirSync(job)
  fs.mkdirSync(active, { recursive: true })
  const original = { dependencies: { a: 'link:../a', b: 'github:example/b#fixed', c: 'file:../c.tgz' },
    packageManager: 'pnpm@10.0.0', dsh: { profile: { bundles: ['a', 'b'] } } }
  fs.writeFileSync(path.join(active, 'package.json'), JSON.stringify(original))
  fs.writeFileSync(path.join(job, 'release.tgz'), 'test archive')
  const archiveName = 'harness-remote-1.7.7-' + createHash('sha256').update('test archive').digest('hex') + '.tgz'
  const cli = path.join(root, 'native-fixture.cjs')
  fs.writeFileSync(cli, `const fs=require('fs'),path=require('path'),assert=require('assert/strict');
    const dir=path.join(process.env.DSH_HOME,'profiles',process.argv[4]);
    const file=path.join(dir,'package.json'),before=JSON.parse(fs.readFileSync(file));
    assert.deepEqual(before,${JSON.stringify(original)});
    assert.equal(process.cwd(),${JSON.stringify(home)});
    assert.equal(process.argv[5],'add');assert.equal(process.argv[6],${JSON.stringify('file:' + archiveName)});
    assert(fs.existsSync(path.join(dir,${JSON.stringify(archiveName)})));
    const pkg=path.join(dir,'node_modules/@harness-remote/dsh-wechat-remote');fs.mkdirSync(pkg,{recursive:true});
    fs.writeFileSync(path.join(pkg,'package.json'),JSON.stringify({version:'1.7.7'}));
    before.dsh.profile.bundles.push('@harness-remote/dsh-wechat-remote');fs.writeFileSync(file,JSON.stringify(before));`)
  const runtime = { executable: process.execPath, cli, version: 'fixture' }
  await installProfile({ profile: active, directory: job, cli, runtime, targetVersion: '1.7.7' })
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(active, 'package.json'))).dependencies, original.dependencies)
  assert(!fs.existsSync(path.join(job, 'staging-home')))
  console.log('PASS native add uses original home/profile and receives untouched mixed-source manifest')

  const refreshedJob = path.join(root, 'refreshed-job'); fs.mkdirSync(refreshedJob)
  fs.writeFileSync(path.join(refreshedJob, 'release.tgz'), 'changed candidate bytes')
  const refreshedName = 'harness-remote-1.7.7-' + createHash('sha256').update('changed candidate bytes').digest('hex') + '.tgz'
  fs.writeFileSync(cli, `require('assert/strict').equal(process.argv[6],${JSON.stringify('file:' + refreshedName)})`)
  await installProfile({ profile: active, directory: refreshedJob, cli, runtime, targetVersion: '1.7.7' })
  assert.notEqual(refreshedName, archiveName)
  assert.equal(fs.readFileSync(path.join(active, archiveName), 'utf8'), 'test archive')
  assert.equal(fs.readFileSync(path.join(active, refreshedName), 'utf8'), 'changed candidate bytes')
  console.log('PASS changed same-version archives use distinct native sources without overwriting prior bytes')

  const repairJob = path.join(root, 'repair-job'); fs.mkdirSync(repairJob)
  fs.writeFileSync(path.join(repairJob, 'release.tgz'), 'test archive')
  const repaired = path.join(root, 'repaired'), calls = path.join(root, 'calls')
  fs.writeFileSync(cli, `const fs=require('fs'),path=require('path');
    const operation=process.argv[5];fs.appendFileSync(${JSON.stringify(calls)},operation+'\\n');
    if(operation==='install'){fs.writeFileSync(${JSON.stringify(repaired)},'yes');process.exit(0)}
    if(!fs.existsSync(${JSON.stringify(repaired)})){console.error('[ERR_PNPM_UNEXPECTED_VIRTUAL_STORE] Unexpected virtual store location');process.exit(1)}
    if(process.argv.includes('--force'))throw Error('No force install');`)
  await installProfile({ profile: active, directory: repairJob, cli, runtime, targetVersion: '1.7.7' })
  assert.equal(fs.readFileSync(calls, 'utf8'), 'add\ninstall\nadd\n')
  const ordinaryJob = path.join(root, 'ordinary-job'); fs.mkdirSync(ordinaryJob)
  fs.writeFileSync(path.join(ordinaryJob, 'release.tgz'), 'test archive')
  fs.writeFileSync(cli, `require('fs').appendFileSync(${JSON.stringify(calls)},'failure\\n');console.error('ERR_PNPM_FETCH_404');process.exit(1)`)
  await assert.rejects(installProfile({ profile: active, directory: ordinaryJob, cli, runtime, targetVersion: '1.7.7' }), /退出码 1/)
  assert.equal(fs.readFileSync(calls, 'utf8'), 'add\ninstall\nadd\nfailure\n')
  console.log('PASS stale layout uses official install once; unrelated failures do not loop or use force')

  const failCli = path.join(root, 'failure.cjs'); fs.writeFileSync(failCli, 'process.exit(23)')
  await assert.rejects(runNativePlugin(failCli, 'custom', home, job, runtime, path.join(job, 'failure.log'), 'harness-remote-1.7.7.tgz'), error => {
    assert.match(error.message, /退出码 23/); assert(error.message.includes(path.join(job, 'failure.log')))
    assert.equal(error.mayStillBeRunning, false); return true
  })
  const hanging = path.join(root, 'hanging.cjs'), marker = path.join(root, 'descendant.txt')
  fs.writeFileSync(hanging, `const {spawn}=require('child_process');
    spawn(process.execPath,['-e',${JSON.stringify(`setInterval(()=>require('fs').appendFileSync(${JSON.stringify(marker)},'.'),30)`)}],{stdio:'ignore'});
    setInterval(()=>{},1000);`)
  await assert.rejects(runNativePlugin(hanging, 'custom', home, job, runtime, path.join(job, 'timeout.log'), 'harness-remote-1.7.7.tgz', 800), error => {
    assert.match(error.message, /超时/); assert.equal(error.mayStillBeRunning, false); return true
  })
  assert(fs.existsSync(marker), 'descendant must actually have started')
  const bytes = fs.statSync(marker).size
  await new Promise(resolve => setTimeout(resolve, 200))
  assert.equal(fs.statSync(marker).size, bytes, 'no orphan package manager may write during rollback')
  console.log('PASS native errors include exit code/log path; timeout stops the owned descendant before returning')
} finally {
  assert(path.dirname(root) === fs.realpathSync(os.tmpdir()) && path.basename(root).startsWith('dsh-profile-safety-test-'))
  fs.rmSync(root, { recursive: true })
}
