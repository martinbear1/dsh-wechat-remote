window.__ModuleLoader__.load({id:"@harness-remote/dsh-wechat-remote",factory:(require)=>{var module={exports:{}};var exports=module.exports;"use strict";var he=Object.create;var I=Object.defineProperty;var ue=Object.getOwnPropertyDescriptor;var ge=Object.getOwnPropertyNames;var fe=Object.getPrototypeOf,me=Object.prototype.hasOwnProperty;var ve=(r,e)=>()=>(e||r((e={exports:{}}).exports,e),e.exports),be=(r,e)=>{for(var t in e)I(r,t,{get:e[t],enumerable:!0})},L=(r,e,t,n)=>{if(e&&typeof e=="object"||typeof e=="function")for(let i of ge(e))!me.call(r,i)&&i!==t&&I(r,i,{get:()=>e[i],enumerable:!(n=ue(e,i))||n.enumerable});return r};var C=(r,e,t)=>(t=r!=null?he(fe(r)):{},L(e||!r||!r.__esModule?I(t,"default",{value:r,enumerable:!0}):t,r)),ye=r=>L(I({},"__esModule",{value:!0}),r);var x=ve((Se,G)=>{"use strict";var _e=`.hr_98198fd_root {
  box-sizing: border-box;\r
  width: 100%;\r
  max-width: 760px;\r
  color: var(--dsw-alias-label-primary, #171a20);\r
  display: flex;\r
  flex-direction: column;\r
  gap: 14px;\r
}\r
\r
.hr_98198fd_hero,\r
.hr_98198fd_connectCard,\r
.hr_98198fd_pairingCard {\r
  border: 1px solid var(--dsw-alias-border-l2, rgba(128, 140, 160, 0.22));\r
  background: var(--dsw-alias-bg-layer-3, #fff);\r
  border-radius: 12px;\r
}\r
\r
.hr_98198fd_hero {\r
  min-height: 72px;\r
  display: flex;\r
  align-items: center;\r
  justify-content: space-between;\r
  gap: 20px;\r
  padding: 16px 18px;\r
}\r
\r
.hr_98198fd_identity {\r
  min-width: 0;\r
  display: flex;\r
  align-items: center;\r
  gap: 12px;\r
}\r
\r
.hr_98198fd_mark {\r
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
.hr_98198fd_identityCopy {\r
  min-width: 0;\r
}\r
\r
.hr_98198fd_identityCopy h3,\r
.hr_98198fd_identityCopy p,\r
.hr_98198fd_connectCard p,\r
.hr_98198fd_pairingHead p,\r
.hr_98198fd_securityNote {
  margin: 0;\r
}

.hr_98198fd_sidebarButton { display: flex; align-items: center; gap: 10px; width: 100%; min-height: 38px; padding: 8px 12px; border: 0; border-radius: 8px; background: transparent; color: var(--dsw-alias-label-secondary, #4d5564); font: inherit; font-size: 14px; cursor: pointer; text-align: left; }
.hr_98198fd_sidebarButton:hover { background: var(--dsw-alias-bg-layer-2, #eef1f5); color: var(--dsw-alias-label-primary, #171a20); }
.hr_98198fd_sidebarButton[data-wide='false'] { width: 36px; min-height: 36px; padding: 8px; justify-content: center; }
.hr_98198fd_sidebarButton svg { flex: none; }
.hr_98198fd_sidebarButton:focus-visible { outline: 2px solid var(--dsw-alias-state-business-primary, #4e79ff); outline-offset: 2px; }
.hr_98198fd_actions { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 16px; }
.hr_98198fd_pageDialog.hr_98198fd_pageDialog { width: min(820px, 100%); max-height: 100%; }
.hr_98198fd_pageDialogContent.hr_98198fd_pageDialogContent { min-height: 0; overflow-y: auto; }
.hr_98198fd_helpText { color: var(--dsw-alias-label-secondary, #647084); font-size: 12px; line-height: 1.7; margin: 8px 0; }
.hr_98198fd_linkedSection h4 { margin: 4px 0 10px; font-size: 13px; }

.hr_98198fd_companionCard {
  border: 1px solid var(--dsw-alias-state-business-primary, #4e79ff);
  border-left-width: 4px;
  border-radius: 10px;
  background: var(--dsw-alias-bg-layer-3, #fff);
  padding: 14px 16px;
  line-height: 1.6;
  overflow-wrap: anywhere;
}
.hr_98198fd_companionCard strong { font-size: 14px; }
.hr_98198fd_companionCard p { margin: 4px 0; font-size: 13px; }
.hr_98198fd_companionCard small { color: var(--dsw-alias-label-secondary, #4d5564); }
.hr_98198fd_companionCard progress { display: block; width: 100%; margin: 8px 0; accent-color: #4e79ff; }
.hr_98198fd_companionCard[data-state='complete'] { border-color: var(--dsw-alias-state-success-primary, #1f9d68); }
.hr_98198fd_companionCard[data-state='unavailable'], .hr_98198fd_companionCard[data-state='recovering'] { border-color: #b5861d; }
\r
.hr_98198fd_identityCopy h3 {\r
  font-size: 15px;\r
  font-weight: 650;\r
  line-height: 22px;\r
}\r
\r
.hr_98198fd_identityCopy p {\r
  color: var(--dsw-alias-label-tertiary, #7d8492);\r
  font-size: 12px;\r
  line-height: 18px;\r
  overflow: hidden;\r
  text-overflow: ellipsis;\r
  white-space: nowrap;\r
}\r
\r
.hr_98198fd_overall {\r
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
.hr_98198fd_overall[data-ready='true'] {\r
  color: var(--dsw-alias-state-success-primary, #1f9d68);\r
}\r
\r
.hr_98198fd_statusDot {\r
  width: 7px;\r
  height: 7px;\r
  background: var(--dsw-alias-label-tertiary, #8b93a2);\r
  border-radius: 999px;\r
  flex: none;\r
}\r
\r
.hr_98198fd_statusDot[data-state='ready'] {\r
  background: var(--dsw-alias-state-success-primary, #1f9d68);\r
}\r
\r
.hr_98198fd_statusDot[data-state='busy'] {\r
  background: var(--dsw-alias-state-business-primary, #4e79ff);\r
  animation: harnessRemotePulse 1.2s ease-in-out infinite;\r
}\r
\r
.hr_98198fd_capabilities {\r
  grid-template-columns: repeat(3, minmax(0, 1fr));\r
  gap: 10px;\r
  display: grid;\r
}\r
\r
.hr_98198fd_capability {\r
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
.hr_98198fd_capability > .hr_98198fd_statusDot {\r
  margin-top: 6px;\r
}\r
\r
.hr_98198fd_capabilityCopy {\r
  min-width: 0;\r
  display: flex;\r
  flex-direction: column;\r
  gap: 1px;\r
}\r
\r
.hr_98198fd_capabilityCopy strong {\r
  font-size: 12.5px;\r
  font-weight: 600;\r
  line-height: 19px;\r
}\r
\r
.hr_98198fd_capabilityCopy span {\r
  color: var(--dsw-alias-label-tertiary, #7d8492);\r
  font-size: 11px;\r
  line-height: 17px;\r
  overflow: hidden;\r
  text-overflow: ellipsis;\r
  white-space: nowrap;\r
}\r
\r
.hr_98198fd_notice {\r
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
.hr_98198fd_notice button,\r
.hr_98198fd_secondaryButton {\r
  border: 1px solid var(--dsw-alias-border-l2, rgba(128, 140, 160, 0.28));\r
  color: var(--dsw-alias-label-primary, #171a20);\r
  background: var(--dsw-alias-bg-layer-1, #f5f6f8);\r
  border-radius: 7px;\r
  font: inherit;\r
  cursor: pointer;\r
}\r
\r
.hr_98198fd_notice button {\r
  flex: none;\r
  padding: 3px 9px;\r
}\r
\r
.hr_98198fd_connectCard {\r
  display: flex;\r
  align-items: center;\r
  justify-content: space-between;\r
  gap: 20px;\r
  padding: 18px;\r
}\r
\r
.hr_98198fd_connectCard strong,\r
.hr_98198fd_pairingHead strong {\r
  font-size: 14px;\r
  font-weight: 650;\r
  line-height: 21px;\r
}\r
\r
.hr_98198fd_connectCard p,\r
.hr_98198fd_pairingHead p {\r
  max-width: 470px;\r
  color: var(--dsw-alias-label-tertiary, #7d8492);\r
  font-size: 12px;\r
  line-height: 18px;\r
}\r
\r
.hr_98198fd_primaryButton {\r
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
.hr_98198fd_primaryButton:hover {\r
  filter: brightness(1.04);\r
}\r
\r
.hr_98198fd_primaryButton:focus-visible,\r
.hr_98198fd_secondaryButton:focus-visible,\r
.hr_98198fd_notice button:focus-visible {\r
  outline: 2px solid var(--dsw-alias-state-business-primary, #4e79ff);\r
  outline-offset: 2px;\r
}\r
\r
.hr_98198fd_pairingCard {\r
  padding: 18px;\r
}\r
\r
.hr_98198fd_pairingHead {\r
  display: flex;\r
  align-items: center;\r
  justify-content: space-between;\r
  gap: 16px;\r
}\r
\r
.hr_98198fd_secondaryButton {\r
  min-height: 32px;\r
  flex: none;\r
  padding: 0 11px;\r
  font-size: 12px;\r
}\r
\r
.hr_98198fd_secondaryButton:disabled,
.hr_98198fd_primaryButton:disabled {
  cursor: default;\r
  opacity: 0.55;\r
}\r
\r
.hr_98198fd_qrArea {\r
  min-height: 292px;\r
  margin-top: 16px;\r
  display: flex;\r
  flex-direction: column;\r
  align-items: center;\r
  justify-content: center;\r
  gap: 10px;\r
}\r
\r
.hr_98198fd_qr,\r
.hr_98198fd_qrPlaceholder {\r
  box-sizing: border-box;\r
  width: 280px;\r
  height: 280px;\r
  border-radius: 12px;\r
}\r
\r
.hr_98198fd_qr {\r
  background: #fff;\r
  padding: 10px;\r
  image-rendering: pixelated;\r
}\r
\r
.hr_98198fd_qrPlaceholder {\r
  color: var(--dsw-alias-label-tertiary, #7d8492);\r
  background: var(--dsw-alias-bg-layer-1, #f5f6f8);\r
  border: 1px dashed var(--dsw-alias-border-l2, rgba(128, 140, 160, 0.28));\r
  display: grid;\r
  place-items: center;\r
  font-size: 12px;\r
}\r
\r
.hr_98198fd_qrValidity {\r
  color: var(--dsw-alias-label-tertiary, #7d8492);\r
  font-size: 11px;\r
  line-height: 17px;\r
}\r
\r
.hr_98198fd_securityNote {\r
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
  .hr_98198fd_statusDot[data-state='busy'] {\r
    animation: none;\r
  }\r
}\r
\r
@media (max-width: 680px) {\r
  .hr_98198fd_capabilities {\r
    grid-template-columns: minmax(0, 1fr);\r
  }\r
\r
  .hr_98198fd_connectCard {\r
    align-items: stretch;\r
    flex-direction: column;\r
  }\r
\r
  .hr_98198fd_primaryButton {\r
    width: 100%;\r
  }\r
\r
  .hr_98198fd_qrArea {\r
    flex-direction: column;\r
    gap: 12px;\r
  }\r
\r
}\r
.hr_98198fd_updateCard { border: 1px solid var(--dsw-alias-border-l2, #ddd); background: var(--dsw-alias-bg-layer-3, #fff); border-radius: 12px; padding: 18px; line-height: 1.6; font-size: 13px; overflow-wrap: anywhere; }
.hr_98198fd_updateLabel { color: inherit; }\r
.hr_98198fd_updateLabel[data-severity="none"] { color: #218b5c; }\r
.hr_98198fd_updateLabel[data-severity="unknown"] { color: var(--text-secondary, #858b96); }\r
.hr_98198fd_updateLabel[data-severity="required"] { color: #d54052; }\r
.hr_98198fd_updateLabel[data-severity="recommended"], .hr_98198fd_updateLabel[data-severity="info"] { color: #b5861d; }\r
.hr_98198fd_updateProgress { width: 100%; height: 12px; margin-top: 16px; accent-color: #7487ef; }\r
.hr_98198fd_updateVersions { display: flex; flex-wrap: wrap; gap: 10px 24px; margin: 12px 0; }\r
.hr_98198fd_updateVersions span { color: var(--text-secondary, #858b96); }\r
.hr_98198fd_updateVersions strong { color: var(--text-primary, inherit); font-weight: 500; }\r
.hr_98198fd_updateCommand { display: flex; flex-wrap: wrap; align-items: center; gap: 12px; margin-top: 12px; }\r
.hr_98198fd_updateCommand code { flex: 1 1 240px; white-space: pre-wrap; overflow-wrap: anywhere; user-select: text; }\r
.hr_98198fd_updateChecked { display: block; margin-top: 10px; color: var(--text-secondary, #858b96); }\r
`,W="@harness-remote/dsh-wechat-remote/HarnessRemoteSettings.module.css";if(typeof document<"u"&&document.querySelector("style[data-plugin-css="+JSON.stringify(W)+"]")===null){let r=document.createElement("style");r.dataset.plugin="@harness-remote/dsh-wechat-remote",r.dataset.pluginCss=W,r.textContent=_e,document.head.appendChild(r)}G.exports={root:"hr_98198fd_root",hero:"hr_98198fd_hero",connectCard:"hr_98198fd_connectCard",pairingCard:"hr_98198fd_pairingCard",identity:"hr_98198fd_identity",mark:"hr_98198fd_mark",identityCopy:"hr_98198fd_identityCopy",pairingHead:"hr_98198fd_pairingHead",securityNote:"hr_98198fd_securityNote",sidebarButton:"hr_98198fd_sidebarButton",actions:"hr_98198fd_actions",pageDialog:"hr_98198fd_pageDialog",pageDialogContent:"hr_98198fd_pageDialogContent",helpText:"hr_98198fd_helpText",linkedSection:"hr_98198fd_linkedSection",companionCard:"hr_98198fd_companionCard",overall:"hr_98198fd_overall",statusDot:"hr_98198fd_statusDot",capabilities:"hr_98198fd_capabilities",capability:"hr_98198fd_capability",capabilityCopy:"hr_98198fd_capabilityCopy",notice:"hr_98198fd_notice",secondaryButton:"hr_98198fd_secondaryButton",primaryButton:"hr_98198fd_primaryButton",qrArea:"hr_98198fd_qrArea",qr:"hr_98198fd_qr",qrPlaceholder:"hr_98198fd_qrPlaceholder",qrValidity:"hr_98198fd_qrValidity",updateCard:"hr_98198fd_updateCard",updateLabel:"hr_98198fd_updateLabel",updateProgress:"hr_98198fd_updateProgress",updateVersions:"hr_98198fd_updateVersions",updateCommand:"hr_98198fd_updateCommand",updateChecked:"hr_98198fd_updateChecked"}});var ke={};be(ke,{apply:()=>xe,inject:()=>we});module.exports=ye(ke);var Z=require("react"),K=require("@deepseek-ai/dsh-client-ui-primitives");var R=C(x(),1),f=require("react/jsx-runtime");function X({value:r,onDecide:e,deciding:t=!1}){if(!r||r.state==="idle"||!r.message)return null;let n={"confirmation-required":"是否更新下方指定端的插件？",deferred:"已暂缓此次联动更新",pending:"联动更新待处理",busy:"等待待更新端的任务结束",preparing:"正在准备联动更新",installing:"正在安装插件更新",verifying:"正在核验更新后的恢复状态",recovering:"正在恢复更新前的插件","restart-required":"待更新端需启动或重启确认","self-restart-required":"当前端待重启，尚未生效",unverified:"两端更新状态待核实",complete:"两端插件已对齐",unavailable:"联动更新尚未确认成功"},i=["preparing","installing","verifying","recovering"].includes(r.state);return(0,f.jsxs)("aside",{className:R.default.companionCard,"data-state":r.state,role:"status","aria-live":"polite",children:[(0,f.jsx)("strong",{children:n[r.state]||"另一端插件更新状态"}),(0,f.jsx)("p",{children:r.message}),r.versions?(0,f.jsxs)("small",{children:[r.versions.current==="desktop"?"Desktop":"Web","：运行 ",r.versions.running," · 已安装 ",r.versions.installed??"未确认","；",r.versions.peer==="desktop"?"Desktop":"Web","：已安装 ",r.versions.peerInstalled??"未确认或未启用"]}):null,["confirmation-required","deferred"].includes(r.state)&&r.offerId&&e?(0,f.jsxs)("div",{children:[(0,f.jsx)("button",{type:"button",className:R.default.primaryButton,disabled:t,onClick:()=>e("approve"),children:"确认并等待空闲后更新"}),(0,f.jsx)("button",{type:"button",className:R.default.secondaryButton,disabled:t,onClick:()=>e("later"),children:"稍后再说"})]}):null,i?(0,f.jsx)("progress",{"aria-label":"联动更新进度"}):null,r.state==="busy"?(0,f.jsx)("small",{children:"不用手动停止任务。请保持两端运行，空闲后会继续检查。"}):i?(0,f.jsx)("small",{children:"请保持两端当前状态，暂勿退出、重启或重复安装。关闭本设置页不会取消更新。"}):r.state==="unavailable"?(0,f.jsx)("small",{children:"请在待更新端核对版本，必要时使用其原安装入口。"}):null]})}async function F(r,e,t=fetch){let n=await r(),i=n.gate;if(!i)throw new Error("当前节点没有提供配对入口");let o=i.profileScope==="desktop",a=i.localDoor?.port,l=Number.isSafeInteger(a)&&a>=1&&a<=65535?`http://127.0.0.1:${a}`:null;if(i.management==="authenticated-rpc")return{host:n,runtime:i,localOrigin:o?null:l,status:()=>e("status"),pairCode:()=>e("pair-code"),decide:(u,g)=>e("companion-decision",{offerId:u,action:g})};if(o||i.management==="unavailable"||!l||i.localDoor.state!=="listening")throw new Error("当前节点配对入口尚未就绪");let h=async u=>{let g=await t(l+u,{cache:"no-store"});if(!g.ok)throw new Error(`配对请求失败 (${g.status})`);return g.json()};return{host:n,runtime:i,localOrigin:l,status:()=>h("/gate/status"),pairCode:()=>h("/pair/code"),decide:async(u,g)=>{let _=await t(l+"/gate/companion/decision",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({offerId:u,action:g})});if(!_.ok)throw new Error("更新通知已变化，请刷新后重试");return _.json()}}}var q=class{constructor(e,t=globalThis.fetch){this.origin=e;this.fetcher=t.bind(globalThis)}value={check:null,checking:!1,progress:null,error:"",copied:!1,resumeFailed:!1};listeners=new Set;reading;installing=!1;disposed=!1;job=null;timer;pollGeneration=0;recovering=!1;fetcher;getSnapshot=()=>this.value;subscribe=e=>this.disposed?()=>{}:(this.listeners.add(e),this.listeners.size===1&&this.refresh(),()=>{this.listeners.delete(e)});patch(e){if(!this.disposed){this.value={...this.value,...e};for(let t of this.listeners)t()}}refresh=()=>this.disposed?Promise.resolve():this.reading?this.reading:(this.patch({checking:!0,error:"",copied:!1}),this.reading=(async()=>{try{let e=await this.fetcher(this.origin+"/gate/update/check",{signal:AbortSignal.timeout(1e4)}),t=await e.json();if(!e.ok)throw new Error(t.error||"暂时无法检查更新");if(!t.advice?.current||typeof t.advice.label!="string")throw new Error("更新检查返回信息不完整");if(this.patch({check:t}),this.installing||this.job||this.recovering)return;t.activeJob?.statusOrigin?this.follow(t.activeJob):t.lastResult?.phase==="unknown"?this.patch({progress:t.lastResult}):t.mode==="busy"?this.patch({progress:{phase:"preparing",progress:0,message:"更新仍在准备或等待确认，请稍后重新检查；不要重复安装。",terminal:!0}}):this.patch({progress:t.lastResult??null})}catch(e){this.patch({check:null,error:e instanceof Error?e.message:"暂时无法检查更新"})}finally{this.patch({checking:!1})}})().finally(()=>{this.reading=void 0}),this.reading);follow(e){if(this.disposed||this.job?.jobId===e.jobId)return;this.job=e;let t=++this.pollGeneration,n=Date.now()+10*6e4;clearTimeout(this.timer),this.patch({progress:{phase:"recovering",progress:0,message:"正在恢复更新进度…",terminal:!1}});let i=async()=>{if(this.disposed||t!==this.pollGeneration)return;let o;try{let a=await this.fetcher(e.statusOrigin+"/status",{headers:{Authorization:"Bearer "+e.statusToken},signal:AbortSignal.timeout(4e3)});if(!a.ok)throw new Error("进度暂不可用");let l=await a.json();if(l.jobId!==e.jobId||typeof l.terminal!="boolean"||typeof l.message!="string")throw new Error("进度不匹配");o=l}catch{try{let a=await this.fetcher(this.origin+"/gate/update/status",{signal:AbortSignal.timeout(3e3)}),l=await a.json();a.ok&&l.lastResult?.jobId===e.jobId&&(o=l.lastResult)}catch{}}if(!(this.disposed||t!==this.pollGeneration)){if(o&&(this.patch({progress:o}),o.terminal)){this.job=null,o.ok?this.resume(e.jobId):this.refresh();return}if(Date.now()>n){this.job=null,this.patch({progress:{phase:"unknown",progress:0,message:"暂时无法确认更新结果。请重新打开此主机 WebUI 检查版本；不要重复安装或删除节点。",terminal:!0}});return}this.timer=setTimeout(()=>void i(),1e3)}};i()}async resume(e){this.recovering=!0;let t=Date.now()+3e4,n=async()=>{try{let i=await this.fetcher(this.origin+"/gate/update/resume?job="+encodeURIComponent(e),{signal:AbortSignal.timeout(3e3)});if(!i.ok)throw new Error("尚未恢复");let o=await i.json();if(!o.url)throw new Error("缺少恢复地址");let a=new URL(o.url);if(a.origin!==window.location.origin||a.pathname!=="/"||a.username||a.password||a.hash)throw new Error("恢复地址不匹配");this.disposed||window.location.replace(a.href)}catch{if(this.disposed)return;if(Date.now()>=t){this.recovering=!1,this.patch({resumeFailed:!0});return}this.timer=setTimeout(()=>void n(),1e3)}};await n()}install=async()=>{let{check:e,checking:t,error:n,progress:i}=this.value;if(this.disposed||!e?.canInstall||t||n||i&&!i.terminal||this.installing||this.job||this.recovering)return;this.installing=!0,this.patch({error:"",check:{...e,canInstall:!1,ticket:""},progress:{phase:"download",progress:10,message:"正在下载并验证更新包；当前插件尚未替换",terminal:!1}});let o=!1;try{let a=await this.fetcher(this.origin+"/gate/update/start",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({ticket:e.ticket})}),l=await a.json();if(o=!a.ok&&typeof l.error=="string",!a.ok||!l.statusOrigin)throw new Error(l.error||"无法取得更新进度，请重新检查");this.follow(l)}catch(a){if(this.disposed)return;if(o)this.patch({progress:{phase:"failed",progress:0,message:(a instanceof Error?a.message:"更新暂不可用")+"。请重新检查更新。",terminal:!0,ok:!1}});else{try{let l=await this.fetcher(this.origin+"/gate/update/status",{signal:AbortSignal.timeout(3e3)}),h=await l.json();if(l.ok&&h.activeJob?.statusOrigin){this.follow(h.activeJob);return}}catch{}this.patch({progress:{phase:"unknown",progress:0,message:"连接中断，暂时无法确认更新结果。请稍后检查更新；不要重复安装或删除节点。",terminal:!0}})}}finally{this.installing=!1}};copyCommand=async()=>{if(!(!this.value.check?.manualCommand||this.value.checking||this.installing||this.job))try{await navigator.clipboard.writeText(this.value.check.manualCommand),this.patch({copied:!0})}catch{this.patch({error:"复制失败，请手动选中下方命令复制。"})}};dispose=()=>{this.disposed=!0,this.pollGeneration++,clearTimeout(this.timer),this.listeners.clear()}};var U=class{constructor(e){this.call=e}value={checking:!1,starting:!1,check:null,status:null,error:null};listeners=new Set;reading;timer;disposed=!1;checkRevision=0;checkInvalidated=!1;getSnapshot=()=>this.value;patch(e){if(!this.disposed){this.value={...this.value,...e};for(let t of this.listeners)t()}}subscribe=e=>this.disposed?()=>{}:(this.listeners.add(e),this.checkInvalidated?(this.refreshInvalidatedCheck(),this.active()&&this.poll()):!this.value.check&&!this.value.starting?this.refresh():this.active()&&this.poll(),()=>{this.listeners.delete(e),this.listeners.size||(clearTimeout(this.timer),this.timer=void 0)});active(){return this.value.status&&["preparing","installing","unknown","restart-required"].includes(this.value.status.phase)}invalidateCheck=()=>{this.disposed||(this.checkRevision++,this.checkInvalidated=!0,this.value.check&&this.patch({check:{...this.value.check,canInstall:!1,ticket:""}}),this.refreshInvalidatedCheck())};refreshInvalidatedCheck(){!this.disposed&&this.checkInvalidated&&this.listeners.size&&!this.value.starting&&!this.active()&&this.refresh()}refresh=()=>{if(this.disposed||this.value.starting)return Promise.resolve();if(this.reading)return this.reading;let e=this.checkRevision;return this.checkInvalidated=!1,this.patch({checking:!0,error:null}),this.reading=(async()=>{try{let t=await this.call("update-check");if(this.disposed||e!==this.checkRevision)return;if(!t?.advice||!t.status||typeof t.canInstall!="boolean")throw Error("invalid update response");this.patch({check:t,status:t.status}),this.active()&&this.poll()}catch{if(this.disposed||e!==this.checkRevision)return;let t=!1;try{let n=await this.call("status");t=!!(n&&!n.plugin)}catch{}if(this.disposed||e!==this.checkRevision)return;this.patch({check:null,error:t?"当前运行的连接服务尚不支持此更新入口。若刚安装新版，请在任务结束后退出并重新打开 Desktop；无需重新配对。仍不可用时请在原生插件管理器核对安装。":"本次更新检查未完成，不能据此判断已是最新版。请稍后重试；配对和聊天不受此次检查失败影响。"})}finally{this.patch({checking:!1})}})().finally(()=>{this.reading=void 0,this.refreshInvalidatedCheck()}),this.reading};install=async()=>{let e=this.value.check;if(!(this.disposed||this.checkInvalidated||this.value.starting||this.value.checking||!e?.canInstall||!e.ticket)){this.patch({starting:!0,error:null,check:{...e,canInstall:!1,ticket:""}});try{let t=await this.call("update-start",{ticket:e.ticket});this.patch({status:t})}catch(t){this.patch({status:t?.code==="update/not-started"?{phase:"failed",message:t instanceof Error?t.message:"尚未启动更新，请重新检查"}:{phase:"unknown",message:"更新提交结果暂未确认，正在核对；请勿重复安装。"}})}finally{this.patch({starting:!1}),this.poll(),this.refreshInvalidatedCheck()}}};poll(){this.disposed||this.timer||!this.listeners.size||!this.active()||(this.timer=setTimeout(async()=>{try{let e=await this.call("update-status");if(!e||!["idle","preparing","installing","restart-required","complete","failed","unknown"].includes(e.phase))throw Error("invalid status");this.patch({status:e,error:e.phase==="idle"?"尚未发现已接受的更新，请重新检查后再操作。":null})}catch{this.patch({error:"更新状态暂不可用；恢复连接后继续核对，不会重复安装。"})}finally{this.timer=void 0,this.poll(),this.refreshInvalidatedCheck()}},2e3))}dispose(){this.disposed=!0,this.checkRevision++,this.checkInvalidated=!1,clearTimeout(this.timer),this.listeners.clear()}};var A=()=>({loadState:"loading",qrState:"idle",status:null,host:null,runtime:null,localOrigin:null,qr:null,error:null,decisionError:null,deciding:!1}),$=r=>r?.companionUpdate?.state?["preparing","installing","verifying","recovering"].includes(r.companionUpdate.state):void 0,P=class{constructor(e,t){this.describeHost=e;this.callManagement=t}updates;nativeUpdates;value=A();listeners=new Set;timer;reading;pairing;disposed=!1;identity="";generation=0;getSnapshot=()=>this.value;subscribe=e=>this.disposed?()=>{}:(this.listeners.add(e),this.timer||(this.refresh(),this.timer=setInterval(()=>void this.refresh(),2e3)),()=>{this.listeners.delete(e),this.listeners.size||(clearInterval(this.timer),this.timer=void 0)});patch(e){if(!this.disposed){this.value={...this.value,...e};for(let t of this.listeners)t()}}async client(){let e=await F(this.describeHost,this.callManagement);if(this.disposed)throw new Error("disposed");let t=`${e.host.agentInstanceId??e.host.computerName}/${e.runtime.profileScope??"web"}`;return this.identity&&this.identity!==t&&(this.generation++,this.value=A(),this.updates?.dispose(),this.updates=void 0,this.nativeUpdates?.dispose(),this.nativeUpdates=void 0),this.identity=t,e.runtime.profileScope==="desktop"&&!this.nativeUpdates&&(this.nativeUpdates=new U(this.callManagement)),this.updates?.origin!==e.localOrigin&&(this.updates?.dispose(),this.updates=e.localOrigin?new q(e.localOrigin):void 0),this.patch({host:e.host,runtime:e.runtime,localOrigin:e.localOrigin}),e}refresh=()=>this.disposed?Promise.resolve():this.reading?this.reading:(this.reading=(async()=>{try{let e=await this.client(),t=this.generation,n={...await e.status()};if(n.companionUpdate?.state==="complete"&&!n.plugin&&(n.companionUpdate={state:"unverified",message:"当前连接服务尚未提供运行版本核验，不能确认两端已对齐。若刚安装插件，请在任务结束后退出并重新打开当前应用；无需重新配对。"}),t!==this.generation)return;let i=$(this.value.status),o=$(n);o!==void 0&&o!==i&&this.nativeUpdates?.invalidateCheck(),this.patch({status:n,runtime:n.gate??e.runtime,loadState:"ready",error:null,...this.value.qr&&this.value.qr.expiresAt<=Date.now()?{qrState:"expired",qr:null}:{}})}catch{this.patch({loadState:"error",error:"连接服务暂未就绪。请确认 DSH 正在运行，然后重试。"})}})().finally(()=>{this.reading=void 0}),this.reading);generateQr=()=>this.disposed?Promise.resolve():this.pairing?this.pairing:(this.patch({qrState:"loading",qr:null,error:null}),this.pairing=(async()=>{try{let e=await this.client(),t=this.generation,n=await e.pairCode();if(t!==this.generation)return;if(!n?.qrDataUrl?.startsWith("data:image/")||!Number.isFinite(n.expiresAt)||n.expiresAt<=Date.now())throw new Error("invalid QR");this.patch({qr:n,qrState:"ready"}),await this.refresh()}catch{this.patch({qr:null,qrState:"error",error:"暂时无法生成配对二维码，请稍后重试。"})}})().finally(()=>{this.pairing=void 0}),this.pairing);decide=async e=>{let t=this.value.status?.companionUpdate?.offerId;if(!(this.disposed||this.value.deciding||!t)){this.patch({deciding:!0,decisionError:null});try{let n=await this.client();if(this.value.status?.companionUpdate?.offerId!==t)throw new Error("stale offer");await n.decide(t,e),await this.reading,await this.refresh()}catch{this.patch({decisionError:"更新选择未确认，请刷新后核对；不要重复安装。"})}finally{this.patch({deciding:!1})}}};dispose=()=>{this.disposed=!0,this.generation++,clearInterval(this.timer),this.timer=void 0,this.listeners.clear(),this.value=A(),this.updates?.dispose(),this.updates=void 0,this.nativeUpdates?.dispose(),this.nativeUpdates=void 0}},Q=new WeakMap;function B(r,e){let t=Q.get(r);return t||(t=new P(r,e),Q.set(r,t)),t}var w=C(x(),1),v=require("react/jsx-runtime");function E({describeHost:r,callManagement:e,onDismiss:t,onOpenDetails:n,store:i=B(r,e)}){let{status:o,deciding:a,decisionError:l,error:h,loadState:u}=(0,Z.useSyncExternalStore)(i.subscribe,i.getSnapshot,i.getSnapshot),g=o?.companionUpdate,_=l||h,S=(0,v.jsxs)("div",{children:[(0,v.jsx)(X,{value:g,deciding:a||u!=="ready",onDecide:H=>void i.decide(H)}),!g&&!_?(0,v.jsx)("p",{className:w.default.helpText,children:"正在检查联动更新状态；尚未确认的更新不会自动启动。"}):g?.state==="idle"?(0,v.jsx)("p",{className:w.default.helpText,children:"未发现需要联动更新的另一端。当前节点可独立使用，不会自动安装另一端或启用已停用的插件。"}):null,_?(0,v.jsx)("p",{role:"alert",children:_}):null,t?(0,v.jsxs)("div",{className:w.default.actions,children:[n?(0,v.jsx)("button",{type:"button",className:w.default.primaryButton,onClick:n,children:"前往微信连接"}):null,(0,v.jsx)("button",{type:"button",className:w.default.secondaryButton,onClick:t,children:"关闭提示（不会确认更新）"})]}):null]});return t?(0,v.jsx)(K.Modal,{open:!0,title:"微信连接 · 联动更新",closeLabel:"关闭提示",className:w.default.pageDialog,contentClassName:w.default.pageDialogContent,onClose:t,children:S}):S}var D=require("react"),Y=C(x(),1),b=require("react/jsx-runtime");function ee({wide:r,openPlugin:e}){let[t,n]=(0,D.useState)(!1),[i,o]=(0,D.useState)(!1),a=(0,D.useRef)(!1),l=async()=>{if(!a.current){a.current=!0,o(!0);try{await e()||n(!0)}finally{a.current=!1,o(!1)}}};return(0,b.jsxs)(b.Fragment,{children:[(0,b.jsxs)("button",{type:"button",className:Y.default.sidebarButton,"data-wide":r,title:"微信连接","aria-label":"微信连接",disabled:i,onClick:()=>void l(),children:[(0,b.jsxs)("svg",{width:"20",height:"20",viewBox:"0 0 24 24",fill:"none",stroke:"currentColor",strokeWidth:"1.7","aria-hidden":"true",children:[(0,b.jsx)("path",{d:"M20 11.5a8 8 0 0 1-8 8 9 9 0 0 1-3.5-.7L4 20l1.2-4.2A7.8 7.8 0 0 1 4 11.5a8 8 0 0 1 16 0Z"}),(0,b.jsx)("path",{d:"M8 11.5h.01M12 11.5h.01M16 11.5h.01",strokeWidth:"2.5",strokeLinecap:"round"})]}),r?(0,b.jsx)("span",{children:i?"正在打开…":"微信连接"}):null]}),t?(0,b.jsx)("small",{role:"status",children:"插件详情暂不可用，请打开「设置 → 微信连接」。"}):null]})}async function te(r){try{let e=r("pluginNavigation"),t=r("remote.pluginManager");if(typeof e?.openBundle!="function"||typeof t?.listBundles!="function")return!1;let n=await t.listBundles();if(!n.ok||!Array.isArray(n.value))return!1;let i=n.value.filter(a=>a.enabled&&["dsh-wechat-remote","@harness-remote/dsh-wechat-remote"].includes(a.name));if(i.length!==1)return!1;let o=r("pluginNavigation");return o!==e||typeof o.openBundle!="function"?!1:(o.openBundle(i[0].name),!0)}catch{return!1}}var j=require("react"),se=require("@deepseek-ai/dsh-client-ui-primitives"),c=C(x(),1);var re=require("react"),m=C(x(),1),d=require("react/jsx-runtime");function ne({store:r}){let{check:e,checking:t,progress:n,error:i,copied:o,resumeFailed:a}=(0,re.useSyncExternalStore)(r.subscribe,r.getSnapshot,r.getSnapshot),l=!!(n&&!n.terminal);return(0,d.jsxs)("div",{className:m.default.updateCard,children:[(0,d.jsxs)("div",{className:m.default.pairingHead,children:[(0,d.jsx)("div",{children:(0,d.jsx)("strong",{children:"当前端插件更新"})}),(0,d.jsx)("button",{type:"button",className:m.default.secondaryButton,disabled:t||l,onClick:()=>void r.refresh(),children:t?"检查中…":"检查更新"})]}),e?(0,d.jsxs)(d.Fragment,{children:[e.channel==="preview"?(0,d.jsx)("span",{className:m.default.updateLabel,"data-severity":"recommended",children:"预览通道"}):null,(0,d.jsxs)("div",{className:m.default.updateVersions,children:[(0,d.jsxs)("span",{children:["DSH ",(0,d.jsx)("strong",{children:e.advice.current.agentVersion||"未知"})]}),(0,d.jsxs)("span",{children:["插件 ",(0,d.jsx)("strong",{children:e.advice.current.pluginVersion||"未知"})]})]}),t?null:(0,d.jsxs)(d.Fragment,{children:[(0,d.jsx)("strong",{className:m.default.updateLabel,"data-severity":e.advice.severity,role:"status",children:e.advice.label}),e.advice.targetVersion?(0,d.jsxs)("p",{children:["可更新至 ",e.advice.targetVersion,e.mode==="manual"?" · 需手动更新":""]}):null,e.advice.severity==="unknown"||e.advice.severity==="required"||e.mode==="manual"||e.mode==="busy"?(0,d.jsxs)("details",{children:[(0,d.jsx)("summary",{children:e.mode==="manual"?"手动更新说明":"查看说明"}),e.reason?(0,d.jsx)("p",{children:e.reason}):null,(0,d.jsx)("p",{children:e.advice.message})]}):null,e.mode==="manual"&&e.manualCommand?(0,d.jsxs)("div",{className:m.default.updateCommand,children:[(0,d.jsx)("code",{children:e.manualCommand}),(0,d.jsx)("button",{type:"button",className:m.default.secondaryButton,disabled:l,onClick:()=>void r.copyCommand(),children:o?"已复制":"复制命令"})]}):null,e.canInstall?(0,d.jsxs)(d.Fragment,{children:[(0,d.jsx)("button",{type:"button",className:m.default.primaryButton,disabled:l||!!i,onClick:()=>void r.install(),children:"更新并重启"}),(0,d.jsx)("small",{className:m.default.updateChecked,children:"只更新当前 Web 插件；会短暂断开连接，保留原配对和会话"})]}):null,e.advice.checkedAt&&e.advice.severity!=="unknown"?(0,d.jsxs)("small",{className:m.default.updateChecked,children:["最近检查 ",new Date(e.advice.checkedAt).toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"})]}):null]})]}):null,i?(0,d.jsx)("p",{role:"alert",children:i}):null,n?(0,d.jsxs)("div",{role:"status","aria-live":"polite",children:[!n.terminal||n.ok===!0?(0,d.jsx)("progress",{className:m.default.updateProgress,max:100,value:n.progress}):null,(0,d.jsx)("p",{children:n.message}),a?(0,d.jsx)("p",{role:"alert",children:"插件已完成更新，但未能自动打开 WebUI。请使用 DSH 启动时显示的地址打开，无需重复更新。"}):null]}):null]})}var ae=require("react"),y=C(x(),1),p=require("react/jsx-runtime");function ie({store:r}){let{check:e,status:t,checking:n,starting:i,error:o}=(0,ae.useSyncExternalStore)(r.subscribe,r.getSnapshot,r.getSnapshot),a=i||t?.phase==="preparing"||t?.phase==="installing",l=t&&["preparing","installing","restart-required","unknown"].includes(t.phase),h=t?.phase==="restart-required"||t?.phase==="complete",u=t?.phase==="restart-required"?"已安装，待重新打开 Desktop":t?.phase==="unknown"?"更新结果待核对":a?"正在更新 Desktop 插件":t?.phase==="complete"?"更新已生效":"";return(0,p.jsxs)("div",{className:y.default.updateCard,children:[(0,p.jsxs)("div",{className:y.default.pairingHead,children:[(0,p.jsx)("strong",{children:"当前端插件更新 · Desktop"}),(0,p.jsx)("button",{type:"button",className:y.default.secondaryButton,disabled:n||a,onClick:()=>void r.refresh(),children:n?"检查中…":"检查更新"})]}),e?(0,p.jsxs)(p.Fragment,{children:[e.channel==="preview"?(0,p.jsx)("span",{className:y.default.updateLabel,"data-severity":"recommended",children:"预览通道"}):null,(0,p.jsxs)("div",{className:y.default.updateVersions,children:[(0,p.jsxs)("span",{children:["DSH ",(0,p.jsx)("strong",{children:e.advice.current.agentVersion})]}),(0,p.jsxs)("span",{children:["运行中的插件 ",(0,p.jsx)("strong",{children:e.advice.current.pluginVersion})]})]}),(0,p.jsx)("strong",{className:y.default.updateLabel,"data-severity":h?"none":e.advice.severity,children:u||e.advice.label}),h&&t.targetVersion?(0,p.jsxs)("p",{children:["已安装版本 ",t.targetVersion]}):!l&&e.advice.targetVersion?(0,p.jsxs)("p",{children:["可更新至 ",e.advice.targetVersion]}):null,!l&&e.reason?(0,p.jsx)("p",{children:e.reason}):null,!l&&e.canInstall?(0,p.jsxs)(p.Fragment,{children:[(0,p.jsx)("p",{className:y.default.helpText,children:"仅更新当前 Desktop 插件，由原生插件管理器使用应用配置的安装源下载并安装指定版本。配对和会话保留，不更新 Web，不自动退出应用；安装完成后需重新打开 Desktop。"}),(0,p.jsx)("button",{type:"button",className:y.default.primaryButton,disabled:a||n,onClick:()=>void r.install(),children:"更新 Desktop 插件"})]}):null,(0,p.jsxs)("small",{className:y.default.updateChecked,children:["最近检查 ",new Date(e.advice.checkedAt).toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"})]})]}):null,t?.phase!=="idle"&&t?(0,p.jsxs)("div",{role:"status","aria-live":"polite",children:[a?(0,p.jsx)("progress",{className:y.default.updateProgress,"aria-label":"Desktop 插件更新中"}):null,(0,p.jsx)("p",{children:t.message})]}):null,o?(0,p.jsx)("p",{role:"alert",children:o}):null]})}var s=require("react/jsx-runtime");function oe({ok:r,busy:e=!1}){return(0,s.jsx)("span",{className:c.default.statusDot,"data-state":e?"busy":r?"ready":"off","aria-hidden":!0})}function V({title:r,detail:e,ok:t,busy:n=!1}){return(0,s.jsxs)("div",{className:c.default.capability,children:[(0,s.jsx)(oe,{ok:t,busy:n}),(0,s.jsxs)("div",{className:c.default.capabilityCopy,children:[(0,s.jsx)("strong",{children:r}),(0,s.jsx)("span",{children:e})]})]})}function M({describeHost:r,callManagement:e,store:t=B(r,e)}){let{loadState:n,qrState:i,status:o,runtime:a,host:l,localOrigin:h,qr:u,error:g}=(0,j.useSyncExternalStore)(t.subscribe,t.getSnapshot,t.getSnapshot),{refresh:_,generateQr:S}=t,H=(0,j.useId)(),k=o?.publicRelay,z=k?.state==="enrolling"||k?.state==="connecting",N=k?.remoteAccess?.status,T=k?.state==="online"&&N==="active",le=N==="suspended"?"账户公网访问已暂停":N==="expired"?"公网访问已到期":N==="not_entitled"?"请在小程序中使用自助开通方式":N!=="active"?"配对后由小程序账户决定":T?"可在外网安全连接":z?"正在准备远程连接":"暂时离线",de=a?.publicDoor??o?.gate?.publicDoor,J=n==="ready"&&!!o?.lan.ip&&de?.state==="listening",O=k?.enabled===!0&&k.state!=="disabled",pe=o?.agent?.agentName||l?.agentName||"DeepSeek Harness",ce=o?.agent?.hostName||l?.computerName||"当前电脑";return(0,s.jsxs)("section",{className:c.default.root,"aria-labelledby":H,children:[(0,s.jsxs)("div",{className:c.default.hero,children:[(0,s.jsxs)("div",{className:c.default.identity,children:[(0,s.jsx)("span",{className:c.default.mark,"aria-hidden":!0,children:(0,s.jsx)(se.FishLogo,{size:28})}),(0,s.jsxs)("div",{className:c.default.identityCopy,children:[(0,s.jsx)("h3",{id:H,children:"微信连接"}),(0,s.jsxs)("p",{children:[pe,(0,s.jsx)("span",{"aria-hidden":!0,children:" · "}),ce]})]})]}),(0,s.jsxs)("span",{className:c.default.overall,"data-ready":n==="ready",children:[(0,s.jsx)(oe,{ok:n==="ready",busy:n==="loading"}),n==="loading"?"检测中":n==="ready"?"服务正常":"暂不可用"]})]}),a?.profileScope==="desktop"&&o&&(!o.plugin||o.plugin.runningVersion!==o.plugin.installedVersion)?(0,s.jsxs)("aside",{className:c.default.companionCard,"data-state":"self-restart-required",role:"status",children:[(0,s.jsx)("strong",{children:o.plugin?"新版插件尚未生效，请完整重启 Desktop":"刚升级插件？请先完整重启 Desktop"}),o.plugin?(0,s.jsxs)("p",{children:["正在运行 ",o.plugin.runningVersion,"；已安装 ",o.plugin.installedVersion,"。"]}):(0,s.jsx)("p",{children:"当前连接服务尚不能核验运行版本，不能把安装完成当作新版已生效。"}),(0,s.jsx)("p",{children:"等当前任务结束后，选择顶部「应用 → 退出」，再重新打开 Desktop。仅关闭窗口、刷新页面或开关插件不能保证新版生效。"}),(0,s.jsx)("small",{children:"不必重装或重新配对。此操作不会升级或重启 Web。"})]}):null,(0,s.jsxs)("div",{className:c.default.capabilities,children:[(0,s.jsx)(V,{title:"局域网直连",detail:n==="loading"?"检测中":J?"已就绪":"暂不可用",ok:J,busy:n==="loading"}),(0,s.jsx)(V,{title:"远程访问",detail:le,ok:T,busy:z||n==="loading"}),(0,s.jsx)(V,{title:"账号连接保护",detail:O?"已启用":"配对后启用",ok:O,busy:n==="loading"})]}),g!==null?(0,s.jsxs)("div",{className:c.default.notice,role:"status",children:[(0,s.jsx)("span",{children:g}),(0,s.jsx)("button",{type:"button",onClick:()=>void _(),children:"重试"})]}):null,i==="idle"?(0,s.jsxs)("div",{className:c.default.connectCard,children:[(0,s.jsxs)("div",{children:[(0,s.jsx)("strong",{children:"添加到微信"}),(0,s.jsx)("p",{children:"打开「Agent远程管理助手」→ 添加节点，扫描配对二维码。"})]}),(0,s.jsx)("button",{type:"button",className:c.default.primaryButton,disabled:n!=="ready",onClick:()=>void S(),children:"生成二维码"})]}):(0,s.jsxs)("div",{className:c.default.pairingCard,children:[(0,s.jsxs)("div",{className:c.default.pairingHead,children:[(0,s.jsxs)("div",{children:[(0,s.jsx)("strong",{children:"扫描二维码"}),(0,s.jsx)("p",{children:"小程序「设置 → 添加节点」"})]}),(0,s.jsx)("button",{type:"button",className:c.default.secondaryButton,disabled:i==="loading"||n!=="ready",onClick:()=>void S(),children:i==="loading"?"生成中…":"重新生成"})]}),(0,s.jsxs)("div",{className:c.default.qrArea,children:[n==="ready"&&i==="ready"&&u!==null?(0,s.jsx)("img",{className:c.default.qr,src:u.qrDataUrl,alt:"Agent远程管理助手配对二维码"}):(0,s.jsx)("div",{className:c.default.qrPlaceholder,"aria-live":"polite",children:n!=="ready"?"连接恢复后可查看二维码":i==="expired"?"二维码已过期，请重新生成":i==="error"?"生成失败":"正在生成…"}),i==="ready"&&u!==null?(0,s.jsxs)("small",{className:c.default.qrValidity,children:["有效至 ",new Date(u.expiresAt).toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"})," · 切换页面不重新生成"]}):null]}),(0,s.jsx)("p",{className:c.default.securityNote,children:u?.mode==="public-relay"?"配对后自动选择更快的连接；远程内容端到端加密。":"当前可通过同一局域网连接。"})]}),h&&t.updates?(0,s.jsx)(ne,{store:t.updates}):null,a?.profileScope==="desktop"&&t.nativeUpdates?(0,s.jsx)(ie,{store:t.nativeUpdates}):null,(0,s.jsxs)("div",{className:c.default.linkedSection,children:[(0,s.jsx)("h4",{children:"另一端插件"}),(0,s.jsx)(E,{describeHost:r,callManagement:e,store:t})]}),(0,s.jsx)("p",{className:c.default.securityNote,children:"设置和插件详情共用当前节点的配对与更新状态；Web 与 Desktop 各自独立。"})]})}var we=["slots","connection"];function xe(r){let e=async(a,l)=>{let h=await r.connection.rpc.call("/wechat-remote-management",a,l??{});if(!h.ok)throw Object.assign(new Error(h.error.message),{code:h.error.code});return h.value},t=async()=>{let a=await r.connection.rpc.call("/api","wechatHost/describe",{args:{request:{}}});if(!a.ok)throw new Error(`wechatHost/describe: ${a.error.code}`);let l=a.value;if(l?.ok!==!0||l.value===void 0)throw new Error("wechatHost/describe returned an invalid result");return l.value},n=new P(t,e);r.effect(()=>()=>n.dispose(),"wechat shared page");let i=()=>te(a=>r.get(a)),o=()=>({describeHost:t,callManagement:e,store:n});r.slots.inject("settings.section",()=>r.slots.register({name:"settings.section",id:"harness-remote",order:30,label:"微信连接",inject:o},M));for(let a of["plugins.bundle.activation","plugins.bundle.config"])r.slots.inject(a,()=>{let l=["dsh-wechat-remote","@harness-remote/dsh-wechat-remote"].map(h=>r.slots.register({name:a,key:h,inject:o},a==="plugins.bundle.activation"?E:M));return()=>l.forEach(h=>h())});r.inject(["pluginNavigation","remote.pluginManager"],()=>r.slots.inject("sidebar.footer.action",()=>r.slots.register({name:"sidebar.footer.action",id:"harness-remote",order:30,label:"微信连接",inject:()=>({openPlugin:i})},ee)))}

return module.exports;}});
