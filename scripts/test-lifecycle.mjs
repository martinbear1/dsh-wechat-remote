import assert from 'node:assert/strict'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const home = mkdtempSync(path.join(tmpdir(), 'harness-remote-lifecycle-'))
const dshHome = path.join(home, '.dsh')
mkdirSync(dshHome, { recursive: true })
writeFileSync(
  path.join(dshHome, 'harness-remote-public.json'),
  JSON.stringify({ enabled: false }),
  'utf8',
)

const entryUrl = pathToFileURL(path.join(root, 'lib', 'index.js')).href
const childSource = `
  import assert from 'node:assert/strict'
  import net from 'node:net'
  import { existsSync, readFileSync } from 'node:fs'
  import path from 'node:path'
  import { Context } from '@deepseek-ai/cordis'

  const entry = await import(${JSON.stringify(entryUrl)})
  assert.deepEqual(entry.inject, ['webServer'])
  const stateFile = path.join(process.env.USERPROFILE || process.env.HOME, '.dsh', 'gate-wechat-state.json')
  assert.equal(existsSync(stateFile), false, 'importing the plugin must not create credentials')

  const freePort = () => new Promise((resolve, reject) => {
    const server = net.createServer()
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      server.close(error => error ? reject(error) : resolve(address.port))
    })
  })
  const publicPort = await freePort()
  const localPort = await freePort()
  process.env.WECHAT_GATE_PORT = String(publicPort)
  process.env.WECHAT_GATE_LOCAL_PORT = String(localPort)
  process.env.DSH_PORT = '1'

  const ctx = new Context()
  // Exercise apply/dispose directly with the explicit DSH_PORT fallback. The
  // shipped entry's webServer dependency is asserted above and covered by the
  // real DSH compatibility smoke test.
  const fiber = await ctx.plugin({ name: entry.name, apply: entry.apply }, {})
  const deadline = Date.now() + 3000
  let response
  while (Date.now() < deadline) {
    try {
      response = await fetch('http://127.0.0.1:' + localPort + '/gate/status')
      if (response.ok) break
    } catch {}
    await new Promise(resolve => setTimeout(resolve, 20))
  }
  assert.equal(response?.status, 200, 'applied plugin must expose its local diagnostic door')
  const status = await response.json()
  assert.deepEqual(
    Object.keys(status.publicRelay).sort(),
    ['enabled', 'remoteAccess', 'state'],
    'user-facing status must not expose relay origin or raw errors',
  )
  assert.equal(status.publicRelay.remoteAccess, null)
  assert.deepEqual(
    Object.keys(status.agent).sort(),
    ['agentName', 'hostName'],
    'pairing status must expose only the Agent identity needed by the UI',
  )
  assert.equal(existsSync(stateFile), true, 'credentials are created only when the plugin is applied')

  // With the public identity explicitly disabled, pairing fails closed rather
  // than falling back to an unauthenticated LAN code.
  const pairingPage = await fetch('http://127.0.0.1:' + localPort + '/pair')
  assert.equal(pairingPage.status, 503)
  assert.equal(pairingPage.headers.get('cache-control'), 'no-store')
  const pairingHtml = await pairingPage.text()
  assert.ok(pairingHtml.includes('暂时无法生成配对二维码'))
  const pairingCode = await fetch('http://127.0.0.1:' + localPort + '/pair/code')
  assert.equal(pairingCode.status, 503)
  assert.equal(pairingCode.headers.get('cache-control'), 'no-store')

  const state = JSON.parse(readFileSync(stateFile, 'utf8'))
  for (const route of ['/pair/claim-wechat', '/pair/verify-wechat', '/api/session.list']) {
    const retired = await fetch('http://127.0.0.1:' + publicPort + route, {
      method: route.startsWith('/pair/') ? 'POST' : 'GET',
      headers: { authorization: 'Bearer ' + state.token, 'content-type': 'application/json' },
      body: route.startsWith('/pair/') ? '{}' : undefined,
    })
    assert.equal(retired.status, 404, route + ' must stay closed on the LAN door')
  }

  await fiber.dispose()
  let closed = false
  for (let attempt = 0; attempt < 30 && !closed; attempt += 1) {
    try {
      await fetch('http://127.0.0.1:' + localPort + '/gate/status')
      await new Promise(resolve => setTimeout(resolve, 20))
    } catch {
      closed = true
    }
  }
  assert.equal(closed, true, 'disposing the Cordis fiber must close listening ports')
  console.log('plugin lifecycle child passed')
`

try {
  const result = spawnSync(
    process.execPath,
    ['--input-type=module', '--eval', childSource],
    {
      cwd: root,
      env: {
        ...process.env,
        HOME: home,
        USERPROFILE: home,
        HOMEDRIVE: path.parse(home).root.replace(/[\\/]$/, ''),
        HOMEPATH: home.slice(path.parse(home).root.length - 1),
      },
      encoding: 'utf8',
      timeout: 15_000,
    },
  )
  assert.equal(
    result.status,
    0,
    `lifecycle child failed\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`,
  )
  console.log('plugin import/apply/dispose lifecycle tests passed')
} finally {
  rmSync(home, { recursive: true, force: true })
}
