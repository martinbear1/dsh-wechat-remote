import test from 'node:test'
import assert from 'node:assert/strict'
import { Context } from '@deepseek-ai/cordis'
import { z } from 'zod'
import { nativeAttachmentRequest } from '../lib/attachment-native.js'
import { resolveTypertGateway, invokeLegacyRpc } from '../lib/dsh-protocol-compat.js'
import WechatAttachmentService from '../lib/attachment-service.js'

const ref = { attachmentId: `sha256:${'a'.repeat(64)}`, mediaType: 'image/png', bytes: 4, width: 1, height: 1 }
const schemaRef = z.object({ attachmentId: z.string(), mediaType: z.string(), bytes: z.number(), width: z.number(), height: z.number() }).strict()
const schemas = {
  old: z.object({ sessionId: z.string(), attachmentId: z.string() }).strict(),
  alpha: z.object({ sessionId: z.string(), attachment: schemaRef }).strict(),
}
function host(version) {
  const calls = []
  const values = { typert: { local: { get: () => ({parameters:[{wire:'request', codec:{create:()=>schemas[version]}}]}) } },
    typertGateway: { async invoke(call) {
      calls.push(call); const request = schemas[version].parse(call.args.request)
      if (version === 'alpha') assert.deepEqual(request.attachment, ref)
      return { attachment: ref, data: 'AQIDBA==' }
    }, async *stream() {} } }
  return { calls, values, get: key => values[key] }
}
for (const version of ['old', 'alpha']) test(`stable mobile RPC reaches strict ${version} native request`, async () => {
  const ctx = host(version)
  const response = await invokeLegacyRpc(resolveTypertGateway(ctx), {
    type:'client-request',rpcId:'r',method:'session.attachment',payload:{sessionId:'s',attachmentId:ref.attachmentId,attachment:ref},
  }, {signal:new AbortController().signal,describeHost:()=>({})})
  assert.equal(response.result.ok,true)
  assert.deepEqual(ctx.calls[0].args.request, version === 'old' ? {sessionId:'s',attachmentId:ref.attachmentId} : {sessionId:'s',attachment:ref})
})
test('late cancelled cold observation is disposed before returning bytes', async () => {
  const ctx=host('alpha'),abort=new AbortController();let disposed=0
  ctx.values.sessionQuery={async observeSession(){abort.abort();return {events:[],[Symbol.dispose](){disposed++}}}}
  await assert.rejects(nativeAttachmentRequest(ctx,{sessionId:'s',attachmentId:ref.attachmentId},abort.signal))
  assert.equal(disposed,1);assert.equal(ctx.calls.length,0)
})
test('object acceleration forwards full refs; cached success cannot mask different metadata', async () => {
  const values=host('alpha'), ctx=new Context()
  ctx.get=key=>values.get(key)
  let uploads=0
  const service=new WechatAttachmentService(ctx,{async storeAttachment(){uploads++;return {v:1,contentKind:'image',expiresAt:Date.now()+120000}}})
  const good={sessionId:'s',attachments:[{attachmentId:ref.attachmentId,attachment:ref}]}
  assert.equal((await service.prepareBatch(good,new AbortController().signal)).ok,true)
  assert.equal((await service.prepareBatch(good,new AbortController().signal)).ok,true)
  assert.equal(uploads,1);assert.equal(values.calls.length,1)
  const bad={sessionId:'s',attachments:[{attachmentId:ref.attachmentId,attachment:{...ref,width:99}}]}
  assert.equal((await service.prepareBatch(bad,new AbortController().signal)).ok,false)
  assert.equal(values.calls.length,2);assert.equal(uploads,1)
})
