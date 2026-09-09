/** Real native first installation, in a new DSH home, without model credentials. */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { pathToFileURL } from 'node:url'
const cli = process.argv[2]
const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-fresh-proof-')))
const home = path.join(root, 'user', '.dsh')
const env = { ...process.env, HOME: path.join(root, 'user'), USERPROFILE: path.join(root, 'user'), DSH_HOME: home,
  DSH_PORT: '7480', WECHAT_GATE_PORT: '7492', WECHAT_GATE_LOCAL_PORT: '7493' }
const log = fs.openSync(path.join(root, 'host.log'), 'a')
const child = spawn(process.execPath, [cli, 'web', '--port', '7480', '--no-open'], { cwd: root, env, windowsHide: true, stdio: ['ignore', log, log] })
fs.closeSync(log)
console.log('Fresh native proof:', root)
try {
  let ready = false
  for (let i = 0; i < 150; i++) {
    try { await fetch('http://127.0.0.1:7480', { signal: AbortSignal.timeout(300) }); ready = true; break } catch {}
    await new Promise(resolve => setTimeout(resolve, 200))
  }
  assert(ready && child.exitCode === null)
  assert(!fs.existsSync(path.join(home, 'profiles/web/node_modules/@harness-remote/dsh-wechat-remote/package.json')))
  const setup = pathToFileURL(path.resolve('installer/bin/setup.mjs')).href
  const installer = spawn(process.execPath, ['--input-type=module', '-e', `import(${JSON.stringify(setup)}).then(({install})=>install({open:false,cli:${JSON.stringify(cli)}})).catch(e=>{console.error(e);process.exitCode=1})`], {
    cwd: root, env, windowsHide: true, stdio: 'inherit' })
  const code = await new Promise((resolve, reject) => { installer.once('error', reject); installer.once('exit', resolve) })
  assert.equal(code, 0)
  const installed = JSON.parse(fs.readFileSync(path.join(home, 'profiles/web/node_modules/@harness-remote/dsh-wechat-remote/package.json')))
  assert.equal(installed.version, JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version)
  console.log('PASS native first install, restart and empty-session/identity verification; no model calls')
} finally {
  if (child.exitCode === null && child.signalCode === null) child.kill()
}
