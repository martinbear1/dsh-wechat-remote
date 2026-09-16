/** Isolated old-plugin runtime: native HMR handshake/removal and graceful disposal. */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { installProfile } from '../lib/install-profile.js'
import { resolveInstallRuntime } from '../lib/install-runtime.js'
import { attachControl, waitForJson } from '../installer/bin/native-control.mjs'
const [cli, archive, nextArchive] = process.argv.slice(2)
const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-control-proof-')))
const userDirectory = path.join(root, 'user')
const home = path.join(userDirectory, '.dsh'), profile = path.join(home, 'profiles', 'web')
const repo = fs.realpathSync('.'), runtime = resolveInstallRuntime(repo)
const prep = path.join(root, 'prepare'); fs.mkdirSync(prep)
fs.copyFileSync(archive, path.join(prep, 'release.tgz'))
await installProfile({ profile, directory: prep, cli, targetVersion: '1.5.5', runtime })
const log = fs.openSync(path.join(root, 'host.log'), 'a')
const child = spawn(process.execPath, [cli, 'web', '--port', '7380', '--no-open'], { cwd: root,
  env: { ...process.env, HOME: userDirectory, USERPROFILE: userDirectory, DSH_HOME: home, DSH_PORT: '7380', WECHAT_GATE_PORT: '7392', WECHAT_GATE_LOCAL_PORT: '7393' },
  windowsHide: true, stdio: ['ignore', log, log] })
fs.closeSync(log)
console.log('Isolated proof:', root)
let remove
try {
  for (let i = 0; i < 150; i++) {
    try { await fetch('http://127.0.0.1:7380', { signal: AbortSignal.timeout(300) }); break } catch {}
    await new Promise(resolve => setTimeout(resolve, 200))
  }
  assert(child.exitCode === null, 'isolated DSH must be running')
  await new Promise(resolve => setTimeout(resolve, 2000))
  const id = randomBytes(16).toString('hex'), token = randomBytes(24).toString('hex')
  const directory = path.join(home, 'harness-remote-updates', id); fs.mkdirSync(directory, { recursive: true })
  const before = fs.readFileSync(path.join(profile, 'cordis.patch.yml'), 'utf8')
  remove = attachControl(profile, path.join(repo, 'installer/lib/install-control.js'), { directory, token, pnpm: runtime.cli })
  const ready = await waitForJson(path.join(directory, 'control-ready.json'), v => v.pid === child.pid)
  const post = async (method, data = {}) => {
    const res = await fetch(ready.origin + '/' + method, { method: 'POST', headers: { authorization: 'Bearer ' + token }, body: JSON.stringify(data) })
    const body = await res.json(); assert(res.ok, JSON.stringify(body)); return body
  }
  const host = await post('describe')
  assert.equal(host.pluginVersion, '1.5.5'); assert.equal(host.pid, child.pid)
  const list = await post('read', { method: 'session.list', payload: {} }); assert(Array.isArray(list.items))
  remove(); remove = undefined
  await new Promise(resolve => setTimeout(resolve, 1500))
  assert.equal(fs.readFileSync(path.join(profile, 'cordis.patch.yml'), 'utf8'), before)
  assert.equal((await post('describe')).pid, child.pid)
  if (nextArchive) {
    const job = { ...host, id, directory, parentPid: host.pid, pnpm: runtime.cli, targetVersion: '1.7.0', previousVersion: '1.5.5', statusToken: token, controlOrigin: ready.origin }
    fs.writeFileSync(path.join(directory, 'job.json'), JSON.stringify(job))
    fs.writeFileSync(path.join(directory, 'package.json'), '{"type":"module"}')
    fs.copyFileSync(path.join(repo, 'installer/lib/update-worker.js'), path.join(directory, 'update-worker.js'))
    fs.copyFileSync(nextArchive, path.join(directory, 'release.tgz'))
    await post('launch')
    await waitForJson(path.join(directory, 'worker-ready.json'), v => v.id === id)
    const { createHash } = await import('node:crypto')
    const scope = createHash('sha256').update('web').digest('hex').slice(0,24)
    fs.writeFileSync(path.join(home, 'harness-remote-updates', `profile-${scope}.json`), JSON.stringify({ jobId: id }))
    fs.writeFileSync(path.join(directory, 'authorized.json'), JSON.stringify({ id }))
    const result = await waitForJson(path.join(directory, 'result.json'), v => v.terminal, 300000)
    console.log('Transaction:', JSON.stringify(result))
    assert.equal(result.ok, true)
    console.log('PASS old plugin to 1.7.0 native transaction and restarted verified host')
  } else await post('close')
  console.log('PASS native HMR coordinator, exact original patch restored, native session API, no plugin/profile upgrade')
} finally {
  remove?.()
  if (child.exitCode === null && child.signalCode === null) child.kill()
}
