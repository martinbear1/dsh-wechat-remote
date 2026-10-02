window.__ModuleLoader__.load({id:"@harness-remote/dsh-wechat-remote",factory:(require)=>{var module={exports:{}};var exports=module.exports;"use strict";var we=Object.create;var U=Object.defineProperty;var _e=Object.getOwnPropertyDescriptor;var ke=Object.getOwnPropertyNames;var xe=Object.getPrototypeOf,Ce=Object.prototype.hasOwnProperty;var Se=(r,e)=>()=>(e||r((e={exports:{}}).exports,e),e.exports),Pe=(r,e)=>{for(var t in e)U(r,t,{get:e[t],enumerable:!0})},Q=(r,e,t,a)=>{if(e&&typeof e=="object"||typeof e=="function")for(let n of ke(e))!Ce.call(r,n)&&n!==t&&U(r,n,{get:()=>e[n],enumerable:!(a=_e(e,n))||a.enumerable});return r};var I=(r,e,t)=>(t=r!=null?we(xe(r)):{},Q(e||!r||!r.__esModule?U(t,"default",{value:r,enumerable:!0}):t,r)),Ne=r=>Q(U({},"__esModule",{value:!0}),r);var N=Se((Ee,K)=>{"use strict";var De=`.hr_dcc4a84_root {\r
  box-sizing: border-box;\r
  width: 100%;\r
  max-width: 760px;\r
  color: var(--dsw-alias-label-primary, #171a20);\r
  display: flex;\r
  flex-direction: column;\r
  gap: 14px;\r
}\r
\r
.hr_dcc4a84_hero,\r
.hr_dcc4a84_connectCard,\r
.hr_dcc4a84_pairingCard {\r
  border: 1px solid var(--dsw-alias-border-l2, rgba(128, 140, 160, 0.22));\r
  background: var(--dsw-alias-bg-layer-3, #fff);\r
  border-radius: 12px;\r
}\r
\r
.hr_dcc4a84_hero {\r
  min-height: 72px;\r
  display: flex;\r
  align-items: center;\r
  justify-content: space-between;\r
  gap: 20px;\r
  padding: 16px 18px;\r
}\r
\r
.hr_dcc4a84_identity {\r
  min-width: 0;\r
  display: flex;\r
  align-items: center;\r
  gap: 12px;\r
}\r
\r
.hr_dcc4a84_mark {\r
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
.hr_dcc4a84_identityCopy {\r
  min-width: 0;\r
}\r
\r
.hr_dcc4a84_identityCopy h3,\r
.hr_dcc4a84_identityCopy p,\r
.hr_dcc4a84_connectCard p,\r
.hr_dcc4a84_pairingHead p,\r
.hr_dcc4a84_securityNote {\r
  margin: 0;\r
}\r
\r
.hr_dcc4a84_sidebarButton { display: flex; align-items: center; gap: 10px; width: 100%; min-height: 38px; padding: 8px 12px; border: 0; border-radius: 8px; background: transparent; color: var(--dsw-alias-label-secondary, #4d5564); font: inherit; font-size: 14px; cursor: pointer; text-align: left; }\r
.hr_dcc4a84_sidebarButton:hover { background: var(--dsw-alias-bg-layer-2, #eef1f5); color: var(--dsw-alias-label-primary, #171a20); }\r
.hr_dcc4a84_sidebarButton[data-wide='false'] { width: 36px; min-height: 36px; padding: 8px; justify-content: center; }\r
.hr_dcc4a84_sidebarButton svg { flex: none; }\r
.hr_dcc4a84_sidebarButton:focus-visible { outline: 2px solid var(--dsw-alias-state-business-primary, #4e79ff); outline-offset: 2px; }\r
.hr_dcc4a84_actions { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 16px; }\r
.hr_dcc4a84_pageDialog.hr_dcc4a84_pageDialog { width: min(820px, 100%); max-height: 100%; }\r
.hr_dcc4a84_pageDialogContent.hr_dcc4a84_pageDialogContent { min-height: 0; overflow-y: auto; }\r
.hr_dcc4a84_helpText { color: var(--dsw-alias-label-secondary, #647084); font-size: 12px; line-height: 1.7; margin: 8px 0; }\r
.hr_dcc4a84_linkedSection h4 { margin: 4px 0 10px; font-size: 13px; }\r
\r
.hr_dcc4a84_companionCard {\r
  border: 1px solid var(--dsw-alias-state-business-primary, #4e79ff);\r
  border-left-width: 4px;\r
  border-radius: 10px;\r
  background: var(--dsw-alias-bg-layer-3, #fff);\r
  padding: 14px 16px;\r
  line-height: 1.6;\r
  overflow-wrap: anywhere;\r
}\r
.hr_dcc4a84_companionCard strong { font-size: 14px; }\r
.hr_dcc4a84_companionCard p { margin: 4px 0; font-size: 13px; }\r
.hr_dcc4a84_companionCard small { color: var(--dsw-alias-label-secondary, #4d5564); }\r
.hr_dcc4a84_companionCard progress { display: block; width: 100%; margin: 8px 0; accent-color: #4e79ff; }\r
.hr_dcc4a84_companionCard[data-state='complete'] { border-color: var(--dsw-alias-state-success-primary, #1f9d68); }\r
.hr_dcc4a84_companionCard[data-state='unavailable'], .hr_dcc4a84_companionCard[data-state='recovering'] { border-color: #b5861d; }\r
\r
.hr_dcc4a84_identityCopy h3 {\r
  font-size: 15px;\r
  font-weight: 650;\r
  line-height: 22px;\r
}\r
\r
.hr_dcc4a84_identityCopy p {\r
  color: var(--dsw-alias-label-tertiary, #7d8492);\r
  font-size: 12px;\r
  line-height: 18px;\r
  overflow: hidden;\r
  text-overflow: ellipsis;\r
  white-space: nowrap;\r
}\r
\r
.hr_dcc4a84_overall {\r
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
.hr_dcc4a84_overall[data-ready='true'] {\r
  color: var(--dsw-alias-state-success-primary, #1f9d68);\r
}\r
\r
.hr_dcc4a84_statusDot {\r
  width: 7px;\r
  height: 7px;\r
  background: var(--dsw-alias-label-tertiary, #8b93a2);\r
  border-radius: 999px;\r
  flex: none;\r
}\r
\r
.hr_dcc4a84_statusDot[data-state='ready'] {\r
  background: var(--dsw-alias-state-success-primary, #1f9d68);\r
}\r
\r
.hr_dcc4a84_statusDot[data-state='busy'] {\r
  background: var(--dsw-alias-state-business-primary, #4e79ff);\r
  animation: harnessRemotePulse 1.2s ease-in-out infinite;\r
}\r
\r
.hr_dcc4a84_capabilities {\r
  grid-template-columns: repeat(3, minmax(0, 1fr));\r
  gap: 10px;\r
  display: grid;\r
}\r
\r
.hr_dcc4a84_capability {\r
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
.hr_dcc4a84_capability > .hr_dcc4a84_statusDot {\r
  margin-top: 6px;\r
}\r
\r
.hr_dcc4a84_capabilityCopy {\r
  min-width: 0;\r
  display: flex;\r
  flex-direction: column;\r
  gap: 1px;\r
}\r
\r
.hr_dcc4a84_capabilityCopy strong {\r
  font-size: 12.5px;\r
  font-weight: 600;\r
  line-height: 19px;\r
}\r
\r
.hr_dcc4a84_capabilityCopy span {\r
  color: var(--dsw-alias-label-tertiary, #7d8492);\r
  font-size: 11px;\r
  line-height: 17px;\r
  overflow: hidden;\r
  text-overflow: ellipsis;\r
  white-space: nowrap;\r
}\r
\r
.hr_dcc4a84_notice {\r
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
.hr_dcc4a84_notice button,\r
.hr_dcc4a84_secondaryButton {\r
  border: 1px solid var(--dsw-alias-border-l2, rgba(128, 140, 160, 0.28));\r
  color: var(--dsw-alias-label-primary, #171a20);\r
  background: var(--dsw-alias-bg-layer-1, #f5f6f8);\r
  border-radius: 7px;\r
  font: inherit;\r
  cursor: pointer;\r
}\r
\r
.hr_dcc4a84_notice button {\r
  flex: none;\r
  padding: 3px 9px;\r
}\r
\r
.hr_dcc4a84_connectCard {\r
  display: flex;\r
  align-items: center;\r
  justify-content: space-between;\r
  gap: 20px;\r
  padding: 18px;\r
}\r
\r
.hr_dcc4a84_connectCard strong,\r
.hr_dcc4a84_pairingHead strong {\r
  font-size: 14px;\r
  font-weight: 650;\r
  line-height: 21px;\r
}\r
\r
.hr_dcc4a84_connectCard p,\r
.hr_dcc4a84_pairingHead p {\r
  max-width: 470px;\r
  color: var(--dsw-alias-label-tertiary, #7d8492);\r
  font-size: 12px;\r
  line-height: 18px;\r
}\r
\r
.hr_dcc4a84_primaryButton {\r
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
.hr_dcc4a84_primaryButton:hover {\r
  filter: brightness(1.04);\r
}\r
\r
.hr_dcc4a84_primaryButton:focus-visible,\r
.hr_dcc4a84_secondaryButton:focus-visible,\r
.hr_dcc4a84_notice button:focus-visible {\r
  outline: 2px solid var(--dsw-alias-state-business-primary, #4e79ff);\r
  outline-offset: 2px;\r
}\r
\r
.hr_dcc4a84_pairingCard {\r
  padding: 18px;\r
}\r
\r
.hr_dcc4a84_pairingHead {\r
  display: flex;\r
  align-items: center;\r
  justify-content: space-between;\r
  gap: 16px;\r
}\r
\r
.hr_dcc4a84_secondaryButton {\r
  min-height: 32px;\r
  flex: none;\r
  padding: 0 11px;\r
  font-size: 12px;\r
}\r
\r
.hr_dcc4a84_secondaryButton:disabled,\r
.hr_dcc4a84_primaryButton:disabled {\r
  cursor: default;\r
  opacity: 0.55;\r
}\r
\r
.hr_dcc4a84_qrArea {\r
  min-height: 292px;\r
  margin-top: 16px;\r
  display: flex;\r
  flex-direction: column;\r
  align-items: center;\r
  justify-content: center;\r
  gap: 10px;\r
}\r
\r
.hr_dcc4a84_qr,\r
.hr_dcc4a84_qrPlaceholder {\r
  box-sizing: border-box;\r
  width: 280px;\r
  height: 280px;\r
  border-radius: 12px;\r
}\r
\r
.hr_dcc4a84_qr {\r
  background: #fff;\r
  padding: 10px;\r
  image-rendering: pixelated;\r
}\r
\r
.hr_dcc4a84_qrPlaceholder {\r
  color: var(--dsw-alias-label-tertiary, #7d8492);\r
  background: var(--dsw-alias-bg-layer-1, #f5f6f8);\r
  border: 1px dashed var(--dsw-alias-border-l2, rgba(128, 140, 160, 0.28));\r
  display: grid;\r
  place-items: center;\r
  font-size: 12px;\r
}\r
\r
.hr_dcc4a84_qrValidity {\r
  color: var(--dsw-alias-label-tertiary, #7d8492);\r
  font-size: 11px;\r
  line-height: 17px;\r
}\r
\r
.hr_dcc4a84_securityNote {\r
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
  .hr_dcc4a84_statusDot[data-state='busy'] {\r
    animation: none;\r
  }\r
}\r
\r
@media (max-width: 680px) {\r
  .hr_dcc4a84_capabilities {\r
    grid-template-columns: minmax(0, 1fr);\r
  }\r
\r
  .hr_dcc4a84_connectCard {\r
    align-items: stretch;\r
    flex-direction: column;\r
  }\r
\r
  .hr_dcc4a84_primaryButton {\r
    width: 100%;\r
  }\r
\r
  .hr_dcc4a84_qrArea {\r
    flex-direction: column;\r
    gap: 12px;\r
  }\r
\r
}\r
.hr_dcc4a84_updateCard { border: 1px solid var(--dsw-alias-border-l2, #ddd); background: var(--dsw-alias-bg-layer-3, #fff); border-radius: 12px; padding: 18px; line-height: 1.6; font-size: 13px; overflow-wrap: anywhere; }\r
.hr_dcc4a84_updateLabel { color: inherit; }\r
.hr_dcc4a84_updateLabel[data-severity="none"] { color: #218b5c; }\r
.hr_dcc4a84_updateLabel[data-severity="unknown"] { color: var(--text-secondary, #858b96); }\r
.hr_dcc4a84_updateLabel[data-severity="required"] { color: #d54052; }\r
.hr_dcc4a84_updateLabel[data-severity="recommended"], .hr_dcc4a84_updateLabel[data-severity="info"] { color: #b5861d; }\r
.hr_dcc4a84_updateProgress { width: 100%; height: 12px; margin-top: 16px; accent-color: #7487ef; }\r
.hr_dcc4a84_updateVersions { display: flex; flex-wrap: wrap; gap: 10px 24px; margin: 12px 0; }\r
.hr_dcc4a84_updateVersions span { color: var(--text-secondary, #858b96); }\r
.hr_dcc4a84_updateVersions strong { color: var(--text-primary, inherit); font-weight: 500; }\r
.hr_dcc4a84_updateCommand { display: flex; flex-wrap: wrap; align-items: center; gap: 12px; margin-top: 12px; }\r
.hr_dcc4a84_updateCommand code { flex: 1 1 240px; white-space: pre-wrap; overflow-wrap: anywhere; user-select: text; }\r
.hr_dcc4a84_updateChecked { display: block; margin-top: 10px; color: var(--text-secondary, #858b96); }\r
`,Z="@harness-remote/dsh-wechat-remote/HarnessRemoteSettings.module.css";if(typeof document<"u"&&document.querySelector("style[data-plugin-css="+JSON.stringify(Z)+"]")===null){let r=document.createElement("style");r.dataset.plugin="@harness-remote/dsh-wechat-remote",r.dataset.pluginCss=Z,r.textContent=De,document.head.appendChild(r)}K.exports={root:"hr_dcc4a84_root",hero:"hr_dcc4a84_hero",connectCard:"hr_dcc4a84_connectCard",pairingCard:"hr_dcc4a84_pairingCard",identity:"hr_dcc4a84_identity",mark:"hr_dcc4a84_mark",identityCopy:"hr_dcc4a84_identityCopy",pairingHead:"hr_dcc4a84_pairingHead",securityNote:"hr_dcc4a84_securityNote",sidebarButton:"hr_dcc4a84_sidebarButton",actions:"hr_dcc4a84_actions",pageDialog:"hr_dcc4a84_pageDialog",pageDialogContent:"hr_dcc4a84_pageDialogContent",helpText:"hr_dcc4a84_helpText",linkedSection:"hr_dcc4a84_linkedSection",companionCard:"hr_dcc4a84_companionCard",overall:"hr_dcc4a84_overall",statusDot:"hr_dcc4a84_statusDot",capabilities:"hr_dcc4a84_capabilities",capability:"hr_dcc4a84_capability",capabilityCopy:"hr_dcc4a84_capabilityCopy",notice:"hr_dcc4a84_notice",secondaryButton:"hr_dcc4a84_secondaryButton",primaryButton:"hr_dcc4a84_primaryButton",qrArea:"hr_dcc4a84_qrArea",qr:"hr_dcc4a84_qr",qrPlaceholder:"hr_dcc4a84_qrPlaceholder",qrValidity:"hr_dcc4a84_qrValidity",updateCard:"hr_dcc4a84_updateCard",updateLabel:"hr_dcc4a84_updateLabel",updateProgress:"hr_dcc4a84_updateProgress",updateVersions:"hr_dcc4a84_updateVersions",updateCommand:"hr_dcc4a84_updateCommand",updateChecked:"hr_dcc4a84_updateChecked"}});var Re={};Pe(Re,{apply:()=>He,inject:()=>Ie});module.exports=Ne(Re);var ae=require("react"),ne=require("@deepseek-ai/dsh-client-ui-primitives");var q=I(N(),1),_=require("react/jsx-runtime");function Y({value:r,onDecide:e,deciding:t=!1}){if(!r||r.state==="idle"||!r.message)return null;let a={"confirmation-required":"是否更新下方指定端的插件？",deferred:"已暂缓此次联动更新",pending:"联动更新待处理",busy:"等待待更新端的任务结束",preparing:"正在准备联动更新",installing:"正在安装插件更新",verifying:"正在核验更新后的恢复状态",recovering:"正在恢复更新前的插件","restart-required":"待更新端需启动或重启确认","self-restart-required":"当前端待重启，尚未生效",unverified:"两端更新状态待核实",complete:"两端插件已对齐",unavailable:"联动更新尚未确认成功"},n=["preparing","installing","verifying","recovering"].includes(r.state);return(0,_.jsxs)("aside",{className:q.default.companionCard,"data-state":r.state,role:"status","aria-live":"polite",children:[(0,_.jsx)("strong",{children:a[r.state]||"另一端插件更新状态"}),(0,_.jsx)("p",{children:r.message}),r.versions?(0,_.jsxs)("small",{children:[r.versions.current==="desktop"?"Desktop":"Web","：运行 ",r.versions.running," · 已安装 ",r.versions.installed??"未确认","；",r.versions.peer==="desktop"?"Desktop":"Web","：已安装 ",r.versions.peerInstalled??"未确认或未启用"]}):null,["confirmation-required","deferred"].includes(r.state)&&r.offerId&&e?(0,_.jsxs)("div",{children:[(0,_.jsx)("button",{type:"button",className:q.default.primaryButton,disabled:t,onClick:()=>e("approve"),children:"确认并等待空闲后更新"}),(0,_.jsx)("button",{type:"button",className:q.default.secondaryButton,disabled:t,onClick:()=>e("later"),children:"稍后再说"})]}):null,n?(0,_.jsx)("progress",{"aria-label":"联动更新进度"}):null,r.state==="busy"?(0,_.jsx)("small",{children:"不用手动停止任务。请保持两端运行，空闲后会继续检查。"}):n?(0,_.jsx)("small",{children:"请保持两端当前状态，暂勿退出、重启或重复安装。关闭本设置页不会取消更新。"}):r.state==="unavailable"?(0,_.jsx)("small",{children:"请在待更新端核对版本，必要时使用其原安装入口。"}):null]})}async function ee(r,e,t=fetch){let a=await r(),n=a.gate;if(!n)throw new Error("当前节点没有提供配对入口");let s=n.profileScope==="desktop",i=n.localDoor?.port,o=Number.isSafeInteger(i)&&i>=1&&i<=65535?`http://127.0.0.1:${i}`:null;if(n.management==="authenticated-rpc")return{host:a,runtime:n,localOrigin:s?null:o,status:()=>e("status"),pairCode:()=>e("pair-code"),decide:(p,m)=>e("companion-decision",{offerId:p,action:m})};if(s||n.management==="unavailable"||!o||n.localDoor.state!=="listening")throw new Error("当前节点配对入口尚未就绪");let v=async p=>{let m=await t(o+p,{cache:"no-store"});if(!m.ok)throw new Error(`配对请求失败 (${m.status})`);return m.json()};return{host:a,runtime:n,localOrigin:o,status:()=>v("/gate/status"),pairCode:()=>v("/pair/code"),decide:async(p,m)=>{let u=await t(o+"/gate/companion/decision",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({offerId:p,action:m})});if(!u.ok)throw new Error("更新通知已变化，请刷新后重试");return u.json()}}}var B=class{constructor(e,t=globalThis.fetch){this.origin=e;this.fetcher=t.bind(globalThis)}value={check:null,checking:!1,progress:null,error:"",copied:!1,resumeFailed:!1};listeners=new Set;reading;installing=!1;disposed=!1;job=null;timer;pollGeneration=0;recovering=!1;fetcher;getSnapshot=()=>this.value;subscribe=e=>this.disposed?()=>{}:(this.listeners.add(e),this.listeners.size===1&&this.refresh(),()=>{this.listeners.delete(e)});patch(e){if(!this.disposed){this.value={...this.value,...e};for(let t of this.listeners)t()}}refresh=()=>this.disposed?Promise.resolve():this.reading?this.reading:(this.patch({checking:!0,error:"",copied:!1}),this.reading=(async()=>{try{let e=await this.fetcher(this.origin+"/gate/update/check",{signal:AbortSignal.timeout(1e4)}),t=await e.json();if(!e.ok)throw new Error(t.error||"暂时无法检查更新");if(!t.advice?.current||typeof t.advice.label!="string")throw new Error("更新检查返回信息不完整");if(this.patch({check:t}),this.installing||this.job||this.recovering)return;t.activeJob?.statusOrigin?this.follow(t.activeJob):t.lastResult?.phase==="unknown"?this.patch({progress:t.lastResult}):t.mode==="busy"?this.patch({progress:{phase:"preparing",progress:0,message:"更新仍在准备或等待确认，请稍后重新检查；不要重复安装。",terminal:!0}}):this.patch({progress:t.lastResult??null})}catch(e){this.patch({check:null,error:e instanceof Error?e.message:"暂时无法检查更新"})}finally{this.patch({checking:!1})}})().finally(()=>{this.reading=void 0}),this.reading);follow(e){if(this.disposed||this.job?.jobId===e.jobId)return;this.job=e;let t=++this.pollGeneration,a=Date.now()+10*6e4;clearTimeout(this.timer),this.patch({progress:{phase:"recovering",progress:0,message:"正在恢复更新进度…",terminal:!1}});let n=async()=>{if(this.disposed||t!==this.pollGeneration)return;let s;try{let i=await this.fetcher(e.statusOrigin+"/status",{headers:{Authorization:"Bearer "+e.statusToken},signal:AbortSignal.timeout(4e3)});if(!i.ok)throw new Error("进度暂不可用");let o=await i.json();if(o.jobId!==e.jobId||typeof o.terminal!="boolean"||typeof o.message!="string")throw new Error("进度不匹配");s=o}catch{try{let i=await this.fetcher(this.origin+"/gate/update/status",{signal:AbortSignal.timeout(3e3)}),o=await i.json();i.ok&&o.lastResult?.jobId===e.jobId&&(s=o.lastResult)}catch{}}if(!(this.disposed||t!==this.pollGeneration)){if(s&&(this.patch({progress:s}),s.terminal)){this.job=null,s.ok?this.resume(e.jobId):this.refresh();return}if(Date.now()>a){this.job=null,this.patch({progress:{phase:"unknown",progress:0,message:"暂时无法确认更新结果。请重新打开此主机 WebUI 检查版本；不要重复安装或删除节点。",terminal:!0}});return}this.timer=setTimeout(()=>void n(),1e3)}};n()}async resume(e){this.recovering=!0;let t=Date.now()+3e4,a=async()=>{try{let n=await this.fetcher(this.origin+"/gate/update/resume?job="+encodeURIComponent(e),{signal:AbortSignal.timeout(3e3)});if(!n.ok)throw new Error("尚未恢复");let s=await n.json();if(!s.url)throw new Error("缺少恢复地址");let i=new URL(s.url);if(i.origin!==window.location.origin||i.pathname!=="/"||i.username||i.password||i.hash)throw new Error("恢复地址不匹配");this.disposed||window.location.replace(i.href)}catch{if(this.disposed)return;if(Date.now()>=t){this.recovering=!1,this.patch({resumeFailed:!0});return}this.timer=setTimeout(()=>void a(),1e3)}};await a()}install=async()=>{let{check:e,checking:t,error:a,progress:n}=this.value;if(this.disposed||!e?.canInstall||t||a||n&&!n.terminal||this.installing||this.job||this.recovering)return;this.installing=!0,this.patch({error:"",check:{...e,canInstall:!1,ticket:""},progress:{phase:"download",progress:10,message:"正在下载并验证更新包；当前插件尚未替换",terminal:!1}});let s=!1;try{let i=await this.fetcher(this.origin+"/gate/update/start",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({ticket:e.ticket})}),o=await i.json();if(s=!i.ok&&typeof o.error=="string",!i.ok||!o.statusOrigin)throw new Error(o.error||"无法取得更新进度，请重新检查");this.follow(o)}catch(i){if(this.disposed)return;if(s)this.patch({progress:{phase:"failed",progress:0,message:(i instanceof Error?i.message:"更新暂不可用")+"。请重新检查更新。",terminal:!0,ok:!1}});else{try{let o=await this.fetcher(this.origin+"/gate/update/status",{signal:AbortSignal.timeout(3e3)}),v=await o.json();if(o.ok&&v.activeJob?.statusOrigin){this.follow(v.activeJob);return}}catch{}this.patch({progress:{phase:"unknown",progress:0,message:"连接中断，暂时无法确认更新结果。请稍后检查更新；不要重复安装或删除节点。",terminal:!0}})}}finally{this.installing=!1}};copyCommand=async()=>{if(!(!this.value.check?.manualCommand||this.value.checking||this.installing||this.job))try{await navigator.clipboard.writeText(this.value.check.manualCommand),this.patch({copied:!0})}catch{this.patch({error:"复制失败，请手动选中下方命令复制。"})}};dispose=()=>{this.disposed=!0,this.pollGeneration++,clearTimeout(this.timer),this.listeners.clear()}};var j=class{constructor(e){this.call=e}value={checking:!1,starting:!1,check:null,status:null,error:null};listeners=new Set;reading;timer;disposed=!1;checkRevision=0;checkInvalidated=!1;getSnapshot=()=>this.value;patch(e){if(!this.disposed){this.value={...this.value,...e};for(let t of this.listeners)t()}}subscribe=e=>this.disposed?()=>{}:(this.listeners.add(e),this.checkInvalidated?(this.refreshInvalidatedCheck(),this.active()&&this.poll()):!this.value.check&&!this.value.starting?this.refresh():this.active()&&this.poll(),()=>{this.listeners.delete(e),this.listeners.size||(clearTimeout(this.timer),this.timer=void 0)});active(){return this.value.status&&["preparing","installing","unknown","restart-required"].includes(this.value.status.phase)}invalidateCheck=()=>{this.disposed||(this.checkRevision++,this.checkInvalidated=!0,this.value.check&&this.patch({check:{...this.value.check,canInstall:!1,ticket:""}}),this.refreshInvalidatedCheck())};refreshInvalidatedCheck(){!this.disposed&&this.checkInvalidated&&this.listeners.size&&!this.value.starting&&!this.active()&&this.refresh()}refresh=()=>{if(this.disposed||this.value.starting)return Promise.resolve();if(this.reading)return this.reading;let e=this.checkRevision;return this.checkInvalidated=!1,this.patch({checking:!0,error:null}),this.reading=(async()=>{try{let t=await this.call("update-check");if(this.disposed||e!==this.checkRevision)return;if(!t?.advice||!t.status||typeof t.canInstall!="boolean")throw Error("invalid update response");this.patch({check:t,status:t.status}),this.active()&&this.poll()}catch{if(this.disposed||e!==this.checkRevision)return;let t=!1;try{let a=await this.call("status");t=!!(a&&!a.plugin)}catch{}if(this.disposed||e!==this.checkRevision)return;this.patch({check:null,error:t?"当前运行的连接服务尚不支持此更新入口。若刚安装新版，请在任务结束后退出并重新打开 Desktop；无需重新配对。仍不可用时请在原生插件管理器核对安装。":"本次更新检查未完成，不能据此判断已是最新版。请稍后重试；配对和聊天不受此次检查失败影响。"})}finally{this.patch({checking:!1})}})().finally(()=>{this.reading=void 0,this.refreshInvalidatedCheck()}),this.reading};install=async()=>{let e=this.value.check;if(!(this.disposed||this.checkInvalidated||this.value.starting||this.value.checking||!e?.canInstall||!e.ticket)){this.patch({starting:!0,error:null,check:{...e,canInstall:!1,ticket:""}});try{let t=await this.call("update-start",{ticket:e.ticket});this.patch({status:t})}catch(t){this.patch({status:t?.code==="update/not-started"?{phase:"failed",message:t instanceof Error?t.message:"尚未启动更新，请重新检查"}:{phase:"unknown",message:"更新提交结果暂未确认，正在核对；请勿重复安装。"}})}finally{this.patch({starting:!1}),this.poll(),this.refreshInvalidatedCheck()}}};poll(){this.disposed||this.timer||!this.listeners.size||!this.active()||(this.timer=setTimeout(async()=>{try{let e=await this.call("update-status");if(!e||!["idle","preparing","installing","restart-required","complete","failed","unknown"].includes(e.phase))throw Error("invalid status");this.patch({status:e,error:e.phase==="idle"?"尚未发现已接受的更新，请重新检查后再操作。":null})}catch{this.patch({error:"更新状态暂不可用；恢复连接后继续核对，不会重复安装。"})}finally{this.timer=void 0,this.poll(),this.refreshInvalidatedCheck()}},2e3))}dispose(){this.disposed=!0,this.checkRevision++,this.checkInvalidated=!1,clearTimeout(this.timer),this.listeners.clear()}};var T=()=>({loadState:"loading",qrState:"idle",status:null,host:null,runtime:null,localOrigin:null,qr:null,error:null,decisionError:null,deciding:!1}),te=r=>r?.companionUpdate?.state?["preparing","installing","verifying","recovering"].includes(r.companionUpdate.state):void 0,A=class{constructor(e,t){this.describeHost=e;this.callManagement=t}updates;nativeUpdates;value=T();listeners=new Set;timer;reading;pairing;disposed=!1;identity="";generation=0;getSnapshot=()=>this.value;subscribe=e=>this.disposed?()=>{}:(this.listeners.add(e),this.timer||(this.refresh(),this.timer=setInterval(()=>void this.refresh(),2e3)),()=>{this.listeners.delete(e),this.listeners.size||(clearInterval(this.timer),this.timer=void 0)});patch(e){if(!this.disposed){this.value={...this.value,...e};for(let t of this.listeners)t()}}async client(){let e=await ee(this.describeHost,this.callManagement);if(this.disposed)throw new Error("disposed");let t=`${e.host.agentInstanceId??e.host.computerName}/${e.runtime.profileScope??"web"}`;return this.identity&&this.identity!==t&&(this.generation++,this.value=T(),this.updates?.dispose(),this.updates=void 0,this.nativeUpdates?.dispose(),this.nativeUpdates=void 0),this.identity=t,e.runtime.profileScope==="desktop"&&!this.nativeUpdates&&(this.nativeUpdates=new j(this.callManagement)),this.updates?.origin!==e.localOrigin&&(this.updates?.dispose(),this.updates=e.localOrigin?new B(e.localOrigin):void 0),this.patch({host:e.host,runtime:e.runtime,localOrigin:e.localOrigin}),e}refresh=()=>this.disposed?Promise.resolve():this.reading?this.reading:(this.reading=(async()=>{try{let e=await this.client(),t=this.generation,a={...await e.status()};if(a.companionUpdate?.state==="complete"&&!a.plugin&&(a.companionUpdate={state:"unverified",message:"当前连接服务尚未提供运行版本核验，不能确认两端已对齐。若刚安装插件，请在任务结束后退出并重新打开当前应用；无需重新配对。"}),t!==this.generation)return;let n=te(this.value.status),s=te(a);s!==void 0&&s!==n&&this.nativeUpdates?.invalidateCheck(),this.patch({status:a,runtime:a.gate??e.runtime,loadState:"ready",error:null,...this.value.qr&&this.value.qr.expiresAt<=Date.now()?{qrState:"expired",qr:null}:{}})}catch{this.patch({loadState:"error",error:"连接服务暂未就绪。请确认 DSH 正在运行，然后重试。"})}})().finally(()=>{this.reading=void 0}),this.reading);generateQr=()=>this.disposed?Promise.resolve():this.pairing?this.pairing:(this.patch({qrState:"loading",qr:null,error:null}),this.pairing=(async()=>{try{let e=await this.client(),t=this.generation,a=await e.pairCode();if(t!==this.generation)return;if(!a?.qrDataUrl?.startsWith("data:image/")||!Number.isFinite(a.expiresAt)||a.expiresAt<=Date.now())throw new Error("invalid QR");this.patch({qr:a,qrState:"ready"}),await this.refresh()}catch{this.patch({qr:null,qrState:"error",error:"暂时无法生成配对二维码，请稍后重试。"})}})().finally(()=>{this.pairing=void 0}),this.pairing);decide=async e=>{let t=this.value.status?.companionUpdate?.offerId;if(!(this.disposed||this.value.deciding||!t)){this.patch({deciding:!0,decisionError:null});try{let a=await this.client();if(this.value.status?.companionUpdate?.offerId!==t)throw new Error("stale offer");await a.decide(t,e),await this.reading,await this.refresh()}catch{this.patch({decisionError:"更新选择未确认，请刷新后核对；不要重复安装。"})}finally{this.patch({deciding:!1})}}};dispose=()=>{this.disposed=!0,this.generation++,clearInterval(this.timer),this.timer=void 0,this.listeners.clear(),this.value=T(),this.updates?.dispose(),this.updates=void 0,this.nativeUpdates?.dispose(),this.nativeUpdates=void 0}},re=new WeakMap;function M(r,e){let t=re.get(r);return t||(t=new A(r,e),re.set(r,t)),t}var D=I(N(),1),x=require("react/jsx-runtime");function V({describeHost:r,callManagement:e,onDismiss:t,onOpenDetails:a,store:n=M(r,e)}){let{status:s,deciding:i,decisionError:o,error:v,loadState:p}=(0,ae.useSyncExternalStore)(n.subscribe,n.getSnapshot,n.getSnapshot),m=s?.companionUpdate,u=o||v,b=(0,x.jsxs)("div",{children:[(0,x.jsx)(Y,{value:m,deciding:i||p!=="ready",onDecide:d=>void n.decide(d)}),!m&&!u?(0,x.jsx)("p",{className:D.default.helpText,children:"正在检查联动更新状态；尚未确认的更新不会自动启动。"}):m?.state==="idle"?(0,x.jsx)("p",{className:D.default.helpText,children:"未发现需要联动更新的另一端。当前节点可独立使用，不会自动安装另一端或启用已停用的插件。"}):null,u?(0,x.jsx)("p",{role:"alert",children:u}):null,t?(0,x.jsxs)("div",{className:D.default.actions,children:[a?(0,x.jsx)("button",{type:"button",className:D.default.primaryButton,onClick:a,children:"前往微信连接"}):null,(0,x.jsx)("button",{type:"button",className:D.default.secondaryButton,onClick:t,children:"关闭提示（不会确认更新）"})]}):null]});return t?(0,x.jsx)(ne.Modal,{open:!0,title:"微信连接 · 联动更新",closeLabel:"关闭提示",className:D.default.pageDialog,contentClassName:D.default.pageDialogContent,onClose:t,children:b}):b}var E=require("react"),ie=I(N(),1),C=require("react/jsx-runtime");function se({wide:r,openPlugin:e}){let[t,a]=(0,E.useState)(!1),[n,s]=(0,E.useState)(!1),i=(0,E.useRef)(!1),o=async()=>{if(!i.current){i.current=!0,s(!0);try{await e()||a(!0)}finally{i.current=!1,s(!1)}}};return(0,C.jsxs)(C.Fragment,{children:[(0,C.jsxs)("button",{type:"button",className:ie.default.sidebarButton,"data-wide":r,title:"微信连接","aria-label":"微信连接",disabled:n,onClick:()=>void o(),children:[(0,C.jsxs)("svg",{width:"20",height:"20",viewBox:"0 0 24 24",fill:"none",stroke:"currentColor",strokeWidth:"1.7","aria-hidden":"true",children:[(0,C.jsx)("path",{d:"M20 11.5a8 8 0 0 1-8 8 9 9 0 0 1-3.5-.7L4 20l1.2-4.2A7.8 7.8 0 0 1 4 11.5a8 8 0 0 1 16 0Z"}),(0,C.jsx)("path",{d:"M8 11.5h.01M12 11.5h.01M16 11.5h.01",strokeWidth:"2.5",strokeLinecap:"round"})]}),r?(0,C.jsx)("span",{children:n?"正在打开…":"微信连接"}):null]}),t?(0,C.jsx)("small",{role:"status",children:"插件详情暂不可用，请打开「设置 → 微信连接」。"}):null]})}async function oe(r){try{let e=r("pluginNavigation"),t=r("remote.pluginManager");if(typeof e?.openBundle!="function"||typeof t?.listBundles!="function")return!1;let a=await t.listBundles();if(!a.ok||!Array.isArray(a.value))return!1;let n=a.value.filter(i=>i.enabled&&["dsh-wechat-remote","@harness-remote/dsh-wechat-remote"].includes(i.name));if(n.length!==1)return!1;let s=r("pluginNavigation");return s!==e||typeof s.openBundle!="function"?!1:(s.openBundle(n[0].name),!0)}catch{return!1}}var J=require("react"),he=require("@deepseek-ai/dsh-client-ui-primitives"),f=I(N(),1);var le=require("react"),k=I(N(),1),c=require("react/jsx-runtime");function de({store:r}){let{check:e,checking:t,progress:a,error:n,copied:s,resumeFailed:i}=(0,le.useSyncExternalStore)(r.subscribe,r.getSnapshot,r.getSnapshot),o=!!(a&&!a.terminal);return(0,c.jsxs)("div",{className:k.default.updateCard,children:[(0,c.jsxs)("div",{className:k.default.pairingHead,children:[(0,c.jsx)("div",{children:(0,c.jsx)("strong",{children:"当前端插件更新"})}),(0,c.jsx)("button",{type:"button",className:k.default.secondaryButton,disabled:t||o,onClick:()=>void r.refresh(),children:t?"检查中…":"检查更新"})]}),e?(0,c.jsxs)(c.Fragment,{children:[e.channel==="preview"?(0,c.jsx)("span",{className:k.default.updateLabel,"data-severity":"recommended",children:"预览通道"}):null,(0,c.jsxs)("div",{className:k.default.updateVersions,children:[(0,c.jsxs)("span",{children:["DSH ",(0,c.jsx)("strong",{children:e.advice.current.agentVersion||"未知"})]}),(0,c.jsxs)("span",{children:["插件 ",(0,c.jsx)("strong",{children:e.advice.current.pluginVersion||"未知"})]})]}),t?null:(0,c.jsxs)(c.Fragment,{children:[(0,c.jsx)("strong",{className:k.default.updateLabel,"data-severity":e.advice.severity,role:"status",children:e.advice.label}),e.advice.targetVersion?(0,c.jsxs)("p",{children:["可更新至 ",e.advice.targetVersion,e.mode==="manual"?" · 需手动更新":""]}):null,e.advice.severity==="unknown"||e.advice.severity==="required"||e.mode==="manual"||e.mode==="busy"?(0,c.jsxs)("details",{children:[(0,c.jsx)("summary",{children:e.mode==="manual"?"手动更新说明":"查看说明"}),e.reason?(0,c.jsx)("p",{children:e.reason}):null,(0,c.jsx)("p",{children:e.advice.message})]}):null,e.mode==="manual"&&e.manualCommand?(0,c.jsxs)("div",{className:k.default.updateCommand,children:[(0,c.jsx)("code",{children:e.manualCommand}),(0,c.jsx)("button",{type:"button",className:k.default.secondaryButton,disabled:o,onClick:()=>void r.copyCommand(),children:s?"已复制":"复制命令"})]}):null,e.canInstall?(0,c.jsxs)(c.Fragment,{children:[(0,c.jsx)("button",{type:"button",className:k.default.primaryButton,disabled:o||!!n,onClick:()=>void r.install(),children:"更新并重启"}),(0,c.jsx)("small",{className:k.default.updateChecked,children:"只更新当前 Web 插件；会短暂断开连接，保留原配对和会话"})]}):null,e.advice.checkedAt&&e.advice.severity!=="unknown"?(0,c.jsxs)("small",{className:k.default.updateChecked,children:["最近检查 ",new Date(e.advice.checkedAt).toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"})]}):null]})]}):null,n?(0,c.jsx)("p",{role:"alert",children:n}):null,a?(0,c.jsxs)("div",{role:"status","aria-live":"polite",children:[!a.terminal||a.ok===!0?(0,c.jsx)("progress",{className:k.default.updateProgress,max:100,value:a.progress}):null,(0,c.jsx)("p",{children:a.message}),i?(0,c.jsx)("p",{role:"alert",children:"插件已完成更新，但未能自动打开 WebUI。请使用 DSH 启动时显示的地址打开，无需重复更新。"}):null]}):null]})}var ce=require("react"),S=I(N(),1),g=require("react/jsx-runtime");function pe({store:r}){let{check:e,status:t,checking:a,starting:n,error:s}=(0,ce.useSyncExternalStore)(r.subscribe,r.getSnapshot,r.getSnapshot),i=n||t?.phase==="preparing"||t?.phase==="installing",o=t&&["preparing","installing","restart-required","unknown"].includes(t.phase),v=t?.phase==="restart-required"||t?.phase==="complete",p=t?.phase==="restart-required"?"已安装，待重新打开 Desktop":t?.phase==="unknown"?"更新结果待核对":i?"正在更新 Desktop 插件":t?.phase==="complete"?"更新已生效":"";return(0,g.jsxs)("div",{className:S.default.updateCard,children:[(0,g.jsxs)("div",{className:S.default.pairingHead,children:[(0,g.jsx)("strong",{children:"当前端插件更新 · Desktop"}),(0,g.jsx)("button",{type:"button",className:S.default.secondaryButton,disabled:a||i,onClick:()=>void r.refresh(),children:a?"检查中…":"检查更新"})]}),e?(0,g.jsxs)(g.Fragment,{children:[e.channel==="preview"?(0,g.jsx)("span",{className:S.default.updateLabel,"data-severity":"recommended",children:"预览通道"}):null,(0,g.jsxs)("div",{className:S.default.updateVersions,children:[(0,g.jsxs)("span",{children:["DSH ",(0,g.jsx)("strong",{children:e.advice.current.agentVersion})]}),(0,g.jsxs)("span",{children:["运行中的插件 ",(0,g.jsx)("strong",{children:e.advice.current.pluginVersion})]})]}),(0,g.jsx)("strong",{className:S.default.updateLabel,"data-severity":v?"none":e.advice.severity,children:p||e.advice.label}),v&&t.targetVersion?(0,g.jsxs)("p",{children:["已安装版本 ",t.targetVersion]}):!o&&e.advice.targetVersion?(0,g.jsxs)("p",{children:["可更新至 ",e.advice.targetVersion]}):null,!o&&e.reason?(0,g.jsx)("p",{children:e.reason}):null,!o&&e.canInstall?(0,g.jsxs)(g.Fragment,{children:[(0,g.jsx)("p",{className:S.default.helpText,children:"仅更新当前 Desktop 插件，由原生插件管理器使用应用配置的安装源下载并安装指定版本。配对和会话保留，不更新 Web，不自动退出应用；安装完成后需重新打开 Desktop。"}),(0,g.jsx)("button",{type:"button",className:S.default.primaryButton,disabled:i||a,onClick:()=>void r.install(),children:"更新 Desktop 插件"})]}):null,(0,g.jsxs)("small",{className:S.default.updateChecked,children:["最近检查 ",new Date(e.advice.checkedAt).toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"})]})]}):null,t?.phase!=="idle"&&t?(0,g.jsxs)("div",{role:"status","aria-live":"polite",children:[i?(0,g.jsx)("progress",{className:S.default.updateProgress,"aria-label":"Desktop 插件更新中"}):null,(0,g.jsx)("p",{children:t.message})]}):null,s?(0,g.jsx)("p",{role:"alert",children:s}):null]})}var P=require("react"),O=I(N(),1),h=require("react/jsx-runtime");function ue({store:r,start:e}){let{catalog:t,preview:a,busy:n,message:s,error:i}=(0,P.useSyncExternalStore)(r.subscribe,r.getSnapshot,r.getSnapshot),[o,v]=(0,P.useState)(!1),[p,m]=(0,P.useState)(""),u=(0,P.useRef)();(0,P.useEffect)(()=>{let d=new AbortController;return u.current=d,()=>d.abort()},[]);let b=async d=>{if(!e||o||!u.current||u.current.signal.aborted)return;let y=u.current.signal;v(!0),m("");try{await e(d,y)}catch(w){y.aborted||m(w instanceof Error?w.message:"请检查原生会话列表")}finally{y.aborted||v(!1)}};return(0,h.jsxs)("section",{className:O.default.companionCard,"aria-label":"工作助手",children:[(0,h.jsx)("strong",{children:"工作助手"}),(0,h.jsx)("p",{children:"选一个现成助手，预览后安装为 DSH 原生工作模式。具体身份、班级或项目资料在开始会话后再逐步告诉它。"}),(0,h.jsx)("p",{children:"想按自己的习惯定制？在小程序「助手预设」选择「对话定制」，用普通语言描述需求；生成的草稿也会出现在这里。"}),(0,h.jsx)("button",{type:"button",disabled:n,onClick:()=>void r.load(),children:t?"刷新助手目录":"查看可用助手"}),t&&!t.native?.supported?(0,h.jsx)("p",{role:"status",children:t.native?.reason||"此宿主尚不支持原生预设安装"}):null,t?.native?.supported?(0,h.jsx)("div",{className:O.default.actions,children:t.templates.map(d=>(0,h.jsx)("button",{type:"button",disabled:n,title:d.description,onClick:()=>void r.choose(d.id),children:d.name},d.id))}):null,a?(0,h.jsxs)("div",{children:[(0,h.jsx)("h4",{children:a.definition.name}),(0,h.jsx)("p",{children:a.definition.description}),(0,h.jsx)("p",{children:a.definition.role}),(0,h.jsxs)("small",{children:["第 ",a.version," 版 · 内容摘要 ",a.digest.slice(0,12)]}),(0,h.jsx)("ul",{children:a.definition.methods.map((d,y)=>(0,h.jsx)("li",{children:d},y))}),(0,h.jsx)("p",{children:"开始工作后逐步了解："}),(0,h.jsx)("ul",{children:a.definition.onboarding.map(d=>(0,h.jsxs)("li",{children:[d.label,"：",d.prompt]},d.key))}),(0,h.jsxs)("p",{children:["搭配技能：群工作流。沿用基础模式：",a.native.basePreset,"。"]}),(0,h.jsx)("ul",{children:(a.native.warnings||[]).map((d,y)=>(0,h.jsx)("li",{children:d},y))}),(0,h.jsx)("button",{type:"button",disabled:n,onClick:()=>void r.install(),children:"确认，安装这个原生预设"})]}):null,t?.drafts.map(d=>(0,h.jsxs)("div",{children:[(0,h.jsxs)("p",{children:[d.name," · 第 ",d.version," 版 · ",d.state==="installed"?"已生效":d.state==="draft"?"待确认":"待核对"]}),d.state==="draft"?(0,h.jsx)("button",{type:"button",disabled:n,onClick:()=>void r.preview(d.id,d.version),children:"预览"}):(0,h.jsx)("button",{type:"button",disabled:n,onClick:()=>void r.verify(d.id,d.version),children:"核对安装状态"}),d.state==="installed"&&e?(0,h.jsx)("button",{type:"button",disabled:n||o,onClick:()=>void b(d.presetId),children:"开始使用此助手"}):null]},`${d.id}:${d.version}`)),s?(0,h.jsx)("p",{role:"status",children:s}):null,i||p?(0,h.jsx)("p",{role:"alert",children:i||p}):null,(0,h.jsx)("small",{children:"此入口首次创建会话，重复点击返回刚创建的会话。如需另一个工作实例，可在 DSH 新会话中选择同一预设。不会改动默认模式或已有会话。"})]})}var l=require("react/jsx-runtime");function ge({ok:r,busy:e=!1}){return(0,l.jsx)("span",{className:f.default.statusDot,"data-state":e?"busy":r?"ready":"off","aria-hidden":!0})}function L({title:r,detail:e,ok:t,busy:a=!1}){return(0,l.jsxs)("div",{className:f.default.capability,children:[(0,l.jsx)(ge,{ok:t,busy:a}),(0,l.jsxs)("div",{className:f.default.capabilityCopy,children:[(0,l.jsx)("strong",{children:r}),(0,l.jsx)("span",{children:e})]})]})}function W({describeHost:r,callManagement:e,store:t=M(r,e),assistants:a,startAssistant:n}){let{loadState:s,qrState:i,status:o,runtime:v,host:p,localOrigin:m,qr:u,error:b}=(0,J.useSyncExternalStore)(t.subscribe,t.getSnapshot,t.getSnapshot),{refresh:d,generateQr:y}=t,w=(0,J.useId)(),H=o?.publicRelay,G=H?.state==="enrolling"||H?.state==="connecting",R=H?.remoteAccess?.status,X=H?.state==="online"&&R==="active",fe=R==="suspended"?"账户公网访问已暂停":R==="expired"?"公网访问已到期":R==="not_entitled"?"请在小程序中使用自助开通方式":R!=="active"?"配对后由小程序账户决定":X?"可在外网安全连接":G?"正在准备远程连接":"暂时离线",ve=v?.publicDoor??o?.gate?.publicDoor,$=s==="ready"&&!!o?.lan.ip&&ve?.state==="listening",F=H?.enabled===!0&&H.state!=="disabled",be=o?.agent?.agentName||p?.agentName||"DeepSeek Harness",ye=o?.agent?.hostName||p?.computerName||"当前电脑";return(0,l.jsxs)("section",{className:f.default.root,"aria-labelledby":w,children:[(0,l.jsxs)("div",{className:f.default.hero,children:[(0,l.jsxs)("div",{className:f.default.identity,children:[(0,l.jsx)("span",{className:f.default.mark,"aria-hidden":!0,children:(0,l.jsx)(he.FishLogo,{size:28})}),(0,l.jsxs)("div",{className:f.default.identityCopy,children:[(0,l.jsx)("h3",{id:w,children:"微信连接"}),(0,l.jsxs)("p",{children:[be,(0,l.jsx)("span",{"aria-hidden":!0,children:" · "}),ye]})]})]}),(0,l.jsxs)("span",{className:f.default.overall,"data-ready":s==="ready",children:[(0,l.jsx)(ge,{ok:s==="ready",busy:s==="loading"}),s==="loading"?"检测中":s==="ready"?"服务正常":"暂不可用"]})]}),v?.profileScope==="desktop"&&o&&(!o.plugin||o.plugin.runningVersion!==o.plugin.installedVersion)?(0,l.jsxs)("aside",{className:f.default.companionCard,"data-state":"self-restart-required",role:"status",children:[(0,l.jsx)("strong",{children:o.plugin?"新版插件尚未生效，请完整重启 Desktop":"刚升级插件？请先完整重启 Desktop"}),o.plugin?(0,l.jsxs)("p",{children:["正在运行 ",o.plugin.runningVersion,"；已安装 ",o.plugin.installedVersion,"。"]}):(0,l.jsx)("p",{children:"当前连接服务尚不能核验运行版本，不能把安装完成当作新版已生效。"}),(0,l.jsx)("p",{children:"等当前任务结束后，选择顶部「应用 → 退出」，再重新打开 Desktop。仅关闭窗口、刷新页面或开关插件不能保证新版生效。"}),(0,l.jsx)("small",{children:"不必重装或重新配对。此操作不会升级或重启 Web。"})]}):null,(0,l.jsxs)("div",{className:f.default.capabilities,children:[(0,l.jsx)(L,{title:"局域网直连",detail:s==="loading"?"检测中":$?"已就绪":"暂不可用",ok:$,busy:s==="loading"}),(0,l.jsx)(L,{title:"远程访问",detail:fe,ok:X,busy:G||s==="loading"}),(0,l.jsx)(L,{title:"账号连接保护",detail:F?"已启用":"配对后启用",ok:F,busy:s==="loading"})]}),b!==null?(0,l.jsxs)("div",{className:f.default.notice,role:"status",children:[(0,l.jsx)("span",{children:b}),(0,l.jsx)("button",{type:"button",onClick:()=>void d(),children:"重试"})]}):null,i==="idle"?(0,l.jsxs)("div",{className:f.default.connectCard,children:[(0,l.jsxs)("div",{children:[(0,l.jsx)("strong",{children:"添加到微信"}),(0,l.jsx)("p",{children:"打开「Agent远程管理助手」→ 添加节点，扫描配对二维码。"})]}),(0,l.jsx)("button",{type:"button",className:f.default.primaryButton,disabled:s!=="ready",onClick:()=>void y(),children:"生成二维码"})]}):(0,l.jsxs)("div",{className:f.default.pairingCard,children:[(0,l.jsxs)("div",{className:f.default.pairingHead,children:[(0,l.jsxs)("div",{children:[(0,l.jsx)("strong",{children:"扫描二维码"}),(0,l.jsx)("p",{children:"小程序「设置 → 添加节点」"})]}),(0,l.jsx)("button",{type:"button",className:f.default.secondaryButton,disabled:i==="loading"||s!=="ready",onClick:()=>void y(),children:i==="loading"?"生成中…":"重新生成"})]}),(0,l.jsxs)("div",{className:f.default.qrArea,children:[s==="ready"&&i==="ready"&&u!==null?(0,l.jsx)("img",{className:f.default.qr,src:u.qrDataUrl,alt:"Agent远程管理助手配对二维码"}):(0,l.jsx)("div",{className:f.default.qrPlaceholder,"aria-live":"polite",children:s!=="ready"?"连接恢复后可查看二维码":i==="expired"?"二维码已过期，请重新生成":i==="error"?"生成失败":"正在生成…"}),i==="ready"&&u!==null?(0,l.jsxs)("small",{className:f.default.qrValidity,children:["有效至 ",new Date(u.expiresAt).toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"})," · 切换页面不重新生成"]}):null]}),(0,l.jsx)("p",{className:f.default.securityNote,children:u?.mode==="public-relay"?"配对后自动选择更快的连接；远程内容端到端加密。":"当前可通过同一局域网连接。"})]}),m&&t.updates?(0,l.jsx)(de,{store:t.updates}):null,v?.profileScope==="desktop"&&t.nativeUpdates?(0,l.jsx)(pe,{store:t.nativeUpdates}):null,(0,l.jsxs)("div",{className:f.default.linkedSection,children:[(0,l.jsx)("h4",{children:"另一端插件"}),(0,l.jsx)(V,{describeHost:r,callManagement:e,store:t})]}),(0,l.jsx)("p",{className:f.default.securityNote,children:"设置和插件详情共用当前节点的配对与更新状态；Web 与 Desktop 各自独立。"}),a?(0,l.jsx)(ue,{store:a,start:n}):null]})}var z=class{constructor(e){this.call=e}state={catalog:null,preview:null,busy:!1,message:"",error:""};listeners=new Set;epoch=0;disposed=!1;getSnapshot=()=>this.state;subscribe=e=>(this.listeners.add(e),()=>{this.listeners.delete(e)});set(e){if(!this.disposed){this.state={...this.state,...e};for(let t of this.listeners)t()}}reset=()=>{this.epoch++,this.set({catalog:null,preview:null,busy:!1,message:"",error:""})};dispose=()=>{this.reset(),this.disposed=!0,this.listeners.clear()};async run(e){if(this.disposed||this.state.busy)return;let t=this.epoch,a=()=>!this.disposed&&t===this.epoch;this.set({busy:!0,error:""});try{await e(a)}catch(n){a()&&this.set({error:n instanceof Error?n.message:"操作未完成，请核对状态"})}finally{a()&&this.set({busy:!1})}}async read(e){let t=await this.call("assistantCatalog",{});if(e()){if(t?.schema!=="human.assistants.catalog.v1"||!Array.isArray(t.templates)||!Array.isArray(t.drafts))throw new Error("助手目录格式不受支持");this.set({catalog:t})}}load=()=>this.run(e=>this.read(e));choose=e=>this.run(async t=>{this.set({preview:null,message:""});let a=await this.call("assistantDraft",{templateId:e});if(!t()||(await this.read(t),!t()))return;let n=await this.call("assistantPreview",{id:a.id,version:a.version});t()&&this.set({preview:n})});preview=(e,t)=>this.run(async a=>{this.set({preview:null});let n=await this.call("assistantPreview",{id:e,version:t});a()&&this.set({preview:n})});install=()=>this.run(async e=>{let t=this.state.preview;if(!t||t.expiresAt<=Date.now())throw new Error("请重新预览后确认安装");this.set({preview:null,message:"已提交原生安装，请等待结果。"});try{let a=await this.call("assistantInstall",{id:t.id,version:t.version,digest:t.digest,previewId:t.previewId});e()&&this.set({message:a.message||(a.state==="installed"?"原生预设已生效":"请核对原生安装状态")})}finally{e()&&await this.read(e)}});verify=(e,t)=>this.run(async a=>{let n=await this.call("assistantStatus",{id:e,version:t});a()&&(this.set({message:n.message||"状态已核对"}),await this.read(a))})};function me(r){let e=0,t=!1,a=new Map;return{reset(){e++,t=!1;for(let n of a.keys())a.set(n,{state:"unknown"})},async start(n,s){if(!/^[a-z][a-z0-9_-]{0,63}$/.test(n))throw new Error("助手身份无效");let i=r("remote.session"),o=r("sessions"),v=r("uiWorkspace"),p=r("layout");if(r("configForms")?.developerTools?.enabled?.getSnapshot()!==!0||typeof i?.create!="function"||typeof o?.refresh!="function"||typeof v?.openSession!="function"||typeof p?.beginNavigation!="function")throw new Error("当前原生界面未提供助手会话入口，或原生工作模式选择尚未启用；请使用 DSH 的新会话入口选择此预设。");if(t||s?.aborted)return;let u=a.get(n);if(u?.state==="unknown")throw new Error("上次新建结果尚未确认，请先核对原生会话列表；不会自动再次创建。");if(u?.sessionId){v.openSession(u.sessionId);return}let b=e,d=p.beginNavigation(),y=()=>b===e&&!d.aborted&&!s?.aborted;if(y()){t=!0;try{a.set(n,{state:"unknown"});let w=await i.create({agentPreset:n});if(!y())throw new Error("导航或连接已变化，请核对原生会话列表；没有自动跳转。");if(!w?.ok||typeof w.value?.sessionId!="string"||!w.value.sessionId||w.value.agentPreset!==n)throw new Error(w?.error?.message||"原生宿主未确认指定助手身份，请核对会话列表。");if(a.set(n,{state:"created",sessionId:w.value.sessionId}),await o.refresh(),!y())return;v.openSession(w.value.sessionId)}finally{b===e&&(t=!1)}}}}}var Ie=["slots","connection"];function He(r){let e=async(p,m)=>{let u=await r.connection.rpc.call("/wechat-remote-management",p,m??{});if(!u.ok)throw Object.assign(new Error(u.error.message),{code:u.error.code});return u.value},t=async()=>{let p=await r.connection.rpc.call("/api","wechatHost/describe",{args:{request:{}}});if(!p.ok)throw new Error(`wechatHost/describe: ${p.error.code}`);let m=p.value;if(m?.ok!==!0||m.value===void 0)throw new Error("wechatHost/describe returned an invalid result");return m.value},a=new A(t,e),n=0,s=new z(async(p,m)=>{let u=n,b=await r.connection.rpc.call("/api",`humanTools/${p}`,{args:{request:m}});if(u!==n)throw new Error("电脑连接已变化，请重新查看助手目录");if(!b.ok)throw new Error(b.error.message);let d=b.value;if(!d?.ok||typeof d.valueJson!="string"||d.valueJson.length>256*1024)throw new Error(d?.error?.message||"此节点尚未提供助手能力");return JSON.parse(d.valueJson)}),i=me(p=>r.get(p));r.effect(()=>{let p=r.on("connection/reset",()=>{n++,s.reset(),i.reset()});return()=>{n++,p(),s.dispose(),i.reset()}},"wechat assistant lifecycle"),r.effect(()=>()=>a.dispose(),"wechat shared page");let o=()=>oe(p=>r.get(p)),v=()=>({describeHost:t,callManagement:e,store:a,assistants:s,startAssistant:i.start});r.slots.inject("settings.section",()=>r.slots.register({name:"settings.section",id:"harness-remote",order:30,label:"微信连接",inject:v},W));for(let p of["plugins.bundle.activation","plugins.bundle.config"])r.slots.inject(p,()=>{let m=["dsh-wechat-remote","@harness-remote/dsh-wechat-remote"].map(u=>r.slots.register({name:p,key:u,inject:v},p==="plugins.bundle.activation"?V:W));return()=>m.forEach(u=>u())});r.inject(["pluginNavigation","remote.pluginManager"],()=>r.slots.inject("sidebar.footer.action",()=>r.slots.register({name:"sidebar.footer.action",id:"harness-remote",order:30,label:"微信连接",inject:()=>({openPlugin:o})},se)))}

return module.exports;}});
