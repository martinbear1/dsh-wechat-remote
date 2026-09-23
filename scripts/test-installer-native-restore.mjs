import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import http from 'node:http'
import { verifyNativeRestore } from '../installer/bin/native-recovery.mjs'

for (const previousVersion of ['0.0.0', '1.7.9']) {
  test(`native rollback verifies the exact baseline ${previousVersion}, not a fictional healthy plugin`, async () => {
    const home = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-native-restore-')))
    const profile = path.join(home, 'profiles/web'), directory = path.join(home, 'initial')
    fs.mkdirSync(profile, { recursive: true }); fs.mkdirSync(directory)
    fs.writeFileSync(path.join(directory, 'install-control.js'), '// synthetic fixture')
    const original = '[]\n'; fs.writeFileSync(path.join(profile, 'cordis.patch.yml'), original)
    const job = { home, profile, directory, previousVersion, cli: 'verified-cli', dshVersion: '0.1.7-rc.1' }
    let reportedVersion = previousVersion, ready, closed = 0
    const server = http.createServer(async (req, res) => {
      for await (const _ of req) {}
      res.setHeader('content-type', 'application/json')
      const value = req.url === '/describe' ? { ...job, pid: process.pid, pluginVersion: reportedVersion }
        : req.url === '/read' ? { items: [{ sessionId: 'original-session', running: false }] } : {}
      if (req.url === '/close') closed++
      res.end(JSON.stringify(value))
    })
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
    const start = () => {
      const updates = path.join(home, 'harness-remote-updates')
      ready = fs.readdirSync(updates).map(n => path.join(updates, n)).find(d => !fs.existsSync(path.join(d, 'control-ready.json')))
      fs.writeFileSync(path.join(ready, 'control-ready.json'), JSON.stringify({ pid: process.pid, origin: `http://127.0.0.1:${server.address().port}` }))
      return { pid: process.pid }
    }
    try {
      fs.mkdirSync(path.join(home, 'harness-remote-updates'))
      await verifyNativeRestore(job, start, ['original-session'], [])
      assert.equal(fs.readFileSync(path.join(profile, 'cordis.patch.yml'), 'utf8'), original)
      reportedVersion = 'different-version'
      await assert.rejects(verifyNativeRestore(job, start, ['original-session'], []), /身份不匹配/)
      reportedVersion = previousVersion
      await assert.rejects(verifyNativeRestore(job, start, ['missing-session'], []), /列表不一致/)
      assert.equal(closed, 3)
      assert.equal(fs.readFileSync(path.join(profile, 'cordis.patch.yml'), 'utf8'), original)
    } finally {
      server.closeAllConnections(); await new Promise(resolve => server.close(resolve))
      assert.equal(path.dirname(home), fs.realpathSync(os.tmpdir()))
      assert(path.basename(home).startsWith('dsh-native-restore-'))
      fs.rmSync(home, { recursive: true })
    }
  })
}
