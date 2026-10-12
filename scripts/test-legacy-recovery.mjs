/** Unit/protocol regression, not whole-machine upgrade acceptance.
 * node scripts/test-legacy-recovery.mjs [SHA-verified-old-release-root]
 * All writes and mock endpoints are confined to a new temporary fixture.
 */
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import http from 'node:http'
import { spawn } from 'node:child_process'
import { createHash, randomBytes } from 'node:crypto'
import { pathToFileURL } from 'node:url'
import ts from 'typescript'

const root = await fs.mkdtemp(path.join(os.tmpdir(), 'dsh-legacy-recovery-test-'))
const compiled = path.join(root, 'recovery.mjs')
await fs.writeFile(compiled, ts.transpileModule(await fs.readFile(new URL('../src/update-legacy-recovery.ts', import.meta.url), 'utf8'), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
}).outputText)
const { verifyLegacyRecoveryData, runLegacyRecovery, startLegacyRecovery, decodeLegacySessionDirectory } = await import(pathToFileURL(compiled))
const hash = bytes => createHash('sha256').update(bytes).digest('hex')
const checks = []
const writeJson = (file, value) => fs.writeFile(file, JSON.stringify(value), { mode: 0o600 })
async function fixture(name, sessionDirectory = 'session-fixture') {
  const home = path.join(root, name), id = randomBytes(16).toString('hex')
  const profile = path.join(home, 'profiles', 'web'), directory = path.join(home, 'harness-remote-updates', id)
  const session = path.join(home, 'sessions', 'workspace', sessionDirectory, 'session.v4.jsonl')
  await fs.mkdir(path.dirname(session), { recursive: true }); await fs.mkdir(profile, { recursive: true }); await fs.mkdir(directory, { recursive: true })
  const stateFile = path.join(home, 'gate-wechat-state.json'), state = { token: 'private-fixture-token', publicIdentityNodeId: 'fixture-node' }
  await writeJson(stateFile, state)
  const job = { id, home, profile, directory, stateFile, previousVersion: '1.7.13', targetVersion: '1.7.14-rc.fixture', dshVersion: '0.2.0-rc.fixture',
    statusToken: randomBytes(24).toString('hex'), manager: { kind: 'process' } }
  return { job, session, binding: hash(JSON.stringify([state.token, state.publicIdentityNodeId])) }
}
async function dataCase(name, initial, changed, options = {}) {
  const f = await fixture(name)
  let file = options.file ? path.join(f.job.home, options.file) : f.session + (options.zstd ? '.zstd' : '')
  await fs.mkdir(path.dirname(file), { recursive: true }); await fs.writeFile(file, initial)
  const ledger = { [path.relative(f.job.home, file)]: hash(initial), $binding: f.binding }
  await writeJson(path.join(f.job.directory, 'before-hashes.json'), ledger)
  if (changed !== undefined) await fs.writeFile(file, changed)
  if (options.mutate) await options.mutate(f, file, ledger)
  if (options.reject) await assert.rejects(verifyLegacyRecoveryData(f.job, AbortSignal.timeout(3000)), options.reject)
  else {
    const proof = await verifyLegacyRecoveryData(f.job, AbortSignal.timeout(3000))
    assert.equal(proof.appended.length, changed !== undefined && !Buffer.from(initial).equals(Buffer.from(changed)) ? 1 : 0)
    if (proof.appended.length) assert.equal(proof.appended[0].originalBytes, Buffer.byteLength(initial))
  }
  checks.push(name)
}
const original = '{"type":"session","id":"fixture"}\n{"seq":0}\n'
await dataCase('unchanged-data', original)
await dataCase('plain-jsonl-append', original, original + '{"seq":1}\n')
await dataCase('rewrite-and-append-rejected', original, original.replace('fixture', 'changed') + '{"seq":1}\n', { reject: /rewritten/ })
await dataCase('truncate-rejected', original, original.slice(0, -2), { reject: /rewritten/ })
await dataCase('non-boundary-prefix-rejected', 'unterminated', 'unterminated{"seq":1}\n', { reject: /rewritten/ })
await dataCase('attachment-append-rejected', original, original + '{"seq":1}\n', { file: 'attachments/log.jsonl', reject: /rewritten/ })
await dataCase('other-session-file-append-rejected', original, original + '{"seq":1}\n', { file: 'sessions/workspace/session-fixture/metadata.jsonl', reject: /rewritten/ })
await dataCase('pairing-change-rejected', original, undefined, { mutate: async f => writeJson(f.job.stateFile, { token: 'changed' }), reject: /Pairing/ })
await dataCase('deleted-file-rejected', original, undefined, { mutate: async (_f, file) => fs.unlink(file), reject: /ENOENT/ })
await dataCase('escaping-ledger-rejected', original, undefined, { mutate: async (f, _file, ledger) => writeJson(path.join(f.job.directory, 'before-hashes.json'), {
  $binding: ledger.$binding, [path.join('..', 'outside')]: hash(original),
}), reject: /path/ })
const magic = Buffer.from([0x28, 0xb5, 0x2f, 0xfd])
// Opaque byte fixtures exercise SHA boundary finding, not zstd validity. Native
// parser validation belongs to the actual host probe and integration tests.
for (const offset of [65533, 65534, 65535, 65536, 65537]) {
  const old = Buffer.concat([magic, Buffer.alloc(offset - 4, 65)])
  await dataCase(`frame-boundary-${offset}`, old, Buffer.concat([old, magic, Buffer.from('new-frame')]), { zstd: true })
}
const oldFrame = Buffer.concat([magic, Buffer.from('old-payload-with-'), magic, Buffer.from('incidental-magic')])
await dataCase('incidental-magic-not-a-proof', oldFrame, Buffer.concat([oldFrame.subarray(0, -1), Buffer.from('X'), magic, Buffer.from('tail')]), { zstd: true, reject: /rewritten/ })
await dataCase('zstd-recompression-rejected', oldFrame, Buffer.concat([magic, Buffer.from('different-compression'), magic, Buffer.from('tail')]), { zstd: true, reject: /rewritten/ })
await dataCase('zstd-no-new-frame-rejected', oldFrame, Buffer.concat([oldFrame, Buffer.from('truncated-tail')]), { zstd: true, reject: /rewritten/ })

const releases = process.argv[2] || process.env.LEGACY_RELEASES_ROOT
const identities = [
  ['session-123_ABC.v4', 'session-123_ABC.v4'],
  ['~4F1A~8BDD~007Etest~D83D~DE00', '会话~test😀'],
  ['~002E', '.'], ['~002E~002E', '..'], ['path~002Fchild~005Ctail', 'path/child\\tail'],
  ['~007E0041', '~0041'], ['~0000', '\u0000'], ['~D800', '\uD800'],
]
for (const [directory, id] of identities) assert.equal(decodeLegacySessionDirectory(directory), id)
for (const malformed of ['', '.', '..', '~', '~GGGG', '~123', '~abcd', '~0041', '~002Etext', 'space here', 'raw/child']) {
  assert.throws(() => decodeLegacySessionDirectory(malformed), /native session directory/)
}
checks.push('official-utf16-directory-decoding', 'malformed-and-noncanonical-directory-rejected')
async function protocolCase(name, mutation, expectedFailure, version = '1.7.13', identity = ['session-fixture', 'session-fixture']) {
  const [sessionDirectory, sessionId] = identity
  const f = await fixture(name, sessionDirectory), { job } = f
  job.previousVersion = version
  const servers = [], children = []
  let phase = 'verifying', nativeReads = 0, wrongHistory = false, wrongVersion = false, samePid = false
  let wrongJobId = false, hiddenSession = false, unrelatedUnreadable = false
  const failure = { message: '升级后数据校验不一致；停止自动操作并保留备份' }
  const result = { phase: 'attention', terminal: true, ok: false, rollback: false, message: 'fixture original failure retained' }
  const request = { job, workerOrigin: '' }
  const serve = async handler => {
    const server = http.createServer((req, res) => { Promise.resolve(handler(req, res)).catch(error => { res.writeHead(500); res.end(String(error)) }) })
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve)); servers.push(server)
    return server.address().port
  }
  const send = (res, value) => { res.setHeader('content-type', 'application/json'); res.end(JSON.stringify(value)) }
  const statusHandler = async (_req, res) => {
    const exists = await fs.stat(path.join(job.directory, 'verification-complete.json')).then(() => true, () => false)
    res.writeHead(exists ? 200 : 503); res.end(exists ? 'restored' : 'maintenance')
  }
  try {
    const command = 'setInterval(()=>{},1000)'
    for (let i = 0; i < 2; i++) children.push(spawn(process.execPath, ['-e', command], { stdio: 'ignore', windowsHide: true }))
    job.cli = '-e'; job.argv = ['-e', command]
    const processRecord = pid => ({ pid, cli: job.cli, home: job.home, webPort: job.webPort })
    job.webPort = await serve(statusHandler)
    job.localPort = await serve(statusHandler)
    job.gatePort = await serve(async (req, res) => {
      if (req.url === '/gate/status') return statusHandler(req, res)
      assert.equal(req.headers.authorization, 'Bearer private-fixture-token')
      assert.equal(req.headers['x-harness-update-probe'], job.statusToken)
      let body = ''; for await (const chunk of req) body += chunk
      const { method, payload } = JSON.parse(body)
      let value
      if (method === 'wechatHost/describe') value = { ok: true, value: { pluginVersion: wrongVersion ? 'wrong' : job.previousVersion, agentVersion: job.dshVersion } }
      else if (method === 'session.list') value = { items: hiddenSession ? [] : [{ sessionId }, ...(unrelatedUnreadable ? [{ sessionId: 'old-unreadable' }] : [])] }
      else {
        nativeReads++
        if (wrongHistory || payload.sessionId === 'old-unreadable') return send(res, { result: { ok: false } })
        assert.equal(payload.sessionId, sessionId, 'native history must receive the decoded identity, not its storage directory')
        value = { messages: [] }
      }
      send(res, { result: { ok: true, value } })
    })
    const statusPort = await serve((req, res) => {
      if (req.headers.authorization !== `Bearer ${job.statusToken}`) { res.writeHead(403); res.end(); return }
      send(res, { phase, terminal: phase === 'attention', ok: phase === 'attention' ? false : undefined,
        ...(wrongJobId ? { jobId: 'another-job' } : version === '1.7.10' ? {} : { jobId: job.id }) })
    })
    request.workerOrigin = `http://127.0.0.1:${statusPort}`
    await fs.copyFile(path.join(releases, version, 'core/package/lib/update-worker.js'), path.join(job.directory, 'update-worker.js'))
    await fs.writeFile(f.session, original + '{"seq":1}\n')
    await writeJson(path.join(job.directory, 'before-hashes.json'), { [path.relative(job.home, f.session)]: hash(original), $binding: f.binding })
    await fs.writeFile(path.join(job.profile, '.harness-remote-update.lock'), job.id)
    await writeJson(path.join(job.directory, 'job.json'), job)
    await writeJson(path.join(job.directory, 'authorized.json'), { id: job.id })
    await writeJson(path.join(job.directory, 'worker-ready.json'), { id: job.id, origin: request.workerOrigin })
    await writeJson(path.join(job.directory, 'restarted-process.json'), processRecord(children[0].pid))
    const manifest = path.join(job.profile, 'node_modules/@harness-remote/dsh-wechat-remote/package.json')
    await fs.mkdir(path.dirname(manifest), { recursive: true }); await writeJson(manifest, { name: '@harness-remote/dsh-wechat-remote', version })
    for (const file of ['failure.json', 'rollback-failure.json']) await writeJson(path.join(job.directory, file), failure)
    await writeJson(path.join(job.directory, 'result.json'), result)
    const finish = async () => { await writeJson(path.join(job.directory, 'restarted-process.json'), processRecord(children[samePid ? 0 : 1].pid)); phase = 'attention' }
    const control = { ...f, request, setPhase: value => { phase = value }, setWrongHistory: () => { wrongHistory = true },
      setWrongVersion: () => { wrongVersion = true }, setSamePid: () => { samePid = true }, setWrongJobId: () => { wrongJobId = true },
      setHiddenSession: () => { hiddenSession = true }, setUnrelatedUnreadable: () => { unrelatedUnreadable = true }, finish }
    if (mutation) await mutation(control)
    let transition
    const execution = runLegacyRecovery(request, () => { transition = finish() })
    if (expectedFailure) {
      await assert.rejects(execution, expectedFailure)
      assert.equal(await fs.stat(path.join(job.directory, 'verification-complete.json')).then(() => true, () => false), false)
    } else {
      await execution; await transition
      assert(nativeReads > 0)
      assert.deepEqual(JSON.parse(await fs.readFile(path.join(job.directory, 'result.json'))), result)
      assert.deepEqual(JSON.parse(await fs.readFile(path.join(job.directory, 'failure.json'))), failure)
      const receipt = JSON.parse(await fs.readFile(path.join(job.directory, 'verification-complete.json')))
      assert.equal(receipt.outcome, 'rollback-recovered'); assert.equal(receipt.id, job.id)
      const audit = JSON.parse(await fs.readFile(path.join(job.directory, 'maintenance-recovery.json')))
      assert.equal(audit.upgradeSucceeded, false); assert.equal(audit.maintenanceReleased, true)
      assert.equal(audit.data.appended.length, 1)
      assert.equal(await fs.stat(path.join(job.profile, '.harness-remote-update.lock')).then(() => true, () => false), false)
    }
    checks.push(name)
  } finally {
    for (const child of children) child.kill('SIGTERM')
    for (const server of servers) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)) }
  }
}
if (releases) {
  await protocolCase('failed-upgrade-real-recovery-keeps-verdict', undefined, undefined)
  await protocolCase('old10-no-echoed-jobid', undefined, undefined, '1.7.10')
  await protocolCase('custom-encoded-session-native-history', async c => c.setHiddenSession(), undefined, '1.7.13', identities[1])
  await protocolCase('escaped-dotdot-is-only-an-rpc-identity', undefined, undefined, '1.7.13', identities[3])
  await protocolCase('hidden-changed-session-direct-read', async c => c.setHiddenSession())
  await protocolCase('unrelated-unreadable-history-not-a-new-gate', async c => c.setUnrelatedUnreadable())
  await protocolCase('terminal-journal-cannot-start-recovery', async c => c.setPhase('attention'), /live startup/)
  await protocolCase('foreign-lock-rejected', async c => fs.writeFile(path.join(c.job.profile, '.harness-remote-update.lock'), 'another-owner'), /authorized/)
  await protocolCase('unknown-worker-rejected', async c => fs.writeFile(path.join(c.job.directory, 'update-worker.js'), 'not-the-frozen-worker'), /Unrecognized/)
  await protocolCase('wrong-restored-version-rejected', async c => c.setWrongVersion(), /runtime/)
  await protocolCase('old10-wrong-present-jobid-rejected', async c => c.setWrongJobId(), /Wrong recovery worker/, '1.7.10')
  await protocolCase('unreadable-appended-history-rejected', async c => c.setWrongHistory(), /Native rollback read/)
  await protocolCase('unrelated-rollback-error-rejected', async c => writeJson(path.join(c.job.directory, 'rollback-failure.json'), { message: 'installer still running' }), /known byte/)
  await protocolCase('same-process-not-a-rollback', async c => c.setSamePid(), /not replaced/)
  await protocolCase('rewritten-session-keeps-maintenance', async c => fs.writeFile(c.session, '{"rewritten":true}\n'), /rewritten/)
} else checks.push('protocol-tests-skipped: supply verified historical release root')
const noWorker = await fixture('normal-start-no-worker')
await startLegacyRecovery({ job: noWorker.job, workerOrigin: 'http://127.0.0.1:1' })
assert.equal(await fs.stat(path.join(noWorker.job.directory, 'legacy-recovery.mjs')).then(() => true, () => false), false)
checks.push('ordinary-start-no-participant')
console.log(JSON.stringify({ scope: 'unit and mock protocol only; real frozen-worker upgrade is tested separately', fixture: root, checks, passed: true }, null, 2))
