/** Real fixed DSH / configEditor / pnpm, isolated synthetic packages, no live
 * profile, credentials, model or cloud. Usage: node SCRIPT RUNTIME NEW_OUTPUT. */
import fs from 'node:fs'
import path from 'node:path'
import assert from 'node:assert/strict'
import {createRequire} from 'node:module'
import {pathToFileURL,fileURLToPath} from 'node:url'
import {spawnSync} from 'node:child_process'
import {createHash} from 'node:crypto'
import {prepareNativeUpdateTools} from '../lib/native-update-tools.js'
import {resolveInstallRuntime} from '../lib/install-runtime.js'
import {NativeUpdateService} from '../lib/native-update-service.js'
const [runtime,output]=process.argv.slice(2)
assert(runtime&&output);assert(!fs.existsSync(output),'New isolated output required')
fs.mkdirSync(output,{recursive:true})
const home=fs.mkdtempSync(path.join(path.resolve(output),'真实工具 空格 !百分% &括号()-'))
const require=createRequire(path.join(path.resolve(runtime),'package.json'))
const load=name=>import(pathToFileURL(require.resolve(name)).href)
const {boot,initProfile,loadProfileDirectory,createRuntimeResolution,PluginPackages,readProfilePatches}=await load('@deepseek-ai/dsh-app-boot')
const {runPluginCommand}=await load('@deepseek-ai/dsh-plugin-manager/operations')
const {symbols}=await load('@deepseek-ai/cordis')
const originalEnv={...process.env}
for(const key of Object.keys(process.env))if(key.toLowerCase()==='path')delete process.env[key]
process.env.PATH=process.platform==='win32'?path.join(process.env.SystemRoot||'C:\\Windows','System32'):'/usr/bin:/bin'
process.env.DSH_HOME=home;process.env.DSH_AGENTS_HOME=path.join(home,'.agents');process.env.DSH_TELEMETRY_DISABLED='1'
const dir=path.join(home,'profiles/web'),owner='@harness-remote/dsh-wechat-remote'
const write=(file,value)=>{assert(file.startsWith(home+path.sep));fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,typeof value==='string'?value:JSON.stringify(value))}
const pack=(name,version,manager=false)=>{
  const filename=name.replaceAll('@','').replaceAll('/','-')+'-'+version
  const stage=path.join(home,'sources',filename),pkg=path.join(stage,'package')
  write(path.join(pkg,'package.json'),{name,version,type:'module',dsh:{bundle:{patch:'./cordis.patch.yml'}}})
  write(path.join(pkg,'cordis.patch.yml'),[{insert:manager?[
    {id:'plugin-manager',name:'@deepseek-ai/dsh-plugin-manager',config:{inspectTimeoutMs:12345}},
    {id:'config-editor',name:'@deepseek-ai/dsh-config-editor'},
  ]:[{id:'fixture-version',name:'./plugin.mjs'}]}])
  write(path.join(pkg,'plugin.mjs'),`export function apply(ctx){ctx.provide('fixtureVersion','${version}')}\n`)
  write(path.join(pkg,'lib/index.js'),'// synthetic fixture only\n')
  write(path.join(pkg,'lib/client.js'),'// synthetic fixture only\n')
  const archive=path.join(home,`${filename}.tgz`)
  const result=spawnSync(process.platform==='win32'?'C:\\Windows\\System32\\tar.exe':'/usr/bin/tar',['-czf',archive,'-C',stage,'package'],{encoding:'utf8',windowsHide:true})
  assert.equal(result.status,0,result.stderr)
  return archive
}
const base=pack('acceptance-native-tools-base','1.0.0',true),first=pack(owner,'1.0.0'),second=pack(owner,'2.0.0'),third=pack(owner,'3.0.0')
initProfile(dir,['acceptance-native-tools-base',owner])
write(path.join(dir,'cordis.yml'),'[]\n')
write(path.join(dir,'.npmrc'),`offline=true\nmanage-package-manager-versions=false\nstore-dir=${path.join(home,'store').replaceAll('\\','/')}\n`)
const installAnchor=require.resolve('@deepseek-ai/dsh/package.json')
const operation={profile:'web',dir,home,cwd:home,installAnchor}
const tool=resolveInstallRuntime(fileURLToPath(new URL('../',import.meta.url)))
const seed=await runPluginCommand(operation,['add',base,first,'--ignore-scripts'],{
  command:tool.executable,args:[tool.cli],execution:'service',outputBytes:5000,idleTimeoutMs:30000})
assert.equal(seed.exitCode,0,JSON.stringify(seed))
const profile={name:'web',dir,home,cwd:home,installAnchor,patchPath:path.join(dir,'cordis.patch.yml'),overlays:[],startedBundles:['acceptance-native-tools-base',owner]}
const start=async()=>{
  const resolution=await createRuntimeResolution({installAnchor,profile:loadProfileDirectory('web',dir,installAnchor),home})
  return boot('dsh',path.join(dir,'cordis.yml'),readProfilePatches('dsh',profile),async ctx=>{
    ctx.provide('profileContext',profile)
    ctx.provide('appReady',{onReady(listener){listener();return()=>{}}})
    await ctx.plugin(PluginPackages,{resolution})
  })
}
let ctx
try{
  ctx=await start()
  assert.equal(ctx.get('fixtureVersion'),'1.0.0')
  const before=ctx.get('pluginManager')
  const failed=await before.installBundle(second,{enabled:true,requestId:'missing-default-tool'})
  assert.equal(failed.application,'failed');assert.equal(failed.changed,false)
  assert.equal(JSON.parse(fs.readFileSync(path.join(dir,'node_modules',owner,'package.json'),'utf8')).version,'1.0.0')
  const archive=fs.readFileSync(second)
  const release={version:'2.0.0',asset:{url:'https://github.com/martinbear1/dsh-wechat-remote/releases/download/v2.0.0/plugin.tgz',bytes:archive.length,sha256:createHash('sha256').update(archive).digest('hex')}}
  const priorFetch=globalThis.fetch
  globalThis.fetch=async url=>{assert.equal(String(url),release.asset.url,'synthetic fixture is offline');return new Response(archive)}
  const service=new NativeUpdateService({home,scope:'web',runningVersion:'1.0.0',manager:()=>ctx.get('pluginManager'),
    prepareTools:manager=>prepareNativeUpdateTools(ctx,home,'web',manager),sessions:()=>({list:async()=>({items:[]})}),
    release:async()=>({channel:'stable',release,advice:{revision:'offline-native-tool-fixture',component:'plugin',targetVersion:'2.0.0'}})})
  let installed
  try{
    const checked=await service.check();assert.equal(checked.canInstall,true,JSON.stringify(checked))
    service.start(checked.ticket)
    const deadline=Date.now()+90000
    while(service.isBusy()&&Date.now()<deadline)await new Promise(resolve=>setTimeout(resolve,50))
    assert.equal(service.isBusy(),false)
    const status=await service.status()
    assert.equal(status.phase,'restart-required',JSON.stringify(status))
    installed=status.nativeResult
  }finally{service.dispose();globalThis.fetch=priorFetch}
  const manager=ctx.get('pluginManager')
  assert.notEqual(manager[symbols.original],before[symbols.original])
  const entry=ctx.get('configEditor').entries().find(row=>row.options.id==='plugin-manager')
  const command=entry.options.config.pnpmCommand
  assert(command.startsWith(path.join(home,'harness-remote-tools')+path.sep))
  assert.equal(entry.options.config.inspectTimeoutMs,12345)
  assert(['applied','restart-required'].includes(installed.application),JSON.stringify(installed))
  assert.equal(JSON.parse(fs.readFileSync(path.join(dir,'node_modules',owner,'package.json'),'utf8')).version,'2.0.0')
  await ctx.fiber.dispose();ctx=undefined
  // A dispose/reboot in this same Node process is NOT a cold restart: ESM
  // caches retain the old synthetic module. Use a genuinely fresh process.
  const recoveryFile=path.join(output,'RECOVERY.json')
  fs.writeFileSync(recoveryFile,JSON.stringify({runtime:path.resolve(runtime),home,profile,command,third,owner,output:path.resolve(output)}))
  const recovered=spawnSync(process.execPath,[fileURLToPath(new URL('./native-update-tools-recovery-fixture.mjs',import.meta.url)),recoveryFile],
    {env:process.env,encoding:'utf8',windowsHide:true,timeout:120000,maxBuffer:100000})
  assert.equal(recovered.status,0,recovered.stderr+recovered.stdout)
  const successor=JSON.parse(fs.readFileSync(path.join(output,'RECOVERY-RESULT.json'),'utf8'))
  const report={at:new Date().toISOString(),dsh:require('@deepseek-ai/dsh/package.json').version,home,
    originalMissingToolReproduced:true,originalChanged:failed.changed,preparedUsingProductModule:true,productNativeUpdateServiceUsed:true,
    nativeConfigEditor:true,unrelatedSettingsPreserved:true,newProviderUsed:true,globalPathModified:false,
    firstUpgrade:installed.application,coldRestartPersistence:true,secondUpgrade:successor.secondUpgrade,installed:'3.0.0',
    liveProfileAccessed:false,modelOrCloudUsed:false,scope:'Actual native install and durable tool configuration; synthetic packages, not complete product or phone acceptance'}
  fs.writeFileSync(path.join(output,'RESULT.json'),JSON.stringify(report,null,2)+'\n')
  console.log(JSON.stringify(report))
}finally{
  if(ctx)await ctx.fiber.dispose()
  process.env=originalEnv
}
