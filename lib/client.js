window.__ModuleLoader__.load({id:"@harness-remote/dsh-wechat-remote",factory:(require)=>{var module={exports:{}};var exports=module.exports;"use strict";var nr=Object.create;var V=Object.defineProperty;var tr=Object.getOwnPropertyDescriptor;var ar=Object.getOwnPropertyNames;var sr=Object.getPrototypeOf,ir=Object.prototype.hasOwnProperty;var or=(e,r)=>()=>(r||e((r={exports:{}}).exports,r),r.exports),lr=(e,r)=>{for(var s in r)V(e,s,{get:r[s],enumerable:!0})},X=(e,r,s,o)=>{if(r&&typeof r=="object"||typeof r=="function")for(let a of ar(r))!ir.call(e,a)&&a!==s&&V(e,a,{get:()=>r[a],enumerable:!(o=tr(r,a))||o.enumerable});return e};var T=(e,r,s)=>(s=e!=null?nr(sr(e)):{},X(r||!e||!e.__esModule?V(s,"default",{value:e,enumerable:!0}):s,e)),dr=e=>X(V({},"__esModule",{value:!0}),e);var U=or((gr,F)=>{"use strict";var cr=`.hr_b0004b1_root {\r
  box-sizing: border-box;\r
  width: 100%;\r
  max-width: 760px;\r
  color: var(--dsw-alias-label-primary, #171a20);\r
  display: flex;\r
  flex-direction: column;\r
  gap: 14px;\r
}\r
\r
.hr_b0004b1_hero,\r
.hr_b0004b1_connectCard,\r
.hr_b0004b1_pairingCard {\r
  border: 1px solid var(--dsw-alias-border-l2, rgba(128, 140, 160, 0.22));\r
  background: var(--dsw-alias-bg-layer-3, #fff);\r
  border-radius: 12px;\r
}\r
\r
.hr_b0004b1_hero {\r
  min-height: 72px;\r
  display: flex;\r
  align-items: center;\r
  justify-content: space-between;\r
  gap: 20px;\r
  padding: 16px 18px;\r
}\r
\r
.hr_b0004b1_identity {\r
  min-width: 0;\r
  display: flex;\r
  align-items: center;\r
  gap: 12px;\r
}\r
\r
.hr_b0004b1_mark {\r
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
.hr_b0004b1_identityCopy {\r
  min-width: 0;\r
}\r
\r
.hr_b0004b1_identityCopy h3,\r
.hr_b0004b1_identityCopy p,\r
.hr_b0004b1_connectCard p,\r
.hr_b0004b1_pairingHead p,\r
.hr_b0004b1_securityNote {
  margin: 0;\r
}

.hr_b0004b1_companionCard {
  border: 1px solid var(--dsw-alias-state-business-primary, #4e79ff);
  border-left-width: 4px;
  border-radius: 10px;
  background: var(--dsw-alias-bg-layer-3, #fff);
  padding: 14px 16px;
  line-height: 1.6;
  overflow-wrap: anywhere;
}
.hr_b0004b1_companionCard strong { font-size: 14px; }
.hr_b0004b1_companionCard p { margin: 4px 0; font-size: 13px; }
.hr_b0004b1_companionCard small { color: var(--dsw-alias-label-secondary, #4d5564); }
.hr_b0004b1_companionCard progress { display: block; width: 100%; margin: 8px 0; accent-color: #4e79ff; }
.hr_b0004b1_companionCard[data-state='complete'] { border-color: var(--dsw-alias-state-success-primary, #1f9d68); }
.hr_b0004b1_companionCard[data-state='unavailable'], .hr_b0004b1_companionCard[data-state='recovering'] { border-color: #b5861d; }
\r
.hr_b0004b1_identityCopy h3 {\r
  font-size: 15px;\r
  font-weight: 650;\r
  line-height: 22px;\r
}\r
\r
.hr_b0004b1_identityCopy p {\r
  color: var(--dsw-alias-label-tertiary, #7d8492);\r
  font-size: 12px;\r
  line-height: 18px;\r
  overflow: hidden;\r
  text-overflow: ellipsis;\r
  white-space: nowrap;\r
}\r
\r
.hr_b0004b1_overall {\r
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
.hr_b0004b1_overall[data-ready='true'] {\r
  color: var(--dsw-alias-state-success-primary, #1f9d68);\r
}\r
\r
.hr_b0004b1_statusDot {\r
  width: 7px;\r
  height: 7px;\r
  background: var(--dsw-alias-label-tertiary, #8b93a2);\r
  border-radius: 999px;\r
  flex: none;\r
}\r
\r
.hr_b0004b1_statusDot[data-state='ready'] {\r
  background: var(--dsw-alias-state-success-primary, #1f9d68);\r
}\r
\r
.hr_b0004b1_statusDot[data-state='busy'] {\r
  background: var(--dsw-alias-state-business-primary, #4e79ff);\r
  animation: harnessRemotePulse 1.2s ease-in-out infinite;\r
}\r
\r
.hr_b0004b1_capabilities {\r
  grid-template-columns: repeat(3, minmax(0, 1fr));\r
  gap: 10px;\r
  display: grid;\r
}\r
\r
.hr_b0004b1_capability {\r
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
.hr_b0004b1_capability > .hr_b0004b1_statusDot {\r
  margin-top: 6px;\r
}\r
\r
.hr_b0004b1_capabilityCopy {\r
  min-width: 0;\r
  display: flex;\r
  flex-direction: column;\r
  gap: 1px;\r
}\r
\r
.hr_b0004b1_capabilityCopy strong {\r
  font-size: 12.5px;\r
  font-weight: 600;\r
  line-height: 19px;\r
}\r
\r
.hr_b0004b1_capabilityCopy span {\r
  color: var(--dsw-alias-label-tertiary, #7d8492);\r
  font-size: 11px;\r
  line-height: 17px;\r
  overflow: hidden;\r
  text-overflow: ellipsis;\r
  white-space: nowrap;\r
}\r
\r
.hr_b0004b1_notice {\r
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
.hr_b0004b1_notice button,\r
.hr_b0004b1_secondaryButton {\r
  border: 1px solid var(--dsw-alias-border-l2, rgba(128, 140, 160, 0.28));\r
  color: var(--dsw-alias-label-primary, #171a20);\r
  background: var(--dsw-alias-bg-layer-1, #f5f6f8);\r
  border-radius: 7px;\r
  font: inherit;\r
  cursor: pointer;\r
}\r
\r
.hr_b0004b1_notice button {\r
  flex: none;\r
  padding: 3px 9px;\r
}\r
\r
.hr_b0004b1_connectCard {\r
  display: flex;\r
  align-items: center;\r
  justify-content: space-between;\r
  gap: 20px;\r
  padding: 18px;\r
}\r
\r
.hr_b0004b1_connectCard strong,\r
.hr_b0004b1_pairingHead strong {\r
  font-size: 14px;\r
  font-weight: 650;\r
  line-height: 21px;\r
}\r
\r
.hr_b0004b1_connectCard p,\r
.hr_b0004b1_pairingHead p {\r
  max-width: 470px;\r
  color: var(--dsw-alias-label-tertiary, #7d8492);\r
  font-size: 12px;\r
  line-height: 18px;\r
}\r
\r
.hr_b0004b1_primaryButton {\r
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
.hr_b0004b1_primaryButton:hover {\r
  filter: brightness(1.04);\r
}\r
\r
.hr_b0004b1_primaryButton:focus-visible,\r
.hr_b0004b1_secondaryButton:focus-visible,\r
.hr_b0004b1_notice button:focus-visible {\r
  outline: 2px solid var(--dsw-alias-state-business-primary, #4e79ff);\r
  outline-offset: 2px;\r
}\r
\r
.hr_b0004b1_pairingCard {\r
  padding: 18px;\r
}\r
\r
.hr_b0004b1_pairingHead {\r
  display: flex;\r
  align-items: center;\r
  justify-content: space-between;\r
  gap: 16px;\r
}\r
\r
.hr_b0004b1_secondaryButton {\r
  min-height: 32px;\r
  flex: none;\r
  padding: 0 11px;\r
  font-size: 12px;\r
}\r
\r
.hr_b0004b1_secondaryButton:disabled {\r
  cursor: default;\r
  opacity: 0.55;\r
}\r
\r
.hr_b0004b1_qrArea {\r
  min-height: 292px;\r
  margin-top: 16px;\r
  display: flex;\r
  flex-direction: column;\r
  align-items: center;\r
  justify-content: center;\r
  gap: 10px;\r
}\r
\r
.hr_b0004b1_qr,\r
.hr_b0004b1_qrPlaceholder {\r
  box-sizing: border-box;\r
  width: 280px;\r
  height: 280px;\r
  border-radius: 12px;\r
}\r
\r
.hr_b0004b1_qr {\r
  background: #fff;\r
  padding: 10px;\r
  image-rendering: pixelated;\r
}\r
\r
.hr_b0004b1_qrPlaceholder {\r
  color: var(--dsw-alias-label-tertiary, #7d8492);\r
  background: var(--dsw-alias-bg-layer-1, #f5f6f8);\r
  border: 1px dashed var(--dsw-alias-border-l2, rgba(128, 140, 160, 0.28));\r
  display: grid;\r
  place-items: center;\r
  font-size: 12px;\r
}\r
\r
.hr_b0004b1_qrValidity {\r
  color: var(--dsw-alias-label-tertiary, #7d8492);\r
  font-size: 11px;\r
  line-height: 17px;\r
}\r
\r
.hr_b0004b1_securityNote {\r
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
  .hr_b0004b1_statusDot[data-state='busy'] {\r
    animation: none;\r
  }\r
}\r
\r
@media (max-width: 680px) {\r
  .hr_b0004b1_capabilities {\r
    grid-template-columns: minmax(0, 1fr);\r
  }\r
\r
  .hr_b0004b1_connectCard {\r
    align-items: stretch;\r
    flex-direction: column;\r
  }\r
\r
  .hr_b0004b1_primaryButton {\r
    width: 100%;\r
  }\r
\r
  .hr_b0004b1_qrArea {\r
    flex-direction: column;\r
    gap: 12px;\r
  }\r
\r
}\r
.hr_b0004b1_updateCard { border: 1px solid var(--border-color, #ddd); border-radius: 12px; padding: 20px; margin-top: 20px; line-height: 1.6; overflow-wrap: anywhere; }\r
.hr_b0004b1_updateLabel { color: inherit; }\r
.hr_b0004b1_updateLabel[data-severity="none"] { color: #218b5c; }\r
.hr_b0004b1_updateLabel[data-severity="unknown"] { color: var(--text-secondary, #858b96); }\r
.hr_b0004b1_updateLabel[data-severity="required"] { color: #d54052; }\r
.hr_b0004b1_updateLabel[data-severity="recommended"], .hr_b0004b1_updateLabel[data-severity="info"] { color: #b5861d; }\r
.hr_b0004b1_updateProgress { width: 100%; height: 12px; margin-top: 16px; accent-color: #7487ef; }\r
.hr_b0004b1_updateVersions { display: flex; flex-wrap: wrap; gap: 10px 24px; margin: 12px 0; }\r
.hr_b0004b1_updateVersions span { color: var(--text-secondary, #858b96); }\r
.hr_b0004b1_updateVersions strong { color: var(--text-primary, inherit); font-weight: 500; }\r
.hr_b0004b1_updateCommand { display: flex; flex-wrap: wrap; align-items: center; gap: 12px; margin-top: 12px; }\r
.hr_b0004b1_updateCommand code { flex: 1 1 240px; white-space: pre-wrap; overflow-wrap: anywhere; user-select: text; }\r
.hr_b0004b1_updateChecked { display: block; margin-top: 10px; color: var(--text-secondary, #858b96); }\r
`,W="@harness-remote/dsh-wechat-remote/HarnessRemoteSettings.module.css";if(typeof document<"u"&&document.querySelector("style[data-plugin-css="+JSON.stringify(W)+"]")===null){let e=document.createElement("style");e.dataset.plugin="@harness-remote/dsh-wechat-remote",e.dataset.pluginCss=W,e.textContent=cr,document.head.appendChild(e)}F.exports={root:"hr_b0004b1_root",hero:"hr_b0004b1_hero",connectCard:"hr_b0004b1_connectCard",pairingCard:"hr_b0004b1_pairingCard",identity:"hr_b0004b1_identity",mark:"hr_b0004b1_mark",identityCopy:"hr_b0004b1_identityCopy",pairingHead:"hr_b0004b1_pairingHead",securityNote:"hr_b0004b1_securityNote",companionCard:"hr_b0004b1_companionCard",overall:"hr_b0004b1_overall",statusDot:"hr_b0004b1_statusDot",capabilities:"hr_b0004b1_capabilities",capability:"hr_b0004b1_capability",capabilityCopy:"hr_b0004b1_capabilityCopy",notice:"hr_b0004b1_notice",secondaryButton:"hr_b0004b1_secondaryButton",primaryButton:"hr_b0004b1_primaryButton",qrArea:"hr_b0004b1_qrArea",qr:"hr_b0004b1_qr",qrPlaceholder:"hr_b0004b1_qrPlaceholder",qrValidity:"hr_b0004b1_qrValidity",updateCard:"hr_b0004b1_updateCard",updateLabel:"hr_b0004b1_updateLabel",updateProgress:"hr_b0004b1_updateProgress",updateVersions:"hr_b0004b1_updateVersions",updateCommand:"hr_b0004b1_updateCommand",updateChecked:"hr_b0004b1_updateChecked"}});var br={};lr(br,{apply:()=>ur,inject:()=>pr});module.exports=dr(br);var m=require("react"),Y=require("@deepseek-ai/dsh-client-ui-primitives"),l=T(U(),1);var b=require("react"),_=T(U(),1),t=require("react/jsx-runtime");function M({localOrigin:e}){let[r,s]=(0,b.useState)(null),[o,a]=(0,b.useState)(!1),[h,c]=(0,b.useState)(null),[v,k]=(0,b.useState)(""),[y,x]=(0,b.useState)(null),[j,I]=(0,b.useState)(!1),[B,N]=(0,b.useState)(null),[z,J]=(0,b.useState)(!1),P=(0,b.useRef)(!1),u=(0,b.useRef)(!0),S=(0,b.useRef)(0),w=!!(h&&!h.terminal),C=(0,b.useCallback)(async()=>{let d=++S.current;a(!0),k(""),I(!1);try{let p=await fetch(e+"/gate/update/check",{signal:AbortSignal.timeout(1e4)}),i=await p.json();if(!p.ok)throw new Error(i.error||"暂时无法检查更新");if(!i.advice?.current||typeof i.advice.label!="string")throw new Error("更新检查返回信息不完整");u.current&&S.current===d&&(s(i),i.activeJob?.statusOrigin?(x(i.activeJob),c({phase:"recovering",progress:20,message:"正在恢复更新进度…",terminal:!1})):i.mode==="busy"?c({phase:"preparing",progress:0,message:"更新仍在准备或等待确认，请稍后重新检查；不要重复安装。",terminal:!0}):i.lastResult&&c(i.lastResult))}catch(p){u.current&&S.current===d&&(s(null),k(p instanceof Error?p.message:"暂时无法检查更新"))}finally{u.current&&S.current===d&&a(!1)}},[e]);(0,b.useEffect)(()=>(u.current=!0,C(),()=>{u.current=!1,S.current++}),[C]),(0,b.useEffect)(()=>{if(!y||!w)return;let d=!1,p,i=Date.now()+10*6e4,R=async()=>{try{let H=await fetch(y.statusOrigin+"/status",{headers:{Authorization:"Bearer "+y.statusToken},signal:AbortSignal.timeout(4e3)});if(!H.ok)throw new Error("进度暂不可用");let f=await H.json();if(d)return;if(c(f),f.terminal){x(null),f.ok&&N(y.jobId),C();return}}catch{if(d)return;try{let f=await(await fetch(e+"/gate/update/status",{signal:AbortSignal.timeout(3e3)})).json();if(!d&&f.lastResult&&(c(f.lastResult),f.lastResult.terminal)){x(null),f.lastResult.ok&&N(y.jobId),C();return}}catch{}if(Date.now()>i){c({phase:"unknown",progress:0,message:"暂时无法确认更新结果。请重新打开此主机 WebUI 检查版本；不要重复安装或删除节点。",terminal:!0});return}}d||(p=window.setTimeout(()=>void R(),1e3))};return R(),()=>{d=!0,window.clearTimeout(p)}},[y,w,e,C]),(0,b.useEffect)(()=>{if(!B)return;let d=!1,p,i=Date.now()+3e4;J(!1);let R=async()=>{try{let H=await fetch(e+"/gate/update/resume?job="+encodeURIComponent(B),{signal:AbortSignal.timeout(3e3)});if(!H.ok)throw new Error("尚未恢复");let f=await H.json();if(!f.url)throw new Error("缺少恢复地址");let A=new URL(f.url);if(A.origin!==window.location.origin||A.pathname!=="/"||A.username||A.password||A.hash)throw new Error("恢复地址不匹配");d||window.location.replace(A.href)}catch{if(d)return;if(Date.now()>=i){J(!0);return}p=window.setTimeout(()=>void R(),1e3)}};return R(),()=>{d=!0,window.clearTimeout(p)}},[B,e]);let q=async()=>{if(!r?.canInstall||w||o||v||P.current)return;P.current=!0,k(""),c({phase:"download",progress:10,message:"正在下载并验证更新包；当前插件尚未替换",terminal:!1});let d=!1;try{let p=await fetch(e+"/gate/update/start",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({ticket:r.ticket})}),i=await p.json();if(d=!p.ok&&typeof i.error=="string",!p.ok||!i.statusOrigin)throw new Error(i.error||"无法取得更新进度，请重新检查");u.current&&x(i)}catch(p){if(!u.current)return;if(s(i=>i&&{...i,canInstall:!1,ticket:""}),d)c({phase:"failed",progress:0,message:(p instanceof Error?p.message:"更新暂不可用")+"。请重新检查更新。",terminal:!0,ok:!1});else{try{let i=await fetch(e+"/gate/update/status",{signal:AbortSignal.timeout(3e3)}),R=await i.json();if(i.ok&&R.activeJob?.statusOrigin){u.current&&x(R.activeJob);return}}catch{}u.current&&c({phase:"unknown",progress:0,message:"连接中断，暂时无法确认更新结果。请稍后检查更新；不要重复安装或删除节点。",terminal:!0})}}finally{P.current=!1}},L=async()=>{if(!(!r?.manualCommand||o||w))try{await navigator.clipboard.writeText(r.manualCommand),u.current&&I(!0)}catch{u.current&&k("复制失败，请手动选中下方命令复制。")}};return(0,t.jsxs)("div",{className:_.default.updateCard,children:[(0,t.jsxs)("div",{className:_.default.pairingHead,children:[(0,t.jsx)("div",{children:(0,t.jsx)("strong",{children:"插件更新"})}),(0,t.jsx)("button",{type:"button",className:_.default.secondaryButton,disabled:o||w,onClick:()=>void C(),children:o?"检查中…":"检查更新"})]}),r?(0,t.jsxs)(t.Fragment,{children:[r.channel==="preview"?(0,t.jsx)("span",{className:_.default.updateLabel,"data-severity":"recommended",children:"预览通道"}):null,(0,t.jsxs)("div",{className:_.default.updateVersions,children:[(0,t.jsxs)("span",{children:["DSH ",(0,t.jsx)("strong",{children:r.advice.current.agentVersion||"未知"})]}),(0,t.jsxs)("span",{children:["插件 ",(0,t.jsx)("strong",{children:r.advice.current.pluginVersion||"未知"})]})]}),o?null:(0,t.jsxs)(t.Fragment,{children:[(0,t.jsx)("strong",{className:_.default.updateLabel,"data-severity":r.advice.severity,role:"status",children:r.advice.label}),r.advice.targetVersion?(0,t.jsxs)("p",{children:["可更新至 ",r.advice.targetVersion,r.mode==="manual"?" · 需手动更新":""]}):null,r.advice.severity==="unknown"||r.advice.severity==="required"||r.mode==="manual"||r.mode==="busy"?(0,t.jsxs)("details",{children:[(0,t.jsx)("summary",{children:r.mode==="manual"?"手动更新说明":"查看说明"}),r.reason?(0,t.jsx)("p",{children:r.reason}):null,(0,t.jsx)("p",{children:r.advice.message})]}):null,r.mode==="manual"&&r.manualCommand?(0,t.jsxs)("div",{className:_.default.updateCommand,children:[(0,t.jsx)("code",{children:r.manualCommand}),(0,t.jsx)("button",{type:"button",className:_.default.secondaryButton,disabled:w,onClick:()=>void L(),children:j?"已复制":"复制命令"})]}):null,r.canInstall?(0,t.jsxs)(t.Fragment,{children:[(0,t.jsx)("button",{type:"button",className:_.default.primaryButton,disabled:w||!!v,onClick:()=>void q(),children:"更新并重启"}),(0,t.jsx)("small",{className:_.default.updateChecked,children:"会短暂断开连接，保留原配对和会话"})]}):null,r.advice.checkedAt&&r.advice.severity!=="unknown"?(0,t.jsxs)("small",{className:_.default.updateChecked,children:["最近检查 ",new Date(r.advice.checkedAt).toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"})]}):null]})]}):null,v?(0,t.jsx)("p",{role:"alert",children:v}):null,h?(0,t.jsxs)("div",{role:"status","aria-live":"polite",children:[!h.terminal||h.ok===!0?(0,t.jsx)("progress",{className:_.default.updateProgress,max:100,value:h.progress}):null,(0,t.jsx)("p",{children:h.message}),z?(0,t.jsx)("p",{role:"alert",children:"插件已完成更新，但未能自动打开 WebUI。请使用 DSH 启动时显示的地址打开，无需重复更新。"}):null]}):null]})}var $=T(U(),1),D=require("react/jsx-runtime");function K({value:e}){if(!e||e.state==="idle"||!e.message)return null;let r={pending:"另一端插件更新待处理",busy:"等待另一端任务结束",preparing:"正在准备另一端插件更新",installing:"正在更新另一端插件",verifying:"正在核验另一端恢复",recovering:"正在恢复另一端原插件","restart-required":"另一端待启动或重启确认",complete:"两端插件已对齐",unavailable:"另一端未确认更新成功"},s=["preparing","installing","verifying","recovering"].includes(e.state);return(0,D.jsxs)("aside",{className:$.default.companionCard,"data-state":e.state,role:"status","aria-live":"polite",children:[(0,D.jsx)("strong",{children:r[e.state]||"另一端插件更新状态"}),(0,D.jsx)("p",{children:e.message}),s?(0,D.jsx)("progress",{"aria-label":"另一端插件更新进度"}):null,e.state==="busy"?(0,D.jsx)("small",{children:"不用手动停止任务。请保持两端运行，空闲后会继续检查。"}):s?(0,D.jsx)("small",{children:"请保持两端当前状态，暂勿退出、重启或重复安装。关闭本设置页不会取消更新。"}):e.state==="unavailable"?(0,D.jsx)("small",{children:"当前节点可继续使用；请在另一端核对版本，必要时使用其原安装入口。"}):null]})}async function O(e,r,s=fetch){let o=await e(),a=o.gate;if(!a)throw new Error("当前节点没有提供配对入口");let h=a.profileScope==="desktop",c=a.localDoor?.port,v=Number.isSafeInteger(c)&&c>=1&&c<=65535?`http://127.0.0.1:${c}`:null;if(a.management==="authenticated-rpc")return{host:o,runtime:a,localOrigin:h?null:v,status:()=>r("status"),pairCode:()=>r("pair-code")};if(h||a.management==="unavailable"||!v||a.localDoor.state!=="listening")throw new Error("当前节点配对入口尚未就绪");let k=async y=>{let x=await s(v+y,{cache:"no-store"});if(!x.ok)throw new Error(`配对请求失败 (${x.status})`);return x.json()};return{host:o,runtime:a,localOrigin:v,status:()=>k("/gate/status"),pairCode:()=>k("/pair/code")}}var n=require("react/jsx-runtime");function Z({ok:e,busy:r=!1}){return(0,n.jsx)("span",{className:l.default.statusDot,"data-state":r?"busy":e?"ready":"off","aria-hidden":!0})}function Q({title:e,detail:r,ok:s,busy:o=!1}){return(0,n.jsxs)("div",{className:l.default.capability,children:[(0,n.jsx)(Z,{ok:s,busy:o}),(0,n.jsxs)("div",{className:l.default.capabilityCopy,children:[(0,n.jsx)("strong",{children:e}),(0,n.jsx)("span",{children:r})]})]})}function rr({describeHost:e,callManagement:r}){let[s,o]=(0,m.useState)("loading"),[a,h]=(0,m.useState)("idle"),[c,v]=(0,m.useState)(null),[k,y]=(0,m.useState)(null),[x,j]=(0,m.useState)(null),[I,B]=(0,m.useState)(null),[N,z]=(0,m.useState)(null),[J,P]=(0,m.useState)(null),u=(0,m.useRef)(!0),S=(0,m.useRef)(!1),w=(0,m.useCallback)(async()=>{if(!S.current){S.current=!0;try{let g=await O(e,r);if(!u.current)return;y(g.runtime),B(g.localOrigin),j(g.host);let E=await g.status();if(!u.current)return;v(E),y(E.gate??g.runtime),o("ready"),P(null)}catch{if(!u.current)return;o("error"),P("连接服务暂未就绪。请确认 DSH 正在运行，然后重试。")}finally{S.current=!1}}},[e,r]),C=(0,m.useCallback)(async()=>{h("loading"),P(null);try{let g=await O(e,r);if(!u.current)return;y(g.runtime),j(g.host);let[E,G]=await Promise.all([g.pairCode(),g.status()]);if(!u.current)return;z(E),h("ready"),G&&(v(G),y(G.gate??g.runtime),o("ready"))}catch{if(!u.current)return;z(null),h("error"),P("暂时无法生成配对二维码，请确认电脑联网后重试。")}},[e,r]);(0,m.useEffect)(()=>{u.current=!0,w();let g=window.setInterval(()=>void w(),2e3);return()=>{u.current=!1,window.clearInterval(g)}},[w]),(0,m.useEffect)(()=>{if(a!=="ready"||!N?.expiresAt)return;let g=Math.max(1e3,N.expiresAt-Date.now()-6e4),E=window.setTimeout(()=>void C(),g);return()=>window.clearTimeout(E)},[C,N?.expiresAt,a]);let q=c?.publicRelay,L=q?.state==="enrolling"||q?.state==="connecting",d=q?.remoteAccess?.status,p=q?.state==="online"&&d==="active",i=d==="suspended"?"账户公网访问已暂停":d==="expired"?"公网访问已到期":d==="not_entitled"?"请在小程序中使用自助开通方式":d!=="active"?"配对后由小程序账户决定":p?"可在外网安全连接":L?"正在准备远程连接":"暂时离线",R=k?.publicDoor??c?.gate?.publicDoor,H=s==="ready"&&!!c?.lan.ip&&R?.state==="listening",f=q?.enabled===!0&&q.state!=="disabled",A=c?.agent?.agentName||x?.agentName||"DeepSeek Harness",er=c?.agent?.hostName||x?.computerName||"当前电脑";return(0,n.jsxs)("section",{className:l.default.root,"aria-labelledby":"harness-remote-title",children:[(0,n.jsxs)("div",{className:l.default.hero,children:[(0,n.jsxs)("div",{className:l.default.identity,children:[(0,n.jsx)("span",{className:l.default.mark,"aria-hidden":!0,children:(0,n.jsx)(Y.FishLogo,{size:28})}),(0,n.jsxs)("div",{className:l.default.identityCopy,children:[(0,n.jsx)("h3",{id:"harness-remote-title",children:"Agent远程管理助手"}),(0,n.jsxs)("p",{children:[A,(0,n.jsx)("span",{"aria-hidden":!0,children:" · "}),er]})]})]}),(0,n.jsxs)("span",{className:l.default.overall,"data-ready":s==="ready",children:[(0,n.jsx)(Z,{ok:s==="ready",busy:s==="loading"}),s==="loading"?"检测中":s==="ready"?"服务正常":"暂不可用"]})]}),(0,n.jsx)(K,{value:c?.companionUpdate}),(0,n.jsxs)("div",{className:l.default.capabilities,children:[(0,n.jsx)(Q,{title:"局域网直连",detail:s==="loading"?"检测中":H?"已就绪":"暂不可用",ok:H,busy:s==="loading"}),(0,n.jsx)(Q,{title:"远程访问",detail:i,ok:p,busy:L||s==="loading"}),(0,n.jsx)(Q,{title:"账号连接保护",detail:f?"已启用":"配对后启用",ok:f,busy:s==="loading"})]}),J!==null?(0,n.jsxs)("div",{className:l.default.notice,role:"status",children:[(0,n.jsx)("span",{children:J}),(0,n.jsx)("button",{type:"button",onClick:()=>void w(),children:"重试"})]}):null,a==="idle"?(0,n.jsxs)("div",{className:l.default.connectCard,children:[(0,n.jsxs)("div",{children:[(0,n.jsx)("strong",{children:"添加到微信"}),(0,n.jsx)("p",{children:"打开「Agent远程管理助手」→ 添加节点，扫描配对二维码。"})]}),(0,n.jsx)("button",{type:"button",className:l.default.primaryButton,onClick:()=>void C(),children:"生成二维码"})]}):(0,n.jsxs)("div",{className:l.default.pairingCard,children:[(0,n.jsxs)("div",{className:l.default.pairingHead,children:[(0,n.jsxs)("div",{children:[(0,n.jsx)("strong",{children:"扫描二维码"}),(0,n.jsx)("p",{children:"小程序「设置 → 添加节点」"})]}),(0,n.jsx)("button",{type:"button",className:l.default.secondaryButton,disabled:a==="loading",onClick:()=>void C(),children:a==="loading"?"生成中…":"重新生成"})]}),(0,n.jsxs)("div",{className:l.default.qrArea,children:[a==="ready"&&N!==null?(0,n.jsx)("img",{className:l.default.qr,src:N.qrDataUrl,alt:"Agent远程管理助手配对二维码"}):(0,n.jsx)("div",{className:l.default.qrPlaceholder,"aria-live":"polite",children:a==="error"?"生成失败":"正在生成…"}),a==="ready"&&N!==null?(0,n.jsx)("small",{className:l.default.qrValidity,children:"二维码约 15 分钟内有效"}):null]}),(0,n.jsx)("p",{className:l.default.securityNote,children:N?.mode==="public-relay"?"配对后自动选择更快的连接；远程内容端到端加密。":"当前可通过同一局域网连接。"})]}),I?(0,n.jsx)(M,{localOrigin:I}):null,k?.profileScope==="desktop"?(0,n.jsx)("p",{className:l.default.securityNote,children:"插件更新请使用桌面应用的插件管理。"}):null]})}var pr=["slots","connection"];function ur(e){let r=async o=>{let a=await e.connection.rpc.call("/wechat-remote-management",o,{});if(!a.ok)throw new Error(a.error.message);return a.value},s=async()=>{let o=await e.connection.rpc.call("/api","wechatHost/describe",{args:{request:{}}});if(!o.ok)throw new Error(`wechatHost/describe: ${o.error.code}`);let a=o.value;if(a?.ok!==!0||a.value===void 0)throw new Error("wechatHost/describe returned an invalid result");return a.value};e.slots.inject("settings.section",()=>e.slots.register({name:"settings.section",id:"harness-remote",order:30,label:"微信连接",inject:()=>({describeHost:s,callManagement:r})},rr))}

return module.exports;}});
