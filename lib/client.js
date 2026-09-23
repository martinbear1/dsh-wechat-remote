window.__ModuleLoader__.load({id:"@harness-remote/dsh-wechat-remote",factory:(require)=>{var module={exports:{}};var exports=module.exports;"use strict";var ee=Object.create;var z=Object.defineProperty;var re=Object.getOwnPropertyDescriptor;var ne=Object.getOwnPropertyNames;var te=Object.getPrototypeOf,ae=Object.prototype.hasOwnProperty;var ie=(r,e)=>()=>(e||r((e={exports:{}}).exports,e),e.exports),se=(r,e)=>{for(var i in e)z(r,i,{get:e[i],enumerable:!0})},U=(r,e,i,o)=>{if(e&&typeof e=="object"||typeof e=="function")for(let y of ne(e))!ae.call(r,y)&&y!==i&&z(r,y,{get:()=>e[y],enumerable:!(o=re(e,y))||o.enumerable});return r};var O=(r,e,i)=>(i=r!=null?ee(te(r)):{},U(e||!r||!r.__esModule?z(i,"default",{value:r,enumerable:!0}):i,r)),oe=r=>U(z({},"__esModule",{value:!0}),r);var V=ie((me,Q)=>{"use strict";var le=`.hr_4eed469_root {\r
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
`,$="@harness-remote/dsh-wechat-remote/HarnessRemoteSettings.module.css";if(typeof document<"u"&&document.querySelector("style[data-plugin-css="+JSON.stringify($)+"]")===null){let r=document.createElement("style");r.dataset.plugin="@harness-remote/dsh-wechat-remote",r.dataset.pluginCss=$,r.textContent=le,document.head.appendChild(r)}Q.exports={root:"hr_4eed469_root",hero:"hr_4eed469_hero",connectCard:"hr_4eed469_connectCard",pairingCard:"hr_4eed469_pairingCard",identity:"hr_4eed469_identity",mark:"hr_4eed469_mark",identityCopy:"hr_4eed469_identityCopy",pairingHead:"hr_4eed469_pairingHead",securityNote:"hr_4eed469_securityNote",overall:"hr_4eed469_overall",statusDot:"hr_4eed469_statusDot",capabilities:"hr_4eed469_capabilities",capability:"hr_4eed469_capability",capabilityCopy:"hr_4eed469_capabilityCopy",notice:"hr_4eed469_notice",secondaryButton:"hr_4eed469_secondaryButton",primaryButton:"hr_4eed469_primaryButton",qrArea:"hr_4eed469_qrArea",qr:"hr_4eed469_qr",qrPlaceholder:"hr_4eed469_qrPlaceholder",qrValidity:"hr_4eed469_qrValidity",updateCard:"hr_4eed469_updateCard",updateLabel:"hr_4eed469_updateLabel",updateProgress:"hr_4eed469_updateProgress",updateVersions:"hr_4eed469_updateVersions",updateCommand:"hr_4eed469_updateCommand",updateChecked:"hr_4eed469_updateChecked"}});var ue={};se(ue,{apply:()=>ce,inject:()=>de});module.exports=oe(ue);var p=require("react"),M=require("@deepseek-ai/dsh-client-ui-primitives"),l=O(V(),1);var c=require("react"),b=O(V(),1),t=require("react/jsx-runtime");function F({localOrigin:r}){let[e,i]=(0,c.useState)(null),[o,y]=(0,c.useState)(!1),[h,_]=(0,c.useState)(null),[q,C]=(0,c.useState)(""),[R,H]=(0,c.useState)(null),[j,B]=(0,c.useState)(!1),[x,E]=(0,c.useState)(null),[L,P]=(0,c.useState)(!1),v=(0,c.useRef)(!1),m=(0,c.useRef)(!0),k=(0,c.useRef)(0),g=!!(h&&!h.terminal),N=(0,c.useCallback)(async()=>{let u=++k.current;y(!0),C(""),B(!1);try{let d=await fetch(r+"/gate/update/check",{signal:AbortSignal.timeout(1e4)}),a=await d.json();if(!d.ok)throw new Error(a.error||"暂时无法检查更新");if(!a.advice?.current||typeof a.advice.label!="string")throw new Error("更新检查返回信息不完整");m.current&&k.current===u&&(i(a),a.activeJob?.statusOrigin?(H(a.activeJob),_({phase:"recovering",progress:20,message:"正在恢复更新进度…",terminal:!1})):a.mode==="busy"?_({phase:"preparing",progress:0,message:"更新仍在准备或等待确认，请稍后重新检查；不要重复安装。",terminal:!0}):a.lastResult&&_(a.lastResult))}catch(d){m.current&&k.current===u&&(i(null),C(d instanceof Error?d.message:"暂时无法检查更新"))}finally{m.current&&k.current===u&&y(!1)}},[r]);(0,c.useEffect)(()=>(m.current=!0,N(),()=>{m.current=!1,k.current++}),[N]),(0,c.useEffect)(()=>{if(!R||!g)return;let u=!1,d,a=Date.now()+10*6e4,w=async()=>{try{let S=await fetch(R.statusOrigin+"/status",{headers:{Authorization:"Bearer "+R.statusToken},signal:AbortSignal.timeout(4e3)});if(!S.ok)throw new Error("进度暂不可用");let f=await S.json();if(u)return;if(_(f),f.terminal){H(null),f.ok&&E(R.jobId),N();return}}catch{if(u)return;try{let f=await(await fetch(r+"/gate/update/status",{signal:AbortSignal.timeout(3e3)})).json();if(!u&&f.lastResult&&(_(f.lastResult),f.lastResult.terminal)){H(null),f.lastResult.ok&&E(R.jobId),N();return}}catch{}if(Date.now()>a){_({phase:"unknown",progress:0,message:"暂时无法确认更新结果。请重新打开此主机 WebUI 检查版本；不要重复安装或删除节点。",terminal:!0});return}}u||(d=window.setTimeout(()=>void w(),1e3))};return w(),()=>{u=!0,window.clearTimeout(d)}},[R,g,r,N]),(0,c.useEffect)(()=>{if(!x)return;let u=!1,d,a=Date.now()+3e4;P(!1);let w=async()=>{try{let S=await fetch(r+"/gate/update/resume?job="+encodeURIComponent(x),{signal:AbortSignal.timeout(3e3)});if(!S.ok)throw new Error("尚未恢复");let f=await S.json();if(!f.url)throw new Error("缺少恢复地址");let s=new URL(f.url);if(s.origin!==window.location.origin||s.pathname!=="/"||s.username||s.password||s.hash)throw new Error("恢复地址不匹配");u||window.location.replace(s.href)}catch{if(u)return;if(Date.now()>=a){P(!0);return}d=window.setTimeout(()=>void w(),1e3)}};return w(),()=>{u=!0,window.clearTimeout(d)}},[x,r]);let A=async()=>{if(!e?.canInstall||g||o||q||v.current)return;v.current=!0,C(""),_({phase:"download",progress:10,message:"正在下载并验证更新包；当前插件尚未替换",terminal:!1});let u=!1;try{let d=await fetch(r+"/gate/update/start",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({ticket:e.ticket})}),a=await d.json();if(u=!d.ok&&typeof a.error=="string",!d.ok||!a.statusOrigin)throw new Error(a.error||"无法取得更新进度，请重新检查");m.current&&H(a)}catch(d){if(!m.current)return;if(i(a=>a&&{...a,canInstall:!1,ticket:""}),u)_({phase:"failed",progress:0,message:(d instanceof Error?d.message:"更新暂不可用")+"。请重新检查更新。",terminal:!0,ok:!1});else{try{let a=await fetch(r+"/gate/update/status",{signal:AbortSignal.timeout(3e3)}),w=await a.json();if(a.ok&&w.activeJob?.statusOrigin){m.current&&H(w.activeJob);return}}catch{}m.current&&_({phase:"unknown",progress:0,message:"连接中断，暂时无法确认更新结果。请稍后检查更新；不要重复安装或删除节点。",terminal:!0})}}finally{v.current=!1}},J=async()=>{if(!(!e?.manualCommand||o||g))try{await navigator.clipboard.writeText(e.manualCommand),m.current&&B(!0)}catch{m.current&&C("复制失败，请手动选中下方命令复制。")}};return(0,t.jsxs)("div",{className:b.default.updateCard,children:[(0,t.jsxs)("div",{className:b.default.pairingHead,children:[(0,t.jsx)("div",{children:(0,t.jsx)("strong",{children:"插件更新"})}),(0,t.jsx)("button",{type:"button",className:b.default.secondaryButton,disabled:o||g,onClick:()=>void N(),children:o?"检查中…":"检查更新"})]}),e?(0,t.jsxs)(t.Fragment,{children:[e.channel==="preview"?(0,t.jsx)("span",{className:b.default.updateLabel,"data-severity":"recommended",children:"预览通道"}):null,(0,t.jsxs)("div",{className:b.default.updateVersions,children:[(0,t.jsxs)("span",{children:["DSH ",(0,t.jsx)("strong",{children:e.advice.current.agentVersion||"未知"})]}),(0,t.jsxs)("span",{children:["插件 ",(0,t.jsx)("strong",{children:e.advice.current.pluginVersion||"未知"})]})]}),o?null:(0,t.jsxs)(t.Fragment,{children:[(0,t.jsx)("strong",{className:b.default.updateLabel,"data-severity":e.advice.severity,role:"status",children:e.advice.label}),e.advice.targetVersion?(0,t.jsxs)("p",{children:["可更新至 ",e.advice.targetVersion,e.mode==="manual"?" · 需手动更新":""]}):null,e.advice.severity==="unknown"||e.advice.severity==="required"||e.mode==="manual"||e.mode==="busy"?(0,t.jsxs)("details",{children:[(0,t.jsx)("summary",{children:e.mode==="manual"?"手动更新说明":"查看说明"}),e.reason?(0,t.jsx)("p",{children:e.reason}):null,(0,t.jsx)("p",{children:e.advice.message})]}):null,e.mode==="manual"&&e.manualCommand?(0,t.jsxs)("div",{className:b.default.updateCommand,children:[(0,t.jsx)("code",{children:e.manualCommand}),(0,t.jsx)("button",{type:"button",className:b.default.secondaryButton,disabled:g,onClick:()=>void J(),children:j?"已复制":"复制命令"})]}):null,e.canInstall?(0,t.jsxs)(t.Fragment,{children:[(0,t.jsx)("button",{type:"button",className:b.default.primaryButton,disabled:g||!!q,onClick:()=>void A(),children:"更新并重启"}),(0,t.jsx)("small",{className:b.default.updateChecked,children:"会短暂断开连接，保留原配对和会话"})]}):null,e.advice.checkedAt&&e.advice.severity!=="unknown"?(0,t.jsxs)("small",{className:b.default.updateChecked,children:["最近检查 ",new Date(e.advice.checkedAt).toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"})]}):null]})]}):null,q?(0,t.jsx)("p",{role:"alert",children:q}):null,h?(0,t.jsxs)("div",{role:"status","aria-live":"polite",children:[!h.terminal||h.ok===!0?(0,t.jsx)("progress",{className:b.default.updateProgress,max:100,value:h.progress}):null,(0,t.jsx)("p",{children:h.message}),L?(0,t.jsx)("p",{role:"alert",children:"插件已完成更新，但未能自动打开 WebUI。请使用 DSH 启动时显示的地址打开，无需重复更新。"}):null]}):null]})}var n=require("react/jsx-runtime"),W="http://127.0.0.1:3093";function K({ok:r,busy:e=!1}){return(0,n.jsx)("span",{className:l.default.statusDot,"data-state":e?"busy":r?"ready":"off","aria-hidden":!0})}function G({title:r,detail:e,ok:i,busy:o=!1}){return(0,n.jsxs)("div",{className:l.default.capability,children:[(0,n.jsx)(K,{ok:i,busy:o}),(0,n.jsxs)("div",{className:l.default.capabilityCopy,children:[(0,n.jsx)("strong",{children:r}),(0,n.jsx)("span",{children:e})]})]})}async function X(r){try{let e=await r(),i=e.gate;return!i||!Number.isSafeInteger(i.localDoor.port)?{origin:W,runtime:null,host:e}:{origin:`http://127.0.0.1:${i.localDoor.port}`,runtime:i,host:e}}catch{return{origin:W,runtime:null,host:null}}}function Y({describeHost:r}){let[e,i]=(0,p.useState)("loading"),[o,y]=(0,p.useState)("idle"),[h,_]=(0,p.useState)(null),[q,C]=(0,p.useState)(null),[R,H]=(0,p.useState)(null),[j,B]=(0,p.useState)(null),[x,E]=(0,p.useState)(null),[L,P]=(0,p.useState)(null),v=(0,p.useRef)(!0),m=(0,p.useCallback)(async()=>{try{let s=await X(r);if(!v.current)return;if(C(s.runtime),B(s.origin),H(s.host),s.runtime!==null&&s.runtime.localDoor.state!=="listening")throw new Error("local-door-unavailable");let D=await fetch(`${s.origin}/gate/status`);if(!D.ok)throw new Error(`gate/status ${D.status}`);let I=await D.json();if(!v.current)return;_(I),C(I.gate??s.runtime),i("ready"),P(null)}catch{if(!v.current)return;i("error"),P("连接服务暂未就绪。请确认 DSH 正在运行，然后重试。")}},[r]),k=(0,p.useCallback)(async()=>{y("loading"),P(null);try{let s=await X(r);if(!v.current)return;if(C(s.runtime),H(s.host),s.runtime!==null&&s.runtime.localDoor.state!=="listening")throw new Error("local-door-unavailable");let[D,I]=await Promise.all([fetch(`${s.origin}/pair/code`),fetch(`${s.origin}/gate/status`)]);if(!D.ok)throw new Error(`pair/code ${D.status}`);let Z=await D.json();if(!v.current)return;if(E(Z),y("ready"),I.ok){let T=await I.json();_(T),C(T.gate??s.runtime),i("ready")}}catch{if(!v.current)return;E(null),y("error"),P("暂时无法生成配对二维码，请确认电脑联网后重试。")}},[r]);(0,p.useEffect)(()=>{v.current=!0,m();let s=window.setInterval(()=>void m(),3e4);return()=>{v.current=!1,window.clearInterval(s)}},[m]),(0,p.useEffect)(()=>{if(o!=="ready"||!x?.expiresAt)return;let s=Math.max(1e3,x.expiresAt-Date.now()-6e4),D=window.setTimeout(()=>void k(),s);return()=>window.clearTimeout(D)},[k,x?.expiresAt,o]);let g=h?.publicRelay,N=g?.state==="enrolling"||g?.state==="connecting",A=g?.remoteAccess?.status,J=g?.state==="online"&&A==="active",u=A==="suspended"?"账户公网访问已暂停":A==="expired"?"公网访问已到期":A==="not_entitled"?"请在小程序中使用自助开通方式":A!=="active"?"配对后由小程序账户决定":J?"可在外网安全连接":N?"正在准备远程连接":"暂时离线",d=q?.localDoor??h?.gate?.localDoor,a=e==="ready"&&!!h?.lan.ip&&d?.state==="listening",w=g?.enabled===!0&&g.state!=="disabled",S=h?.agent?.agentName||R?.agentName||"DeepSeek Harness",f=h?.agent?.hostName||R?.computerName||"当前电脑";return(0,n.jsxs)("section",{className:l.default.root,"aria-labelledby":"harness-remote-title",children:[(0,n.jsxs)("div",{className:l.default.hero,children:[(0,n.jsxs)("div",{className:l.default.identity,children:[(0,n.jsx)("span",{className:l.default.mark,"aria-hidden":!0,children:(0,n.jsx)(M.FishLogo,{size:28})}),(0,n.jsxs)("div",{className:l.default.identityCopy,children:[(0,n.jsx)("h3",{id:"harness-remote-title",children:"Agent远程管理助手"}),(0,n.jsxs)("p",{children:[S,(0,n.jsx)("span",{"aria-hidden":!0,children:" · "}),f]})]})]}),(0,n.jsxs)("span",{className:l.default.overall,"data-ready":e==="ready",children:[(0,n.jsx)(K,{ok:e==="ready",busy:e==="loading"}),e==="loading"?"检测中":e==="ready"?"服务正常":"暂不可用"]})]}),(0,n.jsxs)("div",{className:l.default.capabilities,children:[(0,n.jsx)(G,{title:"局域网直连",detail:e==="loading"?"检测中":a?"已就绪":"暂不可用",ok:a,busy:e==="loading"}),(0,n.jsx)(G,{title:"远程访问",detail:u,ok:J,busy:N||e==="loading"}),(0,n.jsx)(G,{title:"账号连接保护",detail:w?"已启用":"配对后启用",ok:w,busy:e==="loading"})]}),L!==null?(0,n.jsxs)("div",{className:l.default.notice,role:"status",children:[(0,n.jsx)("span",{children:L}),(0,n.jsx)("button",{type:"button",onClick:()=>void m(),children:"重试"})]}):null,o==="idle"?(0,n.jsxs)("div",{className:l.default.connectCard,children:[(0,n.jsxs)("div",{children:[(0,n.jsx)("strong",{children:"添加到微信"}),(0,n.jsx)("p",{children:"打开「Agent远程管理助手」→ 添加节点，扫描配对二维码。"})]}),(0,n.jsx)("button",{type:"button",className:l.default.primaryButton,onClick:()=>void k(),children:"生成二维码"})]}):(0,n.jsxs)("div",{className:l.default.pairingCard,children:[(0,n.jsxs)("div",{className:l.default.pairingHead,children:[(0,n.jsxs)("div",{children:[(0,n.jsx)("strong",{children:"扫描二维码"}),(0,n.jsx)("p",{children:"小程序「设置 → 添加节点」"})]}),(0,n.jsx)("button",{type:"button",className:l.default.secondaryButton,disabled:o==="loading",onClick:()=>void k(),children:o==="loading"?"生成中…":"重新生成"})]}),(0,n.jsxs)("div",{className:l.default.qrArea,children:[o==="ready"&&x!==null?(0,n.jsx)("img",{className:l.default.qr,src:x.qrDataUrl,alt:"Agent远程管理助手配对二维码"}):(0,n.jsx)("div",{className:l.default.qrPlaceholder,"aria-live":"polite",children:o==="error"?"生成失败":"正在生成…"}),o==="ready"&&x!==null?(0,n.jsx)("small",{className:l.default.qrValidity,children:"二维码约 15 分钟内有效"}):null]}),(0,n.jsx)("p",{className:l.default.securityNote,children:x?.mode==="public-relay"?"配对后自动选择更快的连接；远程内容端到端加密。":"当前可通过同一局域网连接。"})]}),j?(0,n.jsx)(F,{localOrigin:j}):null]})}var de=["slots","connection"];function ce(r){let e=async()=>{let i=await r.connection.rpc.call("/api","wechatHost/describe",{args:{request:{}}});if(!i.ok)throw new Error(`wechatHost/describe: ${i.error.code}`);let o=i.value;if(o?.ok!==!0||o.value===void 0)throw new Error("wechatHost/describe returned an invalid result");return o.value};r.slots.inject("settings.section",()=>r.slots.register({name:"settings.section",id:"harness-remote",order:30,label:"微信连接",inject:()=>({describeHost:e})},Y))}

return module.exports;}});
