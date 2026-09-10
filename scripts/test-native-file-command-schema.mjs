// Read-only validation against an explicitly selected installed DSH. No Host
// invocation, session mutation, upload, login or model call is performed.
import assert from 'node:assert/strict'
import path from 'node:path'
import {pathToFileURL} from 'node:url'
const root=process.argv[2]
if(!root)throw Error('Pass the installed @deepseek-ai package directory')
const load=async pkg=>(await import(pathToFileURL(path.join(root,pkg,'lib/typert.host.js')).href)).TYPERT
function validate(face,ns,method,args){
 const invocation=face.invocations.find(i=>i.namespace===ns&&i.method===method)
 assert(invocation,'missing '+ns+'/'+method)
 for(const p of invocation.parameters)if(p.codec?.schema)p.codec.schema.parse(args[p.wire||p.name])
 return invocation
}
const commands=await load('dsh-commands'),uploads=await load('dsh-client-file-upload')
const args={agentId:'fixture',line:'/permission workspace-write',images:[],submittedAttachments:[]}
validate(commands,'commands','execute',args)
assert.throws(()=>validate(commands,'commands','execute',{...args,submittedAttachments:undefined}))
validate(uploads,'fileUploads','upload',{agentId:'fixture',request:{data:'YQ==',name:'report.md'}})
console.log('installed native strict schemas: command dual-generation args and file upload accepted; old missing field reproduced (no mutations)')
