window.__ModuleLoader__.load({id:"@harness-remote/dsh-wechat-remote",factory:(require)=>{var module={exports:{}};var exports=module.exports;"use strict";var Fe=Object.create;var oe=Object.defineProperty;var Qe=Object.getOwnPropertyDescriptor;var Ze=Object.getOwnPropertyNames;var Ke=Object.getPrototypeOf,Ye=Object.prototype.hasOwnProperty;var et=(r,t)=>()=>(t||r((t={exports:{}}).exports,t),t.exports),tt=(r,t)=>{for(var e in t)oe(r,e,{get:t[e],enumerable:!0})},we=(r,t,e,a)=>{if(t&&typeof t=="object"||typeof t=="function")for(let s of Ze(t))!Ye.call(r,s)&&s!==e&&oe(r,s,{get:()=>t[s],enumerable:!(a=Qe(t,s))||a.enumerable});return r};var $=(r,t,e)=>(e=r!=null?Fe(Ke(r)):{},we(t||!r||!r.__esModule?oe(e,"default",{value:r,enumerable:!0}):e,r)),at=r=>we(oe({},"__esModule",{value:!0}),r);var V=et((pt,ye)=>{"use strict";var rt=`.hr_d233837_root {\r
  box-sizing: border-box;\r
  width: 100%;\r
  max-width: 760px;\r
  color: var(--dsw-alias-label-primary, #171a20);\r
  display: flex;\r
  flex-direction: column;\r
  gap: 14px;\r
}\r
\r
.hr_d233837_hero,\r
.hr_d233837_connectCard,\r
.hr_d233837_pairingCard {\r
  border: 1px solid var(--dsw-alias-border-l2, rgba(128, 140, 160, 0.22));\r
  background: var(--dsw-alias-bg-layer-3, #fff);\r
  border-radius: 12px;\r
}\r
\r
.hr_d233837_hero {\r
  min-height: 72px;\r
  display: flex;\r
  align-items: center;\r
  justify-content: space-between;\r
  gap: 20px;\r
  padding: 16px 18px;\r
}\r
\r
.hr_d233837_identity {\r
  min-width: 0;\r
  display: flex;\r
  align-items: center;\r
  gap: 12px;\r
}\r
\r
.hr_d233837_mark {\r
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
.hr_d233837_identityCopy {\r
  min-width: 0;\r
}\r
\r
.hr_d233837_identityCopy h3,\r
.hr_d233837_identityCopy p,\r
.hr_d233837_connectCard p,\r
.hr_d233837_pairingHead p,\r
.hr_d233837_securityNote {\r
  margin: 0;\r
}\r
\r
.hr_d233837_sidebarButton { display: flex; align-items: center; gap: 10px; width: 100%; min-height: 38px; padding: 8px 12px; border: 0; border-radius: 8px; background: transparent; color: var(--dsw-alias-label-secondary, #4d5564); font: inherit; font-size: 14px; cursor: pointer; text-align: left; }\r
.hr_d233837_sidebarButton:hover { background: var(--dsw-alias-bg-layer-2, #eef1f5); color: var(--dsw-alias-label-primary, #171a20); }\r
.hr_d233837_sidebarButton[data-wide='false'] { width: 36px; min-height: 36px; padding: 8px; justify-content: center; }\r
.hr_d233837_sidebarButton svg { flex: none; }\r
.hr_d233837_sidebarButton:focus-visible { outline: 2px solid var(--dsw-alias-state-business-primary, #4e79ff); outline-offset: 2px; }\r
.hr_d233837_actions { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 16px; }\r
.hr_d233837_pageDialog.hr_d233837_pageDialog { width: min(820px, 100%); max-height: 100%; }\r
.hr_d233837_pageDialogContent.hr_d233837_pageDialogContent { min-height: 0; overflow-y: auto; }\r
.hr_d233837_helpText { color: var(--dsw-alias-label-secondary, #647084); font-size: 12px; line-height: 1.7; margin: 8px 0; }\r
\r
.hr_d233837_companionCard {\r
  border: 1px solid var(--dsw-alias-state-business-primary, #4e79ff);\r
  border-left-width: 4px;\r
  border-radius: 10px;\r
  background: var(--dsw-alias-bg-layer-3, #fff);\r
  padding: 14px 16px;\r
  line-height: 1.6;\r
  overflow-wrap: anywhere;\r
}\r
.hr_d233837_companionCard strong { font-size: 14px; }\r
.hr_d233837_companionCard p { margin: 4px 0; font-size: 13px; }\r
.hr_d233837_companionCard small { color: var(--dsw-alias-label-secondary, #4d5564); }\r
.hr_d233837_companionCard progress { display: block; width: 100%; margin: 8px 0; accent-color: #4e79ff; }\r
.hr_d233837_companionCard[data-state='complete'] { border-color: var(--dsw-alias-state-success-primary, #1f9d68); }\r
.hr_d233837_companionCard[data-state='unavailable'], .hr_d233837_companionCard[data-state='recovering'] { border-color: #b5861d; }

/* Assistant modes are a compact owner-facing catalog, not an installation log. */
.hr_d233837_assistantsCard { padding: 14px 18px; border: 1px solid var(--dsw-alias-border-l2, #e2e6ee); border-radius: 12px; background: var(--dsw-alias-bg-layer-3, #fff); line-height: 1.5; overflow-wrap: anywhere; }
.hr_d233837_assistantsCard h3, .hr_d233837_assistantsCard h4, .hr_d233837_assistantsCard p { margin: 0; }
.hr_d233837_assistantsCard h3 { font-size: 14px; }
.hr_d233837_assistantsCard h4 { font-size: 14px; margin: 16px 0 6px; }
.hr_d233837_assistantsCard p { color: var(--dsw-alias-label-secondary, #647084); font-size: 12px; }
.hr_d233837_assistantsHeading { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 4px; }
.hr_d233837_assistantsHeading p { margin-top: 4px; }
.hr_d233837_assistantChoices { display: flex; flex-direction: column; }
.hr_d233837_assistantChoice { padding: 10px 0; display: flex; align-items: center; gap: 12px; }
.hr_d233837_assistantChoiceCopy { flex: 1; min-width: 0; }
.hr_d233837_assistantChoiceHead, .hr_d233837_assistantEntryHead { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 8px; }
.hr_d233837_assistantChoiceHead { justify-content: flex-start; gap: 6px; }
.hr_d233837_assistantChoiceHead strong { font-size: 13px; }
.hr_d233837_assistantChoice p { flex: 1; }
.hr_d233837_assistantStatus { color: var(--dsw-alias-state-success-primary, #17845b); font-size: 12px; }
.hr_d233837_assistantPrimary, .hr_d233837_assistantSecondary, .hr_d233837_assistantTextButton { min-height: 42px; padding: 9px 16px; border-radius: 9px; font: inherit; font-size: 13px; cursor: pointer; }
.hr_d233837_assistantPrimary { color: #fff; background: var(--dsw-alias-state-business-primary, #4e79ff); border: 1px solid transparent; }
.hr_d233837_assistantSecondary { color: var(--dsw-alias-state-business-primary, #4e79ff); background: var(--dsw-alias-bg-layer-3, #fff); border: 1px solid var(--dsw-alias-border-l2, #d7deed); }
.hr_d233837_assistantTextButton { min-height: 32px; padding: 3px 8px; border: 0; background: transparent; color: var(--dsw-alias-state-business-primary, #4e79ff); }
.hr_d233837_assistantPrimary:disabled, .hr_d233837_assistantSecondary:disabled, .hr_d233837_assistantTextButton:disabled { opacity: .5; cursor: default; }
.hr_d233837_assistantPrimary:focus-visible, .hr_d233837_assistantSecondary:focus-visible, .hr_d233837_assistantTextButton:focus-visible, .hr_d233837_assistantDetails summary:focus-visible { outline: 2px solid var(--dsw-alias-state-business-primary, #4e79ff); outline-offset: 3px; }
.hr_d233837_assistantCustomize { margin-top: 2px; border-top: 1px solid var(--dsw-alias-border-l2, #e2e6ee); }
.hr_d233837_assistantCustomize > p { margin-bottom: 10px; }
.hr_d233837_assistantCustomize .hr_d233837_assistantChoice { background: transparent; }
.hr_d233837_assistantDetails { margin-top: 14px; color: var(--dsw-alias-label-secondary, #647084); font-size: 12px; }
.hr_d233837_assistantDetails summary { padding: 5px 0; cursor: pointer; }
.hr_d233837_assistantDetails ul { margin: 8px 0; padding-left: 20px; }
.hr_d233837_assistantDetails li { margin: 5px 0; }
.hr_d233837_assistantPreview { padding: 14px; margin-top: 16px !important; border-radius: 10px; background: var(--dsw-alias-bg-layer-1, #f0f4ff); }
.hr_d233837_assistantUnavailable { color: var(--dsw-alias-label-secondary, #647084); font-size: 12px; }
.hr_d233837_assistantHelpAnchor { display: inline-flex; position: relative; }
.hr_d233837_assistantHelpButton { padding: 0; width: 17px; height: 17px; border-radius: 50%; border: 1px solid var(--dsw-alias-border-l2, #bec6d2); background: transparent; color: var(--dsw-alias-label-tertiary, #8490a2); font: inherit; font-size: 11px; cursor: help; }
.hr_d233837_assistantTooltip { visibility: hidden; opacity: 0; position: absolute; z-index: 2; top: 24px; left: 0; width: min(300px, 55vw); padding: 10px 12px; border-radius: 8px; border: 1px solid var(--dsw-alias-border-l2, #d7deed); background: var(--dsw-alias-bg-layer-3, #fff); color: var(--dsw-alias-label-secondary, #647084); box-shadow: 0 4px 16px #0002; font-size: 12px; font-weight: normal; }
.hr_d233837_assistantHelpAnchor:hover .hr_d233837_assistantTooltip, .hr_d233837_assistantHelpAnchor:focus-within .hr_d233837_assistantTooltip { visibility: visible; opacity: 1; }
.hr_d233837_assistantPreview h4 { margin-top: 0; }
.hr_d233837_assistantPreview p + p { margin-top: 8px; }
.hr_d233837_assistantButtons { display: flex; gap: 10px; flex-wrap: wrap; margin-top: 14px; }
.hr_d233837_assistantEntry { margin-top: 10px; padding: 12px 0; border-top: 1px solid var(--dsw-alias-border-l2, #e2e6ee); }
.hr_d233837_assistantEntryHead { margin-bottom: 8px; font-size: 13px; }
.hr_d233837_assistantEntryHead > span { color: var(--dsw-alias-label-secondary, #647084); font-size: 12px; }
.hr_d233837_assistantEntry > button + button { margin-left: 8px; }
@media (max-width: 520px) { .hr_d233837_assistantsCard { padding: 12px; } .hr_d233837_assistantChoice { gap: 8px; } }
\r
.hr_d233837_identityCopy h3 {\r
  font-size: 15px;\r
  font-weight: 650;\r
  line-height: 22px;\r
}\r
\r
.hr_d233837_identityCopy p {\r
  color: var(--dsw-alias-label-tertiary, #7d8492);\r
  font-size: 12px;\r
  line-height: 18px;\r
  overflow: hidden;\r
  text-overflow: ellipsis;\r
  white-space: nowrap;\r
}\r
\r
.hr_d233837_overall {\r
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
.hr_d233837_overall[data-ready='true'] {\r
  color: var(--dsw-alias-state-success-primary, #1f9d68);\r
}\r
\r
.hr_d233837_statusDot {\r
  width: 7px;\r
  height: 7px;\r
  background: var(--dsw-alias-label-tertiary, #8b93a2);\r
  border-radius: 999px;\r
  flex: none;\r
}\r
\r
.hr_d233837_statusDot[data-state='ready'] {\r
  background: var(--dsw-alias-state-success-primary, #1f9d68);\r
}\r
\r
.hr_d233837_statusDot[data-state='busy'] {\r
  background: var(--dsw-alias-state-business-primary, #4e79ff);\r
  animation: harnessRemotePulse 1.2s ease-in-out infinite;\r
}\r
\r
.hr_d233837_capabilities {\r
  grid-template-columns: repeat(3, minmax(0, 1fr));\r
  gap: 10px;\r
  display: grid;\r
}\r
\r
.hr_d233837_capability {\r
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
.hr_d233837_capability > .hr_d233837_statusDot {\r
  margin-top: 6px;\r
}\r
\r
.hr_d233837_capabilityCopy {\r
  min-width: 0;\r
  display: flex;\r
  flex-direction: column;\r
  gap: 1px;\r
}\r
\r
.hr_d233837_capabilityCopy strong {\r
  font-size: 12.5px;\r
  font-weight: 600;\r
  line-height: 19px;\r
}\r
\r
.hr_d233837_capabilityCopy span {\r
  color: var(--dsw-alias-label-tertiary, #7d8492);\r
  font-size: 11px;\r
  line-height: 17px;\r
  overflow: hidden;\r
  text-overflow: ellipsis;\r
  white-space: nowrap;\r
}\r
\r
.hr_d233837_notice {\r
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
.hr_d233837_notice button,\r
.hr_d233837_secondaryButton {\r
  border: 1px solid var(--dsw-alias-border-l2, rgba(128, 140, 160, 0.28));\r
  color: var(--dsw-alias-label-primary, #171a20);\r
  background: var(--dsw-alias-bg-layer-1, #f5f6f8);\r
  border-radius: 7px;\r
  font: inherit;\r
  cursor: pointer;\r
}\r
\r
.hr_d233837_notice button {\r
  flex: none;\r
  padding: 3px 9px;\r
}\r
\r
.hr_d233837_connectCard {\r
  display: flex;\r
  align-items: center;\r
  justify-content: space-between;\r
  gap: 20px;\r
  padding: 18px;\r
}\r
\r
.hr_d233837_connectCard strong,\r
.hr_d233837_pairingHead strong {\r
  font-size: 14px;\r
  font-weight: 650;\r
  line-height: 21px;\r
}\r
\r
.hr_d233837_connectCard p,\r
.hr_d233837_pairingHead p {\r
  max-width: 470px;\r
  color: var(--dsw-alias-label-tertiary, #7d8492);\r
  font-size: 12px;\r
  line-height: 18px;\r
}\r
\r
.hr_d233837_primaryButton {\r
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
.hr_d233837_primaryButton:hover {\r
  filter: brightness(1.04);\r
}\r
\r
.hr_d233837_primaryButton:focus-visible,\r
.hr_d233837_secondaryButton:focus-visible,\r
.hr_d233837_notice button:focus-visible {\r
  outline: 2px solid var(--dsw-alias-state-business-primary, #4e79ff);\r
  outline-offset: 2px;\r
}\r
\r
.hr_d233837_pairingCard {\r
  padding: 18px;\r
}\r
\r
.hr_d233837_pairingHead {\r
  display: flex;\r
  align-items: center;\r
  justify-content: space-between;\r
  gap: 16px;\r
}\r
\r
.hr_d233837_secondaryButton {\r
  min-height: 32px;\r
  flex: none;\r
  padding: 0 11px;\r
  font-size: 12px;\r
}\r
\r
.hr_d233837_secondaryButton:disabled,\r
.hr_d233837_primaryButton:disabled {\r
  cursor: default;\r
  opacity: 0.55;\r
}\r
\r
.hr_d233837_qrArea {\r
  min-height: 292px;\r
  margin-top: 16px;\r
  display: flex;\r
  flex-direction: column;\r
  align-items: center;\r
  justify-content: center;\r
  gap: 10px;\r
}\r
\r
.hr_d233837_qr,\r
.hr_d233837_qrPlaceholder {\r
  box-sizing: border-box;\r
  width: 280px;\r
  height: 280px;\r
  border-radius: 12px;\r
}\r
\r
.hr_d233837_qr {\r
  background: #fff;\r
  padding: 10px;\r
  image-rendering: pixelated;\r
}\r
\r
.hr_d233837_qrPlaceholder {\r
  color: var(--dsw-alias-label-tertiary, #7d8492);\r
  background: var(--dsw-alias-bg-layer-1, #f5f6f8);\r
  border: 1px dashed var(--dsw-alias-border-l2, rgba(128, 140, 160, 0.28));\r
  display: grid;\r
  place-items: center;\r
  font-size: 12px;\r
}\r
\r
.hr_d233837_qrValidity {\r
  color: var(--dsw-alias-label-tertiary, #7d8492);\r
  font-size: 11px;\r
  line-height: 17px;\r
}\r
\r
.hr_d233837_securityNote {\r
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
  .hr_d233837_statusDot[data-state='busy'] {\r
    animation: none;\r
  }\r
}\r
\r
@media (max-width: 680px) {\r
  .hr_d233837_capabilities {\r
    grid-template-columns: minmax(0, 1fr);\r
  }\r
\r
  .hr_d233837_connectCard {\r
    align-items: stretch;\r
    flex-direction: column;\r
  }\r
\r
  .hr_d233837_primaryButton {\r
    width: 100%;\r
  }\r
\r
  .hr_d233837_qrArea {\r
    flex-direction: column;\r
    gap: 12px;\r
  }\r
\r
}\r
.hr_d233837_updateCard { border: 1px solid var(--dsw-alias-border-l2, #ddd); background: var(--dsw-alias-bg-layer-3, #fff); border-radius: 12px; padding: 14px 18px; line-height: 1.5; font-size: 13px; overflow-wrap: anywhere; }
.hr_d233837_updateHeading { font-size: 14px; line-height: 21px; margin: 0 0 8px; }
.hr_d233837_updateRow { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 8px 16px; }
.hr_d233837_updateCopy { flex: 1 1 240px; min-width: 0; }
.hr_d233837_updateControl { display: flex; flex-direction: column; align-items: flex-end; gap: 2px; max-width: 100%; }
.hr_d233837_updateControl .hr_d233837_updateLabel { font-size: 12px; font-weight: 500; }
.hr_d233837_updateControl .hr_d233837_updateChecked { margin-top: 0; }
.hr_d233837_updateRow > .hr_d233837_updateActions { margin-top: 0; }
.hr_d233837_updateEndpoint p, .hr_d233837_companionInline p { margin: 4px 0; }
.hr_d233837_updateScope { color: var(--dsw-alias-label-tertiary, #7d8492); font-size: 12px; font-weight: 400; }
.hr_d233837_updateEndpoint + div { margin-top: 10px; padding-top: 10px; border-top: 1px solid var(--dsw-alias-border-l2, #ddd); }
.hr_d233837_updateActions { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; margin-top: 8px; }
.hr_d233837_updateActions .hr_d233837_primaryButton { width: auto; min-height: 32px; padding: 0 12px; }
.hr_d233837_updateActions .hr_d233837_secondaryButton { min-height: 32px; }
.hr_d233837_updatePeerNote { margin: 0; color: var(--dsw-alias-label-tertiary, #7d8492); font-size: 12px; }
.hr_d233837_updateDetails { color: var(--dsw-alias-label-secondary, #647084); font-size: 12px; }
.hr_d233837_updateDetails summary { cursor: pointer; margin-top: 4px; }
.hr_d233837_companionInline strong { font-size: 13px; font-weight: 500; }
.hr_d233837_companionInline small { display: block; color: var(--dsw-alias-label-secondary, #647084); font-size: 12px; margin-top: 4px; }
.hr_d233837_companionInline progress { display: block; width: 100%; height: 8px; margin: 8px 0; accent-color: var(--dsw-alias-state-business-primary, #4e79ff); }
.hr_d233837_companionInline[data-state='complete'] .hr_d233837_updateCopy > strong { color: var(--dsw-alias-state-success-primary, #1f9d68); }
.hr_d233837_companionInline[data-state='unavailable'] .hr_d233837_updateCopy > strong, .hr_d233837_companionInline[data-state='recovering'] .hr_d233837_updateCopy > strong { color: #b5861d; }
.hr_d233837_updateLabel { color: inherit; }\r
.hr_d233837_updateLabel[data-severity="none"] { color: #218b5c; }\r
.hr_d233837_updateLabel[data-severity="unknown"] { color: var(--text-secondary, #858b96); }\r
.hr_d233837_updateLabel[data-severity="required"] { color: #d54052; }\r
.hr_d233837_updateLabel[data-severity="recommended"], .hr_d233837_updateLabel[data-severity="info"] { color: #b5861d; }\r
.hr_d233837_updateProgress { width: 100%; height: 8px; margin-top: 8px; accent-color: #7487ef; }
.hr_d233837_updateVersions { display: flex; flex-wrap: wrap; gap: 4px 16px; margin: 6px 0; }
.hr_d233837_updateVersions span { color: var(--text-secondary, #858b96); }\r
.hr_d233837_updateVersions strong { color: var(--text-primary, inherit); font-weight: 500; }\r
.hr_d233837_updateCommand { display: flex; flex-wrap: wrap; align-items: center; gap: 12px; margin-top: 12px; }\r
.hr_d233837_updateCommand code { flex: 1 1 240px; white-space: pre-wrap; overflow-wrap: anywhere; user-select: text; }\r
.hr_d233837_updateChecked { display: block; margin-top: 4px; color: var(--text-secondary, #858b96); font-size: 11px; }
.hr_d233837_clawbotCard { color: var(--dsw-alias-label-primary, #171a20); }
.hr_d233837_clawbotHead, .hr_d233837_clawbotRow, .hr_d233837_clawbotReceiveRow { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.hr_d233837_clawbotHead h3 { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; margin: 0; }
.hr_d233837_clawbotHead small { font-size: 11px; font-weight: normal; color: var(--dsw-alias-label-tertiary, #7d8492); }
.hr_d233837_clawbotRow { margin: 10px 0; flex-wrap: wrap; }
.hr_d233837_clawbotNode { margin: 8px 0 0; font-size: 12px; overflow-wrap: anywhere; color: var(--dsw-alias-label-secondary, #647084); }
.hr_d233837_clawbotSection { margin-top: 18px; }
.hr_d233837_clawbotSection + .hr_d233837_clawbotSection { border-top: 1px solid var(--dsw-alias-border-l2, #ddd); padding-top: 8px; }
.hr_d233837_clawbotStatus { display: inline-flex; align-items: center; gap: 6px; font-size: 12px; color: var(--dsw-alias-label-secondary, #647084); }
.hr_d233837_clawbotStatus::before { content: ''; width: 6px; height: 6px; border-radius: 50%; background: currentColor; }
.hr_d233837_clawbotStatus[data-state='paired'] { color: var(--dsw-alias-state-success-primary, #218b5c); }
.hr_d233837_clawbotStatus[data-state='pending'] { color: var(--dsw-alias-state-business-primary, #4e79ff); }
.hr_d233837_clawbotStatus[data-state='expired'] { color: var(--dsw-alias-state-warning-primary, #a97513); }
.hr_d233837_clawbotPairingEntry { display: flex; align-items: center; flex-wrap: wrap; justify-content: space-between; gap: 8px 16px; }
.hr_d233837_clawbotRow select { box-sizing: border-box; flex: 1 1 180px; min-width: 0; max-width: 100%; min-height: 36px; border: 1px solid var(--dsw-alias-border-l2, #ddd); border-radius: 8px; padding: 7px 9px; color: inherit; background: var(--dsw-alias-bg-layer-3, #fff); font: inherit; }
.hr_d233837_clawbotReceiveRow { margin-top: 16px; }
.hr_d233837_clawbotReceiveRow .hr_d233837_clawbotNote { margin: 3px 0 0; }
.hr_d233837_clawbotToggle { display: inline-flex; position: relative; flex: 0 0 42px; width: 42px; height: 26px; align-items: center; cursor: pointer; }
.hr_d233837_clawbotToggle input { position: absolute; inset: 0; width: 100%; height: 100%; opacity: 0; margin: 0; z-index: 1; cursor: pointer; }
.hr_d233837_clawbotSwitchTrack { width: 42px; height: 24px; border-radius: 999px; background: var(--dsw-alias-bg-layer-4, #a6afbd); transition: background 150ms ease; }
.hr_d233837_clawbotSwitchTrack::after { content: ''; display: block; width: 18px; height: 18px; margin: 3px; border-radius: 50%; background: #fff; box-shadow: 0 1px 3px rgb(0 0 0 / 18%); transition: transform 150ms ease; }
.hr_d233837_clawbotToggle input:checked + .hr_d233837_clawbotSwitchTrack { background: var(--dsw-alias-state-business-primary, #4e79ff); }
.hr_d233837_clawbotToggle input:checked + .hr_d233837_clawbotSwitchTrack::after { transform: translateX(18px); }
.hr_d233837_clawbotToggle input:disabled { cursor: default; }
.hr_d233837_clawbotToggle input:disabled + .hr_d233837_clawbotSwitchTrack { opacity: .45; }
.hr_d233837_clawbotToggle input:focus-visible + .hr_d233837_clawbotSwitchTrack, .hr_d233837_clawbotTextButton:focus-visible, .hr_d233837_clawbotManage summary:focus-visible, .hr_d233837_clawbotRow select:focus-visible { outline: 2px solid var(--dsw-alias-state-business-primary, #4e79ff); outline-offset: 3px; }
.hr_d233837_clawbotNote { font-size: 12px; line-height: 1.6; color: var(--dsw-alias-label-secondary, #647084); margin: 8px 0; }
.hr_d233837_clawbotError { color: var(--dsw-alias-state-error-primary, #b23b36); font-size: 13px; }
.hr_d233837_clawbotPairing { display: flex; align-items: center; gap: 20px; flex-wrap: wrap; margin-top: 12px; }
.hr_d233837_clawbotPairing img { display: block; flex: none; max-width: 100%; height: auto; border-radius: 8px; background: #fff; }
.hr_d233837_clawbotPairingCopy { flex: 1 1 200px; min-width: 0; }
.hr_d233837_clawbotPairingCopy form { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; margin-top: 12px; }
.hr_d233837_clawbotPairing input { border: 1px solid var(--dsw-alias-border-l2, #ddd); border-radius: 6px; padding: 8px; width: 120px; max-width: 100%; color: inherit; background: transparent; }
.hr_d233837_clawbotActions { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; margin-top: 10px; }
.hr_d233837_clawbotTextButton { padding: 4px 0; border: 0; color: var(--dsw-alias-state-business-primary, #4e79ff); background: transparent; font: inherit; font-size: 12px; cursor: pointer; }
.hr_d233837_clawbotTextButton:disabled { opacity: .5; cursor: default; }
.hr_d233837_clawbotManage { margin-top: 16px; color: var(--dsw-alias-label-secondary, #647084); font-size: 12px; }
.hr_d233837_clawbotManage summary { width: fit-content; padding: 4px 0; cursor: pointer; }
.hr_d233837_clawbotManage .hr_d233837_clawbotActions { margin-top: 6px; gap: 14px; }
.hr_d233837_clawbotMark { display: inline-flex; flex: 0 0 22px; width: 22px; height: 22px; border-radius: 50%; background: #e54443; align-items: center; justify-content: center; gap: 3px; }
.hr_d233837_clawbotMark::before, .hr_d233837_clawbotMark::after { content: ''; display: block; width: 5px; height: 5px; border-radius: 50%; background: #fff; }
@media (prefers-reduced-motion: reduce) {
  .hr_d233837_clawbotSwitchTrack, .hr_d233837_clawbotSwitchTrack::after { transition: none; }
}
`,_e="@harness-remote/dsh-wechat-remote/HarnessRemoteSettings.module.css";if(typeof document<"u"&&document.querySelector("style[data-plugin-css="+JSON.stringify(_e)+"]")===null){let r=document.createElement("style");r.dataset.plugin="@harness-remote/dsh-wechat-remote",r.dataset.pluginCss=_e,r.textContent=rt,document.head.appendChild(r)}ye.exports={root:"hr_d233837_root",hero:"hr_d233837_hero",connectCard:"hr_d233837_connectCard",pairingCard:"hr_d233837_pairingCard",identity:"hr_d233837_identity",mark:"hr_d233837_mark",identityCopy:"hr_d233837_identityCopy",pairingHead:"hr_d233837_pairingHead",securityNote:"hr_d233837_securityNote",sidebarButton:"hr_d233837_sidebarButton",actions:"hr_d233837_actions",pageDialog:"hr_d233837_pageDialog",pageDialogContent:"hr_d233837_pageDialogContent",helpText:"hr_d233837_helpText",companionCard:"hr_d233837_companionCard",assistantsCard:"hr_d233837_assistantsCard",assistantsHeading:"hr_d233837_assistantsHeading",assistantChoices:"hr_d233837_assistantChoices",assistantChoice:"hr_d233837_assistantChoice",assistantChoiceCopy:"hr_d233837_assistantChoiceCopy",assistantChoiceHead:"hr_d233837_assistantChoiceHead",assistantEntryHead:"hr_d233837_assistantEntryHead",assistantStatus:"hr_d233837_assistantStatus",assistantPrimary:"hr_d233837_assistantPrimary",assistantSecondary:"hr_d233837_assistantSecondary",assistantTextButton:"hr_d233837_assistantTextButton",assistantDetails:"hr_d233837_assistantDetails",assistantCustomize:"hr_d233837_assistantCustomize",assistantPreview:"hr_d233837_assistantPreview",assistantUnavailable:"hr_d233837_assistantUnavailable",assistantHelpAnchor:"hr_d233837_assistantHelpAnchor",assistantHelpButton:"hr_d233837_assistantHelpButton",assistantTooltip:"hr_d233837_assistantTooltip",assistantButtons:"hr_d233837_assistantButtons",assistantEntry:"hr_d233837_assistantEntry",overall:"hr_d233837_overall",statusDot:"hr_d233837_statusDot",capabilities:"hr_d233837_capabilities",capability:"hr_d233837_capability",capabilityCopy:"hr_d233837_capabilityCopy",notice:"hr_d233837_notice",secondaryButton:"hr_d233837_secondaryButton",primaryButton:"hr_d233837_primaryButton",qrArea:"hr_d233837_qrArea",qr:"hr_d233837_qr",qrPlaceholder:"hr_d233837_qrPlaceholder",qrValidity:"hr_d233837_qrValidity",updateCard:"hr_d233837_updateCard",updateHeading:"hr_d233837_updateHeading",updateRow:"hr_d233837_updateRow",updateCopy:"hr_d233837_updateCopy",updateControl:"hr_d233837_updateControl",updateLabel:"hr_d233837_updateLabel",updateChecked:"hr_d233837_updateChecked",updateActions:"hr_d233837_updateActions",updateEndpoint:"hr_d233837_updateEndpoint",companionInline:"hr_d233837_companionInline",updateScope:"hr_d233837_updateScope",updatePeerNote:"hr_d233837_updatePeerNote",updateDetails:"hr_d233837_updateDetails",updateProgress:"hr_d233837_updateProgress",updateVersions:"hr_d233837_updateVersions",updateCommand:"hr_d233837_updateCommand",clawbotCard:"hr_d233837_clawbotCard",clawbotHead:"hr_d233837_clawbotHead",clawbotRow:"hr_d233837_clawbotRow",clawbotReceiveRow:"hr_d233837_clawbotReceiveRow",clawbotNode:"hr_d233837_clawbotNode",clawbotSection:"hr_d233837_clawbotSection",clawbotStatus:"hr_d233837_clawbotStatus",clawbotPairingEntry:"hr_d233837_clawbotPairingEntry",clawbotNote:"hr_d233837_clawbotNote",clawbotToggle:"hr_d233837_clawbotToggle",clawbotSwitchTrack:"hr_d233837_clawbotSwitchTrack",clawbotTextButton:"hr_d233837_clawbotTextButton",clawbotManage:"hr_d233837_clawbotManage",clawbotError:"hr_d233837_clawbotError",clawbotPairing:"hr_d233837_clawbotPairing",clawbotPairingCopy:"hr_d233837_clawbotPairingCopy",clawbotActions:"hr_d233837_clawbotActions",clawbotMark:"hr_d233837_clawbotMark"}});var lt={};tt(lt,{apply:()=>ot,inject:()=>it});module.exports=at(lt);var Ne=require("react"),Pe=require("@deepseek-ai/dsh-client-ui-primitives");var j=$(V(),1),y=require("react/jsx-runtime");function xe({value:r,onDecide:t,deciding:e=!1,compact:a=!1}){if(!r||!a&&r.state==="idle")return null;let s={"confirmation-required":"是否更新下方指定端的插件？",deferred:"已暂缓此次联动更新",pending:"联动更新待处理",busy:"等待待更新端的任务结束",preparing:"正在准备联动更新",installing:"正在安装插件更新",verifying:"正在核验更新后的恢复状态",recovering:"正在恢复更新前的插件","restart-required":"待更新端需启动或重启确认","self-restart-required":"当前端待重启，尚未生效",unverified:"两端更新状态待核实",complete:"两端插件已对齐",unavailable:"联动更新尚未确认成功"},o=["preparing","installing","verifying","recovering"].includes(r.state),d=r.versions?.peer==="desktop"?"Desktop":r.versions?.peer==="web"?"Web":null,l=r.target?.scope==="desktop"?"Desktop":r.target?.scope==="web"?"Web":null,h=l||"更新端",g={pending:`等待 ${h} 就绪`,busy:`${h} 有任务，等待空闲`,preparing:`正在准备 ${h} 更新`,installing:`正在更新 ${h}`,verifying:`正在核对 ${h} 更新结果`,recovering:`正在恢复 ${h} 原版本`,"restart-required":`${h} 已安装，待启动或重连确认`,"self-restart-required":"当前端待重启，尚未生效",unverified:"更新状态待核对",complete:"两端版本已同步",unavailable:"更新未完成，请核对"},w=["confirmation-required","deferred"].includes(r.state);if(a&&r.state==="idle"&&!r.versions?.peerInstalled)return(0,y.jsx)("p",{className:j.default.updatePeerNote,children:"未检测到可同步更新的另一端；当前端可独立使用。"});let p=r.state==="idle"?"未发现待确认的同步更新":a&&w&&l&&r.target?`${l} 可更新至 ${r.target.version}${r.state==="deferred"?" · 已暂缓":""}`:a&&r.state==="self-restart-required"?"当前端重启后可检查同步更新":(a?g[r.state]:void 0)||s[r.state]||"插件更新状态待核对",f=w&&r.offerId&&t?(0,y.jsxs)("div",{className:j.default.updateActions,children:[(0,y.jsx)("button",{type:"button",className:j.default.primaryButton,disabled:e,onClick:()=>t("approve"),children:e?"确认中…":l?`确认更新 ${l}`:"确认更新指定端"}),(0,y.jsx)("button",{type:"button",className:j.default.secondaryButton,disabled:e,onClick:()=>t("later"),children:"稍后再说"})]}):null;return(0,y.jsxs)("aside",{className:a?j.default.companionInline:j.default.companionCard,"data-state":r.state,role:"status","aria-live":"polite",children:[a?(0,y.jsxs)("div",{className:j.default.updateRow,children:[(0,y.jsxs)("div",{className:j.default.updateCopy,children:[d?(0,y.jsxs)("div",{className:j.default.updateVersions,children:[(0,y.jsxs)("strong",{children:[d," ",(0,y.jsx)("span",{className:j.default.updateScope,children:"同一主机"})]}),(0,y.jsx)("span",{children:r.versions?.peerInstalled?`已安装 ${r.versions.peerInstalled}`:"安装或启用状态未确认"})]}):null,(0,y.jsx)("strong",{children:p})]}),f]}):(0,y.jsx)("strong",{children:p}),a?(0,y.jsx)(y.Fragment,{children:r.state!=="idle"&&r.message?(0,y.jsxs)("details",{className:j.default.updateDetails,children:[(0,y.jsx)("summary",{children:"详细状态"}),(0,y.jsx)("p",{children:r.message})]}):null}):r.message?(0,y.jsx)("p",{children:r.message}):null,!a&&r.versions?(0,y.jsxs)("small",{children:[r.versions.current==="desktop"?"Desktop":"Web","：运行 ",r.versions.running," · 已安装 ",r.versions.installed??"未确认","；",d,"：已安装 ",r.versions.peerInstalled??"未确认或未启用"]}):null,f?(0,y.jsxs)(y.Fragment,{children:[a?null:f,(0,y.jsx)("small",{className:j.default.updateChecked,children:"空闲后更新，连接会短暂中断；保留配对与会话。"})]}):null,o?(0,y.jsx)("progress",{"aria-label":"联动更新进度"}):null,r.state==="busy"?(0,y.jsx)("small",{children:"不用手动停止任务。请保持两端运行，空闲后会继续检查。"}):o?(0,y.jsx)("small",{children:"请保持两端当前状态，暂勿退出、重启或重复安装。关闭本设置页不会取消更新。"}):r.state==="unavailable"?(0,y.jsx)("small",{children:"请在待更新端核对版本，必要时使用其原安装入口。"}):null]})}async function ke(r,t,e=fetch){let a=await r(),s=a.gate;if(!s)throw new Error("当前节点没有提供配对入口");let o=s.profileScope==="desktop",d=s.localDoor?.port,l=Number.isSafeInteger(d)&&d>=1&&d<=65535?`http://127.0.0.1:${d}`:null;if(s.management==="authenticated-rpc")return{host:a,runtime:s,localOrigin:o?null:l,status:()=>t("status"),pairCode:()=>t("pair-code"),decide:(g,w)=>t("companion-decision",{offerId:g,action:w})};if(o||s.management==="unavailable"||!l||s.localDoor.state!=="listening")throw new Error("当前节点配对入口尚未就绪");let h=async g=>{let w=await e(l+g,{cache:"no-store"});if(!w.ok)throw new Error(`配对请求失败 (${w.status})`);return w.json()};return{host:a,runtime:s,localOrigin:l,status:()=>h("/gate/status"),pairCode:()=>h("/pair/code"),decide:async(g,w)=>{let p=await e(l+"/gate/companion/decision",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({offerId:g,action:w})});if(!p.ok)throw new Error("更新通知已变化，请刷新后重试");return p.json()}}}var le=class{constructor(t,e=globalThis.fetch){this.origin=t;this.fetcher=e.bind(globalThis)}value={check:null,checking:!1,progress:null,error:"",copied:!1,resumeFailed:!1};listeners=new Set;reading;installing=!1;disposed=!1;job=null;timer;pollGeneration=0;recovering=!1;fetcher;getSnapshot=()=>this.value;subscribe=t=>this.disposed?()=>{}:(this.listeners.add(t),this.listeners.size===1&&this.refresh(),()=>{this.listeners.delete(t)});patch(t){if(!this.disposed){this.value={...this.value,...t};for(let e of this.listeners)e()}}refresh=()=>this.disposed?Promise.resolve():this.reading?this.reading:(this.patch({checking:!0,error:"",copied:!1}),this.reading=(async()=>{try{let t=await this.fetcher(this.origin+"/gate/update/check",{signal:AbortSignal.timeout(1e4)}),e=await t.json();if(!t.ok)throw new Error(e.error||"暂时无法检查更新");if(!e.advice?.current||typeof e.advice.label!="string")throw new Error("更新检查返回信息不完整");if(this.patch({check:e}),this.installing||this.job||this.recovering)return;e.activeJob?.statusOrigin?this.follow(e.activeJob):e.lastResult?.phase==="unknown"?this.patch({progress:e.lastResult}):e.mode==="busy"?this.patch({progress:{phase:"preparing",progress:0,message:"更新仍在准备或等待确认，请稍后重新检查；不要重复安装。",terminal:!0}}):this.patch({progress:e.lastResult??null})}catch(t){this.patch({check:null,error:t instanceof Error?t.message:"暂时无法检查更新"})}finally{this.patch({checking:!1})}})().finally(()=>{this.reading=void 0}),this.reading);follow(t){if(this.disposed||this.job?.jobId===t.jobId)return;this.job=t;let e=++this.pollGeneration,a=Date.now()+10*6e4;clearTimeout(this.timer),this.patch({progress:{phase:"recovering",progress:0,message:"正在恢复更新进度…",terminal:!1}});let s=async()=>{if(this.disposed||e!==this.pollGeneration)return;let o;try{let d=await this.fetcher(t.statusOrigin+"/status",{headers:{Authorization:"Bearer "+t.statusToken},signal:AbortSignal.timeout(4e3)});if(!d.ok)throw new Error("进度暂不可用");let l=await d.json();if(l.jobId!==t.jobId||typeof l.terminal!="boolean"||typeof l.message!="string")throw new Error("进度不匹配");o=l}catch{try{let d=await this.fetcher(this.origin+"/gate/update/status",{signal:AbortSignal.timeout(3e3)}),l=await d.json();d.ok&&l.lastResult?.jobId===t.jobId&&(o=l.lastResult)}catch{}}if(!(this.disposed||e!==this.pollGeneration)){if(o&&(this.patch({progress:o}),o.terminal)){this.job=null,o.ok?this.resume(t.jobId):this.refresh();return}if(Date.now()>a){this.job=null,this.patch({progress:{phase:"unknown",progress:0,message:"暂时无法确认更新结果。请重新打开此主机 WebUI 检查版本；不要重复安装或删除节点。",terminal:!0}});return}this.timer=setTimeout(()=>void s(),1e3)}};s()}async resume(t){this.recovering=!0;let e=Date.now()+3e4,a=async()=>{try{let s=await this.fetcher(this.origin+"/gate/update/resume?job="+encodeURIComponent(t),{signal:AbortSignal.timeout(3e3)});if(!s.ok)throw new Error("尚未恢复");let o=await s.json();if(!o.url)throw new Error("缺少恢复地址");let d=new URL(o.url);if(d.origin!==window.location.origin||d.pathname!=="/"||d.username||d.password||d.hash)throw new Error("恢复地址不匹配");this.disposed||window.location.replace(d.href)}catch{if(this.disposed)return;if(Date.now()>=e){this.recovering=!1,this.patch({resumeFailed:!0});return}this.timer=setTimeout(()=>void a(),1e3)}};await a()}install=async()=>{let{check:t,checking:e,error:a,progress:s}=this.value;if(this.disposed||!t?.canInstall||e||a||s&&!s.terminal||this.installing||this.job||this.recovering)return;this.installing=!0,this.patch({error:"",check:{...t,canInstall:!1,ticket:""},progress:{phase:"download",progress:10,message:"正在下载并验证更新包；当前插件尚未替换",terminal:!1}});let o=!1;try{let d=await this.fetcher(this.origin+"/gate/update/start",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({ticket:t.ticket})}),l=await d.json();if(o=!d.ok&&typeof l.error=="string",!d.ok||!l.statusOrigin)throw new Error(l.error||"无法取得更新进度，请重新检查");this.follow(l)}catch(d){if(this.disposed)return;if(o)this.patch({progress:{phase:"failed",progress:0,message:(d instanceof Error?d.message:"更新暂不可用")+"。请重新检查更新。",terminal:!0,ok:!1}});else{try{let l=await this.fetcher(this.origin+"/gate/update/status",{signal:AbortSignal.timeout(3e3)}),h=await l.json();if(l.ok&&h.activeJob?.statusOrigin){this.follow(h.activeJob);return}}catch{}this.patch({progress:{phase:"unknown",progress:0,message:"连接中断，暂时无法确认更新结果。请稍后检查更新；不要重复安装或删除节点。",terminal:!0}})}}finally{this.installing=!1}};copyCommand=async()=>{if(!(!this.value.check?.manualCommand||this.value.checking||this.installing||this.job))try{await navigator.clipboard.writeText(this.value.check.manualCommand),this.patch({copied:!0})}catch{this.patch({error:"复制失败，请手动选中下方命令复制。"})}};dispose=()=>{this.disposed=!0,this.pollGeneration++,clearTimeout(this.timer),this.listeners.clear()}};var de=class{constructor(t){this.call=t}value={checking:!1,starting:!1,check:null,status:null,error:null};listeners=new Set;reading;timer;disposed=!1;checkRevision=0;checkInvalidated=!1;getSnapshot=()=>this.value;patch(t){if(!this.disposed){this.value={...this.value,...t};for(let e of this.listeners)e()}}subscribe=t=>this.disposed?()=>{}:(this.listeners.add(t),this.checkInvalidated?(this.refreshInvalidatedCheck(),this.active()&&this.poll()):!this.value.check&&!this.value.starting?this.refresh():this.active()&&this.poll(),()=>{this.listeners.delete(t),this.listeners.size||(clearTimeout(this.timer),this.timer=void 0)});active(){return this.value.status&&["preparing","installing","unknown","restart-required"].includes(this.value.status.phase)}invalidateCheck=()=>{this.disposed||(this.checkRevision++,this.checkInvalidated=!0,this.value.check&&this.patch({check:{...this.value.check,canInstall:!1,ticket:""}}),this.refreshInvalidatedCheck())};refreshInvalidatedCheck(){!this.disposed&&this.checkInvalidated&&this.listeners.size&&!this.value.starting&&!this.active()&&this.refresh()}refresh=()=>{if(this.disposed||this.value.starting)return Promise.resolve();if(this.reading)return this.reading;let t=this.checkRevision;return this.checkInvalidated=!1,this.patch({checking:!0,error:null}),this.reading=(async()=>{try{let e=await this.call("update-check");if(this.disposed||t!==this.checkRevision)return;if(!e?.advice||!e.status||typeof e.canInstall!="boolean")throw Error("invalid update response");this.patch({check:e,status:e.status}),this.active()&&this.poll()}catch{if(this.disposed||t!==this.checkRevision)return;let e=!1;try{let a=await this.call("status");e=!!(a&&!a.plugin)}catch{}if(this.disposed||t!==this.checkRevision)return;this.patch({check:null,error:e?"当前运行的连接服务尚不支持此更新入口。若刚安装新版，请在任务结束后退出并重新打开 Desktop；无需重新配对。仍不可用时请在原生插件管理器核对安装。":"本次更新检查未完成，不能据此判断已是最新版。请稍后重试；配对和聊天不受此次检查失败影响。"})}finally{this.patch({checking:!1})}})().finally(()=>{this.reading=void 0,this.refreshInvalidatedCheck()}),this.reading};install=async()=>{let t=this.value.check;if(!(this.disposed||this.checkInvalidated||this.value.starting||this.value.checking||!t?.canInstall||!t.ticket)){this.patch({starting:!0,error:null,check:{...t,canInstall:!1,ticket:""}});try{let e=await this.call("update-start",{ticket:t.ticket});this.patch({status:e})}catch(e){this.patch({status:e?.code==="update/not-started"?{phase:"failed",message:e instanceof Error?e.message:"尚未启动更新，请重新检查"}:{phase:"unknown",message:"更新提交结果暂未确认，正在核对；请勿重复安装。"}})}finally{this.patch({starting:!1}),this.poll(),this.refreshInvalidatedCheck()}}};poll(){this.disposed||this.timer||!this.listeners.size||!this.active()||(this.timer=setTimeout(async()=>{try{let t=await this.call("update-status");if(!t||!["idle","preparing","installing","restart-required","complete","failed","unknown"].includes(t.phase))throw Error("invalid status");this.patch({status:t,error:t.phase==="idle"?"尚未发现已接受的更新，请重新检查后再操作。":null})}catch{this.patch({error:"更新状态暂不可用；恢复连接后继续核对，不会重复安装。"})}finally{this.timer=void 0,this.poll(),this.refreshInvalidatedCheck()}},2e3))}dispose(){this.disposed=!0,this.checkRevision++,this.checkInvalidated=!1,clearTimeout(this.timer),this.listeners.clear()}};var me=()=>({loadState:"loading",qrState:"idle",status:null,host:null,runtime:null,localOrigin:null,qr:null,error:null,decisionError:null,deciding:!1}),Ce=r=>r?.companionUpdate?.state?["preparing","installing","verifying","recovering"].includes(r.companionUpdate.state):void 0,ee=class{constructor(t,e){this.describeHost=t;this.callManagement=e}updates;nativeUpdates;value=me();listeners=new Set;timer;reading;pairing;disposed=!1;identity="";generation=0;getSnapshot=()=>this.value;subscribe=t=>this.disposed?()=>{}:(this.listeners.add(t),this.timer||(this.refresh(),this.timer=setInterval(()=>void this.refresh(),2e3)),()=>{this.listeners.delete(t),this.listeners.size||(clearInterval(this.timer),this.timer=void 0)});patch(t){if(!this.disposed){this.value={...this.value,...t};for(let e of this.listeners)e()}}async client(){let t=await ke(this.describeHost,this.callManagement);if(this.disposed)throw new Error("disposed");let e=`${t.host.agentInstanceId??t.host.computerName}/${t.runtime.profileScope??"web"}`;return this.identity&&this.identity!==e&&(this.generation++,this.value=me(),this.updates?.dispose(),this.updates=void 0,this.nativeUpdates?.dispose(),this.nativeUpdates=void 0),this.identity=e,t.runtime.profileScope==="desktop"&&!this.nativeUpdates&&(this.nativeUpdates=new de(this.callManagement)),this.updates?.origin!==t.localOrigin&&(this.updates?.dispose(),this.updates=t.localOrigin?new le(t.localOrigin):void 0),this.patch({host:t.host,runtime:t.runtime,localOrigin:t.localOrigin}),t}refresh=()=>this.disposed?Promise.resolve():this.reading?this.reading:(this.reading=(async()=>{try{let t=await this.client(),e=this.generation,a={...await t.status()};if(a.companionUpdate?.state==="complete"&&!a.plugin&&(a.companionUpdate={state:"unverified",message:"当前连接服务尚未提供运行版本核验，不能确认两端已对齐。若刚安装插件，请在任务结束后退出并重新打开当前应用；无需重新配对。"}),e!==this.generation)return;let s=Ce(this.value.status),o=Ce(a);o!==void 0&&o!==s&&this.nativeUpdates?.invalidateCheck(),this.patch({status:a,runtime:a.gate??t.runtime,loadState:"ready",error:null,...this.value.qr&&this.value.qr.expiresAt<=Date.now()?{qrState:"expired",qr:null}:{}})}catch{this.patch({loadState:"error",error:"连接服务暂未就绪。请确认 DSH 正在运行，然后重试。"})}})().finally(()=>{this.reading=void 0}),this.reading);generateQr=()=>this.disposed?Promise.resolve():this.pairing?this.pairing:(this.patch({qrState:"loading",qr:null,error:null}),this.pairing=(async()=>{try{let t=await this.client(),e=this.generation,a=await t.pairCode();if(e!==this.generation)return;if(!a?.qrDataUrl?.startsWith("data:image/")||!Number.isFinite(a.expiresAt)||a.expiresAt<=Date.now())throw new Error("invalid QR");this.patch({qr:a,qrState:"ready"}),await this.refresh()}catch{this.patch({qr:null,qrState:"error",error:"暂时无法生成配对二维码，请稍后重试。"})}})().finally(()=>{this.pairing=void 0}),this.pairing);decide=async t=>{let e=this.value.status?.companionUpdate?.offerId;if(!(this.disposed||this.value.deciding||!e)){this.patch({deciding:!0,decisionError:null});try{let a=await this.client();if(this.value.status?.companionUpdate?.offerId!==e)throw new Error("stale offer");await a.decide(e,t),await this.reading,await this.refresh()}catch{this.patch({decisionError:"更新选择未确认，请刷新后核对；不要重复安装。"})}finally{this.patch({deciding:!1})}}};dispose=()=>{this.disposed=!0,this.generation++,clearInterval(this.timer),this.timer=void 0,this.listeners.clear(),this.value=me(),this.updates?.dispose(),this.updates=void 0,this.nativeUpdates?.dispose(),this.nativeUpdates=void 0}},Se=new WeakMap;function pe(r,t){let e=Se.get(r);return e||(e=new ee(r,t),Se.set(r,e)),e}var L=$(V(),1),U=require("react/jsx-runtime");function ce({describeHost:r,callManagement:t,onDismiss:e,onOpenDetails:a,compact:s=!1,store:o=pe(r,t)}){let{status:d,deciding:l,decisionError:h,error:g,loadState:w}=(0,Ne.useSyncExternalStore)(o.subscribe,o.getSnapshot,o.getSnapshot),p=d?.companionUpdate,f=h||g,_=(0,U.jsxs)("div",{children:[(0,U.jsx)(xe,{value:p,compact:s,deciding:l||w!=="ready",onDecide:S=>void o.decide(S)}),!p&&!f?(0,U.jsx)("p",{className:L.default.helpText,children:w==="loading"?"正在检查同一主机的另一端…":"另一端状态未确认；不会自动更新。"}):!s&&p?.state==="idle"?(0,U.jsx)("p",{className:L.default.helpText,children:"未发现需要联动更新的另一端。当前节点可独立使用，不会自动安装另一端或启用已停用的插件。"}):null,f?(0,U.jsx)("p",{role:"alert",children:f}):null,e?(0,U.jsxs)("div",{className:L.default.actions,children:[a?(0,U.jsx)("button",{type:"button",className:L.default.primaryButton,onClick:a,children:"前往微信连接"}):null,(0,U.jsx)("button",{type:"button",className:L.default.secondaryButton,onClick:e,children:"关闭提示（不会确认更新）"})]}):null]});return e?(0,U.jsx)(Pe.Modal,{open:!0,title:"微信连接 · 联动更新",closeLabel:"关闭提示",className:L.default.pageDialog,contentClassName:L.default.pageDialogContent,onClose:e,children:_}):_}var te=require("react"),He=$(V(),1),q=require("react/jsx-runtime");function Re({wide:r,openPlugin:t}){let[e,a]=(0,te.useState)(!1),[s,o]=(0,te.useState)(!1),d=(0,te.useRef)(!1),l=async()=>{if(!d.current){d.current=!0,o(!0);try{await t()||a(!0)}finally{d.current=!1,o(!1)}}};return(0,q.jsxs)(q.Fragment,{children:[(0,q.jsxs)("button",{type:"button",className:He.default.sidebarButton,"data-wide":r,title:"微信连接","aria-label":"微信连接",disabled:s,onClick:()=>void l(),children:[(0,q.jsxs)("svg",{width:"20",height:"20",viewBox:"0 0 24 24",fill:"none",stroke:"currentColor",strokeWidth:"1.7","aria-hidden":"true",children:[(0,q.jsx)("path",{d:"M20 11.5a8 8 0 0 1-8 8 9 9 0 0 1-3.5-.7L4 20l1.2-4.2A7.8 7.8 0 0 1 4 11.5a8 8 0 0 1 16 0Z"}),(0,q.jsx)("path",{d:"M8 11.5h.01M12 11.5h.01M16 11.5h.01",strokeWidth:"2.5",strokeLinecap:"round"})]}),r?(0,q.jsx)("span",{children:s?"正在打开…":"微信连接"}):null]}),e?(0,q.jsx)("small",{role:"status",children:"插件详情暂不可用，请打开「设置 → 微信连接」。"}):null]})}async function De(r){try{let t=r("pluginNavigation"),e=r("remote.pluginManager");if(typeof t?.openBundle!="function"||typeof e?.listBundles!="function")return!1;let a=await e.listBundles();if(!a.ok||!Array.isArray(a.value))return!1;let s=a.value.filter(d=>d.enabled&&["dsh-wechat-remote","@harness-remote/dsh-wechat-remote"].includes(d.name));if(s.length!==1)return!1;let o=r("pluginNavigation");return o!==t||typeof o.openBundle!="function"?!1:(o.openBundle(s[0].name),!0)}catch{return!1}}var ue=require("react"),Me=require("@deepseek-ai/dsh-client-ui-primitives"),C=$(V(),1);var Ee=require("react"),R=$(V(),1),m=require("react/jsx-runtime");function Ae({store:r,embedded:t=!1}){let{check:e,checking:a,progress:s,error:o,copied:d,resumeFailed:l}=(0,Ee.useSyncExternalStore)(r.subscribe,r.getSnapshot,r.getSnapshot),h=!!(s&&!s.terminal),g=h||s?.phase==="unknown"||e?.mode==="busy";return(0,m.jsxs)("div",{className:t?R.default.updateEndpoint:R.default.updateCard,children:[(0,m.jsxs)("div",{className:R.default.updateRow,children:[(0,m.jsxs)("div",{className:R.default.updateCopy,children:[(0,m.jsxs)("strong",{children:["Web ",(0,m.jsx)("span",{className:R.default.updateScope,children:"当前端"})]}),e?(0,m.jsxs)("div",{className:R.default.updateVersions,children:[(0,m.jsxs)("span",{children:["DSH ",(0,m.jsx)("strong",{children:e.advice.current.agentVersion||"未确认"})]}),(0,m.jsxs)("span",{children:["插件运行 ",(0,m.jsx)("strong",{children:e.advice.current.pluginVersion||"未确认"})]}),e.channel==="preview"?(0,m.jsx)("span",{children:"预览通道"}):null]}):null]}),(0,m.jsxs)("div",{className:R.default.updateControl,children:[(0,m.jsx)("button",{type:"button",className:R.default.secondaryButton,disabled:a||h,onClick:()=>void r.refresh(),children:a?"检查中…":"检查更新"}),e&&!a?(0,m.jsx)("strong",{className:R.default.updateLabel,"data-severity":g?"unknown":e.advice.severity,role:"status",children:h?"正在更新 Web 插件":g?"更新状态待核对":e.advice.label}):null,e?.advice.checkedAt&&e.advice.severity!=="unknown"?(0,m.jsxs)("small",{className:R.default.updateChecked,children:["检查于 ",new Date(e.advice.checkedAt).toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"})]}):null]})]}),e?(0,m.jsx)(m.Fragment,{children:a?null:(0,m.jsxs)(m.Fragment,{children:[!g&&e.advice.targetVersion?(0,m.jsxs)("p",{children:["可更新至 ",e.advice.targetVersion,e.mode==="manual"?" · 需手动更新":""]}):null,!g&&(e.advice.severity==="unknown"||e.advice.severity==="required"||e.mode==="manual")?(0,m.jsxs)("details",{children:[(0,m.jsx)("summary",{children:e.mode==="manual"?"手动更新说明":"查看说明"}),e.reason?(0,m.jsx)("p",{children:e.reason}):null,(0,m.jsx)("p",{children:e.advice.message})]}):null,!g&&e.mode==="manual"&&e.manualCommand?(0,m.jsxs)("div",{className:R.default.updateCommand,children:[(0,m.jsx)("code",{children:e.manualCommand}),(0,m.jsx)("button",{type:"button",className:R.default.secondaryButton,disabled:h,onClick:()=>void r.copyCommand(),children:d?"已复制":"复制命令"})]}):null,!g&&e.canInstall?(0,m.jsxs)(m.Fragment,{children:[(0,m.jsx)("div",{className:R.default.updateActions,children:(0,m.jsx)("button",{type:"button",className:R.default.primaryButton,disabled:h||!!o,onClick:()=>void r.install(),children:"更新 Web 并重启"})}),(0,m.jsx)("small",{className:R.default.updateChecked,children:"仅更新 Web，保留配对与会话；连接会短暂中断。"})]}):null]})}):null,o?(0,m.jsx)("p",{role:"alert",children:o}):null,s?(0,m.jsxs)("div",{role:"status","aria-live":"polite",children:[!s.terminal||s.ok===!0?(0,m.jsx)("progress",{className:R.default.updateProgress,max:100,value:s.progress}):null,(0,m.jsx)("p",{children:s.message}),l?(0,m.jsx)("p",{role:"alert",children:"插件已完成更新，但未能自动打开 WebUI。请使用 DSH 启动时显示的地址打开，无需重复更新。"}):null]}):null]})}var Be=require("react"),D=$(V(),1),v=require("react/jsx-runtime");function Ie({store:r,embedded:t=!1}){let{check:e,status:a,checking:s,starting:o,error:d}=(0,Be.useSyncExternalStore)(r.subscribe,r.getSnapshot,r.getSnapshot),l=o||a?.phase==="preparing"||a?.phase==="installing",h=a&&["preparing","installing","restart-required","unknown"].includes(a.phase),g=a?.phase==="restart-required"||a?.phase==="complete",w=a?.phase==="restart-required"?"已安装，待重新打开 Desktop":a?.phase==="unknown"?"更新结果待核对":a?.phase==="failed"?"更新未完成":l?"正在更新 Desktop 插件":a?.phase==="complete"?"更新已生效":"";return(0,v.jsxs)("div",{className:t?D.default.updateEndpoint:D.default.updateCard,children:[(0,v.jsxs)("div",{className:D.default.updateRow,children:[(0,v.jsxs)("div",{className:D.default.updateCopy,children:[(0,v.jsxs)("strong",{children:["Desktop ",(0,v.jsx)("span",{className:D.default.updateScope,children:"当前端"})]}),e?(0,v.jsxs)("div",{className:D.default.updateVersions,children:[(0,v.jsxs)("span",{children:["DSH ",(0,v.jsx)("strong",{children:e.advice.current.agentVersion||"未确认"})]}),(0,v.jsxs)("span",{children:["插件运行 ",(0,v.jsx)("strong",{children:e.advice.current.pluginVersion||"未确认"})]}),g&&a.targetVersion&&a.targetVersion!==e.advice.current.pluginVersion?(0,v.jsxs)("span",{children:["已安装 ",(0,v.jsx)("strong",{children:a.targetVersion})]}):null,e.channel==="preview"?(0,v.jsx)("span",{children:"预览通道"}):null]}):null]}),(0,v.jsxs)("div",{className:D.default.updateControl,children:[(0,v.jsx)("button",{type:"button",className:D.default.secondaryButton,disabled:s||l,onClick:()=>void r.refresh(),children:s?"检查中…":"检查更新"}),e?(0,v.jsx)("strong",{className:D.default.updateLabel,"data-severity":a?.phase==="failed"?"required":a?.phase==="complete"?"none":h?a?.phase==="unknown"?"unknown":"info":e.advice.severity,children:w||e.advice.label}):null,e?.advice.checkedAt?(0,v.jsxs)("small",{className:D.default.updateChecked,children:["检查于 ",new Date(e.advice.checkedAt).toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"})]}):null]})]}),e?(0,v.jsxs)(v.Fragment,{children:[!g&&!h&&e.advice.targetVersion?(0,v.jsxs)("p",{children:["可更新至 ",e.advice.targetVersion]}):null,!h&&e.reason?(0,v.jsx)("p",{children:e.reason}):null,!h&&e.canInstall?(0,v.jsxs)(v.Fragment,{children:[(0,v.jsx)("div",{className:D.default.updateActions,children:(0,v.jsx)("button",{type:"button",className:D.default.primaryButton,disabled:l||s,onClick:()=>void r.install(),children:"更新 Desktop 插件"})}),(0,v.jsx)("small",{className:D.default.updateChecked,children:"仅更新 Desktop，保留配对与会话；完成后需退出并重新打开。"})]}):null]}):null,a?.phase!=="idle"&&a?(0,v.jsxs)("div",{role:"status","aria-live":"polite",children:[l?(0,v.jsx)("progress",{className:D.default.updateProgress,"aria-label":"Desktop 插件更新中"}):null,a.phase==="restart-required"?(0,v.jsx)("p",{className:D.default.updatePeerNote,children:"任务结束后，选择「应用 → 退出」再打开 Desktop；无需重新配对，Web 不受影响。"}):a.phase!=="complete"?(0,v.jsx)("p",{children:a.message}):null]}):null,d?(0,v.jsx)("p",{role:"alert",children:d}):null]})}var O=require("react"),x=$(V(),1),i=require("react/jsx-runtime"),ae=r=>r.state==="installed"&&(r.nativeState===void 0||r.nativeState==="installed"),nt=r=>ae(r)?"已安装":r.state==="draft"?"待安装":r.nativeState==="uninstalled"?"未安装":r.nativeState==="disabled"?"已停用":r.state==="pending-restart"?"待重启":"待核对",fe=r=>r.templateId==="designer"||r.id==="designer"?"定制我的助手":r.name;function Te({label:r,children:t}){let e=(0,O.useId)();return(0,i.jsxs)("span",{className:x.default.assistantHelpAnchor,children:[(0,i.jsx)("button",{type:"button",className:x.default.assistantHelpButton,"aria-label":r,"aria-describedby":e,children:"?"}),(0,i.jsx)("span",{id:e,className:x.default.assistantTooltip,role:"tooltip",children:t})]})}function ze({store:r}){let{catalog:t,preview:e,busy:a,message:s,error:o}=(0,O.useSyncExternalStore)(r.subscribe,r.getSnapshot,r.getSnapshot),d=(0,O.useRef)();(0,O.useEffect)(()=>{let n=new AbortController;return d.current=n,r.load(),()=>n.abort()},[r]);let l=t?.drafts||[],h=l.filter(n=>ae(n)&&!n.replacement),g=l.filter(n=>n.state==="draft"),w=l.filter(n=>n.source!=="builtin"&&n.state!=="draft"&&(!ae(n)||n.replacement)),p=t?.templates||[],f=n=>h.find(N=>N.templateId===n),_=n=>void r.start(n.presetId,d.current?.signal),S=n=>n.id==="designer"||n.templateId==="designer"?"先打开定制会话，说清职业和工作习惯；助手会设计可复用的模式。确认安装后，再用新模式开启工作会话。不会自动安装或发送消息。":`先选工作区，再用「${n.name}」开始空白会话。手机连接此电脑后可继续该会话；发卡与提醒需在小程序设置中开启「微信群协作助手」。`,P=n=>{let N=f(n.id),E=n.builtin,T=l.find(W=>W.templateId===n.id&&W.source==="builtin");return(0,i.jsxs)("article",{className:x.default.assistantChoice,"data-installed":!!N,children:[(0,i.jsxs)("div",{className:x.default.assistantChoiceCopy,children:[(0,i.jsxs)("div",{className:x.default.assistantChoiceHead,children:[(0,i.jsx)("strong",{children:fe(n)}),(0,i.jsx)(Te,{label:`${fe(n)}使用说明`,children:S(n)})]}),(0,i.jsx)("p",{children:n.id==="designer"?"用对话设计适合自己职业的助手模式":n.description})]}),!N&&E?(0,i.jsx)("span",{className:x.default.assistantUnavailable,title:T?.reason||E.reason,children:T?.nativeState==="disabled"?"已停用":"待就绪"}):null,(0,i.jsx)("button",{type:"button",className:x.default.secondaryButton,disabled:a||!!(E&&!N),onClick:()=>N?_(N):E?void r.load():void r.choose(n.id),children:N?n.id==="designer"?"开始定制":"开始使用":E?"开始使用":"安装"})]},n.id)},I=n=>(0,i.jsxs)("div",{className:x.default.assistantEntry,children:[(0,i.jsxs)("div",{className:x.default.assistantEntryHead,children:[(0,i.jsx)("strong",{children:fe(n)}),(0,i.jsx)("span",{children:nt(n)})]}),n.replacement?(0,i.jsxs)("div",{children:[(0,i.jsxs)("p",{children:["已提供内置「",n.replacement.name,"」，无需再装同款独立包。"]}),(0,i.jsx)("p",{children:n.replacement.warning}),n.replacement.canRemoveAfterReview?(0,i.jsxs)("p",{children:["核对旧会话后，可在 DSH 插件列表卸载：",(0,i.jsx)("code",{children:n.replacement.bundleName})]}):null]}):null,ae(n)?(0,i.jsx)("button",{type:"button",className:x.default.assistantSecondary,disabled:a,onClick:()=>_(n),children:"开始使用"}):n.state==="draft"?(0,i.jsx)("button",{type:"button",className:x.default.assistantPrimary,disabled:a,onClick:()=>void r.preview(n.id,n.version),children:"查看并安装"}):(0,i.jsxs)(i.Fragment,{children:[(0,i.jsx)("button",{type:"button",className:x.default.assistantSecondary,disabled:a,onClick:()=>void r.verify(n.id,n.version),children:"刷新状态"}),n.nativeState==="uninstalled"&&!n.replacement?(0,i.jsx)("button",{type:"button",className:x.default.assistantSecondary,disabled:a,onClick:()=>void r.reinstall(n.id,n.version),children:"查看并重新安装"}):null]}),!ae(n)&&n.reason?(0,i.jsxs)("details",{className:x.default.assistantDetails,children:[(0,i.jsx)("summary",{children:"状态说明"}),(0,i.jsx)("p",{children:n.reason})]}):null]},`${n.id}:${n.version}`);return(0,i.jsxs)("section",{className:x.default.assistantsCard,"aria-label":"微信群协作助手","aria-busy":a,children:[(0,i.jsxs)("div",{className:x.default.assistantsHeading,children:[(0,i.jsxs)("div",{className:x.default.assistantChoiceHead,children:[(0,i.jsx)("h3",{children:"微信群协作助手"}),(0,i.jsx)(Te,{label:"电脑助手与手机群协作",children:"电脑助手可独立使用，组件开关由 DSH 管理。手机发任务和提醒，需在小程序「设置 → 实验性功能」开启「微信群协作助手」。各手机独立设置，不会关闭电脑助手或已发布任务。"})]}),(0,i.jsx)("button",{type:"button",className:x.default.assistantTextButton,disabled:a,onClick:()=>void r.load(),children:a?"读取中…":"刷新"})]}),!t&&!o?(0,i.jsx)("p",{role:"status",children:"正在读取当前电脑的助手…"}):null,t&&!t.native?.supported?(0,i.jsx)("p",{role:"status",children:t.native?.reason||"当前 DSH 暂不支持安装助手，请先检查版本。"}):null,t&&(t.native?.supported||p.some(n=>n.builtin))?(0,i.jsxs)(i.Fragment,{children:[(0,i.jsx)("div",{className:x.default.assistantChoices,children:p.filter(n=>["teacher","project"].includes(n.id)).map(P)}),p.some(n=>n.id==="designer")?(0,i.jsx)("div",{className:x.default.assistantCustomize,children:p.filter(n=>n.id==="designer").map(P)}):null]}):null,e?(0,i.jsxs)("div",{className:x.default.assistantPreview,"aria-label":"安装助手预览",children:[(0,i.jsxs)("h4",{children:["安装「",e.definition.name,"」"]}),(0,i.jsx)("p",{children:e.definition.description}),(0,i.jsx)("p",{children:"新增一个可选的助手模式，不改默认模式、已有会话和资料。"}),(0,i.jsxs)("details",{className:x.default.assistantDetails,children:[(0,i.jsx)("summary",{children:"查看工作方式与安装详情"}),(0,i.jsx)("p",{children:e.definition.role}),(0,i.jsx)("ul",{children:e.definition.methods.map((n,N)=>(0,i.jsx)("li",{children:n},N))}),(0,i.jsx)("p",{children:"助手会逐步了解："}),(0,i.jsx)("ul",{children:e.definition.onboarding.map(n=>(0,i.jsxs)("li",{children:[n.label,"：",n.prompt]},n.key))}),(0,i.jsxs)("small",{children:["第 ",e.version," 版 · 内容摘要 ",e.digest.slice(0,12)," · 基础模式 ",e.native.basePreset]}),(0,i.jsx)("ul",{children:(e.native.warnings||[]).map((n,N)=>(0,i.jsx)("li",{children:n},N))})]}),(0,i.jsxs)("div",{className:x.default.assistantButtons,children:[(0,i.jsx)("button",{type:"button",className:x.default.assistantPrimary,disabled:a,onClick:()=>void r.install(),children:"确认安装"}),(0,i.jsx)("button",{type:"button",className:x.default.assistantSecondary,disabled:a,onClick:()=>r.dismissPreview(),children:"暂不安装"})]})]}):null,g.length?(0,i.jsxs)("div",{children:[(0,i.jsx)("h4",{children:"待安装的助手"}),g.map(I)]}):null,h.some(n=>!["teacher","project","designer"].includes(n.templateId))?(0,i.jsxs)("div",{children:[(0,i.jsx)("h4",{children:"我已安装的其他助手"}),h.filter(n=>!["teacher","project","designer"].includes(n.templateId)).map(I)]}):null,w.length||p.some(n=>!["teacher","project","designer"].includes(n.id))?(0,i.jsxs)("details",{className:x.default.assistantDetails,children:[(0,i.jsx)("summary",{children:"更多助手与安装记录"}),t?.native?.supported?(0,i.jsx)("div",{className:x.default.assistantChoices,children:p.filter(n=>!["teacher","project","designer"].includes(n.id)).map(P)}):null,w.length?(0,i.jsxs)("details",{className:x.default.assistantDetails,children:[(0,i.jsxs)("summary",{children:["以前安装的助手（",w.length,"）"]}),(0,i.jsx)("p",{children:"旧会话可能仍在使用旧模式；卸载前请核对，聊天与资料不会在这里删除。"}),w.map(I)]}):null]}):null,s?(0,i.jsx)("p",{role:"status",children:s}):null,o?(0,i.jsx)("p",{role:"alert",children:o}):null]})}var H=require("react"),b=$(V(),1),c=require("react/jsx-runtime"),je={wait:"打开微信首页「＋ → 扫一扫」",scaned:"已扫码，请在微信中确认",need_verifycode:"请输入微信显示的验证码",expired:"二维码已过期",verify_code_blocked:"验证码暂不可用，请稍后重新配对",scaned_but_redirect:"请按微信提示继续确认",binded_redirect:"微信已有连接，请核对原节点"},Ue=(r,t)=>!!(r&&["wait","scaned","scaned_but_redirect","need_verifycode"].includes(r.status)&&(r.expiresAt===void 0||r.expiresAt>t)),st=new Set(["正在继续微信确认流程","请用手机微信扫描二维码并确认连接","请继续完成手机微信中的确认","请输入手机微信显示的数字验证码","二维码已过期，请重新生成。","请用微信扫一扫扫描电脑上的二维码，并在微信中确认。","已暂停接入；DSH 中已经开始的任务不会被取消。","微信已绑定。选择目标会话并开启接入后，即可在 ClawBot 私聊。","微信确认本节点已有绑定。选择会话并开启接入后即可使用。","原微信连接已失效，请重新配对。","微信连接已失效，请重新配对。","已移除此节点的本地绑定。未完成的渠道消息已停止续发；电脑上已开始的任务仍会继续。这不是腾讯账号端的撤销授权。"]);function qe({call:r,nodeName:t,hostName:e}){let[a,s]=(0,H.useState)(),[o,d]=(0,H.useState)([]),[l,h]=(0,H.useState)(""),[g,w]=(0,H.useState)(!1),[p,f]=(0,H.useState)(""),[_,S]=(0,H.useState)(""),[P,I]=(0,H.useState)(Date.now),n=(0,H.useRef)(a);n.current=a;let N=(0,H.useRef)(!1),E=(0,H.useRef)(!1),T=(0,H.useRef)(null),W=(0,H.useRef)(null),K=(0,H.useRef)(null),M=(0,H.useRef)(0),A=async(k,X=!1,Z=!1)=>{let ne=k.action==="login.poll"?W:K;if(T.current&&!(k.action==="login.cancel"&&T.current.action==="login.poll")||X&&ne.current)return;let se={};X?ne.current=se:(T.current={action:k.action,token:se},M.current++);let ie=M.current;X||(w(!0),f(""));try{let Y=k;if(Z){let J=await r({action:"enabled",enabled:!1,expectedRevision:k.expectedRevision});if(!E.current||ie!==M.current)return;if("sessions"in J||J.enabled||J.revision<=(k.expectedRevision??-1)||n.current&&J.revision<n.current.revision)throw new Error("状态已变化，请刷新后重试。");n.current=J,s(J),Y={...k,expectedRevision:J.revision}}let F=await r(Y);if(!E.current||ie!==M.current)return;if("sessions"in F)d(F.sessions);else{if(n.current&&F.revision<n.current.revision)return;let J=n.current;n.current=F,s(F),f(""),J?.pairing?.id!==F.pairing?.id&&S(""),(!N.current||k.action==="route")&&(N.current=!1,h(F.target?.id||""))}}catch(Y){E.current&&ie===M.current&&(k.action!=="login.poll"||n.current?.pairing?.id===k.loginId)&&f(Y instanceof Error?Y.message:"暂时无法读取状态")}finally{X?ne.current===se&&(ne.current=null):T.current?.token===se&&(T.current=null,E.current&&ie===M.current&&w(!1))}};(0,H.useEffect)(()=>{E.current=!0,n.current=void 0,N.current=!1,s(void 0),d([]),h(""),S(""),f(""),A({action:"status"});let k=setInterval(()=>{let X=Date.now();I(X);let Z=n.current?.pairing;Z&&Ue(Z,X)&&Z.status!=="need_verifycode"&&A({action:"login.poll",loginId:Z.id},!0),A({action:"status"},!0)},4e3);return()=>{E.current=!1,M.current++,T.current=null,W.current=null,K.current=null,clearInterval(k)}},[r]);let re=async()=>{await A({action:"status"}),await A({action:"sessions"})},B=a?.pairing,z=Ue(B,P),G=a?.bindingState==="expired",Q=!!(a?.paired&&!G),$e=!!(Q&&a?.target&&!z),Le=a?z?"配对完成后可开启":G?"请重新配对":Q?a?.target?a.enabled?a.state==="ready"?"接收中":a.state==="error"?"连接异常":"连接中":"已暂停":"选择会话后可开启":"配对后可开启":"读取中",Oe=a?z?B?.status==="wait"?"等待扫码":B?.status==="need_verifycode"?"等待确认码":"等待微信确认":G?"连接已失效":Q?"已配对此节点":"未配对":"读取中",We=!!(B&&(z||!Q)),Ge=B&&(!z&&B.expiresAt!==void 0&&B.expiresAt<=P?je.expired:je[B.status]||"请重新显示配对码"),ge=()=>{!a||z||a.paired&&!window.confirm((a.enabled?"将先暂停接收微信消息，再重新配对当前节点。":"重新配对当前节点？")+`
微信可能提示替换已有连接，请核对后确认。完成后需手动开启接收。`)||A({action:"login.start",expectedRevision:a.revision},!1,a.paired&&a.enabled)},Xe=()=>{a?.paired&&window.confirm((a.enabled?"将先暂停接收微信消息，再移除此节点的配对。":"移除此节点的配对？")+`
不会删除会话，也不会解除微信端的授权。`+(a.pending?`
未完成的微信消息将停止处理和发送；电脑上已开始的任务仍会继续，请到原会话查看。`:""))&&A({action:"disconnect",expectedRevision:a.revision,abandonPending:a.pending>0},!1,a.enabled)};return(0,c.jsxs)("section",{className:`${b.default.updateCard} ${b.default.clawbotCard}`,"aria-label":"微信 ClawBot",children:[(0,c.jsxs)("div",{className:b.default.clawbotHead,children:[(0,c.jsxs)("h3",{className:b.default.updateHeading,children:[(0,c.jsx)("span",{className:b.default.clawbotMark,"aria-hidden":!0}),"微信 ClawBot ",(0,c.jsx)("small",{children:"实验性"})]}),(0,c.jsxs)("button",{type:"button","aria-label":"刷新",className:b.default.clawbotTextButton,disabled:g,onClick:()=>void re(),children:[(0,c.jsx)("span",{"aria-hidden":!0,children:"↻ "}),"刷新"]})]}),(0,c.jsxs)("p",{className:b.default.clawbotNode,children:["当前节点：",t||"读取中",e?" · "+e:""]}),(0,c.jsxs)("div",{className:b.default.clawbotSection,"aria-label":"微信配对",children:[(0,c.jsxs)("div",{className:b.default.clawbotRow,children:[(0,c.jsx)("strong",{children:"微信配对"}),(0,c.jsx)("span",{className:b.default.clawbotStatus,"data-state":z?"pending":G?"expired":Q?"paired":"unpaired",role:"status",children:Oe})]}),We&&B?(0,c.jsxs)("div",{className:b.default.clawbotPairing,children:[z&&B.status==="wait"?(0,c.jsx)("img",{src:B.qrDataUrl,width:"180",height:"180",alt:"微信 ClawBot 配对二维码"}):null,(0,c.jsxs)("div",{className:b.default.clawbotPairingCopy,children:[(0,c.jsx)("strong",{role:"status",children:Ge}),z&&B.status==="wait"?(0,c.jsx)("p",{className:b.default.clawbotNote,children:"扫描此二维码，在微信中确认连接。"}):null,z&&B.status==="need_verifycode"?(0,c.jsxs)("form",{onSubmit:k=>{k.preventDefault(),A({action:"login.poll",loginId:B.id,verifyCode:_}),S("")},children:[(0,c.jsx)("input",{"aria-label":"微信验证码",value:_,autoComplete:"off",inputMode:"numeric",maxLength:16,onChange:k=>S(k.target.value)}),(0,c.jsx)("button",{type:"submit",className:b.default.primaryButton,disabled:g||!/^\d{1,16}$/.test(_),children:"确认验证码"})]}):null,(0,c.jsxs)("div",{className:b.default.clawbotActions,children:[z?null:(0,c.jsx)("button",{type:"button",className:b.default.primaryButton,disabled:g,onClick:ge,children:G?"重新配对":"重新显示配对码"}),z?(0,c.jsx)("button",{type:"button",className:b.default.clawbotTextButton,disabled:g&&T.current?.action!=="login.poll",onClick:()=>void A({action:"login.cancel",loginId:B.id}),children:"取消配对"}):null]})]})]}):Q?null:(0,c.jsxs)("div",{className:b.default.clawbotPairingEntry,children:[(0,c.jsx)("p",{className:b.default.clawbotNote,children:"用微信首页「＋ → 扫一扫」扫码连接。"}),(0,c.jsx)("button",{type:"button",className:b.default.primaryButton,disabled:!a||g,onClick:ge,children:G?"重新配对":"显示配对码"})]})]}),(0,c.jsxs)("div",{className:b.default.clawbotSection,"aria-label":"微信消息",children:[(0,c.jsx)("div",{className:b.default.clawbotRow,children:(0,c.jsx)("strong",{children:"目标会话"})}),(0,c.jsxs)("div",{className:b.default.clawbotRow,children:[(0,c.jsxs)("select",{"aria-label":"ClawBot 目标会话",value:l,disabled:!a||g&&T.current?.action!=="sessions",onFocus:()=>void A({action:"sessions"}),onChange:k=>{N.current=!0,h(k.target.value)},children:[(0,c.jsx)("option",{value:"",children:"选择已有会话"}),a?.target&&!o.some(k=>k.id===a.target.id)?(0,c.jsx)("option",{value:a.target.id,children:a.target.title}):null,o.map(k=>(0,c.jsx)("option",{value:k.id,children:k.title},k.id))]}),(0,c.jsx)("button",{type:"button",className:b.default.secondaryButton,disabled:!l||!a||g||l===a.target?.id,onClick:()=>void A({action:"route",sessionId:l,expectedRevision:a?.revision}),children:"接到此会话"})]}),(0,c.jsxs)("div",{className:b.default.clawbotReceiveRow,children:[(0,c.jsxs)("div",{children:[(0,c.jsx)("strong",{children:"接收微信消息"}),(0,c.jsx)("p",{className:b.default.clawbotNote,role:"status",children:Le})]}),(0,c.jsxs)("label",{className:b.default.clawbotToggle,children:[(0,c.jsx)("input",{type:"checkbox",role:"switch","aria-label":"接收微信消息",checked:a?.enabled||!1,disabled:!a||g||!a.enabled&&!$e,onChange:k=>void A({action:"enabled",enabled:k.target.checked,expectedRevision:a?.revision})}),(0,c.jsx)("span",{className:b.default.clawbotSwitchTrack,"aria-hidden":!0})]})]})]}),a?.message&&!st.has(a.message)?(0,c.jsx)("p",{className:b.default.clawbotNote,role:"status",children:a.message}):null,a?.uncertain?(0,c.jsxs)("p",{className:b.default.clawbotNote,children:["有 ",a.uncertain," 条消息的处理结果待确认，请到原会话查看。"]}):null,p?(0,c.jsx)("p",{className:b.default.clawbotError,role:"alert",children:p}):null,a?.paired&&!z?(0,c.jsxs)("details",{className:b.default.clawbotManage,children:[(0,c.jsx)("summary",{children:"配对管理"}),(0,c.jsxs)("div",{className:b.default.clawbotActions,children:[G?null:(0,c.jsx)("button",{type:"button",className:b.default.secondaryButton,disabled:g,onClick:ge,children:"重新配对"}),(0,c.jsx)("button",{type:"button",className:b.default.clawbotTextButton,disabled:g,onClick:Xe,children:"移除配对"})]})]}):null]})}var u=require("react/jsx-runtime");function Je({ok:r,busy:t=!1}){return(0,u.jsx)("span",{className:C.default.statusDot,"data-state":t?"busy":r?"ready":"off","aria-hidden":!0})}function be({title:r,detail:t,ok:e,busy:a=!1}){return(0,u.jsxs)("div",{className:C.default.capability,children:[(0,u.jsx)(Je,{ok:e,busy:a}),(0,u.jsxs)("div",{className:C.default.capabilityCopy,children:[(0,u.jsx)("strong",{children:r}),(0,u.jsx)("span",{children:t})]})]})}function ve({describeHost:r,callManagement:t,store:e=pe(r,t),assistants:a,clawbotCall:s}){let{loadState:o,qrState:d,status:l,runtime:h,host:g,localOrigin:w,qr:p,error:f}=(0,ue.useSyncExternalStore)(e.subscribe,e.getSnapshot,e.getSnapshot),{refresh:_,generateQr:S}=e,P=(0,ue.useId)(),I=l?.publicRelay,n=I?.state==="enrolling"||I?.state==="connecting",N=I?.remoteAccess?.status,E=I?.state==="online"&&N==="active",T=N==="suspended"?"账户公网访问已暂停":N==="expired"?"公网访问已到期":N==="not_entitled"?"请在小程序中使用自助开通方式":N!=="active"?"配对后由小程序账户决定":E?"可在外网安全连接":n?"正在准备远程连接":"暂时离线",W=h?.publicDoor??l?.gate?.publicDoor,K=o==="ready"&&!!l?.lan.ip&&W?.state==="listening",M=I?.enabled===!0&&I.state!=="disabled",A=l?.agent?.agentName||g?.agentName||"DeepSeek Harness",re=l?.agent?.hostName||g?.computerName||"当前电脑";return(0,u.jsxs)("section",{className:C.default.root,"aria-labelledby":P,children:[(0,u.jsxs)("div",{className:C.default.hero,children:[(0,u.jsxs)("div",{className:C.default.identity,children:[(0,u.jsx)("span",{className:C.default.mark,"aria-hidden":!0,children:(0,u.jsx)(Me.FishLogo,{size:28})}),(0,u.jsxs)("div",{className:C.default.identityCopy,children:[(0,u.jsx)("h3",{id:P,children:"微信连接"}),(0,u.jsxs)("p",{children:[A,(0,u.jsx)("span",{"aria-hidden":!0,children:" · "}),re]})]})]}),(0,u.jsxs)("span",{className:C.default.overall,"data-ready":o==="ready",children:[(0,u.jsx)(Je,{ok:o==="ready",busy:o==="loading"}),o==="loading"?"检测中":o==="ready"?"服务正常":"暂不可用"]})]}),(0,u.jsxs)("div",{className:C.default.capabilities,children:[(0,u.jsx)(be,{title:"局域网直连",detail:o==="loading"?"检测中":K?"已就绪":"暂不可用",ok:K,busy:o==="loading"}),(0,u.jsx)(be,{title:"远程访问",detail:T,ok:E,busy:n||o==="loading"}),(0,u.jsx)(be,{title:"账号连接保护",detail:M?"已启用":"配对后启用",ok:M,busy:o==="loading"})]}),f!==null?(0,u.jsxs)("div",{className:C.default.notice,role:"status",children:[(0,u.jsx)("span",{children:f}),(0,u.jsx)("button",{type:"button",onClick:()=>void _(),children:"重试"})]}):null,d==="idle"?(0,u.jsxs)("div",{className:C.default.connectCard,children:[(0,u.jsxs)("div",{children:[(0,u.jsx)("strong",{children:"添加到微信"}),(0,u.jsx)("p",{children:"打开「Agent远程管理助手」→ 添加节点，扫描配对二维码。"})]}),(0,u.jsx)("button",{type:"button",className:C.default.primaryButton,disabled:o!=="ready",onClick:()=>void S(),children:"生成二维码"})]}):(0,u.jsxs)("div",{className:C.default.pairingCard,children:[(0,u.jsxs)("div",{className:C.default.pairingHead,children:[(0,u.jsxs)("div",{children:[(0,u.jsx)("strong",{children:"扫描二维码"}),(0,u.jsx)("p",{children:"小程序「设置 → 添加节点」"})]}),(0,u.jsx)("button",{type:"button",className:C.default.secondaryButton,disabled:d==="loading"||o!=="ready",onClick:()=>void S(),children:d==="loading"?"生成中…":"重新生成"})]}),(0,u.jsxs)("div",{className:C.default.qrArea,children:[o==="ready"&&d==="ready"&&p!==null?(0,u.jsx)("img",{className:C.default.qr,src:p.qrDataUrl,alt:"Agent远程管理助手配对二维码"}):(0,u.jsx)("div",{className:C.default.qrPlaceholder,"aria-live":"polite",children:o!=="ready"?"连接恢复后可查看二维码":d==="expired"?"二维码已过期，请重新生成":d==="error"?"生成失败":"正在生成…"}),d==="ready"&&p!==null?(0,u.jsxs)("small",{className:C.default.qrValidity,children:["有效至 ",new Date(p.expiresAt).toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"})," · 切换页面不重新生成"]}):null]}),(0,u.jsx)("p",{className:C.default.securityNote,children:p?.mode==="public-relay"?"配对后自动选择更快的连接；远程内容端到端加密。":"当前可通过同一局域网连接。"})]}),(0,u.jsxs)("section",{className:C.default.updateCard,"aria-label":"插件更新",children:[(0,u.jsx)("h3",{className:C.default.updateHeading,children:"插件更新"}),w&&e.updates?(0,u.jsx)(Ae,{store:e.updates,embedded:!0}):null,h?.profileScope==="desktop"&&e.nativeUpdates?(0,u.jsx)(Ie,{store:e.nativeUpdates,embedded:!0}):null,(0,u.jsx)(ce,{describeHost:r,callManagement:t,store:e,compact:!0})]}),a?(0,u.jsx)(ze,{store:a}):null,s?(0,u.jsx)(qe,{call:s,nodeName:A,hostName:re}):null]})}var he=class{constructor(t,e){this.call=t;this.openSession=e}state={catalog:null,preview:null,busy:!1,message:"",error:""};listeners=new Set;epoch=0;disposed=!1;getSnapshot=()=>this.state;subscribe=t=>(this.listeners.add(t),()=>{this.listeners.delete(t)});set(t){if(!this.disposed){this.state={...this.state,...t};for(let e of this.listeners)e()}}reset=()=>{this.epoch++,this.set({catalog:null,preview:null,busy:!1,message:"",error:""})};dispose=()=>{this.reset(),this.disposed=!0,this.listeners.clear()};async run(t){if(this.disposed||this.state.busy)return;let e=this.epoch,a=()=>!this.disposed&&e===this.epoch;this.set({busy:!0,error:""});try{await t(a)}catch(s){a()&&this.set({error:s instanceof Error?s.message:"操作未完成，请核对状态"})}finally{a()&&this.set({busy:!1})}}async read(t){t()&&this.set({catalog:null});try{let e=await this.call("assistantCatalog",{});if(!t())return;if(e?.schema!=="human.assistants.catalog.v1"||!Array.isArray(e.templates)||!Array.isArray(e.drafts))throw new Error("助手目录格式不受支持");this.set({catalog:e})}catch(e){throw t()&&this.set({message:""}),e}}load=()=>this.run(t=>this.read(t));readyAssistant(t){let e=this.state.catalog?.drafts?.find(a=>a.presetId===t);if(!e||e.state!=="installed"||e.nativeState&&e.nativeState!=="installed")throw new Error("此助手已停用或尚未就绪，请核对下方组件开关。");return e}start=(t,e)=>this.run(async a=>{if(this.set({message:""}),await this.read(a),!(!a()||e?.aborted)){if(this.readyAssistant(t),!this.openSession)throw new Error("当前 DSH 未提供快捷入口，请在新会话中选择此助手模式。");await this.openSession(t,e)}});dismissPreview=()=>{this.state.busy||this.set({preview:null,message:""})};choose=t=>this.run(async e=>{if(this.set({preview:null,message:""}),this.state.catalog?.templates?.find(l=>l.id===t)?.builtin){await this.read(e),e()&&this.set({message:"此助手已包含在插件里，请在新会话中选择；无需另装独立包。"});return}let s=this.state.catalog?.drafts?.find(l=>l.templateId===t&&l.state==="draft");if(s){let l=await this.call("assistantPreview",{id:s.id,version:s.version});e()&&this.set({preview:l});return}let o=await this.call("assistantDraft",{templateId:t});if(!e()||(await this.read(e),!e()))return;let d=await this.call("assistantPreview",{id:o.id,version:o.version});e()&&this.set({preview:d})});preview=(t,e)=>this.run(async a=>{this.set({preview:null});let s=await this.call("assistantPreview",{id:t,version:e});a()&&this.set({preview:s})});reinstall=(t,e)=>this.run(async a=>{if(this.set({preview:null,message:""}),this.state.catalog?.drafts?.some(d=>d.id===t&&d.version===e&&d.replacement)){await this.read(a),a()&&this.set({message:"这个旧模式已有内置版本，请在新会话中选择对应助手，无需重新安装旧包。"});return}let s=await this.call("assistantDraft",{sourceId:t,sourceVersion:e});if(!a()||(await this.read(a),!a()))return;let o=await this.call("assistantPreview",{id:s.id,version:s.version});a()&&this.set({preview:o})});install=()=>this.run(async t=>{let e=this.state.preview;if(!e||e.expiresAt<=Date.now())throw new Error("请重新预览后确认安装");this.set({preview:null,message:"已提交原生安装，请等待结果。"});try{let a=await this.call("assistantInstall",{id:e.id,version:e.version,digest:e.digest,previewId:e.previewId});t()&&this.set({message:a.message||(a.state==="installed"?"原生预设已生效":"请核对原生安装状态")})}finally{t()&&await this.read(t)}});verify=(t,e)=>this.run(async a=>{this.set({catalog:null,message:""});let s=await this.call("assistantStatus",{id:t,version:e});a()&&(this.set({message:s.message||"状态已核对"}),await this.read(a))})};function Ve(r){let t=0,e=!1;return{reset(){t++,e=!1},async start(a,s){if(!/^[a-z][a-z0-9_-]{0,63}$/.test(a))throw new Error("助手身份无效");if(e||s?.aborted)return;let o=t,d=r("uiWorkspace"),l=r("slots"),h=r("configForms")?.developerTools?.enabled?.getSnapshot(),g=l?.entries?.("conversation.hero.agentPreset"),w=Array.isArray(g)&&g.length===1?g[0]:void 0;if(h!==!0||typeof d?.clearMain!="function"||w?.options?.locale!=="settings.agentPreset"||typeof w?.inject!="function")throw new Error("当前 DSH 尚未提供快捷入口，请在原生新会话中选择此助手模式。");let p=w.inject(void 0);if(typeof p?.load!="function"||typeof p?.select!="function"||typeof p?.hooks?.agentPresetSeat?.getSnapshot!="function")throw new Error("当前 DSH 的模式选择入口不兼容，请使用原生新会话入口。");let f=()=>o===t&&!s?.aborted;e=!0;try{if(await p.load(),!f())return;let _=l.entries("conversation.hero.agentPreset");if(!Array.isArray(_)||_.length!==1||_[0]!==w)throw new Error("DSH 的模式入口已更新，请重新点击开始使用。");let S=p.hooks.agentPresetSeat.getSnapshot();if(S.busy||S.error||!S.options?.some(I=>I.id===a))throw new Error("此助手尚未就绪，请刷新状态后重试。");if(r("configForms")?.developerTools?.enabled?.getSnapshot()!==!0)throw new Error("DSH 的工作模式选择已关闭，请在原生设置中开启后重试。");d.clearMain();let P=await p.select(a);if(f()&&P)throw new Error(P)}finally{o===t&&(e=!1)}}}}var it=["slots","connection"];function ot(r){let t=async(p,f)=>{let _=await r.connection.rpc.call("/wechat-remote-management",p,f??{});if(!_.ok)throw Object.assign(new Error(_.error.message),{code:_.error.code});return _.value},e=async()=>{let p=await r.connection.rpc.call("/api","wechatHost/describe",{args:{request:{}}});if(!p.ok)throw new Error(`wechatHost/describe: ${p.error.code}`);let f=p.value;if(f?.ok!==!0||f.value===void 0)throw new Error("wechatHost/describe returned an invalid result");return f.value},a=new ee(e,t),s=0,o=async p=>{let f=s,_=await r.connection.rpc.call("/api","wechatClawbot/control",{args:{request:p}});if(f!==s)throw new Error("节点连接已变化，请刷新 ClawBot 状态");if(!_.ok)throw new Error("ClawBot 组件暂不可用，请核对下方组件开关");let S=_.value;if(!S?.ok)throw new Error(S?.error?.message||"ClawBot 状态读取失败");return S.value},d=async(p,f)=>{let _=s,S=await r.connection.rpc.call("/api",`humanTools/${p}`,{args:{request:f}});if(_!==s)throw new Error("电脑连接已变化，请重新查看助手目录");if(!S.ok)throw new Error(S.error.message);let P=S.value;if(!P?.ok||typeof P.valueJson!="string"||P.valueJson.length>256*1024)throw new Error(P?.error?.message||"此节点尚未提供助手能力");return JSON.parse(P.valueJson)},l,h=new he(d,async(p,f)=>{if(!l)throw new Error("原生会话入口尚未就绪，请稍后再试。");await l.start(p,f)});r.inject(["uiWorkspace","slots","configForms"],p=>{let f=Ve(_=>p.get(_));l=f,p.effect(()=>()=>{f.reset(),l===f&&(l=void 0)},"wechat assistant navigation")}),r.effect(()=>{let p=r.on("connection/reset",()=>{s++,l?.reset(),h.reset()});return()=>{s++,p(),h.dispose()}},"wechat assistant lifecycle"),r.effect(()=>()=>a.dispose(),"wechat shared page");let g=()=>De(p=>r.get(p)),w=()=>({describeHost:e,callManagement:t,store:a,assistants:h,clawbotCall:o});r.slots.inject("settings.section",()=>r.slots.register({name:"settings.section",id:"harness-remote",order:30,label:"微信连接",inject:w},ve));for(let p of["plugins.bundle.activation","plugins.bundle.config"])r.slots.inject(p,()=>{let f=["dsh-wechat-remote","@harness-remote/dsh-wechat-remote"].map(_=>r.slots.register({name:p,key:_,inject:w},p==="plugins.bundle.activation"?ce:ve));return()=>f.forEach(_=>_())});r.inject(["pluginNavigation","remote.pluginManager"],()=>r.slots.inject("sidebar.footer.action",()=>r.slots.register({name:"sidebar.footer.action",id:"harness-remote",order:30,label:"微信连接",inject:()=>({openPlugin:g})},Re)))}

return module.exports;}});
