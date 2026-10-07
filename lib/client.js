window.__ModuleLoader__.load({id:"@harness-remote/dsh-wechat-remote",factory:(require)=>{var module={exports:{}};var exports=module.exports;"use strict";var _e=Object.create;var z=Object.defineProperty;var we=Object.getOwnPropertyDescriptor;var xe=Object.getOwnPropertyNames;var ke=Object.getPrototypeOf,Ce=Object.prototype.hasOwnProperty;var Se=(a,e)=>()=>(e||a((e={exports:{}}).exports,e),e.exports),Ne=(a,e)=>{for(var t in e)z(a,t,{get:e[t],enumerable:!0})},Z=(a,e,t,s)=>{if(e&&typeof e=="object"||typeof e=="function")for(let r of xe(e))!Ce.call(a,r)&&r!==t&&z(a,r,{get:()=>e[r],enumerable:!(s=we(e,r))||s.enumerable});return a};var R=(a,e,t)=>(t=a!=null?_e(ke(a)):{},Z(e||!a||!a.__esModule?z(t,"default",{value:a,enumerable:!0}):t,a)),Pe=a=>Z(z({},"__esModule",{value:!0}),a);var H=Se((Ae,Y)=>{"use strict";var De=`.hr_65e9222_root {\r
  box-sizing: border-box;\r
  width: 100%;\r
  max-width: 760px;\r
  color: var(--dsw-alias-label-primary, #171a20);\r
  display: flex;\r
  flex-direction: column;\r
  gap: 14px;\r
}\r
\r
.hr_65e9222_hero,\r
.hr_65e9222_connectCard,\r
.hr_65e9222_pairingCard {\r
  border: 1px solid var(--dsw-alias-border-l2, rgba(128, 140, 160, 0.22));\r
  background: var(--dsw-alias-bg-layer-3, #fff);\r
  border-radius: 12px;\r
}\r
\r
.hr_65e9222_hero {\r
  min-height: 72px;\r
  display: flex;\r
  align-items: center;\r
  justify-content: space-between;\r
  gap: 20px;\r
  padding: 16px 18px;\r
}\r
\r
.hr_65e9222_identity {\r
  min-width: 0;\r
  display: flex;\r
  align-items: center;\r
  gap: 12px;\r
}\r
\r
.hr_65e9222_mark {\r
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
.hr_65e9222_identityCopy {\r
  min-width: 0;\r
}\r
\r
.hr_65e9222_identityCopy h3,\r
.hr_65e9222_identityCopy p,\r
.hr_65e9222_connectCard p,\r
.hr_65e9222_pairingHead p,\r
.hr_65e9222_securityNote {\r
  margin: 0;\r
}\r
\r
.hr_65e9222_sidebarButton { display: flex; align-items: center; gap: 10px; width: 100%; min-height: 38px; padding: 8px 12px; border: 0; border-radius: 8px; background: transparent; color: var(--dsw-alias-label-secondary, #4d5564); font: inherit; font-size: 14px; cursor: pointer; text-align: left; }\r
.hr_65e9222_sidebarButton:hover { background: var(--dsw-alias-bg-layer-2, #eef1f5); color: var(--dsw-alias-label-primary, #171a20); }\r
.hr_65e9222_sidebarButton[data-wide='false'] { width: 36px; min-height: 36px; padding: 8px; justify-content: center; }\r
.hr_65e9222_sidebarButton svg { flex: none; }\r
.hr_65e9222_sidebarButton:focus-visible { outline: 2px solid var(--dsw-alias-state-business-primary, #4e79ff); outline-offset: 2px; }\r
.hr_65e9222_actions { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 16px; }\r
.hr_65e9222_pageDialog.hr_65e9222_pageDialog { width: min(820px, 100%); max-height: 100%; }\r
.hr_65e9222_pageDialogContent.hr_65e9222_pageDialogContent { min-height: 0; overflow-y: auto; }\r
.hr_65e9222_helpText { color: var(--dsw-alias-label-secondary, #647084); font-size: 12px; line-height: 1.7; margin: 8px 0; }\r
.hr_65e9222_linkedSection h4 { margin: 4px 0 10px; font-size: 13px; }\r
\r
.hr_65e9222_companionCard {\r
  border: 1px solid var(--dsw-alias-state-business-primary, #4e79ff);\r
  border-left-width: 4px;\r
  border-radius: 10px;\r
  background: var(--dsw-alias-bg-layer-3, #fff);\r
  padding: 14px 16px;\r
  line-height: 1.6;\r
  overflow-wrap: anywhere;\r
}\r
.hr_65e9222_companionCard strong { font-size: 14px; }\r
.hr_65e9222_companionCard p { margin: 4px 0; font-size: 13px; }\r
.hr_65e9222_companionCard small { color: var(--dsw-alias-label-secondary, #4d5564); }\r
.hr_65e9222_companionCard progress { display: block; width: 100%; margin: 8px 0; accent-color: #4e79ff; }\r
.hr_65e9222_companionCard[data-state='complete'] { border-color: var(--dsw-alias-state-success-primary, #1f9d68); }\r
.hr_65e9222_companionCard[data-state='unavailable'], .hr_65e9222_companionCard[data-state='recovering'] { border-color: #b5861d; }

/* Assistant modes are a compact owner-facing catalog, not an installation log. */
.hr_65e9222_assistantsCard { padding: 20px; border: 1px solid var(--dsw-alias-border-l2, #e2e6ee); border-radius: 14px; background: var(--dsw-alias-bg-layer-3, #fff); line-height: 1.55; overflow-wrap: anywhere; }
.hr_65e9222_assistantsCard h3, .hr_65e9222_assistantsCard h4, .hr_65e9222_assistantsCard p { margin: 0; }
.hr_65e9222_assistantsCard h3 { font-size: 16px; }
.hr_65e9222_assistantsCard h4 { font-size: 14px; margin: 16px 0 6px; }
.hr_65e9222_assistantsCard p { color: var(--dsw-alias-label-secondary, #647084); font-size: 13px; }
.hr_65e9222_assistantsHeading { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; margin-bottom: 16px; }
.hr_65e9222_assistantsHeading p { margin-top: 4px; }
.hr_65e9222_assistantChoices { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
.hr_65e9222_assistantChoice { border: 1px solid var(--dsw-alias-border-l2, #e2e6ee); border-radius: 12px; padding: 16px; display: flex; flex-direction: column; gap: 10px; background: var(--dsw-alias-bg-layer-1, #f7f9fd); }
.hr_65e9222_assistantChoiceHead, .hr_65e9222_assistantEntryHead { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 8px; }
.hr_65e9222_assistantChoiceHead strong { font-size: 15px; }
.hr_65e9222_assistantChoice p { flex: 1; }
.hr_65e9222_assistantStatus { color: var(--dsw-alias-state-success-primary, #17845b); font-size: 12px; }
.hr_65e9222_assistantPrimary, .hr_65e9222_assistantSecondary, .hr_65e9222_assistantTextButton { min-height: 42px; padding: 9px 16px; border-radius: 9px; font: inherit; font-size: 13px; cursor: pointer; }
.hr_65e9222_assistantPrimary { color: #fff; background: var(--dsw-alias-state-business-primary, #4e79ff); border: 1px solid transparent; }
.hr_65e9222_assistantSecondary { color: var(--dsw-alias-state-business-primary, #4e79ff); background: var(--dsw-alias-bg-layer-3, #fff); border: 1px solid var(--dsw-alias-border-l2, #d7deed); }
.hr_65e9222_assistantTextButton { min-height: 32px; padding: 3px 8px; border: 0; background: transparent; color: var(--dsw-alias-state-business-primary, #4e79ff); }
.hr_65e9222_assistantPrimary:disabled, .hr_65e9222_assistantSecondary:disabled, .hr_65e9222_assistantTextButton:disabled { opacity: .5; cursor: default; }
.hr_65e9222_assistantPrimary:focus-visible, .hr_65e9222_assistantSecondary:focus-visible, .hr_65e9222_assistantTextButton:focus-visible, .hr_65e9222_assistantDetails summary:focus-visible { outline: 2px solid var(--dsw-alias-state-business-primary, #4e79ff); outline-offset: 3px; }
.hr_65e9222_assistantCustomize { margin-top: 18px; padding-top: 2px; border-top: 1px solid var(--dsw-alias-border-l2, #e2e6ee); }
.hr_65e9222_assistantCustomize > p { margin-bottom: 10px; }
.hr_65e9222_assistantCustomize .hr_65e9222_assistantChoice { background: transparent; }
.hr_65e9222_assistantDetails { margin-top: 14px; color: var(--dsw-alias-label-secondary, #647084); font-size: 12px; }
.hr_65e9222_assistantDetails summary { padding: 5px 0; cursor: pointer; }
.hr_65e9222_assistantDetails ul { margin: 8px 0; padding-left: 20px; }
.hr_65e9222_assistantDetails li { margin: 5px 0; }
.hr_65e9222_assistantPreview, .hr_65e9222_assistantHelp { padding: 14px; margin-top: 16px !important; border-radius: 10px; background: var(--dsw-alias-bg-layer-1, #f0f4ff); }
.hr_65e9222_assistantPreview h4 { margin-top: 0; }
.hr_65e9222_assistantPreview p + p { margin-top: 8px; }
.hr_65e9222_assistantButtons { display: flex; gap: 10px; flex-wrap: wrap; margin-top: 14px; }
.hr_65e9222_assistantEntry { margin-top: 10px; padding: 12px 0; border-top: 1px solid var(--dsw-alias-border-l2, #e2e6ee); }
.hr_65e9222_assistantEntryHead { margin-bottom: 8px; font-size: 13px; }
.hr_65e9222_assistantEntryHead > span { color: var(--dsw-alias-label-secondary, #647084); font-size: 12px; }
.hr_65e9222_assistantEntry > button + button { margin-left: 8px; }
@media (max-width: 520px) { .hr_65e9222_assistantChoices { grid-template-columns: 1fr; } .hr_65e9222_assistantsCard { padding: 14px; } }
\r
.hr_65e9222_identityCopy h3 {\r
  font-size: 15px;\r
  font-weight: 650;\r
  line-height: 22px;\r
}\r
\r
.hr_65e9222_identityCopy p {\r
  color: var(--dsw-alias-label-tertiary, #7d8492);\r
  font-size: 12px;\r
  line-height: 18px;\r
  overflow: hidden;\r
  text-overflow: ellipsis;\r
  white-space: nowrap;\r
}\r
\r
.hr_65e9222_overall {\r
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
.hr_65e9222_overall[data-ready='true'] {\r
  color: var(--dsw-alias-state-success-primary, #1f9d68);\r
}\r
\r
.hr_65e9222_statusDot {\r
  width: 7px;\r
  height: 7px;\r
  background: var(--dsw-alias-label-tertiary, #8b93a2);\r
  border-radius: 999px;\r
  flex: none;\r
}\r
\r
.hr_65e9222_statusDot[data-state='ready'] {\r
  background: var(--dsw-alias-state-success-primary, #1f9d68);\r
}\r
\r
.hr_65e9222_statusDot[data-state='busy'] {\r
  background: var(--dsw-alias-state-business-primary, #4e79ff);\r
  animation: harnessRemotePulse 1.2s ease-in-out infinite;\r
}\r
\r
.hr_65e9222_capabilities {\r
  grid-template-columns: repeat(3, minmax(0, 1fr));\r
  gap: 10px;\r
  display: grid;\r
}\r
\r
.hr_65e9222_capability {\r
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
.hr_65e9222_capability > .hr_65e9222_statusDot {\r
  margin-top: 6px;\r
}\r
\r
.hr_65e9222_capabilityCopy {\r
  min-width: 0;\r
  display: flex;\r
  flex-direction: column;\r
  gap: 1px;\r
}\r
\r
.hr_65e9222_capabilityCopy strong {\r
  font-size: 12.5px;\r
  font-weight: 600;\r
  line-height: 19px;\r
}\r
\r
.hr_65e9222_capabilityCopy span {\r
  color: var(--dsw-alias-label-tertiary, #7d8492);\r
  font-size: 11px;\r
  line-height: 17px;\r
  overflow: hidden;\r
  text-overflow: ellipsis;\r
  white-space: nowrap;\r
}\r
\r
.hr_65e9222_notice {\r
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
.hr_65e9222_notice button,\r
.hr_65e9222_secondaryButton {\r
  border: 1px solid var(--dsw-alias-border-l2, rgba(128, 140, 160, 0.28));\r
  color: var(--dsw-alias-label-primary, #171a20);\r
  background: var(--dsw-alias-bg-layer-1, #f5f6f8);\r
  border-radius: 7px;\r
  font: inherit;\r
  cursor: pointer;\r
}\r
\r
.hr_65e9222_notice button {\r
  flex: none;\r
  padding: 3px 9px;\r
}\r
\r
.hr_65e9222_connectCard {\r
  display: flex;\r
  align-items: center;\r
  justify-content: space-between;\r
  gap: 20px;\r
  padding: 18px;\r
}\r
\r
.hr_65e9222_connectCard strong,\r
.hr_65e9222_pairingHead strong {\r
  font-size: 14px;\r
  font-weight: 650;\r
  line-height: 21px;\r
}\r
\r
.hr_65e9222_connectCard p,\r
.hr_65e9222_pairingHead p {\r
  max-width: 470px;\r
  color: var(--dsw-alias-label-tertiary, #7d8492);\r
  font-size: 12px;\r
  line-height: 18px;\r
}\r
\r
.hr_65e9222_primaryButton {\r
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
.hr_65e9222_primaryButton:hover {\r
  filter: brightness(1.04);\r
}\r
\r
.hr_65e9222_primaryButton:focus-visible,\r
.hr_65e9222_secondaryButton:focus-visible,\r
.hr_65e9222_notice button:focus-visible {\r
  outline: 2px solid var(--dsw-alias-state-business-primary, #4e79ff);\r
  outline-offset: 2px;\r
}\r
\r
.hr_65e9222_pairingCard {\r
  padding: 18px;\r
}\r
\r
.hr_65e9222_pairingHead {\r
  display: flex;\r
  align-items: center;\r
  justify-content: space-between;\r
  gap: 16px;\r
}\r
\r
.hr_65e9222_secondaryButton {\r
  min-height: 32px;\r
  flex: none;\r
  padding: 0 11px;\r
  font-size: 12px;\r
}\r
\r
.hr_65e9222_secondaryButton:disabled,\r
.hr_65e9222_primaryButton:disabled {\r
  cursor: default;\r
  opacity: 0.55;\r
}\r
\r
.hr_65e9222_qrArea {\r
  min-height: 292px;\r
  margin-top: 16px;\r
  display: flex;\r
  flex-direction: column;\r
  align-items: center;\r
  justify-content: center;\r
  gap: 10px;\r
}\r
\r
.hr_65e9222_qr,\r
.hr_65e9222_qrPlaceholder {\r
  box-sizing: border-box;\r
  width: 280px;\r
  height: 280px;\r
  border-radius: 12px;\r
}\r
\r
.hr_65e9222_qr {\r
  background: #fff;\r
  padding: 10px;\r
  image-rendering: pixelated;\r
}\r
\r
.hr_65e9222_qrPlaceholder {\r
  color: var(--dsw-alias-label-tertiary, #7d8492);\r
  background: var(--dsw-alias-bg-layer-1, #f5f6f8);\r
  border: 1px dashed var(--dsw-alias-border-l2, rgba(128, 140, 160, 0.28));\r
  display: grid;\r
  place-items: center;\r
  font-size: 12px;\r
}\r
\r
.hr_65e9222_qrValidity {\r
  color: var(--dsw-alias-label-tertiary, #7d8492);\r
  font-size: 11px;\r
  line-height: 17px;\r
}\r
\r
.hr_65e9222_securityNote {\r
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
  .hr_65e9222_statusDot[data-state='busy'] {\r
    animation: none;\r
  }\r
}\r
\r
@media (max-width: 680px) {\r
  .hr_65e9222_capabilities {\r
    grid-template-columns: minmax(0, 1fr);\r
  }\r
\r
  .hr_65e9222_connectCard {\r
    align-items: stretch;\r
    flex-direction: column;\r
  }\r
\r
  .hr_65e9222_primaryButton {\r
    width: 100%;\r
  }\r
\r
  .hr_65e9222_qrArea {\r
    flex-direction: column;\r
    gap: 12px;\r
  }\r
\r
}\r
.hr_65e9222_updateCard { border: 1px solid var(--dsw-alias-border-l2, #ddd); background: var(--dsw-alias-bg-layer-3, #fff); border-radius: 12px; padding: 18px; line-height: 1.6; font-size: 13px; overflow-wrap: anywhere; }\r
.hr_65e9222_updateLabel { color: inherit; }\r
.hr_65e9222_updateLabel[data-severity="none"] { color: #218b5c; }\r
.hr_65e9222_updateLabel[data-severity="unknown"] { color: var(--text-secondary, #858b96); }\r
.hr_65e9222_updateLabel[data-severity="required"] { color: #d54052; }\r
.hr_65e9222_updateLabel[data-severity="recommended"], .hr_65e9222_updateLabel[data-severity="info"] { color: #b5861d; }\r
.hr_65e9222_updateProgress { width: 100%; height: 12px; margin-top: 16px; accent-color: #7487ef; }\r
.hr_65e9222_updateVersions { display: flex; flex-wrap: wrap; gap: 10px 24px; margin: 12px 0; }\r
.hr_65e9222_updateVersions span { color: var(--text-secondary, #858b96); }\r
.hr_65e9222_updateVersions strong { color: var(--text-primary, inherit); font-weight: 500; }\r
.hr_65e9222_updateCommand { display: flex; flex-wrap: wrap; align-items: center; gap: 12px; margin-top: 12px; }\r
.hr_65e9222_updateCommand code { flex: 1 1 240px; white-space: pre-wrap; overflow-wrap: anywhere; user-select: text; }\r
.hr_65e9222_updateChecked { display: block; margin-top: 10px; color: var(--text-secondary, #858b96); }\r
`,K="@harness-remote/dsh-wechat-remote/HarnessRemoteSettings.module.css";if(typeof document<"u"&&document.querySelector("style[data-plugin-css="+JSON.stringify(K)+"]")===null){let a=document.createElement("style");a.dataset.plugin="@harness-remote/dsh-wechat-remote",a.dataset.pluginCss=K,a.textContent=De,document.head.appendChild(a)}Y.exports={root:"hr_65e9222_root",hero:"hr_65e9222_hero",connectCard:"hr_65e9222_connectCard",pairingCard:"hr_65e9222_pairingCard",identity:"hr_65e9222_identity",mark:"hr_65e9222_mark",identityCopy:"hr_65e9222_identityCopy",pairingHead:"hr_65e9222_pairingHead",securityNote:"hr_65e9222_securityNote",sidebarButton:"hr_65e9222_sidebarButton",actions:"hr_65e9222_actions",pageDialog:"hr_65e9222_pageDialog",pageDialogContent:"hr_65e9222_pageDialogContent",helpText:"hr_65e9222_helpText",linkedSection:"hr_65e9222_linkedSection",companionCard:"hr_65e9222_companionCard",assistantsCard:"hr_65e9222_assistantsCard",assistantsHeading:"hr_65e9222_assistantsHeading",assistantChoices:"hr_65e9222_assistantChoices",assistantChoice:"hr_65e9222_assistantChoice",assistantChoiceHead:"hr_65e9222_assistantChoiceHead",assistantEntryHead:"hr_65e9222_assistantEntryHead",assistantStatus:"hr_65e9222_assistantStatus",assistantPrimary:"hr_65e9222_assistantPrimary",assistantSecondary:"hr_65e9222_assistantSecondary",assistantTextButton:"hr_65e9222_assistantTextButton",assistantDetails:"hr_65e9222_assistantDetails",assistantCustomize:"hr_65e9222_assistantCustomize",assistantPreview:"hr_65e9222_assistantPreview",assistantHelp:"hr_65e9222_assistantHelp",assistantButtons:"hr_65e9222_assistantButtons",assistantEntry:"hr_65e9222_assistantEntry",overall:"hr_65e9222_overall",statusDot:"hr_65e9222_statusDot",capabilities:"hr_65e9222_capabilities",capability:"hr_65e9222_capability",capabilityCopy:"hr_65e9222_capabilityCopy",notice:"hr_65e9222_notice",secondaryButton:"hr_65e9222_secondaryButton",primaryButton:"hr_65e9222_primaryButton",qrArea:"hr_65e9222_qrArea",qr:"hr_65e9222_qr",qrPlaceholder:"hr_65e9222_qrPlaceholder",qrValidity:"hr_65e9222_qrValidity",updateCard:"hr_65e9222_updateCard",updateLabel:"hr_65e9222_updateLabel",updateProgress:"hr_65e9222_updateProgress",updateVersions:"hr_65e9222_updateVersions",updateCommand:"hr_65e9222_updateCommand",updateChecked:"hr_65e9222_updateChecked"}});var Ee={};Ne(Ee,{apply:()=>Re,inject:()=>Ie});module.exports=Pe(Ee);var re=require("react"),ne=require("@deepseek-ai/dsh-client-ui-primitives");var T=R(H(),1),w=require("react/jsx-runtime");function ee({value:a,onDecide:e,deciding:t=!1}){if(!a||a.state==="idle"||!a.message)return null;let s={"confirmation-required":"是否更新下方指定端的插件？",deferred:"已暂缓此次联动更新",pending:"联动更新待处理",busy:"等待待更新端的任务结束",preparing:"正在准备联动更新",installing:"正在安装插件更新",verifying:"正在核验更新后的恢复状态",recovering:"正在恢复更新前的插件","restart-required":"待更新端需启动或重启确认","self-restart-required":"当前端待重启，尚未生效",unverified:"两端更新状态待核实",complete:"两端插件已对齐",unavailable:"联动更新尚未确认成功"},r=["preparing","installing","verifying","recovering"].includes(a.state);return(0,w.jsxs)("aside",{className:T.default.companionCard,"data-state":a.state,role:"status","aria-live":"polite",children:[(0,w.jsx)("strong",{children:s[a.state]||"另一端插件更新状态"}),(0,w.jsx)("p",{children:a.message}),a.versions?(0,w.jsxs)("small",{children:[a.versions.current==="desktop"?"Desktop":"Web","：运行 ",a.versions.running," · 已安装 ",a.versions.installed??"未确认","；",a.versions.peer==="desktop"?"Desktop":"Web","：已安装 ",a.versions.peerInstalled??"未确认或未启用"]}):null,["confirmation-required","deferred"].includes(a.state)&&a.offerId&&e?(0,w.jsxs)("div",{children:[(0,w.jsx)("button",{type:"button",className:T.default.primaryButton,disabled:t,onClick:()=>e("approve"),children:"确认并等待空闲后更新"}),(0,w.jsx)("button",{type:"button",className:T.default.secondaryButton,disabled:t,onClick:()=>e("later"),children:"稍后再说"})]}):null,r?(0,w.jsx)("progress",{"aria-label":"联动更新进度"}):null,a.state==="busy"?(0,w.jsx)("small",{children:"不用手动停止任务。请保持两端运行，空闲后会继续检查。"}):r?(0,w.jsx)("small",{children:"请保持两端当前状态，暂勿退出、重启或重复安装。关闭本设置页不会取消更新。"}):a.state==="unavailable"?(0,w.jsx)("small",{children:"请在待更新端核对版本，必要时使用其原安装入口。"}):null]})}async function te(a,e,t=fetch){let s=await a(),r=s.gate;if(!r)throw new Error("当前节点没有提供配对入口");let d=r.profileScope==="desktop",o=r.localDoor?.port,p=Number.isSafeInteger(o)&&o>=1&&o<=65535?`http://127.0.0.1:${o}`:null;if(r.management==="authenticated-rpc")return{host:s,runtime:r,localOrigin:d?null:p,status:()=>e("status"),pairCode:()=>e("pair-code"),decide:(h,u)=>e("companion-decision",{offerId:h,action:u})};if(d||r.management==="unavailable"||!p||r.localDoor.state!=="listening")throw new Error("当前节点配对入口尚未就绪");let y=async h=>{let u=await t(p+h,{cache:"no-store"});if(!u.ok)throw new Error(`配对请求失败 (${u.status})`);return u.json()};return{host:s,runtime:r,localOrigin:p,status:()=>y("/gate/status"),pairCode:()=>y("/pair/code"),decide:async(h,u)=>{let f=await t(p+"/gate/companion/decision",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({offerId:h,action:u})});if(!f.ok)throw new Error("更新通知已变化，请刷新后重试");return f.json()}}}var J=class{constructor(e,t=globalThis.fetch){this.origin=e;this.fetcher=t.bind(globalThis)}value={check:null,checking:!1,progress:null,error:"",copied:!1,resumeFailed:!1};listeners=new Set;reading;installing=!1;disposed=!1;job=null;timer;pollGeneration=0;recovering=!1;fetcher;getSnapshot=()=>this.value;subscribe=e=>this.disposed?()=>{}:(this.listeners.add(e),this.listeners.size===1&&this.refresh(),()=>{this.listeners.delete(e)});patch(e){if(!this.disposed){this.value={...this.value,...e};for(let t of this.listeners)t()}}refresh=()=>this.disposed?Promise.resolve():this.reading?this.reading:(this.patch({checking:!0,error:"",copied:!1}),this.reading=(async()=>{try{let e=await this.fetcher(this.origin+"/gate/update/check",{signal:AbortSignal.timeout(1e4)}),t=await e.json();if(!e.ok)throw new Error(t.error||"暂时无法检查更新");if(!t.advice?.current||typeof t.advice.label!="string")throw new Error("更新检查返回信息不完整");if(this.patch({check:t}),this.installing||this.job||this.recovering)return;t.activeJob?.statusOrigin?this.follow(t.activeJob):t.lastResult?.phase==="unknown"?this.patch({progress:t.lastResult}):t.mode==="busy"?this.patch({progress:{phase:"preparing",progress:0,message:"更新仍在准备或等待确认，请稍后重新检查；不要重复安装。",terminal:!0}}):this.patch({progress:t.lastResult??null})}catch(e){this.patch({check:null,error:e instanceof Error?e.message:"暂时无法检查更新"})}finally{this.patch({checking:!1})}})().finally(()=>{this.reading=void 0}),this.reading);follow(e){if(this.disposed||this.job?.jobId===e.jobId)return;this.job=e;let t=++this.pollGeneration,s=Date.now()+10*6e4;clearTimeout(this.timer),this.patch({progress:{phase:"recovering",progress:0,message:"正在恢复更新进度…",terminal:!1}});let r=async()=>{if(this.disposed||t!==this.pollGeneration)return;let d;try{let o=await this.fetcher(e.statusOrigin+"/status",{headers:{Authorization:"Bearer "+e.statusToken},signal:AbortSignal.timeout(4e3)});if(!o.ok)throw new Error("进度暂不可用");let p=await o.json();if(p.jobId!==e.jobId||typeof p.terminal!="boolean"||typeof p.message!="string")throw new Error("进度不匹配");d=p}catch{try{let o=await this.fetcher(this.origin+"/gate/update/status",{signal:AbortSignal.timeout(3e3)}),p=await o.json();o.ok&&p.lastResult?.jobId===e.jobId&&(d=p.lastResult)}catch{}}if(!(this.disposed||t!==this.pollGeneration)){if(d&&(this.patch({progress:d}),d.terminal)){this.job=null,d.ok?this.resume(e.jobId):this.refresh();return}if(Date.now()>s){this.job=null,this.patch({progress:{phase:"unknown",progress:0,message:"暂时无法确认更新结果。请重新打开此主机 WebUI 检查版本；不要重复安装或删除节点。",terminal:!0}});return}this.timer=setTimeout(()=>void r(),1e3)}};r()}async resume(e){this.recovering=!0;let t=Date.now()+3e4,s=async()=>{try{let r=await this.fetcher(this.origin+"/gate/update/resume?job="+encodeURIComponent(e),{signal:AbortSignal.timeout(3e3)});if(!r.ok)throw new Error("尚未恢复");let d=await r.json();if(!d.url)throw new Error("缺少恢复地址");let o=new URL(d.url);if(o.origin!==window.location.origin||o.pathname!=="/"||o.username||o.password||o.hash)throw new Error("恢复地址不匹配");this.disposed||window.location.replace(o.href)}catch{if(this.disposed)return;if(Date.now()>=t){this.recovering=!1,this.patch({resumeFailed:!0});return}this.timer=setTimeout(()=>void s(),1e3)}};await s()}install=async()=>{let{check:e,checking:t,error:s,progress:r}=this.value;if(this.disposed||!e?.canInstall||t||s||r&&!r.terminal||this.installing||this.job||this.recovering)return;this.installing=!0,this.patch({error:"",check:{...e,canInstall:!1,ticket:""},progress:{phase:"download",progress:10,message:"正在下载并验证更新包；当前插件尚未替换",terminal:!1}});let d=!1;try{let o=await this.fetcher(this.origin+"/gate/update/start",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({ticket:e.ticket})}),p=await o.json();if(d=!o.ok&&typeof p.error=="string",!o.ok||!p.statusOrigin)throw new Error(p.error||"无法取得更新进度，请重新检查");this.follow(p)}catch(o){if(this.disposed)return;if(d)this.patch({progress:{phase:"failed",progress:0,message:(o instanceof Error?o.message:"更新暂不可用")+"。请重新检查更新。",terminal:!0,ok:!1}});else{try{let p=await this.fetcher(this.origin+"/gate/update/status",{signal:AbortSignal.timeout(3e3)}),y=await p.json();if(p.ok&&y.activeJob?.statusOrigin){this.follow(y.activeJob);return}}catch{}this.patch({progress:{phase:"unknown",progress:0,message:"连接中断，暂时无法确认更新结果。请稍后检查更新；不要重复安装或删除节点。",terminal:!0}})}}finally{this.installing=!1}};copyCommand=async()=>{if(!(!this.value.check?.manualCommand||this.value.checking||this.installing||this.job))try{await navigator.clipboard.writeText(this.value.check.manualCommand),this.patch({copied:!0})}catch{this.patch({error:"复制失败，请手动选中下方命令复制。"})}};dispose=()=>{this.disposed=!0,this.pollGeneration++,clearTimeout(this.timer),this.listeners.clear()}};var M=class{constructor(e){this.call=e}value={checking:!1,starting:!1,check:null,status:null,error:null};listeners=new Set;reading;timer;disposed=!1;checkRevision=0;checkInvalidated=!1;getSnapshot=()=>this.value;patch(e){if(!this.disposed){this.value={...this.value,...e};for(let t of this.listeners)t()}}subscribe=e=>this.disposed?()=>{}:(this.listeners.add(e),this.checkInvalidated?(this.refreshInvalidatedCheck(),this.active()&&this.poll()):!this.value.check&&!this.value.starting?this.refresh():this.active()&&this.poll(),()=>{this.listeners.delete(e),this.listeners.size||(clearTimeout(this.timer),this.timer=void 0)});active(){return this.value.status&&["preparing","installing","unknown","restart-required"].includes(this.value.status.phase)}invalidateCheck=()=>{this.disposed||(this.checkRevision++,this.checkInvalidated=!0,this.value.check&&this.patch({check:{...this.value.check,canInstall:!1,ticket:""}}),this.refreshInvalidatedCheck())};refreshInvalidatedCheck(){!this.disposed&&this.checkInvalidated&&this.listeners.size&&!this.value.starting&&!this.active()&&this.refresh()}refresh=()=>{if(this.disposed||this.value.starting)return Promise.resolve();if(this.reading)return this.reading;let e=this.checkRevision;return this.checkInvalidated=!1,this.patch({checking:!0,error:null}),this.reading=(async()=>{try{let t=await this.call("update-check");if(this.disposed||e!==this.checkRevision)return;if(!t?.advice||!t.status||typeof t.canInstall!="boolean")throw Error("invalid update response");this.patch({check:t,status:t.status}),this.active()&&this.poll()}catch{if(this.disposed||e!==this.checkRevision)return;let t=!1;try{let s=await this.call("status");t=!!(s&&!s.plugin)}catch{}if(this.disposed||e!==this.checkRevision)return;this.patch({check:null,error:t?"当前运行的连接服务尚不支持此更新入口。若刚安装新版，请在任务结束后退出并重新打开 Desktop；无需重新配对。仍不可用时请在原生插件管理器核对安装。":"本次更新检查未完成，不能据此判断已是最新版。请稍后重试；配对和聊天不受此次检查失败影响。"})}finally{this.patch({checking:!1})}})().finally(()=>{this.reading=void 0,this.refreshInvalidatedCheck()}),this.reading};install=async()=>{let e=this.value.check;if(!(this.disposed||this.checkInvalidated||this.value.starting||this.value.checking||!e?.canInstall||!e.ticket)){this.patch({starting:!0,error:null,check:{...e,canInstall:!1,ticket:""}});try{let t=await this.call("update-start",{ticket:e.ticket});this.patch({status:t})}catch(t){this.patch({status:t?.code==="update/not-started"?{phase:"failed",message:t instanceof Error?t.message:"尚未启动更新，请重新检查"}:{phase:"unknown",message:"更新提交结果暂未确认，正在核对；请勿重复安装。"}})}finally{this.patch({starting:!1}),this.poll(),this.refreshInvalidatedCheck()}}};poll(){this.disposed||this.timer||!this.listeners.size||!this.active()||(this.timer=setTimeout(async()=>{try{let e=await this.call("update-status");if(!e||!["idle","preparing","installing","restart-required","complete","failed","unknown"].includes(e.phase))throw Error("invalid status");this.patch({status:e,error:e.phase==="idle"?"尚未发现已接受的更新，请重新检查后再操作。":null})}catch{this.patch({error:"更新状态暂不可用；恢复连接后继续核对，不会重复安装。"})}finally{this.timer=void 0,this.poll(),this.refreshInvalidatedCheck()}},2e3))}dispose(){this.disposed=!0,this.checkRevision++,this.checkInvalidated=!1,clearTimeout(this.timer),this.listeners.clear()}};var G=()=>({loadState:"loading",qrState:"idle",status:null,host:null,runtime:null,localOrigin:null,qr:null,error:null,decisionError:null,deciding:!1}),ae=a=>a?.companionUpdate?.state?["preparing","installing","verifying","recovering"].includes(a.companionUpdate.state):void 0,U=class{constructor(e,t){this.describeHost=e;this.callManagement=t}updates;nativeUpdates;value=G();listeners=new Set;timer;reading;pairing;disposed=!1;identity="";generation=0;getSnapshot=()=>this.value;subscribe=e=>this.disposed?()=>{}:(this.listeners.add(e),this.timer||(this.refresh(),this.timer=setInterval(()=>void this.refresh(),2e3)),()=>{this.listeners.delete(e),this.listeners.size||(clearInterval(this.timer),this.timer=void 0)});patch(e){if(!this.disposed){this.value={...this.value,...e};for(let t of this.listeners)t()}}async client(){let e=await te(this.describeHost,this.callManagement);if(this.disposed)throw new Error("disposed");let t=`${e.host.agentInstanceId??e.host.computerName}/${e.runtime.profileScope??"web"}`;return this.identity&&this.identity!==t&&(this.generation++,this.value=G(),this.updates?.dispose(),this.updates=void 0,this.nativeUpdates?.dispose(),this.nativeUpdates=void 0),this.identity=t,e.runtime.profileScope==="desktop"&&!this.nativeUpdates&&(this.nativeUpdates=new M(this.callManagement)),this.updates?.origin!==e.localOrigin&&(this.updates?.dispose(),this.updates=e.localOrigin?new J(e.localOrigin):void 0),this.patch({host:e.host,runtime:e.runtime,localOrigin:e.localOrigin}),e}refresh=()=>this.disposed?Promise.resolve():this.reading?this.reading:(this.reading=(async()=>{try{let e=await this.client(),t=this.generation,s={...await e.status()};if(s.companionUpdate?.state==="complete"&&!s.plugin&&(s.companionUpdate={state:"unverified",message:"当前连接服务尚未提供运行版本核验，不能确认两端已对齐。若刚安装插件，请在任务结束后退出并重新打开当前应用；无需重新配对。"}),t!==this.generation)return;let r=ae(this.value.status),d=ae(s);d!==void 0&&d!==r&&this.nativeUpdates?.invalidateCheck(),this.patch({status:s,runtime:s.gate??e.runtime,loadState:"ready",error:null,...this.value.qr&&this.value.qr.expiresAt<=Date.now()?{qrState:"expired",qr:null}:{}})}catch{this.patch({loadState:"error",error:"连接服务暂未就绪。请确认 DSH 正在运行，然后重试。"})}})().finally(()=>{this.reading=void 0}),this.reading);generateQr=()=>this.disposed?Promise.resolve():this.pairing?this.pairing:(this.patch({qrState:"loading",qr:null,error:null}),this.pairing=(async()=>{try{let e=await this.client(),t=this.generation,s=await e.pairCode();if(t!==this.generation)return;if(!s?.qrDataUrl?.startsWith("data:image/")||!Number.isFinite(s.expiresAt)||s.expiresAt<=Date.now())throw new Error("invalid QR");this.patch({qr:s,qrState:"ready"}),await this.refresh()}catch{this.patch({qr:null,qrState:"error",error:"暂时无法生成配对二维码，请稍后重试。"})}})().finally(()=>{this.pairing=void 0}),this.pairing);decide=async e=>{let t=this.value.status?.companionUpdate?.offerId;if(!(this.disposed||this.value.deciding||!t)){this.patch({deciding:!0,decisionError:null});try{let s=await this.client();if(this.value.status?.companionUpdate?.offerId!==t)throw new Error("stale offer");await s.decide(t,e),await this.reading,await this.refresh()}catch{this.patch({decisionError:"更新选择未确认，请刷新后核对；不要重复安装。"})}finally{this.patch({deciding:!1})}}};dispose=()=>{this.disposed=!0,this.generation++,clearInterval(this.timer),this.timer=void 0,this.listeners.clear(),this.value=G(),this.updates?.dispose(),this.updates=void 0,this.nativeUpdates?.dispose(),this.nativeUpdates=void 0}},se=new WeakMap;function V(a,e){let t=se.get(a);return t||(t=new U(a,e),se.set(a,t)),t}var I=R(H(),1),C=require("react/jsx-runtime");function O({describeHost:a,callManagement:e,onDismiss:t,onOpenDetails:s,store:r=V(a,e)}){let{status:d,deciding:o,decisionError:p,error:y,loadState:h}=(0,re.useSyncExternalStore)(r.subscribe,r.getSnapshot,r.getSnapshot),u=d?.companionUpdate,f=p||y,b=(0,C.jsxs)("div",{children:[(0,C.jsx)(ee,{value:u,deciding:o||h!=="ready",onDecide:k=>void r.decide(k)}),!u&&!f?(0,C.jsx)("p",{className:I.default.helpText,children:"正在检查联动更新状态；尚未确认的更新不会自动启动。"}):u?.state==="idle"?(0,C.jsx)("p",{className:I.default.helpText,children:"未发现需要联动更新的另一端。当前节点可独立使用，不会自动安装另一端或启用已停用的插件。"}):null,f?(0,C.jsx)("p",{role:"alert",children:f}):null,t?(0,C.jsxs)("div",{className:I.default.actions,children:[s?(0,C.jsx)("button",{type:"button",className:I.default.primaryButton,onClick:s,children:"前往微信连接"}):null,(0,C.jsx)("button",{type:"button",className:I.default.secondaryButton,onClick:t,children:"关闭提示（不会确认更新）"})]}):null]});return t?(0,C.jsx)(ne.Modal,{open:!0,title:"微信连接 · 联动更新",closeLabel:"关闭提示",className:I.default.pageDialog,contentClassName:I.default.pageDialogContent,onClose:t,children:b}):b}var q=require("react"),ie=R(H(),1),S=require("react/jsx-runtime");function oe({wide:a,openPlugin:e}){let[t,s]=(0,q.useState)(!1),[r,d]=(0,q.useState)(!1),o=(0,q.useRef)(!1),p=async()=>{if(!o.current){o.current=!0,d(!0);try{await e()||s(!0)}finally{o.current=!1,d(!1)}}};return(0,S.jsxs)(S.Fragment,{children:[(0,S.jsxs)("button",{type:"button",className:ie.default.sidebarButton,"data-wide":a,title:"微信连接","aria-label":"微信连接",disabled:r,onClick:()=>void p(),children:[(0,S.jsxs)("svg",{width:"20",height:"20",viewBox:"0 0 24 24",fill:"none",stroke:"currentColor",strokeWidth:"1.7","aria-hidden":"true",children:[(0,S.jsx)("path",{d:"M20 11.5a8 8 0 0 1-8 8 9 9 0 0 1-3.5-.7L4 20l1.2-4.2A7.8 7.8 0 0 1 4 11.5a8 8 0 0 1 16 0Z"}),(0,S.jsx)("path",{d:"M8 11.5h.01M12 11.5h.01M16 11.5h.01",strokeWidth:"2.5",strokeLinecap:"round"})]}),a?(0,S.jsx)("span",{children:r?"正在打开…":"微信连接"}):null]}),t?(0,S.jsx)("small",{role:"status",children:"插件详情暂不可用，请打开「设置 → 微信连接」。"}):null]})}async function le(a){try{let e=a("pluginNavigation"),t=a("remote.pluginManager");if(typeof e?.openBundle!="function"||typeof t?.listBundles!="function")return!1;let s=await t.listBundles();if(!s.ok||!Array.isArray(s.value))return!1;let r=s.value.filter(o=>o.enabled&&["dsh-wechat-remote","@harness-remote/dsh-wechat-remote"].includes(o.name));if(r.length!==1)return!1;let d=a("pluginNavigation");return d!==e||typeof d.openBundle!="function"?!1:(d.openBundle(r[0].name),!0)}catch{return!1}}var L=require("react"),me=require("@deepseek-ai/dsh-client-ui-primitives"),v=R(H(),1);var de=require("react"),x=R(H(),1),c=require("react/jsx-runtime");function pe({store:a}){let{check:e,checking:t,progress:s,error:r,copied:d,resumeFailed:o}=(0,de.useSyncExternalStore)(a.subscribe,a.getSnapshot,a.getSnapshot),p=!!(s&&!s.terminal);return(0,c.jsxs)("div",{className:x.default.updateCard,children:[(0,c.jsxs)("div",{className:x.default.pairingHead,children:[(0,c.jsx)("div",{children:(0,c.jsx)("strong",{children:"当前端插件更新"})}),(0,c.jsx)("button",{type:"button",className:x.default.secondaryButton,disabled:t||p,onClick:()=>void a.refresh(),children:t?"检查中…":"检查更新"})]}),e?(0,c.jsxs)(c.Fragment,{children:[e.channel==="preview"?(0,c.jsx)("span",{className:x.default.updateLabel,"data-severity":"recommended",children:"预览通道"}):null,(0,c.jsxs)("div",{className:x.default.updateVersions,children:[(0,c.jsxs)("span",{children:["DSH ",(0,c.jsx)("strong",{children:e.advice.current.agentVersion||"未知"})]}),(0,c.jsxs)("span",{children:["插件 ",(0,c.jsx)("strong",{children:e.advice.current.pluginVersion||"未知"})]})]}),t?null:(0,c.jsxs)(c.Fragment,{children:[(0,c.jsx)("strong",{className:x.default.updateLabel,"data-severity":e.advice.severity,role:"status",children:e.advice.label}),e.advice.targetVersion?(0,c.jsxs)("p",{children:["可更新至 ",e.advice.targetVersion,e.mode==="manual"?" · 需手动更新":""]}):null,e.advice.severity==="unknown"||e.advice.severity==="required"||e.mode==="manual"||e.mode==="busy"?(0,c.jsxs)("details",{children:[(0,c.jsx)("summary",{children:e.mode==="manual"?"手动更新说明":"查看说明"}),e.reason?(0,c.jsx)("p",{children:e.reason}):null,(0,c.jsx)("p",{children:e.advice.message})]}):null,e.mode==="manual"&&e.manualCommand?(0,c.jsxs)("div",{className:x.default.updateCommand,children:[(0,c.jsx)("code",{children:e.manualCommand}),(0,c.jsx)("button",{type:"button",className:x.default.secondaryButton,disabled:p,onClick:()=>void a.copyCommand(),children:d?"已复制":"复制命令"})]}):null,e.canInstall?(0,c.jsxs)(c.Fragment,{children:[(0,c.jsx)("button",{type:"button",className:x.default.primaryButton,disabled:p||!!r,onClick:()=>void a.install(),children:"更新并重启"}),(0,c.jsx)("small",{className:x.default.updateChecked,children:"只更新当前 Web 插件；会短暂断开连接，保留原配对和会话"})]}):null,e.advice.checkedAt&&e.advice.severity!=="unknown"?(0,c.jsxs)("small",{className:x.default.updateChecked,children:["最近检查 ",new Date(e.advice.checkedAt).toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"})]}):null]})]}):null,r?(0,c.jsx)("p",{role:"alert",children:r}):null,s?(0,c.jsxs)("div",{role:"status","aria-live":"polite",children:[!s.terminal||s.ok===!0?(0,c.jsx)("progress",{className:x.default.updateProgress,max:100,value:s.progress}):null,(0,c.jsx)("p",{children:s.message}),o?(0,c.jsx)("p",{role:"alert",children:"插件已完成更新，但未能自动打开 WebUI。请使用 DSH 启动时显示的地址打开，无需重复更新。"}):null]}):null]})}var ce=require("react"),N=R(H(),1),g=require("react/jsx-runtime");function he({store:a}){let{check:e,status:t,checking:s,starting:r,error:d}=(0,ce.useSyncExternalStore)(a.subscribe,a.getSnapshot,a.getSnapshot),o=r||t?.phase==="preparing"||t?.phase==="installing",p=t&&["preparing","installing","restart-required","unknown"].includes(t.phase),y=t?.phase==="restart-required"||t?.phase==="complete",h=t?.phase==="restart-required"?"已安装，待重新打开 Desktop":t?.phase==="unknown"?"更新结果待核对":o?"正在更新 Desktop 插件":t?.phase==="complete"?"更新已生效":"";return(0,g.jsxs)("div",{className:N.default.updateCard,children:[(0,g.jsxs)("div",{className:N.default.pairingHead,children:[(0,g.jsx)("strong",{children:"当前端插件更新 · Desktop"}),(0,g.jsx)("button",{type:"button",className:N.default.secondaryButton,disabled:s||o,onClick:()=>void a.refresh(),children:s?"检查中…":"检查更新"})]}),e?(0,g.jsxs)(g.Fragment,{children:[e.channel==="preview"?(0,g.jsx)("span",{className:N.default.updateLabel,"data-severity":"recommended",children:"预览通道"}):null,(0,g.jsxs)("div",{className:N.default.updateVersions,children:[(0,g.jsxs)("span",{children:["DSH ",(0,g.jsx)("strong",{children:e.advice.current.agentVersion})]}),(0,g.jsxs)("span",{children:["运行中的插件 ",(0,g.jsx)("strong",{children:e.advice.current.pluginVersion})]})]}),(0,g.jsx)("strong",{className:N.default.updateLabel,"data-severity":y?"none":e.advice.severity,children:h||e.advice.label}),y&&t.targetVersion?(0,g.jsxs)("p",{children:["已安装版本 ",t.targetVersion]}):!p&&e.advice.targetVersion?(0,g.jsxs)("p",{children:["可更新至 ",e.advice.targetVersion]}):null,!p&&e.reason?(0,g.jsx)("p",{children:e.reason}):null,!p&&e.canInstall?(0,g.jsxs)(g.Fragment,{children:[(0,g.jsx)("p",{className:N.default.helpText,children:"仅更新当前 Desktop 插件，由原生插件管理器使用应用配置的安装源下载并安装指定版本。配对和会话保留，不更新 Web，不自动退出应用；安装完成后需重新打开 Desktop。"}),(0,g.jsx)("button",{type:"button",className:N.default.primaryButton,disabled:o||s,onClick:()=>void a.install(),children:"更新 Desktop 插件"})]}):null,(0,g.jsxs)("small",{className:N.default.updateChecked,children:["最近检查 ",new Date(e.advice.checkedAt).toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"})]})]}):null,t?.phase!=="idle"&&t?(0,g.jsxs)("div",{role:"status","aria-live":"polite",children:[o?(0,g.jsx)("progress",{className:N.default.updateProgress,"aria-label":"Desktop 插件更新中"}):null,(0,g.jsx)("p",{children:t.message})]}):null,d?(0,g.jsx)("p",{role:"alert",children:d}):null]})}var B=require("react"),m=R(H(),1),i=require("react/jsx-runtime"),j=a=>a.state==="installed"&&(a.nativeState===void 0||a.nativeState==="installed"),He=a=>j(a)?"已安装":a.state==="draft"?"待安装":a.nativeState==="uninstalled"?"未安装":a.nativeState==="disabled"?"已停用":a.state==="pending-restart"?"待重启":"待核对",ue=a=>a.templateId==="designer"||a.id==="designer"?"定制我的助手":a.name;function ge({store:a}){let{catalog:e,preview:t,busy:s,message:r,error:d}=(0,B.useSyncExternalStore)(a.subscribe,a.getSnapshot,a.getSnapshot),[o,p]=(0,B.useState)("");(0,B.useEffect)(()=>{a.load()},[a]);let y=e?.drafts||[],h=y.filter(n=>j(n)&&!n.replacement),u=y.filter(n=>n.state==="draft"),f=y.filter(n=>n.source!=="builtin"&&n.state!=="draft"&&(!j(n)||n.replacement)),b=e?.templates||[],k=n=>h.find(_=>_.templateId===n),A=n=>p(`新建会话时，在模式中选择「${n.name}」，再告诉它你想做什么。已有会话不会自动切换。`),P=n=>{let _=k(n.id),D=n.builtin;return(0,i.jsxs)("article",{className:m.default.assistantChoice,"data-installed":!!_,children:[(0,i.jsxs)("div",{className:m.default.assistantChoiceHead,children:[(0,i.jsx)("strong",{children:ue(n)}),_?(0,i.jsx)("span",{className:m.default.assistantStatus,children:D?"已内置":"已安装"}):D?(0,i.jsx)("span",{children:"待就绪"}):null]}),(0,i.jsx)("p",{children:n.description}),D&&!_?(0,i.jsx)("p",{children:D.reason||"内置助手尚未就绪，请刷新状态。"}):null,(0,i.jsx)("button",{type:"button",className:_?m.default.assistantSecondary:m.default.assistantPrimary,disabled:s,onClick:()=>_?A(_):D?void a.load():void a.choose(n.id),children:_?"怎么开始使用":D?"刷新状态":n.id==="designer"?"安装定制助手":`安装${n.name}`})]},n.id)},E=n=>(0,i.jsxs)("div",{className:m.default.assistantEntry,children:[(0,i.jsxs)("div",{className:m.default.assistantEntryHead,children:[(0,i.jsx)("strong",{children:ue(n)}),(0,i.jsx)("span",{children:He(n)})]}),n.replacement?(0,i.jsxs)("div",{children:[(0,i.jsxs)("p",{children:["已提供内置「",n.replacement.name,"」，无需再装同款独立包。"]}),(0,i.jsx)("p",{children:n.replacement.warning}),n.replacement.canRemoveAfterReview?(0,i.jsxs)("p",{children:["核对旧会话后，可在 DSH 插件列表卸载：",(0,i.jsx)("code",{children:n.replacement.bundleName})]}):null]}):null,j(n)?(0,i.jsx)("button",{type:"button",className:m.default.assistantSecondary,disabled:s,onClick:()=>A(n),children:"怎么开始使用"}):n.state==="draft"?(0,i.jsx)("button",{type:"button",className:m.default.assistantPrimary,disabled:s,onClick:()=>void a.preview(n.id,n.version),children:"查看并安装"}):(0,i.jsxs)(i.Fragment,{children:[(0,i.jsx)("button",{type:"button",className:m.default.assistantSecondary,disabled:s,onClick:()=>void a.verify(n.id,n.version),children:"刷新状态"}),n.nativeState==="uninstalled"&&!n.replacement?(0,i.jsx)("button",{type:"button",className:m.default.assistantSecondary,disabled:s,onClick:()=>void a.reinstall(n.id,n.version),children:"查看并重新安装"}):null]}),!j(n)&&n.reason?(0,i.jsxs)("details",{className:m.default.assistantDetails,children:[(0,i.jsx)("summary",{children:"状态说明"}),(0,i.jsx)("p",{children:n.reason})]}):null]},`${n.id}:${n.version}`);return(0,i.jsxs)("section",{className:m.default.assistantsCard,"aria-label":"工作助手","aria-busy":s,children:[(0,i.jsxs)("div",{className:m.default.assistantsHeading,children:[(0,i.jsxs)("div",{children:[(0,i.jsx)("h3",{children:"工作助手"}),(0,i.jsx)("p",{children:b.some(n=>n.builtin)?"助手已包含在插件里，新建会话时选择即可。":"选一个助手，安装后用对话开始工作。"})]}),(0,i.jsx)("button",{type:"button",className:m.default.assistantTextButton,disabled:s,onClick:()=>void a.load(),children:s?"读取中…":"刷新"})]}),!e&&!d?(0,i.jsx)("p",{role:"status",children:"正在读取当前电脑的助手…"}):null,e&&!e.native?.supported?(0,i.jsx)("p",{role:"status",children:e.native?.reason||"当前 DSH 暂不支持安装助手，请先检查版本。"}):null,e&&(e.native?.supported||b.some(n=>n.builtin))?(0,i.jsxs)(i.Fragment,{children:[(0,i.jsx)("div",{className:m.default.assistantChoices,children:b.filter(n=>["teacher","project"].includes(n.id)).map(P)}),b.some(n=>n.id==="designer")?(0,i.jsxs)("div",{className:m.default.assistantCustomize,children:[(0,i.jsx)("h4",{children:"需要其他职业的助手？"}),(0,i.jsx)("p",{children:"用对话定制工作方式，不需要编程。"}),b.filter(n=>n.id==="designer").map(P)]}):null]}):null,o?(0,i.jsx)("p",{className:m.default.assistantHelp,role:"status",children:o}):null,t?(0,i.jsxs)("div",{className:m.default.assistantPreview,"aria-label":"安装助手预览",children:[(0,i.jsxs)("h4",{children:["安装「",t.definition.name,"」"]}),(0,i.jsx)("p",{children:t.definition.description}),(0,i.jsx)("p",{children:"新增一个可选的助手模式，不改默认模式、已有会话和资料。"}),(0,i.jsxs)("details",{className:m.default.assistantDetails,children:[(0,i.jsx)("summary",{children:"查看工作方式与安装详情"}),(0,i.jsx)("p",{children:t.definition.role}),(0,i.jsx)("ul",{children:t.definition.methods.map((n,_)=>(0,i.jsx)("li",{children:n},_))}),(0,i.jsx)("p",{children:"助手会逐步了解："}),(0,i.jsx)("ul",{children:t.definition.onboarding.map(n=>(0,i.jsxs)("li",{children:[n.label,"：",n.prompt]},n.key))}),(0,i.jsxs)("small",{children:["第 ",t.version," 版 · 内容摘要 ",t.digest.slice(0,12)," · 基础模式 ",t.native.basePreset]}),(0,i.jsx)("ul",{children:(t.native.warnings||[]).map((n,_)=>(0,i.jsx)("li",{children:n},_))})]}),(0,i.jsxs)("div",{className:m.default.assistantButtons,children:[(0,i.jsx)("button",{type:"button",className:m.default.assistantPrimary,disabled:s,onClick:()=>void a.install(),children:"确认安装"}),(0,i.jsx)("button",{type:"button",className:m.default.assistantSecondary,disabled:s,onClick:()=>a.dismissPreview(),children:"暂不安装"})]})]}):null,u.length?(0,i.jsxs)("div",{children:[(0,i.jsx)("h4",{children:"待安装的助手"}),u.map(E)]}):null,h.some(n=>!["teacher","project","designer"].includes(n.templateId))?(0,i.jsxs)("div",{children:[(0,i.jsx)("h4",{children:"我已安装的其他助手"}),h.filter(n=>!["teacher","project","designer"].includes(n.templateId)).map(E)]}):null,f.length||b.some(n=>!["teacher","project","designer"].includes(n.id))?(0,i.jsxs)("details",{className:m.default.assistantDetails,children:[(0,i.jsx)("summary",{children:"更多助手与安装记录"}),e?.native?.supported?(0,i.jsx)("div",{className:m.default.assistantChoices,children:b.filter(n=>!["teacher","project","designer"].includes(n.id)).map(P)}):null,f.length?(0,i.jsxs)("details",{className:m.default.assistantDetails,children:[(0,i.jsxs)("summary",{children:["以前安装的助手（",f.length,"）"]}),(0,i.jsx)("p",{children:"旧会话可能仍在使用旧模式；卸载前请核对，聊天与资料不会在这里删除。"}),f.map(E)]}):null]}):null,r?(0,i.jsx)("p",{role:"status",children:r}):null,d?(0,i.jsx)("p",{role:"alert",children:d}):null]})}var l=require("react/jsx-runtime");function fe({ok:a,busy:e=!1}){return(0,l.jsx)("span",{className:v.default.statusDot,"data-state":e?"busy":a?"ready":"off","aria-hidden":!0})}function $({title:a,detail:e,ok:t,busy:s=!1}){return(0,l.jsxs)("div",{className:v.default.capability,children:[(0,l.jsx)(fe,{ok:t,busy:s}),(0,l.jsxs)("div",{className:v.default.capabilityCopy,children:[(0,l.jsx)("strong",{children:a}),(0,l.jsx)("span",{children:e})]})]})}function X({describeHost:a,callManagement:e,store:t=V(a,e),assistants:s}){let{loadState:r,qrState:d,status:o,runtime:p,host:y,localOrigin:h,qr:u,error:f}=(0,L.useSyncExternalStore)(t.subscribe,t.getSnapshot,t.getSnapshot),{refresh:b,generateQr:k}=t,A=(0,L.useId)(),P=o?.publicRelay,E=P?.state==="enrolling"||P?.state==="connecting",n=P?.remoteAccess?.status,_=P?.state==="online"&&n==="active",D=n==="suspended"?"账户公网访问已暂停":n==="expired"?"公网访问已到期":n==="not_entitled"?"请在小程序中使用自助开通方式":n!=="active"?"配对后由小程序账户决定":_?"可在外网安全连接":E?"正在准备远程连接":"暂时离线",ve=p?.publicDoor??o?.gate?.publicDoor,F=r==="ready"&&!!o?.lan.ip&&ve?.state==="listening",Q=P?.enabled===!0&&P.state!=="disabled",ye=o?.agent?.agentName||y?.agentName||"DeepSeek Harness",be=o?.agent?.hostName||y?.computerName||"当前电脑";return(0,l.jsxs)("section",{className:v.default.root,"aria-labelledby":A,children:[(0,l.jsxs)("div",{className:v.default.hero,children:[(0,l.jsxs)("div",{className:v.default.identity,children:[(0,l.jsx)("span",{className:v.default.mark,"aria-hidden":!0,children:(0,l.jsx)(me.FishLogo,{size:28})}),(0,l.jsxs)("div",{className:v.default.identityCopy,children:[(0,l.jsx)("h3",{id:A,children:"微信连接"}),(0,l.jsxs)("p",{children:[ye,(0,l.jsx)("span",{"aria-hidden":!0,children:" · "}),be]})]})]}),(0,l.jsxs)("span",{className:v.default.overall,"data-ready":r==="ready",children:[(0,l.jsx)(fe,{ok:r==="ready",busy:r==="loading"}),r==="loading"?"检测中":r==="ready"?"服务正常":"暂不可用"]})]}),p?.profileScope==="desktop"&&o&&(!o.plugin||o.plugin.runningVersion!==o.plugin.installedVersion)?(0,l.jsxs)("aside",{className:v.default.companionCard,"data-state":"self-restart-required",role:"status",children:[(0,l.jsx)("strong",{children:o.plugin?"新版插件尚未生效，请完整重启 Desktop":"刚升级插件？请先完整重启 Desktop"}),o.plugin?(0,l.jsxs)("p",{children:["正在运行 ",o.plugin.runningVersion,"；已安装 ",o.plugin.installedVersion,"。"]}):(0,l.jsx)("p",{children:"当前连接服务尚不能核验运行版本，不能把安装完成当作新版已生效。"}),(0,l.jsx)("p",{children:"等当前任务结束后，选择顶部「应用 → 退出」，再重新打开 Desktop。仅关闭窗口、刷新页面或开关插件不能保证新版生效。"}),(0,l.jsx)("small",{children:"不必重装或重新配对。此操作不会升级或重启 Web。"})]}):null,(0,l.jsxs)("div",{className:v.default.capabilities,children:[(0,l.jsx)($,{title:"局域网直连",detail:r==="loading"?"检测中":F?"已就绪":"暂不可用",ok:F,busy:r==="loading"}),(0,l.jsx)($,{title:"远程访问",detail:D,ok:_,busy:E||r==="loading"}),(0,l.jsx)($,{title:"账号连接保护",detail:Q?"已启用":"配对后启用",ok:Q,busy:r==="loading"})]}),f!==null?(0,l.jsxs)("div",{className:v.default.notice,role:"status",children:[(0,l.jsx)("span",{children:f}),(0,l.jsx)("button",{type:"button",onClick:()=>void b(),children:"重试"})]}):null,d==="idle"?(0,l.jsxs)("div",{className:v.default.connectCard,children:[(0,l.jsxs)("div",{children:[(0,l.jsx)("strong",{children:"添加到微信"}),(0,l.jsx)("p",{children:"打开「Agent远程管理助手」→ 添加节点，扫描配对二维码。"})]}),(0,l.jsx)("button",{type:"button",className:v.default.primaryButton,disabled:r!=="ready",onClick:()=>void k(),children:"生成二维码"})]}):(0,l.jsxs)("div",{className:v.default.pairingCard,children:[(0,l.jsxs)("div",{className:v.default.pairingHead,children:[(0,l.jsxs)("div",{children:[(0,l.jsx)("strong",{children:"扫描二维码"}),(0,l.jsx)("p",{children:"小程序「设置 → 添加节点」"})]}),(0,l.jsx)("button",{type:"button",className:v.default.secondaryButton,disabled:d==="loading"||r!=="ready",onClick:()=>void k(),children:d==="loading"?"生成中…":"重新生成"})]}),(0,l.jsxs)("div",{className:v.default.qrArea,children:[r==="ready"&&d==="ready"&&u!==null?(0,l.jsx)("img",{className:v.default.qr,src:u.qrDataUrl,alt:"Agent远程管理助手配对二维码"}):(0,l.jsx)("div",{className:v.default.qrPlaceholder,"aria-live":"polite",children:r!=="ready"?"连接恢复后可查看二维码":d==="expired"?"二维码已过期，请重新生成":d==="error"?"生成失败":"正在生成…"}),d==="ready"&&u!==null?(0,l.jsxs)("small",{className:v.default.qrValidity,children:["有效至 ",new Date(u.expiresAt).toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"})," · 切换页面不重新生成"]}):null]}),(0,l.jsx)("p",{className:v.default.securityNote,children:u?.mode==="public-relay"?"配对后自动选择更快的连接；远程内容端到端加密。":"当前可通过同一局域网连接。"})]}),h&&t.updates?(0,l.jsx)(pe,{store:t.updates}):null,p?.profileScope==="desktop"&&t.nativeUpdates?(0,l.jsx)(he,{store:t.nativeUpdates}):null,(0,l.jsxs)("div",{className:v.default.linkedSection,children:[(0,l.jsx)("h4",{children:"另一端插件"}),(0,l.jsx)(O,{describeHost:a,callManagement:e,store:t})]}),(0,l.jsx)("p",{className:v.default.securityNote,children:"设置和插件详情共用当前节点的配对与更新状态；Web 与 Desktop 各自独立。"}),s?(0,l.jsx)(ge,{store:s}):null]})}var W=class{constructor(e){this.call=e}state={catalog:null,preview:null,busy:!1,message:"",error:""};listeners=new Set;epoch=0;disposed=!1;getSnapshot=()=>this.state;subscribe=e=>(this.listeners.add(e),()=>{this.listeners.delete(e)});set(e){if(!this.disposed){this.state={...this.state,...e};for(let t of this.listeners)t()}}reset=()=>{this.epoch++,this.set({catalog:null,preview:null,busy:!1,message:"",error:""})};dispose=()=>{this.reset(),this.disposed=!0,this.listeners.clear()};async run(e){if(this.disposed||this.state.busy)return;let t=this.epoch,s=()=>!this.disposed&&t===this.epoch;this.set({busy:!0,error:""});try{await e(s)}catch(r){s()&&this.set({error:r instanceof Error?r.message:"操作未完成，请核对状态"})}finally{s()&&this.set({busy:!1})}}async read(e){e()&&this.set({catalog:null});try{let t=await this.call("assistantCatalog",{});if(!e())return;if(t?.schema!=="human.assistants.catalog.v1"||!Array.isArray(t.templates)||!Array.isArray(t.drafts))throw new Error("助手目录格式不受支持");this.set({catalog:t})}catch(t){throw e()&&this.set({message:""}),t}}load=()=>this.run(e=>this.read(e));dismissPreview=()=>{this.state.busy||this.set({preview:null,message:""})};choose=e=>this.run(async t=>{if(this.set({preview:null,message:""}),this.state.catalog?.templates?.find(p=>p.id===e)?.builtin){await this.read(t),t()&&this.set({message:"此助手已包含在插件里，请在新会话中选择；无需另装独立包。"});return}let r=this.state.catalog?.drafts?.find(p=>p.templateId===e&&p.state==="draft");if(r){let p=await this.call("assistantPreview",{id:r.id,version:r.version});t()&&this.set({preview:p});return}let d=await this.call("assistantDraft",{templateId:e});if(!t()||(await this.read(t),!t()))return;let o=await this.call("assistantPreview",{id:d.id,version:d.version});t()&&this.set({preview:o})});preview=(e,t)=>this.run(async s=>{this.set({preview:null});let r=await this.call("assistantPreview",{id:e,version:t});s()&&this.set({preview:r})});reinstall=(e,t)=>this.run(async s=>{if(this.set({preview:null,message:""}),this.state.catalog?.drafts?.some(o=>o.id===e&&o.version===t&&o.replacement)){await this.read(s),s()&&this.set({message:"这个旧模式已有内置版本，请在新会话中选择对应助手，无需重新安装旧包。"});return}let r=await this.call("assistantDraft",{sourceId:e,sourceVersion:t});if(!s()||(await this.read(s),!s()))return;let d=await this.call("assistantPreview",{id:r.id,version:r.version});s()&&this.set({preview:d})});install=()=>this.run(async e=>{let t=this.state.preview;if(!t||t.expiresAt<=Date.now())throw new Error("请重新预览后确认安装");this.set({preview:null,message:"已提交原生安装，请等待结果。"});try{let s=await this.call("assistantInstall",{id:t.id,version:t.version,digest:t.digest,previewId:t.previewId});e()&&this.set({message:s.message||(s.state==="installed"?"原生预设已生效":"请核对原生安装状态")})}finally{e()&&await this.read(e)}});verify=(e,t)=>this.run(async s=>{this.set({catalog:null,message:""});let r=await this.call("assistantStatus",{id:e,version:t});s()&&(this.set({message:r.message||"状态已核对"}),await this.read(s))})};var Ie=["slots","connection"];function Re(a){let e=async(h,u)=>{let f=await a.connection.rpc.call("/wechat-remote-management",h,u??{});if(!f.ok)throw Object.assign(new Error(f.error.message),{code:f.error.code});return f.value},t=async()=>{let h=await a.connection.rpc.call("/api","wechatHost/describe",{args:{request:{}}});if(!h.ok)throw new Error(`wechatHost/describe: ${h.error.code}`);let u=h.value;if(u?.ok!==!0||u.value===void 0)throw new Error("wechatHost/describe returned an invalid result");return u.value},s=new U(t,e),r=0,d=async(h,u)=>{let f=r,b=await a.connection.rpc.call("/api",`humanTools/${h}`,{args:{request:u}});if(f!==r)throw new Error("电脑连接已变化，请重新查看助手目录");if(!b.ok)throw new Error(b.error.message);let k=b.value;if(!k?.ok||typeof k.valueJson!="string"||k.valueJson.length>256*1024)throw new Error(k?.error?.message||"此节点尚未提供助手能力");return JSON.parse(k.valueJson)},o=new W(d);a.effect(()=>{let h=a.on("connection/reset",()=>{r++,o.reset()});return()=>{r++,h(),o.dispose()}},"wechat assistant lifecycle"),a.effect(()=>()=>s.dispose(),"wechat shared page");let p=()=>le(h=>a.get(h)),y=()=>({describeHost:t,callManagement:e,store:s,assistants:o});a.slots.inject("settings.section",()=>a.slots.register({name:"settings.section",id:"harness-remote",order:30,label:"微信连接",inject:y},X));for(let h of["plugins.bundle.activation","plugins.bundle.config"])a.slots.inject(h,()=>{let u=["dsh-wechat-remote","@harness-remote/dsh-wechat-remote"].map(f=>a.slots.register({name:h,key:f,inject:y},h==="plugins.bundle.activation"?O:X));return()=>u.forEach(f=>f())});a.inject(["pluginNavigation","remote.pluginManager"],()=>a.slots.inject("sidebar.footer.action",()=>a.slots.register({name:"sidebar.footer.action",id:"harness-remote",order:30,label:"微信连接",inject:()=>({openPlugin:p})},oe)))}

return module.exports;}});
