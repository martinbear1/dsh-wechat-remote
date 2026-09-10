// Read-only validation against an explicitly selected installed DSH. No Host
// invocation, session mutation, upload, login or model call is performed.
import assert from 'node:assert/strict'
import path from 'node:path'
import {pathToFileURL} from 'node:url'
import {commandArguments} from '../lib/dsh-protocol-compat.js'
const root=process.argv[2]
if(!root)throw Error('Pass the installed @deepseek-ai package directory')
const load=async pkg=>(await import(pathToFileURL(path.join(root,pkg,'lib/typert.host.js')).href)).TYPERT
function validate(face,ns,method,args){
 const invocation=face.invocations.find(i=>i.namespace===ns&&i.method===method)
 assert(invocation,'missing '+ns+'/'+method)
 const names=new Set(invocation.parameters.map(p=>p.wire||p.name))
 for(const key of Object.keys(args))assert(names.has(key),'unexpected argument '+key)
 for(const p of invocation.parameters)if(p.codec?.schema)p.codec.schema.parse(args[p.wire||p.name])
 return invocation
}
const commands=await load('dsh-commands'),uploads=await load('dsh-client-file-upload')
const args={agentId:'fixture',line:'/permission workspace-write',images:[],submittedAttachments:[]}
assert.throws(()=>validate(commands,'commands','execute',args),/unexpected argument images/)
const adapted=commandArguments({commandAttachmentField:()=> 'submittedAttachments'},args)
validate(commands,'commands','execute',adapted)
assert.throws(()=>validate(commands,'commands','execute',{...adapted,submittedAttachments:undefined}))
validate(uploads,'fileUploads','upload',{agentId:'fixture',request:{data:'YQ==',name:'report.md'}})
console.log('installed native strict gateway fields + schemas: single-generation command and file upload accepted; both missing and unexpected fields reproduced (no mutations)')
