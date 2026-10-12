/** Read-only protocol audit of the actual published 1.7.10/1.7.13 workers.
 * Usage: node scripts/test-legacy-upgrade-contract.mjs EXTRACTED_RELEASE_ROOT
 * ROOT/{version}/core/package must contain the verified npm release contents.
 * This is NOT a native install/upgrade acceptance test. It imports the inert
 * worker and exercises only healthy() against a new loopback fixture. It never
 * calls executeUpdate(), starts DSH, edits a profile, or touches real user data.
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import http from 'node:http'
import { createHash } from 'node:crypto'
import { pathToFileURL } from 'node:url'

const releaseRoot = process.argv[2]
assert(releaseRoot, 'supply the root containing the extracted, verified npm releases')
const originals = {
  '1.7.10': '5eb3b67760f15f3d468b5c85d84c595e9ba7b9c94bfb70eec8c0f5476e64a2dc',
  '1.7.13': '1438dcfff4b1684d68d1b3088e0b402714cef3d0676dd03bafbcd76932c3e813',
}
const temporary = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'legacy-upgrade-contract-')))
const stateFile = path.join(temporary, 'fixture-state.json')
fs.writeFileSync(stateFile, JSON.stringify({ token: 'fixture-pairing-token' }), { mode: 0o600 })
const report = []
try {
  for (const [version, expected] of Object.entries(originals)) {
    const directory = path.resolve(releaseRoot, version, 'core/package/lib')
    const file = path.join(directory, 'update-worker.js')
    const bytes = fs.readFileSync(file), workerSource = bytes.toString('utf8')
    assert.equal(createHash('sha256').update(bytes).digest('hex'), expected,
      `refusing modified ${version} worker: test must exercise the published file`)
    const serviceSource = fs.readFileSync(path.join(directory, 'update-service.js'), 'utf8')
    const controlSource = fs.readFileSync(path.join(directory, 'install-control.js'), 'utf8')
    // These are frozen-release facts, not compatibility features to reintroduce.
    assert.match(serviceSource, /fs\.copyFileSync\(path\.join\(ownRoot, 'lib', name\)/)
    assert.match(controlSource, /await ctx\.fiber\.dispose\(\)/)
    assert.match(workerSource, /for \(const port of \[job\.webPort, job\.gatePort, job\.localPort\]\)/)
    assert.match(workerSource, /if \(res\.status !== 503\)/)
    assert.match(workerSource, /await healthy\(job, job\.targetVersion\);\s*await verifyFence\(job\);\s*assertPreserved\(before, durableSnapshot\(job\)\)/)
    assert.match(workerSource, /verification-complete\.json/)
    if (version === '1.7.10') assert.match(workerSource, /JSON\.stringify\(after\) !== JSON\.stringify\(sessionIds\)/)
    else assert.match(workerSource, /await verifySessionService\(/)

    const policy = await import(pathToFileURL(path.join(directory, 'update-policy.js')).href)
    const now = Date.now(), target = '1.7.14'
    const release = { version: target, channel: 'stable', dsh: ['0.2.0-rc.2'],
      platforms: ['linux'], architectures: ['x64'], asset: {
        url: `https://github.com/martinbear1/dsh-wechat-remote/releases/download/v${target}/fixture.tgz`,
        sha256: 'a'.repeat(64), bytes: 1,
      } }
    const catalog = { schemaVersion: 1, revision: 'legacy-contract', issuedAt: now - 1000,
      expiresAt: now + 60000, releases: [release], blocked: [], retiredDsh: [], manualUpgradePlugins: [version] }
    const advice = policy.assessUpdate(catalog, { agentKind: 'deepseek-harness', agentVersion: '0.2.0-rc.2',
      pluginVersion: version, platform: 'linux', arch: 'x64' }, now)
    assert(advice.manualUpdate)
    assert.equal(advice.targetVersion, target, 'manual-upgrade metadata does not remove the target')
    const actionSource = serviceSource.slice(serviceSource.indexOf('export function updateAction('), serviceSource.indexOf('export function acceptsUpdateRequest('))
    assert(!actionSource.includes('manualUpdate'), 'frozen action does not consult manual-upgrade text')
    const withoutAsset = { ...release }; delete withoutAsset.asset
    policy.validateCatalog({ ...catalog, releases: [withoutAsset] })
    assert.throws(() => policy.validateCatalog({ ...catalog, releases: [{ ...withoutAsset,
      npmInstaller: { version: target, url: `https://registry.npmjs.org/dsh-wechat-remote/-/dsh-wechat-remote-${target}.tgz`,
        bytes: 1, sha256: 'b'.repeat(64) },
    }] }), /Invalid release entry/, 'legacy npmInstaller metadata cannot remain without asset')

    const { healthy } = await import(pathToFileURL(file).href)
    const requests = []
    let matchVersion = true
    const server = http.createServer(async (req, res) => {
      let raw = ''
      for await (const chunk of req) raw += chunk.toString()
      const body = JSON.parse(raw)
      requests.push({ path: req.url, headers: req.headers, body })
      const value = req.url === '/api/wechatHost/describe'
        ? { ok: true, value: { agentVersion: 'fixture-dsh', pluginVersion: matchVersion ? 'fixture-next' : 'wrong-version' } }
        : { items: [{ sessionId: 'fixture-session', running: false }] }
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ result: { ok: true, value } }))
    })
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
    try {
      const job = { stateFile, gatePort: server.address().port, statusToken: 'fixture-job-token', dshVersion: 'fixture-dsh' }
      await healthy(job, 'fixture-next', 1000)
      assert.deepEqual(requests.map(request => request.path), ['/api/wechatHost/describe', '/api/session.list'])
      for (const request of requests) {
        assert.equal(request.headers.authorization, 'Bearer fixture-pairing-token')
        assert.equal(request.headers['x-harness-update-probe'], 'fixture-job-token')
        assert.equal(request.body.type, 'client-request')
      }
      matchVersion = false
      await assert.rejects(healthy(job, 'fixture-next', 50), /重启健康检查未通过/)
      report.push({ version, originalWorkerSha256: expected, immutableWorkerCopied: true,
        oldHealthRpcVerified: true, wrongVersionRejected: true, requiresThreePort503: true,
        nativeSessionListMustBeIdentical: version === '1.7.10', manualUpgradeFlagIsAdvisoryOnly: true,
        legacyVersionOnlyCatalogAccepted: true, npmInstallerWithoutAssetRejected: true,
        nativeUpgradePassed: false })
    } finally {
      server.closeAllConnections()
      await new Promise(resolve => server.close(resolve))
    }
  }
} finally {
  assert.equal(path.dirname(temporary), fs.realpathSync(os.tmpdir()))
  assert(path.basename(temporary).startsWith('legacy-upgrade-contract-'))
  fs.rmSync(temporary, { recursive: true })
}
console.log(JSON.stringify({ scope: 'frozen legacy worker protocol audit, not native upgrade acceptance', checks: report }, null, 2))
