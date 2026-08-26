window.__ModuleLoader__.load({id:"@harness-remote/dsh-wechat-remote",factory:(require)=>{var module={exports:{}};var exports=module.exports;"use strict";var q=Object.create;var g=Object.defineProperty;var E=Object.getOwnPropertyDescriptor;var L=Object.getOwnPropertyNames;var B=Object.getPrototypeOf,$=Object.prototype.hasOwnProperty;var J=(e,t)=>()=>(t||e((t={exports:{}}).exports,t),t.exports),M=(e,t)=>{for(var r in t)g(e,r,{get:t[r],enumerable:!0})},k=(e,t,r,p)=>{if(t&&typeof t=="object"||typeof t=="function")for(let c of L(t))!$.call(e,c)&&c!==r&&g(e,c,{get:()=>t[c],enumerable:!(p=E(t,c))||p.enumerable});return e};var Q=(e,t,r)=>(r=e!=null?q(B(e)):{},k(t||!e||!e.__esModule?g(r,"default",{value:e,enumerable:!0}):r,e)),T=e=>k(g({},"__esModule",{value:!0}),e);var S=J((W,R)=>{"use strict";var U=`.07323b1_button {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 8px 10px;
  border: none;
  border-radius: 10px;
  background: transparent;
  color: inherit;
  cursor: pointer;
  font: inherit;
}

.07323b1_button:hover {
  background: var(--dsw-alias-interactive-bg-hover, rgba(128, 140, 160, 0.14));
}

.07323b1_buttonLabel {
  font-size: 13px;
  font-weight: 500;
}

.07323b1_mask {
  position: fixed;
  inset: 0;
  background: var(--dsw-alias-bg-mask-drop, rgba(4, 6, 12, 0.55));
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.07323b1_modal {
  background: var(--dsw-alias-bg-layer-2, #101625);
  border: 1px solid var(--dsw-alias-border-l2, rgba(128, 140, 160, 0.25));
  border-radius: 18px;
  padding: 20px 24px;
  color: var(--dsw-alias-label-primary, #e8ecf4);
  max-width: 92vw;
  text-align: center;
}

.07323b1_head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 6px;
}

.07323b1_head h3 {
  margin: 0;
  font-size: 16px;
  color: var(--dsw-alias-label-primary, #e8ecf4);
}

.07323b1_close {
  border: none;
  background: transparent;
  color: var(--dsw-alias-label-primary, #e8ecf4);
  cursor: pointer;
  font-size: 14px;
  opacity: 0.7;
}

.07323b1_close:hover {
  opacity: 1;
}

.07323b1_hint {
  margin: 0 0 12px;
  font-size: 12px;
  color: var(--dsw-alias-label-secondary, #9aa4b8);
}

.07323b1_agent {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  margin: 0 0 12px;
  min-width: 0;
}

.07323b1_agentName {
  color: var(--dsw-alias-label-primary, #e8ecf4);
  font-size: 13px;
  font-weight: 600;
}

.07323b1_agentHost {
  max-width: 180px;
  overflow: hidden;
  color: var(--dsw-alias-label-secondary, #9aa4b8);
  font-size: 12px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.07323b1_agentHost::before {
  content: '·';
  margin-right: 7px;
}

.07323b1_qr {
  width: 224px;
  height: 224px;
  border-radius: 12px;
  background: #fff;
  padding: 8px;
}

.07323b1_code {
  margin: 8px 0 0;
  display: flex;
  align-items: baseline;
  justify-content: center;
  gap: 8px;
  font-size: 12px;
  color: var(--dsw-alias-label-secondary, #9aa4b8);
}

.07323b1_code code {
  color: var(--dsw-alias-brand-text, #7aa2ff);
  letter-spacing: 2px;
}

.07323b1_code span {
  color: var(--dsw-alias-label-tertiary, #6b7385);
  font-size: 11px;
}

.07323b1_err {
  color: var(--dsw-alias-state-error-primary, #e58f8f);
  font-size: 12px;
}

.07323b1_channels {
  margin-top: 12px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  text-align: left;
}

.07323b1_channel {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12.5px;
}

.07323b1_dotOk {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--dsw-alias-state-success-primary, #3ecf8e);
  flex: none;
}

.07323b1_dotOff {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--dsw-alias-label-tertiary, #6b7385);
  flex: none;
}

.07323b1_channelLabel {
  font-weight: 600;
  flex: 0 0 88px;
  color: var(--dsw-alias-label-primary, #e8ecf4);
}

.07323b1_channelDetail {
  color: var(--dsw-alias-label-secondary, #9aa4b8);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.07323b1_footnote {
  margin: 10px 0 0;
  font-size: 11px;
  color: var(--dsw-alias-label-tertiary, #6b7385);
}
`,D="@harness-remote/dsh-wechat-remote/PairingButton.module.css";if(typeof document<"u"&&document.querySelector("style[data-plugin-css="+JSON.stringify(D)+"]")===null){let e=document.createElement("style");e.dataset.plugin="@harness-remote/dsh-wechat-remote",e.dataset.pluginCss=D,e.textContent=U,document.head.appendChild(e)}R.exports={button:"07323b1_button",buttonLabel:"07323b1_buttonLabel",mask:"07323b1_mask",modal:"07323b1_modal",head:"07323b1_head",close:"07323b1_close",hint:"07323b1_hint",agent:"07323b1_agent",agentName:"07323b1_agentName",agentHost:"07323b1_agentHost",qr:"07323b1_qr",code:"07323b1_code",err:"07323b1_err",channels:"07323b1_channels",channel:"07323b1_channel",dotOk:"07323b1_dotOk",dotOff:"07323b1_dotOff",channelLabel:"07323b1_channelLabel",channelDetail:"07323b1_channelDetail",footnote:"07323b1_footnote"}});var K={};M(K,{apply:()=>F,inject:()=>A});module.exports=T(K);var s=require("react"),a=Q(S(),1),n=require("react/jsx-runtime"),X=(0,n.jsxs)("svg",{width:"18",height:"18",viewBox:"0 0 24 24",fill:"currentColor","aria-hidden":!0,children:[(0,n.jsx)("rect",{x:"3",y:"3",width:"7",height:"7",rx:"1"}),(0,n.jsx)("rect",{x:"14",y:"3",width:"7",height:"7",rx:"1"}),(0,n.jsx)("rect",{x:"3",y:"14",width:"7",height:"7",rx:"1"}),(0,n.jsx)("path",{d:"M14 14h3v3h-3zM17 17h4v4h-4zM14 21h3v-3h-3z"}),(0,n.jsx)("path",{d:"M21 14v3h-3v-3z"})]});function x({label:e,detail:t,ok:r}){return(0,n.jsxs)("div",{className:a.default.channel,children:[(0,n.jsx)("span",{className:r?a.default.dotOk:a.default.dotOff,"aria-hidden":!0}),(0,n.jsx)("span",{className:a.default.channelLabel,children:e}),(0,n.jsx)("span",{className:a.default.channelDetail,children:t})]})}function C({wide:e}){let[t,r]=(0,s.useState)(!1),[p,c]=(0,s.useState)(null),[o,w]=(0,s.useState)(null),[z,h]=(0,s.useState)(null),[v,m]=(0,s.useState)(null),u=(0,s.useRef)(null),y=async()=>{let l="http://127.0.0.1:3093",N=!1;try{let d=`wechat-pairing-${Date.now().toString(36)}`,i=await fetch("/api/wechatHost.describe",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({type:"client-request",rpcId:d,method:"wechatHost.describe",payload:{}})});if(i.ok){let f=await i.json(),b=f.result?.ok===!0?f.result.value?.gate:void 0;if(b&&Number.isSafeInteger(b.localDoor.port)&&(N=!0,h(b),l=`http://127.0.0.1:${b.localDoor.port}`,b.localDoor.state!=="listening")){c(null),w(null),m("连接服务暂未就绪，请稍后重试");return}}}catch{}try{let d=await fetch(`${l}/pair/code`);if(!d.ok)throw new Error(`pair/code ${d.status}`);let i=await d.json();c(i),!N&&i.profileScope&&h(f=>f||{profileScope:i.profileScope||"web",source:"legacy-default",publicDoor:{bind:"0.0.0.0",port:i.port,state:"listening",errorCode:null,message:null},localDoor:{bind:"127.0.0.1",port:i.localPort||3093,state:"listening",errorCode:null,message:null}}),m(null)}catch{c(null),m("暂时无法生成配对码，请确认 DSH 正在运行后重试")}try{let d=await fetch(`${l}/gate/status`);if(d.ok){let i=await d.json();w(i),i.gate&&h(i.gate)}}catch{}};(0,s.useEffect)(()=>{if(t)return y(),u.current=window.setInterval(()=>void y(),3e4),()=>{u.current!==null&&window.clearInterval(u.current),u.current=null}},[t]);let O=z?.publicDoor||o?.gate?.publicDoor,_=o!==null&&o.lan.ip.length>0&&O?.state!=="unavailable",P=o===null?"检测中…":_?"已就绪":"暂不可用",H=(()=>{if(o===null)return"检测中…";let l=o.publicRelay||{enabled:!1,state:"disabled"};return l.enabled?l.state==="online"?"已就绪":l.state==="enrolling"?"正在准备…":l.state==="connecting"?"正在连接…":"暂不可用":"未启用"})(),I=o===null?"检测中…":o.publicRelay?.state==="online"?"已启用":o.publicRelay?.enabled?"等待远程连接":(o.wechat||{configured:!1,bindings:0}).configured?"已启用":"配对凭证保护",G=o?.agent?.agentName||"DeepSeek Harness",j=o?.agent?.hostName||"当前电脑";return(0,n.jsxs)(n.Fragment,{children:[(0,n.jsxs)("button",{type:"button",className:a.default.button,title:"连接 Harness Remote",onClick:()=>r(!0),children:[X,e?(0,n.jsx)("span",{className:a.default.buttonLabel,children:"连接微信"}):null]}),t?(0,n.jsx)("div",{className:a.default.mask,onClick:l=>{l.target===l.currentTarget&&r(!1)},children:(0,n.jsxs)("div",{className:a.default.modal,role:"dialog","aria-modal":!0,children:[(0,n.jsxs)("div",{className:a.default.head,children:[(0,n.jsx)("h3",{children:"添加到 Harness Remote"}),(0,n.jsx)("button",{type:"button",className:a.default.close,onClick:()=>r(!1),"aria-label":"关闭",children:"✕"})]}),(0,n.jsx)("p",{className:a.default.hint,children:"打开微信小程序，进入「添加节点」扫描二维码"}),(0,n.jsxs)("div",{className:a.default.agent,children:[(0,n.jsx)("span",{className:a.default.agentName,children:G}),(0,n.jsx)("span",{className:a.default.agentHost,children:j})]}),p!==null&&v===null?(0,n.jsxs)(n.Fragment,{children:[(0,n.jsx)("img",{className:a.default.qr,src:p.qrDataUrl,alt:"配对二维码"}),(0,n.jsxs)("p",{className:a.default.code,children:["配对码 ",(0,n.jsx)("code",{children:p.code}),(0,n.jsx)("span",{children:"15 分钟内有效"})]})]}):(0,n.jsx)("p",{className:a.default.err,children:v??"加载中…"}),(0,n.jsxs)("div",{className:a.default.channels,children:[(0,n.jsx)(x,{label:"局域网直连",detail:P,ok:_}),(0,n.jsx)(x,{label:"远程访问",detail:H,ok:o!==null&&o.publicRelay?.state==="online"}),(0,n.jsx)(x,{label:"微信账号保护",detail:I,ok:o!==null&&(o.publicRelay?.state==="online"||o.wechat?.configured===!0)})]}),(0,n.jsx)("p",{className:a.default.footnote,children:p?.mode==="public-relay"?"自动选择更快连接；远程内容端到端加密":"当前仅支持同一网络连接"})]})}):null]})}var A=["slots"];function F(e){e.slots.inject("sidebar.footer.action",()=>e.slots.register({name:"sidebar.footer.action",id:"wechat-pairing",order:30},C))}

return module.exports;}});
