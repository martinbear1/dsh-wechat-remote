// Exercise the actual component handlers with lightweight hooks; no browser or
// native host is installed/restarted. Layout/animation still needs device QA.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import vm from 'node:vm'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'
const output = await build({entryPoints:[fileURLToPath(new URL('../src/client/PluginUpdateCard.tsx',import.meta.url))],
  bundle:true,write:false,platform:'node',format:'cjs',jsx:'automatic',external:['react','react/jsx-runtime','*.css'],logLevel:'silent'})
const initial = {canInstall:true,mode:'automatic',ticket:'ticket',reason:'',advice:{label:'可更新',message:'',severity:'info',targetVersion:'1.7.9',current:{agentVersion:'0.1.5',pluginVersion:'1.7.8'}}}
function harness(fetcher) {
  const state=[],refs=[]; let index=0,refIndex=0
  const react={useState(value){const at=index++; if(!(at in state))state[at]=at===0?structuredClone(initial):value; return[state[at],next=>{state[at]=typeof next==='function'?next(state[at]):next}]},
    useRef(value){const at=refIndex++; return refs[at]??=( {current:value} )},useCallback(fn){return fn},useEffect(){}}
  const module={exports:{}}
  vm.runInNewContext(output.outputFiles[0].text,{module,exports:module.exports,require(id){if(id==='react')return react;if(id.endsWith('.css'))return{};if(id==='react/jsx-runtime')return{jsx:(type,props)=>({type,props}),jsxs:(type,props)=>({type,props}),Fragment:'fragment'};throw Error(id)},fetch:fetcher,AbortSignal,URL,Date,window:{},navigator:{}})
  function render(){index=0;refIndex=0;return module.exports.PluginUpdateCard({localOrigin:'http://localhost:3183'})}
  function all(tree){if(!tree||typeof tree!=='object')return[];if(Array.isArray(tree))return tree.flatMap(all);return[tree,...all(tree.props?.children)]}
  function click(label){const button=all(render()).find(n=>n.type==='button'&&n.props.children===label);assert(button&&!button.props.disabled,label);button.props.onClick()}
  return{state,click,elements:()=>all(render())}
}
const settle=async()=>{for(let i=0;i<6;i++)await new Promise(resolve=>setImmediate(resolve))}
test('confirmed rejection shows a failure without 100% and consumes the one-use ticket',async()=>{
  const h=harness(async()=>new Response(JSON.stringify({error:'更新包暂时无法下载'}),{status:409}))
  h.click('更新并重启');await settle()
  assert.equal(h.state[2].phase,'failed');assert.equal(h.state[2].progress,0)
  assert.equal(h.state[0].canInstall,false);assert.equal(h.state[0].ticket,'')
  assert.equal(h.elements().some(n=>n.type==='progress'),false)
})
test('lost start reply recovers a known worker instead of inviting a second install',async()=>{
  const job={jobId:'abc',statusOrigin:'http://127.0.0.1:10001',statusToken:'test'};let calls=0
  const h=harness(async url=>{calls++;if(url.endsWith('/start'))throw TypeError('fetch failed');return new Response(JSON.stringify({activeJob:job}))})
  h.click('更新并重启');await settle()
  assert.equal(calls,2);assert.deepEqual(JSON.parse(JSON.stringify(h.state[4])),job)
  assert.equal(h.state[2].terminal,false);assert.equal(h.state[0].canInstall,false)
})
test('lost reply without a known worker stays unknown and ignores old successful results',async()=>{
  const h=harness(async url=>{if(url.endsWith('/start'))throw TypeError('fetch failed');return new Response(JSON.stringify({activeJob:null,lastResult:{terminal:true,ok:true,progress:100}}))})
  h.click('更新并重启');await settle()
  assert.equal(h.state[2].phase,'unknown');assert.equal(h.state[0].canInstall,false)
  assert.equal(h.elements().some(n=>n.type==='progress'),false)
})
test('refresh while still preparing does not render an earlier successful job',async()=>{
  const h=harness(async()=>new Response(JSON.stringify({...initial,mode:'busy',canInstall:false,lastResult:{terminal:true,ok:true,progress:100}})))
  h.click('检查更新');await settle()
  assert.equal(h.state[2].phase,'preparing');assert.equal(h.state[0].canInstall,false)
  assert.equal(h.elements().some(n=>n.type==='progress'),false)
})
