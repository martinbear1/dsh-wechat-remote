// No host profile or model. Contract regressions complement the pinned RC3 /
// alpha.2 real-service runs retained in the release compatibility evidence.
import test from 'node:test'
import assert from 'node:assert/strict'
import { build } from 'esbuild'
import { fileURLToPath } from 'node:url'
const bundle = await build({entryPoints:[fileURLToPath(new URL('../src/human-workflow/automation-tools-native.ts',import.meta.url))],bundle:true,platform:'node',format:'esm',write:false})
const {prepareAutomationTools,nativeAutomationToolsSupported} = await import('data:text/javascript;base64,'+Buffer.from(bundle.outputFiles[0].text).toString('base64'))
const names=['human_automation_submission','human_automation_save'], selection={provider:'fixture',model:'fixture'}
function host(offered=names, assemble) {
  let opened=0,closed=0
  const tools={setExecutor(){assert.fail('Never take ownership of the user executor')},async resolve(context){context.signal.throwIfAborted();opened++;return {dispose(){closed++}}}}
  const prompt={assemble:assemble??(async()=>({tools:offered.map(name=>({name}))}))}
  const agent={ctx:{get:name=>({tools,systemPrompt:prompt}[name])}}
  return {tools,prompt,agent,counts:()=>({opened,closed})}
}
test('legacy presentation retains the exact native cleanup lease and does not inspect a new executor',async()=>{
 const dispose=()=>{}, calls=[]
 const agent={ctx:{get(name){assert.equal(name,'tools');return {presentAs(mode){calls.push(mode);return dispose}}}}}
 assert.equal(await prepareAutomationTools(agent,names,selection,new AbortController().signal),dispose)
 assert.deepEqual(calls,['native'])
})
test('direct-call admission releases its native tool-set before success and repeat',async()=>{
 const f=host()
 for(let i=0;i<3;i++){const release=await prepareAutomationTools(f.agent,names,selection,new AbortController().signal);release();release()}
 assert.deepEqual(f.counts(),{opened:3,closed:3})
})
test('PTC or partial custom transport rejects without changing executor or retaining admission',async()=>{
 for(const offered of [['run_code'],['human_automation_submission'],[]]){
  const f=host(offered)
  await assert.rejects(prepareAutomationTools(f.agent,names,selection,new AbortController().signal),{code:'automation-executor-unsupported'})
  assert.deepEqual(f.counts(),{opened:1,closed:1})
 }
})
test('cancel before or during prompt admission cannot leak a tool-set',async()=>{
 const before=new AbortController();before.abort();const initial=host()
 await assert.rejects(prepareAutomationTools(initial.agent,names,selection,before.signal));assert.deepEqual(initial.counts(),{opened:0,closed:0})
 const during=new AbortController(), active=host(names,async()=>{during.abort();return {tools:names.map(name=>({name}))}})
 await assert.rejects(prepareAutomationTools(active.agent,names,selection,during.signal));assert.deepEqual(active.counts(),{opened:1,closed:1})
})
test('provider failure stays visible and releases admission without retry or executor fallback',async()=>{
 const failure=Error('provider failed'),f=host(names,async()=>{throw failure})
 await assert.rejects(prepareAutomationTools(f.agent,names,selection,new AbortController().signal),error=>error===failure)
 assert.deepEqual(f.counts(),{opened:1,closed:1})
 assert.equal(nativeAutomationToolsSupported({resolve(){}},f.prompt),false)
})
