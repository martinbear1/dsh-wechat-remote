window.__ModuleLoader__.load({id:"@harness-remote/dsh-wechat-remote",factory:(require)=>{var module={exports:{}};var exports=module.exports;"use strict";var ee=Object.create;var q=Object.defineProperty;var ne=Object.getOwnPropertyDescriptor;var te=Object.getOwnPropertyNames;var re=Object.getPrototypeOf,ae=Object.prototype.hasOwnProperty;var ie=(t,e)=>()=>(e||t((e={exports:{}}).exports,e),e.exports),se=(t,e)=>{for(var r in e)q(t,r,{get:e[r],enumerable:!0})},J=(t,e,r,s)=>{if(e&&typeof e=="object"||typeof e=="function")for(let g of te(e))!ae.call(t,g)&&g!==r&&q(t,g,{get:()=>e[g],enumerable:!(s=ne(e,g))||s.enumerable});return t};var G=(t,e,r)=>(r=t!=null?ee(re(t)):{},J(e||!t||!t.__esModule?q(r,"default",{value:t,enumerable:!0}):r,t)),oe=t=>J(q({},"__esModule",{value:!0}),t);var I=ie((ge,M)=>{"use strict";var le=`.hr_392751c_root {
  box-sizing: border-box;
  width: 100%;
  max-width: 760px;
  color: var(--dsw-alias-label-primary, #171a20);
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.hr_392751c_hero,
.hr_392751c_connectCard,
.hr_392751c_pairingCard {
  border: 1px solid var(--dsw-alias-border-l2, rgba(128, 140, 160, 0.22));
  background: var(--dsw-alias-bg-layer-3, #fff);
  border-radius: 12px;
}

.hr_392751c_hero {
  min-height: 72px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
  padding: 16px 18px;
}

.hr_392751c_identity {
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 12px;
}

.hr_392751c_mark {
  width: 42px;
  height: 42px;
  color: var(--dsw-alias-label-primary, #171a20);
  background: var(--dsw-alias-bg-layer-1, #f5f6f8);
  border: 1px solid var(--dsw-alias-border-l2, rgba(128, 140, 160, 0.22));
  border-radius: 11px;
  flex: none;
  display: grid;
  place-items: center;
}

.hr_392751c_identityCopy {
  min-width: 0;
}

.hr_392751c_identityCopy h3,
.hr_392751c_identityCopy p,
.hr_392751c_connectCard p,
.hr_392751c_pairingHead p,
.hr_392751c_securityNote {
  margin: 0;
}

.hr_392751c_identityCopy h3 {
  font-size: 15px;
  font-weight: 650;
  line-height: 22px;
}

.hr_392751c_identityCopy p {
  color: var(--dsw-alias-label-tertiary, #7d8492);
  font-size: 12px;
  line-height: 18px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.hr_392751c_overall {
  min-height: 28px;
  color: var(--dsw-alias-label-secondary, #4d5564);
  background: var(--dsw-alias-bg-layer-1, #f5f6f8);
  border-radius: 999px;
  flex: none;
  display: inline-flex;
  align-items: center;
  gap: 7px;
  padding: 0 10px;
  font-size: 12px;
}

.hr_392751c_overall[data-ready='true'] {
  color: var(--dsw-alias-state-success-primary, #1f9d68);
}

.hr_392751c_statusDot {
  width: 7px;
  height: 7px;
  background: var(--dsw-alias-label-tertiary, #8b93a2);
  border-radius: 999px;
  flex: none;
}

.hr_392751c_statusDot[data-state='ready'] {
  background: var(--dsw-alias-state-success-primary, #1f9d68);
}

.hr_392751c_statusDot[data-state='busy'] {
  background: var(--dsw-alias-state-business-primary, #4e79ff);
  animation: harnessRemotePulse 1.2s ease-in-out infinite;
}

.hr_392751c_capabilities {
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
  display: grid;
}

.hr_392751c_capability {
  min-width: 0;
  min-height: 58px;
  border: 1px solid var(--dsw-alias-border-l2, rgba(128, 140, 160, 0.22));
  background: var(--dsw-alias-bg-layer-3, #fff);
  border-radius: 10px;
  display: flex;
  align-items: flex-start;
  gap: 9px;
  padding: 11px 12px;
}

.hr_392751c_capability > .hr_392751c_statusDot {
  margin-top: 6px;
}

.hr_392751c_capabilityCopy {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.hr_392751c_capabilityCopy strong {
  font-size: 12.5px;
  font-weight: 600;
  line-height: 19px;
}

.hr_392751c_capabilityCopy span {
  color: var(--dsw-alias-label-tertiary, #7d8492);
  font-size: 11px;
  line-height: 17px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.hr_392751c_notice {
  color: var(--dsw-alias-state-error-primary, #d34e4e);
  background: color-mix(in srgb, var(--dsw-alias-state-error-primary, #d34e4e) 7%, transparent);
  border: 1px solid color-mix(in srgb, var(--dsw-alias-state-error-primary, #d34e4e) 25%, transparent);
  border-radius: 9px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 9px 12px;
  font-size: 12px;
  line-height: 18px;
}

.hr_392751c_notice button,
.hr_392751c_secondaryButton {
  border: 1px solid var(--dsw-alias-border-l2, rgba(128, 140, 160, 0.28));
  color: var(--dsw-alias-label-primary, #171a20);
  background: var(--dsw-alias-bg-layer-1, #f5f6f8);
  border-radius: 7px;
  font: inherit;
  cursor: pointer;
}

.hr_392751c_notice button {
  flex: none;
  padding: 3px 9px;
}

.hr_392751c_connectCard {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
  padding: 18px;
}

.hr_392751c_connectCard strong,
.hr_392751c_pairingHead strong {
  font-size: 14px;
  font-weight: 650;
  line-height: 21px;
}

.hr_392751c_connectCard p,
.hr_392751c_pairingHead p {
  max-width: 470px;
  color: var(--dsw-alias-label-tertiary, #7d8492);
  font-size: 12px;
  line-height: 18px;
}

.hr_392751c_primaryButton {
  min-height: 36px;
  border: 0;
  color: #fff;
  background: var(--dsw-alias-state-business-primary, #4e79ff);
  border-radius: 8px;
  flex: none;
  padding: 0 16px;
  font: inherit;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
}

.hr_392751c_primaryButton:hover {
  filter: brightness(1.04);
}

.hr_392751c_primaryButton:focus-visible,
.hr_392751c_secondaryButton:focus-visible,
.hr_392751c_notice button:focus-visible {
  outline: 2px solid var(--dsw-alias-state-business-primary, #4e79ff);
  outline-offset: 2px;
}

.hr_392751c_pairingCard {
  padding: 18px;
}

.hr_392751c_pairingHead {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}

.hr_392751c_secondaryButton {
  min-height: 32px;
  flex: none;
  padding: 0 11px;
  font-size: 12px;
}

.hr_392751c_secondaryButton:disabled {
  cursor: default;
  opacity: 0.55;
}

.hr_392751c_qrArea {
  min-height: 292px;
  margin-top: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 24px;
}

.hr_392751c_qr,
.hr_392751c_qrPlaceholder {
  box-sizing: border-box;
  width: 280px;
  height: 280px;
  border-radius: 12px;
}

.hr_392751c_qr {
  background: #fff;
  padding: 10px;
  image-rendering: pixelated;
}

.hr_392751c_qrPlaceholder {
  color: var(--dsw-alias-label-tertiary, #7d8492);
  background: var(--dsw-alias-bg-layer-1, #f5f6f8);
  border: 1px dashed var(--dsw-alias-border-l2, rgba(128, 140, 160, 0.28));
  display: grid;
  place-items: center;
  font-size: 12px;
}

.hr_392751c_qrMeta {
  min-width: 150px;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 5px;
}

.hr_392751c_qrMeta span,
.hr_392751c_qrMeta small {
  color: var(--dsw-alias-label-tertiary, #7d8492);
  font-size: 11px;
  line-height: 17px;
}

.hr_392751c_qrMeta code {
  color: var(--dsw-alias-state-business-primary, #4e79ff);
  font-family: var(--ds-font-family-code, ui-monospace, monospace);
  font-size: 16px;
  letter-spacing: 2px;
}

.hr_392751c_securityNote {
  color: var(--dsw-alias-label-tertiary, #7d8492);
  border-top: 1px solid var(--dsw-alias-border-l2, rgba(128, 140, 160, 0.18));
  padding-top: 12px;
  text-align: center;
  font-size: 11px;
  line-height: 17px;
}

@keyframes harnessRemotePulse {
  0%,
  100% {
    opacity: 0.45;
  }
  50% {
    opacity: 1;
  }
}

@media (prefers-reduced-motion: reduce) {
  .hr_392751c_statusDot[data-state='busy'] {
    animation: none;
  }
}

@media (max-width: 680px) {
  .hr_392751c_capabilities {
    grid-template-columns: minmax(0, 1fr);
  }

  .hr_392751c_connectCard {
    align-items: stretch;
    flex-direction: column;
  }

  .hr_392751c_primaryButton {
    width: 100%;
  }

  .hr_392751c_qrArea {
    flex-direction: column;
    gap: 12px;
  }

  .hr_392751c_qrMeta {
    align-items: center;
  }
}
.hr_392751c_updateCard { border: 1px solid var(--border-color, #ddd); border-radius: 12px; padding: 20px; margin-top: 20px; line-height: 1.6; overflow-wrap: anywhere; }
.hr_392751c_updateLabel { color: inherit; }
.hr_392751c_updateLabel[data-severity="required"] { color: #d54052; }
.hr_392751c_updateLabel[data-severity="recommended"], .hr_392751c_updateLabel[data-severity="info"] { color: #b5861d; }
.hr_392751c_updateProgress { width: 100%; height: 12px; margin-top: 16px; accent-color: #7487ef; }
`,O="@harness-remote/dsh-wechat-remote/HarnessRemoteSettings.module.css";if(typeof document<"u"&&document.querySelector("style[data-plugin-css="+JSON.stringify(O)+"]")===null){let t=document.createElement("style");t.dataset.plugin="@harness-remote/dsh-wechat-remote",t.dataset.pluginCss=O,t.textContent=le,document.head.appendChild(t)}M.exports={root:"hr_392751c_root",hero:"hr_392751c_hero",connectCard:"hr_392751c_connectCard",pairingCard:"hr_392751c_pairingCard",identity:"hr_392751c_identity",mark:"hr_392751c_mark",identityCopy:"hr_392751c_identityCopy",pairingHead:"hr_392751c_pairingHead",securityNote:"hr_392751c_securityNote",overall:"hr_392751c_overall",statusDot:"hr_392751c_statusDot",capabilities:"hr_392751c_capabilities",capability:"hr_392751c_capability",capabilityCopy:"hr_392751c_capabilityCopy",notice:"hr_392751c_notice",secondaryButton:"hr_392751c_secondaryButton",primaryButton:"hr_392751c_primaryButton",qrArea:"hr_392751c_qrArea",qr:"hr_392751c_qr",qrPlaceholder:"hr_392751c_qrPlaceholder",qrMeta:"hr_392751c_qrMeta",updateCard:"hr_392751c_updateCard",updateLabel:"hr_392751c_updateLabel",updateProgress:"hr_392751c_updateProgress"}});var pe={};se(pe,{apply:()=>de,inject:()=>ce});module.exports=oe(pe);var d=require("react"),$=require("@deepseek-ai/dsh-client-ui-primitives"),i=G(I(),1);var u=require("react"),x=G(I(),1),a=require("react/jsx-runtime");function T({localOrigin:t}){let[e,r]=(0,u.useState)(null),[s,g]=(0,u.useState)(!1),[p,f]=(0,u.useState)(null),[S,v]=(0,u.useState)(""),[C,k]=(0,u.useState)(null),b=(0,u.useRef)(!0),R=!!(p&&!p.terminal),m=(0,u.useCallback)(async()=>{g(!0),v("");try{let o=await fetch(t+"/gate/update/check"),c=await o.json();if(!o.ok)throw new Error(c.error||"暂时无法检查更新");b.current&&(r(c),c.activeJob?.statusOrigin?(k(c.activeJob),f({phase:"recovering",progress:20,message:"正在恢复更新进度…",terminal:!1})):c.lastResult&&f(c.lastResult))}catch(o){b.current&&v(o instanceof Error?o.message:"更新检查暂不可用")}finally{b.current&&g(!1)}},[t]);(0,u.useEffect)(()=>(b.current=!0,m(),()=>{b.current=!1}),[m]),(0,u.useEffect)(()=>{if(!C||!R)return;let o=!1,c,y=Date.now()+10*6e4,N=async()=>{try{let w=await fetch(C.statusOrigin+"/status",{headers:{Authorization:"Bearer "+C.statusToken},signal:AbortSignal.timeout(4e3)});if(!w.ok)throw new Error("进度暂不可用");let h=await w.json();if(o)return;if(f(h),h.terminal){k(null);return}}catch{if(o)return;try{let h=await(await fetch(t+"/gate/update/status",{signal:AbortSignal.timeout(3e3)})).json();if(!o&&h.lastResult&&(f(h.lastResult),h.lastResult.terminal)){k(null);return}}catch{}if(Date.now()>y){f({phase:"unknown",progress:100,message:"暂时无法确认更新结果。请重新打开此主机 WebUI 检查版本；不要重复安装或删除节点。",terminal:!0});return}}o||(c=window.setTimeout(()=>void N(),1e3))};return N(),()=>{o=!0,window.clearTimeout(c)}},[C,R,t]);let P=async()=>{if(!(!e?.canInstall||R)&&window.confirm(`将连接插件更新至 ${e.advice.targetVersion}。会重启当前 DSH，短暂断开所有连接；请先结束运行中的会话。不会更新 DSH 本体、删除会话或改变配对。是否继续？`)){v(""),f({phase:"download",progress:10,message:"正在下载并验证更新包；当前插件尚未替换",terminal:!1});try{let o=await fetch(t+"/gate/update/start",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({ticket:e.ticket})}),c=await o.json();if(!o.ok||!c.statusOrigin)throw new Error(c.error||"无法取得更新进度，请重新检查");b.current&&k(c)}catch(o){b.current&&f({phase:"failed",progress:100,message:o instanceof Error?o.message:"更新未开始，请重新检查",terminal:!0,ok:!1})}}};return(0,a.jsxs)("div",{className:x.default.updateCard,children:[(0,a.jsxs)("div",{className:x.default.pairingHead,children:[(0,a.jsx)("div",{children:(0,a.jsx)("strong",{children:"插件更新"})}),(0,a.jsx)("button",{type:"button",className:x.default.secondaryButton,disabled:s||R,onClick:()=>void m(),children:s?"检查中…":"检查更新"})]}),e?(0,a.jsxs)(a.Fragment,{children:[e.channel==="preview"?(0,a.jsx)("span",{className:x.default.updateLabel,"data-severity":"recommended",children:"预览通道"}):null,(0,a.jsxs)("p",{children:["DSH ",e.advice.current.agentVersion," · 插件 ",e.advice.current.pluginVersion]}),e.advice.targetVersion?(0,a.jsxs)("p",{children:[e.canInstall?"可更新至":"目标版本"," ",e.advice.targetVersion]}):null,(0,a.jsx)("strong",{className:x.default.updateLabel,"data-severity":e.advice.severity,children:e.advice.label}),!e.canInstall&&e.reason?(0,a.jsxs)("details",{children:[(0,a.jsx)("summary",{children:"查看原因"}),(0,a.jsx)("p",{children:e.reason}),(0,a.jsx)("p",{children:e.advice.message})]}):null,e.canInstall?(0,a.jsx)("button",{type:"button",className:x.default.primaryButton,disabled:R,onClick:()=>void P(),children:"更新并重启"}):null]}):null,S?(0,a.jsx)("p",{role:"alert",children:S}):null,p?(0,a.jsxs)("div",{role:"status","aria-live":"polite",children:[(0,a.jsx)("progress",{className:x.default.updateProgress,max:100,value:p.progress}),(0,a.jsx)("p",{children:p.message}),p.ok?(0,a.jsx)("button",{type:"button",className:x.default.secondaryButton,onClick:()=>window.location.reload(),children:"重新载入 WebUI"}):null]}):null]})}var n=require("react/jsx-runtime"),U="http://127.0.0.1:3093";function Q({ok:t,busy:e=!1}){return(0,n.jsx)("span",{className:i.default.statusDot,"data-state":e?"busy":t?"ready":"off","aria-hidden":!0})}function B({title:t,detail:e,ok:r,busy:s=!1}){return(0,n.jsxs)("div",{className:i.default.capability,children:[(0,n.jsx)(Q,{ok:r,busy:s}),(0,n.jsxs)("div",{className:i.default.capabilityCopy,children:[(0,n.jsx)("strong",{children:t}),(0,n.jsx)("span",{children:e})]})]})}async function V(t){try{let e=await t(),r=e.gate;return!r||!Number.isSafeInteger(r.localDoor.port)?{origin:U,runtime:null,host:e}:{origin:`http://127.0.0.1:${r.localDoor.port}`,runtime:r,host:e}}catch{return{origin:U,runtime:null,host:null}}}function W({describeHost:t}){let[e,r]=(0,d.useState)("loading"),[s,g]=(0,d.useState)("idle"),[p,f]=(0,d.useState)(null),[S,v]=(0,d.useState)(null),[C,k]=(0,d.useState)(null),[b,R]=(0,d.useState)(null),[m,P]=(0,d.useState)(null),[o,c]=(0,d.useState)(null),y=(0,d.useRef)(!0),N=(0,d.useCallback)(async()=>{try{let l=await V(t);if(!y.current)return;if(v(l.runtime),R(l.origin),k(l.host),l.runtime!==null&&l.runtime.localDoor.state!=="listening")throw new Error("local-door-unavailable");let _=await fetch(`${l.origin}/gate/status`);if(!_.ok)throw new Error(`gate/status ${_.status}`);let H=await _.json();if(!y.current)return;f(H),v(H.gate??l.runtime),r("ready"),c(null)}catch{if(!y.current)return;r("error"),c("连接服务暂未就绪。请确认 DSH 正在运行，然后重试。")}},[t]),w=(0,d.useCallback)(async()=>{g("loading"),c(null);try{let l=await V(t);if(!y.current)return;if(v(l.runtime),k(l.host),l.runtime!==null&&l.runtime.localDoor.state!=="listening")throw new Error("local-door-unavailable");let[_,H]=await Promise.all([fetch(`${l.origin}/pair/code`),fetch(`${l.origin}/gate/status`)]);if(!_.ok)throw new Error(`pair/code ${_.status}`);let Z=await _.json();if(!y.current)return;if(P(Z),g("ready"),H.ok){let j=await H.json();f(j),v(j.gate??l.runtime),r("ready")}}catch{if(!y.current)return;P(null),g("error"),c("暂时无法生成配对码，请稍后重试。")}},[t]);(0,d.useEffect)(()=>{y.current=!0,N();let l=window.setInterval(()=>void N(),3e4);return()=>{y.current=!1,window.clearInterval(l)}},[N]),(0,d.useEffect)(()=>{if(s!=="ready"||!m?.expiresAt)return;let l=Math.max(1e3,m.expiresAt-Date.now()-6e4),_=window.setTimeout(()=>void w(),l);return()=>window.clearTimeout(_)},[w,m?.expiresAt,s]);let h=p?.publicRelay,E=h?.state==="enrolling"||h?.state==="connecting",D=h?.remoteAccess?.status,A=h?.state==="online"&&D==="active",X=D==="suspended"?"账户公网访问已暂停":D==="pending"?"体验申请审核中":D==="expired"?"公网访问已到期":D==="not_entitled"?"请在小程序中申请体验":D!=="active"?"配对后由小程序账户决定":A?"可在外网安全连接":E?"正在准备远程连接":"暂时离线",F=S?.localDoor??p?.gate?.localDoor,z=e==="ready"&&!!p?.lan.ip&&F?.state==="listening",L=A||p?.wechat.configured===!0,K=p?.agent?.agentName||C?.agentName||"DeepSeek Harness",Y=p?.agent?.hostName||C?.computerName||"当前电脑";return(0,n.jsxs)("section",{className:i.default.root,"aria-labelledby":"harness-remote-title",children:[(0,n.jsxs)("div",{className:i.default.hero,children:[(0,n.jsxs)("div",{className:i.default.identity,children:[(0,n.jsx)("span",{className:i.default.mark,"aria-hidden":!0,children:(0,n.jsx)($.FishLogo,{size:28})}),(0,n.jsxs)("div",{className:i.default.identityCopy,children:[(0,n.jsx)("h3",{id:"harness-remote-title",children:"Agent远程管理助手"}),(0,n.jsxs)("p",{children:[K,(0,n.jsx)("span",{"aria-hidden":!0,children:" · "}),Y]})]})]}),(0,n.jsxs)("span",{className:i.default.overall,"data-ready":e==="ready",children:[(0,n.jsx)(Q,{ok:e==="ready",busy:e==="loading"}),e==="loading"?"检测中":e==="ready"?"服务正常":"暂不可用"]})]}),(0,n.jsxs)("div",{className:i.default.capabilities,children:[(0,n.jsx)(B,{title:"局域网直连",detail:e==="loading"?"检测中":z?"已就绪":"暂不可用",ok:z,busy:e==="loading"}),(0,n.jsx)(B,{title:"远程访问",detail:X,ok:A,busy:E||e==="loading"}),(0,n.jsx)(B,{title:"微信账号保护",detail:L?"已启用":"配对后启用",ok:L,busy:e==="loading"})]}),o!==null?(0,n.jsxs)("div",{className:i.default.notice,role:"status",children:[(0,n.jsx)("span",{children:o}),(0,n.jsx)("button",{type:"button",onClick:()=>void N(),children:"重试"})]}):null,s==="idle"?(0,n.jsxs)("div",{className:i.default.connectCard,children:[(0,n.jsxs)("div",{children:[(0,n.jsx)("strong",{children:"添加到微信"}),(0,n.jsx)("p",{children:"打开「Agent远程管理助手」→ 添加节点，扫描配对码。"})]}),(0,n.jsx)("button",{type:"button",className:i.default.primaryButton,onClick:()=>void w(),children:"生成配对码"})]}):(0,n.jsxs)("div",{className:i.default.pairingCard,children:[(0,n.jsxs)("div",{className:i.default.pairingHead,children:[(0,n.jsxs)("div",{children:[(0,n.jsx)("strong",{children:"扫描二维码"}),(0,n.jsx)("p",{children:"小程序「设置 → 添加节点」"})]}),(0,n.jsx)("button",{type:"button",className:i.default.secondaryButton,disabled:s==="loading",onClick:()=>void w(),children:s==="loading"?"生成中…":"重新生成"})]}),(0,n.jsxs)("div",{className:i.default.qrArea,children:[s==="ready"&&m!==null?(0,n.jsx)("img",{className:i.default.qr,src:m.qrDataUrl,alt:"Agent远程管理助手配对二维码"}):(0,n.jsx)("div",{className:i.default.qrPlaceholder,"aria-live":"polite",children:s==="error"?"生成失败":"正在生成…"}),s==="ready"&&m!==null?(0,n.jsxs)("div",{className:i.default.qrMeta,children:[(0,n.jsx)("span",{children:"配对码"}),(0,n.jsx)("code",{children:m.code}),(0,n.jsx)("small",{children:"15 分钟内有效"})]}):null]}),(0,n.jsx)("p",{className:i.default.securityNote,children:m?.mode==="public-relay"?"配对后自动选择更快的连接；远程内容端到端加密。":"当前可通过同一局域网连接。"})]}),b?(0,n.jsx)(T,{localOrigin:b}):null]})}var ce=["slots","connection"];function de(t){let e=async()=>{let r=await t.connection.rpc.call("/api","wechatHost/describe",{args:{request:{}}});if(!r.ok)throw new Error(`wechatHost/describe: ${r.error.code}`);let s=r.value;if(s?.ok!==!0||s.value===void 0)throw new Error("wechatHost/describe returned an invalid result");return s.value};t.slots.inject("settings.section",()=>t.slots.register({name:"settings.section",id:"harness-remote",order:30,label:"微信连接",inject:()=>({describeHost:e})},W))}

return module.exports;}});
