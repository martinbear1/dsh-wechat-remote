// Cold-process continuation for test-native-update-tools-official.mjs only.
import fs from 'node:fs'
import path from 'node:path'
import assert from 'node:assert/strict'
import {createRequire} from 'node:module'
import {pathToFileURL} from 'node:url'
import {prepareNativeUpdateTools} from '../lib/native-update-tools.js'
const state=JSON.parse(fs.readFileSync(process.argv[2],'utf8'))
const {runtime,home,profile,command,third,owner,output}=state
assert(home.startsWith(path.resolve(output)+path.sep))
assert(path.basename(home).startsWith('真实工具 '))
process.env.DSH_HOME=home;process.env.DSH_AGENTS_HOME=path.join(home,'.agents');process.env.DSH_TELEMETRY_DISABLED='1'
const require=createRequire(path.join(runtime,'package.json'))
const load=name=>import(pathToFileURL(require.resolve(name)).href)
const {boot,loadProfileDirectory,createRuntimeResolution,PluginPackages,readProfilePatches}=await load('@deepseek-ai/dsh-app-boot')
const {symbols}=await load('@deepseek-ai/cordis')
const resolution=await createRuntimeResolution({installAnchor:profile.installAnchor,profile:loadProfileDirectory('web',profile.dir,profile.installAnchor),home})
const ctx=await boot('dsh',path.join(profile.dir,'cordis.yml'),readProfilePatches('dsh',profile),async ctx=>{
  ctx.provide('profileContext',profile)
  ctx.provide('appReady',{onReady(listener){listener();return()=>{}}})
  await ctx.plugin(PluginPackages,{resolution})
})
try{
  assert.equal(ctx.get('fixtureVersion'),'2.0.0')
  const before=ctx.get('pluginManager')
  const manager=await prepareNativeUpdateTools(ctx,home,'web',before)
  assert.equal(manager[symbols.original],before[symbols.original])
  assert.equal(ctx.get('configEditor').entries().find(row=>row.options.id==='plugin-manager').options.config.pnpmCommand,command)
  const result=await manager.installBundle(third,{enabled:true,requestId:'native-tool-next-release'})
  assert(['applied','restart-required'].includes(result.application),JSON.stringify(result))
  assert.equal(JSON.parse(fs.readFileSync(path.join(profile.dir,'node_modules',owner,'package.json'),'utf8')).version,'3.0.0')
  fs.writeFileSync(path.join(output,'RECOVERY-RESULT.json'),JSON.stringify({coldRuntimeVersion:'2.0.0',coldRestartPersistence:true,secondUpgrade:result.application,installed:'3.0.0'}))
}finally{await ctx.fiber.dispose()}
