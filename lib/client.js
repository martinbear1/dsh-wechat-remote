window.__ModuleLoader__.load({id:"@harness-remote/dsh-wechat-remote",factory:(require)=>{var module={exports:{}};var exports=module.exports;"use strict";var ee=Object.create;var J=Object.defineProperty;var ne=Object.getOwnPropertyDescriptor;var te=Object.getOwnPropertyNames;var re=Object.getPrototypeOf,ae=Object.prototype.hasOwnProperty;var ie=(t,e)=>()=>(e||t((e={exports:{}}).exports,e),e.exports),se=(t,e)=>{for(var a in e)J(t,a,{get:e[a],enumerable:!0})},U=(t,e,a,s)=>{if(e&&typeof e=="object"||typeof e=="function")for(let f of te(e))!ae.call(t,f)&&f!==a&&J(t,f,{get:()=>e[f],enumerable:!(s=ne(e,f))||s.enumerable});return t};var M=(t,e,a)=>(a=t!=null?ee(re(t)):{},U(e||!t||!t.__esModule?J(a,"default",{value:t,enumerable:!0}):a,t)),oe=t=>U(J({},"__esModule",{value:!0}),t);var G=ie((me,$)=>{"use strict";var le=`.hr_862ee12_root {
  box-sizing: border-box;
  width: 100%;
  max-width: 760px;
  color: var(--dsw-alias-label-primary, #171a20);
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.hr_862ee12_hero,
.hr_862ee12_connectCard,
.hr_862ee12_pairingCard {
  border: 1px solid var(--dsw-alias-border-l2, rgba(128, 140, 160, 0.22));
  background: var(--dsw-alias-bg-layer-3, #fff);
  border-radius: 12px;
}

.hr_862ee12_hero {
  min-height: 72px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
  padding: 16px 18px;
}

.hr_862ee12_identity {
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 12px;
}

.hr_862ee12_mark {
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

.hr_862ee12_identityCopy {
  min-width: 0;
}

.hr_862ee12_identityCopy h3,
.hr_862ee12_identityCopy p,
.hr_862ee12_connectCard p,
.hr_862ee12_pairingHead p,
.hr_862ee12_securityNote {
  margin: 0;
}

.hr_862ee12_identityCopy h3 {
  font-size: 15px;
  font-weight: 650;
  line-height: 22px;
}

.hr_862ee12_identityCopy p {
  color: var(--dsw-alias-label-tertiary, #7d8492);
  font-size: 12px;
  line-height: 18px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.hr_862ee12_overall {
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

.hr_862ee12_overall[data-ready='true'] {
  color: var(--dsw-alias-state-success-primary, #1f9d68);
}

.hr_862ee12_statusDot {
  width: 7px;
  height: 7px;
  background: var(--dsw-alias-label-tertiary, #8b93a2);
  border-radius: 999px;
  flex: none;
}

.hr_862ee12_statusDot[data-state='ready'] {
  background: var(--dsw-alias-state-success-primary, #1f9d68);
}

.hr_862ee12_statusDot[data-state='busy'] {
  background: var(--dsw-alias-state-business-primary, #4e79ff);
  animation: harnessRemotePulse 1.2s ease-in-out infinite;
}

.hr_862ee12_capabilities {
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
  display: grid;
}

.hr_862ee12_capability {
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

.hr_862ee12_capability > .hr_862ee12_statusDot {
  margin-top: 6px;
}

.hr_862ee12_capabilityCopy {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.hr_862ee12_capabilityCopy strong {
  font-size: 12.5px;
  font-weight: 600;
  line-height: 19px;
}

.hr_862ee12_capabilityCopy span {
  color: var(--dsw-alias-label-tertiary, #7d8492);
  font-size: 11px;
  line-height: 17px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.hr_862ee12_notice {
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

.hr_862ee12_notice button,
.hr_862ee12_secondaryButton {
  border: 1px solid var(--dsw-alias-border-l2, rgba(128, 140, 160, 0.28));
  color: var(--dsw-alias-label-primary, #171a20);
  background: var(--dsw-alias-bg-layer-1, #f5f6f8);
  border-radius: 7px;
  font: inherit;
  cursor: pointer;
}

.hr_862ee12_notice button {
  flex: none;
  padding: 3px 9px;
}

.hr_862ee12_connectCard {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
  padding: 18px;
}

.hr_862ee12_connectCard strong,
.hr_862ee12_pairingHead strong {
  font-size: 14px;
  font-weight: 650;
  line-height: 21px;
}

.hr_862ee12_connectCard p,
.hr_862ee12_pairingHead p {
  max-width: 470px;
  color: var(--dsw-alias-label-tertiary, #7d8492);
  font-size: 12px;
  line-height: 18px;
}

.hr_862ee12_primaryButton {
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

.hr_862ee12_primaryButton:hover {
  filter: brightness(1.04);
}

.hr_862ee12_primaryButton:focus-visible,
.hr_862ee12_secondaryButton:focus-visible,
.hr_862ee12_notice button:focus-visible {
  outline: 2px solid var(--dsw-alias-state-business-primary, #4e79ff);
  outline-offset: 2px;
}

.hr_862ee12_pairingCard {
  padding: 18px;
}

.hr_862ee12_pairingHead {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}

.hr_862ee12_secondaryButton {
  min-height: 32px;
  flex: none;
  padding: 0 11px;
  font-size: 12px;
}

.hr_862ee12_secondaryButton:disabled {
  cursor: default;
  opacity: 0.55;
}

.hr_862ee12_qrArea {
  min-height: 292px;
  margin-top: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 24px;
}

.hr_862ee12_qr,
.hr_862ee12_qrPlaceholder {
  box-sizing: border-box;
  width: 280px;
  height: 280px;
  border-radius: 12px;
}

.hr_862ee12_qr {
  background: #fff;
  padding: 10px;
  image-rendering: pixelated;
}

.hr_862ee12_qrPlaceholder {
  color: var(--dsw-alias-label-tertiary, #7d8492);
  background: var(--dsw-alias-bg-layer-1, #f5f6f8);
  border: 1px dashed var(--dsw-alias-border-l2, rgba(128, 140, 160, 0.28));
  display: grid;
  place-items: center;
  font-size: 12px;
}

.hr_862ee12_qrMeta {
  min-width: 150px;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 5px;
}

.hr_862ee12_qrMeta span,
.hr_862ee12_qrMeta small {
  color: var(--dsw-alias-label-tertiary, #7d8492);
  font-size: 11px;
  line-height: 17px;
}

.hr_862ee12_qrMeta code {
  color: var(--dsw-alias-state-business-primary, #4e79ff);
  font-family: var(--ds-font-family-code, ui-monospace, monospace);
  font-size: 16px;
  letter-spacing: 2px;
}

.hr_862ee12_securityNote {
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
  .hr_862ee12_statusDot[data-state='busy'] {
    animation: none;
  }
}

@media (max-width: 680px) {
  .hr_862ee12_capabilities {
    grid-template-columns: minmax(0, 1fr);
  }

  .hr_862ee12_connectCard {
    align-items: stretch;
    flex-direction: column;
  }

  .hr_862ee12_primaryButton {
    width: 100%;
  }

  .hr_862ee12_qrArea {
    flex-direction: column;
    gap: 12px;
  }

  .hr_862ee12_qrMeta {
    align-items: center;
  }
}
.hr_862ee12_updateCard { border: 1px solid var(--border-color, #ddd); border-radius: 12px; padding: 20px; margin-top: 20px; line-height: 1.6; overflow-wrap: anywhere; }
.hr_862ee12_updateLabel { color: inherit; }
.hr_862ee12_updateLabel[data-severity="none"] { color: #218b5c; }
.hr_862ee12_updateLabel[data-severity="unknown"] { color: var(--text-secondary, #858b96); }
.hr_862ee12_updateLabel[data-severity="required"] { color: #d54052; }
.hr_862ee12_updateLabel[data-severity="recommended"], .hr_862ee12_updateLabel[data-severity="info"] { color: #b5861d; }
.hr_862ee12_updateProgress { width: 100%; height: 12px; margin-top: 16px; accent-color: #7487ef; }
.hr_862ee12_updateVersions { display: flex; flex-wrap: wrap; gap: 10px 24px; margin: 12px 0; }
.hr_862ee12_updateVersions span { color: var(--text-secondary, #858b96); }
.hr_862ee12_updateVersions strong { color: var(--text-primary, inherit); font-weight: 500; }
.hr_862ee12_updateCommand { display: flex; flex-wrap: wrap; align-items: center; gap: 12px; margin-top: 12px; }
.hr_862ee12_updateCommand code { flex: 1 1 240px; white-space: pre-wrap; overflow-wrap: anywhere; user-select: text; }
.hr_862ee12_updateChecked { display: block; margin-top: 10px; color: var(--text-secondary, #858b96); }
`,O="@harness-remote/dsh-wechat-remote/HarnessRemoteSettings.module.css";if(typeof document<"u"&&document.querySelector("style[data-plugin-css="+JSON.stringify(O)+"]")===null){let t=document.createElement("style");t.dataset.plugin="@harness-remote/dsh-wechat-remote",t.dataset.pluginCss=O,t.textContent=le,document.head.appendChild(t)}$.exports={root:"hr_862ee12_root",hero:"hr_862ee12_hero",connectCard:"hr_862ee12_connectCard",pairingCard:"hr_862ee12_pairingCard",identity:"hr_862ee12_identity",mark:"hr_862ee12_mark",identityCopy:"hr_862ee12_identityCopy",pairingHead:"hr_862ee12_pairingHead",securityNote:"hr_862ee12_securityNote",overall:"hr_862ee12_overall",statusDot:"hr_862ee12_statusDot",capabilities:"hr_862ee12_capabilities",capability:"hr_862ee12_capability",capabilityCopy:"hr_862ee12_capabilityCopy",notice:"hr_862ee12_notice",secondaryButton:"hr_862ee12_secondaryButton",primaryButton:"hr_862ee12_primaryButton",qrArea:"hr_862ee12_qrArea",qr:"hr_862ee12_qr",qrPlaceholder:"hr_862ee12_qrPlaceholder",qrMeta:"hr_862ee12_qrMeta",updateCard:"hr_862ee12_updateCard",updateLabel:"hr_862ee12_updateLabel",updateProgress:"hr_862ee12_updateProgress",updateVersions:"hr_862ee12_updateVersions",updateCommand:"hr_862ee12_updateCommand",updateChecked:"hr_862ee12_updateChecked"}});var pe={};se(pe,{apply:()=>ce,inject:()=>de});module.exports=oe(pe);var p=require("react"),X=require("@deepseek-ai/dsh-client-ui-primitives"),o=M(G(),1);var d=require("react"),h=M(G(),1),r=require("react/jsx-runtime");function Q({localOrigin:t}){let[e,a]=(0,d.useState)(null),[s,f]=(0,d.useState)(!1),[b,x]=(0,d.useState)(null),[A,C]=(0,d.useState)(""),[k,P]=(0,d.useState)(null),[L,j]=(0,d.useState)(!1),[y,E]=(0,d.useState)(null),[z,q]=(0,d.useState)(!1),_=(0,d.useRef)(!1),m=(0,d.useRef)(!0),w=(0,d.useRef)(0),v=!!(b&&!b.terminal),R=(0,d.useCallback)(async()=>{let l=++w.current;f(!0),C(""),j(!1);try{let c=await fetch(t+"/gate/update/check",{signal:AbortSignal.timeout(1e4)}),u=await c.json();if(!c.ok)throw new Error(u.error||"暂时无法检查更新");if(!u.advice?.current||typeof u.advice.label!="string")throw new Error("更新检查返回信息不完整");m.current&&w.current===l&&(a(u),u.activeJob?.statusOrigin?(P(u.activeJob),x({phase:"recovering",progress:20,message:"正在恢复更新进度…",terminal:!1})):u.lastResult&&x(u.lastResult))}catch(c){m.current&&w.current===l&&(a(null),C(c instanceof Error?c.message:"暂时无法检查更新"))}finally{m.current&&w.current===l&&f(!1)}},[t]);(0,d.useEffect)(()=>(m.current=!0,R(),()=>{m.current=!1,w.current++}),[R]),(0,d.useEffect)(()=>{if(!k||!v)return;let l=!1,c,u=Date.now()+10*6e4,H=async()=>{try{let S=await fetch(k.statusOrigin+"/status",{headers:{Authorization:"Bearer "+k.statusToken},signal:AbortSignal.timeout(4e3)});if(!S.ok)throw new Error("进度暂不可用");let g=await S.json();if(l)return;if(x(g),g.terminal){P(null),g.ok&&E(k.jobId),R();return}}catch{if(l)return;try{let g=await(await fetch(t+"/gate/update/status",{signal:AbortSignal.timeout(3e3)})).json();if(!l&&g.lastResult&&(x(g.lastResult),g.lastResult.terminal)){P(null),g.lastResult.ok&&E(k.jobId),R();return}}catch{}if(Date.now()>u){x({phase:"unknown",progress:100,message:"暂时无法确认更新结果。请重新打开此主机 WebUI 检查版本；不要重复安装或删除节点。",terminal:!0});return}}l||(c=window.setTimeout(()=>void H(),1e3))};return H(),()=>{l=!0,window.clearTimeout(c)}},[k,v,t,R]),(0,d.useEffect)(()=>{if(!y)return;let l=!1,c,u=Date.now()+3e4;q(!1);let H=async()=>{try{let S=await fetch(t+"/gate/update/resume?job="+encodeURIComponent(y),{signal:AbortSignal.timeout(3e3)});if(!S.ok)throw new Error("尚未恢复");let g=await S.json();if(!g.url)throw new Error("缺少恢复地址");let i=new URL(g.url);if(i.origin!==window.location.origin||i.pathname!=="/"||i.username||i.password||i.hash)throw new Error("恢复地址不匹配");l||window.location.replace(i.href)}catch{if(l)return;if(Date.now()>=u){q(!0);return}c=window.setTimeout(()=>void H(),1e3)}};return H(),()=>{l=!0,window.clearTimeout(c)}},[y,t]);let D=async()=>{if(!(!e?.canInstall||v||s||A||_.current)){_.current=!0,C(""),x({phase:"download",progress:10,message:"正在下载并验证更新包；当前插件尚未替换",terminal:!1});try{let l=await fetch(t+"/gate/update/start",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({ticket:e.ticket})}),c=await l.json();if(!l.ok||!c.statusOrigin)throw new Error(c.error||"无法取得更新进度，请重新检查");m.current&&P(c)}catch(l){m.current&&x({phase:"failed",progress:100,message:l instanceof Error?l.message:"更新未开始，请重新检查",terminal:!0,ok:!1})}finally{_.current=!1}}},I=async()=>{if(!(!e?.manualCommand||s||v))try{await navigator.clipboard.writeText(e.manualCommand),m.current&&j(!0)}catch{m.current&&C("复制失败，请手动选中下方命令复制。")}};return(0,r.jsxs)("div",{className:h.default.updateCard,children:[(0,r.jsxs)("div",{className:h.default.pairingHead,children:[(0,r.jsx)("div",{children:(0,r.jsx)("strong",{children:"插件更新"})}),(0,r.jsx)("button",{type:"button",className:h.default.secondaryButton,disabled:s||v,onClick:()=>void R(),children:s?"检查中…":"检查更新"})]}),e?(0,r.jsxs)(r.Fragment,{children:[e.channel==="preview"?(0,r.jsx)("span",{className:h.default.updateLabel,"data-severity":"recommended",children:"预览通道"}):null,(0,r.jsxs)("div",{className:h.default.updateVersions,children:[(0,r.jsxs)("span",{children:["DSH ",(0,r.jsx)("strong",{children:e.advice.current.agentVersion||"未知"})]}),(0,r.jsxs)("span",{children:["插件 ",(0,r.jsx)("strong",{children:e.advice.current.pluginVersion||"未知"})]})]}),s?null:(0,r.jsxs)(r.Fragment,{children:[(0,r.jsx)("strong",{className:h.default.updateLabel,"data-severity":e.advice.severity,role:"status",children:e.advice.label}),e.advice.targetVersion?(0,r.jsxs)("p",{children:["可更新至 ",e.advice.targetVersion,e.mode==="manual"?" · 需手动更新":""]}):null,e.advice.severity==="unknown"||e.advice.severity==="required"||e.mode==="manual"||e.mode==="busy"?(0,r.jsxs)("details",{children:[(0,r.jsx)("summary",{children:e.mode==="manual"?"手动更新说明":"查看说明"}),e.reason?(0,r.jsx)("p",{children:e.reason}):null,(0,r.jsx)("p",{children:e.advice.message})]}):null,e.mode==="manual"&&e.manualCommand?(0,r.jsxs)("div",{className:h.default.updateCommand,children:[(0,r.jsx)("code",{children:e.manualCommand}),(0,r.jsx)("button",{type:"button",className:h.default.secondaryButton,disabled:v,onClick:()=>void I(),children:L?"已复制":"复制命令"})]}):null,e.canInstall?(0,r.jsxs)(r.Fragment,{children:[(0,r.jsx)("button",{type:"button",className:h.default.primaryButton,disabled:v||!!A,onClick:()=>void D(),children:"更新并重启"}),(0,r.jsx)("small",{className:h.default.updateChecked,children:"会短暂断开连接，保留原配对和会话"})]}):null,e.advice.checkedAt&&e.advice.severity!=="unknown"?(0,r.jsxs)("small",{className:h.default.updateChecked,children:["最近检查 ",new Date(e.advice.checkedAt).toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"})]}):null]})]}):null,A?(0,r.jsx)("p",{role:"alert",children:A}):null,b?(0,r.jsxs)("div",{role:"status","aria-live":"polite",children:[(0,r.jsx)("progress",{className:h.default.updateProgress,max:100,value:b.progress}),(0,r.jsx)("p",{children:b.message}),z?(0,r.jsx)("p",{role:"alert",children:"插件已完成更新，但未能自动打开 WebUI。请使用 DSH 启动时显示的地址打开，无需重复更新。"}):null]}):null]})}var n=require("react/jsx-runtime"),F="http://127.0.0.1:3093";function K({ok:t,busy:e=!1}){return(0,n.jsx)("span",{className:o.default.statusDot,"data-state":e?"busy":t?"ready":"off","aria-hidden":!0})}function V({title:t,detail:e,ok:a,busy:s=!1}){return(0,n.jsxs)("div",{className:o.default.capability,children:[(0,n.jsx)(K,{ok:a,busy:s}),(0,n.jsxs)("div",{className:o.default.capabilityCopy,children:[(0,n.jsx)("strong",{children:t}),(0,n.jsx)("span",{children:e})]})]})}async function W(t){try{let e=await t(),a=e.gate;return!a||!Number.isSafeInteger(a.localDoor.port)?{origin:F,runtime:null,host:e}:{origin:`http://127.0.0.1:${a.localDoor.port}`,runtime:a,host:e}}catch{return{origin:F,runtime:null,host:null}}}function Y({describeHost:t}){let[e,a]=(0,p.useState)("loading"),[s,f]=(0,p.useState)("idle"),[b,x]=(0,p.useState)(null),[A,C]=(0,p.useState)(null),[k,P]=(0,p.useState)(null),[L,j]=(0,p.useState)(null),[y,E]=(0,p.useState)(null),[z,q]=(0,p.useState)(null),_=(0,p.useRef)(!0),m=(0,p.useCallback)(async()=>{try{let i=await W(t);if(!_.current)return;if(C(i.runtime),j(i.origin),P(i.host),i.runtime!==null&&i.runtime.localDoor.state!=="listening")throw new Error("local-door-unavailable");let N=await fetch(`${i.origin}/gate/status`);if(!N.ok)throw new Error(`gate/status ${N.status}`);let B=await N.json();if(!_.current)return;x(B),C(B.gate??i.runtime),a("ready"),q(null)}catch{if(!_.current)return;a("error"),q("连接服务暂未就绪。请确认 DSH 正在运行，然后重试。")}},[t]),w=(0,p.useCallback)(async()=>{f("loading"),q(null);try{let i=await W(t);if(!_.current)return;if(C(i.runtime),P(i.host),i.runtime!==null&&i.runtime.localDoor.state!=="listening")throw new Error("local-door-unavailable");let[N,B]=await Promise.all([fetch(`${i.origin}/pair/code`),fetch(`${i.origin}/gate/status`)]);if(!N.ok)throw new Error(`pair/code ${N.status}`);let Z=await N.json();if(!_.current)return;if(E(Z),f("ready"),B.ok){let T=await B.json();x(T),C(T.gate??i.runtime),a("ready")}}catch{if(!_.current)return;E(null),f("error"),q("暂时无法生成配对码，请稍后重试。")}},[t]);(0,p.useEffect)(()=>{_.current=!0,m();let i=window.setInterval(()=>void m(),3e4);return()=>{_.current=!1,window.clearInterval(i)}},[m]),(0,p.useEffect)(()=>{if(s!=="ready"||!y?.expiresAt)return;let i=Math.max(1e3,y.expiresAt-Date.now()-6e4),N=window.setTimeout(()=>void w(),i);return()=>window.clearTimeout(N)},[w,y?.expiresAt,s]);let v=b?.publicRelay,R=v?.state==="enrolling"||v?.state==="connecting",D=v?.remoteAccess?.status,I=v?.state==="online"&&D==="active",l=D==="suspended"?"账户公网访问已暂停":D==="pending"?"体验申请审核中":D==="expired"?"公网访问已到期":D==="not_entitled"?"请在小程序中申请体验":D!=="active"?"配对后由小程序账户决定":I?"可在外网安全连接":R?"正在准备远程连接":"暂时离线",c=A?.localDoor??b?.gate?.localDoor,u=e==="ready"&&!!b?.lan.ip&&c?.state==="listening",H=I||b?.wechat.configured===!0,S=b?.agent?.agentName||k?.agentName||"DeepSeek Harness",g=b?.agent?.hostName||k?.computerName||"当前电脑";return(0,n.jsxs)("section",{className:o.default.root,"aria-labelledby":"harness-remote-title",children:[(0,n.jsxs)("div",{className:o.default.hero,children:[(0,n.jsxs)("div",{className:o.default.identity,children:[(0,n.jsx)("span",{className:o.default.mark,"aria-hidden":!0,children:(0,n.jsx)(X.FishLogo,{size:28})}),(0,n.jsxs)("div",{className:o.default.identityCopy,children:[(0,n.jsx)("h3",{id:"harness-remote-title",children:"Agent远程管理助手"}),(0,n.jsxs)("p",{children:[S,(0,n.jsx)("span",{"aria-hidden":!0,children:" · "}),g]})]})]}),(0,n.jsxs)("span",{className:o.default.overall,"data-ready":e==="ready",children:[(0,n.jsx)(K,{ok:e==="ready",busy:e==="loading"}),e==="loading"?"检测中":e==="ready"?"服务正常":"暂不可用"]})]}),(0,n.jsxs)("div",{className:o.default.capabilities,children:[(0,n.jsx)(V,{title:"局域网直连",detail:e==="loading"?"检测中":u?"已就绪":"暂不可用",ok:u,busy:e==="loading"}),(0,n.jsx)(V,{title:"远程访问",detail:l,ok:I,busy:R||e==="loading"}),(0,n.jsx)(V,{title:"微信账号保护",detail:H?"已启用":"配对后启用",ok:H,busy:e==="loading"})]}),z!==null?(0,n.jsxs)("div",{className:o.default.notice,role:"status",children:[(0,n.jsx)("span",{children:z}),(0,n.jsx)("button",{type:"button",onClick:()=>void m(),children:"重试"})]}):null,s==="idle"?(0,n.jsxs)("div",{className:o.default.connectCard,children:[(0,n.jsxs)("div",{children:[(0,n.jsx)("strong",{children:"添加到微信"}),(0,n.jsx)("p",{children:"打开「Agent远程管理助手」→ 添加节点，扫描配对码。"})]}),(0,n.jsx)("button",{type:"button",className:o.default.primaryButton,onClick:()=>void w(),children:"生成配对码"})]}):(0,n.jsxs)("div",{className:o.default.pairingCard,children:[(0,n.jsxs)("div",{className:o.default.pairingHead,children:[(0,n.jsxs)("div",{children:[(0,n.jsx)("strong",{children:"扫描二维码"}),(0,n.jsx)("p",{children:"小程序「设置 → 添加节点」"})]}),(0,n.jsx)("button",{type:"button",className:o.default.secondaryButton,disabled:s==="loading",onClick:()=>void w(),children:s==="loading"?"生成中…":"重新生成"})]}),(0,n.jsxs)("div",{className:o.default.qrArea,children:[s==="ready"&&y!==null?(0,n.jsx)("img",{className:o.default.qr,src:y.qrDataUrl,alt:"Agent远程管理助手配对二维码"}):(0,n.jsx)("div",{className:o.default.qrPlaceholder,"aria-live":"polite",children:s==="error"?"生成失败":"正在生成…"}),s==="ready"&&y!==null?(0,n.jsxs)("div",{className:o.default.qrMeta,children:[(0,n.jsx)("span",{children:"配对码"}),(0,n.jsx)("code",{children:y.code}),(0,n.jsx)("small",{children:"15 分钟内有效"})]}):null]}),(0,n.jsx)("p",{className:o.default.securityNote,children:y?.mode==="public-relay"?"配对后自动选择更快的连接；远程内容端到端加密。":"当前可通过同一局域网连接。"})]}),L?(0,n.jsx)(Q,{localOrigin:L}):null]})}var de=["slots","connection"];function ce(t){let e=async()=>{let a=await t.connection.rpc.call("/api","wechatHost/describe",{args:{request:{}}});if(!a.ok)throw new Error(`wechatHost/describe: ${a.error.code}`);let s=a.value;if(s?.ok!==!0||s.value===void 0)throw new Error("wechatHost/describe returned an invalid result");return s.value};t.slots.inject("settings.section",()=>t.slots.register({name:"settings.section",id:"harness-remote",order:30,label:"微信连接",inject:()=>({describeHost:e})},Y))}

return module.exports;}});
