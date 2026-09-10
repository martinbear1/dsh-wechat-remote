window.__ModuleLoader__.load({id:"@harness-remote/dsh-wechat-remote",factory:(require)=>{var module={exports:{}};var exports=module.exports;"use strict";var ee=Object.create;var J=Object.defineProperty;var re=Object.getOwnPropertyDescriptor;var ne=Object.getOwnPropertyNames;var te=Object.getPrototypeOf,ae=Object.prototype.hasOwnProperty;var ie=(n,e)=>()=>(e||n((e={exports:{}}).exports,e),e.exports),se=(n,e)=>{for(var a in e)J(n,a,{get:e[a],enumerable:!0})},U=(n,e,a,s)=>{if(e&&typeof e=="object"||typeof e=="function")for(let f of ne(e))!ae.call(n,f)&&f!==a&&J(n,f,{get:()=>e[f],enumerable:!(s=re(e,f))||s.enumerable});return n};var M=(n,e,a)=>(a=n!=null?ee(te(n)):{},U(e||!n||!n.__esModule?J(a,"default",{value:n,enumerable:!0}):a,n)),oe=n=>U(J({},"__esModule",{value:!0}),n);var G=ie((me,$)=>{"use strict";var le=`.hr_63e6ec8_root {\r
  box-sizing: border-box;\r
  width: 100%;\r
  max-width: 760px;\r
  color: var(--dsw-alias-label-primary, #171a20);\r
  display: flex;\r
  flex-direction: column;\r
  gap: 14px;\r
}\r
\r
.hr_63e6ec8_hero,\r
.hr_63e6ec8_connectCard,\r
.hr_63e6ec8_pairingCard {\r
  border: 1px solid var(--dsw-alias-border-l2, rgba(128, 140, 160, 0.22));\r
  background: var(--dsw-alias-bg-layer-3, #fff);\r
  border-radius: 12px;\r
}\r
\r
.hr_63e6ec8_hero {\r
  min-height: 72px;\r
  display: flex;\r
  align-items: center;\r
  justify-content: space-between;\r
  gap: 20px;\r
  padding: 16px 18px;\r
}\r
\r
.hr_63e6ec8_identity {\r
  min-width: 0;\r
  display: flex;\r
  align-items: center;\r
  gap: 12px;\r
}\r
\r
.hr_63e6ec8_mark {\r
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
.hr_63e6ec8_identityCopy {\r
  min-width: 0;\r
}\r
\r
.hr_63e6ec8_identityCopy h3,\r
.hr_63e6ec8_identityCopy p,\r
.hr_63e6ec8_connectCard p,\r
.hr_63e6ec8_pairingHead p,\r
.hr_63e6ec8_securityNote {\r
  margin: 0;\r
}\r
\r
.hr_63e6ec8_identityCopy h3 {\r
  font-size: 15px;\r
  font-weight: 650;\r
  line-height: 22px;\r
}\r
\r
.hr_63e6ec8_identityCopy p {\r
  color: var(--dsw-alias-label-tertiary, #7d8492);\r
  font-size: 12px;\r
  line-height: 18px;\r
  overflow: hidden;\r
  text-overflow: ellipsis;\r
  white-space: nowrap;\r
}\r
\r
.hr_63e6ec8_overall {\r
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
.hr_63e6ec8_overall[data-ready='true'] {\r
  color: var(--dsw-alias-state-success-primary, #1f9d68);\r
}\r
\r
.hr_63e6ec8_statusDot {\r
  width: 7px;\r
  height: 7px;\r
  background: var(--dsw-alias-label-tertiary, #8b93a2);\r
  border-radius: 999px;\r
  flex: none;\r
}\r
\r
.hr_63e6ec8_statusDot[data-state='ready'] {\r
  background: var(--dsw-alias-state-success-primary, #1f9d68);\r
}\r
\r
.hr_63e6ec8_statusDot[data-state='busy'] {\r
  background: var(--dsw-alias-state-business-primary, #4e79ff);\r
  animation: harnessRemotePulse 1.2s ease-in-out infinite;\r
}\r
\r
.hr_63e6ec8_capabilities {\r
  grid-template-columns: repeat(3, minmax(0, 1fr));\r
  gap: 10px;\r
  display: grid;\r
}\r
\r
.hr_63e6ec8_capability {\r
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
.hr_63e6ec8_capability > .hr_63e6ec8_statusDot {\r
  margin-top: 6px;\r
}\r
\r
.hr_63e6ec8_capabilityCopy {\r
  min-width: 0;\r
  display: flex;\r
  flex-direction: column;\r
  gap: 1px;\r
}\r
\r
.hr_63e6ec8_capabilityCopy strong {\r
  font-size: 12.5px;\r
  font-weight: 600;\r
  line-height: 19px;\r
}\r
\r
.hr_63e6ec8_capabilityCopy span {\r
  color: var(--dsw-alias-label-tertiary, #7d8492);\r
  font-size: 11px;\r
  line-height: 17px;\r
  overflow: hidden;\r
  text-overflow: ellipsis;\r
  white-space: nowrap;\r
}\r
\r
.hr_63e6ec8_notice {\r
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
.hr_63e6ec8_notice button,\r
.hr_63e6ec8_secondaryButton {\r
  border: 1px solid var(--dsw-alias-border-l2, rgba(128, 140, 160, 0.28));\r
  color: var(--dsw-alias-label-primary, #171a20);\r
  background: var(--dsw-alias-bg-layer-1, #f5f6f8);\r
  border-radius: 7px;\r
  font: inherit;\r
  cursor: pointer;\r
}\r
\r
.hr_63e6ec8_notice button {\r
  flex: none;\r
  padding: 3px 9px;\r
}\r
\r
.hr_63e6ec8_connectCard {\r
  display: flex;\r
  align-items: center;\r
  justify-content: space-between;\r
  gap: 20px;\r
  padding: 18px;\r
}\r
\r
.hr_63e6ec8_connectCard strong,\r
.hr_63e6ec8_pairingHead strong {\r
  font-size: 14px;\r
  font-weight: 650;\r
  line-height: 21px;\r
}\r
\r
.hr_63e6ec8_connectCard p,\r
.hr_63e6ec8_pairingHead p {\r
  max-width: 470px;\r
  color: var(--dsw-alias-label-tertiary, #7d8492);\r
  font-size: 12px;\r
  line-height: 18px;\r
}\r
\r
.hr_63e6ec8_primaryButton {\r
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
.hr_63e6ec8_primaryButton:hover {\r
  filter: brightness(1.04);\r
}\r
\r
.hr_63e6ec8_primaryButton:focus-visible,\r
.hr_63e6ec8_secondaryButton:focus-visible,\r
.hr_63e6ec8_notice button:focus-visible {\r
  outline: 2px solid var(--dsw-alias-state-business-primary, #4e79ff);\r
  outline-offset: 2px;\r
}\r
\r
.hr_63e6ec8_pairingCard {\r
  padding: 18px;\r
}\r
\r
.hr_63e6ec8_pairingHead {\r
  display: flex;\r
  align-items: center;\r
  justify-content: space-between;\r
  gap: 16px;\r
}\r
\r
.hr_63e6ec8_secondaryButton {\r
  min-height: 32px;\r
  flex: none;\r
  padding: 0 11px;\r
  font-size: 12px;\r
}\r
\r
.hr_63e6ec8_secondaryButton:disabled {\r
  cursor: default;\r
  opacity: 0.55;\r
}\r
\r
.hr_63e6ec8_qrArea {\r
  min-height: 292px;\r
  margin-top: 16px;\r
  display: flex;\r
  align-items: center;\r
  justify-content: center;\r
  gap: 24px;\r
}\r
\r
.hr_63e6ec8_qr,\r
.hr_63e6ec8_qrPlaceholder {\r
  box-sizing: border-box;\r
  width: 280px;\r
  height: 280px;\r
  border-radius: 12px;\r
}\r
\r
.hr_63e6ec8_qr {\r
  background: #fff;\r
  padding: 10px;\r
  image-rendering: pixelated;\r
}\r
\r
.hr_63e6ec8_qrPlaceholder {\r
  color: var(--dsw-alias-label-tertiary, #7d8492);\r
  background: var(--dsw-alias-bg-layer-1, #f5f6f8);\r
  border: 1px dashed var(--dsw-alias-border-l2, rgba(128, 140, 160, 0.28));\r
  display: grid;\r
  place-items: center;\r
  font-size: 12px;\r
}\r
\r
.hr_63e6ec8_qrMeta {\r
  min-width: 150px;\r
  display: flex;\r
  flex-direction: column;\r
  align-items: flex-start;\r
  gap: 5px;\r
}\r
\r
.hr_63e6ec8_qrMeta span,\r
.hr_63e6ec8_qrMeta small {\r
  color: var(--dsw-alias-label-tertiary, #7d8492);\r
  font-size: 11px;\r
  line-height: 17px;\r
}\r
\r
.hr_63e6ec8_qrMeta code {\r
  color: var(--dsw-alias-state-business-primary, #4e79ff);\r
  font-family: var(--ds-font-family-code, ui-monospace, monospace);\r
  font-size: 16px;\r
  letter-spacing: 2px;\r
}\r
\r
.hr_63e6ec8_securityNote {\r
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
  .hr_63e6ec8_statusDot[data-state='busy'] {\r
    animation: none;\r
  }\r
}\r
\r
@media (max-width: 680px) {\r
  .hr_63e6ec8_capabilities {\r
    grid-template-columns: minmax(0, 1fr);\r
  }\r
\r
  .hr_63e6ec8_connectCard {\r
    align-items: stretch;\r
    flex-direction: column;\r
  }\r
\r
  .hr_63e6ec8_primaryButton {\r
    width: 100%;\r
  }\r
\r
  .hr_63e6ec8_qrArea {\r
    flex-direction: column;\r
    gap: 12px;\r
  }\r
\r
  .hr_63e6ec8_qrMeta {\r
    align-items: center;\r
  }\r
}\r
.hr_63e6ec8_updateCard { border: 1px solid var(--border-color, #ddd); border-radius: 12px; padding: 20px; margin-top: 20px; line-height: 1.6; overflow-wrap: anywhere; }\r
.hr_63e6ec8_updateLabel { color: inherit; }\r
.hr_63e6ec8_updateLabel[data-severity="none"] { color: #218b5c; }\r
.hr_63e6ec8_updateLabel[data-severity="unknown"] { color: var(--text-secondary, #858b96); }\r
.hr_63e6ec8_updateLabel[data-severity="required"] { color: #d54052; }\r
.hr_63e6ec8_updateLabel[data-severity="recommended"], .hr_63e6ec8_updateLabel[data-severity="info"] { color: #b5861d; }\r
.hr_63e6ec8_updateProgress { width: 100%; height: 12px; margin-top: 16px; accent-color: #7487ef; }\r
.hr_63e6ec8_updateVersions { display: flex; flex-wrap: wrap; gap: 10px 24px; margin: 12px 0; }\r
.hr_63e6ec8_updateVersions span { color: var(--text-secondary, #858b96); }\r
.hr_63e6ec8_updateVersions strong { color: var(--text-primary, inherit); font-weight: 500; }\r
.hr_63e6ec8_updateCommand { display: flex; flex-wrap: wrap; align-items: center; gap: 12px; margin-top: 12px; }\r
.hr_63e6ec8_updateCommand code { flex: 1 1 240px; white-space: pre-wrap; overflow-wrap: anywhere; user-select: text; }\r
.hr_63e6ec8_updateChecked { display: block; margin-top: 10px; color: var(--text-secondary, #858b96); }\r
`,O="@harness-remote/dsh-wechat-remote/HarnessRemoteSettings.module.css";if(typeof document<"u"&&document.querySelector("style[data-plugin-css="+JSON.stringify(O)+"]")===null){let n=document.createElement("style");n.dataset.plugin="@harness-remote/dsh-wechat-remote",n.dataset.pluginCss=O,n.textContent=le,document.head.appendChild(n)}$.exports={root:"hr_63e6ec8_root",hero:"hr_63e6ec8_hero",connectCard:"hr_63e6ec8_connectCard",pairingCard:"hr_63e6ec8_pairingCard",identity:"hr_63e6ec8_identity",mark:"hr_63e6ec8_mark",identityCopy:"hr_63e6ec8_identityCopy",pairingHead:"hr_63e6ec8_pairingHead",securityNote:"hr_63e6ec8_securityNote",overall:"hr_63e6ec8_overall",statusDot:"hr_63e6ec8_statusDot",capabilities:"hr_63e6ec8_capabilities",capability:"hr_63e6ec8_capability",capabilityCopy:"hr_63e6ec8_capabilityCopy",notice:"hr_63e6ec8_notice",secondaryButton:"hr_63e6ec8_secondaryButton",primaryButton:"hr_63e6ec8_primaryButton",qrArea:"hr_63e6ec8_qrArea",qr:"hr_63e6ec8_qr",qrPlaceholder:"hr_63e6ec8_qrPlaceholder",qrMeta:"hr_63e6ec8_qrMeta",updateCard:"hr_63e6ec8_updateCard",updateLabel:"hr_63e6ec8_updateLabel",updateProgress:"hr_63e6ec8_updateProgress",updateVersions:"hr_63e6ec8_updateVersions",updateCommand:"hr_63e6ec8_updateCommand",updateChecked:"hr_63e6ec8_updateChecked"}});var pe={};se(pe,{apply:()=>de,inject:()=>ce});module.exports=oe(pe);var p=require("react"),X=require("@deepseek-ai/dsh-client-ui-primitives"),o=M(G(),1);var c=require("react"),h=M(G(),1),t=require("react/jsx-runtime");function Q({localOrigin:n}){let[e,a]=(0,c.useState)(null),[s,f]=(0,c.useState)(!1),[b,x]=(0,c.useState)(null),[A,C]=(0,c.useState)(""),[k,P]=(0,c.useState)(null),[L,j]=(0,c.useState)(!1),[y,E]=(0,c.useState)(null),[z,q]=(0,c.useState)(!1),_=(0,c.useRef)(!1),m=(0,c.useRef)(!0),w=(0,c.useRef)(0),v=!!(b&&!b.terminal),R=(0,c.useCallback)(async()=>{let l=++w.current;f(!0),C(""),j(!1);try{let d=await fetch(n+"/gate/update/check",{signal:AbortSignal.timeout(1e4)}),u=await d.json();if(!d.ok)throw new Error(u.error||"暂时无法检查更新");if(!u.advice?.current||typeof u.advice.label!="string")throw new Error("更新检查返回信息不完整");m.current&&w.current===l&&(a(u),u.activeJob?.statusOrigin?(P(u.activeJob),x({phase:"recovering",progress:20,message:"正在恢复更新进度…",terminal:!1})):u.lastResult&&x(u.lastResult))}catch(d){m.current&&w.current===l&&(a(null),C(d instanceof Error?d.message:"暂时无法检查更新"))}finally{m.current&&w.current===l&&f(!1)}},[n]);(0,c.useEffect)(()=>(m.current=!0,R(),()=>{m.current=!1,w.current++}),[R]),(0,c.useEffect)(()=>{if(!k||!v)return;let l=!1,d,u=Date.now()+10*6e4,H=async()=>{try{let S=await fetch(k.statusOrigin+"/status",{headers:{Authorization:"Bearer "+k.statusToken},signal:AbortSignal.timeout(4e3)});if(!S.ok)throw new Error("进度暂不可用");let g=await S.json();if(l)return;if(x(g),g.terminal){P(null),g.ok&&E(k.jobId),R();return}}catch{if(l)return;try{let g=await(await fetch(n+"/gate/update/status",{signal:AbortSignal.timeout(3e3)})).json();if(!l&&g.lastResult&&(x(g.lastResult),g.lastResult.terminal)){P(null),g.lastResult.ok&&E(k.jobId),R();return}}catch{}if(Date.now()>u){x({phase:"unknown",progress:100,message:"暂时无法确认更新结果。请重新打开此主机 WebUI 检查版本；不要重复安装或删除节点。",terminal:!0});return}}l||(d=window.setTimeout(()=>void H(),1e3))};return H(),()=>{l=!0,window.clearTimeout(d)}},[k,v,n,R]),(0,c.useEffect)(()=>{if(!y)return;let l=!1,d,u=Date.now()+3e4;q(!1);let H=async()=>{try{let S=await fetch(n+"/gate/update/resume?job="+encodeURIComponent(y),{signal:AbortSignal.timeout(3e3)});if(!S.ok)throw new Error("尚未恢复");let g=await S.json();if(!g.url)throw new Error("缺少恢复地址");let i=new URL(g.url);if(i.origin!==window.location.origin||i.pathname!=="/"||i.username||i.password||i.hash)throw new Error("恢复地址不匹配");l||window.location.replace(i.href)}catch{if(l)return;if(Date.now()>=u){q(!0);return}d=window.setTimeout(()=>void H(),1e3)}};return H(),()=>{l=!0,window.clearTimeout(d)}},[y,n]);let D=async()=>{if(!(!e?.canInstall||v||s||A||_.current)){_.current=!0,C(""),x({phase:"download",progress:10,message:"正在下载并验证更新包；当前插件尚未替换",terminal:!1});try{let l=await fetch(n+"/gate/update/start",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({ticket:e.ticket})}),d=await l.json();if(!l.ok||!d.statusOrigin)throw new Error(d.error||"无法取得更新进度，请重新检查");m.current&&P(d)}catch(l){m.current&&x({phase:"failed",progress:100,message:l instanceof Error?l.message:"更新未开始，请重新检查",terminal:!0,ok:!1})}finally{_.current=!1}}},I=async()=>{if(!(!e?.manualCommand||s||v))try{await navigator.clipboard.writeText(e.manualCommand),m.current&&j(!0)}catch{m.current&&C("复制失败，请手动选中下方命令复制。")}};return(0,t.jsxs)("div",{className:h.default.updateCard,children:[(0,t.jsxs)("div",{className:h.default.pairingHead,children:[(0,t.jsx)("div",{children:(0,t.jsx)("strong",{children:"插件更新"})}),(0,t.jsx)("button",{type:"button",className:h.default.secondaryButton,disabled:s||v,onClick:()=>void R(),children:s?"检查中…":"检查更新"})]}),e?(0,t.jsxs)(t.Fragment,{children:[e.channel==="preview"?(0,t.jsx)("span",{className:h.default.updateLabel,"data-severity":"recommended",children:"预览通道"}):null,(0,t.jsxs)("div",{className:h.default.updateVersions,children:[(0,t.jsxs)("span",{children:["DSH ",(0,t.jsx)("strong",{children:e.advice.current.agentVersion||"未知"})]}),(0,t.jsxs)("span",{children:["插件 ",(0,t.jsx)("strong",{children:e.advice.current.pluginVersion||"未知"})]})]}),s?null:(0,t.jsxs)(t.Fragment,{children:[(0,t.jsx)("strong",{className:h.default.updateLabel,"data-severity":e.advice.severity,role:"status",children:e.advice.label}),e.advice.targetVersion?(0,t.jsxs)("p",{children:["可更新至 ",e.advice.targetVersion,e.mode==="manual"?" · 需手动更新":""]}):null,e.advice.severity==="unknown"||e.advice.severity==="required"||e.mode==="manual"||e.mode==="busy"?(0,t.jsxs)("details",{children:[(0,t.jsx)("summary",{children:e.mode==="manual"?"手动更新说明":"查看说明"}),e.reason?(0,t.jsx)("p",{children:e.reason}):null,(0,t.jsx)("p",{children:e.advice.message})]}):null,e.mode==="manual"&&e.manualCommand?(0,t.jsxs)("div",{className:h.default.updateCommand,children:[(0,t.jsx)("code",{children:e.manualCommand}),(0,t.jsx)("button",{type:"button",className:h.default.secondaryButton,disabled:v,onClick:()=>void I(),children:L?"已复制":"复制命令"})]}):null,e.canInstall?(0,t.jsxs)(t.Fragment,{children:[(0,t.jsx)("button",{type:"button",className:h.default.primaryButton,disabled:v||!!A,onClick:()=>void D(),children:"更新并重启"}),(0,t.jsx)("small",{className:h.default.updateChecked,children:"会短暂断开连接，保留原配对和会话"})]}):null,e.advice.checkedAt&&e.advice.severity!=="unknown"?(0,t.jsxs)("small",{className:h.default.updateChecked,children:["最近检查 ",new Date(e.advice.checkedAt).toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"})]}):null]})]}):null,A?(0,t.jsx)("p",{role:"alert",children:A}):null,b?(0,t.jsxs)("div",{role:"status","aria-live":"polite",children:[(0,t.jsx)("progress",{className:h.default.updateProgress,max:100,value:b.progress}),(0,t.jsx)("p",{children:b.message}),z?(0,t.jsx)("p",{role:"alert",children:"插件已完成更新，但未能自动打开 WebUI。请使用 DSH 启动时显示的地址打开，无需重复更新。"}):null]}):null]})}var r=require("react/jsx-runtime"),F="http://127.0.0.1:3093";function K({ok:n,busy:e=!1}){return(0,r.jsx)("span",{className:o.default.statusDot,"data-state":e?"busy":n?"ready":"off","aria-hidden":!0})}function V({title:n,detail:e,ok:a,busy:s=!1}){return(0,r.jsxs)("div",{className:o.default.capability,children:[(0,r.jsx)(K,{ok:a,busy:s}),(0,r.jsxs)("div",{className:o.default.capabilityCopy,children:[(0,r.jsx)("strong",{children:n}),(0,r.jsx)("span",{children:e})]})]})}async function W(n){try{let e=await n(),a=e.gate;return!a||!Number.isSafeInteger(a.localDoor.port)?{origin:F,runtime:null,host:e}:{origin:`http://127.0.0.1:${a.localDoor.port}`,runtime:a,host:e}}catch{return{origin:F,runtime:null,host:null}}}function Y({describeHost:n}){let[e,a]=(0,p.useState)("loading"),[s,f]=(0,p.useState)("idle"),[b,x]=(0,p.useState)(null),[A,C]=(0,p.useState)(null),[k,P]=(0,p.useState)(null),[L,j]=(0,p.useState)(null),[y,E]=(0,p.useState)(null),[z,q]=(0,p.useState)(null),_=(0,p.useRef)(!0),m=(0,p.useCallback)(async()=>{try{let i=await W(n);if(!_.current)return;if(C(i.runtime),j(i.origin),P(i.host),i.runtime!==null&&i.runtime.localDoor.state!=="listening")throw new Error("local-door-unavailable");let N=await fetch(`${i.origin}/gate/status`);if(!N.ok)throw new Error(`gate/status ${N.status}`);let B=await N.json();if(!_.current)return;x(B),C(B.gate??i.runtime),a("ready"),q(null)}catch{if(!_.current)return;a("error"),q("连接服务暂未就绪。请确认 DSH 正在运行，然后重试。")}},[n]),w=(0,p.useCallback)(async()=>{f("loading"),q(null);try{let i=await W(n);if(!_.current)return;if(C(i.runtime),P(i.host),i.runtime!==null&&i.runtime.localDoor.state!=="listening")throw new Error("local-door-unavailable");let[N,B]=await Promise.all([fetch(`${i.origin}/pair/code`),fetch(`${i.origin}/gate/status`)]);if(!N.ok)throw new Error(`pair/code ${N.status}`);let Z=await N.json();if(!_.current)return;if(E(Z),f("ready"),B.ok){let T=await B.json();x(T),C(T.gate??i.runtime),a("ready")}}catch{if(!_.current)return;E(null),f("error"),q("暂时无法生成配对码，请稍后重试。")}},[n]);(0,p.useEffect)(()=>{_.current=!0,m();let i=window.setInterval(()=>void m(),3e4);return()=>{_.current=!1,window.clearInterval(i)}},[m]),(0,p.useEffect)(()=>{if(s!=="ready"||!y?.expiresAt)return;let i=Math.max(1e3,y.expiresAt-Date.now()-6e4),N=window.setTimeout(()=>void w(),i);return()=>window.clearTimeout(N)},[w,y?.expiresAt,s]);let v=b?.publicRelay,R=v?.state==="enrolling"||v?.state==="connecting",D=v?.remoteAccess?.status,I=v?.state==="online"&&D==="active",l=D==="suspended"?"账户公网访问已暂停":D==="pending"?"体验申请审核中":D==="expired"?"公网访问已到期":D==="not_entitled"?"请在小程序中申请体验":D!=="active"?"配对后由小程序账户决定":I?"可在外网安全连接":R?"正在准备远程连接":"暂时离线",d=A?.localDoor??b?.gate?.localDoor,u=e==="ready"&&!!b?.lan.ip&&d?.state==="listening",H=I||b?.wechat.configured===!0,S=b?.agent?.agentName||k?.agentName||"DeepSeek Harness",g=b?.agent?.hostName||k?.computerName||"当前电脑";return(0,r.jsxs)("section",{className:o.default.root,"aria-labelledby":"harness-remote-title",children:[(0,r.jsxs)("div",{className:o.default.hero,children:[(0,r.jsxs)("div",{className:o.default.identity,children:[(0,r.jsx)("span",{className:o.default.mark,"aria-hidden":!0,children:(0,r.jsx)(X.FishLogo,{size:28})}),(0,r.jsxs)("div",{className:o.default.identityCopy,children:[(0,r.jsx)("h3",{id:"harness-remote-title",children:"Agent远程管理助手"}),(0,r.jsxs)("p",{children:[S,(0,r.jsx)("span",{"aria-hidden":!0,children:" · "}),g]})]})]}),(0,r.jsxs)("span",{className:o.default.overall,"data-ready":e==="ready",children:[(0,r.jsx)(K,{ok:e==="ready",busy:e==="loading"}),e==="loading"?"检测中":e==="ready"?"服务正常":"暂不可用"]})]}),(0,r.jsxs)("div",{className:o.default.capabilities,children:[(0,r.jsx)(V,{title:"局域网直连",detail:e==="loading"?"检测中":u?"已就绪":"暂不可用",ok:u,busy:e==="loading"}),(0,r.jsx)(V,{title:"远程访问",detail:l,ok:I,busy:R||e==="loading"}),(0,r.jsx)(V,{title:"微信账号保护",detail:H?"已启用":"配对后启用",ok:H,busy:e==="loading"})]}),z!==null?(0,r.jsxs)("div",{className:o.default.notice,role:"status",children:[(0,r.jsx)("span",{children:z}),(0,r.jsx)("button",{type:"button",onClick:()=>void m(),children:"重试"})]}):null,s==="idle"?(0,r.jsxs)("div",{className:o.default.connectCard,children:[(0,r.jsxs)("div",{children:[(0,r.jsx)("strong",{children:"添加到微信"}),(0,r.jsx)("p",{children:"打开「Agent远程管理助手」→ 添加节点，扫描配对码。"})]}),(0,r.jsx)("button",{type:"button",className:o.default.primaryButton,onClick:()=>void w(),children:"生成配对码"})]}):(0,r.jsxs)("div",{className:o.default.pairingCard,children:[(0,r.jsxs)("div",{className:o.default.pairingHead,children:[(0,r.jsxs)("div",{children:[(0,r.jsx)("strong",{children:"扫描二维码"}),(0,r.jsx)("p",{children:"小程序「设置 → 添加节点」"})]}),(0,r.jsx)("button",{type:"button",className:o.default.secondaryButton,disabled:s==="loading",onClick:()=>void w(),children:s==="loading"?"生成中…":"重新生成"})]}),(0,r.jsxs)("div",{className:o.default.qrArea,children:[s==="ready"&&y!==null?(0,r.jsx)("img",{className:o.default.qr,src:y.qrDataUrl,alt:"Agent远程管理助手配对二维码"}):(0,r.jsx)("div",{className:o.default.qrPlaceholder,"aria-live":"polite",children:s==="error"?"生成失败":"正在生成…"}),s==="ready"&&y!==null?(0,r.jsxs)("div",{className:o.default.qrMeta,children:[(0,r.jsx)("span",{children:"配对码"}),(0,r.jsx)("code",{children:y.code}),(0,r.jsx)("small",{children:"15 分钟内有效"})]}):null]}),(0,r.jsx)("p",{className:o.default.securityNote,children:y?.mode==="public-relay"?"配对后自动选择更快的连接；远程内容端到端加密。":"当前可通过同一局域网连接。"})]}),L?(0,r.jsx)(Q,{localOrigin:L}):null]})}var ce=["slots","connection"];function de(n){let e=async()=>{let a=await n.connection.rpc.call("/api","wechatHost/describe",{args:{request:{}}});if(!a.ok)throw new Error(`wechatHost/describe: ${a.error.code}`);let s=a.value;if(s?.ok!==!0||s.value===void 0)throw new Error("wechatHost/describe returned an invalid result");return s.value};n.slots.inject("settings.section",()=>n.slots.register({name:"settings.section",id:"harness-remote",order:30,label:"微信连接",inject:()=>({describeHost:e})},Y))}

return module.exports;}});
