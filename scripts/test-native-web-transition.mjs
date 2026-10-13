/** Full official Web host, published outer 1.7.13 -> candidate via native Add.
 * node script DSH_BIN OLD_OUTER_TGZ NEW_OUTER_TGZ NEW_FIXTURE_ROOT [file|http|registry] [replace|reinstall-core|reinstall-outer]
 * Fresh data only. Native inspect/install, real pnpm, graceful cold restart.
 * The loopback diagnostic calls public host APIs; it does not replace the old
 * updater, fake activation, approve scripts, log in, or start a model task.
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import net from 'node:net'
import http from 'node:http'
import { spawn, spawnSync } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import { pathToFileURL } from 'node:url'

const [cliArg, oldArg, nextArg, rootArg, transport = 'file', scenario = 'replace'] = process.argv.slice(2)
assert(cliArg && oldArg && nextArg && rootArg, 'DSH_BIN OLD_OUTER_TGZ NEW_OUTER_TGZ NEW_FIXTURE_ROOT required')
assert(['file', 'http', 'registry'].includes(transport), 'invalid artifact transport')
assert(['replace', 'reinstall-core', 'reinstall-outer'].includes(scenario), 'invalid native scenario')
const reinstall = scenario !== 'replace', baselineOwner = scenario === 'reinstall-core' ? '@harness-remote/dsh-wechat-remote' : 'dsh-wechat-remote'
assert(['darwin', 'linux'].includes(process.platform))
const cli = fs.realpathSync(cliArg), baseline = fs.realpathSync(oldArg), candidate = fs.realpathSync(nextArg)
const root = path.resolve(rootArg)
assert(path.basename(root).startsWith('dsh-native-web-transition-'))
assert(!fs.existsSync(root), 'never reuse an existing profile')
const sha = bytes => createHash('sha256').update(bytes).digest('hex')
const member = (file, entry) => {
  const result = spawnSync('tar', ['-xOf', file, entry], { maxBuffer: 32 * 1024 * 1024 })
  assert.equal(result.status, 0, result.stderr?.toString()); return result.stdout
}
const oldManifest = JSON.parse(member(baseline, 'package/package.json'))
const nextManifest = JSON.parse(member(candidate, 'package/package.json'))
const owner = 'dsh-wechat-remote', otherOwner = '@harness-remote/dsh-wechat-remote'
assert.equal(oldManifest.name, owner); assert.equal(nextManifest.name, owner)
assert.equal(oldManifest.version, '1.7.13'); assert.notEqual(nextManifest.version, oldManifest.version)
assert.equal(sha(fs.readFileSync(baseline)), '411bc900c9204aae1a0531761827ac0541af0c0ea763c83679890efe7d429c13')
const dsh = JSON.parse(fs.readFileSync(path.resolve(cli, '../../package.json')))
assert.equal(dsh.name, '@deepseek-ai/dsh')
fs.mkdirSync(root, { recursive: true, mode: 0o700 })
const home = path.join(root, 'home'), profile = path.join(home, 'profiles/web')
const json = (file, value) => fs.writeFileSync(file, JSON.stringify(value, null, 2), { mode: 0o600 })
fs.mkdirSync(home)
json(path.join(home, 'harness-remote-public.json'), { enabled: false, relayOrigin: 'https://relay.xyxfood.xyz' })
const report = { fixture: root, platform: process.platform, dsh: dsh.version,
  from: oldManifest.version, to: nextManifest.version, targetSha256: sha(fs.readFileSync(candidate)),
  scope: 'actual native Add/removal backend and full isolated Web host; not GUI automation or user acceptance', transport, scenario,
  baselineInstallation: 'official CLI Add of unchanged original outer or embedded core artifact; not an NPX invocation', checks: [], ok: false }
const tools = path.join(root, 'tooling'); fs.mkdirSync(tools)
const extracted = spawnSync('tar', ['-xzf', baseline, '-C', tools], { encoding: 'utf8' })
assert.equal(extracted.status, 0, extracted.stderr)
const pnpm = path.join(tools, 'package/node_modules/pnpm/bin/pnpm.cjs')
assert(fs.existsSync(pnpm))
const bin = path.join(root, 'bin'); fs.mkdirSync(bin)
fs.writeFileSync(path.join(bin, 'pnpm'), '#!/bin/sh\nexec "$HARNESS_INSTALL_NODE" "$HARNESS_INSTALL_PNPM" "$@"\n', { mode: 0o700 })
const env = { ...process.env }
for (const key of Object.keys(env)) if (/^(DSH_|WECHAT_GATE_|HARNESS_REMOTE_|DEEPSEEK_API_KEY$|NODE_OPTIONS$)/.test(key)) delete env[key]
Object.assign(env, { DSH_HOME: home, PATH: bin + ':' + path.dirname(process.execPath) + ':' + (env.PATH || ''),
  HARNESS_INSTALL_NODE: process.execPath, HARNESS_INSTALL_PNPM: pnpm, CI: 'true',
  COREPACK_ENABLE_AUTO_PIN: '0', npm_config_manage_package_manager_versions: 'false',
  npm_config_store_dir: path.join(root,'pnpm-store'), npm_config_cache: path.join(root,'npm-cache'), XDG_CACHE_HOME: path.join(root,'xdg-cache') })
let port
for (let first = 7810; first < 8100; first += 4) {
  try {
    for (let value = first; value < first + 4; value++) await new Promise((resolve, reject) => {
      const server = net.createServer(); server.once('error', reject); server.listen(value, '0.0.0.0', () => server.close(resolve))
    })
    port = first; break
  } catch {}
}
assert(port)
Object.assign(env, { DSH_PORT: String(port), WECHAT_GATE_PORT: String(port + 2), WECHAT_GATE_LOCAL_PORT: String(port + 3) })
// Native Add accepts an online tarball without a separate user download. Keep
// the original host and released plugin untouched; only the artifact source
// is a local test server. This does NOT turn the refused @latest input into an
// upgrade or prove that the frozen 1.7.13 update button can perform one.
let source = candidate, archiveServer, archiveGets = 0, metadataGets = 0, registry
if (transport === 'http' || transport === 'registry') {
  const route = `/dsh-wechat-remote-${nextManifest.version}.tgz`
  archiveServer = http.createServer((req, res) => {
    if (transport === 'registry' && [`/${owner}`, `/${owner}/latest`, `/${owner}/${nextManifest.version}`].includes(req.url)) {
      metadataGets++
      const bytes = fs.readFileSync(candidate), published = '2026-10-01T00:00:00.000Z'
      const metadata = { ...nextManifest, dist: { tarball: registry + route, shasum: createHash('sha1').update(bytes).digest('hex'),
        integrity: 'sha512-' + createHash('sha512').update(bytes).digest('base64') } }
      res.setHeader('content-type', 'application/json')
      res.end(JSON.stringify(req.url === `/${owner}` ? { name: owner, 'dist-tags': { latest: nextManifest.version },
        time: { created: published, modified: published, [nextManifest.version]: published }, versions: { [nextManifest.version]: metadata } } : metadata)); return
    }
    if (req.url !== route || !['GET', 'HEAD'].includes(req.method)) { res.writeHead(404); res.end(); return }
    res.writeHead(200, { 'content-type': 'application/octet-stream', 'content-length': fs.statSync(candidate).size })
    if (req.method === 'HEAD') { res.end(); return }
    archiveGets++
    const stream = fs.createReadStream(candidate)
    stream.on('error', error => res.destroy(error))
    res.on('close', () => stream.destroy())
    stream.pipe(res)
  })
  await new Promise((resolve, reject) => { archiveServer.once('error', reject); archiveServer.listen(0, '127.0.0.1', resolve) })
  registry = `http://127.0.0.1:${archiveServer.address().port}`
  source = transport === 'registry' ? owner + '@latest' : registry + route
}
const probe = path.join(root, 'probe.mjs'), auth = randomUUID(), sessionId = 'native-transition-fixture'
fs.writeFileSync(probe, `import http from 'node:http';
export const inject = ['sessionController', 'pluginManager'];
export async function apply(ctx) {
  const server = http.createServer(async (req, res) => {
    if (req.headers.authorization !== ${JSON.stringify('Bearer ' + auth)}) { res.writeHead(403); res.end(); return; }
    try {
      let value; const manager = ctx.get('pluginManager');
      if (req.url === '/snapshot') {
        const host = ctx.get('wechatHost');
        let wire; try { wire = await ctx.get('typertGateway').dispatchRpc('wechatHost/describe', {args:{request:{}}}, AbortSignal.timeout(5000)) }
        catch(error) { wire = {ok:false,error:{code:error.code,message:String(error.message)}} }
        value = { pid: process.pid, described: host ? await host.describe({}, AbortSignal.timeout(5000)) : null,
          wire, strictDefinition: Boolean(ctx.get('typert').local.get('wechatHost/describe')),
          clientEntries: ctx.get('clientModules')?.graph().entries.map(row=>row.id) ?? [],
          bundles: await manager.listBundles(), sessions: await ctx.get('sessionController').list({}, AbortSignal.timeout(5000)),
          entries: [...ctx.get('loader').entries()].map(e => ({id:e.options.id,state:e.fiber?.state})) };
      } else if (req.url === '/seed') {
        value = await ctx.get('sessionController').create({cwd:${JSON.stringify(root)},sessionId:${JSON.stringify(sessionId)},agentPreset:'standard'});
        if (!await ctx.get('sessions').flush(ctx.get('sessions').get(value.sessionId))) throw Error('fixture session not persisted');
      } else if (req.url === '/inspect-latest') value = await manager.inspect(${JSON.stringify(baselineOwner + '@latest')});
      else if (req.url === '/native-remove' && req.method === 'POST') value = await manager.removeBundle(${JSON.stringify(baselineOwner)});
      else if (req.url === '/disable' && req.method === 'POST') value = await manager.setBundleEnabled(${JSON.stringify(owner)},false);
      else if (req.url === '/enable' && req.method === 'POST') value = await manager.setBundleEnabled(${JSON.stringify(owner)},true);
      else if (req.url === '/native-add' && req.method === 'POST') {
        const inspected = await manager.inspect(${JSON.stringify(source)});
        value = { inspected, result: inspected.status === 'accepted'
          ? await manager.installBundle(${JSON.stringify(source)},{enabled:false,requestId:'fixture-native-add'}) : null };
      } else if (req.url === '/exit' && req.method === 'POST') {
        value = {stopping:true}; setTimeout(() => ctx.get('appExit')(0), 30);
      } else throw Error('unknown fixture operation');
      res.setHeader('content-type','application/json'); res.end(JSON.stringify(value));
    } catch(error) { res.writeHead(500); res.end(JSON.stringify({error:String(error.stack || error)})); }
  });
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(${port + 1},'127.0.0.1',resolve)});
  ctx.effect(()=>()=>new Promise(resolve=>{server.close(resolve);server.closeAllConnections()}));
}
`)
const pause = ms => new Promise(resolve => setTimeout(resolve, ms))
async function call(route, method = 'GET') {
  const response = await fetch(`http://127.0.0.1:${port + 1}/${route}`, { method,
    headers: { authorization: 'Bearer ' + auth }, signal: AbortSignal.timeout(['native-add','native-remove'].includes(route) ? 180000 : 10000) })
  const value = await response.json(); assert(response.ok, value.error); return value
}
let child
function start() {
  const log = fs.openSync(path.join(root, 'runtime.log'), 'a', 0o600)
  child = spawn(process.execPath, [cli, '--profile', 'web', '--port', String(port), '--no-open'], {cwd:root,env,stdio:['ignore',log,log]})
  fs.closeSync(log)
}
async function stop() {
  if (!child || child.exitCode !== null || child.signalCode !== null) return
  if(reinstall){
    // Web's ordinary terminal/service lifecycle is a normal POSIX stop, not a
    // cross-platform restart API. Only this fixture-owned child is targeted.
    child.kill('SIGTERM')
    for(let n=0;n<300&&child.exitCode===null&&child.signalCode===null;n++)await pause(100)
    assert(child.exitCode!==null||child.signalCode!==null,'normal fixture stop did not finish; no forced kill')
    return
  }
  await call('exit', 'POST')
  for (let n = 0; n < 150 && child.exitCode === null && child.signalCode === null; n++) await pause(100)
  assert(child.exitCode !== null || child.signalCode !== null, 'fixture did not exit gracefully')
  assert.equal(child.exitCode,0,'native appExit must finish normally')
  assert.equal(child.signalCode,null,'native appExit must not require a signal')
}
async function ready(version) {
  for (let n = 0; n < 120; n++) {
    assert(child.exitCode === null && child.signalCode === null, 'fixture host exited; inspect runtime.log')
    try { const value = await call('snapshot'); if (value.described?.value?.pluginVersion === version) return value } catch {}
    await pause(500)
  }
  throw Error(`fixture ${version} did not activate; inspect runtime.log`)
}
const preserved = () => {
  const files = {}
  const walk = dir => { if (fs.existsSync(dir)) for (const entry of fs.readdirSync(dir,{withFileTypes:true})) {
    const file = path.join(dir,entry.name); if(entry.isDirectory())walk(file);else if(entry.isFile())files[path.relative(home,file)]=sha(fs.readFileSync(file))
  } }
  walk(path.join(home,'sessions')); walk(path.join(home,'profiles/desktop'))
  for(const file of ['fixture-user-settings.json','profiles/web/cordis.patch.yml'])files[file]=sha(fs.readFileSync(path.join(home,file)))
  return files
}
const binding = () => {
  const key = sha(Buffer.from('deepseek-harness\0web')).slice(0,24)
  const scoped = path.join(home,'harness-remote/instances',key)
  const stateFile = path.join(fs.existsSync(path.join(scoped,'storage-layout.json')) ? scoped : home,'gate-wechat-state.json')
  const state = JSON.parse(fs.readFileSync(stateFile,'utf8'))
  return sha(Buffer.from(JSON.stringify([state.token,state.publicIdentityNodeId])))
}
try {
  const log = fs.openSync(path.join(root,'baseline-install.log'),'a',0o600)
  const baselineSource = scenario === 'reinstall-core' ? path.join(tools,'package/assets/plugin.tgz') : baseline
  const install = spawn(process.execPath,[cli,'plugin','--profile','web','add',`file:${baselineSource}`,'--ignore-scripts','--config.frozen-lockfile=false','--reporter=append-only'],{cwd:root,env,stdio:['ignore',log,log]})
  fs.closeSync(log)
  assert.equal(await new Promise((resolve,reject)=>{install.once('error',reject);install.once('exit',resolve)}),0)
  json(path.join(profile,'cordis.patch.yml'),[{id:'session-title-llm',disabled:true},...(transport==='registry'?[{id:'plugin-manager',config:{registry,fallbackRegistries:[]}}]:[]),
    {insert:[{id:'fixture-native-transition',name:pathToFileURL(probe).href}]}])
  json(path.join(home,'fixture-user-settings.json'),{theme:'dark',fixture:randomUUID()})
  fs.mkdirSync(path.join(home,'profiles/desktop'),{recursive:true})
  json(path.join(home,'profiles/desktop/package.json'),{fixture:'separate Desktop must remain untouched'})
  start(); const before = await ready(oldManifest.version)
  await call('seed')
  const saved = preserved(), beforeBinding = binding()
  // Pairing identity is generated by the real gate, not copied from a person.
  const refused = await call('inspect-latest')
  assert.equal(refused.problem,'already-installed')
  if(reinstall){
    if(scenario==='reinstall-core')assert(before.strictDefinition,'Original core13 must register its strict Host face')
    const removed=await call('native-remove','POST');assert(!removed.error,JSON.stringify(removed))
    const uninstalled=await call('snapshot')
    assert(!uninstalled.bundles.some(row=>[owner,otherOwner].includes(row.name)&&row.installed))
    assert.equal(uninstalled.strictDefinition,false,'Uninstall must withdraw old definitions')
    assert.deepEqual(preserved(),saved)
    report.checks.push({stage:'native-remove',originalOwner:baselineOwner,originalStrictDefinition:before.strictDefinition,
      definitionWithdrawn:true,fixtureSessionAndSettingsPreserved:true,separateDesktopPreserved:true})
  }
  const installed = await call('native-add','POST')
  assert.equal(installed.inspected.status,'accepted')
  assert(!installed.result.error,JSON.stringify(installed))
  if(!reinstall)assert.equal(installed.result.application,'restart-required',JSON.stringify(installed))
  assert.equal(installed.result.bundle,owner)
  if (transport === 'http') assert(archiveGets > 0, 'native package manager must actually download the online artifact')
  if (transport === 'registry') {
    assert(metadataGets > 0, 'native manager must inspect the actual private registry')
    // Native pnpm may reuse its content-addressed cache, as it does for users.
    // Verify the installed bytes, never turn an unrelated cache hit into a
    // product failure or misreport it as a fresh download.
    for(const file of ['package.json','native/index.js','native/lib/client.js'])
      assert.equal(sha(fs.readFileSync(path.join(profile,'node_modules',owner,file))),sha(member(candidate,'package/'+file)))
  }
  let enableResult
  if(reinstall)enableResult=await call('enable','POST')
  // Public activation diagnostics remain real. Some old package paths require
  // a cold restart; do not erase that fact or equate ACTIVE with a working wire.
  await pause(300)
  const warm = await call('snapshot')
  assert.equal(warm.pid,before.pid,'native Add must not restart the host secretly')
  const rows = warm.bundles.filter(row=>[owner,otherOwner].includes(row.name))
  assert.equal(rows.length,1);assert.equal(rows[0].enabled,true);assert.equal(rows[0].version,nextManifest.version)
  assert.deepEqual(preserved(),saved)
  if(!reinstall)assert.equal(binding(),beforeBinding)
  if(scenario==='reinstall-core'){
    assert(warm.strictDefinition,'Fresh outer gate must re-register strict endpoints withdrawn by core13')
    assert(warm.wire?.ok&&warm.wire.value?.ok,JSON.stringify(warm.wire))
    assert.equal(warm.wire.value.value.pluginVersion,nextManifest.version)
  }
  report.checks.push({stage:'native-add',sameOwner:true,oneBundle:true,enabledPreserved:true,oldRuntimeStillServing:true,
    ...(transport !== 'file' ? {nativeArchiveDownloads:archiveGets} : {}),result:installed.result.application,
    ...(transport === 'registry' ? {nativeMetadataRequests:metadataGets,installedBytesMatchCandidate:true,packageManagerCacheUsed:archiveGets===0} : {}),
    ...(reinstall?{warmRunning:warm.described?.value?.pluginVersion??null,strictDefinition:warm.strictDefinition,wireOk:warm.wire?.ok,
      nativeEnableError:enableResult?.error??null,oldRuntimeStillServing: warm.described?.value?.pluginVersion===oldManifest.version,sameOwner:baselineOwner===owner}: {})})
  await stop(); start(); const after = await ready(nextManifest.version)
  assert.notEqual(after.pid,before.pid)
  assert(after.sessions.items.some(item=>item.sessionId===sessionId))
  for(const id of ['gate','wechat-clawbot','harness-assistant-teacher','harness-assistant-project','harness-assistant-customizer','harness-resource-library'])
    assert(after.entries.some(entry=>entry.id===id&&entry.state===2),`inactive component ${id}`)
  assert.deepEqual(preserved(),saved)
  assert.equal(binding(),beforeBinding)
  assert(after.strictDefinition,'Cold candidate must expose a strict generated Host face, never source-mode fallback')
  assert(after.clientEntries.includes(otherOwner),'The embedded core must keep its native browser client half in the boot graph')
  assert(after.wire?.ok&&after.wire.value?.ok,JSON.stringify(after.wire))
  assert.equal(after.wire.value.value.pluginVersion,nextManifest.version)
  const statusResponse = await fetch(`http://127.0.0.1:${port+3}/gate/status`,{signal:AbortSignal.timeout(5000)})
  const gate = (await statusResponse.json()).gate
  assert.equal(gate.management,'authenticated-rpc');assert.equal(gate.updates,'native-v1')
  const manifest=JSON.parse(fs.readFileSync(path.join(profile,'package.json')))
  if (transport === 'http') assert.equal(manifest.dependencies[owner],source,'native URL dependency must be recorded truthfully')
  const ownNames = names => names.filter(name=>[owner,otherOwner].includes(name))
  assert.deepEqual(ownNames(Object.keys(manifest.dependencies)),[owner]);assert.deepEqual(ownNames(manifest.dsh.profile.bundles),[owner])
  report.checks.push({stage:'cold-restart',running:after.described.value.pluginVersion,sixComponentsActive:true,
    fixtureSessionAndSettingsPreserved:true,pairingIdentityPreserved:true,separateDesktopPreserved:true,nativeUpdates:gate.updates,oneBundle:true,
    strictDefinition:true,strictWireOk:true,nativeClientInBootGraph:true})
  if(reinstall){
    await call('disable','POST');await pause(200)
    const disabled=await call('snapshot');assert.equal(disabled.strictDefinition,false);assert.equal(disabled.wire.ok,false)
    await call('enable','POST');const enabled=await ready(nextManifest.version)
    assert(enabled.strictDefinition);assert(enabled.wire?.ok&&enabled.wire.value?.ok)
    assert.deepEqual(preserved(),saved);assert.equal(binding(),beforeBinding)
    report.checks.push({stage:'disable-enable',definitionWithdrawn:true,definitionReregistered:true,strictWireOk:true,dataPreserved:true})
  }
  report.ok=true
} catch(error) { report.error=String(error.stack||error);process.exitCode=1 }
finally {
  try { await stop() } catch(error) { report.ok=false;report.cleanupError=String(error);process.exitCode=1 }
  if(child&&child.exitCode===null&&child.signalCode===null)child.kill('SIGTERM')
  if(archiveServer) await new Promise(resolve => { archiveServer.close(resolve); archiveServer.closeAllConnections() })
  json(path.join(root,'result.json'),report)
}
console.log(JSON.stringify(report,null,2))
