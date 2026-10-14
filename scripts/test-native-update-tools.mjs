import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {test} from 'node:test'
import {spawnSync} from 'node:child_process'
import {persistentUpdateTool,prepareNativeUpdateTools,commandAvailable} from '../lib/native-update-tools.js'

const owned=[]
const scratch=()=>{const dir=fs.mkdtempSync(path.join(os.tmpdir(),'dsh-native-tools-'));owned.push(dir);return dir}
function cleanPath(t){
  const before=process.env
  const env={...before}
  for(const name of Object.keys(env))if(name.toLowerCase()==='path')delete env[name]
  env.PATH=''
  process.env=env
  t.after(()=>{process.env=before})
}
function context(t,home,config={}){
  let manager={generation:1}
  const state={edits:0,config:structuredClone(config),manager}
  const entry={options:{id:'plugin-manager',name:'@deepseek-ai/dsh-plugin-manager',config:state.config}}
  const editor={entries:()=>[entry],async edit(row,change){
    assert.equal(row,entry)
    state.config=change(structuredClone(entry.options.config),{})
    entry.options.config=state.config
    state.edits++
    manager={generation:2};state.manager=manager
  }}
  const profile={}
  const ctx={get(name){return {pluginManager:manager,configEditor:editor,profileContext:profile}[name]}}
  return {ctx,state,profile,editor,entry,initial:manager,home}
}

test('default command discovery handles absent, executable and broken paths without running commands',t=>{
  const dir=scratch()
  const file=path.join(dir,process.platform==='win32'?'pnpm.cmd':'pnpm')
  fs.writeFileSync(file,'', {mode:0o700})
  assert.equal(commandAvailable('pnpm',{PATH:dir,PATHEXT:'.CMD;.EXE'}),true)
  assert.equal(commandAvailable('pnpm',{PATH:path.join(dir,'absent')}),false)
  assert.equal(commandAvailable(path.join(dir,'absent')),false)
})

test('Desktop and application-owned tools are unchanged; unavailable/custom services do not become new gates',async t=>{
  const home=scratch(),f=context(t,home)
  cleanPath(t)
  assert.equal(await prepareNativeUpdateTools(f.ctx,home,'desktop',f.initial),f.initial)
  f.profile.packageManager={command:'application-owned'}
  assert.equal(await prepareNativeUpdateTools(f.ctx,home,'web',f.initial),f.initial)
  delete f.profile.packageManager
  f.entry.options.config={pnpmCommand:'enterprise-controlled-pnpm'}
  assert.equal(await prepareNativeUpdateTools(f.ctx,home,'web',f.initial),f.initial)
  f.entry.options.config={pnpmCommand:path.join(home,'harness-remote-tools','custom','pnpm.cmd')}
  assert.equal(await prepareNativeUpdateTools(f.ctx,home,'web',f.initial),f.initial,'a path alone never proves ownership of custom configuration')
  f.entry.options.name='custom-manager'
  assert.equal(await prepareNativeUpdateTools(f.ctx,home,'web',f.initial),f.initial)
  assert.equal(f.state.edits,0)
  assert.equal(fs.existsSync(path.join(home,'harness-remote-tools')),false)
})

test('working default pnpm is preserved without tool copying or configuration edits',async t=>{
  const home=scratch(),bin=path.join(home,'bin');fs.mkdirSync(bin)
  fs.writeFileSync(path.join(bin,process.platform==='win32'?'pnpm.cmd':'pnpm'),'',{mode:0o700})
  cleanPath(t);process.env.PATH=bin
  const f=context(t,home)
  assert.equal(await prepareNativeUpdateTools(f.ctx,home,'web',f.initial),f.initial)
  assert.equal(f.state.edits,0)
  assert.equal(fs.existsSync(path.join(home,'harness-remote-tools')),false)
})

test('missing global tool uses persistent verified runtime, preserves config and returns the NEW provider',async t=>{
  const root=scratch(),home=path.join(root,'工具 空格 !百分% &括号()');fs.mkdirSync(home)
  const f=context(t,home,{inspectTimeoutMs:12345,registry:'https://registry.example.test'})
  cleanPath(t)
  const replacement=await prepareNativeUpdateTools(f.ctx,home,'web',f.initial)
  assert.notEqual(replacement,f.initial)
  assert.equal(replacement,f.state.manager)
  assert.equal(f.state.edits,1)
  assert.equal(f.state.config.inspectTimeoutMs,12345)
  assert.equal(f.state.config.registry,'https://registry.example.test')
  const command=f.state.config.pnpmCommand
  assert(command.startsWith(path.join(home,'harness-remote-tools')+path.sep))
  const tool=await persistentUpdateTool(home)
  assert.equal(tool.command,command)
  const env={...process.env}
  // A new process has NO installer-specific variables or global Node/pnpm PATH.
  const result=process.platform==='win32'
    ?spawnSync(process.env.ComSpec||'C:\\Windows\\System32\\cmd.exe',['/d','/c','pnpm.cmd --version'],{cwd:path.dirname(command),env,encoding:'utf8',windowsHide:true})
    :spawnSync(command,['--version'],{env,encoding:'utf8'})
  assert.equal(result.status,0,result.stderr)
  assert.equal(result.stdout.trim(),'11.22.0')
  assert.equal(await prepareNativeUpdateTools(f.ctx,home,'web',replacement),replacement)
  assert.equal(f.state.edits,1,'same persisted tool must not replace native provider again')
  fs.appendFileSync(tool.command,'\nchanged\n')
  await assert.rejects(persistentUpdateTool(home),/校验失败/)
  assert(fs.readFileSync(tool.command,'utf8').includes('changed'),'never overwrite modified owned tools')
})

test('provider changed before preparation is not accepted or configured',async t=>{
  const home=scratch(),f=context(t,home)
  await assert.rejects(prepareNativeUpdateTools(f.ctx,home,'web',{}),/安装服务已变化/)
  assert.equal(f.state.edits,0)
})

test.after(()=>{
  for(const dir of owned){
    assert.equal(path.dirname(dir),os.tmpdir());assert(path.basename(dir).startsWith('dsh-native-tools-'))
    fs.rmSync(dir,{recursive:true,force:true})
  }
})
