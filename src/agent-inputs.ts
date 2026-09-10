import {createHmac,randomBytes,timingSafeEqual} from 'node:crypto'
import type {Context} from '@deepseek-ai/cordis'
import {Remote,TypertRemoteService} from '@deepseek-ai/dsh-typert-protocol'
import {resolveTypertGateway,type TypertGatewayLike} from './dsh-protocol-compat.js'
import {resolveDshSessionAddress} from './dsh-session-address.js'
import type {ResourceResult} from './agent-resources.js'
type Row=Record<string,any>
export interface InputConfig {
  readonly gateway?: TypertGatewayLike
  readonly supported?: boolean
  readonly load?: (descriptor:Row,signal:AbortSignal)=>Promise<Uint8Array>
}
/** Native receipt semantics stay adapter-owned. Clients treat this signed,
 * short-lived, scope-bound token as opaque (it is not a secret or file URL). */
export class AgentInputsService extends TypertRemoteService {
  private secret=randomBytes(32)
  private active=0
  constructor(private host:Context,private config:InputConfig={}){super(host,'agentInputs')}
  private async gateway(scope:string,signal:AbortSignal):Promise<TypertGatewayLike> {
    const gateway=this.config.gateway||resolveTypertGateway(this.host)
    if(!gateway||!(this.config.supported??!!this.host.get('fileUploads')))throw Error('此节点尚不支持文件附件')
    if(typeof scope!=='string'||(await resolveDshSessionAddress(gateway,scope,signal)).kind!=='session')throw Error('此会话暂不支持文件附件')
    return gateway
  }
  private async guarded(fn:()=>Promise<Row>):Promise<ResourceResult>{
    try{return{ok:true,valueJson:JSON.stringify(await fn())}}
    catch(e){return{ok:false,error:{code:'input-unavailable',message:e instanceof Error?e.message:'附件不可用'}}}
  }
  @Remote('capabilities')
  async capabilities(request:{scope:string},signal:AbortSignal):Promise<ResourceResult>{return this.guarded(async()=>{
    await this.gateway(request.scope,signal)
    return{schema:'agent.inputs.v1',files:true,maxBytes:10*1024*1024,maxFiles:6,delivery:['inline',...(this.config.load?['object']:[])]}
  })}
  @Remote('upload')
  async upload(request:{scope:string;name:string;data?:string;descriptorJson?:string},signal:AbortSignal):Promise<ResourceResult>{return this.guarded(async()=>{
    const gateway=await this.gateway(request.scope,signal)
    if(typeof request.name!=='string'||!request.name.trim()||request.name.length>160||/[\\/\x00-\x1f]/.test(request.name))throw Error('附件文件名无效')
    if(this.active>=2)throw Error('正在准备其他附件，请稍后重试')
    this.active++
    try {
      let data:Uint8Array
      if(request.descriptorJson!==undefined){
        if(request.data!==undefined||!this.config.load||request.descriptorJson.length>8192)throw Error('附件传输参数无效')
        const descriptor=JSON.parse(request.descriptorJson)
        if(descriptor.contentKind!=='artifact'||!Number.isSafeInteger(descriptor.plainBytes)||descriptor.plainBytes<1||descriptor.plainBytes>10*1024*1024)throw Error('附件大小无效')
        data=await this.config.load(descriptor,signal)
      }else{
        if(typeof request.data!=='string'||request.data.length>14*1024*1024)throw Error('附件数据无效')
        const bytes=Buffer.from(request.data,'base64')
        if(bytes.toString('base64')!==request.data)throw Error('附件编码无效')
        data=bytes
      }
      if(data.length<1||data.length>10*1024*1024)throw Error('附件需为 10 MB 以内的非空文件')
      signal.throwIfAborted()
      const value=await gateway.invoke({namespace:'fileUploads',method:'upload',args:{agentId:request.scope,request:{data:Buffer.from(data).toString('base64'),name:request.name}},signal}) as Row
      if(typeof value?.receiptId!=='string'||!value.receiptId)throw Error('节点未确认附件保存')
      const encoded=Buffer.from(JSON.stringify({scope:request.scope,receiptId:value.receiptId,expires:Date.now()+30*60_000})).toString('base64url')
      const token=encoded+'.'+createHmac('sha256',this.secret).update(encoded).digest('base64url')
      return{schema:'agent.inputs.v1',token,name:request.name,bytes:data.length}
    }finally{this.active--}
  })}
  resolve(scope:string,token:string):{type:'file';receiptId:string}{
    if(typeof token!=='string'||token.length>4096)throw Error('附件已失效，请重新选择')
    const [encoded,mac,extra]=token.split('.')
    const actual=Buffer.from(mac||'','base64url'),expected=createHmac('sha256',this.secret).update(encoded).digest()
    if(extra||actual.length!==expected.length||!timingSafeEqual(actual,expected))throw Error('附件凭证无效')
    const value=JSON.parse(Buffer.from(encoded,'base64url').toString())
    if(value.scope!==scope||value.expires<Date.now())throw Error('附件不属于此会话或已过期，请重新选择')
    return{type:'file',receiptId:value.receiptId}
  }
}
