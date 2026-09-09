import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { execFileSync } from 'node:child_process'
const home = path.join(os.homedir(), '.dsh'), updates = path.join(home, 'harness-remote-updates')
const results = []
if (fs.existsSync(updates)) for (const name of fs.readdirSync(updates).filter(x => /^[a-f0-9]{32}$/.test(x))) {
  const directory = path.join(updates, name)
  try {
    const job = JSON.parse(fs.readFileSync(path.join(directory, 'job.json'), 'utf8'))
    let result, failure
    try { result = JSON.parse(fs.readFileSync(path.join(directory, 'result.json'), 'utf8')) } catch {}
    try { failure = JSON.parse(fs.readFileSync(path.join(directory, 'failure.json'), 'utf8')) } catch {}
    results.push({ id: name, updated: fs.statSync(directory).mtimeMs, previous: job.previousVersion, target: job.targetVersion, pid: job.parentPid, manager: job.manager, result, failure })
  } catch {}
}
let version
try { version = JSON.parse(fs.readFileSync(path.join(home, 'profiles/web/node_modules/@harness-remote/dsh-wechat-remote/package.json'), 'utf8')).version } catch {}
console.log(JSON.stringify({ platform: process.platform, plugin: version, jobs: results.sort((a,b) => b.updated-a.updated).slice(0,2) }, null, 2))
if (process.platform === 'darwin') {
  try { const output = execFileSync('/bin/launchctl', ['print', `gui/${process.getuid()}/com.harnessremote.dsh-web`], { encoding: 'utf8' }); console.log(output.split('\n').filter(s => /^\s*(state|pid|last exit code) =/.test(s)).join('\n')) } catch { console.log('Original launchd service not loaded') }
}
if (process.platform === 'linux') {
  try { console.log(execFileSync('systemctl', ['--user','show','dsh-web.service','--property=ActiveState,SubState,MainPID'], { encoding: 'utf8' })) } catch {}
}
