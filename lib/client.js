window.__ModuleLoader__.load({id:"@harness-remote/dsh-wechat-remote",factory:(require)=>{var module={exports:{}};var exports=module.exports;"use strict";var Y=Object.create;var L=Object.defineProperty;var Z=Object.getOwnPropertyDescriptor;var ee=Object.getOwnPropertyNames;var re=Object.getPrototypeOf,ne=Object.prototype.hasOwnProperty;var te=(r,e)=>()=>(e||r((e={exports:{}}).exports,e),e.exports),ae=(r,e)=>{for(var s in e)L(r,s,{get:e[s],enumerable:!0})},O=(r,e,s,o)=>{if(e&&typeof e=="object"||typeof e=="function")for(let a of ee(e))!ne.call(r,a)&&a!==s&&L(r,a,{get:()=>e[a],enumerable:!(o=Z(e,a))||o.enumerable});return r};var Q=(r,e,s)=>(s=r!=null?Y(re(r)):{},O(e||!r||!r.__esModule?L(s,"default",{value:r,enumerable:!0}):s,r)),se=r=>O(L({},"__esModule",{value:!0}),r);var G=te((pe,X)=>{"use strict";var ie=`.hr_4eed469_root {\r
  box-sizing: border-box;\r
  width: 100%;\r
  max-width: 760px;\r
  color: var(--dsw-alias-label-primary, #171a20);\r
  display: flex;\r
  flex-direction: column;\r
  gap: 14px;\r
}\r
\r
.hr_4eed469_hero,\r
.hr_4eed469_connectCard,\r
.hr_4eed469_pairingCard {\r
  border: 1px solid var(--dsw-alias-border-l2, rgba(128, 140, 160, 0.22));\r
  background: var(--dsw-alias-bg-layer-3, #fff);\r
  border-radius: 12px;\r
}\r
\r
.hr_4eed469_hero {\r
  min-height: 72px;\r
  display: flex;\r
  align-items: center;\r
  justify-content: space-between;\r
  gap: 20px;\r
  padding: 16px 18px;\r
}\r
\r
.hr_4eed469_identity {\r
  min-width: 0;\r
  display: flex;\r
  align-items: center;\r
  gap: 12px;\r
}\r
\r
.hr_4eed469_mark {\r
  width: 42px;\r
  height: 42px;\r
  color: var(--dsw-alias-label-primary, #171a20);\r
  background: var(--dsw-alias-bg-layer-1, #f5f6f8);\r
  border: 1px solid var(--dsw-alias-border-l2, rgba(128, 140, 160, 0.22));\r
  border-radius: 11px;\r
  flex: none;\r
  display: grid;\r
  place-items: center;\r
}\r
\r
.hr_4eed469_identityCopy {\r
  min-width: 0;\r
}\r
\r
.hr_4eed469_identityCopy h3,\r
.hr_4eed469_identityCopy p,\r
.hr_4eed469_connectCard p,\r
.hr_4eed469_pairingHead p,\r
.hr_4eed469_securityNote {\r
  margin: 0;\r
}\r
\r
.hr_4eed469_identityCopy h3 {\r
  font-size: 15px;\r
  font-weight: 650;\r
  line-height: 22px;\r
}\r
\r
.hr_4eed469_identityCopy p {\r
  color: var(--dsw-alias-label-tertiary, #7d8492);\r
  font-size: 12px;\r
  line-height: 18px;\r
  overflow: hidden;\r
  text-overflow: ellipsis;\r
  white-space: nowrap;\r
}\r
\r
.hr_4eed469_overall {\r
  min-height: 28px;\r
  color: var(--dsw-alias-label-secondary, #4d5564);\r
  background: var(--dsw-alias-bg-layer-1, #f5f6f8);\r
  border-radius: 999px;\r
  flex: none;\r
  display: inline-flex;\r
  align-items: center;\r
  gap: 7px;\r
  padding: 0 10px;\r
  font-size: 12px;\r
}\r
\r
.hr_4eed469_overall[data-ready='true'] {\r
  color: var(--dsw-alias-state-success-primary, #1f9d68);\r
}\r
\r
.hr_4eed469_statusDot {\r
  width: 7px;\r
  height: 7px;\r
  background: var(--dsw-alias-label-tertiary, #8b93a2);\r
  border-radius: 999px;\r
  flex: none;\r
}\r
\r
.hr_4eed469_statusDot[data-state='ready'] {\r
  background: var(--dsw-alias-state-success-primary, #1f9d68);\r
}\r
\r
.hr_4eed469_statusDot[data-state='busy'] {\r
  background: var(--dsw-alias-state-business-primary, #4e79ff);\r
  animation: harnessRemotePulse 1.2s ease-in-out infinite;\r
}\r
\r
.hr_4eed469_capabilities {\r
  grid-template-columns: repeat(3, minmax(0, 1fr));\r
  gap: 10px;\r
  display: grid;\r
}\r
\r
.hr_4eed469_capability {\r
  min-width: 0;\r
  min-height: 58px;\r
  border: 1px solid var(--dsw-alias-border-l2, rgba(128, 140, 160, 0.22));\r
  background: var(--dsw-alias-bg-layer-3, #fff);\r
  border-radius: 10px;\r
  display: flex;\r
  align-items: flex-start;\r
  gap: 9px;\r
  padding: 11px 12px;\r
}\r
\r
.hr_4eed469_capability > .hr_4eed469_statusDot {\r
  margin-top: 6px;\r
}\r
\r
.hr_4eed469_capabilityCopy {\r
  min-width: 0;\r
  display: flex;\r
  flex-direction: column;\r
  gap: 1px;\r
}\r
\r
.hr_4eed469_capabilityCopy strong {\r
  font-size: 12.5px;\r
  font-weight: 600;\r
  line-height: 19px;\r
}\r
\r
.hr_4eed469_capabilityCopy span {\r
  color: var(--dsw-alias-label-tertiary, #7d8492);\r
  font-size: 11px;\r
  line-height: 17px;\r
  overflow: hidden;\r
  text-overflow: ellipsis;\r
  white-space: nowrap;\r
}\r
\r
.hr_4eed469_notice {\r
  color: var(--dsw-alias-state-error-primary, #d34e4e);\r
  background: color-mix(in srgb, var(--dsw-alias-state-error-primary, #d34e4e) 7%, transparent);\r
  border: 1px solid color-mix(in srgb, var(--dsw-alias-state-error-primary, #d34e4e) 25%, transparent);\r
  border-radius: 9px;\r
  display: flex;\r
  align-items: center;\r
  justify-content: space-between;\r
  gap: 12px;\r
  padding: 9px 12px;\r
  font-size: 12px;\r
  line-height: 18px;\r
}\r
\r
.hr_4eed469_notice button,\r
.hr_4eed469_secondaryButton {\r
  border: 1px solid var(--dsw-alias-border-l2, rgba(128, 140, 160, 0.28));\r
  color: var(--dsw-alias-label-primary, #171a20);\r
  background: var(--dsw-alias-bg-layer-1, #f5f6f8);\r
  border-radius: 7px;\r
  font: inherit;\r
  cursor: pointer;\r
}\r
\r
.hr_4eed469_notice button {\r
  flex: none;\r
  padding: 3px 9px;\r
}\r
\r
.hr_4eed469_connectCard {\r
  display: flex;\r
  align-items: center;\r
  justify-content: space-between;\r
  gap: 20px;\r
  padding: 18px;\r
}\r
\r
.hr_4eed469_connectCard strong,\r
.hr_4eed469_pairingHead strong {\r
  font-size: 14px;\r
  font-weight: 650;\r
  line-height: 21px;\r
}\r
\r
.hr_4eed469_connectCard p,\r
.hr_4eed469_pairingHead p {\r
  max-width: 470px;\r
  color: var(--dsw-alias-label-tertiary, #7d8492);\r
  font-size: 12px;\r
  line-height: 18px;\r
}\r
\r
.hr_4eed469_primaryButton {\r
  min-height: 36px;\r
  border: 0;\r
  color: #fff;\r
  background: var(--dsw-alias-state-business-primary, #4e79ff);\r
  border-radius: 8px;\r
  flex: none;\r
  padding: 0 16px;\r
  font: inherit;\r
  font-size: 13px;\r
  font-weight: 600;\r
  cursor: pointer;\r
}\r
\r
.hr_4eed469_primaryButton:hover {\r
  filter: brightness(1.04);\r
}\r
\r
.hr_4eed469_primaryButton:focus-visible,\r
.hr_4eed469_secondaryButton:focus-visible,\r
.hr_4eed469_notice button:focus-visible {\r
  outline: 2px solid var(--dsw-alias-state-business-primary, #4e79ff);\r
  outline-offset: 2px;\r
}\r
\r
.hr_4eed469_pairingCard {\r
  padding: 18px;\r
}\r
\r
.hr_4eed469_pairingHead {\r
  display: flex;\r
  align-items: center;\r
  justify-content: space-between;\r
  gap: 16px;\r
}\r
\r
.hr_4eed469_secondaryButton {\r
  min-height: 32px;\r
  flex: none;\r
  padding: 0 11px;\r
  font-size: 12px;\r
}\r
\r
.hr_4eed469_secondaryButton:disabled {\r
  cursor: default;\r
  opacity: 0.55;\r
}\r
\r
.hr_4eed469_qrArea {\r
  min-height: 292px;\r
  margin-top: 16px;\r
  display: flex;\r
  flex-direction: column;\r
  align-items: center;\r
  justify-content: center;\r
  gap: 10px;\r
}\r
\r
.hr_4eed469_qr,\r
.hr_4eed469_qrPlaceholder {\r
  box-sizing: border-box;\r
  width: 280px;\r
  height: 280px;\r
  border-radius: 12px;\r
}\r
\r
.hr_4eed469_qr {\r
  background: #fff;\r
  padding: 10px;\r
  image-rendering: pixelated;\r
}\r
\r
.hr_4eed469_qrPlaceholder {\r
  color: var(--dsw-alias-label-tertiary, #7d8492);\r
  background: var(--dsw-alias-bg-layer-1, #f5f6f8);\r
  border: 1px dashed var(--dsw-alias-border-l2, rgba(128, 140, 160, 0.28));\r
  display: grid;\r
  place-items: center;\r
  font-size: 12px;\r
}\r
\r
.hr_4eed469_qrValidity {\r
  color: var(--dsw-alias-label-tertiary, #7d8492);\r
  font-size: 11px;\r
  line-height: 17px;\r
}\r
\r
.hr_4eed469_securityNote {\r
  color: var(--dsw-alias-label-tertiary, #7d8492);\r
  border-top: 1px solid var(--dsw-alias-border-l2, rgba(128, 140, 160, 0.18));\r
  padding-top: 12px;\r
  text-align: center;\r
  font-size: 11px;\r
  line-height: 17px;\r
}\r
\r
@keyframes harnessRemotePulse {\r
  0%,\r
  100% {\r
    opacity: 0.45;\r
  }\r
  50% {\r
    opacity: 1;\r
  }\r
}\r
\r
@media (prefers-reduced-motion: reduce) {\r
  .hr_4eed469_statusDot[data-state='busy'] {\r
    animation: none;\r
  }\r
}\r
\r
@media (max-width: 680px) {\r
  .hr_4eed469_capabilities {\r
    grid-template-columns: minmax(0, 1fr);\r
  }\r
\r
  .hr_4eed469_connectCard {\r
    align-items: stretch;\r
    flex-direction: column;\r
  }\r
\r
  .hr_4eed469_primaryButton {\r
    width: 100%;\r
  }\r
\r
  .hr_4eed469_qrArea {\r
    flex-direction: column;\r
    gap: 12px;\r
  }\r
\r
}\r
.hr_4eed469_updateCard { border: 1px solid var(--border-color, #ddd); border-radius: 12px; padding: 20px; margin-top: 20px; line-height: 1.6; overflow-wrap: anywhere; }\r
.hr_4eed469_updateLabel { color: inherit; }\r
.hr_4eed469_updateLabel[data-severity="none"] { color: #218b5c; }\r
.hr_4eed469_updateLabel[data-severity="unknown"] { color: var(--text-secondary, #858b96); }\r
.hr_4eed469_updateLabel[data-severity="required"] { color: #d54052; }\r
.hr_4eed469_updateLabel[data-severity="recommended"], .hr_4eed469_updateLabel[data-severity="info"] { color: #b5861d; }\r
.hr_4eed469_updateProgress { width: 100%; height: 12px; margin-top: 16px; accent-color: #7487ef; }\r
.hr_4eed469_updateVersions { display: flex; flex-wrap: wrap; gap: 10px 24px; margin: 12px 0; }\r
.hr_4eed469_updateVersions span { color: var(--text-secondary, #858b96); }\r
.hr_4eed469_updateVersions strong { color: var(--text-primary, inherit); font-weight: 500; }\r
.hr_4eed469_updateCommand { display: flex; flex-wrap: wrap; align-items: center; gap: 12px; margin-top: 12px; }\r
.hr_4eed469_updateCommand code { flex: 1 1 240px; white-space: pre-wrap; overflow-wrap: anywhere; user-select: text; }\r
.hr_4eed469_updateChecked { display: block; margin-top: 10px; color: var(--text-secondary, #858b96); }\r
`,W="@harness-remote/dsh-wechat-remote/HarnessRemoteSettings.module.css";if(typeof document<"u"&&document.querySelector("style[data-plugin-css="+JSON.stringify(W)+"]")===null){let r=document.createElement("style");r.dataset.plugin="@harness-remote/dsh-wechat-remote",r.dataset.pluginCss=W,r.textContent=ie,document.head.appendChild(r)}X.exports={root:"hr_4eed469_root",hero:"hr_4eed469_hero",connectCard:"hr_4eed469_connectCard",pairingCard:"hr_4eed469_pairingCard",identity:"hr_4eed469_identity",mark:"hr_4eed469_mark",identityCopy:"hr_4eed469_identityCopy",pairingHead:"hr_4eed469_pairingHead",securityNote:"hr_4eed469_securityNote",overall:"hr_4eed469_overall",statusDot:"hr_4eed469_statusDot",capabilities:"hr_4eed469_capabilities",capability:"hr_4eed469_capability",capabilityCopy:"hr_4eed469_capabilityCopy",notice:"hr_4eed469_notice",secondaryButton:"hr_4eed469_secondaryButton",primaryButton:"hr_4eed469_primaryButton",qrArea:"hr_4eed469_qrArea",qr:"hr_4eed469_qr",qrPlaceholder:"hr_4eed469_qrPlaceholder",qrValidity:"hr_4eed469_qrValidity",updateCard:"hr_4eed469_updateCard",updateLabel:"hr_4eed469_updateLabel",updateProgress:"hr_4eed469_updateProgress",updateVersions:"hr_4eed469_updateVersions",updateCommand:"hr_4eed469_updateCommand",updateChecked:"hr_4eed469_updateChecked"}});var de={};ae(de,{apply:()=>le,inject:()=>oe});module.exports=se(de);var g=require("react"),M=require("@deepseek-ai/dsh-client-ui-primitives"),l=Q(G(),1);var m=require("react"),v=Q(G(),1),t=require("react/jsx-runtime");function F({localOrigin:r}){let[e,s]=(0,m.useState)(null),[o,a]=(0,m.useState)(!1),[f,d]=(0,m.useState)(null),[x,N]=(0,m.useState)(""),[y,w]=(0,m.useState)(null),[j,E]=(0,m.useState)(!1),[I,R]=(0,m.useState)(null),[J,B]=(0,m.useState)(!1),D=(0,m.useRef)(!1),c=(0,m.useRef)(!0),S=(0,m.useRef)(0),C=!!(f&&!f.terminal),b=(0,m.useCallback)(async()=>{let u=++S.current;a(!0),N(""),E(!1);try{let p=await fetch(r+"/gate/update/check",{signal:AbortSignal.timeout(1e4)}),i=await p.json();if(!p.ok)throw new Error(i.error||"暂时无法检查更新");if(!i.advice?.current||typeof i.advice.label!="string")throw new Error("更新检查返回信息不完整");c.current&&S.current===u&&(s(i),i.activeJob?.statusOrigin?(w(i.activeJob),d({phase:"recovering",progress:20,message:"正在恢复更新进度…",terminal:!1})):i.mode==="busy"?d({phase:"preparing",progress:0,message:"更新仍在准备或等待确认，请稍后重新检查；不要重复安装。",terminal:!0}):i.lastResult&&d(i.lastResult))}catch(p){c.current&&S.current===u&&(s(null),N(p instanceof Error?p.message:"暂时无法检查更新"))}finally{c.current&&S.current===u&&a(!1)}},[r]);(0,m.useEffect)(()=>(c.current=!0,b(),()=>{c.current=!1,S.current++}),[b]),(0,m.useEffect)(()=>{if(!y||!C)return;let u=!1,p,i=Date.now()+10*6e4,k=async()=>{try{let H=await fetch(y.statusOrigin+"/status",{headers:{Authorization:"Bearer "+y.statusToken},signal:AbortSignal.timeout(4e3)});if(!H.ok)throw new Error("进度暂不可用");let _=await H.json();if(u)return;if(d(_),_.terminal){w(null),_.ok&&R(y.jobId),b();return}}catch{if(u)return;try{let _=await(await fetch(r+"/gate/update/status",{signal:AbortSignal.timeout(3e3)})).json();if(!u&&_.lastResult&&(d(_.lastResult),_.lastResult.terminal)){w(null),_.lastResult.ok&&R(y.jobId),b();return}}catch{}if(Date.now()>i){d({phase:"unknown",progress:0,message:"暂时无法确认更新结果。请重新打开此主机 WebUI 检查版本；不要重复安装或删除节点。",terminal:!0});return}}u||(p=window.setTimeout(()=>void k(),1e3))};return k(),()=>{u=!0,window.clearTimeout(p)}},[y,C,r,b]),(0,m.useEffect)(()=>{if(!I)return;let u=!1,p,i=Date.now()+3e4;B(!1);let k=async()=>{try{let H=await fetch(r+"/gate/update/resume?job="+encodeURIComponent(I),{signal:AbortSignal.timeout(3e3)});if(!H.ok)throw new Error("尚未恢复");let _=await H.json();if(!_.url)throw new Error("缺少恢复地址");let P=new URL(_.url);if(P.origin!==window.location.origin||P.pathname!=="/"||P.username||P.password||P.hash)throw new Error("恢复地址不匹配");u||window.location.replace(P.href)}catch{if(u)return;if(Date.now()>=i){B(!0);return}p=window.setTimeout(()=>void k(),1e3)}};return k(),()=>{u=!0,window.clearTimeout(p)}},[I,r]);let z=async()=>{if(!e?.canInstall||C||o||x||D.current)return;D.current=!0,N(""),d({phase:"download",progress:10,message:"正在下载并验证更新包；当前插件尚未替换",terminal:!1});let u=!1;try{let p=await fetch(r+"/gate/update/start",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({ticket:e.ticket})}),i=await p.json();if(u=!p.ok&&typeof i.error=="string",!p.ok||!i.statusOrigin)throw new Error(i.error||"无法取得更新进度，请重新检查");c.current&&w(i)}catch(p){if(!c.current)return;if(s(i=>i&&{...i,canInstall:!1,ticket:""}),u)d({phase:"failed",progress:0,message:(p instanceof Error?p.message:"更新暂不可用")+"。请重新检查更新。",terminal:!0,ok:!1});else{try{let i=await fetch(r+"/gate/update/status",{signal:AbortSignal.timeout(3e3)}),k=await i.json();if(i.ok&&k.activeJob?.statusOrigin){c.current&&w(k.activeJob);return}}catch{}c.current&&d({phase:"unknown",progress:0,message:"连接中断，暂时无法确认更新结果。请稍后检查更新；不要重复安装或删除节点。",terminal:!0})}}finally{D.current=!1}},q=async()=>{if(!(!e?.manualCommand||o||C))try{await navigator.clipboard.writeText(e.manualCommand),c.current&&E(!0)}catch{c.current&&N("复制失败，请手动选中下方命令复制。")}};return(0,t.jsxs)("div",{className:v.default.updateCard,children:[(0,t.jsxs)("div",{className:v.default.pairingHead,children:[(0,t.jsx)("div",{children:(0,t.jsx)("strong",{children:"插件更新"})}),(0,t.jsx)("button",{type:"button",className:v.default.secondaryButton,disabled:o||C,onClick:()=>void b(),children:o?"检查中…":"检查更新"})]}),e?(0,t.jsxs)(t.Fragment,{children:[e.channel==="preview"?(0,t.jsx)("span",{className:v.default.updateLabel,"data-severity":"recommended",children:"预览通道"}):null,(0,t.jsxs)("div",{className:v.default.updateVersions,children:[(0,t.jsxs)("span",{children:["DSH ",(0,t.jsx)("strong",{children:e.advice.current.agentVersion||"未知"})]}),(0,t.jsxs)("span",{children:["插件 ",(0,t.jsx)("strong",{children:e.advice.current.pluginVersion||"未知"})]})]}),o?null:(0,t.jsxs)(t.Fragment,{children:[(0,t.jsx)("strong",{className:v.default.updateLabel,"data-severity":e.advice.severity,role:"status",children:e.advice.label}),e.advice.targetVersion?(0,t.jsxs)("p",{children:["可更新至 ",e.advice.targetVersion,e.mode==="manual"?" · 需手动更新":""]}):null,e.advice.severity==="unknown"||e.advice.severity==="required"||e.mode==="manual"||e.mode==="busy"?(0,t.jsxs)("details",{children:[(0,t.jsx)("summary",{children:e.mode==="manual"?"手动更新说明":"查看说明"}),e.reason?(0,t.jsx)("p",{children:e.reason}):null,(0,t.jsx)("p",{children:e.advice.message})]}):null,e.mode==="manual"&&e.manualCommand?(0,t.jsxs)("div",{className:v.default.updateCommand,children:[(0,t.jsx)("code",{children:e.manualCommand}),(0,t.jsx)("button",{type:"button",className:v.default.secondaryButton,disabled:C,onClick:()=>void q(),children:j?"已复制":"复制命令"})]}):null,e.canInstall?(0,t.jsxs)(t.Fragment,{children:[(0,t.jsx)("button",{type:"button",className:v.default.primaryButton,disabled:C||!!x,onClick:()=>void z(),children:"更新并重启"}),(0,t.jsx)("small",{className:v.default.updateChecked,children:"会短暂断开连接，保留原配对和会话"})]}):null,e.advice.checkedAt&&e.advice.severity!=="unknown"?(0,t.jsxs)("small",{className:v.default.updateChecked,children:["最近检查 ",new Date(e.advice.checkedAt).toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"})]}):null]})]}):null,x?(0,t.jsx)("p",{role:"alert",children:x}):null,f?(0,t.jsxs)("div",{role:"status","aria-live":"polite",children:[!f.terminal||f.ok===!0?(0,t.jsx)("progress",{className:v.default.updateProgress,max:100,value:f.progress}):null,(0,t.jsx)("p",{children:f.message}),J?(0,t.jsx)("p",{role:"alert",children:"插件已完成更新，但未能自动打开 WebUI。请使用 DSH 启动时显示的地址打开，无需重复更新。"}):null]}):null]})}async function T(r,e,s=fetch){let o=await r(),a=o.gate;if(!a)throw new Error("当前节点没有提供配对入口");let f=a.profileScope==="desktop",d=a.localDoor?.port,x=Number.isSafeInteger(d)&&d>=1&&d<=65535?`http://127.0.0.1:${d}`:null;if(a.management==="authenticated-rpc")return{host:o,runtime:a,localOrigin:f?null:x,status:()=>e("status"),pairCode:()=>e("pair-code")};if(f||a.management==="unavailable"||!x||a.localDoor.state!=="listening")throw new Error("当前节点配对入口尚未就绪");let N=async y=>{let w=await s(x+y,{cache:"no-store"});if(!w.ok)throw new Error(`配对请求失败 (${w.status})`);return w.json()};return{host:o,runtime:a,localOrigin:x,status:()=>N("/gate/status"),pairCode:()=>N("/pair/code")}}var n=require("react/jsx-runtime");function $({ok:r,busy:e=!1}){return(0,n.jsx)("span",{className:l.default.statusDot,"data-state":e?"busy":r?"ready":"off","aria-hidden":!0})}function U({title:r,detail:e,ok:s,busy:o=!1}){return(0,n.jsxs)("div",{className:l.default.capability,children:[(0,n.jsx)($,{ok:s,busy:o}),(0,n.jsxs)("div",{className:l.default.capabilityCopy,children:[(0,n.jsx)("strong",{children:r}),(0,n.jsx)("span",{children:e})]})]})}function K({describeHost:r,callManagement:e}){let[s,o]=(0,g.useState)("loading"),[a,f]=(0,g.useState)("idle"),[d,x]=(0,g.useState)(null),[N,y]=(0,g.useState)(null),[w,j]=(0,g.useState)(null),[E,I]=(0,g.useState)(null),[R,J]=(0,g.useState)(null),[B,D]=(0,g.useState)(null),c=(0,g.useRef)(!0),S=(0,g.useCallback)(async()=>{try{let h=await T(r,e);if(!c.current)return;y(h.runtime),I(h.localOrigin),j(h.host);let A=await h.status();if(!c.current)return;x(A),y(A.gate??h.runtime),o("ready"),D(null)}catch{if(!c.current)return;o("error"),D("连接服务暂未就绪。请确认 DSH 正在运行，然后重试。")}},[r,e]),C=(0,g.useCallback)(async()=>{f("loading"),D(null);try{let h=await T(r,e);if(!c.current)return;y(h.runtime),j(h.host);let[A,V]=await Promise.all([h.pairCode(),h.status()]);if(!c.current)return;J(A),f("ready"),V&&(x(V),y(V.gate??h.runtime),o("ready"))}catch{if(!c.current)return;J(null),f("error"),D("暂时无法生成配对二维码，请确认电脑联网后重试。")}},[r,e]);(0,g.useEffect)(()=>{c.current=!0,S();let h=window.setInterval(()=>void S(),3e4);return()=>{c.current=!1,window.clearInterval(h)}},[S]),(0,g.useEffect)(()=>{if(a!=="ready"||!R?.expiresAt)return;let h=Math.max(1e3,R.expiresAt-Date.now()-6e4),A=window.setTimeout(()=>void C(),h);return()=>window.clearTimeout(A)},[C,R?.expiresAt,a]);let b=d?.publicRelay,z=b?.state==="enrolling"||b?.state==="connecting",q=b?.remoteAccess?.status,u=b?.state==="online"&&q==="active",p=q==="suspended"?"账户公网访问已暂停":q==="expired"?"公网访问已到期":q==="not_entitled"?"请在小程序中使用自助开通方式":q!=="active"?"配对后由小程序账户决定":u?"可在外网安全连接":z?"正在准备远程连接":"暂时离线",i=N?.publicDoor??d?.gate?.publicDoor,k=s==="ready"&&!!d?.lan.ip&&i?.state==="listening",H=b?.enabled===!0&&b.state!=="disabled",_=d?.agent?.agentName||w?.agentName||"DeepSeek Harness",P=d?.agent?.hostName||w?.computerName||"当前电脑";return(0,n.jsxs)("section",{className:l.default.root,"aria-labelledby":"harness-remote-title",children:[(0,n.jsxs)("div",{className:l.default.hero,children:[(0,n.jsxs)("div",{className:l.default.identity,children:[(0,n.jsx)("span",{className:l.default.mark,"aria-hidden":!0,children:(0,n.jsx)(M.FishLogo,{size:28})}),(0,n.jsxs)("div",{className:l.default.identityCopy,children:[(0,n.jsx)("h3",{id:"harness-remote-title",children:"Agent远程管理助手"}),(0,n.jsxs)("p",{children:[_,(0,n.jsx)("span",{"aria-hidden":!0,children:" · "}),P]})]})]}),(0,n.jsxs)("span",{className:l.default.overall,"data-ready":s==="ready",children:[(0,n.jsx)($,{ok:s==="ready",busy:s==="loading"}),s==="loading"?"检测中":s==="ready"?"服务正常":"暂不可用"]})]}),(0,n.jsxs)("div",{className:l.default.capabilities,children:[(0,n.jsx)(U,{title:"局域网直连",detail:s==="loading"?"检测中":k?"已就绪":"暂不可用",ok:k,busy:s==="loading"}),(0,n.jsx)(U,{title:"远程访问",detail:p,ok:u,busy:z||s==="loading"}),(0,n.jsx)(U,{title:"账号连接保护",detail:H?"已启用":"配对后启用",ok:H,busy:s==="loading"})]}),B!==null?(0,n.jsxs)("div",{className:l.default.notice,role:"status",children:[(0,n.jsx)("span",{children:B}),(0,n.jsx)("button",{type:"button",onClick:()=>void S(),children:"重试"})]}):null,a==="idle"?(0,n.jsxs)("div",{className:l.default.connectCard,children:[(0,n.jsxs)("div",{children:[(0,n.jsx)("strong",{children:"添加到微信"}),(0,n.jsx)("p",{children:"打开「Agent远程管理助手」→ 添加节点，扫描配对二维码。"})]}),(0,n.jsx)("button",{type:"button",className:l.default.primaryButton,onClick:()=>void C(),children:"生成二维码"})]}):(0,n.jsxs)("div",{className:l.default.pairingCard,children:[(0,n.jsxs)("div",{className:l.default.pairingHead,children:[(0,n.jsxs)("div",{children:[(0,n.jsx)("strong",{children:"扫描二维码"}),(0,n.jsx)("p",{children:"小程序「设置 → 添加节点」"})]}),(0,n.jsx)("button",{type:"button",className:l.default.secondaryButton,disabled:a==="loading",onClick:()=>void C(),children:a==="loading"?"生成中…":"重新生成"})]}),(0,n.jsxs)("div",{className:l.default.qrArea,children:[a==="ready"&&R!==null?(0,n.jsx)("img",{className:l.default.qr,src:R.qrDataUrl,alt:"Agent远程管理助手配对二维码"}):(0,n.jsx)("div",{className:l.default.qrPlaceholder,"aria-live":"polite",children:a==="error"?"生成失败":"正在生成…"}),a==="ready"&&R!==null?(0,n.jsx)("small",{className:l.default.qrValidity,children:"二维码约 15 分钟内有效"}):null]}),(0,n.jsx)("p",{className:l.default.securityNote,children:R?.mode==="public-relay"?"配对后自动选择更快的连接；远程内容端到端加密。":"当前可通过同一局域网连接。"})]}),E?(0,n.jsx)(F,{localOrigin:E}):null,N?.profileScope==="desktop"?(0,n.jsx)("p",{className:l.default.securityNote,children:"插件更新请使用桌面应用的插件管理。"}):null]})}var oe=["slots","connection"];function le(r){let e=async o=>{let a=await r.connection.rpc.call("/wechat-remote-management",o,{});if(!a.ok)throw new Error(a.error.message);return a.value},s=async()=>{let o=await r.connection.rpc.call("/api","wechatHost/describe",{args:{request:{}}});if(!o.ok)throw new Error(`wechatHost/describe: ${o.error.code}`);let a=o.value;if(a?.ok!==!0||a.value===void 0)throw new Error("wechatHost/describe returned an invalid result");return a.value};r.slots.inject("settings.section",()=>r.slots.register({name:"settings.section",id:"harness-remote",order:30,label:"微信连接",inject:()=>({describeHost:s,callManagement:e})},K))}

return module.exports;}});
