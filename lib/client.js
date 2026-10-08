window.__ModuleLoader__.load({id:"@harness-remote/dsh-wechat-remote",factory:(require)=>{var module={exports:{}};var exports=module.exports;"use strict";var et=Object.create;var he=Object.defineProperty;var tt=Object.getOwnPropertyDescriptor;var at=Object.getOwnPropertyNames;var rt=Object.getPrototypeOf,st=Object.prototype.hasOwnProperty;var nt=(r,t)=>()=>(t||r((t={exports:{}}).exports,t),t.exports),it=(r,t)=>{for(var e in t)he(r,e,{get:t[e],enumerable:!0})},Ne=(r,t,e,a)=>{if(t&&typeof t=="object"||typeof t=="function")for(let n of at(t))!st.call(r,n)&&n!==e&&he(r,n,{get:()=>t[n],enumerable:!(a=tt(t,n))||a.enumerable});return r};var K=(r,t,e)=>(e=r!=null?et(rt(r)):{},Ne(t||!r||!r.__esModule?he(e,"default",{value:r,enumerable:!0}):e,r)),ot=r=>Ne(he({},"__esModule",{value:!0}),r);var Q=nt((mt,Ae)=>{"use strict";var lt=`.hr_ead46c4_root {\r
  box-sizing: border-box;\r
  width: 100%;\r
  max-width: 760px;\r
  color: var(--dsw-alias-label-primary, #171a20);\r
  display: flex;\r
  flex-direction: column;\r
  gap: 14px;\r
}\r
\r
.hr_ead46c4_hero,\r
.hr_ead46c4_connectCard,\r
.hr_ead46c4_pairingCard {\r
  border: 1px solid var(--dsw-alias-border-l2, rgba(128, 140, 160, 0.22));\r
  background: var(--dsw-alias-bg-layer-3, #fff);\r
  border-radius: 12px;\r
}\r
\r
.hr_ead46c4_hero {\r
  min-height: 72px;\r
  display: flex;\r
  align-items: center;\r
  justify-content: space-between;\r
  gap: 20px;\r
  padding: 16px 18px;\r
}\r
\r
.hr_ead46c4_identity {\r
  min-width: 0;\r
  display: flex;\r
  align-items: center;\r
  gap: 12px;\r
}\r
\r
.hr_ead46c4_mark {\r
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
.hr_ead46c4_identityCopy {\r
  min-width: 0;\r
}\r
\r
.hr_ead46c4_identityCopy h3,\r
.hr_ead46c4_identityCopy p,\r
.hr_ead46c4_connectCard p,\r
.hr_ead46c4_pairingHead p,\r
.hr_ead46c4_securityNote {\r
  margin: 0;\r
}\r
\r
.hr_ead46c4_sidebarButton { display: flex; align-items: center; gap: 10px; width: 100%; min-height: 38px; padding: 8px 12px; border: 0; border-radius: 8px; background: transparent; color: var(--dsw-alias-label-secondary, #4d5564); font: inherit; font-size: 14px; cursor: pointer; text-align: left; }\r
.hr_ead46c4_sidebarButton:hover { background: var(--dsw-alias-bg-layer-2, #eef1f5); color: var(--dsw-alias-label-primary, #171a20); }\r
.hr_ead46c4_sidebarButton[data-wide='false'] { width: 36px; min-height: 36px; padding: 8px; justify-content: center; }\r
.hr_ead46c4_sidebarButton svg { flex: none; }\r
.hr_ead46c4_sidebarButton:focus-visible { outline: 2px solid var(--dsw-alias-state-business-primary, #4e79ff); outline-offset: 2px; }\r
.hr_ead46c4_actions { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 16px; }\r
.hr_ead46c4_pageDialog.hr_ead46c4_pageDialog { width: min(820px, 100%); max-height: 100%; }\r
.hr_ead46c4_pageDialogContent.hr_ead46c4_pageDialogContent { min-height: 0; overflow-y: auto; }\r
.hr_ead46c4_helpText { color: var(--dsw-alias-label-secondary, #647084); font-size: 12px; line-height: 1.7; margin: 8px 0; }\r
\r
.hr_ead46c4_companionCard {\r
  border: 1px solid var(--dsw-alias-state-business-primary, #4e79ff);\r
  border-left-width: 4px;\r
  border-radius: 10px;\r
  background: var(--dsw-alias-bg-layer-3, #fff);\r
  padding: 14px 16px;\r
  line-height: 1.6;\r
  overflow-wrap: anywhere;\r
}\r
.hr_ead46c4_companionCard strong { font-size: 14px; }\r
.hr_ead46c4_companionCard p { margin: 4px 0; font-size: 13px; }\r
.hr_ead46c4_companionCard small { color: var(--dsw-alias-label-secondary, #4d5564); }\r
.hr_ead46c4_companionCard progress { display: block; width: 100%; margin: 8px 0; accent-color: #4e79ff; }\r
.hr_ead46c4_companionCard[data-state='complete'] { border-color: var(--dsw-alias-state-success-primary, #1f9d68); }\r
.hr_ead46c4_companionCard[data-state='unavailable'], .hr_ead46c4_companionCard[data-state='recovering'] { border-color: #b5861d; }

/* Assistant modes are a compact owner-facing catalog, not an installation log. */
.hr_ead46c4_assistantsCard { padding: 14px 18px; border: 1px solid var(--dsw-alias-border-l2, #e2e6ee); border-radius: 12px; background: var(--dsw-alias-bg-layer-3, #fff); line-height: 1.5; overflow-wrap: anywhere; }
.hr_ead46c4_assistantsCard h3, .hr_ead46c4_assistantsCard h4, .hr_ead46c4_assistantsCard p { margin: 0; }
.hr_ead46c4_assistantsCard h3 { font-size: 14px; }
.hr_ead46c4_assistantsCard h4 { font-size: 14px; margin: 16px 0 6px; }
.hr_ead46c4_assistantsCard p { color: var(--dsw-alias-label-secondary, #647084); font-size: 12px; }
.hr_ead46c4_assistantsHeading { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 4px; }
.hr_ead46c4_assistantsHeading p { margin-top: 4px; }
.hr_ead46c4_assistantChoices { display: flex; flex-direction: column; }
.hr_ead46c4_assistantChoice { padding: 10px 0; display: flex; align-items: center; gap: 12px; }
.hr_ead46c4_assistantChoiceCopy { flex: 1; min-width: 0; }
.hr_ead46c4_assistantChoiceHead, .hr_ead46c4_assistantEntryHead { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 8px; }
.hr_ead46c4_assistantChoiceHead { justify-content: flex-start; gap: 6px; }
.hr_ead46c4_assistantChoiceHead strong { font-size: 13px; }
.hr_ead46c4_assistantChoice p { flex: 1; }
.hr_ead46c4_assistantStatus { color: var(--dsw-alias-state-success-primary, #17845b); font-size: 12px; }
.hr_ead46c4_assistantPrimary, .hr_ead46c4_assistantSecondary, .hr_ead46c4_assistantTextButton { min-height: 42px; padding: 9px 16px; border-radius: 9px; font: inherit; font-size: 13px; cursor: pointer; }
.hr_ead46c4_assistantPrimary { color: #fff; background: var(--dsw-alias-state-business-primary, #4e79ff); border: 1px solid transparent; }
.hr_ead46c4_assistantSecondary { color: var(--dsw-alias-state-business-primary, #4e79ff); background: var(--dsw-alias-bg-layer-3, #fff); border: 1px solid var(--dsw-alias-border-l2, #d7deed); }
.hr_ead46c4_assistantTextButton { min-height: 32px; padding: 3px 8px; border: 0; background: transparent; color: var(--dsw-alias-state-business-primary, #4e79ff); }
.hr_ead46c4_assistantPrimary:disabled, .hr_ead46c4_assistantSecondary:disabled, .hr_ead46c4_assistantTextButton:disabled { opacity: .5; cursor: default; }
.hr_ead46c4_assistantPrimary:focus-visible, .hr_ead46c4_assistantSecondary:focus-visible, .hr_ead46c4_assistantTextButton:focus-visible, .hr_ead46c4_assistantDetails summary:focus-visible { outline: 2px solid var(--dsw-alias-state-business-primary, #4e79ff); outline-offset: 3px; }
.hr_ead46c4_assistantCustomize { margin-top: 2px; border-top: 1px solid var(--dsw-alias-border-l2, #e2e6ee); }
.hr_ead46c4_assistantCustomize > p { margin-bottom: 10px; }
.hr_ead46c4_assistantCustomize .hr_ead46c4_assistantChoice { background: transparent; }
.hr_ead46c4_assistantDetails { margin-top: 14px; color: var(--dsw-alias-label-secondary, #647084); font-size: 12px; }
.hr_ead46c4_assistantDetails summary { padding: 5px 0; cursor: pointer; }
.hr_ead46c4_assistantDetails ul { margin: 8px 0; padding-left: 20px; }
.hr_ead46c4_assistantDetails li { margin: 5px 0; }
.hr_ead46c4_assistantPreview { padding: 14px; margin-top: 16px !important; border-radius: 10px; background: var(--dsw-alias-bg-layer-1, #f0f4ff); }
.hr_ead46c4_assistantUnavailable { color: var(--dsw-alias-label-secondary, #647084); font-size: 12px; }
.hr_ead46c4_assistantHelpAnchor { display: inline-flex; position: relative; }
.hr_ead46c4_assistantHelpButton { padding: 0; width: 17px; height: 17px; border-radius: 50%; border: 1px solid var(--dsw-alias-border-l2, #bec6d2); background: transparent; color: var(--dsw-alias-label-tertiary, #8490a2); font: inherit; font-size: 11px; cursor: help; }
.hr_ead46c4_assistantTooltip { visibility: hidden; opacity: 0; position: absolute; z-index: 2; top: 24px; left: 0; width: min(300px, 55vw); padding: 10px 12px; border-radius: 8px; border: 1px solid var(--dsw-alias-border-l2, #d7deed); background: var(--dsw-alias-bg-layer-3, #fff); color: var(--dsw-alias-label-secondary, #647084); box-shadow: 0 4px 16px #0002; font-size: 12px; font-weight: normal; }
.hr_ead46c4_assistantHelpAnchor:hover .hr_ead46c4_assistantTooltip, .hr_ead46c4_assistantHelpAnchor:focus-within .hr_ead46c4_assistantTooltip { visibility: visible; opacity: 1; }
.hr_ead46c4_assistantPreview h4 { margin-top: 0; }
.hr_ead46c4_assistantPreview p + p { margin-top: 8px; }
.hr_ead46c4_assistantButtons { display: flex; gap: 10px; flex-wrap: wrap; margin-top: 14px; }
.hr_ead46c4_assistantEntry { margin-top: 10px; padding: 12px 0; border-top: 1px solid var(--dsw-alias-border-l2, #e2e6ee); }
.hr_ead46c4_assistantEntryHead { margin-bottom: 8px; font-size: 13px; }
.hr_ead46c4_assistantEntryHead > span { color: var(--dsw-alias-label-secondary, #647084); font-size: 12px; }
.hr_ead46c4_assistantEntry > button + button { margin-left: 8px; }
@media (max-width: 520px) { .hr_ead46c4_assistantsCard { padding: 12px; } .hr_ead46c4_assistantChoice { gap: 8px; } }
\r
.hr_ead46c4_identityCopy h3 {\r
  font-size: 15px;\r
  font-weight: 650;\r
  line-height: 22px;\r
}\r
\r
.hr_ead46c4_identityCopy p {\r
  color: var(--dsw-alias-label-tertiary, #7d8492);\r
  font-size: 12px;\r
  line-height: 18px;\r
  overflow: hidden;\r
  text-overflow: ellipsis;\r
  white-space: nowrap;\r
}\r
\r
.hr_ead46c4_overall {\r
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
.hr_ead46c4_overall[data-ready='true'] {\r
  color: var(--dsw-alias-state-success-primary, #1f9d68);\r
}\r
\r
.hr_ead46c4_statusDot {\r
  width: 7px;\r
  height: 7px;\r
  background: var(--dsw-alias-label-tertiary, #8b93a2);\r
  border-radius: 999px;\r
  flex: none;\r
}\r
\r
.hr_ead46c4_statusDot[data-state='ready'] {\r
  background: var(--dsw-alias-state-success-primary, #1f9d68);\r
}\r
\r
.hr_ead46c4_statusDot[data-state='busy'] {\r
  background: var(--dsw-alias-state-business-primary, #4e79ff);\r
  animation: harnessRemotePulse 1.2s ease-in-out infinite;\r
}\r
\r
.hr_ead46c4_capabilities {\r
  grid-template-columns: repeat(3, minmax(0, 1fr));\r
  gap: 10px;\r
  display: grid;\r
}\r
\r
.hr_ead46c4_capability {\r
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
.hr_ead46c4_capability > .hr_ead46c4_statusDot {\r
  margin-top: 6px;\r
}\r
\r
.hr_ead46c4_capabilityCopy {\r
  min-width: 0;\r
  display: flex;\r
  flex-direction: column;\r
  gap: 1px;\r
}\r
\r
.hr_ead46c4_capabilityCopy strong {\r
  font-size: 12.5px;\r
  font-weight: 600;\r
  line-height: 19px;\r
}\r
\r
.hr_ead46c4_capabilityCopy span {\r
  color: var(--dsw-alias-label-tertiary, #7d8492);\r
  font-size: 11px;\r
  line-height: 17px;\r
  overflow: hidden;\r
  text-overflow: ellipsis;\r
  white-space: nowrap;\r
}\r
\r
.hr_ead46c4_notice {\r
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
.hr_ead46c4_notice button,\r
.hr_ead46c4_secondaryButton {\r
  border: 1px solid var(--dsw-alias-border-l2, rgba(128, 140, 160, 0.28));\r
  color: var(--dsw-alias-label-primary, #171a20);\r
  background: var(--dsw-alias-bg-layer-1, #f5f6f8);\r
  border-radius: 7px;\r
  font: inherit;\r
  cursor: pointer;\r
}\r
\r
.hr_ead46c4_notice button {\r
  flex: none;\r
  padding: 3px 9px;\r
}\r
\r
.hr_ead46c4_connectCard {\r
  display: flex;\r
  align-items: center;\r
  justify-content: space-between;\r
  gap: 20px;\r
  padding: 18px;\r
}\r
\r
.hr_ead46c4_connectCard strong,\r
.hr_ead46c4_pairingHead strong {\r
  font-size: 14px;\r
  font-weight: 650;\r
  line-height: 21px;\r
}\r
\r
.hr_ead46c4_connectCard p,\r
.hr_ead46c4_pairingHead p {\r
  max-width: 470px;\r
  color: var(--dsw-alias-label-tertiary, #7d8492);\r
  font-size: 12px;\r
  line-height: 18px;\r
}\r
\r
.hr_ead46c4_primaryButton {\r
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
.hr_ead46c4_primaryButton:hover {\r
  filter: brightness(1.04);\r
}\r
\r
.hr_ead46c4_primaryButton:focus-visible,\r
.hr_ead46c4_secondaryButton:focus-visible,\r
.hr_ead46c4_notice button:focus-visible {\r
  outline: 2px solid var(--dsw-alias-state-business-primary, #4e79ff);\r
  outline-offset: 2px;\r
}\r
\r
.hr_ead46c4_pairingCard {\r
  padding: 18px;\r
}\r
\r
.hr_ead46c4_pairingHead {\r
  display: flex;\r
  align-items: center;\r
  justify-content: space-between;\r
  gap: 16px;\r
}\r
\r
.hr_ead46c4_secondaryButton {\r
  min-height: 32px;\r
  flex: none;\r
  padding: 0 11px;\r
  font-size: 12px;\r
}\r
\r
.hr_ead46c4_secondaryButton:disabled,\r
.hr_ead46c4_primaryButton:disabled {\r
  cursor: default;\r
  opacity: 0.55;\r
}\r
\r
.hr_ead46c4_qrArea {\r
  min-height: 292px;\r
  margin-top: 16px;\r
  display: flex;\r
  flex-direction: column;\r
  align-items: center;\r
  justify-content: center;\r
  gap: 10px;\r
}\r
\r
.hr_ead46c4_qr,\r
.hr_ead46c4_qrPlaceholder {\r
  box-sizing: border-box;\r
  width: 280px;\r
  height: 280px;\r
  border-radius: 12px;\r
}\r
\r
.hr_ead46c4_qr {\r
  background: #fff;\r
  padding: 10px;\r
  image-rendering: pixelated;\r
}\r
\r
.hr_ead46c4_qrPlaceholder {\r
  color: var(--dsw-alias-label-tertiary, #7d8492);\r
  background: var(--dsw-alias-bg-layer-1, #f5f6f8);\r
  border: 1px dashed var(--dsw-alias-border-l2, rgba(128, 140, 160, 0.28));\r
  display: grid;\r
  place-items: center;\r
  font-size: 12px;\r
}\r
\r
.hr_ead46c4_qrValidity {\r
  color: var(--dsw-alias-label-tertiary, #7d8492);\r
  font-size: 11px;\r
  line-height: 17px;\r
}\r
\r
.hr_ead46c4_securityNote {\r
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
  .hr_ead46c4_statusDot[data-state='busy'] {\r
    animation: none;\r
  }\r
}\r
\r
@media (max-width: 680px) {\r
  .hr_ead46c4_capabilities {\r
    grid-template-columns: minmax(0, 1fr);\r
  }\r
\r
  .hr_ead46c4_connectCard {\r
    align-items: stretch;\r
    flex-direction: column;\r
  }\r
\r
  .hr_ead46c4_primaryButton {\r
    width: 100%;\r
  }\r
\r
  .hr_ead46c4_qrArea {\r
    flex-direction: column;\r
    gap: 12px;\r
  }\r
\r
}\r
.hr_ead46c4_updateCard { border: 1px solid var(--dsw-alias-border-l2, #ddd); background: var(--dsw-alias-bg-layer-3, #fff); border-radius: 12px; padding: 14px 18px; line-height: 1.5; font-size: 13px; overflow-wrap: anywhere; }
.hr_ead46c4_updateHeading { font-size: 14px; line-height: 21px; margin: 0 0 8px; }
.hr_ead46c4_updateRow { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 8px 16px; }
.hr_ead46c4_updateCopy { flex: 1 1 240px; min-width: 0; }
.hr_ead46c4_updateControl { display: flex; flex-direction: column; align-items: flex-end; gap: 2px; max-width: 100%; }
.hr_ead46c4_updateControl .hr_ead46c4_updateLabel { font-size: 12px; font-weight: 500; }
.hr_ead46c4_updateControl .hr_ead46c4_updateChecked { margin-top: 0; }
.hr_ead46c4_updateRow > .hr_ead46c4_updateActions { margin-top: 0; }
.hr_ead46c4_updateEndpoint p, .hr_ead46c4_companionInline p { margin: 4px 0; }
.hr_ead46c4_updateScope { color: var(--dsw-alias-label-tertiary, #7d8492); font-size: 12px; font-weight: 400; }
.hr_ead46c4_updateEndpoint + div { margin-top: 10px; padding-top: 10px; border-top: 1px solid var(--dsw-alias-border-l2, #ddd); }
.hr_ead46c4_updateActions { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; margin-top: 8px; }
.hr_ead46c4_updateActions .hr_ead46c4_primaryButton { width: auto; min-height: 32px; padding: 0 12px; }
.hr_ead46c4_updateActions .hr_ead46c4_secondaryButton { min-height: 32px; }
.hr_ead46c4_updatePeerNote { margin: 0; color: var(--dsw-alias-label-tertiary, #7d8492); font-size: 12px; }
.hr_ead46c4_updateDetails { color: var(--dsw-alias-label-secondary, #647084); font-size: 12px; }
.hr_ead46c4_updateDetails summary { cursor: pointer; margin-top: 4px; }
.hr_ead46c4_companionInline strong { font-size: 13px; font-weight: 500; }
.hr_ead46c4_companionInline small { display: block; color: var(--dsw-alias-label-secondary, #647084); font-size: 12px; margin-top: 4px; }
.hr_ead46c4_companionInline progress { display: block; width: 100%; height: 8px; margin: 8px 0; accent-color: var(--dsw-alias-state-business-primary, #4e79ff); }
.hr_ead46c4_companionInline[data-state='complete'] .hr_ead46c4_updateCopy > strong { color: var(--dsw-alias-state-success-primary, #1f9d68); }
.hr_ead46c4_companionInline[data-state='unavailable'] .hr_ead46c4_updateCopy > strong, .hr_ead46c4_companionInline[data-state='recovering'] .hr_ead46c4_updateCopy > strong { color: #b5861d; }
.hr_ead46c4_updateLabel { color: inherit; }\r
.hr_ead46c4_updateLabel[data-severity="none"] { color: #218b5c; }\r
.hr_ead46c4_updateLabel[data-severity="unknown"] { color: var(--text-secondary, #858b96); }\r
.hr_ead46c4_updateLabel[data-severity="required"] { color: #d54052; }\r
.hr_ead46c4_updateLabel[data-severity="recommended"], .hr_ead46c4_updateLabel[data-severity="info"] { color: #b5861d; }\r
.hr_ead46c4_updateProgress { width: 100%; height: 8px; margin-top: 8px; accent-color: #7487ef; }
.hr_ead46c4_updateVersions { display: flex; flex-wrap: wrap; gap: 4px 16px; margin: 6px 0; }
.hr_ead46c4_updateVersions span { color: var(--text-secondary, #858b96); }\r
.hr_ead46c4_updateVersions strong { color: var(--text-primary, inherit); font-weight: 500; }\r
.hr_ead46c4_updateCommand { display: flex; flex-wrap: wrap; align-items: center; gap: 12px; margin-top: 12px; }\r
.hr_ead46c4_updateCommand code { flex: 1 1 240px; white-space: pre-wrap; overflow-wrap: anywhere; user-select: text; }\r
.hr_ead46c4_updateChecked { display: block; margin-top: 4px; color: var(--text-secondary, #858b96); font-size: 11px; }
.hr_ead46c4_clawbotCard { color: var(--dsw-alias-label-primary, #171a20); }
.hr_ead46c4_clawbotHead, .hr_ead46c4_clawbotRow, .hr_ead46c4_clawbotReceiveRow { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.hr_ead46c4_clawbotHead h3 { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; margin: 0; }
.hr_ead46c4_clawbotHead small { font-size: 11px; font-weight: normal; color: var(--dsw-alias-label-tertiary, #7d8492); }
.hr_ead46c4_clawbotRow { margin: 10px 0; flex-wrap: wrap; }
.hr_ead46c4_clawbotNode { margin: 8px 0 0; font-size: 12px; overflow-wrap: anywhere; color: var(--dsw-alias-label-secondary, #647084); }
.hr_ead46c4_clawbotSection { margin-top: 18px; }
.hr_ead46c4_clawbotSection + .hr_ead46c4_clawbotSection { border-top: 1px solid var(--dsw-alias-border-l2, #ddd); padding-top: 8px; }
.hr_ead46c4_clawbotStatus { display: inline-flex; align-items: center; gap: 6px; font-size: 12px; color: var(--dsw-alias-label-secondary, #647084); }
.hr_ead46c4_clawbotStatus::before { content: ''; width: 6px; height: 6px; border-radius: 50%; background: currentColor; }
.hr_ead46c4_clawbotStatus[data-state='paired'] { color: var(--dsw-alias-state-success-primary, #218b5c); }
.hr_ead46c4_clawbotStatus[data-state='pending'] { color: var(--dsw-alias-state-business-primary, #4e79ff); }
.hr_ead46c4_clawbotStatus[data-state='expired'] { color: var(--dsw-alias-state-warning-primary, #a97513); }
.hr_ead46c4_clawbotPairingEntry { display: flex; align-items: center; flex-wrap: wrap; justify-content: space-between; gap: 8px 16px; }
.hr_ead46c4_clawbotRow select { box-sizing: border-box; flex: 1 1 180px; min-width: 0; max-width: 100%; min-height: 36px; border: 1px solid var(--dsw-alias-border-l2, #ddd); border-radius: 8px; padding: 7px 9px; color: inherit; background: var(--dsw-alias-bg-layer-3, #fff); font: inherit; }
.hr_ead46c4_clawbotReceiveRow { margin-top: 16px; }
.hr_ead46c4_clawbotReceiveRow .hr_ead46c4_clawbotNote { margin: 3px 0 0; }
.hr_ead46c4_clawbotToggle { display: inline-flex; position: relative; flex: 0 0 42px; width: 42px; height: 26px; align-items: center; cursor: pointer; }
.hr_ead46c4_clawbotToggle input { position: absolute; inset: 0; width: 100%; height: 100%; opacity: 0; margin: 0; z-index: 1; cursor: pointer; }
.hr_ead46c4_clawbotSwitchTrack { width: 42px; height: 24px; border-radius: 999px; background: var(--dsw-alias-bg-layer-4, #a6afbd); transition: background 150ms ease; }
.hr_ead46c4_clawbotSwitchTrack::after { content: ''; display: block; width: 18px; height: 18px; margin: 3px; border-radius: 50%; background: #fff; box-shadow: 0 1px 3px rgb(0 0 0 / 18%); transition: transform 150ms ease; }
.hr_ead46c4_clawbotToggle input:checked + .hr_ead46c4_clawbotSwitchTrack { background: var(--dsw-alias-state-business-primary, #4e79ff); }
.hr_ead46c4_clawbotToggle input:checked + .hr_ead46c4_clawbotSwitchTrack::after { transform: translateX(18px); }
.hr_ead46c4_clawbotToggle input:disabled { cursor: default; }
.hr_ead46c4_clawbotToggle input:disabled + .hr_ead46c4_clawbotSwitchTrack { opacity: .45; }
.hr_ead46c4_clawbotToggle input:focus-visible + .hr_ead46c4_clawbotSwitchTrack, .hr_ead46c4_clawbotTextButton:focus-visible, .hr_ead46c4_clawbotManage summary:focus-visible, .hr_ead46c4_clawbotRow select:focus-visible { outline: 2px solid var(--dsw-alias-state-business-primary, #4e79ff); outline-offset: 3px; }
.hr_ead46c4_clawbotNote { font-size: 12px; line-height: 1.6; color: var(--dsw-alias-label-secondary, #647084); margin: 8px 0; }
.hr_ead46c4_clawbotError { color: var(--dsw-alias-state-error-primary, #b23b36); font-size: 13px; }
.hr_ead46c4_clawbotPairing { display: flex; align-items: center; gap: 20px; flex-wrap: wrap; margin-top: 12px; }
.hr_ead46c4_clawbotPairing img { display: block; flex: none; max-width: 100%; height: auto; border-radius: 8px; background: #fff; }
.hr_ead46c4_clawbotPairingCopy { flex: 1 1 200px; min-width: 0; }
.hr_ead46c4_clawbotPairingCopy form { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; margin-top: 12px; }
.hr_ead46c4_clawbotPairing input { border: 1px solid var(--dsw-alias-border-l2, #ddd); border-radius: 6px; padding: 8px; width: 120px; max-width: 100%; color: inherit; background: transparent; }
.hr_ead46c4_clawbotActions { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; margin-top: 10px; }
.hr_ead46c4_clawbotTextButton { padding: 4px 0; border: 0; color: var(--dsw-alias-state-business-primary, #4e79ff); background: transparent; font: inherit; font-size: 12px; cursor: pointer; white-space: nowrap; flex-shrink: 0; }
.hr_ead46c4_clawbotTextButton:disabled { opacity: .5; cursor: default; }
.hr_ead46c4_clawbotManage { margin-top: 16px; color: var(--dsw-alias-label-secondary, #647084); font-size: 12px; }
.hr_ead46c4_clawbotManage summary { width: fit-content; padding: 4px 0; cursor: pointer; }
.hr_ead46c4_clawbotManage .hr_ead46c4_clawbotActions { margin-top: 6px; gap: 14px; }
.hr_ead46c4_assistantFeatureBody { border: 0; padding: 0; margin: 12px 0 0; min-width: 0; }
.hr_ead46c4_assistantFeatureBody:disabled { opacity: .55; }
.hr_ead46c4_clawbotMark { display: inline-flex; flex: 0 0 18px; width: 18px; height: 18px; border-radius: 5px; background: #e54443; align-items: center; justify-content: center; gap: 3px; }
.hr_ead46c4_clawbotMark::before, .hr_ead46c4_clawbotMark::after { content: ''; display: block; width: 5px; height: 5px; border-radius: 50%; background: #fff; }
@media (prefers-reduced-motion: reduce) {
  .hr_ead46c4_clawbotSwitchTrack, .hr_ead46c4_clawbotSwitchTrack::after { transition: none; }
}
`,Pe="@harness-remote/dsh-wechat-remote/HarnessRemoteSettings.module.css";if(typeof document<"u"&&document.querySelector("style[data-plugin-css="+JSON.stringify(Pe)+"]")===null){let r=document.createElement("style");r.dataset.plugin="@harness-remote/dsh-wechat-remote",r.dataset.pluginCss=Pe,r.textContent=lt,document.head.appendChild(r)}Ae.exports={root:"hr_ead46c4_root",hero:"hr_ead46c4_hero",connectCard:"hr_ead46c4_connectCard",pairingCard:"hr_ead46c4_pairingCard",identity:"hr_ead46c4_identity",mark:"hr_ead46c4_mark",identityCopy:"hr_ead46c4_identityCopy",pairingHead:"hr_ead46c4_pairingHead",securityNote:"hr_ead46c4_securityNote",sidebarButton:"hr_ead46c4_sidebarButton",actions:"hr_ead46c4_actions",pageDialog:"hr_ead46c4_pageDialog",pageDialogContent:"hr_ead46c4_pageDialogContent",helpText:"hr_ead46c4_helpText",companionCard:"hr_ead46c4_companionCard",assistantsCard:"hr_ead46c4_assistantsCard",assistantsHeading:"hr_ead46c4_assistantsHeading",assistantChoices:"hr_ead46c4_assistantChoices",assistantChoice:"hr_ead46c4_assistantChoice",assistantChoiceCopy:"hr_ead46c4_assistantChoiceCopy",assistantChoiceHead:"hr_ead46c4_assistantChoiceHead",assistantEntryHead:"hr_ead46c4_assistantEntryHead",assistantStatus:"hr_ead46c4_assistantStatus",assistantPrimary:"hr_ead46c4_assistantPrimary",assistantSecondary:"hr_ead46c4_assistantSecondary",assistantTextButton:"hr_ead46c4_assistantTextButton",assistantDetails:"hr_ead46c4_assistantDetails",assistantCustomize:"hr_ead46c4_assistantCustomize",assistantPreview:"hr_ead46c4_assistantPreview",assistantUnavailable:"hr_ead46c4_assistantUnavailable",assistantHelpAnchor:"hr_ead46c4_assistantHelpAnchor",assistantHelpButton:"hr_ead46c4_assistantHelpButton",assistantTooltip:"hr_ead46c4_assistantTooltip",assistantButtons:"hr_ead46c4_assistantButtons",assistantEntry:"hr_ead46c4_assistantEntry",overall:"hr_ead46c4_overall",statusDot:"hr_ead46c4_statusDot",capabilities:"hr_ead46c4_capabilities",capability:"hr_ead46c4_capability",capabilityCopy:"hr_ead46c4_capabilityCopy",notice:"hr_ead46c4_notice",secondaryButton:"hr_ead46c4_secondaryButton",primaryButton:"hr_ead46c4_primaryButton",qrArea:"hr_ead46c4_qrArea",qr:"hr_ead46c4_qr",qrPlaceholder:"hr_ead46c4_qrPlaceholder",qrValidity:"hr_ead46c4_qrValidity",updateCard:"hr_ead46c4_updateCard",updateHeading:"hr_ead46c4_updateHeading",updateRow:"hr_ead46c4_updateRow",updateCopy:"hr_ead46c4_updateCopy",updateControl:"hr_ead46c4_updateControl",updateLabel:"hr_ead46c4_updateLabel",updateChecked:"hr_ead46c4_updateChecked",updateActions:"hr_ead46c4_updateActions",updateEndpoint:"hr_ead46c4_updateEndpoint",companionInline:"hr_ead46c4_companionInline",updateScope:"hr_ead46c4_updateScope",updatePeerNote:"hr_ead46c4_updatePeerNote",updateDetails:"hr_ead46c4_updateDetails",updateProgress:"hr_ead46c4_updateProgress",updateVersions:"hr_ead46c4_updateVersions",updateCommand:"hr_ead46c4_updateCommand",clawbotCard:"hr_ead46c4_clawbotCard",clawbotHead:"hr_ead46c4_clawbotHead",clawbotRow:"hr_ead46c4_clawbotRow",clawbotReceiveRow:"hr_ead46c4_clawbotReceiveRow",clawbotNode:"hr_ead46c4_clawbotNode",clawbotSection:"hr_ead46c4_clawbotSection",clawbotStatus:"hr_ead46c4_clawbotStatus",clawbotPairingEntry:"hr_ead46c4_clawbotPairingEntry",clawbotNote:"hr_ead46c4_clawbotNote",clawbotToggle:"hr_ead46c4_clawbotToggle",clawbotSwitchTrack:"hr_ead46c4_clawbotSwitchTrack",clawbotTextButton:"hr_ead46c4_clawbotTextButton",clawbotManage:"hr_ead46c4_clawbotManage",clawbotError:"hr_ead46c4_clawbotError",clawbotPairing:"hr_ead46c4_clawbotPairing",clawbotPairingCopy:"hr_ead46c4_clawbotPairingCopy",clawbotActions:"hr_ead46c4_clawbotActions",assistantFeatureBody:"hr_ead46c4_assistantFeatureBody",clawbotMark:"hr_ead46c4_clawbotMark"}});var ht={};it(ht,{apply:()=>ut,inject:()=>pt});module.exports=ot(ht);var Be=require("react"),Ie=require("@deepseek-ai/dsh-client-ui-primitives");var F=K(Q(),1),k=require("react/jsx-runtime");function Re({value:r,onDecide:t,deciding:e=!1,compact:a=!1}){if(!r||!a&&r.state==="idle")return null;let n={"confirmation-required":"是否更新下方指定端的插件？",deferred:"已暂缓此次联动更新",pending:"联动更新待处理",busy:"等待待更新端的任务结束",preparing:"正在准备联动更新",installing:"正在安装插件更新",verifying:"正在核验更新后的恢复状态",recovering:"正在恢复更新前的插件","restart-required":"待更新端需启动或重启确认","self-restart-required":"当前端待重启，尚未生效",unverified:"两端更新状态待核实",complete:"两端插件已对齐",unavailable:"联动更新尚未确认成功"},d=["preparing","installing","verifying","recovering"].includes(r.state),o=r.versions?.peer==="desktop"?"Desktop":r.versions?.peer==="web"?"Web":null,l=r.target?.scope==="desktop"?"Desktop":r.target?.scope==="web"?"Web":null,p=l||"更新端",g={pending:`等待 ${p} 就绪`,busy:`${p} 有任务，等待空闲`,preparing:`正在准备 ${p} 更新`,installing:`正在更新 ${p}`,verifying:`正在核对 ${p} 更新结果`,recovering:`正在恢复 ${p} 原版本`,"restart-required":`${p} 已安装，待启动或重连确认`,"self-restart-required":"当前端待重启，尚未生效",unverified:"更新状态待核对",complete:"两端版本已同步",unavailable:"更新未完成，请核对"},x=["confirmation-required","deferred"].includes(r.state);if(a&&r.state==="idle"&&!r.versions?.peerInstalled)return(0,k.jsx)("p",{className:F.default.updatePeerNote,children:"未检测到可同步更新的另一端；当前端可独立使用。"});let S=r.state==="idle"?"未发现待确认的同步更新":a&&x&&l&&r.target?`${l} 可更新至 ${r.target.version}${r.state==="deferred"?" · 已暂缓":""}`:a&&r.state==="self-restart-required"?"当前端重启后可检查同步更新":(a?g[r.state]:void 0)||n[r.state]||"插件更新状态待核对",u=x&&r.offerId&&t?(0,k.jsxs)("div",{className:F.default.updateActions,children:[(0,k.jsx)("button",{type:"button",className:F.default.primaryButton,disabled:e,onClick:()=>t("approve"),children:e?"确认中…":l?`确认更新 ${l}`:"确认更新指定端"}),(0,k.jsx)("button",{type:"button",className:F.default.secondaryButton,disabled:e,onClick:()=>t("later"),children:"稍后再说"})]}):null;return(0,k.jsxs)("aside",{className:a?F.default.companionInline:F.default.companionCard,"data-state":r.state,role:"status","aria-live":"polite",children:[a?(0,k.jsxs)("div",{className:F.default.updateRow,children:[(0,k.jsxs)("div",{className:F.default.updateCopy,children:[o?(0,k.jsxs)("div",{className:F.default.updateVersions,children:[(0,k.jsxs)("strong",{children:[o," ",(0,k.jsx)("span",{className:F.default.updateScope,children:"同一主机"})]}),(0,k.jsx)("span",{children:r.versions?.peerInstalled?`已安装 ${r.versions.peerInstalled}`:"安装或启用状态未确认"})]}):null,(0,k.jsx)("strong",{children:S})]}),u]}):(0,k.jsx)("strong",{children:S}),a?(0,k.jsx)(k.Fragment,{children:r.state!=="idle"&&r.message?(0,k.jsxs)("details",{className:F.default.updateDetails,children:[(0,k.jsx)("summary",{children:"详细状态"}),(0,k.jsx)("p",{children:r.message})]}):null}):r.message?(0,k.jsx)("p",{children:r.message}):null,!a&&r.versions?(0,k.jsxs)("small",{children:[r.versions.current==="desktop"?"Desktop":"Web","：运行 ",r.versions.running," · 已安装 ",r.versions.installed??"未确认","；",o,"：已安装 ",r.versions.peerInstalled??"未确认或未启用"]}):null,u?(0,k.jsxs)(k.Fragment,{children:[a?null:u,(0,k.jsx)("small",{className:F.default.updateChecked,children:"空闲后更新，连接会短暂中断；保留配对与会话。"})]}):null,d?(0,k.jsx)("progress",{"aria-label":"联动更新进度"}):null,r.state==="busy"?(0,k.jsx)("small",{children:"不用手动停止任务。请保持两端运行，空闲后会继续检查。"}):d?(0,k.jsx)("small",{children:"请保持两端当前状态，暂勿退出、重启或重复安装。关闭本设置页不会取消更新。"}):r.state==="unavailable"?(0,k.jsx)("small",{children:"请在待更新端核对版本，必要时使用其原安装入口。"}):null]})}async function He(r,t,e=fetch){let a=await r(),n=a.gate;if(!n)throw new Error("当前节点没有提供配对入口");let d=n.profileScope==="desktop",o=n.localDoor?.port,l=Number.isSafeInteger(o)&&o>=1&&o<=65535?`http://127.0.0.1:${o}`:null;if(n.management==="authenticated-rpc")return{host:a,runtime:n,localOrigin:d?null:l,status:()=>t("status"),pairCode:()=>t("pair-code"),decide:(g,x)=>t("companion-decision",{offerId:g,action:x})};if(d||n.management==="unavailable"||!l||n.localDoor.state!=="listening")throw new Error("当前节点配对入口尚未就绪");let p=async g=>{let x=await e(l+g,{cache:"no-store"});if(!x.ok)throw new Error(`配对请求失败 (${x.status})`);return x.json()};return{host:a,runtime:n,localOrigin:l,status:()=>p("/gate/status"),pairCode:()=>p("/pair/code"),decide:async(g,x)=>{let S=await e(l+"/gate/companion/decision",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({offerId:g,action:x})});if(!S.ok)throw new Error("更新通知已变化，请刷新后重试");return S.json()}}}var ge=class{constructor(t,e=globalThis.fetch){this.origin=t;this.fetcher=e.bind(globalThis)}value={check:null,checking:!1,progress:null,error:"",copied:!1,resumeFailed:!1};listeners=new Set;reading;installing=!1;disposed=!1;job=null;timer;pollGeneration=0;recovering=!1;fetcher;getSnapshot=()=>this.value;subscribe=t=>this.disposed?()=>{}:(this.listeners.add(t),this.listeners.size===1&&this.refresh(),()=>{this.listeners.delete(t)});patch(t){if(!this.disposed){this.value={...this.value,...t};for(let e of this.listeners)e()}}refresh=()=>this.disposed?Promise.resolve():this.reading?this.reading:(this.patch({checking:!0,error:"",copied:!1}),this.reading=(async()=>{try{let t=await this.fetcher(this.origin+"/gate/update/check",{signal:AbortSignal.timeout(1e4)}),e=await t.json();if(!t.ok)throw new Error(e.error||"暂时无法检查更新");if(!e.advice?.current||typeof e.advice.label!="string")throw new Error("更新检查返回信息不完整");if(this.patch({check:e}),this.installing||this.job||this.recovering)return;e.activeJob?.statusOrigin?this.follow(e.activeJob):e.lastResult?.phase==="unknown"?this.patch({progress:e.lastResult}):e.mode==="busy"?this.patch({progress:{phase:"preparing",progress:0,message:"更新仍在准备或等待确认，请稍后重新检查；不要重复安装。",terminal:!0}}):this.patch({progress:e.lastResult??null})}catch(t){this.patch({check:null,error:t instanceof Error?t.message:"暂时无法检查更新"})}finally{this.patch({checking:!1})}})().finally(()=>{this.reading=void 0}),this.reading);follow(t){if(this.disposed||this.job?.jobId===t.jobId)return;this.job=t;let e=++this.pollGeneration,a=Date.now()+10*6e4;clearTimeout(this.timer),this.patch({progress:{phase:"recovering",progress:0,message:"正在恢复更新进度…",terminal:!1}});let n=async()=>{if(this.disposed||e!==this.pollGeneration)return;let d;try{let o=await this.fetcher(t.statusOrigin+"/status",{headers:{Authorization:"Bearer "+t.statusToken},signal:AbortSignal.timeout(4e3)});if(!o.ok)throw new Error("进度暂不可用");let l=await o.json();if(l.jobId!==t.jobId||typeof l.terminal!="boolean"||typeof l.message!="string")throw new Error("进度不匹配");d=l}catch{try{let o=await this.fetcher(this.origin+"/gate/update/status",{signal:AbortSignal.timeout(3e3)}),l=await o.json();o.ok&&l.lastResult?.jobId===t.jobId&&(d=l.lastResult)}catch{}}if(!(this.disposed||e!==this.pollGeneration)){if(d&&(this.patch({progress:d}),d.terminal)){this.job=null,d.ok?this.resume(t.jobId):this.refresh();return}if(Date.now()>a){this.job=null,this.patch({progress:{phase:"unknown",progress:0,message:"暂时无法确认更新结果。请重新打开此主机 WebUI 检查版本；不要重复安装或删除节点。",terminal:!0}});return}this.timer=setTimeout(()=>void n(),1e3)}};n()}async resume(t){this.recovering=!0;let e=Date.now()+3e4,a=async()=>{try{let n=await this.fetcher(this.origin+"/gate/update/resume?job="+encodeURIComponent(t),{signal:AbortSignal.timeout(3e3)});if(!n.ok)throw new Error("尚未恢复");let d=await n.json();if(!d.url)throw new Error("缺少恢复地址");let o=new URL(d.url);if(o.origin!==window.location.origin||o.pathname!=="/"||o.username||o.password||o.hash)throw new Error("恢复地址不匹配");this.disposed||window.location.replace(o.href)}catch{if(this.disposed)return;if(Date.now()>=e){this.recovering=!1,this.patch({resumeFailed:!0});return}this.timer=setTimeout(()=>void a(),1e3)}};await a()}install=async()=>{let{check:t,checking:e,error:a,progress:n}=this.value;if(this.disposed||!t?.canInstall||e||a||n&&!n.terminal||this.installing||this.job||this.recovering)return;this.installing=!0,this.patch({error:"",check:{...t,canInstall:!1,ticket:""},progress:{phase:"download",progress:10,message:"正在下载并验证更新包；当前插件尚未替换",terminal:!1}});let d=!1;try{let o=await this.fetcher(this.origin+"/gate/update/start",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({ticket:t.ticket})}),l=await o.json();if(d=!o.ok&&typeof l.error=="string",!o.ok||!l.statusOrigin)throw new Error(l.error||"无法取得更新进度，请重新检查");this.follow(l)}catch(o){if(this.disposed)return;if(d)this.patch({progress:{phase:"failed",progress:0,message:(o instanceof Error?o.message:"更新暂不可用")+"。请重新检查更新。",terminal:!0,ok:!1}});else{try{let l=await this.fetcher(this.origin+"/gate/update/status",{signal:AbortSignal.timeout(3e3)}),p=await l.json();if(l.ok&&p.activeJob?.statusOrigin){this.follow(p.activeJob);return}}catch{}this.patch({progress:{phase:"unknown",progress:0,message:"连接中断，暂时无法确认更新结果。请稍后检查更新；不要重复安装或删除节点。",terminal:!0}})}}finally{this.installing=!1}};copyCommand=async()=>{if(!(!this.value.check?.manualCommand||this.value.checking||this.installing||this.job))try{await navigator.clipboard.writeText(this.value.check.manualCommand),this.patch({copied:!0})}catch{this.patch({error:"复制失败，请手动选中下方命令复制。"})}};dispose=()=>{this.disposed=!0,this.pollGeneration++,clearTimeout(this.timer),this.listeners.clear()}};var me=class{constructor(t){this.call=t}value={checking:!1,starting:!1,check:null,status:null,error:null};listeners=new Set;reading;timer;disposed=!1;checkRevision=0;checkInvalidated=!1;getSnapshot=()=>this.value;patch(t){if(!this.disposed){this.value={...this.value,...t};for(let e of this.listeners)e()}}subscribe=t=>this.disposed?()=>{}:(this.listeners.add(t),this.checkInvalidated?(this.refreshInvalidatedCheck(),this.active()&&this.poll()):!this.value.check&&!this.value.starting?this.refresh():this.active()&&this.poll(),()=>{this.listeners.delete(t),this.listeners.size||(clearTimeout(this.timer),this.timer=void 0)});active(){return this.value.status&&["preparing","installing","unknown","restart-required"].includes(this.value.status.phase)}invalidateCheck=()=>{this.disposed||(this.checkRevision++,this.checkInvalidated=!0,this.value.check&&this.patch({check:{...this.value.check,canInstall:!1,ticket:""}}),this.refreshInvalidatedCheck())};refreshInvalidatedCheck(){!this.disposed&&this.checkInvalidated&&this.listeners.size&&!this.value.starting&&!this.active()&&this.refresh()}refresh=()=>{if(this.disposed||this.value.starting)return Promise.resolve();if(this.reading)return this.reading;let t=this.checkRevision;return this.checkInvalidated=!1,this.patch({checking:!0,error:null}),this.reading=(async()=>{try{let e=await this.call("update-check");if(this.disposed||t!==this.checkRevision)return;if(!e?.advice||!e.status||typeof e.canInstall!="boolean")throw Error("invalid update response");this.patch({check:e,status:e.status}),this.active()&&this.poll()}catch{if(this.disposed||t!==this.checkRevision)return;let e=!1;try{let a=await this.call("status");e=!!(a&&!a.plugin)}catch{}if(this.disposed||t!==this.checkRevision)return;this.patch({check:null,error:e?"当前运行的连接服务尚不支持此更新入口。若刚安装新版，请在任务结束后退出并重新打开 Desktop；无需重新配对。仍不可用时请在原生插件管理器核对安装。":"本次更新检查未完成，不能据此判断已是最新版。请稍后重试；配对和聊天不受此次检查失败影响。"})}finally{this.patch({checking:!1})}})().finally(()=>{this.reading=void 0,this.refreshInvalidatedCheck()}),this.reading};install=async()=>{let t=this.value.check;if(!(this.disposed||this.checkInvalidated||this.value.starting||this.value.checking||!t?.canInstall||!t.ticket)){this.patch({starting:!0,error:null,check:{...t,canInstall:!1,ticket:""}});try{let e=await this.call("update-start",{ticket:t.ticket});this.patch({status:e})}catch(e){this.patch({status:e?.code==="update/not-started"?{phase:"failed",message:e instanceof Error?e.message:"尚未启动更新，请重新检查"}:{phase:"unknown",message:"更新提交结果暂未确认，正在核对；请勿重复安装。"}})}finally{this.patch({starting:!1}),this.poll(),this.refreshInvalidatedCheck()}}};poll(){this.disposed||this.timer||!this.listeners.size||!this.active()||(this.timer=setTimeout(async()=>{try{let t=await this.call("update-status");if(!t||!["idle","preparing","installing","restart-required","complete","failed","unknown"].includes(t.phase))throw Error("invalid status");this.patch({status:t,error:t.phase==="idle"?"尚未发现已接受的更新，请重新检查后再操作。":null})}catch{this.patch({error:"更新状态暂不可用；恢复连接后继续核对，不会重复安装。"})}finally{this.timer=void 0,this.poll(),this.refreshInvalidatedCheck()}},2e3))}dispose(){this.disposed=!0,this.checkRevision++,this.checkInvalidated=!1,clearTimeout(this.timer),this.listeners.clear()}};var xe=()=>({loadState:"loading",qrState:"idle",status:null,host:null,runtime:null,localOrigin:null,qr:null,error:null,decisionError:null,deciding:!1}),Ee=r=>r?.companionUpdate?.state?["preparing","installing","verifying","recovering"].includes(r.companionUpdate.state):void 0,ne=class{constructor(t,e){this.describeHost=t;this.callManagement=e}updates;nativeUpdates;value=xe();listeners=new Set;timer;reading;pairing;disposed=!1;identity="";generation=0;getSnapshot=()=>this.value;subscribe=t=>this.disposed?()=>{}:(this.listeners.add(t),this.timer||(this.refresh(),this.timer=setInterval(()=>void this.refresh(),2e3)),()=>{this.listeners.delete(t),this.listeners.size||(clearInterval(this.timer),this.timer=void 0)});patch(t){if(!this.disposed){this.value={...this.value,...t};for(let e of this.listeners)e()}}async client(){let t=await He(this.describeHost,this.callManagement);if(this.disposed)throw new Error("disposed");let e=`${t.host.agentInstanceId??t.host.computerName}/${t.runtime.profileScope??"web"}`;return this.identity&&this.identity!==e&&(this.generation++,this.value=xe(),this.updates?.dispose(),this.updates=void 0,this.nativeUpdates?.dispose(),this.nativeUpdates=void 0),this.identity=e,t.runtime.profileScope==="desktop"&&!this.nativeUpdates&&(this.nativeUpdates=new me(this.callManagement)),this.updates?.origin!==t.localOrigin&&(this.updates?.dispose(),this.updates=t.localOrigin?new ge(t.localOrigin):void 0),this.patch({host:t.host,runtime:t.runtime,localOrigin:t.localOrigin}),t}refresh=()=>this.disposed?Promise.resolve():this.reading?this.reading:(this.reading=(async()=>{try{let t=await this.client(),e=this.generation,a={...await t.status()};if(a.companionUpdate?.state==="complete"&&!a.plugin&&(a.companionUpdate={state:"unverified",message:"当前连接服务尚未提供运行版本核验，不能确认两端已对齐。若刚安装插件，请在任务结束后退出并重新打开当前应用；无需重新配对。"}),e!==this.generation)return;let n=Ee(this.value.status),d=Ee(a);d!==void 0&&d!==n&&this.nativeUpdates?.invalidateCheck(),this.patch({status:a,runtime:a.gate??t.runtime,loadState:"ready",error:null,...this.value.qr&&this.value.qr.expiresAt<=Date.now()?{qrState:"expired",qr:null}:{}})}catch{this.patch({loadState:"error",error:"连接服务暂未就绪。请确认 DSH 正在运行，然后重试。"})}})().finally(()=>{this.reading=void 0}),this.reading);generateQr=()=>this.disposed?Promise.resolve():this.pairing?this.pairing:(this.patch({qrState:"loading",qr:null,error:null}),this.pairing=(async()=>{try{let t=await this.client(),e=this.generation,a=await t.pairCode();if(e!==this.generation)return;if(!a?.qrDataUrl?.startsWith("data:image/")||!Number.isFinite(a.expiresAt)||a.expiresAt<=Date.now())throw new Error("invalid QR");this.patch({qr:a,qrState:"ready"}),await this.refresh()}catch{this.patch({qr:null,qrState:"error",error:"暂时无法生成配对二维码，请稍后重试。"})}})().finally(()=>{this.pairing=void 0}),this.pairing);decide=async t=>{let e=this.value.status?.companionUpdate?.offerId;if(!(this.disposed||this.value.deciding||!e)){this.patch({deciding:!0,decisionError:null});try{let a=await this.client();if(this.value.status?.companionUpdate?.offerId!==e)throw new Error("stale offer");await a.decide(e,t),await this.reading,await this.refresh()}catch{this.patch({decisionError:"更新选择未确认，请刷新后核对；不要重复安装。"})}finally{this.patch({deciding:!1})}}};dispose=()=>{this.disposed=!0,this.generation++,clearInterval(this.timer),this.timer=void 0,this.listeners.clear(),this.value=xe(),this.updates?.dispose(),this.updates=void 0,this.nativeUpdates?.dispose(),this.nativeUpdates=void 0}},De=new WeakMap;function fe(r,t){let e=De.get(r);return e||(e=new ne(r,t),De.set(r,e)),e}var Y=K(Q(),1),O=require("react/jsx-runtime");function be({describeHost:r,callManagement:t,onDismiss:e,onOpenDetails:a,compact:n=!1,store:d=fe(r,t)}){let{status:o,deciding:l,decisionError:p,error:g,loadState:x}=(0,Be.useSyncExternalStore)(d.subscribe,d.getSnapshot,d.getSnapshot),S=o?.companionUpdate,u=p||g,w=(0,O.jsxs)("div",{children:[(0,O.jsx)(Re,{value:S,compact:n,deciding:l||x!=="ready",onDecide:f=>void d.decide(f)}),!S&&!u?(0,O.jsx)("p",{className:Y.default.helpText,children:x==="loading"?"正在检查同一主机的另一端…":"另一端状态未确认；不会自动更新。"}):!n&&S?.state==="idle"?(0,O.jsx)("p",{className:Y.default.helpText,children:"未发现需要联动更新的另一端。当前节点可独立使用，不会自动安装另一端或启用已停用的插件。"}):null,u?(0,O.jsx)("p",{role:"alert",children:u}):null,e?(0,O.jsxs)("div",{className:Y.default.actions,children:[a?(0,O.jsx)("button",{type:"button",className:Y.default.primaryButton,onClick:a,children:"前往微信连接"}):null,(0,O.jsx)("button",{type:"button",className:Y.default.secondaryButton,onClick:e,children:"关闭提示（不会确认更新）"})]}):null]});return e?(0,O.jsx)(Ie.Modal,{open:!0,title:"微信连接 · 联动更新",closeLabel:"关闭提示",className:Y.default.pageDialog,contentClassName:Y.default.pageDialogContent,onClose:e,children:w}):w}function re(r,t,e=Date.now()){return!!(t?.allowed&&t.reason==="allowed"&&Number.isSafeInteger(t.validUntil)&&t.validUntil>e&&Number.isSafeInteger(r?.checkedAt)&&Number.isSafeInteger(r?.expiresAt)&&r.checkedAt>0&&r.expiresAt>r.checkedAt&&r.expiresAt-r.checkedAt<=6e4&&r.expiresAt>e&&Math.abs(e-r.checkedAt)<=6e4)}function Te(r){let t=r;if(!t||t.schemaVersion!==1||typeof t.nodeId!="string"||typeof t.groupEnabled!="boolean"||!Number.isSafeInteger(t.checkedAt)||!Number.isSafeInteger(t.expiresAt)||!t.features||["group_assistant","clawbot"].some(e=>{let a=t.features[e];return!a||typeof a.allowed!="boolean"||typeof a.reason!="string"||a.allowed&&(a.reason!=="allowed"||!Number.isSafeInteger(a.validUntil)||!a.validUntil||t.checkedAt<=0||t.expiresAt<=t.checkedAt||t.expiresAt-t.checkedAt>6e4)||a.message!==void 0&&typeof a.message!="string"}))throw new Error("使用资格暂不可用，请更新插件并刷新。");return t}var ie=require("react"),je=K(Q(),1),W=require("react/jsx-runtime");function Ue({wide:r,openPlugin:t}){let[e,a]=(0,ie.useState)(!1),[n,d]=(0,ie.useState)(!1),o=(0,ie.useRef)(!1),l=async()=>{if(!o.current){o.current=!0,d(!0);try{await t()||a(!0)}finally{o.current=!1,d(!1)}}};return(0,W.jsxs)(W.Fragment,{children:[(0,W.jsxs)("button",{type:"button",className:je.default.sidebarButton,"data-wide":r,title:"微信连接","aria-label":"微信连接",disabled:n,onClick:()=>void l(),children:[(0,W.jsxs)("svg",{width:"20",height:"20",viewBox:"0 0 24 24",fill:"none",stroke:"currentColor",strokeWidth:"1.7","aria-hidden":"true",children:[(0,W.jsx)("path",{d:"M20 11.5a8 8 0 0 1-8 8 9 9 0 0 1-3.5-.7L4 20l1.2-4.2A7.8 7.8 0 0 1 4 11.5a8 8 0 0 1 16 0Z"}),(0,W.jsx)("path",{d:"M8 11.5h.01M12 11.5h.01M16 11.5h.01",strokeWidth:"2.5",strokeLinecap:"round"})]}),r?(0,W.jsx)("span",{children:n?"正在打开…":"微信连接"}):null]}),e?(0,W.jsx)("small",{role:"status",children:"插件详情暂不可用，请打开「设置 → 微信连接」。"}):null]})}async function ze(r){try{let t=r("pluginNavigation"),e=r("remote.pluginManager");if(typeof t?.openBundle!="function"||typeof e?.listBundles!="function")return!1;let a=await e.listBundles();if(!a.ok||!Array.isArray(a.value))return!1;let n=a.value.filter(o=>o.enabled&&["dsh-wechat-remote","@harness-remote/dsh-wechat-remote"].includes(o.name));if(n.length!==1)return!1;let d=r("pluginNavigation");return d!==t||typeof d.openBundle!="function"?!1:(d.openBundle(n[0].name),!0)}catch{return!1}}var ve=require("react"),Ge=require("@deepseek-ai/dsh-client-ui-primitives"),P=K(Q(),1);var qe=require("react"),B=K(Q(),1),m=require("react/jsx-runtime");function Me({store:r,embedded:t=!1}){let{check:e,checking:a,progress:n,error:d,copied:o,resumeFailed:l}=(0,qe.useSyncExternalStore)(r.subscribe,r.getSnapshot,r.getSnapshot),p=!!(n&&!n.terminal),g=p||n?.phase==="unknown"||e?.mode==="busy";return(0,m.jsxs)("div",{className:t?B.default.updateEndpoint:B.default.updateCard,children:[(0,m.jsxs)("div",{className:B.default.updateRow,children:[(0,m.jsxs)("div",{className:B.default.updateCopy,children:[(0,m.jsxs)("strong",{children:["Web ",(0,m.jsx)("span",{className:B.default.updateScope,children:"当前端"})]}),e?(0,m.jsxs)("div",{className:B.default.updateVersions,children:[(0,m.jsxs)("span",{children:["DSH ",(0,m.jsx)("strong",{children:e.advice.current.agentVersion||"未确认"})]}),(0,m.jsxs)("span",{children:["插件运行 ",(0,m.jsx)("strong",{children:e.advice.current.pluginVersion||"未确认"})]}),e.channel==="preview"?(0,m.jsx)("span",{children:"预览通道"}):null]}):null]}),(0,m.jsxs)("div",{className:B.default.updateControl,children:[(0,m.jsx)("button",{type:"button",className:B.default.secondaryButton,disabled:a||p,onClick:()=>void r.refresh(),children:a?"检查中…":"检查更新"}),e&&!a?(0,m.jsx)("strong",{className:B.default.updateLabel,"data-severity":g?"unknown":e.advice.severity,role:"status",children:p?"正在更新 Web 插件":g?"更新状态待核对":e.advice.label}):null,e?.advice.checkedAt&&e.advice.severity!=="unknown"?(0,m.jsxs)("small",{className:B.default.updateChecked,children:["检查于 ",new Date(e.advice.checkedAt).toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"})]}):null]})]}),e?(0,m.jsx)(m.Fragment,{children:a?null:(0,m.jsxs)(m.Fragment,{children:[!g&&e.advice.targetVersion?(0,m.jsxs)("p",{children:["可更新至 ",e.advice.targetVersion,e.mode==="manual"?" · 需手动更新":""]}):null,!g&&(e.advice.severity==="unknown"||e.advice.severity==="required"||e.mode==="manual")?(0,m.jsxs)("details",{children:[(0,m.jsx)("summary",{children:e.mode==="manual"?"手动更新说明":"查看说明"}),e.reason?(0,m.jsx)("p",{children:e.reason}):null,(0,m.jsx)("p",{children:e.advice.message})]}):null,!g&&e.mode==="manual"&&e.manualCommand?(0,m.jsxs)("div",{className:B.default.updateCommand,children:[(0,m.jsx)("code",{children:e.manualCommand}),(0,m.jsx)("button",{type:"button",className:B.default.secondaryButton,disabled:p,onClick:()=>void r.copyCommand(),children:o?"已复制":"复制命令"})]}):null,!g&&e.canInstall?(0,m.jsxs)(m.Fragment,{children:[(0,m.jsx)("div",{className:B.default.updateActions,children:(0,m.jsx)("button",{type:"button",className:B.default.primaryButton,disabled:p||!!d,onClick:()=>void r.install(),children:"更新 Web 并重启"})}),(0,m.jsx)("small",{className:B.default.updateChecked,children:"仅更新 Web，保留配对与会话；连接会短暂中断。"})]}):null]})}):null,d?(0,m.jsx)("p",{role:"alert",children:d}):null,n?(0,m.jsxs)("div",{role:"status","aria-live":"polite",children:[!n.terminal||n.ok===!0?(0,m.jsx)("progress",{className:B.default.updateProgress,max:100,value:n.progress}):null,(0,m.jsx)("p",{children:n.message}),l?(0,m.jsx)("p",{role:"alert",children:"插件已完成更新，但未能自动打开 WebUI。请使用 DSH 启动时显示的地址打开，无需重复更新。"}):null]}):null]})}var Ve=require("react"),T=K(Q(),1),_=require("react/jsx-runtime");function Fe({store:r,embedded:t=!1}){let{check:e,status:a,checking:n,starting:d,error:o}=(0,Ve.useSyncExternalStore)(r.subscribe,r.getSnapshot,r.getSnapshot),l=d||a?.phase==="preparing"||a?.phase==="installing",p=a&&["preparing","installing","restart-required","unknown"].includes(a.phase),g=a?.phase==="restart-required"||a?.phase==="complete",x=a?.phase==="restart-required"?"已安装，待重新打开 Desktop":a?.phase==="unknown"?"更新结果待核对":a?.phase==="failed"?"更新未完成":l?"正在更新 Desktop 插件":a?.phase==="complete"?"更新已生效":"";return(0,_.jsxs)("div",{className:t?T.default.updateEndpoint:T.default.updateCard,children:[(0,_.jsxs)("div",{className:T.default.updateRow,children:[(0,_.jsxs)("div",{className:T.default.updateCopy,children:[(0,_.jsxs)("strong",{children:["Desktop ",(0,_.jsx)("span",{className:T.default.updateScope,children:"当前端"})]}),e?(0,_.jsxs)("div",{className:T.default.updateVersions,children:[(0,_.jsxs)("span",{children:["DSH ",(0,_.jsx)("strong",{children:e.advice.current.agentVersion||"未确认"})]}),(0,_.jsxs)("span",{children:["插件运行 ",(0,_.jsx)("strong",{children:e.advice.current.pluginVersion||"未确认"})]}),g&&a.targetVersion&&a.targetVersion!==e.advice.current.pluginVersion?(0,_.jsxs)("span",{children:["已安装 ",(0,_.jsx)("strong",{children:a.targetVersion})]}):null,e.channel==="preview"?(0,_.jsx)("span",{children:"预览通道"}):null]}):null]}),(0,_.jsxs)("div",{className:T.default.updateControl,children:[(0,_.jsx)("button",{type:"button",className:T.default.secondaryButton,disabled:n||l,onClick:()=>void r.refresh(),children:n?"检查中…":"检查更新"}),e?(0,_.jsx)("strong",{className:T.default.updateLabel,"data-severity":a?.phase==="failed"?"required":a?.phase==="complete"?"none":p?a?.phase==="unknown"?"unknown":"info":e.advice.severity,children:x||e.advice.label}):null,e?.advice.checkedAt?(0,_.jsxs)("small",{className:T.default.updateChecked,children:["检查于 ",new Date(e.advice.checkedAt).toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"})]}):null]})]}),e?(0,_.jsxs)(_.Fragment,{children:[!g&&!p&&e.advice.targetVersion?(0,_.jsxs)("p",{children:["可更新至 ",e.advice.targetVersion]}):null,!p&&e.reason?(0,_.jsx)("p",{children:e.reason}):null,!p&&e.canInstall?(0,_.jsxs)(_.Fragment,{children:[(0,_.jsx)("div",{className:T.default.updateActions,children:(0,_.jsx)("button",{type:"button",className:T.default.primaryButton,disabled:l||n,onClick:()=>void r.install(),children:"更新 Desktop 插件"})}),(0,_.jsx)("small",{className:T.default.updateChecked,children:"仅更新 Desktop，保留配对与会话；完成后需退出并重新打开。"})]}):null]}):null,a?.phase!=="idle"&&a?(0,_.jsxs)("div",{role:"status","aria-live":"polite",children:[l?(0,_.jsx)("progress",{className:T.default.updateProgress,"aria-label":"Desktop 插件更新中"}):null,a.phase==="restart-required"?(0,_.jsx)("p",{className:T.default.updatePeerNote,children:"任务结束后，选择「应用 → 退出」再打开 Desktop；无需重新配对，Web 不受影响。"}):a.phase!=="complete"?(0,_.jsx)("p",{children:a.message}):null]}):null,o?(0,_.jsx)("p",{role:"alert",children:o}):null]})}var z=require("react");var y=K(Q(),1),i=require("react/jsx-runtime"),oe=r=>r.state==="installed"&&(r.nativeState===void 0||r.nativeState==="installed"),dt=r=>oe(r)?"已安装":r.state==="draft"?"待安装":r.nativeState==="uninstalled"?"未安装":r.nativeState==="disabled"?"已停用":r.state==="pending-restart"?"待重启":"待核对",ke=r=>r.templateId==="designer"||r.id==="designer"?"定制我的助手":r.name;function Je({label:r,children:t}){let e=(0,z.useId)();return(0,i.jsxs)("span",{className:y.default.assistantHelpAnchor,children:[(0,i.jsx)("button",{type:"button",className:y.default.assistantHelpButton,"aria-label":r,"aria-describedby":e,children:"?"}),(0,i.jsx)("span",{id:e,className:y.default.assistantTooltip,role:"tooltip",children:t})]})}function Le({store:r,featureCall:t}){let{catalog:e,preview:a,busy:n,message:d,error:o}=(0,z.useSyncExternalStore)(r.subscribe,r.getSnapshot,r.getSnapshot),l=(0,z.useRef)(),[p,g]=(0,z.useState)(),[x,S]=(0,z.useState)(""),[u,w]=(0,z.useState)(!1),f=(0,z.useRef)(!1),C=(0,z.useRef)(0),D=async s=>{if(!t||f.current)return;f.current=!0;let H=C.current;w(!0);try{let J=await t(s===void 0?{action:"status"}:{action:"group.enabled",enabled:s});if(H!==C.current)return;g(J),S(""),s!==void 0&&r.load()}catch(J){H===C.current&&(g(void 0),S(J instanceof Error?J.message:"暂时无法核对资格。"))}finally{H===C.current&&(f.current=!1,w(!1))}};(0,z.useEffect)(()=>{C.current++,f.current=!1,g(void 0),D();let s=setInterval(()=>void D(),15e3);return()=>{C.current++,f.current=!1,clearInterval(s)}},[t]);let N=p?.features.group_assistant,L=re(p,N),q=L&&p?.groupEnabled===!0;(0,z.useEffect)(()=>{let s=new AbortController;return l.current=s,r.load(),()=>s.abort()},[r]);let I=e?.drafts||[],Z=I.filter(s=>oe(s)&&!s.replacement),ee=I.filter(s=>s.state==="draft"),j=I.filter(s=>s.source!=="builtin"&&s.state!=="draft"&&(!oe(s)||s.replacement)),A=e?.templates||[],ae=s=>Z.find(H=>H.templateId===s),R=s=>void r.start(s.presetId,l.current?.signal),U=s=>s.id==="designer"||s.templateId==="designer"?"先打开定制会话，说清职业和工作习惯；助手会设计可复用的模式。确认安装后，再用新模式开启工作会话。不会自动安装或发送消息。":`先选工作区，再用「${s.name}」开始空白会话。手机连接此电脑后可继续该会话；发卡与提醒需在小程序设置中开启「微信群协作助手」。`,$=s=>{let H=ae(s.id),J=s.builtin,le=I.find(de=>de.templateId===s.id&&de.source==="builtin");return(0,i.jsxs)("article",{className:y.default.assistantChoice,"data-installed":!!H,children:[(0,i.jsxs)("div",{className:y.default.assistantChoiceCopy,children:[(0,i.jsxs)("div",{className:y.default.assistantChoiceHead,children:[(0,i.jsx)("strong",{children:ke(s)}),(0,i.jsx)(Je,{label:`${ke(s)}使用说明`,children:U(s)})]}),(0,i.jsx)("p",{children:s.id==="designer"?"用对话设计适合自己职业的助手模式":s.description})]}),!H&&J?(0,i.jsx)("span",{className:y.default.assistantUnavailable,title:le?.reason||J.reason,children:le?.nativeState==="disabled"?"已停用":"待就绪"}):null,(0,i.jsx)("button",{type:"button",className:y.default.secondaryButton,disabled:n||!!(J&&!H),onClick:()=>H?R(H):J?void r.load():void r.choose(s.id),children:H?s.id==="designer"?"开始定制":"开始使用":J?"开始使用":"安装"})]},s.id)},G=s=>(0,i.jsxs)("div",{className:y.default.assistantEntry,children:[(0,i.jsxs)("div",{className:y.default.assistantEntryHead,children:[(0,i.jsx)("strong",{children:ke(s)}),(0,i.jsx)("span",{children:dt(s)})]}),s.replacement?(0,i.jsxs)("div",{children:[(0,i.jsxs)("p",{children:["已提供内置「",s.replacement.name,"」，无需再装同款独立包。"]}),(0,i.jsx)("p",{children:s.replacement.warning}),s.replacement.canRemoveAfterReview?(0,i.jsxs)("p",{children:["核对旧会话后，可在 DSH 插件列表卸载：",(0,i.jsx)("code",{children:s.replacement.bundleName})]}):null]}):null,oe(s)?(0,i.jsx)("button",{type:"button",className:y.default.assistantSecondary,disabled:n,onClick:()=>R(s),children:"开始使用"}):s.state==="draft"?(0,i.jsx)("button",{type:"button",className:y.default.assistantPrimary,disabled:n,onClick:()=>void r.preview(s.id,s.version),children:"查看并安装"}):(0,i.jsxs)(i.Fragment,{children:[(0,i.jsx)("button",{type:"button",className:y.default.assistantSecondary,disabled:n,onClick:()=>void r.verify(s.id,s.version),children:"刷新状态"}),s.nativeState==="uninstalled"&&!s.replacement?(0,i.jsx)("button",{type:"button",className:y.default.assistantSecondary,disabled:n,onClick:()=>void r.reinstall(s.id,s.version),children:"查看并重新安装"}):null]}),!oe(s)&&s.reason?(0,i.jsxs)("details",{className:y.default.assistantDetails,children:[(0,i.jsx)("summary",{children:"状态说明"}),(0,i.jsx)("p",{children:s.reason})]}):null]},`${s.id}:${s.version}`);return(0,i.jsxs)("section",{className:y.default.assistantsCard,"aria-label":"微信群协作助手","aria-busy":n,children:[(0,i.jsxs)("div",{className:y.default.assistantsHeading,children:[(0,i.jsxs)("div",{className:y.default.assistantChoiceHead,children:[(0,i.jsx)("h3",{children:"微信群协作助手"}),(0,i.jsx)(Je,{label:"电脑助手与手机群协作",children:"需要群协作资格、有效公网访问和剩余流量。开启本节点助手后，再在小程序设置中开启手机入口。暂停不删除资料，不取消 DSH 已开始的任务。"})]}),(0,i.jsx)("button",{type:"button",className:y.default.assistantTextButton,disabled:n||u,onClick:()=>{D(),r.load()},children:n||u?"读取中…":"刷新"})]}),(0,i.jsxs)("div",{className:y.default.clawbotReceiveRow,children:[(0,i.jsxs)("div",{children:[(0,i.jsx)("strong",{children:"启用本节点助手"}),(0,i.jsx)("p",{className:y.default.clawbotNote,role:"status",children:x||(L?p?.groupEnabled?"已开启":"有使用资格，尚未开启":N?.message||"请联网核对资格，在小程序设置中兑换体验码。")})]}),(0,i.jsxs)("label",{className:y.default.clawbotToggle,children:[(0,i.jsx)("input",{type:"checkbox",role:"switch","aria-label":"启用本节点助手",checked:p?.groupEnabled||!1,disabled:u||!t||!L&&!p?.groupEnabled,onChange:s=>void D(s.target.checked)}),(0,i.jsx)("span",{className:y.default.clawbotSwitchTrack,"aria-hidden":!0})]})]}),(0,i.jsxs)("fieldset",{className:y.default.assistantFeatureBody,disabled:!q||u,"aria-label":"助手功能",children:[!e&&!o?(0,i.jsx)("p",{role:"status",children:"正在读取当前电脑的助手…"}):null,e&&!e.native?.supported?(0,i.jsx)("p",{role:"status",children:e.native?.reason||"当前 DSH 暂不支持安装助手，请先检查版本。"}):null,e&&(e.native?.supported||A.some(s=>s.builtin))?(0,i.jsxs)(i.Fragment,{children:[(0,i.jsx)("div",{className:y.default.assistantChoices,children:A.filter(s=>["teacher","project"].includes(s.id)).map($)}),A.some(s=>s.id==="designer")?(0,i.jsx)("div",{className:y.default.assistantCustomize,children:A.filter(s=>s.id==="designer").map($)}):null]}):null,a?(0,i.jsxs)("div",{className:y.default.assistantPreview,"aria-label":"安装助手预览",children:[(0,i.jsxs)("h4",{children:["安装「",a.definition.name,"」"]}),(0,i.jsx)("p",{children:a.definition.description}),(0,i.jsx)("p",{children:"新增一个可选的助手模式，不改默认模式、已有会话和资料。"}),(0,i.jsxs)("details",{className:y.default.assistantDetails,children:[(0,i.jsx)("summary",{children:"查看工作方式与安装详情"}),(0,i.jsx)("p",{children:a.definition.role}),(0,i.jsx)("ul",{children:a.definition.methods.map((s,H)=>(0,i.jsx)("li",{children:s},H))}),(0,i.jsx)("p",{children:"助手会逐步了解："}),(0,i.jsx)("ul",{children:a.definition.onboarding.map(s=>(0,i.jsxs)("li",{children:[s.label,"：",s.prompt]},s.key))}),(0,i.jsxs)("small",{children:["第 ",a.version," 版 · 内容摘要 ",a.digest.slice(0,12)," · 基础模式 ",a.native.basePreset]}),(0,i.jsx)("ul",{children:(a.native.warnings||[]).map((s,H)=>(0,i.jsx)("li",{children:s},H))})]}),(0,i.jsxs)("div",{className:y.default.assistantButtons,children:[(0,i.jsx)("button",{type:"button",className:y.default.assistantPrimary,disabled:n,onClick:()=>void r.install(),children:"确认安装"}),(0,i.jsx)("button",{type:"button",className:y.default.assistantSecondary,disabled:n,onClick:()=>r.dismissPreview(),children:"暂不安装"})]})]}):null,ee.length?(0,i.jsxs)("div",{children:[(0,i.jsx)("h4",{children:"待安装的助手"}),ee.map(G)]}):null,Z.some(s=>!["teacher","project","designer"].includes(s.templateId))?(0,i.jsxs)("div",{children:[(0,i.jsx)("h4",{children:"我已安装的其他助手"}),Z.filter(s=>!["teacher","project","designer"].includes(s.templateId)).map(G)]}):null,j.length||A.some(s=>!["teacher","project","designer"].includes(s.id))?(0,i.jsxs)("details",{className:y.default.assistantDetails,children:[(0,i.jsx)("summary",{children:"更多助手与安装记录"}),e?.native?.supported?(0,i.jsx)("div",{className:y.default.assistantChoices,children:A.filter(s=>!["teacher","project","designer"].includes(s.id)).map($)}):null,j.length?(0,i.jsxs)("details",{className:y.default.assistantDetails,children:[(0,i.jsxs)("summary",{children:["以前安装的助手（",j.length,"）"]}),(0,i.jsx)("p",{children:"旧会话可能仍在使用旧模式；卸载前请核对，聊天与资料不会在这里删除。"}),j.map(G)]}):null]}):null,d?(0,i.jsx)("p",{role:"status",children:d}):null,o?(0,i.jsx)("p",{role:"alert",children:o}):null]})]})}var E=require("react");var v=K(Q(),1),c=require("react/jsx-runtime"),$e={wait:"打开微信首页「＋ → 扫一扫」",scaned:"已扫码，请在微信中确认",need_verifycode:"请输入微信显示的验证码",expired:"绑定码已过期",verify_code_blocked:"验证码暂不可用，请稍后重新绑定",scaned_but_redirect:"请按微信提示继续确认",binded_redirect:"微信已有连接，请核对原节点"},Oe=(r,t)=>!!(r&&["wait","scaned","scaned_but_redirect","need_verifycode"].includes(r.status)&&(r.expiresAt===void 0||r.expiresAt>t)),ct=new Set(["正在继续微信确认流程","请用手机微信扫描二维码并确认连接","请继续完成手机微信中的确认","请输入手机微信显示的数字验证码","二维码已过期，请重新生成。","请用微信扫一扫扫描电脑上的二维码，并在微信中确认。","已暂停接入；DSH 中已经开始的任务不会被取消。","微信已绑定。选择目标会话并开启接入后，即可在 ClawBot 私聊。","微信确认本节点已有绑定。选择会话并开启接入后即可使用。","原微信连接已失效，请重新绑定。","微信连接已失效，请重新绑定。","已移除此节点的本地绑定。未完成的渠道消息已停止续发；电脑上已开始的任务仍会继续。这不是腾讯账号端的撤销授权。"]);function We({call:r,nodeName:t,hostName:e}){let[a,n]=(0,E.useState)(),[d,o]=(0,E.useState)([]),[l,p]=(0,E.useState)(""),[g,x]=(0,E.useState)(!1),[S,u]=(0,E.useState)(""),[w,f]=(0,E.useState)(""),[C,D]=(0,E.useState)(Date.now),N=(0,E.useRef)(a);N.current=a;let L=(0,E.useRef)(!1),q=(0,E.useRef)(!1),I=(0,E.useRef)(null),Z=(0,E.useRef)(null),ee=(0,E.useRef)(null),j=(0,E.useRef)(0),A=async(b,M=!1,V=!1)=>{if((["login.start","login.poll","route"].includes(b.action)||b.action==="enabled"&&b.enabled)&&!re(N.current?.access,N.current?.access))return;let ce=b.action==="login.poll"?Z:ee;if(I.current&&!(b.action==="login.cancel"&&I.current.action==="login.poll")||M&&ce.current)return;let pe={};M?ce.current=pe:(I.current={action:b.action,token:pe},j.current++);let ue=j.current;M||(x(!0),u(""));try{let se=b;if(V){let X=await r({action:"enabled",enabled:!1,expectedRevision:b.expectedRevision});if(!q.current||ue!==j.current)return;if("sessions"in X||X.enabled||X.revision<=(b.expectedRevision??-1)||N.current&&X.revision<N.current.revision)throw new Error("状态已变化，请刷新后重试。");N.current=X,n(X),se={...b,expectedRevision:X.revision}}let te=await r(se);if(!q.current||ue!==j.current)return;if("sessions"in te)o(te.sessions);else{if(N.current&&te.revision<N.current.revision)return;let X=N.current;N.current=te,n(te),u(""),X?.pairing?.id!==te.pairing?.id&&f(""),(!L.current||b.action==="route")&&(L.current=!1,p(te.target?.id||""))}}catch(se){q.current&&ue===j.current&&(b.action!=="login.poll"||N.current?.pairing?.id===b.loginId)&&u(se instanceof Error?se.message:"暂时无法读取状态")}finally{M?ce.current===pe&&(ce.current=null):I.current?.token===pe&&(I.current=null,q.current&&ue===j.current&&x(!1))}};(0,E.useEffect)(()=>{q.current=!0,N.current=void 0,L.current=!1,n(void 0),o([]),p(""),f(""),u(""),A({action:"status"});let b=setInterval(()=>{let M=Date.now();D(M);let V=N.current?.pairing;re(N.current?.access,N.current?.access,M)&&V&&Oe(V,M)&&V.status!=="need_verifycode"&&A({action:"login.poll",loginId:V.id},!0),A({action:"status"},!0)},4e3);return()=>{q.current=!1,j.current++,I.current=null,Z.current=null,ee.current=null,clearInterval(b)}},[r]);let ae=async()=>{await A({action:"status"}),await A({action:"sessions"})},R=a?.pairing,U=Oe(R,C),$=a?.bindingState==="expired",G=!!(a?.paired&&!$),s=re(a?.access,a?.access,C),H=!!(s&&G&&a?.target&&!U),J=a?s?U?"绑定完成后可开启":$?"请重新绑定":G?a?.target?a.enabled?a.state==="ready"?"接收中":a.state==="error"?"连接异常":"连接中":"已暂停":"选择会话后可开启":"绑定后可开启":a.access?.message||"暂时无法核对使用资格":"读取中",le=a?U?R?.status==="wait"?"等待扫码":R?.status==="need_verifycode"?"等待确认码":"等待微信确认":$?"绑定已失效":G?"已绑定此节点":"未绑定":"读取中",de=!!(R&&(U||!G)),Ze=R&&(!U&&R.expiresAt!==void 0&&R.expiresAt<=C?$e.expired:$e[R.status]||"请重新显示绑定码"),ye=new Map;for(let b of d){let M=b.workspaceId||"",V=ye.get(M)||{title:b.workspaceTitle||"未分组",sessions:[]};V.sessions.push(b),ye.set(M,V)}let Ke=b=>!b.title||/^(未命名|新会话|New chat|Untitled)$/i.test(b.title)?`${b.title||"未命名"} · ${b.id.slice(-8)}`:b.title,_e=()=>{!a||!s||U||a.paired&&!window.confirm((a.enabled?"将先暂停私聊接入，再重新绑定当前节点。":"重新绑定当前节点？")+`
微信可能提示替换已有连接，请核对后确认。完成后需手动开启接收。`)||A({action:"login.start",expectedRevision:a.revision},!1,a.paired&&a.enabled)},Ye=()=>{a?.paired&&window.confirm((a.enabled?"将先暂停私聊接入，再移除此节点的绑定。":"移除此节点的绑定？")+`
不会删除会话，也不会解除微信端的授权。`+(a.pending?`
未完成的微信消息将停止处理和发送；电脑上已开始的任务仍会继续，请到原会话查看。`:""))&&A({action:"disconnect",expectedRevision:a.revision,abandonPending:a.pending>0},!1,a.enabled)};return(0,c.jsxs)("section",{className:`${v.default.updateCard} ${v.default.clawbotCard}`,"aria-label":"微信 ClawBot 私聊接线",children:[(0,c.jsxs)("div",{className:v.default.clawbotHead,children:[(0,c.jsxs)("h3",{className:v.default.updateHeading,children:[(0,c.jsx)("span",{className:v.default.clawbotMark,"aria-hidden":!0}),"微信 ClawBot 私聊接线 ",(0,c.jsx)("small",{children:"实验性"})]}),(0,c.jsxs)("button",{type:"button","aria-label":"刷新",className:v.default.clawbotTextButton,disabled:g,onClick:()=>void ae(),children:[(0,c.jsx)("span",{"aria-hidden":!0,children:"↻ "}),"刷新"]})]}),(0,c.jsxs)("p",{className:v.default.clawbotNode,children:["当前节点：",t||"读取中",e?" · "+e:""]}),(0,c.jsxs)("div",{className:v.default.clawbotSection,"aria-label":"节点绑定",children:[(0,c.jsxs)("div",{className:v.default.clawbotRow,children:[(0,c.jsx)("strong",{children:"节点绑定"}),(0,c.jsx)("span",{className:v.default.clawbotStatus,"data-state":U?"pending":$?"expired":G?"paired":"unpaired",role:"status",children:le})]}),de&&R?(0,c.jsxs)("div",{className:v.default.clawbotPairing,children:[U&&R.status==="wait"?(0,c.jsx)("img",{src:R.qrDataUrl,width:"180",height:"180",alt:"微信 ClawBot 节点绑定码"}):null,(0,c.jsxs)("div",{className:v.default.clawbotPairingCopy,children:[(0,c.jsx)("strong",{role:"status",children:Ze}),U&&R.status==="wait"?(0,c.jsx)("p",{className:v.default.clawbotNote,children:"用微信首页扫一扫扫描此码，再确认绑定。此码不是小程序配对码。"}):null,U&&R.status==="need_verifycode"?(0,c.jsxs)("form",{onSubmit:b=>{b.preventDefault(),A({action:"login.poll",loginId:R.id,verifyCode:w}),f("")},children:[(0,c.jsx)("input",{"aria-label":"微信验证码",value:w,autoComplete:"off",inputMode:"numeric",maxLength:16,onChange:b=>f(b.target.value)}),(0,c.jsx)("button",{type:"submit",className:v.default.primaryButton,disabled:!s||g||!/^\d{1,16}$/.test(w),children:"确认验证码"})]}):null,(0,c.jsxs)("div",{className:v.default.clawbotActions,children:[U?null:(0,c.jsx)("button",{type:"button",className:v.default.primaryButton,disabled:!s||g,onClick:_e,children:$?"重新绑定":"重新显示绑定码"}),U?(0,c.jsx)("button",{type:"button",className:v.default.clawbotTextButton,disabled:g&&I.current?.action!=="login.poll",onClick:()=>void A({action:"login.cancel",loginId:R.id}),children:"取消绑定"}):null]})]})]}):G?null:(0,c.jsxs)("div",{className:v.default.clawbotPairingEntry,children:[(0,c.jsx)("p",{className:v.default.clawbotNote,children:"用微信首页「＋ → 扫一扫」扫描此处的 ClawBot 绑定码。"}),(0,c.jsx)("button",{type:"button",className:v.default.primaryButton,disabled:!a||!s||g,onClick:_e,children:$?"重新绑定":"显示绑定码"})]})]}),(0,c.jsxs)("div",{className:v.default.clawbotSection,"aria-label":"微信消息",children:[(0,c.jsx)("div",{className:v.default.clawbotRow,children:(0,c.jsx)("strong",{children:"接入会话"})}),(0,c.jsxs)("div",{className:v.default.clawbotRow,children:[(0,c.jsxs)("select",{"aria-label":"ClawBot 目标会话",value:l,disabled:!a||g&&I.current?.action!=="sessions",onFocus:()=>void A({action:"sessions"}),onChange:b=>{L.current=!0,p(b.target.value)},children:[(0,c.jsx)("option",{value:"",children:"选择已有会话"}),a?.target&&!d.some(b=>b.id===a.target.id)?(0,c.jsx)("option",{value:a.target.id,children:a.target.title}):null,[...ye].map(([b,M])=>(0,c.jsx)("optgroup",{label:M.title,children:M.sessions.map(V=>(0,c.jsx)("option",{value:V.id,children:Ke(V)},V.id))},b))]}),(0,c.jsx)("button",{type:"button",className:v.default.secondaryButton,disabled:!s||!l||!a||g||l===a.target?.id,onClick:()=>void A({action:"route",sessionId:l,expectedRevision:a?.revision}),children:"接到此会话"})]}),(0,c.jsxs)("div",{className:v.default.clawbotReceiveRow,children:[(0,c.jsxs)("div",{children:[(0,c.jsx)("strong",{children:"启用私聊接入"}),(0,c.jsx)("p",{className:v.default.clawbotNote,role:"status",children:J})]}),(0,c.jsxs)("label",{className:v.default.clawbotToggle,children:[(0,c.jsx)("input",{type:"checkbox",role:"switch","aria-label":"启用私聊接入",checked:a?.enabled||!1,disabled:!a||g||!a.enabled&&!H,onChange:b=>void A({action:"enabled",enabled:b.target.checked,expectedRevision:a?.revision})}),(0,c.jsx)("span",{className:v.default.clawbotSwitchTrack,"aria-hidden":!0})]})]}),(0,c.jsx)("p",{className:v.default.clawbotNote,children:"关闭只暂停私聊接入，不解除绑定，也不取消 DSH 已开始的任务。"})]}),a?.message&&!ct.has(a.message)?(0,c.jsx)("p",{className:v.default.clawbotNote,role:"status",children:a.message}):null,a?.uncertain?(0,c.jsxs)("p",{className:v.default.clawbotNote,children:["有 ",a.uncertain," 条消息的处理结果待确认，请到原会话查看。"]}):null,S?(0,c.jsx)("p",{className:v.default.clawbotError,role:"alert",children:S}):null,a?.paired&&!U?(0,c.jsxs)("details",{className:v.default.clawbotManage,children:[(0,c.jsx)("summary",{children:"绑定管理"}),(0,c.jsxs)("div",{className:v.default.clawbotActions,children:[$?null:(0,c.jsx)("button",{type:"button",className:v.default.secondaryButton,disabled:!s||g,onClick:_e,children:"重新绑定"}),(0,c.jsx)("button",{type:"button",className:v.default.clawbotTextButton,disabled:g,onClick:Ye,children:"移除绑定"})]})]}):null]})}var h=require("react/jsx-runtime");function Xe({ok:r,busy:t=!1}){return(0,h.jsx)("span",{className:P.default.statusDot,"data-state":t?"busy":r?"ready":"off","aria-hidden":!0})}function Ce({title:r,detail:t,ok:e,busy:a=!1}){return(0,h.jsxs)("div",{className:P.default.capability,children:[(0,h.jsx)(Xe,{ok:e,busy:a}),(0,h.jsxs)("div",{className:P.default.capabilityCopy,children:[(0,h.jsx)("strong",{children:r}),(0,h.jsx)("span",{children:t})]})]})}function Se({describeHost:r,callManagement:t,store:e=fe(r,t),assistants:a,clawbotCall:n,featureCall:d}){let{loadState:o,qrState:l,status:p,runtime:g,host:x,localOrigin:S,qr:u,error:w}=(0,ve.useSyncExternalStore)(e.subscribe,e.getSnapshot,e.getSnapshot),{refresh:f,generateQr:C}=e,D=(0,ve.useId)(),N=p?.publicRelay,L=N?.state==="enrolling"||N?.state==="connecting",q=N?.remoteAccess?.status,I=N?.state==="online"&&q==="active",Z=q==="suspended"?"账户公网访问已暂停":q==="expired"?"公网访问已到期":q==="not_entitled"?"请在小程序中使用自助开通方式":q!=="active"?"配对后由小程序账户决定":I?"可在外网安全连接":L?"正在准备远程连接":"暂时离线",ee=g?.publicDoor??p?.gate?.publicDoor,j=o==="ready"&&!!p?.lan.ip&&ee?.state==="listening",A=N?.enabled===!0&&N.state!=="disabled",ae=p?.agent?.agentName||x?.agentName||"DeepSeek Harness",R=p?.agent?.hostName||x?.computerName||"当前电脑";return(0,h.jsxs)("section",{className:P.default.root,"aria-labelledby":D,children:[(0,h.jsxs)("div",{className:P.default.hero,children:[(0,h.jsxs)("div",{className:P.default.identity,children:[(0,h.jsx)("span",{className:P.default.mark,"aria-hidden":!0,children:(0,h.jsx)(Ge.FishLogo,{size:28})}),(0,h.jsxs)("div",{className:P.default.identityCopy,children:[(0,h.jsx)("h3",{id:D,children:"微信连接"}),(0,h.jsxs)("p",{children:[ae,(0,h.jsx)("span",{"aria-hidden":!0,children:" · "}),R]})]})]}),(0,h.jsxs)("span",{className:P.default.overall,"data-ready":o==="ready",children:[(0,h.jsx)(Xe,{ok:o==="ready",busy:o==="loading"}),o==="loading"?"检测中":o==="ready"?"服务正常":"暂不可用"]})]}),(0,h.jsxs)("div",{className:P.default.capabilities,children:[(0,h.jsx)(Ce,{title:"局域网直连",detail:o==="loading"?"检测中":j?"已就绪":"暂不可用",ok:j,busy:o==="loading"}),(0,h.jsx)(Ce,{title:"远程访问",detail:Z,ok:I,busy:L||o==="loading"}),(0,h.jsx)(Ce,{title:"账号连接保护",detail:A?"已启用":"配对后启用",ok:A,busy:o==="loading"})]}),w!==null?(0,h.jsxs)("div",{className:P.default.notice,role:"status",children:[(0,h.jsx)("span",{children:w}),(0,h.jsx)("button",{type:"button",onClick:()=>void f(),children:"重试"})]}):null,l==="idle"?(0,h.jsxs)("div",{className:P.default.connectCard,children:[(0,h.jsxs)("div",{children:[(0,h.jsx)("strong",{children:"添加到微信"}),(0,h.jsx)("p",{children:"打开「Agent远程管理助手」→ 添加节点，扫描配对二维码。"})]}),(0,h.jsx)("button",{type:"button",className:P.default.primaryButton,disabled:o!=="ready",onClick:()=>void C(),children:"生成二维码"})]}):(0,h.jsxs)("div",{className:P.default.pairingCard,children:[(0,h.jsxs)("div",{className:P.default.pairingHead,children:[(0,h.jsxs)("div",{children:[(0,h.jsx)("strong",{children:"扫描二维码"}),(0,h.jsx)("p",{children:"小程序「设置 → 添加节点」"})]}),(0,h.jsx)("button",{type:"button",className:P.default.secondaryButton,disabled:l==="loading"||o!=="ready",onClick:()=>void C(),children:l==="loading"?"生成中…":"重新生成"})]}),(0,h.jsxs)("div",{className:P.default.qrArea,children:[o==="ready"&&l==="ready"&&u!==null?(0,h.jsx)("img",{className:P.default.qr,src:u.qrDataUrl,alt:"Agent远程管理助手配对二维码"}):(0,h.jsx)("div",{className:P.default.qrPlaceholder,"aria-live":"polite",children:o!=="ready"?"连接恢复后可查看二维码":l==="expired"?"二维码已过期，请重新生成":l==="error"?"生成失败":"正在生成…"}),l==="ready"&&u!==null?(0,h.jsxs)("small",{className:P.default.qrValidity,children:["有效至 ",new Date(u.expiresAt).toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"})," · 切换页面不重新生成"]}):null]}),(0,h.jsx)("p",{className:P.default.securityNote,children:u?.mode==="public-relay"?"配对后自动选择更快的连接；远程内容端到端加密。":"当前可通过同一局域网连接。"})]}),(0,h.jsxs)("section",{className:P.default.updateCard,"aria-label":"插件更新",children:[(0,h.jsx)("h3",{className:P.default.updateHeading,children:"插件更新"}),S&&e.updates?(0,h.jsx)(Me,{store:e.updates,embedded:!0}):null,g?.profileScope==="desktop"&&e.nativeUpdates?(0,h.jsx)(Fe,{store:e.nativeUpdates,embedded:!0}):null,(0,h.jsx)(be,{describeHost:r,callManagement:t,store:e,compact:!0})]}),a?(0,h.jsx)(Le,{store:a,featureCall:d}):null,n?(0,h.jsx)(We,{call:n,nodeName:ae,hostName:R}):null]})}var we=class{constructor(t,e){this.call=t;this.openSession=e}state={catalog:null,preview:null,busy:!1,message:"",error:""};listeners=new Set;epoch=0;disposed=!1;getSnapshot=()=>this.state;subscribe=t=>(this.listeners.add(t),()=>{this.listeners.delete(t)});set(t){if(!this.disposed){this.state={...this.state,...t};for(let e of this.listeners)e()}}reset=()=>{this.epoch++,this.set({catalog:null,preview:null,busy:!1,message:"",error:""})};dispose=()=>{this.reset(),this.disposed=!0,this.listeners.clear()};async run(t){if(this.disposed||this.state.busy)return;let e=this.epoch,a=()=>!this.disposed&&e===this.epoch;this.set({busy:!0,error:""});try{await t(a)}catch(n){a()&&this.set({error:n instanceof Error?n.message:"操作未完成，请核对状态"})}finally{a()&&this.set({busy:!1})}}async read(t){t()&&this.set({catalog:null});try{let e=await this.call("assistantCatalog",{});if(!t())return;if(e?.schema!=="human.assistants.catalog.v1"||!Array.isArray(e.templates)||!Array.isArray(e.drafts))throw new Error("助手目录格式不受支持");this.set({catalog:e})}catch(e){throw t()&&this.set({message:""}),e}}load=()=>this.run(t=>this.read(t));readyAssistant(t){let e=this.state.catalog?.drafts?.find(a=>a.presetId===t);if(!e||e.state!=="installed"||e.nativeState&&e.nativeState!=="installed")throw new Error("此助手已停用或尚未就绪，请核对下方组件开关。");return e}start=(t,e)=>this.run(async a=>{if(this.set({message:""}),await this.read(a),!(!a()||e?.aborted)){if(this.readyAssistant(t),!this.openSession)throw new Error("当前 DSH 未提供快捷入口，请在新会话中选择此助手模式。");await this.openSession(t,e)}});dismissPreview=()=>{this.state.busy||this.set({preview:null,message:""})};choose=t=>this.run(async e=>{if(this.set({preview:null,message:""}),this.state.catalog?.templates?.find(l=>l.id===t)?.builtin){await this.read(e),e()&&this.set({message:"此助手已包含在插件里，请在新会话中选择；无需另装独立包。"});return}let n=this.state.catalog?.drafts?.find(l=>l.templateId===t&&l.state==="draft");if(n){let l=await this.call("assistantPreview",{id:n.id,version:n.version});e()&&this.set({preview:l});return}let d=await this.call("assistantDraft",{templateId:t});if(!e()||(await this.read(e),!e()))return;let o=await this.call("assistantPreview",{id:d.id,version:d.version});e()&&this.set({preview:o})});preview=(t,e)=>this.run(async a=>{this.set({preview:null});let n=await this.call("assistantPreview",{id:t,version:e});a()&&this.set({preview:n})});reinstall=(t,e)=>this.run(async a=>{if(this.set({preview:null,message:""}),this.state.catalog?.drafts?.some(o=>o.id===t&&o.version===e&&o.replacement)){await this.read(a),a()&&this.set({message:"这个旧模式已有内置版本，请在新会话中选择对应助手，无需重新安装旧包。"});return}let n=await this.call("assistantDraft",{sourceId:t,sourceVersion:e});if(!a()||(await this.read(a),!a()))return;let d=await this.call("assistantPreview",{id:n.id,version:n.version});a()&&this.set({preview:d})});install=()=>this.run(async t=>{let e=this.state.preview;if(!e||e.expiresAt<=Date.now())throw new Error("请重新预览后确认安装");this.set({preview:null,message:"已提交原生安装，请等待结果。"});try{let a=await this.call("assistantInstall",{id:e.id,version:e.version,digest:e.digest,previewId:e.previewId});t()&&this.set({message:a.message||(a.state==="installed"?"原生预设已生效":"请核对原生安装状态")})}finally{t()&&await this.read(t)}});verify=(t,e)=>this.run(async a=>{this.set({catalog:null,message:""});let n=await this.call("assistantStatus",{id:t,version:e});a()&&(this.set({message:n.message||"状态已核对"}),await this.read(a))})};function Qe(r){let t=0,e=!1;return{reset(){t++,e=!1},async start(a,n){if(!/^[a-z][a-z0-9_-]{0,63}$/.test(a))throw new Error("助手身份无效");if(e||n?.aborted)return;let d=t,o=r("uiWorkspace"),l=r("slots"),p=r("configForms")?.developerTools?.enabled?.getSnapshot(),g=l?.entries?.("conversation.hero.agentPreset"),x=Array.isArray(g)&&g.length===1?g[0]:void 0;if(p!==!0||typeof o?.clearMain!="function"||x?.options?.locale!=="settings.agentPreset"||typeof x?.inject!="function")throw new Error("当前 DSH 尚未提供快捷入口，请在原生新会话中选择此助手模式。");let S=x.inject(void 0);if(typeof S?.load!="function"||typeof S?.select!="function"||typeof S?.hooks?.agentPresetSeat?.getSnapshot!="function")throw new Error("当前 DSH 的模式选择入口不兼容，请使用原生新会话入口。");let u=()=>d===t&&!n?.aborted;e=!0;try{if(await S.load(),!u())return;let w=l.entries("conversation.hero.agentPreset");if(!Array.isArray(w)||w.length!==1||w[0]!==x)throw new Error("DSH 的模式入口已更新，请重新点击开始使用。");let f=S.hooks.agentPresetSeat.getSnapshot();if(f.busy||f.error||!f.options?.some(D=>D.id===a))throw new Error("此助手尚未就绪，请刷新状态后重试。");if(r("configForms")?.developerTools?.enabled?.getSnapshot()!==!0)throw new Error("DSH 的工作模式选择已关闭，请在原生设置中开启后重试。");o.clearMain();let C=await S.select(a);if(u()&&C)throw new Error(C)}finally{d===t&&(e=!1)}}}}var pt=["slots","connection"];function ut(r){let t=async(u,w)=>{let f=await r.connection.rpc.call("/wechat-remote-management",u,w??{});if(!f.ok)throw Object.assign(new Error(f.error.message),{code:f.error.code});return f.value},e=async()=>{let u=await r.connection.rpc.call("/api","wechatHost/describe",{args:{request:{}}});if(!u.ok)throw new Error(`wechatHost/describe: ${u.error.code}`);let w=u.value;if(w?.ok!==!0||w.value===void 0)throw new Error("wechatHost/describe returned an invalid result");return w.value},a=new ne(e,t),n=0,d=async u=>{let w=n,f=await r.connection.rpc.call("/api","wechatFeatures/control",{args:{request:u}});if(w!==n)throw new Error("节点连接已变化，请重新核对资格。");if(!f.ok)throw new Error("使用资格服务暂不可用，请更新插件并刷新。");let C=f.value;if(!C?.ok)throw new Error(C?.error?.message||"使用资格核对失败。");return Te(C.value)},o=async u=>{let w=n,f=await r.connection.rpc.call("/api","wechatClawbot/control",{args:{request:u}});if(w!==n)throw new Error("节点连接已变化，请刷新 ClawBot 状态");if(!f.ok)throw new Error("ClawBot 组件暂不可用，请核对下方组件开关");let C=f.value;if(!C?.ok)throw new Error(C?.error?.message||"ClawBot 状态读取失败");return C.value},l=async(u,w)=>{let f=n,C=await r.connection.rpc.call("/api",`humanTools/${u}`,{args:{request:w}});if(f!==n)throw new Error("电脑连接已变化，请重新查看助手目录");if(!C.ok)throw new Error(C.error.message);let D=C.value;if(!D?.ok||typeof D.valueJson!="string"||D.valueJson.length>256*1024)throw new Error(D?.error?.message||"此节点尚未提供助手能力");return JSON.parse(D.valueJson)},p,g=new we(l,async(u,w)=>{if(!p)throw new Error("原生会话入口尚未就绪，请稍后再试。");await p.start(u,w)});r.inject(["uiWorkspace","slots","configForms"],u=>{let w=Qe(f=>u.get(f));p=w,u.effect(()=>()=>{w.reset(),p===w&&(p=void 0)},"wechat assistant navigation")}),r.effect(()=>{let u=r.on("connection/reset",()=>{n++,p?.reset(),g.reset()});return()=>{n++,u(),g.dispose()}},"wechat assistant lifecycle"),r.effect(()=>()=>a.dispose(),"wechat shared page");let x=()=>ze(u=>r.get(u)),S=()=>({describeHost:e,callManagement:t,store:a,assistants:g,clawbotCall:o,featureCall:d});r.slots.inject("settings.section",()=>r.slots.register({name:"settings.section",id:"harness-remote",order:30,label:"微信连接",inject:S},Se));for(let u of["plugins.bundle.activation","plugins.bundle.config"])r.slots.inject(u,()=>{let w=["dsh-wechat-remote","@harness-remote/dsh-wechat-remote"].map(f=>r.slots.register({name:u,key:f,inject:S},u==="plugins.bundle.activation"?be:Se));return()=>w.forEach(f=>f())});r.inject(["pluginNavigation","remote.pluginManager"],()=>r.slots.inject("sidebar.footer.action",()=>r.slots.register({name:"sidebar.footer.action",id:"harness-remote",order:30,label:"微信连接",inject:()=>({openPlugin:x})},Ue)))}

return module.exports;}});
