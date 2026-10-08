window.__ModuleLoader__.load({id:"@harness-remote/dsh-wechat-remote",factory:(require)=>{var module={exports:{}};var exports=module.exports;"use strict";var Oe=Object.create;var ne=Object.defineProperty;var $e=Object.getOwnPropertyDescriptor;var Le=Object.getOwnPropertyNames;var We=Object.getPrototypeOf,Ge=Object.prototype.hasOwnProperty;var Fe=(n,t)=>()=>(t||n((t={exports:{}}).exports,t),t.exports),Xe=(n,t)=>{for(var e in t)ne(n,e,{get:t[e],enumerable:!0})},fe=(n,t,e,a)=>{if(t&&typeof t=="object"||typeof t=="function")for(let r of Le(t))!Ge.call(n,r)&&r!==e&&ne(n,r,{get:()=>t[r],enumerable:!(a=$e(t,r))||a.enumerable});return n};var O=(n,t,e)=>(e=n!=null?Oe(We(n)):{},fe(t||!n||!n.__esModule?ne(e,"default",{value:n,enumerable:!0}):e,n)),Qe=n=>fe(ne({},"__esModule",{value:!0}),n);var V=Fe((nt,ve)=>{"use strict";var Ze=`.hr_ac10537_root {\r
  box-sizing: border-box;\r
  width: 100%;\r
  max-width: 760px;\r
  color: var(--dsw-alias-label-primary, #171a20);\r
  display: flex;\r
  flex-direction: column;\r
  gap: 14px;\r
}\r
\r
.hr_ac10537_hero,\r
.hr_ac10537_connectCard,\r
.hr_ac10537_pairingCard {\r
  border: 1px solid var(--dsw-alias-border-l2, rgba(128, 140, 160, 0.22));\r
  background: var(--dsw-alias-bg-layer-3, #fff);\r
  border-radius: 12px;\r
}\r
\r
.hr_ac10537_hero {\r
  min-height: 72px;\r
  display: flex;\r
  align-items: center;\r
  justify-content: space-between;\r
  gap: 20px;\r
  padding: 16px 18px;\r
}\r
\r
.hr_ac10537_identity {\r
  min-width: 0;\r
  display: flex;\r
  align-items: center;\r
  gap: 12px;\r
}\r
\r
.hr_ac10537_mark {\r
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
.hr_ac10537_identityCopy {\r
  min-width: 0;\r
}\r
\r
.hr_ac10537_identityCopy h3,\r
.hr_ac10537_identityCopy p,\r
.hr_ac10537_connectCard p,\r
.hr_ac10537_pairingHead p,\r
.hr_ac10537_securityNote {\r
  margin: 0;\r
}\r
\r
.hr_ac10537_sidebarButton { display: flex; align-items: center; gap: 10px; width: 100%; min-height: 38px; padding: 8px 12px; border: 0; border-radius: 8px; background: transparent; color: var(--dsw-alias-label-secondary, #4d5564); font: inherit; font-size: 14px; cursor: pointer; text-align: left; }\r
.hr_ac10537_sidebarButton:hover { background: var(--dsw-alias-bg-layer-2, #eef1f5); color: var(--dsw-alias-label-primary, #171a20); }\r
.hr_ac10537_sidebarButton[data-wide='false'] { width: 36px; min-height: 36px; padding: 8px; justify-content: center; }\r
.hr_ac10537_sidebarButton svg { flex: none; }\r
.hr_ac10537_sidebarButton:focus-visible { outline: 2px solid var(--dsw-alias-state-business-primary, #4e79ff); outline-offset: 2px; }\r
.hr_ac10537_actions { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 16px; }\r
.hr_ac10537_pageDialog.hr_ac10537_pageDialog { width: min(820px, 100%); max-height: 100%; }\r
.hr_ac10537_pageDialogContent.hr_ac10537_pageDialogContent { min-height: 0; overflow-y: auto; }\r
.hr_ac10537_helpText { color: var(--dsw-alias-label-secondary, #647084); font-size: 12px; line-height: 1.7; margin: 8px 0; }\r
\r
.hr_ac10537_companionCard {\r
  border: 1px solid var(--dsw-alias-state-business-primary, #4e79ff);\r
  border-left-width: 4px;\r
  border-radius: 10px;\r
  background: var(--dsw-alias-bg-layer-3, #fff);\r
  padding: 14px 16px;\r
  line-height: 1.6;\r
  overflow-wrap: anywhere;\r
}\r
.hr_ac10537_companionCard strong { font-size: 14px; }\r
.hr_ac10537_companionCard p { margin: 4px 0; font-size: 13px; }\r
.hr_ac10537_companionCard small { color: var(--dsw-alias-label-secondary, #4d5564); }\r
.hr_ac10537_companionCard progress { display: block; width: 100%; margin: 8px 0; accent-color: #4e79ff; }\r
.hr_ac10537_companionCard[data-state='complete'] { border-color: var(--dsw-alias-state-success-primary, #1f9d68); }\r
.hr_ac10537_companionCard[data-state='unavailable'], .hr_ac10537_companionCard[data-state='recovering'] { border-color: #b5861d; }

/* Assistant modes are a compact owner-facing catalog, not an installation log. */
.hr_ac10537_assistantsCard { padding: 14px 18px; border: 1px solid var(--dsw-alias-border-l2, #e2e6ee); border-radius: 12px; background: var(--dsw-alias-bg-layer-3, #fff); line-height: 1.5; overflow-wrap: anywhere; }
.hr_ac10537_assistantsCard h3, .hr_ac10537_assistantsCard h4, .hr_ac10537_assistantsCard p { margin: 0; }
.hr_ac10537_assistantsCard h3 { font-size: 14px; }
.hr_ac10537_assistantsCard h4 { font-size: 14px; margin: 16px 0 6px; }
.hr_ac10537_assistantsCard p { color: var(--dsw-alias-label-secondary, #647084); font-size: 12px; }
.hr_ac10537_assistantsHeading { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 4px; }
.hr_ac10537_assistantsHeading p { margin-top: 4px; }
.hr_ac10537_assistantChoices { display: flex; flex-direction: column; }
.hr_ac10537_assistantChoice { padding: 10px 0; display: flex; align-items: center; gap: 12px; }
.hr_ac10537_assistantChoiceCopy { flex: 1; min-width: 0; }
.hr_ac10537_assistantChoiceHead, .hr_ac10537_assistantEntryHead { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 8px; }
.hr_ac10537_assistantChoiceHead { justify-content: flex-start; gap: 6px; }
.hr_ac10537_assistantChoiceHead strong { font-size: 13px; }
.hr_ac10537_assistantChoice p { flex: 1; }
.hr_ac10537_assistantStatus { color: var(--dsw-alias-state-success-primary, #17845b); font-size: 12px; }
.hr_ac10537_assistantPrimary, .hr_ac10537_assistantSecondary, .hr_ac10537_assistantTextButton { min-height: 42px; padding: 9px 16px; border-radius: 9px; font: inherit; font-size: 13px; cursor: pointer; }
.hr_ac10537_assistantPrimary { color: #fff; background: var(--dsw-alias-state-business-primary, #4e79ff); border: 1px solid transparent; }
.hr_ac10537_assistantSecondary { color: var(--dsw-alias-state-business-primary, #4e79ff); background: var(--dsw-alias-bg-layer-3, #fff); border: 1px solid var(--dsw-alias-border-l2, #d7deed); }
.hr_ac10537_assistantTextButton { min-height: 32px; padding: 3px 8px; border: 0; background: transparent; color: var(--dsw-alias-state-business-primary, #4e79ff); }
.hr_ac10537_assistantPrimary:disabled, .hr_ac10537_assistantSecondary:disabled, .hr_ac10537_assistantTextButton:disabled { opacity: .5; cursor: default; }
.hr_ac10537_assistantPrimary:focus-visible, .hr_ac10537_assistantSecondary:focus-visible, .hr_ac10537_assistantTextButton:focus-visible, .hr_ac10537_assistantDetails summary:focus-visible { outline: 2px solid var(--dsw-alias-state-business-primary, #4e79ff); outline-offset: 3px; }
.hr_ac10537_assistantCustomize { margin-top: 2px; border-top: 1px solid var(--dsw-alias-border-l2, #e2e6ee); }
.hr_ac10537_assistantCustomize > p { margin-bottom: 10px; }
.hr_ac10537_assistantCustomize .hr_ac10537_assistantChoice { background: transparent; }
.hr_ac10537_assistantDetails { margin-top: 14px; color: var(--dsw-alias-label-secondary, #647084); font-size: 12px; }
.hr_ac10537_assistantDetails summary { padding: 5px 0; cursor: pointer; }
.hr_ac10537_assistantDetails ul { margin: 8px 0; padding-left: 20px; }
.hr_ac10537_assistantDetails li { margin: 5px 0; }
.hr_ac10537_assistantPreview { padding: 14px; margin-top: 16px !important; border-radius: 10px; background: var(--dsw-alias-bg-layer-1, #f0f4ff); }
.hr_ac10537_assistantUnavailable { color: var(--dsw-alias-label-secondary, #647084); font-size: 12px; }
.hr_ac10537_assistantHelpAnchor { display: inline-flex; position: relative; }
.hr_ac10537_assistantHelpButton { padding: 0; width: 17px; height: 17px; border-radius: 50%; border: 1px solid var(--dsw-alias-border-l2, #bec6d2); background: transparent; color: var(--dsw-alias-label-tertiary, #8490a2); font: inherit; font-size: 11px; cursor: help; }
.hr_ac10537_assistantTooltip { visibility: hidden; opacity: 0; position: absolute; z-index: 2; top: 24px; left: 0; width: min(300px, 55vw); padding: 10px 12px; border-radius: 8px; border: 1px solid var(--dsw-alias-border-l2, #d7deed); background: var(--dsw-alias-bg-layer-3, #fff); color: var(--dsw-alias-label-secondary, #647084); box-shadow: 0 4px 16px #0002; font-size: 12px; font-weight: normal; }
.hr_ac10537_assistantHelpAnchor:hover .hr_ac10537_assistantTooltip, .hr_ac10537_assistantHelpAnchor:focus-within .hr_ac10537_assistantTooltip { visibility: visible; opacity: 1; }
.hr_ac10537_assistantPreview h4 { margin-top: 0; }
.hr_ac10537_assistantPreview p + p { margin-top: 8px; }
.hr_ac10537_assistantButtons { display: flex; gap: 10px; flex-wrap: wrap; margin-top: 14px; }
.hr_ac10537_assistantEntry { margin-top: 10px; padding: 12px 0; border-top: 1px solid var(--dsw-alias-border-l2, #e2e6ee); }
.hr_ac10537_assistantEntryHead { margin-bottom: 8px; font-size: 13px; }
.hr_ac10537_assistantEntryHead > span { color: var(--dsw-alias-label-secondary, #647084); font-size: 12px; }
.hr_ac10537_assistantEntry > button + button { margin-left: 8px; }
@media (max-width: 520px) { .hr_ac10537_assistantsCard { padding: 12px; } .hr_ac10537_assistantChoice { gap: 8px; } }
\r
.hr_ac10537_identityCopy h3 {\r
  font-size: 15px;\r
  font-weight: 650;\r
  line-height: 22px;\r
}\r
\r
.hr_ac10537_identityCopy p {\r
  color: var(--dsw-alias-label-tertiary, #7d8492);\r
  font-size: 12px;\r
  line-height: 18px;\r
  overflow: hidden;\r
  text-overflow: ellipsis;\r
  white-space: nowrap;\r
}\r
\r
.hr_ac10537_overall {\r
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
.hr_ac10537_overall[data-ready='true'] {\r
  color: var(--dsw-alias-state-success-primary, #1f9d68);\r
}\r
\r
.hr_ac10537_statusDot {\r
  width: 7px;\r
  height: 7px;\r
  background: var(--dsw-alias-label-tertiary, #8b93a2);\r
  border-radius: 999px;\r
  flex: none;\r
}\r
\r
.hr_ac10537_statusDot[data-state='ready'] {\r
  background: var(--dsw-alias-state-success-primary, #1f9d68);\r
}\r
\r
.hr_ac10537_statusDot[data-state='busy'] {\r
  background: var(--dsw-alias-state-business-primary, #4e79ff);\r
  animation: harnessRemotePulse 1.2s ease-in-out infinite;\r
}\r
\r
.hr_ac10537_capabilities {\r
  grid-template-columns: repeat(3, minmax(0, 1fr));\r
  gap: 10px;\r
  display: grid;\r
}\r
\r
.hr_ac10537_capability {\r
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
.hr_ac10537_capability > .hr_ac10537_statusDot {\r
  margin-top: 6px;\r
}\r
\r
.hr_ac10537_capabilityCopy {\r
  min-width: 0;\r
  display: flex;\r
  flex-direction: column;\r
  gap: 1px;\r
}\r
\r
.hr_ac10537_capabilityCopy strong {\r
  font-size: 12.5px;\r
  font-weight: 600;\r
  line-height: 19px;\r
}\r
\r
.hr_ac10537_capabilityCopy span {\r
  color: var(--dsw-alias-label-tertiary, #7d8492);\r
  font-size: 11px;\r
  line-height: 17px;\r
  overflow: hidden;\r
  text-overflow: ellipsis;\r
  white-space: nowrap;\r
}\r
\r
.hr_ac10537_notice {\r
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
.hr_ac10537_notice button,\r
.hr_ac10537_secondaryButton {\r
  border: 1px solid var(--dsw-alias-border-l2, rgba(128, 140, 160, 0.28));\r
  color: var(--dsw-alias-label-primary, #171a20);\r
  background: var(--dsw-alias-bg-layer-1, #f5f6f8);\r
  border-radius: 7px;\r
  font: inherit;\r
  cursor: pointer;\r
}\r
\r
.hr_ac10537_notice button {\r
  flex: none;\r
  padding: 3px 9px;\r
}\r
\r
.hr_ac10537_connectCard {\r
  display: flex;\r
  align-items: center;\r
  justify-content: space-between;\r
  gap: 20px;\r
  padding: 18px;\r
}\r
\r
.hr_ac10537_connectCard strong,\r
.hr_ac10537_pairingHead strong {\r
  font-size: 14px;\r
  font-weight: 650;\r
  line-height: 21px;\r
}\r
\r
.hr_ac10537_connectCard p,\r
.hr_ac10537_pairingHead p {\r
  max-width: 470px;\r
  color: var(--dsw-alias-label-tertiary, #7d8492);\r
  font-size: 12px;\r
  line-height: 18px;\r
}\r
\r
.hr_ac10537_primaryButton {\r
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
.hr_ac10537_primaryButton:hover {\r
  filter: brightness(1.04);\r
}\r
\r
.hr_ac10537_primaryButton:focus-visible,\r
.hr_ac10537_secondaryButton:focus-visible,\r
.hr_ac10537_notice button:focus-visible {\r
  outline: 2px solid var(--dsw-alias-state-business-primary, #4e79ff);\r
  outline-offset: 2px;\r
}\r
\r
.hr_ac10537_pairingCard {\r
  padding: 18px;\r
}\r
\r
.hr_ac10537_pairingHead {\r
  display: flex;\r
  align-items: center;\r
  justify-content: space-between;\r
  gap: 16px;\r
}\r
\r
.hr_ac10537_secondaryButton {\r
  min-height: 32px;\r
  flex: none;\r
  padding: 0 11px;\r
  font-size: 12px;\r
}\r
\r
.hr_ac10537_secondaryButton:disabled,\r
.hr_ac10537_primaryButton:disabled {\r
  cursor: default;\r
  opacity: 0.55;\r
}\r
\r
.hr_ac10537_qrArea {\r
  min-height: 292px;\r
  margin-top: 16px;\r
  display: flex;\r
  flex-direction: column;\r
  align-items: center;\r
  justify-content: center;\r
  gap: 10px;\r
}\r
\r
.hr_ac10537_qr,\r
.hr_ac10537_qrPlaceholder {\r
  box-sizing: border-box;\r
  width: 280px;\r
  height: 280px;\r
  border-radius: 12px;\r
}\r
\r
.hr_ac10537_qr {\r
  background: #fff;\r
  padding: 10px;\r
  image-rendering: pixelated;\r
}\r
\r
.hr_ac10537_qrPlaceholder {\r
  color: var(--dsw-alias-label-tertiary, #7d8492);\r
  background: var(--dsw-alias-bg-layer-1, #f5f6f8);\r
  border: 1px dashed var(--dsw-alias-border-l2, rgba(128, 140, 160, 0.28));\r
  display: grid;\r
  place-items: center;\r
  font-size: 12px;\r
}\r
\r
.hr_ac10537_qrValidity {\r
  color: var(--dsw-alias-label-tertiary, #7d8492);\r
  font-size: 11px;\r
  line-height: 17px;\r
}\r
\r
.hr_ac10537_securityNote {\r
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
  .hr_ac10537_statusDot[data-state='busy'] {\r
    animation: none;\r
  }\r
}\r
\r
@media (max-width: 680px) {\r
  .hr_ac10537_capabilities {\r
    grid-template-columns: minmax(0, 1fr);\r
  }\r
\r
  .hr_ac10537_connectCard {\r
    align-items: stretch;\r
    flex-direction: column;\r
  }\r
\r
  .hr_ac10537_primaryButton {\r
    width: 100%;\r
  }\r
\r
  .hr_ac10537_qrArea {\r
    flex-direction: column;\r
    gap: 12px;\r
  }\r
\r
}\r
.hr_ac10537_updateCard { border: 1px solid var(--dsw-alias-border-l2, #ddd); background: var(--dsw-alias-bg-layer-3, #fff); border-radius: 12px; padding: 14px 18px; line-height: 1.5; font-size: 13px; overflow-wrap: anywhere; }
.hr_ac10537_updateHeading { font-size: 14px; line-height: 21px; margin: 0 0 8px; }
.hr_ac10537_updateRow { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 8px 16px; }
.hr_ac10537_updateCopy { flex: 1 1 240px; min-width: 0; }
.hr_ac10537_updateControl { display: flex; flex-direction: column; align-items: flex-end; gap: 2px; max-width: 100%; }
.hr_ac10537_updateControl .hr_ac10537_updateLabel { font-size: 12px; font-weight: 500; }
.hr_ac10537_updateControl .hr_ac10537_updateChecked { margin-top: 0; }
.hr_ac10537_updateRow > .hr_ac10537_updateActions { margin-top: 0; }
.hr_ac10537_updateEndpoint p, .hr_ac10537_companionInline p { margin: 4px 0; }
.hr_ac10537_updateScope { color: var(--dsw-alias-label-tertiary, #7d8492); font-size: 12px; font-weight: 400; }
.hr_ac10537_updateEndpoint + div { margin-top: 10px; padding-top: 10px; border-top: 1px solid var(--dsw-alias-border-l2, #ddd); }
.hr_ac10537_updateActions { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; margin-top: 8px; }
.hr_ac10537_updateActions .hr_ac10537_primaryButton { width: auto; min-height: 32px; padding: 0 12px; }
.hr_ac10537_updateActions .hr_ac10537_secondaryButton { min-height: 32px; }
.hr_ac10537_updatePeerNote { margin: 0; color: var(--dsw-alias-label-tertiary, #7d8492); font-size: 12px; }
.hr_ac10537_updateDetails { color: var(--dsw-alias-label-secondary, #647084); font-size: 12px; }
.hr_ac10537_updateDetails summary { cursor: pointer; margin-top: 4px; }
.hr_ac10537_companionInline strong { font-size: 13px; font-weight: 500; }
.hr_ac10537_companionInline small { display: block; color: var(--dsw-alias-label-secondary, #647084); font-size: 12px; margin-top: 4px; }
.hr_ac10537_companionInline progress { display: block; width: 100%; height: 8px; margin: 8px 0; accent-color: var(--dsw-alias-state-business-primary, #4e79ff); }
.hr_ac10537_companionInline[data-state='complete'] .hr_ac10537_updateCopy > strong { color: var(--dsw-alias-state-success-primary, #1f9d68); }
.hr_ac10537_companionInline[data-state='unavailable'] .hr_ac10537_updateCopy > strong, .hr_ac10537_companionInline[data-state='recovering'] .hr_ac10537_updateCopy > strong { color: #b5861d; }
.hr_ac10537_updateLabel { color: inherit; }\r
.hr_ac10537_updateLabel[data-severity="none"] { color: #218b5c; }\r
.hr_ac10537_updateLabel[data-severity="unknown"] { color: var(--text-secondary, #858b96); }\r
.hr_ac10537_updateLabel[data-severity="required"] { color: #d54052; }\r
.hr_ac10537_updateLabel[data-severity="recommended"], .hr_ac10537_updateLabel[data-severity="info"] { color: #b5861d; }\r
.hr_ac10537_updateProgress { width: 100%; height: 8px; margin-top: 8px; accent-color: #7487ef; }
.hr_ac10537_updateVersions { display: flex; flex-wrap: wrap; gap: 4px 16px; margin: 6px 0; }
.hr_ac10537_updateVersions span { color: var(--text-secondary, #858b96); }\r
.hr_ac10537_updateVersions strong { color: var(--text-primary, inherit); font-weight: 500; }\r
.hr_ac10537_updateCommand { display: flex; flex-wrap: wrap; align-items: center; gap: 12px; margin-top: 12px; }\r
.hr_ac10537_updateCommand code { flex: 1 1 240px; white-space: pre-wrap; overflow-wrap: anywhere; user-select: text; }\r
.hr_ac10537_updateChecked { display: block; margin-top: 4px; color: var(--text-secondary, #858b96); font-size: 11px; }
.hr_ac10537_clawbotHead, .hr_ac10537_clawbotRow { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.hr_ac10537_clawbotHead h3 { display: flex; align-items: center; gap: 8px; }
.hr_ac10537_clawbotHead small { font-size: 11px; font-weight: normal; color: var(--muted-foreground, #7b8491); }
.hr_ac10537_clawbotRow { margin: 10px 0; flex-wrap: wrap; }
.hr_ac10537_clawbotNode { margin: 8px 0 0; font-size: 13px; overflow-wrap: anywhere; color: var(--muted-foreground, #7b8491); }
.hr_ac10537_clawbotSection { margin-top: 14px; }
.hr_ac10537_clawbotSection + .hr_ac10537_clawbotSection { border-top: 1px solid var(--border, #ddd); padding-top: 8px; }
.hr_ac10537_clawbotRow select { flex: 1; min-width: 180px; max-width: 100%; border: 1px solid var(--border, #ddd); border-radius: 8px; padding: 8px; color: inherit; background: transparent; }
.hr_ac10537_clawbotToggle { display: flex; gap: 6px; align-items: center; font-size: 13px; white-space: nowrap; }
.hr_ac10537_clawbotNote { font-size: 12px; line-height: 1.6; color: var(--muted-foreground, #7b8491); margin: 8px 0; }
.hr_ac10537_clawbotError { color: #b23b36; font-size: 13px; }
.hr_ac10537_clawbotPairing { display: flex; align-items: center; gap: 20px; flex-wrap: wrap; margin-top: 12px; }
.hr_ac10537_clawbotPairing img { border-radius: 8px; }
.hr_ac10537_clawbotPairing input { border: 1px solid var(--border, #ddd); border-radius: 6px; padding: 8px; width: 120px; color: inherit; background: transparent; }
.hr_ac10537_clawbotPairing button + button, .hr_ac10537_clawbotPairing input + button { margin-left: 8px; }
.hr_ac10537_clawbotMark { display: inline-flex; flex: 0 0 22px; width: 22px; height: 22px; border-radius: 50%; background: #e54443; align-items: center; justify-content: center; gap: 3px; }
.hr_ac10537_clawbotMark::before, .hr_ac10537_clawbotMark::after { content: ''; display: block; width: 5px; height: 5px; border-radius: 50%; background: #fff; }
`,be="@harness-remote/dsh-wechat-remote/HarnessRemoteSettings.module.css";if(typeof document<"u"&&document.querySelector("style[data-plugin-css="+JSON.stringify(be)+"]")===null){let n=document.createElement("style");n.dataset.plugin="@harness-remote/dsh-wechat-remote",n.dataset.pluginCss=be,n.textContent=Ze,document.head.appendChild(n)}ve.exports={root:"hr_ac10537_root",hero:"hr_ac10537_hero",connectCard:"hr_ac10537_connectCard",pairingCard:"hr_ac10537_pairingCard",identity:"hr_ac10537_identity",mark:"hr_ac10537_mark",identityCopy:"hr_ac10537_identityCopy",pairingHead:"hr_ac10537_pairingHead",securityNote:"hr_ac10537_securityNote",sidebarButton:"hr_ac10537_sidebarButton",actions:"hr_ac10537_actions",pageDialog:"hr_ac10537_pageDialog",pageDialogContent:"hr_ac10537_pageDialogContent",helpText:"hr_ac10537_helpText",companionCard:"hr_ac10537_companionCard",assistantsCard:"hr_ac10537_assistantsCard",assistantsHeading:"hr_ac10537_assistantsHeading",assistantChoices:"hr_ac10537_assistantChoices",assistantChoice:"hr_ac10537_assistantChoice",assistantChoiceCopy:"hr_ac10537_assistantChoiceCopy",assistantChoiceHead:"hr_ac10537_assistantChoiceHead",assistantEntryHead:"hr_ac10537_assistantEntryHead",assistantStatus:"hr_ac10537_assistantStatus",assistantPrimary:"hr_ac10537_assistantPrimary",assistantSecondary:"hr_ac10537_assistantSecondary",assistantTextButton:"hr_ac10537_assistantTextButton",assistantDetails:"hr_ac10537_assistantDetails",assistantCustomize:"hr_ac10537_assistantCustomize",assistantPreview:"hr_ac10537_assistantPreview",assistantUnavailable:"hr_ac10537_assistantUnavailable",assistantHelpAnchor:"hr_ac10537_assistantHelpAnchor",assistantHelpButton:"hr_ac10537_assistantHelpButton",assistantTooltip:"hr_ac10537_assistantTooltip",assistantButtons:"hr_ac10537_assistantButtons",assistantEntry:"hr_ac10537_assistantEntry",overall:"hr_ac10537_overall",statusDot:"hr_ac10537_statusDot",capabilities:"hr_ac10537_capabilities",capability:"hr_ac10537_capability",capabilityCopy:"hr_ac10537_capabilityCopy",notice:"hr_ac10537_notice",secondaryButton:"hr_ac10537_secondaryButton",primaryButton:"hr_ac10537_primaryButton",qrArea:"hr_ac10537_qrArea",qr:"hr_ac10537_qr",qrPlaceholder:"hr_ac10537_qrPlaceholder",qrValidity:"hr_ac10537_qrValidity",updateCard:"hr_ac10537_updateCard",updateHeading:"hr_ac10537_updateHeading",updateRow:"hr_ac10537_updateRow",updateCopy:"hr_ac10537_updateCopy",updateControl:"hr_ac10537_updateControl",updateLabel:"hr_ac10537_updateLabel",updateChecked:"hr_ac10537_updateChecked",updateActions:"hr_ac10537_updateActions",updateEndpoint:"hr_ac10537_updateEndpoint",companionInline:"hr_ac10537_companionInline",updateScope:"hr_ac10537_updateScope",updatePeerNote:"hr_ac10537_updatePeerNote",updateDetails:"hr_ac10537_updateDetails",updateProgress:"hr_ac10537_updateProgress",updateVersions:"hr_ac10537_updateVersions",updateCommand:"hr_ac10537_updateCommand",clawbotHead:"hr_ac10537_clawbotHead",clawbotRow:"hr_ac10537_clawbotRow",clawbotNode:"hr_ac10537_clawbotNode",clawbotSection:"hr_ac10537_clawbotSection",clawbotToggle:"hr_ac10537_clawbotToggle",clawbotNote:"hr_ac10537_clawbotNote",clawbotError:"hr_ac10537_clawbotError",clawbotPairing:"hr_ac10537_clawbotPairing",clawbotMark:"hr_ac10537_clawbotMark"}});var tt={};Xe(tt,{apply:()=>et,inject:()=>Ye});module.exports=Qe(tt);var ke=require("react"),Ce=require("@deepseek-ai/dsh-client-ui-primitives");var j=O(V(),1),_=require("react/jsx-runtime");function ye({value:n,onDecide:t,deciding:e=!1,compact:a=!1}){if(!n||!a&&n.state==="idle")return null;let r={"confirmation-required":"是否更新下方指定端的插件？",deferred:"已暂缓此次联动更新",pending:"联动更新待处理",busy:"等待待更新端的任务结束",preparing:"正在准备联动更新",installing:"正在安装插件更新",verifying:"正在核验更新后的恢复状态",recovering:"正在恢复更新前的插件","restart-required":"待更新端需启动或重启确认","self-restart-required":"当前端待重启，尚未生效",unverified:"两端更新状态待核实",complete:"两端插件已对齐",unavailable:"联动更新尚未确认成功"},o=["preparing","installing","verifying","recovering"].includes(n.state),c=n.versions?.peer==="desktop"?"Desktop":n.versions?.peer==="web"?"Web":null,l=n.target?.scope==="desktop"?"Desktop":n.target?.scope==="web"?"Web":null,h=l||"更新端",g={pending:`等待 ${h} 就绪`,busy:`${h} 有任务，等待空闲`,preparing:`正在准备 ${h} 更新`,installing:`正在更新 ${h}`,verifying:`正在核对 ${h} 更新结果`,recovering:`正在恢复 ${h} 原版本`,"restart-required":`${h} 已安装，待启动或重连确认`,"self-restart-required":"当前端待重启，尚未生效",unverified:"更新状态待核对",complete:"两端版本已同步",unavailable:"更新未完成，请核对"},v=["confirmation-required","deferred"].includes(n.state);if(a&&n.state==="idle"&&!n.versions?.peerInstalled)return(0,_.jsx)("p",{className:j.default.updatePeerNote,children:"未检测到可同步更新的另一端；当前端可独立使用。"});let d=n.state==="idle"?"未发现待确认的同步更新":a&&v&&l&&n.target?`${l} 可更新至 ${n.target.version}${n.state==="deferred"?" · 已暂缓":""}`:a&&n.state==="self-restart-required"?"当前端重启后可检查同步更新":(a?g[n.state]:void 0)||r[n.state]||"插件更新状态待核对",f=v&&n.offerId&&t?(0,_.jsxs)("div",{className:j.default.updateActions,children:[(0,_.jsx)("button",{type:"button",className:j.default.primaryButton,disabled:e,onClick:()=>t("approve"),children:e?"确认中…":l?`确认更新 ${l}`:"确认更新指定端"}),(0,_.jsx)("button",{type:"button",className:j.default.secondaryButton,disabled:e,onClick:()=>t("later"),children:"稍后再说"})]}):null;return(0,_.jsxs)("aside",{className:a?j.default.companionInline:j.default.companionCard,"data-state":n.state,role:"status","aria-live":"polite",children:[a?(0,_.jsxs)("div",{className:j.default.updateRow,children:[(0,_.jsxs)("div",{className:j.default.updateCopy,children:[c?(0,_.jsxs)("div",{className:j.default.updateVersions,children:[(0,_.jsxs)("strong",{children:[c," ",(0,_.jsx)("span",{className:j.default.updateScope,children:"同一主机"})]}),(0,_.jsx)("span",{children:n.versions?.peerInstalled?`已安装 ${n.versions.peerInstalled}`:"安装或启用状态未确认"})]}):null,(0,_.jsx)("strong",{children:d})]}),f]}):(0,_.jsx)("strong",{children:d}),a?(0,_.jsx)(_.Fragment,{children:n.state!=="idle"&&n.message?(0,_.jsxs)("details",{className:j.default.updateDetails,children:[(0,_.jsx)("summary",{children:"详细状态"}),(0,_.jsx)("p",{children:n.message})]}):null}):n.message?(0,_.jsx)("p",{children:n.message}):null,!a&&n.versions?(0,_.jsxs)("small",{children:[n.versions.current==="desktop"?"Desktop":"Web","：运行 ",n.versions.running," · 已安装 ",n.versions.installed??"未确认","；",c,"：已安装 ",n.versions.peerInstalled??"未确认或未启用"]}):null,f?(0,_.jsxs)(_.Fragment,{children:[a?null:f,(0,_.jsx)("small",{className:j.default.updateChecked,children:"空闲后更新，连接会短暂中断；保留配对与会话。"})]}):null,o?(0,_.jsx)("progress",{"aria-label":"联动更新进度"}):null,n.state==="busy"?(0,_.jsx)("small",{children:"不用手动停止任务。请保持两端运行，空闲后会继续检查。"}):o?(0,_.jsx)("small",{children:"请保持两端当前状态，暂勿退出、重启或重复安装。关闭本设置页不会取消更新。"}):n.state==="unavailable"?(0,_.jsx)("small",{children:"请在待更新端核对版本，必要时使用其原安装入口。"}):null]})}async function _e(n,t,e=fetch){let a=await n(),r=a.gate;if(!r)throw new Error("当前节点没有提供配对入口");let o=r.profileScope==="desktop",c=r.localDoor?.port,l=Number.isSafeInteger(c)&&c>=1&&c<=65535?`http://127.0.0.1:${c}`:null;if(r.management==="authenticated-rpc")return{host:a,runtime:r,localOrigin:o?null:l,status:()=>t("status"),pairCode:()=>t("pair-code"),decide:(g,v)=>t("companion-decision",{offerId:g,action:v})};if(o||r.management==="unavailable"||!l||r.localDoor.state!=="listening")throw new Error("当前节点配对入口尚未就绪");let h=async g=>{let v=await e(l+g,{cache:"no-store"});if(!v.ok)throw new Error(`配对请求失败 (${v.status})`);return v.json()};return{host:a,runtime:r,localOrigin:l,status:()=>h("/gate/status"),pairCode:()=>h("/pair/code"),decide:async(g,v)=>{let d=await e(l+"/gate/companion/decision",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({offerId:g,action:v})});if(!d.ok)throw new Error("更新通知已变化，请刷新后重试");return d.json()}}}var se=class{constructor(t,e=globalThis.fetch){this.origin=t;this.fetcher=e.bind(globalThis)}value={check:null,checking:!1,progress:null,error:"",copied:!1,resumeFailed:!1};listeners=new Set;reading;installing=!1;disposed=!1;job=null;timer;pollGeneration=0;recovering=!1;fetcher;getSnapshot=()=>this.value;subscribe=t=>this.disposed?()=>{}:(this.listeners.add(t),this.listeners.size===1&&this.refresh(),()=>{this.listeners.delete(t)});patch(t){if(!this.disposed){this.value={...this.value,...t};for(let e of this.listeners)e()}}refresh=()=>this.disposed?Promise.resolve():this.reading?this.reading:(this.patch({checking:!0,error:"",copied:!1}),this.reading=(async()=>{try{let t=await this.fetcher(this.origin+"/gate/update/check",{signal:AbortSignal.timeout(1e4)}),e=await t.json();if(!t.ok)throw new Error(e.error||"暂时无法检查更新");if(!e.advice?.current||typeof e.advice.label!="string")throw new Error("更新检查返回信息不完整");if(this.patch({check:e}),this.installing||this.job||this.recovering)return;e.activeJob?.statusOrigin?this.follow(e.activeJob):e.lastResult?.phase==="unknown"?this.patch({progress:e.lastResult}):e.mode==="busy"?this.patch({progress:{phase:"preparing",progress:0,message:"更新仍在准备或等待确认，请稍后重新检查；不要重复安装。",terminal:!0}}):this.patch({progress:e.lastResult??null})}catch(t){this.patch({check:null,error:t instanceof Error?t.message:"暂时无法检查更新"})}finally{this.patch({checking:!1})}})().finally(()=>{this.reading=void 0}),this.reading);follow(t){if(this.disposed||this.job?.jobId===t.jobId)return;this.job=t;let e=++this.pollGeneration,a=Date.now()+10*6e4;clearTimeout(this.timer),this.patch({progress:{phase:"recovering",progress:0,message:"正在恢复更新进度…",terminal:!1}});let r=async()=>{if(this.disposed||e!==this.pollGeneration)return;let o;try{let c=await this.fetcher(t.statusOrigin+"/status",{headers:{Authorization:"Bearer "+t.statusToken},signal:AbortSignal.timeout(4e3)});if(!c.ok)throw new Error("进度暂不可用");let l=await c.json();if(l.jobId!==t.jobId||typeof l.terminal!="boolean"||typeof l.message!="string")throw new Error("进度不匹配");o=l}catch{try{let c=await this.fetcher(this.origin+"/gate/update/status",{signal:AbortSignal.timeout(3e3)}),l=await c.json();c.ok&&l.lastResult?.jobId===t.jobId&&(o=l.lastResult)}catch{}}if(!(this.disposed||e!==this.pollGeneration)){if(o&&(this.patch({progress:o}),o.terminal)){this.job=null,o.ok?this.resume(t.jobId):this.refresh();return}if(Date.now()>a){this.job=null,this.patch({progress:{phase:"unknown",progress:0,message:"暂时无法确认更新结果。请重新打开此主机 WebUI 检查版本；不要重复安装或删除节点。",terminal:!0}});return}this.timer=setTimeout(()=>void r(),1e3)}};r()}async resume(t){this.recovering=!0;let e=Date.now()+3e4,a=async()=>{try{let r=await this.fetcher(this.origin+"/gate/update/resume?job="+encodeURIComponent(t),{signal:AbortSignal.timeout(3e3)});if(!r.ok)throw new Error("尚未恢复");let o=await r.json();if(!o.url)throw new Error("缺少恢复地址");let c=new URL(o.url);if(c.origin!==window.location.origin||c.pathname!=="/"||c.username||c.password||c.hash)throw new Error("恢复地址不匹配");this.disposed||window.location.replace(c.href)}catch{if(this.disposed)return;if(Date.now()>=e){this.recovering=!1,this.patch({resumeFailed:!0});return}this.timer=setTimeout(()=>void a(),1e3)}};await a()}install=async()=>{let{check:t,checking:e,error:a,progress:r}=this.value;if(this.disposed||!t?.canInstall||e||a||r&&!r.terminal||this.installing||this.job||this.recovering)return;this.installing=!0,this.patch({error:"",check:{...t,canInstall:!1,ticket:""},progress:{phase:"download",progress:10,message:"正在下载并验证更新包；当前插件尚未替换",terminal:!1}});let o=!1;try{let c=await this.fetcher(this.origin+"/gate/update/start",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({ticket:t.ticket})}),l=await c.json();if(o=!c.ok&&typeof l.error=="string",!c.ok||!l.statusOrigin)throw new Error(l.error||"无法取得更新进度，请重新检查");this.follow(l)}catch(c){if(this.disposed)return;if(o)this.patch({progress:{phase:"failed",progress:0,message:(c instanceof Error?c.message:"更新暂不可用")+"。请重新检查更新。",terminal:!0,ok:!1}});else{try{let l=await this.fetcher(this.origin+"/gate/update/status",{signal:AbortSignal.timeout(3e3)}),h=await l.json();if(l.ok&&h.activeJob?.statusOrigin){this.follow(h.activeJob);return}}catch{}this.patch({progress:{phase:"unknown",progress:0,message:"连接中断，暂时无法确认更新结果。请稍后检查更新；不要重复安装或删除节点。",terminal:!0}})}}finally{this.installing=!1}};copyCommand=async()=>{if(!(!this.value.check?.manualCommand||this.value.checking||this.installing||this.job))try{await navigator.clipboard.writeText(this.value.check.manualCommand),this.patch({copied:!0})}catch{this.patch({error:"复制失败，请手动选中下方命令复制。"})}};dispose=()=>{this.disposed=!0,this.pollGeneration++,clearTimeout(this.timer),this.listeners.clear()}};var re=class{constructor(t){this.call=t}value={checking:!1,starting:!1,check:null,status:null,error:null};listeners=new Set;reading;timer;disposed=!1;checkRevision=0;checkInvalidated=!1;getSnapshot=()=>this.value;patch(t){if(!this.disposed){this.value={...this.value,...t};for(let e of this.listeners)e()}}subscribe=t=>this.disposed?()=>{}:(this.listeners.add(t),this.checkInvalidated?(this.refreshInvalidatedCheck(),this.active()&&this.poll()):!this.value.check&&!this.value.starting?this.refresh():this.active()&&this.poll(),()=>{this.listeners.delete(t),this.listeners.size||(clearTimeout(this.timer),this.timer=void 0)});active(){return this.value.status&&["preparing","installing","unknown","restart-required"].includes(this.value.status.phase)}invalidateCheck=()=>{this.disposed||(this.checkRevision++,this.checkInvalidated=!0,this.value.check&&this.patch({check:{...this.value.check,canInstall:!1,ticket:""}}),this.refreshInvalidatedCheck())};refreshInvalidatedCheck(){!this.disposed&&this.checkInvalidated&&this.listeners.size&&!this.value.starting&&!this.active()&&this.refresh()}refresh=()=>{if(this.disposed||this.value.starting)return Promise.resolve();if(this.reading)return this.reading;let t=this.checkRevision;return this.checkInvalidated=!1,this.patch({checking:!0,error:null}),this.reading=(async()=>{try{let e=await this.call("update-check");if(this.disposed||t!==this.checkRevision)return;if(!e?.advice||!e.status||typeof e.canInstall!="boolean")throw Error("invalid update response");this.patch({check:e,status:e.status}),this.active()&&this.poll()}catch{if(this.disposed||t!==this.checkRevision)return;let e=!1;try{let a=await this.call("status");e=!!(a&&!a.plugin)}catch{}if(this.disposed||t!==this.checkRevision)return;this.patch({check:null,error:e?"当前运行的连接服务尚不支持此更新入口。若刚安装新版，请在任务结束后退出并重新打开 Desktop；无需重新配对。仍不可用时请在原生插件管理器核对安装。":"本次更新检查未完成，不能据此判断已是最新版。请稍后重试；配对和聊天不受此次检查失败影响。"})}finally{this.patch({checking:!1})}})().finally(()=>{this.reading=void 0,this.refreshInvalidatedCheck()}),this.reading};install=async()=>{let t=this.value.check;if(!(this.disposed||this.checkInvalidated||this.value.starting||this.value.checking||!t?.canInstall||!t.ticket)){this.patch({starting:!0,error:null,check:{...t,canInstall:!1,ticket:""}});try{let e=await this.call("update-start",{ticket:t.ticket});this.patch({status:e})}catch(e){this.patch({status:e?.code==="update/not-started"?{phase:"failed",message:e instanceof Error?e.message:"尚未启动更新，请重新检查"}:{phase:"unknown",message:"更新提交结果暂未确认，正在核对；请勿重复安装。"}})}finally{this.patch({starting:!1}),this.poll(),this.refreshInvalidatedCheck()}}};poll(){this.disposed||this.timer||!this.listeners.size||!this.active()||(this.timer=setTimeout(async()=>{try{let t=await this.call("update-status");if(!t||!["idle","preparing","installing","restart-required","complete","failed","unknown"].includes(t.phase))throw Error("invalid status");this.patch({status:t,error:t.phase==="idle"?"尚未发现已接受的更新，请重新检查后再操作。":null})}catch{this.patch({error:"更新状态暂不可用；恢复连接后继续核对，不会重复安装。"})}finally{this.timer=void 0,this.poll(),this.refreshInvalidatedCheck()}},2e3))}dispose(){this.disposed=!0,this.checkRevision++,this.checkInvalidated=!1,clearTimeout(this.timer),this.listeners.clear()}};var ue=()=>({loadState:"loading",qrState:"idle",status:null,host:null,runtime:null,localOrigin:null,qr:null,error:null,decisionError:null,deciding:!1}),we=n=>n?.companionUpdate?.state?["preparing","installing","verifying","recovering"].includes(n.companionUpdate.state):void 0,K=class{constructor(t,e){this.describeHost=t;this.callManagement=e}updates;nativeUpdates;value=ue();listeners=new Set;timer;reading;pairing;disposed=!1;identity="";generation=0;getSnapshot=()=>this.value;subscribe=t=>this.disposed?()=>{}:(this.listeners.add(t),this.timer||(this.refresh(),this.timer=setInterval(()=>void this.refresh(),2e3)),()=>{this.listeners.delete(t),this.listeners.size||(clearInterval(this.timer),this.timer=void 0)});patch(t){if(!this.disposed){this.value={...this.value,...t};for(let e of this.listeners)e()}}async client(){let t=await _e(this.describeHost,this.callManagement);if(this.disposed)throw new Error("disposed");let e=`${t.host.agentInstanceId??t.host.computerName}/${t.runtime.profileScope??"web"}`;return this.identity&&this.identity!==e&&(this.generation++,this.value=ue(),this.updates?.dispose(),this.updates=void 0,this.nativeUpdates?.dispose(),this.nativeUpdates=void 0),this.identity=e,t.runtime.profileScope==="desktop"&&!this.nativeUpdates&&(this.nativeUpdates=new re(this.callManagement)),this.updates?.origin!==t.localOrigin&&(this.updates?.dispose(),this.updates=t.localOrigin?new se(t.localOrigin):void 0),this.patch({host:t.host,runtime:t.runtime,localOrigin:t.localOrigin}),t}refresh=()=>this.disposed?Promise.resolve():this.reading?this.reading:(this.reading=(async()=>{try{let t=await this.client(),e=this.generation,a={...await t.status()};if(a.companionUpdate?.state==="complete"&&!a.plugin&&(a.companionUpdate={state:"unverified",message:"当前连接服务尚未提供运行版本核验，不能确认两端已对齐。若刚安装插件，请在任务结束后退出并重新打开当前应用；无需重新配对。"}),e!==this.generation)return;let r=we(this.value.status),o=we(a);o!==void 0&&o!==r&&this.nativeUpdates?.invalidateCheck(),this.patch({status:a,runtime:a.gate??t.runtime,loadState:"ready",error:null,...this.value.qr&&this.value.qr.expiresAt<=Date.now()?{qrState:"expired",qr:null}:{}})}catch{this.patch({loadState:"error",error:"连接服务暂未就绪。请确认 DSH 正在运行，然后重试。"})}})().finally(()=>{this.reading=void 0}),this.reading);generateQr=()=>this.disposed?Promise.resolve():this.pairing?this.pairing:(this.patch({qrState:"loading",qr:null,error:null}),this.pairing=(async()=>{try{let t=await this.client(),e=this.generation,a=await t.pairCode();if(e!==this.generation)return;if(!a?.qrDataUrl?.startsWith("data:image/")||!Number.isFinite(a.expiresAt)||a.expiresAt<=Date.now())throw new Error("invalid QR");this.patch({qr:a,qrState:"ready"}),await this.refresh()}catch{this.patch({qr:null,qrState:"error",error:"暂时无法生成配对二维码，请稍后重试。"})}})().finally(()=>{this.pairing=void 0}),this.pairing);decide=async t=>{let e=this.value.status?.companionUpdate?.offerId;if(!(this.disposed||this.value.deciding||!e)){this.patch({deciding:!0,decisionError:null});try{let a=await this.client();if(this.value.status?.companionUpdate?.offerId!==e)throw new Error("stale offer");await a.decide(e,t),await this.reading,await this.refresh()}catch{this.patch({decisionError:"更新选择未确认，请刷新后核对；不要重复安装。"})}finally{this.patch({deciding:!1})}}};dispose=()=>{this.disposed=!0,this.generation++,clearInterval(this.timer),this.timer=void 0,this.listeners.clear(),this.value=ue(),this.updates?.dispose(),this.updates=void 0,this.nativeUpdates?.dispose(),this.nativeUpdates=void 0}},xe=new WeakMap;function ie(n,t){let e=xe.get(n);return e||(e=new K(n,t),xe.set(n,e)),e}var $=O(V(),1),z=require("react/jsx-runtime");function oe({describeHost:n,callManagement:t,onDismiss:e,onOpenDetails:a,compact:r=!1,store:o=ie(n,t)}){let{status:c,deciding:l,decisionError:h,error:g,loadState:v}=(0,ke.useSyncExternalStore)(o.subscribe,o.getSnapshot,o.getSnapshot),d=c?.companionUpdate,f=h||g,y=(0,z.jsxs)("div",{children:[(0,z.jsx)(ye,{value:d,compact:r,deciding:l||v!=="ready",onDecide:C=>void o.decide(C)}),!d&&!f?(0,z.jsx)("p",{className:$.default.helpText,children:v==="loading"?"正在检查同一主机的另一端…":"另一端状态未确认；不会自动更新。"}):!r&&d?.state==="idle"?(0,z.jsx)("p",{className:$.default.helpText,children:"未发现需要联动更新的另一端。当前节点可独立使用，不会自动安装另一端或启用已停用的插件。"}):null,f?(0,z.jsx)("p",{role:"alert",children:f}):null,e?(0,z.jsxs)("div",{className:$.default.actions,children:[a?(0,z.jsx)("button",{type:"button",className:$.default.primaryButton,onClick:a,children:"前往微信连接"}):null,(0,z.jsx)("button",{type:"button",className:$.default.secondaryButton,onClick:e,children:"关闭提示（不会确认更新）"})]}):null]});return e?(0,z.jsx)(Ce.Modal,{open:!0,title:"微信连接 · 联动更新",closeLabel:"关闭提示",className:$.default.pageDialog,contentClassName:$.default.pageDialogContent,onClose:e,children:y}):y}var Y=require("react"),Se=O(V(),1),q=require("react/jsx-runtime");function Ne({wide:n,openPlugin:t}){let[e,a]=(0,Y.useState)(!1),[r,o]=(0,Y.useState)(!1),c=(0,Y.useRef)(!1),l=async()=>{if(!c.current){c.current=!0,o(!0);try{await t()||a(!0)}finally{c.current=!1,o(!1)}}};return(0,q.jsxs)(q.Fragment,{children:[(0,q.jsxs)("button",{type:"button",className:Se.default.sidebarButton,"data-wide":n,title:"微信连接","aria-label":"微信连接",disabled:r,onClick:()=>void l(),children:[(0,q.jsxs)("svg",{width:"20",height:"20",viewBox:"0 0 24 24",fill:"none",stroke:"currentColor",strokeWidth:"1.7","aria-hidden":"true",children:[(0,q.jsx)("path",{d:"M20 11.5a8 8 0 0 1-8 8 9 9 0 0 1-3.5-.7L4 20l1.2-4.2A7.8 7.8 0 0 1 4 11.5a8 8 0 0 1 16 0Z"}),(0,q.jsx)("path",{d:"M8 11.5h.01M12 11.5h.01M16 11.5h.01",strokeWidth:"2.5",strokeLinecap:"round"})]}),n?(0,q.jsx)("span",{children:r?"正在打开…":"微信连接"}):null]}),e?(0,q.jsx)("small",{role:"status",children:"插件详情暂不可用，请打开「设置 → 微信连接」。"}):null]})}async function Pe(n){try{let t=n("pluginNavigation"),e=n("remote.pluginManager");if(typeof t?.openBundle!="function"||typeof e?.listBundles!="function")return!1;let a=await e.listBundles();if(!a.ok||!Array.isArray(a.value))return!1;let r=a.value.filter(c=>c.enabled&&["dsh-wechat-remote","@harness-remote/dsh-wechat-remote"].includes(c.name));if(r.length!==1)return!1;let o=n("pluginNavigation");return o!==t||typeof o.openBundle!="function"?!1:(o.openBundle(r[0].name),!0)}catch{return!1}}var le=require("react"),ze=require("@deepseek-ai/dsh-client-ui-primitives"),k=O(V(),1);var He=require("react"),D=O(V(),1),m=require("react/jsx-runtime");function De({store:n,embedded:t=!1}){let{check:e,checking:a,progress:r,error:o,copied:c,resumeFailed:l}=(0,He.useSyncExternalStore)(n.subscribe,n.getSnapshot,n.getSnapshot),h=!!(r&&!r.terminal),g=h||r?.phase==="unknown"||e?.mode==="busy";return(0,m.jsxs)("div",{className:t?D.default.updateEndpoint:D.default.updateCard,children:[(0,m.jsxs)("div",{className:D.default.updateRow,children:[(0,m.jsxs)("div",{className:D.default.updateCopy,children:[(0,m.jsxs)("strong",{children:["Web ",(0,m.jsx)("span",{className:D.default.updateScope,children:"当前端"})]}),e?(0,m.jsxs)("div",{className:D.default.updateVersions,children:[(0,m.jsxs)("span",{children:["DSH ",(0,m.jsx)("strong",{children:e.advice.current.agentVersion||"未确认"})]}),(0,m.jsxs)("span",{children:["插件运行 ",(0,m.jsx)("strong",{children:e.advice.current.pluginVersion||"未确认"})]}),e.channel==="preview"?(0,m.jsx)("span",{children:"预览通道"}):null]}):null]}),(0,m.jsxs)("div",{className:D.default.updateControl,children:[(0,m.jsx)("button",{type:"button",className:D.default.secondaryButton,disabled:a||h,onClick:()=>void n.refresh(),children:a?"检查中…":"检查更新"}),e&&!a?(0,m.jsx)("strong",{className:D.default.updateLabel,"data-severity":g?"unknown":e.advice.severity,role:"status",children:h?"正在更新 Web 插件":g?"更新状态待核对":e.advice.label}):null,e?.advice.checkedAt&&e.advice.severity!=="unknown"?(0,m.jsxs)("small",{className:D.default.updateChecked,children:["检查于 ",new Date(e.advice.checkedAt).toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"})]}):null]})]}),e?(0,m.jsx)(m.Fragment,{children:a?null:(0,m.jsxs)(m.Fragment,{children:[!g&&e.advice.targetVersion?(0,m.jsxs)("p",{children:["可更新至 ",e.advice.targetVersion,e.mode==="manual"?" · 需手动更新":""]}):null,!g&&(e.advice.severity==="unknown"||e.advice.severity==="required"||e.mode==="manual")?(0,m.jsxs)("details",{children:[(0,m.jsx)("summary",{children:e.mode==="manual"?"手动更新说明":"查看说明"}),e.reason?(0,m.jsx)("p",{children:e.reason}):null,(0,m.jsx)("p",{children:e.advice.message})]}):null,!g&&e.mode==="manual"&&e.manualCommand?(0,m.jsxs)("div",{className:D.default.updateCommand,children:[(0,m.jsx)("code",{children:e.manualCommand}),(0,m.jsx)("button",{type:"button",className:D.default.secondaryButton,disabled:h,onClick:()=>void n.copyCommand(),children:c?"已复制":"复制命令"})]}):null,!g&&e.canInstall?(0,m.jsxs)(m.Fragment,{children:[(0,m.jsx)("div",{className:D.default.updateActions,children:(0,m.jsx)("button",{type:"button",className:D.default.primaryButton,disabled:h||!!o,onClick:()=>void n.install(),children:"更新 Web 并重启"})}),(0,m.jsx)("small",{className:D.default.updateChecked,children:"仅更新 Web，保留配对与会话；连接会短暂中断。"})]}):null]})}):null,o?(0,m.jsx)("p",{role:"alert",children:o}):null,r?(0,m.jsxs)("div",{role:"status","aria-live":"polite",children:[!r.terminal||r.ok===!0?(0,m.jsx)("progress",{className:D.default.updateProgress,max:100,value:r.progress}):null,(0,m.jsx)("p",{children:r.message}),l?(0,m.jsx)("p",{role:"alert",children:"插件已完成更新，但未能自动打开 WebUI。请使用 DSH 启动时显示的地址打开，无需重复更新。"}):null]}):null]})}var Ee=require("react"),E=O(V(),1),b=require("react/jsx-runtime");function Re({store:n,embedded:t=!1}){let{check:e,status:a,checking:r,starting:o,error:c}=(0,Ee.useSyncExternalStore)(n.subscribe,n.getSnapshot,n.getSnapshot),l=o||a?.phase==="preparing"||a?.phase==="installing",h=a&&["preparing","installing","restart-required","unknown"].includes(a.phase),g=a?.phase==="restart-required"||a?.phase==="complete",v=a?.phase==="restart-required"?"已安装，待重新打开 Desktop":a?.phase==="unknown"?"更新结果待核对":a?.phase==="failed"?"更新未完成":l?"正在更新 Desktop 插件":a?.phase==="complete"?"更新已生效":"";return(0,b.jsxs)("div",{className:t?E.default.updateEndpoint:E.default.updateCard,children:[(0,b.jsxs)("div",{className:E.default.updateRow,children:[(0,b.jsxs)("div",{className:E.default.updateCopy,children:[(0,b.jsxs)("strong",{children:["Desktop ",(0,b.jsx)("span",{className:E.default.updateScope,children:"当前端"})]}),e?(0,b.jsxs)("div",{className:E.default.updateVersions,children:[(0,b.jsxs)("span",{children:["DSH ",(0,b.jsx)("strong",{children:e.advice.current.agentVersion||"未确认"})]}),(0,b.jsxs)("span",{children:["插件运行 ",(0,b.jsx)("strong",{children:e.advice.current.pluginVersion||"未确认"})]}),g&&a.targetVersion&&a.targetVersion!==e.advice.current.pluginVersion?(0,b.jsxs)("span",{children:["已安装 ",(0,b.jsx)("strong",{children:a.targetVersion})]}):null,e.channel==="preview"?(0,b.jsx)("span",{children:"预览通道"}):null]}):null]}),(0,b.jsxs)("div",{className:E.default.updateControl,children:[(0,b.jsx)("button",{type:"button",className:E.default.secondaryButton,disabled:r||l,onClick:()=>void n.refresh(),children:r?"检查中…":"检查更新"}),e?(0,b.jsx)("strong",{className:E.default.updateLabel,"data-severity":a?.phase==="failed"?"required":a?.phase==="complete"?"none":h?a?.phase==="unknown"?"unknown":"info":e.advice.severity,children:v||e.advice.label}):null,e?.advice.checkedAt?(0,b.jsxs)("small",{className:E.default.updateChecked,children:["检查于 ",new Date(e.advice.checkedAt).toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"})]}):null]})]}),e?(0,b.jsxs)(b.Fragment,{children:[!g&&!h&&e.advice.targetVersion?(0,b.jsxs)("p",{children:["可更新至 ",e.advice.targetVersion]}):null,!h&&e.reason?(0,b.jsx)("p",{children:e.reason}):null,!h&&e.canInstall?(0,b.jsxs)(b.Fragment,{children:[(0,b.jsx)("div",{className:E.default.updateActions,children:(0,b.jsx)("button",{type:"button",className:E.default.primaryButton,disabled:l||r,onClick:()=>void n.install(),children:"更新 Desktop 插件"})}),(0,b.jsx)("small",{className:E.default.updateChecked,children:"仅更新 Desktop，保留配对与会话；完成后需退出并重新打开。"})]}):null]}):null,a?.phase!=="idle"&&a?(0,b.jsxs)("div",{role:"status","aria-live":"polite",children:[l?(0,b.jsx)("progress",{className:E.default.updateProgress,"aria-label":"Desktop 插件更新中"}):null,a.phase==="restart-required"?(0,b.jsx)("p",{className:E.default.updatePeerNote,children:"任务结束后，选择「应用 → 退出」再打开 Desktop；无需重新配对，Web 不受影响。"}):a.phase!=="complete"?(0,b.jsx)("p",{children:a.message}):null]}):null,c?(0,b.jsx)("p",{role:"alert",children:c}):null]})}var L=require("react"),w=O(V(),1),i=require("react/jsx-runtime"),ee=n=>n.state==="installed"&&(n.nativeState===void 0||n.nativeState==="installed"),Ke=n=>ee(n)?"已安装":n.state==="draft"?"待安装":n.nativeState==="uninstalled"?"未安装":n.nativeState==="disabled"?"已停用":n.state==="pending-restart"?"待重启":"待核对",he=n=>n.templateId==="designer"||n.id==="designer"?"定制我的助手":n.name;function Ie({label:n,children:t}){let e=(0,L.useId)();return(0,i.jsxs)("span",{className:w.default.assistantHelpAnchor,children:[(0,i.jsx)("button",{type:"button",className:w.default.assistantHelpButton,"aria-label":n,"aria-describedby":e,children:"?"}),(0,i.jsx)("span",{id:e,className:w.default.assistantTooltip,role:"tooltip",children:t})]})}function Ae({store:n}){let{catalog:t,preview:e,busy:a,message:r,error:o}=(0,L.useSyncExternalStore)(n.subscribe,n.getSnapshot,n.getSnapshot),c=(0,L.useRef)();(0,L.useEffect)(()=>{let s=new AbortController;return c.current=s,n.load(),()=>s.abort()},[n]);let l=t?.drafts||[],h=l.filter(s=>ee(s)&&!s.replacement),g=l.filter(s=>s.state==="draft"),v=l.filter(s=>s.source!=="builtin"&&s.state!=="draft"&&(!ee(s)||s.replacement)),d=t?.templates||[],f=s=>h.find(S=>S.templateId===s),y=s=>void n.start(s.presetId,c.current?.signal),C=s=>s.id==="designer"||s.templateId==="designer"?"先打开定制会话，说清职业和工作习惯；助手会设计可复用的模式。确认安装后，再用新模式开启工作会话。不会自动安装或发送消息。":`先选工作区，再用「${s.name}」开始空白会话。手机连接此电脑后可继续该会话；发卡与提醒需在小程序设置中开启「微信群协作助手」。`,P=s=>{let S=f(s.id),A=s.builtin,B=l.find(W=>W.templateId===s.id&&W.source==="builtin");return(0,i.jsxs)("article",{className:w.default.assistantChoice,"data-installed":!!S,children:[(0,i.jsxs)("div",{className:w.default.assistantChoiceCopy,children:[(0,i.jsxs)("div",{className:w.default.assistantChoiceHead,children:[(0,i.jsx)("strong",{children:he(s)}),(0,i.jsx)(Ie,{label:`${he(s)}使用说明`,children:C(s)})]}),(0,i.jsx)("p",{children:s.id==="designer"?"用对话设计适合自己职业的助手模式":s.description})]}),!S&&A?(0,i.jsx)("span",{className:w.default.assistantUnavailable,title:B?.reason||A.reason,children:B?.nativeState==="disabled"?"已停用":"待就绪"}):null,(0,i.jsx)("button",{type:"button",className:w.default.secondaryButton,disabled:a||!!(A&&!S),onClick:()=>S?y(S):A?void n.load():void n.choose(s.id),children:S?s.id==="designer"?"开始定制":"开始使用":A?"开始使用":"安装"})]},s.id)},I=s=>(0,i.jsxs)("div",{className:w.default.assistantEntry,children:[(0,i.jsxs)("div",{className:w.default.assistantEntryHead,children:[(0,i.jsx)("strong",{children:he(s)}),(0,i.jsx)("span",{children:Ke(s)})]}),s.replacement?(0,i.jsxs)("div",{children:[(0,i.jsxs)("p",{children:["已提供内置「",s.replacement.name,"」，无需再装同款独立包。"]}),(0,i.jsx)("p",{children:s.replacement.warning}),s.replacement.canRemoveAfterReview?(0,i.jsxs)("p",{children:["核对旧会话后，可在 DSH 插件列表卸载：",(0,i.jsx)("code",{children:s.replacement.bundleName})]}):null]}):null,ee(s)?(0,i.jsx)("button",{type:"button",className:w.default.assistantSecondary,disabled:a,onClick:()=>y(s),children:"开始使用"}):s.state==="draft"?(0,i.jsx)("button",{type:"button",className:w.default.assistantPrimary,disabled:a,onClick:()=>void n.preview(s.id,s.version),children:"查看并安装"}):(0,i.jsxs)(i.Fragment,{children:[(0,i.jsx)("button",{type:"button",className:w.default.assistantSecondary,disabled:a,onClick:()=>void n.verify(s.id,s.version),children:"刷新状态"}),s.nativeState==="uninstalled"&&!s.replacement?(0,i.jsx)("button",{type:"button",className:w.default.assistantSecondary,disabled:a,onClick:()=>void n.reinstall(s.id,s.version),children:"查看并重新安装"}):null]}),!ee(s)&&s.reason?(0,i.jsxs)("details",{className:w.default.assistantDetails,children:[(0,i.jsx)("summary",{children:"状态说明"}),(0,i.jsx)("p",{children:s.reason})]}):null]},`${s.id}:${s.version}`);return(0,i.jsxs)("section",{className:w.default.assistantsCard,"aria-label":"微信群协作助手","aria-busy":a,children:[(0,i.jsxs)("div",{className:w.default.assistantsHeading,children:[(0,i.jsxs)("div",{className:w.default.assistantChoiceHead,children:[(0,i.jsx)("h3",{children:"微信群协作助手"}),(0,i.jsx)(Ie,{label:"电脑助手与手机群协作",children:"电脑助手可独立使用，组件开关由 DSH 管理。手机发任务和提醒，需在小程序「设置 → 实验性功能」开启「微信群协作助手」。各手机独立设置，不会关闭电脑助手或已发布任务。"})]}),(0,i.jsx)("button",{type:"button",className:w.default.assistantTextButton,disabled:a,onClick:()=>void n.load(),children:a?"读取中…":"刷新"})]}),!t&&!o?(0,i.jsx)("p",{role:"status",children:"正在读取当前电脑的助手…"}):null,t&&!t.native?.supported?(0,i.jsx)("p",{role:"status",children:t.native?.reason||"当前 DSH 暂不支持安装助手，请先检查版本。"}):null,t&&(t.native?.supported||d.some(s=>s.builtin))?(0,i.jsxs)(i.Fragment,{children:[(0,i.jsx)("div",{className:w.default.assistantChoices,children:d.filter(s=>["teacher","project"].includes(s.id)).map(P)}),d.some(s=>s.id==="designer")?(0,i.jsx)("div",{className:w.default.assistantCustomize,children:d.filter(s=>s.id==="designer").map(P)}):null]}):null,e?(0,i.jsxs)("div",{className:w.default.assistantPreview,"aria-label":"安装助手预览",children:[(0,i.jsxs)("h4",{children:["安装「",e.definition.name,"」"]}),(0,i.jsx)("p",{children:e.definition.description}),(0,i.jsx)("p",{children:"新增一个可选的助手模式，不改默认模式、已有会话和资料。"}),(0,i.jsxs)("details",{className:w.default.assistantDetails,children:[(0,i.jsx)("summary",{children:"查看工作方式与安装详情"}),(0,i.jsx)("p",{children:e.definition.role}),(0,i.jsx)("ul",{children:e.definition.methods.map((s,S)=>(0,i.jsx)("li",{children:s},S))}),(0,i.jsx)("p",{children:"助手会逐步了解："}),(0,i.jsx)("ul",{children:e.definition.onboarding.map(s=>(0,i.jsxs)("li",{children:[s.label,"：",s.prompt]},s.key))}),(0,i.jsxs)("small",{children:["第 ",e.version," 版 · 内容摘要 ",e.digest.slice(0,12)," · 基础模式 ",e.native.basePreset]}),(0,i.jsx)("ul",{children:(e.native.warnings||[]).map((s,S)=>(0,i.jsx)("li",{children:s},S))})]}),(0,i.jsxs)("div",{className:w.default.assistantButtons,children:[(0,i.jsx)("button",{type:"button",className:w.default.assistantPrimary,disabled:a,onClick:()=>void n.install(),children:"确认安装"}),(0,i.jsx)("button",{type:"button",className:w.default.assistantSecondary,disabled:a,onClick:()=>n.dismissPreview(),children:"暂不安装"})]})]}):null,g.length?(0,i.jsxs)("div",{children:[(0,i.jsx)("h4",{children:"待安装的助手"}),g.map(I)]}):null,h.some(s=>!["teacher","project","designer"].includes(s.templateId))?(0,i.jsxs)("div",{children:[(0,i.jsx)("h4",{children:"我已安装的其他助手"}),h.filter(s=>!["teacher","project","designer"].includes(s.templateId)).map(I)]}):null,v.length||d.some(s=>!["teacher","project","designer"].includes(s.id))?(0,i.jsxs)("details",{className:w.default.assistantDetails,children:[(0,i.jsx)("summary",{children:"更多助手与安装记录"}),t?.native?.supported?(0,i.jsx)("div",{className:w.default.assistantChoices,children:d.filter(s=>!["teacher","project","designer"].includes(s.id)).map(P)}):null,v.length?(0,i.jsxs)("details",{className:w.default.assistantDetails,children:[(0,i.jsxs)("summary",{children:["以前安装的助手（",v.length,"）"]}),(0,i.jsx)("p",{children:"旧会话可能仍在使用旧模式；卸载前请核对，聊天与资料不会在这里删除。"}),v.map(I)]}):null]}):null,r?(0,i.jsx)("p",{role:"status",children:r}):null,o?(0,i.jsx)("p",{role:"alert",children:o}):null]})}var H=require("react"),x=O(V(),1),u=require("react/jsx-runtime"),Be={wait:"用微信「扫一扫」扫描下方二维码",scaned:"请在微信中确认连接",need_verifycode:"请输入微信显示的验证码",expired:"二维码已过期",verify_code_blocked:"验证码暂不可用，请稍后重新配对",scaned_but_redirect:"请按微信提示继续确认",binded_redirect:"微信已有连接，请核对原节点"},je=(n,t)=>!!(n&&["wait","scaned","scaned_but_redirect","need_verifycode"].includes(n.status)&&(n.expiresAt===void 0||n.expiresAt>t));function Ue({call:n,nodeName:t,hostName:e}){let[a,r]=(0,H.useState)(),[o,c]=(0,H.useState)([]),[l,h]=(0,H.useState)(""),[g,v]=(0,H.useState)(!1),[d,f]=(0,H.useState)(""),[y,C]=(0,H.useState)(""),[P,I]=(0,H.useState)(Date.now),s=(0,H.useRef)(a);s.current=a;let S=(0,H.useRef)(!1),A=(0,H.useRef)(!1),B=(0,H.useRef)(null),W=(0,H.useRef)(null),F=(0,H.useRef)(null),M=(0,H.useRef)(0),R=async(N,G=!1)=>{let J=N.action==="login.poll"?W:F;if(B.current&&!(N.action==="login.cancel"&&B.current.action==="login.poll")||G&&J.current)return;let ae={};G?J.current=ae:(B.current={action:N.action,token:ae},M.current++);let pe=M.current;G||(v(!0),f(""));try{let T=await n(N);if(!A.current||pe!==M.current)return;if("sessions"in T)c(T.sessions);else{if(s.current&&T.revision<s.current.revision)return;let Ve=s.current;s.current=T,r(T),f(""),Ve?.pairing?.id!==T.pairing?.id&&C(""),(!S.current||N.action==="route")&&(S.current=!1,h(T.target?.id||""))}}catch(T){A.current&&pe===M.current&&(N.action!=="login.poll"||s.current?.pairing?.id===N.loginId)&&f(T instanceof Error?T.message:"暂时无法读取状态")}finally{G?J.current===ae&&(J.current=null):B.current?.token===ae&&(B.current=null,A.current&&pe===M.current&&v(!1))}};(0,H.useEffect)(()=>{A.current=!0,s.current=void 0,S.current=!1,r(void 0),c([]),h(""),C(""),f(""),R({action:"status"});let N=setInterval(()=>{let G=Date.now();I(G);let J=s.current?.pairing;J&&je(J,G)&&J.status!=="need_verifycode"&&R({action:"login.poll",loginId:J.id},!0),R({action:"status"},!0)},4e3);return()=>{A.current=!1,M.current++,B.current=null,W.current=null,F.current=null,clearInterval(N)}},[n]);let te=async()=>{await R({action:"status"}),await R({action:"sessions"})},U=a?.pairing,X=je(U,P),Q=a?.bindingState==="expired",Z=!!(a?.paired&&!Q),Me=!!(Z&&a?.target&&!X),Je=a?Q?"连接已失效":Z?a.enabled?a.state==="ready"?"已连接":a.state==="error"?"连接异常":"连接中":"已暂停":"未配对":"读取中",de=()=>{a?.paired&&!window.confirm("重新配对当前节点？请留意微信提示，确认新连接可能会替换原来的连接。")||R({action:"login.start"})};return(0,u.jsxs)("section",{className:x.default.updateCard,"aria-label":"微信 ClawBot",children:[(0,u.jsxs)("div",{className:x.default.clawbotHead,children:[(0,u.jsxs)("h3",{className:x.default.updateHeading,children:[(0,u.jsx)("span",{className:x.default.clawbotMark,"aria-hidden":!0}),"微信 ClawBot ",(0,u.jsx)("small",{children:"实验性"})]}),(0,u.jsx)("button",{type:"button",className:x.default.secondaryButton,disabled:g,onClick:()=>void te(),children:"刷新"})]}),(0,u.jsxs)("p",{className:x.default.clawbotNode,children:["当前节点：",t||"读取中",e?" · "+e:""]}),(0,u.jsxs)("div",{className:x.default.clawbotSection,"aria-label":"微信配对",children:[(0,u.jsxs)("div",{className:x.default.clawbotRow,children:[(0,u.jsx)("strong",{children:"微信配对"}),(0,u.jsx)("span",{role:"status",children:Q?"需要重新配对":Z?"已配对此节点":"尚未配对"})]}),U?(0,u.jsxs)("div",{className:x.default.clawbotPairing,children:[X&&U.status==="wait"?(0,u.jsx)("img",{src:U.qrDataUrl,width:"180",height:"180",alt:"微信 ClawBot 配对二维码"}):null,(0,u.jsxs)("div",{children:[(0,u.jsx)("p",{children:!X&&U.expiresAt!==void 0&&U.expiresAt<=P?Be.expired:Be[U.status]||"请重新生成二维码"}),X&&U.status==="need_verifycode"?(0,u.jsxs)("form",{onSubmit:N=>{N.preventDefault(),R({action:"login.poll",loginId:U.id,verifyCode:y}),C("")},children:[(0,u.jsx)("input",{"aria-label":"微信验证码",value:y,autoComplete:"off",inputMode:"numeric",maxLength:16,onChange:N=>C(N.target.value)}),(0,u.jsx)("button",{type:"submit",className:x.default.primaryButton,disabled:g||!/^\d{1,16}$/.test(y),children:"确认验证码"})]}):null,X?null:(0,u.jsx)("button",{type:"button",className:x.default.primaryButton,disabled:g||!!a?.enabled,onClick:de,children:"重新生成二维码"}),(0,u.jsx)("button",{type:"button",className:x.default.secondaryButton,disabled:g&&B.current?.action!=="login.poll",onClick:()=>void R({action:"login.cancel",loginId:U.id}),children:"取消配对"})]})]}):Z?null:(0,u.jsx)("button",{type:"button",className:x.default.primaryButton,disabled:!a||g||!!(a.paired&&a.enabled),onClick:de,children:"生成配对二维码"})]}),(0,u.jsxs)("div",{className:x.default.clawbotSection,"aria-label":"微信消息",children:[(0,u.jsxs)("div",{className:x.default.clawbotRow,children:[(0,u.jsx)("strong",{children:"目标会话"}),(0,u.jsxs)("label",{className:x.default.clawbotToggle,children:[(0,u.jsx)("span",{children:Je}),(0,u.jsx)("input",{type:"checkbox",role:"switch","aria-label":"接收微信消息",checked:a?.enabled||!1,disabled:!a||g||!a.enabled&&!Me,onChange:N=>void R({action:"enabled",enabled:N.target.checked,expectedRevision:a?.revision})}),"接收微信消息"]})]}),(0,u.jsxs)("div",{className:x.default.clawbotRow,children:[(0,u.jsxs)("select",{"aria-label":"ClawBot 目标会话",value:l,disabled:!a||g&&B.current?.action!=="sessions",onFocus:()=>void R({action:"sessions"}),onChange:N=>{S.current=!0,h(N.target.value)},children:[(0,u.jsx)("option",{value:"",children:"选择已有会话"}),a?.target&&!o.some(N=>N.id===a.target.id)?(0,u.jsx)("option",{value:a.target.id,children:a.target.title}):null,o.map(N=>(0,u.jsx)("option",{value:N.id,children:N.title},N.id))]}),(0,u.jsx)("button",{type:"button",className:x.default.secondaryButton,disabled:!l||!a||g||l===a.target?.id,onClick:()=>void R({action:"route",sessionId:l,expectedRevision:a?.revision}),children:"接到此会话"})]}),Z&&!a?.target?(0,u.jsx)("p",{className:x.default.clawbotNote,children:"选择会话后，即可开启微信消息。"}):null]}),a?.message&&(a.state==="error"||Q)?(0,u.jsx)("p",{className:x.default.clawbotNote,role:"status",children:a.message}):null,a?.uncertain?(0,u.jsxs)("p",{className:x.default.clawbotNote,children:["有 ",a.uncertain," 条消息的处理结果待确认，请到原会话查看。"]}):null,d?(0,u.jsx)("p",{className:x.default.clawbotError,role:"alert",children:d}):null,a?.paired&&!U?(0,u.jsxs)("details",{className:x.default.assistantDetails,children:[(0,u.jsx)("summary",{children:"更多管理"}),a.enabled?(0,u.jsx)("p",{className:x.default.clawbotNote,children:"重新配对或移除配对前，请先关闭「接收微信消息」。"}):null,Q?null:(0,u.jsx)("button",{type:"button",className:x.default.secondaryButton,disabled:g||a.enabled,onClick:de,children:"重新配对"}),(0,u.jsx)("button",{type:"button",className:x.default.secondaryButton,disabled:g||a.enabled,onClick:()=>{window.confirm("移除此节点保存的微信配对？不会删除会话，也不会解除微信端的授权。"+(a.pending?`
未完成的微信消息将停止处理和发送；电脑上已开始的任务仍会继续，请到原会话查看。`:""))&&R({action:"disconnect",expectedRevision:a.revision,abandonPending:a.pending>0})},children:"移除配对"})]}):null]})}var p=require("react/jsx-runtime");function qe({ok:n,busy:t=!1}){return(0,p.jsx)("span",{className:k.default.statusDot,"data-state":t?"busy":n?"ready":"off","aria-hidden":!0})}function ge({title:n,detail:t,ok:e,busy:a=!1}){return(0,p.jsxs)("div",{className:k.default.capability,children:[(0,p.jsx)(qe,{ok:e,busy:a}),(0,p.jsxs)("div",{className:k.default.capabilityCopy,children:[(0,p.jsx)("strong",{children:n}),(0,p.jsx)("span",{children:t})]})]})}function me({describeHost:n,callManagement:t,store:e=ie(n,t),assistants:a,clawbotCall:r}){let{loadState:o,qrState:c,status:l,runtime:h,host:g,localOrigin:v,qr:d,error:f}=(0,le.useSyncExternalStore)(e.subscribe,e.getSnapshot,e.getSnapshot),{refresh:y,generateQr:C}=e,P=(0,le.useId)(),I=l?.publicRelay,s=I?.state==="enrolling"||I?.state==="connecting",S=I?.remoteAccess?.status,A=I?.state==="online"&&S==="active",B=S==="suspended"?"账户公网访问已暂停":S==="expired"?"公网访问已到期":S==="not_entitled"?"请在小程序中使用自助开通方式":S!=="active"?"配对后由小程序账户决定":A?"可在外网安全连接":s?"正在准备远程连接":"暂时离线",W=h?.publicDoor??l?.gate?.publicDoor,F=o==="ready"&&!!l?.lan.ip&&W?.state==="listening",M=I?.enabled===!0&&I.state!=="disabled",R=l?.agent?.agentName||g?.agentName||"DeepSeek Harness",te=l?.agent?.hostName||g?.computerName||"当前电脑";return(0,p.jsxs)("section",{className:k.default.root,"aria-labelledby":P,children:[(0,p.jsxs)("div",{className:k.default.hero,children:[(0,p.jsxs)("div",{className:k.default.identity,children:[(0,p.jsx)("span",{className:k.default.mark,"aria-hidden":!0,children:(0,p.jsx)(ze.FishLogo,{size:28})}),(0,p.jsxs)("div",{className:k.default.identityCopy,children:[(0,p.jsx)("h3",{id:P,children:"微信连接"}),(0,p.jsxs)("p",{children:[R,(0,p.jsx)("span",{"aria-hidden":!0,children:" · "}),te]})]})]}),(0,p.jsxs)("span",{className:k.default.overall,"data-ready":o==="ready",children:[(0,p.jsx)(qe,{ok:o==="ready",busy:o==="loading"}),o==="loading"?"检测中":o==="ready"?"服务正常":"暂不可用"]})]}),(0,p.jsxs)("div",{className:k.default.capabilities,children:[(0,p.jsx)(ge,{title:"局域网直连",detail:o==="loading"?"检测中":F?"已就绪":"暂不可用",ok:F,busy:o==="loading"}),(0,p.jsx)(ge,{title:"远程访问",detail:B,ok:A,busy:s||o==="loading"}),(0,p.jsx)(ge,{title:"账号连接保护",detail:M?"已启用":"配对后启用",ok:M,busy:o==="loading"})]}),f!==null?(0,p.jsxs)("div",{className:k.default.notice,role:"status",children:[(0,p.jsx)("span",{children:f}),(0,p.jsx)("button",{type:"button",onClick:()=>void y(),children:"重试"})]}):null,c==="idle"?(0,p.jsxs)("div",{className:k.default.connectCard,children:[(0,p.jsxs)("div",{children:[(0,p.jsx)("strong",{children:"添加到微信"}),(0,p.jsx)("p",{children:"打开「Agent远程管理助手」→ 添加节点，扫描配对二维码。"})]}),(0,p.jsx)("button",{type:"button",className:k.default.primaryButton,disabled:o!=="ready",onClick:()=>void C(),children:"生成二维码"})]}):(0,p.jsxs)("div",{className:k.default.pairingCard,children:[(0,p.jsxs)("div",{className:k.default.pairingHead,children:[(0,p.jsxs)("div",{children:[(0,p.jsx)("strong",{children:"扫描二维码"}),(0,p.jsx)("p",{children:"小程序「设置 → 添加节点」"})]}),(0,p.jsx)("button",{type:"button",className:k.default.secondaryButton,disabled:c==="loading"||o!=="ready",onClick:()=>void C(),children:c==="loading"?"生成中…":"重新生成"})]}),(0,p.jsxs)("div",{className:k.default.qrArea,children:[o==="ready"&&c==="ready"&&d!==null?(0,p.jsx)("img",{className:k.default.qr,src:d.qrDataUrl,alt:"Agent远程管理助手配对二维码"}):(0,p.jsx)("div",{className:k.default.qrPlaceholder,"aria-live":"polite",children:o!=="ready"?"连接恢复后可查看二维码":c==="expired"?"二维码已过期，请重新生成":c==="error"?"生成失败":"正在生成…"}),c==="ready"&&d!==null?(0,p.jsxs)("small",{className:k.default.qrValidity,children:["有效至 ",new Date(d.expiresAt).toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"})," · 切换页面不重新生成"]}):null]}),(0,p.jsx)("p",{className:k.default.securityNote,children:d?.mode==="public-relay"?"配对后自动选择更快的连接；远程内容端到端加密。":"当前可通过同一局域网连接。"})]}),(0,p.jsxs)("section",{className:k.default.updateCard,"aria-label":"插件更新",children:[(0,p.jsx)("h3",{className:k.default.updateHeading,children:"插件更新"}),v&&e.updates?(0,p.jsx)(De,{store:e.updates,embedded:!0}):null,h?.profileScope==="desktop"&&e.nativeUpdates?(0,p.jsx)(Re,{store:e.nativeUpdates,embedded:!0}):null,(0,p.jsx)(oe,{describeHost:n,callManagement:t,store:e,compact:!0})]}),a?(0,p.jsx)(Ae,{store:a}):null,r?(0,p.jsx)(Ue,{call:r,nodeName:R,hostName:te}):null]})}var ce=class{constructor(t,e){this.call=t;this.openSession=e}state={catalog:null,preview:null,busy:!1,message:"",error:""};listeners=new Set;epoch=0;disposed=!1;getSnapshot=()=>this.state;subscribe=t=>(this.listeners.add(t),()=>{this.listeners.delete(t)});set(t){if(!this.disposed){this.state={...this.state,...t};for(let e of this.listeners)e()}}reset=()=>{this.epoch++,this.set({catalog:null,preview:null,busy:!1,message:"",error:""})};dispose=()=>{this.reset(),this.disposed=!0,this.listeners.clear()};async run(t){if(this.disposed||this.state.busy)return;let e=this.epoch,a=()=>!this.disposed&&e===this.epoch;this.set({busy:!0,error:""});try{await t(a)}catch(r){a()&&this.set({error:r instanceof Error?r.message:"操作未完成，请核对状态"})}finally{a()&&this.set({busy:!1})}}async read(t){t()&&this.set({catalog:null});try{let e=await this.call("assistantCatalog",{});if(!t())return;if(e?.schema!=="human.assistants.catalog.v1"||!Array.isArray(e.templates)||!Array.isArray(e.drafts))throw new Error("助手目录格式不受支持");this.set({catalog:e})}catch(e){throw t()&&this.set({message:""}),e}}load=()=>this.run(t=>this.read(t));readyAssistant(t){let e=this.state.catalog?.drafts?.find(a=>a.presetId===t);if(!e||e.state!=="installed"||e.nativeState&&e.nativeState!=="installed")throw new Error("此助手已停用或尚未就绪，请核对下方组件开关。");return e}start=(t,e)=>this.run(async a=>{if(this.set({message:""}),await this.read(a),!(!a()||e?.aborted)){if(this.readyAssistant(t),!this.openSession)throw new Error("当前 DSH 未提供快捷入口，请在新会话中选择此助手模式。");await this.openSession(t,e)}});dismissPreview=()=>{this.state.busy||this.set({preview:null,message:""})};choose=t=>this.run(async e=>{if(this.set({preview:null,message:""}),this.state.catalog?.templates?.find(l=>l.id===t)?.builtin){await this.read(e),e()&&this.set({message:"此助手已包含在插件里，请在新会话中选择；无需另装独立包。"});return}let r=this.state.catalog?.drafts?.find(l=>l.templateId===t&&l.state==="draft");if(r){let l=await this.call("assistantPreview",{id:r.id,version:r.version});e()&&this.set({preview:l});return}let o=await this.call("assistantDraft",{templateId:t});if(!e()||(await this.read(e),!e()))return;let c=await this.call("assistantPreview",{id:o.id,version:o.version});e()&&this.set({preview:c})});preview=(t,e)=>this.run(async a=>{this.set({preview:null});let r=await this.call("assistantPreview",{id:t,version:e});a()&&this.set({preview:r})});reinstall=(t,e)=>this.run(async a=>{if(this.set({preview:null,message:""}),this.state.catalog?.drafts?.some(c=>c.id===t&&c.version===e&&c.replacement)){await this.read(a),a()&&this.set({message:"这个旧模式已有内置版本，请在新会话中选择对应助手，无需重新安装旧包。"});return}let r=await this.call("assistantDraft",{sourceId:t,sourceVersion:e});if(!a()||(await this.read(a),!a()))return;let o=await this.call("assistantPreview",{id:r.id,version:r.version});a()&&this.set({preview:o})});install=()=>this.run(async t=>{let e=this.state.preview;if(!e||e.expiresAt<=Date.now())throw new Error("请重新预览后确认安装");this.set({preview:null,message:"已提交原生安装，请等待结果。"});try{let a=await this.call("assistantInstall",{id:e.id,version:e.version,digest:e.digest,previewId:e.previewId});t()&&this.set({message:a.message||(a.state==="installed"?"原生预设已生效":"请核对原生安装状态")})}finally{t()&&await this.read(t)}});verify=(t,e)=>this.run(async a=>{this.set({catalog:null,message:""});let r=await this.call("assistantStatus",{id:t,version:e});a()&&(this.set({message:r.message||"状态已核对"}),await this.read(a))})};function Te(n){let t=0,e=!1;return{reset(){t++,e=!1},async start(a,r){if(!/^[a-z][a-z0-9_-]{0,63}$/.test(a))throw new Error("助手身份无效");if(e||r?.aborted)return;let o=t,c=n("uiWorkspace"),l=n("slots"),h=n("configForms")?.developerTools?.enabled?.getSnapshot(),g=l?.entries?.("conversation.hero.agentPreset"),v=Array.isArray(g)&&g.length===1?g[0]:void 0;if(h!==!0||typeof c?.clearMain!="function"||v?.options?.locale!=="settings.agentPreset"||typeof v?.inject!="function")throw new Error("当前 DSH 尚未提供快捷入口，请在原生新会话中选择此助手模式。");let d=v.inject(void 0);if(typeof d?.load!="function"||typeof d?.select!="function"||typeof d?.hooks?.agentPresetSeat?.getSnapshot!="function")throw new Error("当前 DSH 的模式选择入口不兼容，请使用原生新会话入口。");let f=()=>o===t&&!r?.aborted;e=!0;try{if(await d.load(),!f())return;let y=l.entries("conversation.hero.agentPreset");if(!Array.isArray(y)||y.length!==1||y[0]!==v)throw new Error("DSH 的模式入口已更新，请重新点击开始使用。");let C=d.hooks.agentPresetSeat.getSnapshot();if(C.busy||C.error||!C.options?.some(I=>I.id===a))throw new Error("此助手尚未就绪，请刷新状态后重试。");if(n("configForms")?.developerTools?.enabled?.getSnapshot()!==!0)throw new Error("DSH 的工作模式选择已关闭，请在原生设置中开启后重试。");c.clearMain();let P=await d.select(a);if(f()&&P)throw new Error(P)}finally{o===t&&(e=!1)}}}}var Ye=["slots","connection"];function et(n){let t=async(d,f)=>{let y=await n.connection.rpc.call("/wechat-remote-management",d,f??{});if(!y.ok)throw Object.assign(new Error(y.error.message),{code:y.error.code});return y.value},e=async()=>{let d=await n.connection.rpc.call("/api","wechatHost/describe",{args:{request:{}}});if(!d.ok)throw new Error(`wechatHost/describe: ${d.error.code}`);let f=d.value;if(f?.ok!==!0||f.value===void 0)throw new Error("wechatHost/describe returned an invalid result");return f.value},a=new K(e,t),r=0,o=async d=>{let f=r,y=await n.connection.rpc.call("/api","wechatClawbot/control",{args:{request:d}});if(f!==r)throw new Error("节点连接已变化，请刷新 ClawBot 状态");if(!y.ok)throw new Error("ClawBot 组件暂不可用，请核对下方组件开关");let C=y.value;if(!C?.ok)throw new Error(C?.error?.message||"ClawBot 状态读取失败");return C.value},c=async(d,f)=>{let y=r,C=await n.connection.rpc.call("/api",`humanTools/${d}`,{args:{request:f}});if(y!==r)throw new Error("电脑连接已变化，请重新查看助手目录");if(!C.ok)throw new Error(C.error.message);let P=C.value;if(!P?.ok||typeof P.valueJson!="string"||P.valueJson.length>256*1024)throw new Error(P?.error?.message||"此节点尚未提供助手能力");return JSON.parse(P.valueJson)},l,h=new ce(c,async(d,f)=>{if(!l)throw new Error("原生会话入口尚未就绪，请稍后再试。");await l.start(d,f)});n.inject(["uiWorkspace","slots","configForms"],d=>{let f=Te(y=>d.get(y));l=f,d.effect(()=>()=>{f.reset(),l===f&&(l=void 0)},"wechat assistant navigation")}),n.effect(()=>{let d=n.on("connection/reset",()=>{r++,l?.reset(),h.reset()});return()=>{r++,d(),h.dispose()}},"wechat assistant lifecycle"),n.effect(()=>()=>a.dispose(),"wechat shared page");let g=()=>Pe(d=>n.get(d)),v=()=>({describeHost:e,callManagement:t,store:a,assistants:h,clawbotCall:o});n.slots.inject("settings.section",()=>n.slots.register({name:"settings.section",id:"harness-remote",order:30,label:"微信连接",inject:v},me));for(let d of["plugins.bundle.activation","plugins.bundle.config"])n.slots.inject(d,()=>{let f=["dsh-wechat-remote","@harness-remote/dsh-wechat-remote"].map(y=>n.slots.register({name:d,key:y,inject:v},d==="plugins.bundle.activation"?oe:me));return()=>f.forEach(y=>y())});n.inject(["pluginNavigation","remote.pluginManager"],()=>n.slots.inject("sidebar.footer.action",()=>n.slots.register({name:"sidebar.footer.action",id:"harness-remote",order:30,label:"微信连接",inject:()=>({openPlugin:g})},Ne)))}

return module.exports;}});
