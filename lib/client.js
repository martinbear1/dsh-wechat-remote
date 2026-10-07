window.__ModuleLoader__.load({id:"@harness-remote/dsh-wechat-remote",factory:(require)=>{var module={exports:{}};var exports=module.exports;"use strict";var xe=Object.create;var J=Object.defineProperty;var ke=Object.getOwnPropertyDescriptor;var Ce=Object.getOwnPropertyNames;var Se=Object.getPrototypeOf,Ne=Object.prototype.hasOwnProperty;var Pe=(a,t)=>()=>(t||a((t={exports:{}}).exports,t),t.exports),He=(a,t)=>{for(var e in t)J(a,e,{get:t[e],enumerable:!0})},Y=(a,t,e,s)=>{if(t&&typeof t=="object"||typeof t=="function")for(let r of Ce(t))!Ne.call(a,r)&&r!==e&&J(a,r,{get:()=>t[r],enumerable:!(s=ke(t,r))||s.enumerable});return a};var B=(a,t,e)=>(e=a!=null?xe(Se(a)):{},Y(t||!a||!a.__esModule?J(e,"default",{value:a,enumerable:!0}):e,a)),De=a=>Y(J({},"__esModule",{value:!0}),a);var I=Pe((je,te)=>{"use strict";var Ae=`.hr_3e09633_root {\r
  box-sizing: border-box;\r
  width: 100%;\r
  max-width: 760px;\r
  color: var(--dsw-alias-label-primary, #171a20);\r
  display: flex;\r
  flex-direction: column;\r
  gap: 14px;\r
}\r
\r
.hr_3e09633_hero,\r
.hr_3e09633_connectCard,\r
.hr_3e09633_pairingCard {\r
  border: 1px solid var(--dsw-alias-border-l2, rgba(128, 140, 160, 0.22));\r
  background: var(--dsw-alias-bg-layer-3, #fff);\r
  border-radius: 12px;\r
}\r
\r
.hr_3e09633_hero {\r
  min-height: 72px;\r
  display: flex;\r
  align-items: center;\r
  justify-content: space-between;\r
  gap: 20px;\r
  padding: 16px 18px;\r
}\r
\r
.hr_3e09633_identity {\r
  min-width: 0;\r
  display: flex;\r
  align-items: center;\r
  gap: 12px;\r
}\r
\r
.hr_3e09633_mark {\r
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
.hr_3e09633_identityCopy {\r
  min-width: 0;\r
}\r
\r
.hr_3e09633_identityCopy h3,\r
.hr_3e09633_identityCopy p,\r
.hr_3e09633_connectCard p,\r
.hr_3e09633_pairingHead p,\r
.hr_3e09633_securityNote {\r
  margin: 0;\r
}\r
\r
.hr_3e09633_sidebarButton { display: flex; align-items: center; gap: 10px; width: 100%; min-height: 38px; padding: 8px 12px; border: 0; border-radius: 8px; background: transparent; color: var(--dsw-alias-label-secondary, #4d5564); font: inherit; font-size: 14px; cursor: pointer; text-align: left; }\r
.hr_3e09633_sidebarButton:hover { background: var(--dsw-alias-bg-layer-2, #eef1f5); color: var(--dsw-alias-label-primary, #171a20); }\r
.hr_3e09633_sidebarButton[data-wide='false'] { width: 36px; min-height: 36px; padding: 8px; justify-content: center; }\r
.hr_3e09633_sidebarButton svg { flex: none; }\r
.hr_3e09633_sidebarButton:focus-visible { outline: 2px solid var(--dsw-alias-state-business-primary, #4e79ff); outline-offset: 2px; }\r
.hr_3e09633_actions { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 16px; }\r
.hr_3e09633_pageDialog.hr_3e09633_pageDialog { width: min(820px, 100%); max-height: 100%; }\r
.hr_3e09633_pageDialogContent.hr_3e09633_pageDialogContent { min-height: 0; overflow-y: auto; }\r
.hr_3e09633_helpText { color: var(--dsw-alias-label-secondary, #647084); font-size: 12px; line-height: 1.7; margin: 8px 0; }\r
\r
.hr_3e09633_companionCard {\r
  border: 1px solid var(--dsw-alias-state-business-primary, #4e79ff);\r
  border-left-width: 4px;\r
  border-radius: 10px;\r
  background: var(--dsw-alias-bg-layer-3, #fff);\r
  padding: 14px 16px;\r
  line-height: 1.6;\r
  overflow-wrap: anywhere;\r
}\r
.hr_3e09633_companionCard strong { font-size: 14px; }\r
.hr_3e09633_companionCard p { margin: 4px 0; font-size: 13px; }\r
.hr_3e09633_companionCard small { color: var(--dsw-alias-label-secondary, #4d5564); }\r
.hr_3e09633_companionCard progress { display: block; width: 100%; margin: 8px 0; accent-color: #4e79ff; }\r
.hr_3e09633_companionCard[data-state='complete'] { border-color: var(--dsw-alias-state-success-primary, #1f9d68); }\r
.hr_3e09633_companionCard[data-state='unavailable'], .hr_3e09633_companionCard[data-state='recovering'] { border-color: #b5861d; }

/* Assistant modes are a compact owner-facing catalog, not an installation log. */
.hr_3e09633_assistantsCard { padding: 14px 18px; border: 1px solid var(--dsw-alias-border-l2, #e2e6ee); border-radius: 12px; background: var(--dsw-alias-bg-layer-3, #fff); line-height: 1.5; overflow-wrap: anywhere; }
.hr_3e09633_assistantsCard h3, .hr_3e09633_assistantsCard h4, .hr_3e09633_assistantsCard p { margin: 0; }
.hr_3e09633_assistantsCard h3 { font-size: 14px; }
.hr_3e09633_assistantsCard h4 { font-size: 14px; margin: 16px 0 6px; }
.hr_3e09633_assistantsCard p { color: var(--dsw-alias-label-secondary, #647084); font-size: 12px; }
.hr_3e09633_assistantsHeading { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 4px; }
.hr_3e09633_assistantsHeading p { margin-top: 4px; }
.hr_3e09633_assistantChoices { display: flex; flex-direction: column; }
.hr_3e09633_assistantChoice { padding: 10px 0; display: flex; align-items: center; gap: 12px; }
.hr_3e09633_assistantChoiceCopy { flex: 1; min-width: 0; }
.hr_3e09633_assistantChoiceHead, .hr_3e09633_assistantEntryHead { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 8px; }
.hr_3e09633_assistantChoiceHead { justify-content: flex-start; gap: 6px; }
.hr_3e09633_assistantChoiceHead strong { font-size: 13px; }
.hr_3e09633_assistantChoice p { flex: 1; }
.hr_3e09633_assistantStatus { color: var(--dsw-alias-state-success-primary, #17845b); font-size: 12px; }
.hr_3e09633_assistantPrimary, .hr_3e09633_assistantSecondary, .hr_3e09633_assistantTextButton { min-height: 42px; padding: 9px 16px; border-radius: 9px; font: inherit; font-size: 13px; cursor: pointer; }
.hr_3e09633_assistantPrimary { color: #fff; background: var(--dsw-alias-state-business-primary, #4e79ff); border: 1px solid transparent; }
.hr_3e09633_assistantSecondary { color: var(--dsw-alias-state-business-primary, #4e79ff); background: var(--dsw-alias-bg-layer-3, #fff); border: 1px solid var(--dsw-alias-border-l2, #d7deed); }
.hr_3e09633_assistantTextButton { min-height: 32px; padding: 3px 8px; border: 0; background: transparent; color: var(--dsw-alias-state-business-primary, #4e79ff); }
.hr_3e09633_assistantPrimary:disabled, .hr_3e09633_assistantSecondary:disabled, .hr_3e09633_assistantTextButton:disabled { opacity: .5; cursor: default; }
.hr_3e09633_assistantPrimary:focus-visible, .hr_3e09633_assistantSecondary:focus-visible, .hr_3e09633_assistantTextButton:focus-visible, .hr_3e09633_assistantDetails summary:focus-visible { outline: 2px solid var(--dsw-alias-state-business-primary, #4e79ff); outline-offset: 3px; }
.hr_3e09633_assistantCustomize { margin-top: 2px; border-top: 1px solid var(--dsw-alias-border-l2, #e2e6ee); }
.hr_3e09633_assistantCustomize > p { margin-bottom: 10px; }
.hr_3e09633_assistantCustomize .hr_3e09633_assistantChoice { background: transparent; }
.hr_3e09633_assistantDetails { margin-top: 14px; color: var(--dsw-alias-label-secondary, #647084); font-size: 12px; }
.hr_3e09633_assistantDetails summary { padding: 5px 0; cursor: pointer; }
.hr_3e09633_assistantDetails ul { margin: 8px 0; padding-left: 20px; }
.hr_3e09633_assistantDetails li { margin: 5px 0; }
.hr_3e09633_assistantPreview { padding: 14px; margin-top: 16px !important; border-radius: 10px; background: var(--dsw-alias-bg-layer-1, #f0f4ff); }
.hr_3e09633_assistantUnavailable { color: var(--dsw-alias-label-secondary, #647084); font-size: 12px; }
.hr_3e09633_assistantHelpAnchor { display: inline-flex; position: relative; }
.hr_3e09633_assistantHelpButton { padding: 0; width: 17px; height: 17px; border-radius: 50%; border: 1px solid var(--dsw-alias-border-l2, #bec6d2); background: transparent; color: var(--dsw-alias-label-tertiary, #8490a2); font: inherit; font-size: 11px; cursor: help; }
.hr_3e09633_assistantTooltip { visibility: hidden; opacity: 0; position: absolute; z-index: 2; top: 24px; left: 0; width: min(300px, 55vw); padding: 10px 12px; border-radius: 8px; border: 1px solid var(--dsw-alias-border-l2, #d7deed); background: var(--dsw-alias-bg-layer-3, #fff); color: var(--dsw-alias-label-secondary, #647084); box-shadow: 0 4px 16px #0002; font-size: 12px; font-weight: normal; }
.hr_3e09633_assistantHelpAnchor:hover .hr_3e09633_assistantTooltip, .hr_3e09633_assistantHelpAnchor:focus-within .hr_3e09633_assistantTooltip { visibility: visible; opacity: 1; }
.hr_3e09633_assistantPreview h4 { margin-top: 0; }
.hr_3e09633_assistantPreview p + p { margin-top: 8px; }
.hr_3e09633_assistantButtons { display: flex; gap: 10px; flex-wrap: wrap; margin-top: 14px; }
.hr_3e09633_assistantEntry { margin-top: 10px; padding: 12px 0; border-top: 1px solid var(--dsw-alias-border-l2, #e2e6ee); }
.hr_3e09633_assistantEntryHead { margin-bottom: 8px; font-size: 13px; }
.hr_3e09633_assistantEntryHead > span { color: var(--dsw-alias-label-secondary, #647084); font-size: 12px; }
.hr_3e09633_assistantEntry > button + button { margin-left: 8px; }
@media (max-width: 520px) { .hr_3e09633_assistantsCard { padding: 12px; } .hr_3e09633_assistantChoice { gap: 8px; } }
\r
.hr_3e09633_identityCopy h3 {\r
  font-size: 15px;\r
  font-weight: 650;\r
  line-height: 22px;\r
}\r
\r
.hr_3e09633_identityCopy p {\r
  color: var(--dsw-alias-label-tertiary, #7d8492);\r
  font-size: 12px;\r
  line-height: 18px;\r
  overflow: hidden;\r
  text-overflow: ellipsis;\r
  white-space: nowrap;\r
}\r
\r
.hr_3e09633_overall {\r
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
.hr_3e09633_overall[data-ready='true'] {\r
  color: var(--dsw-alias-state-success-primary, #1f9d68);\r
}\r
\r
.hr_3e09633_statusDot {\r
  width: 7px;\r
  height: 7px;\r
  background: var(--dsw-alias-label-tertiary, #8b93a2);\r
  border-radius: 999px;\r
  flex: none;\r
}\r
\r
.hr_3e09633_statusDot[data-state='ready'] {\r
  background: var(--dsw-alias-state-success-primary, #1f9d68);\r
}\r
\r
.hr_3e09633_statusDot[data-state='busy'] {\r
  background: var(--dsw-alias-state-business-primary, #4e79ff);\r
  animation: harnessRemotePulse 1.2s ease-in-out infinite;\r
}\r
\r
.hr_3e09633_capabilities {\r
  grid-template-columns: repeat(3, minmax(0, 1fr));\r
  gap: 10px;\r
  display: grid;\r
}\r
\r
.hr_3e09633_capability {\r
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
.hr_3e09633_capability > .hr_3e09633_statusDot {\r
  margin-top: 6px;\r
}\r
\r
.hr_3e09633_capabilityCopy {\r
  min-width: 0;\r
  display: flex;\r
  flex-direction: column;\r
  gap: 1px;\r
}\r
\r
.hr_3e09633_capabilityCopy strong {\r
  font-size: 12.5px;\r
  font-weight: 600;\r
  line-height: 19px;\r
}\r
\r
.hr_3e09633_capabilityCopy span {\r
  color: var(--dsw-alias-label-tertiary, #7d8492);\r
  font-size: 11px;\r
  line-height: 17px;\r
  overflow: hidden;\r
  text-overflow: ellipsis;\r
  white-space: nowrap;\r
}\r
\r
.hr_3e09633_notice {\r
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
.hr_3e09633_notice button,\r
.hr_3e09633_secondaryButton {\r
  border: 1px solid var(--dsw-alias-border-l2, rgba(128, 140, 160, 0.28));\r
  color: var(--dsw-alias-label-primary, #171a20);\r
  background: var(--dsw-alias-bg-layer-1, #f5f6f8);\r
  border-radius: 7px;\r
  font: inherit;\r
  cursor: pointer;\r
}\r
\r
.hr_3e09633_notice button {\r
  flex: none;\r
  padding: 3px 9px;\r
}\r
\r
.hr_3e09633_connectCard {\r
  display: flex;\r
  align-items: center;\r
  justify-content: space-between;\r
  gap: 20px;\r
  padding: 18px;\r
}\r
\r
.hr_3e09633_connectCard strong,\r
.hr_3e09633_pairingHead strong {\r
  font-size: 14px;\r
  font-weight: 650;\r
  line-height: 21px;\r
}\r
\r
.hr_3e09633_connectCard p,\r
.hr_3e09633_pairingHead p {\r
  max-width: 470px;\r
  color: var(--dsw-alias-label-tertiary, #7d8492);\r
  font-size: 12px;\r
  line-height: 18px;\r
}\r
\r
.hr_3e09633_primaryButton {\r
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
.hr_3e09633_primaryButton:hover {\r
  filter: brightness(1.04);\r
}\r
\r
.hr_3e09633_primaryButton:focus-visible,\r
.hr_3e09633_secondaryButton:focus-visible,\r
.hr_3e09633_notice button:focus-visible {\r
  outline: 2px solid var(--dsw-alias-state-business-primary, #4e79ff);\r
  outline-offset: 2px;\r
}\r
\r
.hr_3e09633_pairingCard {\r
  padding: 18px;\r
}\r
\r
.hr_3e09633_pairingHead {\r
  display: flex;\r
  align-items: center;\r
  justify-content: space-between;\r
  gap: 16px;\r
}\r
\r
.hr_3e09633_secondaryButton {\r
  min-height: 32px;\r
  flex: none;\r
  padding: 0 11px;\r
  font-size: 12px;\r
}\r
\r
.hr_3e09633_secondaryButton:disabled,\r
.hr_3e09633_primaryButton:disabled {\r
  cursor: default;\r
  opacity: 0.55;\r
}\r
\r
.hr_3e09633_qrArea {\r
  min-height: 292px;\r
  margin-top: 16px;\r
  display: flex;\r
  flex-direction: column;\r
  align-items: center;\r
  justify-content: center;\r
  gap: 10px;\r
}\r
\r
.hr_3e09633_qr,\r
.hr_3e09633_qrPlaceholder {\r
  box-sizing: border-box;\r
  width: 280px;\r
  height: 280px;\r
  border-radius: 12px;\r
}\r
\r
.hr_3e09633_qr {\r
  background: #fff;\r
  padding: 10px;\r
  image-rendering: pixelated;\r
}\r
\r
.hr_3e09633_qrPlaceholder {\r
  color: var(--dsw-alias-label-tertiary, #7d8492);\r
  background: var(--dsw-alias-bg-layer-1, #f5f6f8);\r
  border: 1px dashed var(--dsw-alias-border-l2, rgba(128, 140, 160, 0.28));\r
  display: grid;\r
  place-items: center;\r
  font-size: 12px;\r
}\r
\r
.hr_3e09633_qrValidity {\r
  color: var(--dsw-alias-label-tertiary, #7d8492);\r
  font-size: 11px;\r
  line-height: 17px;\r
}\r
\r
.hr_3e09633_securityNote {\r
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
  .hr_3e09633_statusDot[data-state='busy'] {\r
    animation: none;\r
  }\r
}\r
\r
@media (max-width: 680px) {\r
  .hr_3e09633_capabilities {\r
    grid-template-columns: minmax(0, 1fr);\r
  }\r
\r
  .hr_3e09633_connectCard {\r
    align-items: stretch;\r
    flex-direction: column;\r
  }\r
\r
  .hr_3e09633_primaryButton {\r
    width: 100%;\r
  }\r
\r
  .hr_3e09633_qrArea {\r
    flex-direction: column;\r
    gap: 12px;\r
  }\r
\r
}\r
.hr_3e09633_updateCard { border: 1px solid var(--dsw-alias-border-l2, #ddd); background: var(--dsw-alias-bg-layer-3, #fff); border-radius: 12px; padding: 14px 18px; line-height: 1.5; font-size: 13px; overflow-wrap: anywhere; }
.hr_3e09633_updateHeading { font-size: 14px; line-height: 21px; margin: 0 0 8px; }
.hr_3e09633_updateRow { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 8px 16px; }
.hr_3e09633_updateCopy { flex: 1 1 240px; min-width: 0; }
.hr_3e09633_updateControl { display: flex; flex-direction: column; align-items: flex-end; gap: 2px; max-width: 100%; }
.hr_3e09633_updateControl .hr_3e09633_updateLabel { font-size: 12px; font-weight: 500; }
.hr_3e09633_updateControl .hr_3e09633_updateChecked { margin-top: 0; }
.hr_3e09633_updateRow > .hr_3e09633_updateActions { margin-top: 0; }
.hr_3e09633_updateEndpoint p, .hr_3e09633_companionInline p { margin: 4px 0; }
.hr_3e09633_updateScope { color: var(--dsw-alias-label-tertiary, #7d8492); font-size: 12px; font-weight: 400; }
.hr_3e09633_updateEndpoint + div { margin-top: 10px; padding-top: 10px; border-top: 1px solid var(--dsw-alias-border-l2, #ddd); }
.hr_3e09633_updateActions { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; margin-top: 8px; }
.hr_3e09633_updateActions .hr_3e09633_primaryButton { width: auto; min-height: 32px; padding: 0 12px; }
.hr_3e09633_updateActions .hr_3e09633_secondaryButton { min-height: 32px; }
.hr_3e09633_updatePeerNote { margin: 0; color: var(--dsw-alias-label-tertiary, #7d8492); font-size: 12px; }
.hr_3e09633_updateDetails { color: var(--dsw-alias-label-secondary, #647084); font-size: 12px; }
.hr_3e09633_updateDetails summary { cursor: pointer; margin-top: 4px; }
.hr_3e09633_companionInline strong { font-size: 13px; font-weight: 500; }
.hr_3e09633_companionInline small { display: block; color: var(--dsw-alias-label-secondary, #647084); font-size: 12px; margin-top: 4px; }
.hr_3e09633_companionInline progress { display: block; width: 100%; height: 8px; margin: 8px 0; accent-color: var(--dsw-alias-state-business-primary, #4e79ff); }
.hr_3e09633_companionInline[data-state='complete'] .hr_3e09633_updateCopy > strong { color: var(--dsw-alias-state-success-primary, #1f9d68); }
.hr_3e09633_companionInline[data-state='unavailable'] .hr_3e09633_updateCopy > strong, .hr_3e09633_companionInline[data-state='recovering'] .hr_3e09633_updateCopy > strong { color: #b5861d; }
.hr_3e09633_updateLabel { color: inherit; }\r
.hr_3e09633_updateLabel[data-severity="none"] { color: #218b5c; }\r
.hr_3e09633_updateLabel[data-severity="unknown"] { color: var(--text-secondary, #858b96); }\r
.hr_3e09633_updateLabel[data-severity="required"] { color: #d54052; }\r
.hr_3e09633_updateLabel[data-severity="recommended"], .hr_3e09633_updateLabel[data-severity="info"] { color: #b5861d; }\r
.hr_3e09633_updateProgress { width: 100%; height: 8px; margin-top: 8px; accent-color: #7487ef; }
.hr_3e09633_updateVersions { display: flex; flex-wrap: wrap; gap: 4px 16px; margin: 6px 0; }
.hr_3e09633_updateVersions span { color: var(--text-secondary, #858b96); }\r
.hr_3e09633_updateVersions strong { color: var(--text-primary, inherit); font-weight: 500; }\r
.hr_3e09633_updateCommand { display: flex; flex-wrap: wrap; align-items: center; gap: 12px; margin-top: 12px; }\r
.hr_3e09633_updateCommand code { flex: 1 1 240px; white-space: pre-wrap; overflow-wrap: anywhere; user-select: text; }\r
.hr_3e09633_updateChecked { display: block; margin-top: 4px; color: var(--text-secondary, #858b96); font-size: 11px; }
`,ee="@harness-remote/dsh-wechat-remote/HarnessRemoteSettings.module.css";if(typeof document<"u"&&document.querySelector("style[data-plugin-css="+JSON.stringify(ee)+"]")===null){let a=document.createElement("style");a.dataset.plugin="@harness-remote/dsh-wechat-remote",a.dataset.pluginCss=ee,a.textContent=Ae,document.head.appendChild(a)}te.exports={root:"hr_3e09633_root",hero:"hr_3e09633_hero",connectCard:"hr_3e09633_connectCard",pairingCard:"hr_3e09633_pairingCard",identity:"hr_3e09633_identity",mark:"hr_3e09633_mark",identityCopy:"hr_3e09633_identityCopy",pairingHead:"hr_3e09633_pairingHead",securityNote:"hr_3e09633_securityNote",sidebarButton:"hr_3e09633_sidebarButton",actions:"hr_3e09633_actions",pageDialog:"hr_3e09633_pageDialog",pageDialogContent:"hr_3e09633_pageDialogContent",helpText:"hr_3e09633_helpText",companionCard:"hr_3e09633_companionCard",assistantsCard:"hr_3e09633_assistantsCard",assistantsHeading:"hr_3e09633_assistantsHeading",assistantChoices:"hr_3e09633_assistantChoices",assistantChoice:"hr_3e09633_assistantChoice",assistantChoiceCopy:"hr_3e09633_assistantChoiceCopy",assistantChoiceHead:"hr_3e09633_assistantChoiceHead",assistantEntryHead:"hr_3e09633_assistantEntryHead",assistantStatus:"hr_3e09633_assistantStatus",assistantPrimary:"hr_3e09633_assistantPrimary",assistantSecondary:"hr_3e09633_assistantSecondary",assistantTextButton:"hr_3e09633_assistantTextButton",assistantDetails:"hr_3e09633_assistantDetails",assistantCustomize:"hr_3e09633_assistantCustomize",assistantPreview:"hr_3e09633_assistantPreview",assistantUnavailable:"hr_3e09633_assistantUnavailable",assistantHelpAnchor:"hr_3e09633_assistantHelpAnchor",assistantHelpButton:"hr_3e09633_assistantHelpButton",assistantTooltip:"hr_3e09633_assistantTooltip",assistantButtons:"hr_3e09633_assistantButtons",assistantEntry:"hr_3e09633_assistantEntry",overall:"hr_3e09633_overall",statusDot:"hr_3e09633_statusDot",capabilities:"hr_3e09633_capabilities",capability:"hr_3e09633_capability",capabilityCopy:"hr_3e09633_capabilityCopy",notice:"hr_3e09633_notice",secondaryButton:"hr_3e09633_secondaryButton",primaryButton:"hr_3e09633_primaryButton",qrArea:"hr_3e09633_qrArea",qr:"hr_3e09633_qr",qrPlaceholder:"hr_3e09633_qrPlaceholder",qrValidity:"hr_3e09633_qrValidity",updateCard:"hr_3e09633_updateCard",updateHeading:"hr_3e09633_updateHeading",updateRow:"hr_3e09633_updateRow",updateCopy:"hr_3e09633_updateCopy",updateControl:"hr_3e09633_updateControl",updateLabel:"hr_3e09633_updateLabel",updateChecked:"hr_3e09633_updateChecked",updateActions:"hr_3e09633_updateActions",updateEndpoint:"hr_3e09633_updateEndpoint",companionInline:"hr_3e09633_companionInline",updateScope:"hr_3e09633_updateScope",updatePeerNote:"hr_3e09633_updatePeerNote",updateDetails:"hr_3e09633_updateDetails",updateProgress:"hr_3e09633_updateProgress",updateVersions:"hr_3e09633_updateVersions",updateCommand:"hr_3e09633_updateCommand"}});var Be={};He(Be,{apply:()=>Re,inject:()=>Ee});module.exports=De(Be);var ie=require("react"),oe=require("@deepseek-ai/dsh-client-ui-primitives");var P=B(I(),1),v=require("react/jsx-runtime");function ae({value:a,onDecide:t,deciding:e=!1,compact:s=!1}){if(!a||!s&&a.state==="idle")return null;let r={"confirmation-required":"是否更新下方指定端的插件？",deferred:"已暂缓此次联动更新",pending:"联动更新待处理",busy:"等待待更新端的任务结束",preparing:"正在准备联动更新",installing:"正在安装插件更新",verifying:"正在核验更新后的恢复状态",recovering:"正在恢复更新前的插件","restart-required":"待更新端需启动或重启确认","self-restart-required":"当前端待重启，尚未生效",unverified:"两端更新状态待核实",complete:"两端插件已对齐",unavailable:"联动更新尚未确认成功"},l=["preparing","installing","verifying","recovering"].includes(a.state),o=a.versions?.peer==="desktop"?"Desktop":a.versions?.peer==="web"?"Web":null,d=a.target?.scope==="desktop"?"Desktop":a.target?.scope==="web"?"Web":null,g=d||"更新端",f={pending:`等待 ${g} 就绪`,busy:`${g} 有任务，等待空闲`,preparing:`正在准备 ${g} 更新`,installing:`正在更新 ${g}`,verifying:`正在核对 ${g} 更新结果`,recovering:`正在恢复 ${g} 原版本`,"restart-required":`${g} 已安装，待启动或重连确认`,"self-restart-required":"当前端待重启，尚未生效",unverified:"更新状态待核对",complete:"两端版本已同步",unavailable:"更新未完成，请核对"},p=["confirmation-required","deferred"].includes(a.state);if(s&&a.state==="idle"&&!a.versions?.peerInstalled)return(0,v.jsx)("p",{className:P.default.updatePeerNote,children:"未检测到可同步更新的另一端；当前端可独立使用。"});let h=a.state==="idle"?"未发现待确认的同步更新":s&&p&&d&&a.target?`${d} 可更新至 ${a.target.version}${a.state==="deferred"?" · 已暂缓":""}`:s&&a.state==="self-restart-required"?"当前端重启后可检查同步更新":(s?f[a.state]:void 0)||r[a.state]||"插件更新状态待核对",b=p&&a.offerId&&t?(0,v.jsxs)("div",{className:P.default.updateActions,children:[(0,v.jsx)("button",{type:"button",className:P.default.primaryButton,disabled:e,onClick:()=>t("approve"),children:e?"确认中…":d?`确认更新 ${d}`:"确认更新指定端"}),(0,v.jsx)("button",{type:"button",className:P.default.secondaryButton,disabled:e,onClick:()=>t("later"),children:"稍后再说"})]}):null;return(0,v.jsxs)("aside",{className:s?P.default.companionInline:P.default.companionCard,"data-state":a.state,role:"status","aria-live":"polite",children:[s?(0,v.jsxs)("div",{className:P.default.updateRow,children:[(0,v.jsxs)("div",{className:P.default.updateCopy,children:[o?(0,v.jsxs)("div",{className:P.default.updateVersions,children:[(0,v.jsxs)("strong",{children:[o," ",(0,v.jsx)("span",{className:P.default.updateScope,children:"同一主机"})]}),(0,v.jsx)("span",{children:a.versions?.peerInstalled?`已安装 ${a.versions.peerInstalled}`:"安装或启用状态未确认"})]}):null,(0,v.jsx)("strong",{children:h})]}),b]}):(0,v.jsx)("strong",{children:h}),s?(0,v.jsx)(v.Fragment,{children:a.state!=="idle"&&a.message?(0,v.jsxs)("details",{className:P.default.updateDetails,children:[(0,v.jsx)("summary",{children:"详细状态"}),(0,v.jsx)("p",{children:a.message})]}):null}):a.message?(0,v.jsx)("p",{children:a.message}):null,!s&&a.versions?(0,v.jsxs)("small",{children:[a.versions.current==="desktop"?"Desktop":"Web","：运行 ",a.versions.running," · 已安装 ",a.versions.installed??"未确认","；",o,"：已安装 ",a.versions.peerInstalled??"未确认或未启用"]}):null,b?(0,v.jsxs)(v.Fragment,{children:[s?null:b,(0,v.jsx)("small",{className:P.default.updateChecked,children:"空闲后更新，连接会短暂中断；保留配对与会话。"})]}):null,l?(0,v.jsx)("progress",{"aria-label":"联动更新进度"}):null,a.state==="busy"?(0,v.jsx)("small",{children:"不用手动停止任务。请保持两端运行，空闲后会继续检查。"}):l?(0,v.jsx)("small",{children:"请保持两端当前状态，暂勿退出、重启或重复安装。关闭本设置页不会取消更新。"}):a.state==="unavailable"?(0,v.jsx)("small",{children:"请在待更新端核对版本，必要时使用其原安装入口。"}):null]})}async function se(a,t,e=fetch){let s=await a(),r=s.gate;if(!r)throw new Error("当前节点没有提供配对入口");let l=r.profileScope==="desktop",o=r.localDoor?.port,d=Number.isSafeInteger(o)&&o>=1&&o<=65535?`http://127.0.0.1:${o}`:null;if(r.management==="authenticated-rpc")return{host:s,runtime:r,localOrigin:l?null:d,status:()=>t("status"),pairCode:()=>t("pair-code"),decide:(f,p)=>t("companion-decision",{offerId:f,action:p})};if(l||r.management==="unavailable"||!d||r.localDoor.state!=="listening")throw new Error("当前节点配对入口尚未就绪");let g=async f=>{let p=await e(d+f,{cache:"no-store"});if(!p.ok)throw new Error(`配对请求失败 (${p.status})`);return p.json()};return{host:s,runtime:r,localOrigin:d,status:()=>g("/gate/status"),pairCode:()=>g("/pair/code"),decide:async(f,p)=>{let h=await e(d+"/gate/companion/decision",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({offerId:f,action:p})});if(!h.ok)throw new Error("更新通知已变化，请刷新后重试");return h.json()}}}var V=class{constructor(t,e=globalThis.fetch){this.origin=t;this.fetcher=e.bind(globalThis)}value={check:null,checking:!1,progress:null,error:"",copied:!1,resumeFailed:!1};listeners=new Set;reading;installing=!1;disposed=!1;job=null;timer;pollGeneration=0;recovering=!1;fetcher;getSnapshot=()=>this.value;subscribe=t=>this.disposed?()=>{}:(this.listeners.add(t),this.listeners.size===1&&this.refresh(),()=>{this.listeners.delete(t)});patch(t){if(!this.disposed){this.value={...this.value,...t};for(let e of this.listeners)e()}}refresh=()=>this.disposed?Promise.resolve():this.reading?this.reading:(this.patch({checking:!0,error:"",copied:!1}),this.reading=(async()=>{try{let t=await this.fetcher(this.origin+"/gate/update/check",{signal:AbortSignal.timeout(1e4)}),e=await t.json();if(!t.ok)throw new Error(e.error||"暂时无法检查更新");if(!e.advice?.current||typeof e.advice.label!="string")throw new Error("更新检查返回信息不完整");if(this.patch({check:e}),this.installing||this.job||this.recovering)return;e.activeJob?.statusOrigin?this.follow(e.activeJob):e.lastResult?.phase==="unknown"?this.patch({progress:e.lastResult}):e.mode==="busy"?this.patch({progress:{phase:"preparing",progress:0,message:"更新仍在准备或等待确认，请稍后重新检查；不要重复安装。",terminal:!0}}):this.patch({progress:e.lastResult??null})}catch(t){this.patch({check:null,error:t instanceof Error?t.message:"暂时无法检查更新"})}finally{this.patch({checking:!1})}})().finally(()=>{this.reading=void 0}),this.reading);follow(t){if(this.disposed||this.job?.jobId===t.jobId)return;this.job=t;let e=++this.pollGeneration,s=Date.now()+10*6e4;clearTimeout(this.timer),this.patch({progress:{phase:"recovering",progress:0,message:"正在恢复更新进度…",terminal:!1}});let r=async()=>{if(this.disposed||e!==this.pollGeneration)return;let l;try{let o=await this.fetcher(t.statusOrigin+"/status",{headers:{Authorization:"Bearer "+t.statusToken},signal:AbortSignal.timeout(4e3)});if(!o.ok)throw new Error("进度暂不可用");let d=await o.json();if(d.jobId!==t.jobId||typeof d.terminal!="boolean"||typeof d.message!="string")throw new Error("进度不匹配");l=d}catch{try{let o=await this.fetcher(this.origin+"/gate/update/status",{signal:AbortSignal.timeout(3e3)}),d=await o.json();o.ok&&d.lastResult?.jobId===t.jobId&&(l=d.lastResult)}catch{}}if(!(this.disposed||e!==this.pollGeneration)){if(l&&(this.patch({progress:l}),l.terminal)){this.job=null,l.ok?this.resume(t.jobId):this.refresh();return}if(Date.now()>s){this.job=null,this.patch({progress:{phase:"unknown",progress:0,message:"暂时无法确认更新结果。请重新打开此主机 WebUI 检查版本；不要重复安装或删除节点。",terminal:!0}});return}this.timer=setTimeout(()=>void r(),1e3)}};r()}async resume(t){this.recovering=!0;let e=Date.now()+3e4,s=async()=>{try{let r=await this.fetcher(this.origin+"/gate/update/resume?job="+encodeURIComponent(t),{signal:AbortSignal.timeout(3e3)});if(!r.ok)throw new Error("尚未恢复");let l=await r.json();if(!l.url)throw new Error("缺少恢复地址");let o=new URL(l.url);if(o.origin!==window.location.origin||o.pathname!=="/"||o.username||o.password||o.hash)throw new Error("恢复地址不匹配");this.disposed||window.location.replace(o.href)}catch{if(this.disposed)return;if(Date.now()>=e){this.recovering=!1,this.patch({resumeFailed:!0});return}this.timer=setTimeout(()=>void s(),1e3)}};await s()}install=async()=>{let{check:t,checking:e,error:s,progress:r}=this.value;if(this.disposed||!t?.canInstall||e||s||r&&!r.terminal||this.installing||this.job||this.recovering)return;this.installing=!0,this.patch({error:"",check:{...t,canInstall:!1,ticket:""},progress:{phase:"download",progress:10,message:"正在下载并验证更新包；当前插件尚未替换",terminal:!1}});let l=!1;try{let o=await this.fetcher(this.origin+"/gate/update/start",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({ticket:t.ticket})}),d=await o.json();if(l=!o.ok&&typeof d.error=="string",!o.ok||!d.statusOrigin)throw new Error(d.error||"无法取得更新进度，请重新检查");this.follow(d)}catch(o){if(this.disposed)return;if(l)this.patch({progress:{phase:"failed",progress:0,message:(o instanceof Error?o.message:"更新暂不可用")+"。请重新检查更新。",terminal:!0,ok:!1}});else{try{let d=await this.fetcher(this.origin+"/gate/update/status",{signal:AbortSignal.timeout(3e3)}),g=await d.json();if(d.ok&&g.activeJob?.statusOrigin){this.follow(g.activeJob);return}}catch{}this.patch({progress:{phase:"unknown",progress:0,message:"连接中断，暂时无法确认更新结果。请稍后检查更新；不要重复安装或删除节点。",terminal:!0}})}}finally{this.installing=!1}};copyCommand=async()=>{if(!(!this.value.check?.manualCommand||this.value.checking||this.installing||this.job))try{await navigator.clipboard.writeText(this.value.check.manualCommand),this.patch({copied:!0})}catch{this.patch({error:"复制失败，请手动选中下方命令复制。"})}};dispose=()=>{this.disposed=!0,this.pollGeneration++,clearTimeout(this.timer),this.listeners.clear()}};var O=class{constructor(t){this.call=t}value={checking:!1,starting:!1,check:null,status:null,error:null};listeners=new Set;reading;timer;disposed=!1;checkRevision=0;checkInvalidated=!1;getSnapshot=()=>this.value;patch(t){if(!this.disposed){this.value={...this.value,...t};for(let e of this.listeners)e()}}subscribe=t=>this.disposed?()=>{}:(this.listeners.add(t),this.checkInvalidated?(this.refreshInvalidatedCheck(),this.active()&&this.poll()):!this.value.check&&!this.value.starting?this.refresh():this.active()&&this.poll(),()=>{this.listeners.delete(t),this.listeners.size||(clearTimeout(this.timer),this.timer=void 0)});active(){return this.value.status&&["preparing","installing","unknown","restart-required"].includes(this.value.status.phase)}invalidateCheck=()=>{this.disposed||(this.checkRevision++,this.checkInvalidated=!0,this.value.check&&this.patch({check:{...this.value.check,canInstall:!1,ticket:""}}),this.refreshInvalidatedCheck())};refreshInvalidatedCheck(){!this.disposed&&this.checkInvalidated&&this.listeners.size&&!this.value.starting&&!this.active()&&this.refresh()}refresh=()=>{if(this.disposed||this.value.starting)return Promise.resolve();if(this.reading)return this.reading;let t=this.checkRevision;return this.checkInvalidated=!1,this.patch({checking:!0,error:null}),this.reading=(async()=>{try{let e=await this.call("update-check");if(this.disposed||t!==this.checkRevision)return;if(!e?.advice||!e.status||typeof e.canInstall!="boolean")throw Error("invalid update response");this.patch({check:e,status:e.status}),this.active()&&this.poll()}catch{if(this.disposed||t!==this.checkRevision)return;let e=!1;try{let s=await this.call("status");e=!!(s&&!s.plugin)}catch{}if(this.disposed||t!==this.checkRevision)return;this.patch({check:null,error:e?"当前运行的连接服务尚不支持此更新入口。若刚安装新版，请在任务结束后退出并重新打开 Desktop；无需重新配对。仍不可用时请在原生插件管理器核对安装。":"本次更新检查未完成，不能据此判断已是最新版。请稍后重试；配对和聊天不受此次检查失败影响。"})}finally{this.patch({checking:!1})}})().finally(()=>{this.reading=void 0,this.refreshInvalidatedCheck()}),this.reading};install=async()=>{let t=this.value.check;if(!(this.disposed||this.checkInvalidated||this.value.starting||this.value.checking||!t?.canInstall||!t.ticket)){this.patch({starting:!0,error:null,check:{...t,canInstall:!1,ticket:""}});try{let e=await this.call("update-start",{ticket:t.ticket});this.patch({status:e})}catch(e){this.patch({status:e?.code==="update/not-started"?{phase:"failed",message:e instanceof Error?e.message:"尚未启动更新，请重新检查"}:{phase:"unknown",message:"更新提交结果暂未确认，正在核对；请勿重复安装。"}})}finally{this.patch({starting:!1}),this.poll(),this.refreshInvalidatedCheck()}}};poll(){this.disposed||this.timer||!this.listeners.size||!this.active()||(this.timer=setTimeout(async()=>{try{let t=await this.call("update-status");if(!t||!["idle","preparing","installing","restart-required","complete","failed","unknown"].includes(t.phase))throw Error("invalid status");this.patch({status:t,error:t.phase==="idle"?"尚未发现已接受的更新，请重新检查后再操作。":null})}catch{this.patch({error:"更新状态暂不可用；恢复连接后继续核对，不会重复安装。"})}finally{this.timer=void 0,this.poll(),this.refreshInvalidatedCheck()}},2e3))}dispose(){this.disposed=!0,this.checkRevision++,this.checkInvalidated=!1,clearTimeout(this.timer),this.listeners.clear()}};var F=()=>({loadState:"loading",qrState:"idle",status:null,host:null,runtime:null,localOrigin:null,qr:null,error:null,decisionError:null,deciding:!1}),re=a=>a?.companionUpdate?.state?["preparing","installing","verifying","recovering"].includes(a.companionUpdate.state):void 0,z=class{constructor(t,e){this.describeHost=t;this.callManagement=e}updates;nativeUpdates;value=F();listeners=new Set;timer;reading;pairing;disposed=!1;identity="";generation=0;getSnapshot=()=>this.value;subscribe=t=>this.disposed?()=>{}:(this.listeners.add(t),this.timer||(this.refresh(),this.timer=setInterval(()=>void this.refresh(),2e3)),()=>{this.listeners.delete(t),this.listeners.size||(clearInterval(this.timer),this.timer=void 0)});patch(t){if(!this.disposed){this.value={...this.value,...t};for(let e of this.listeners)e()}}async client(){let t=await se(this.describeHost,this.callManagement);if(this.disposed)throw new Error("disposed");let e=`${t.host.agentInstanceId??t.host.computerName}/${t.runtime.profileScope??"web"}`;return this.identity&&this.identity!==e&&(this.generation++,this.value=F(),this.updates?.dispose(),this.updates=void 0,this.nativeUpdates?.dispose(),this.nativeUpdates=void 0),this.identity=e,t.runtime.profileScope==="desktop"&&!this.nativeUpdates&&(this.nativeUpdates=new O(this.callManagement)),this.updates?.origin!==t.localOrigin&&(this.updates?.dispose(),this.updates=t.localOrigin?new V(t.localOrigin):void 0),this.patch({host:t.host,runtime:t.runtime,localOrigin:t.localOrigin}),t}refresh=()=>this.disposed?Promise.resolve():this.reading?this.reading:(this.reading=(async()=>{try{let t=await this.client(),e=this.generation,s={...await t.status()};if(s.companionUpdate?.state==="complete"&&!s.plugin&&(s.companionUpdate={state:"unverified",message:"当前连接服务尚未提供运行版本核验，不能确认两端已对齐。若刚安装插件，请在任务结束后退出并重新打开当前应用；无需重新配对。"}),e!==this.generation)return;let r=re(this.value.status),l=re(s);l!==void 0&&l!==r&&this.nativeUpdates?.invalidateCheck(),this.patch({status:s,runtime:s.gate??t.runtime,loadState:"ready",error:null,...this.value.qr&&this.value.qr.expiresAt<=Date.now()?{qrState:"expired",qr:null}:{}})}catch{this.patch({loadState:"error",error:"连接服务暂未就绪。请确认 DSH 正在运行，然后重试。"})}})().finally(()=>{this.reading=void 0}),this.reading);generateQr=()=>this.disposed?Promise.resolve():this.pairing?this.pairing:(this.patch({qrState:"loading",qr:null,error:null}),this.pairing=(async()=>{try{let t=await this.client(),e=this.generation,s=await t.pairCode();if(e!==this.generation)return;if(!s?.qrDataUrl?.startsWith("data:image/")||!Number.isFinite(s.expiresAt)||s.expiresAt<=Date.now())throw new Error("invalid QR");this.patch({qr:s,qrState:"ready"}),await this.refresh()}catch{this.patch({qr:null,qrState:"error",error:"暂时无法生成配对二维码，请稍后重试。"})}})().finally(()=>{this.pairing=void 0}),this.pairing);decide=async t=>{let e=this.value.status?.companionUpdate?.offerId;if(!(this.disposed||this.value.deciding||!e)){this.patch({deciding:!0,decisionError:null});try{let s=await this.client();if(this.value.status?.companionUpdate?.offerId!==e)throw new Error("stale offer");await s.decide(e,t),await this.reading,await this.refresh()}catch{this.patch({decisionError:"更新选择未确认，请刷新后核对；不要重复安装。"})}finally{this.patch({deciding:!1})}}};dispose=()=>{this.disposed=!0,this.generation++,clearInterval(this.timer),this.timer=void 0,this.listeners.clear(),this.value=F(),this.updates?.dispose(),this.updates=void 0,this.nativeUpdates?.dispose(),this.nativeUpdates=void 0}},ne=new WeakMap;function W(a,t){let e=ne.get(a);return e||(e=new z(a,t),ne.set(a,e)),e}var E=B(I(),1),H=require("react/jsx-runtime");function $({describeHost:a,callManagement:t,onDismiss:e,onOpenDetails:s,compact:r=!1,store:l=W(a,t)}){let{status:o,deciding:d,decisionError:g,error:f,loadState:p}=(0,ie.useSyncExternalStore)(l.subscribe,l.getSnapshot,l.getSnapshot),h=o?.companionUpdate,b=g||f,x=(0,H.jsxs)("div",{children:[(0,H.jsx)(ae,{value:h,compact:r,deciding:d||p!=="ready",onDecide:k=>void l.decide(k)}),!h&&!b?(0,H.jsx)("p",{className:E.default.helpText,children:p==="loading"?"正在检查同一主机的另一端…":"另一端状态未确认；不会自动更新。"}):!r&&h?.state==="idle"?(0,H.jsx)("p",{className:E.default.helpText,children:"未发现需要联动更新的另一端。当前节点可独立使用，不会自动安装另一端或启用已停用的插件。"}):null,b?(0,H.jsx)("p",{role:"alert",children:b}):null,e?(0,H.jsxs)("div",{className:E.default.actions,children:[s?(0,H.jsx)("button",{type:"button",className:E.default.primaryButton,onClick:s,children:"前往微信连接"}):null,(0,H.jsx)("button",{type:"button",className:E.default.secondaryButton,onClick:e,children:"关闭提示（不会确认更新）"})]}):null]});return e?(0,H.jsx)(oe.Modal,{open:!0,title:"微信连接 · 联动更新",closeLabel:"关闭提示",className:E.default.pageDialog,contentClassName:E.default.pageDialogContent,onClose:e,children:x}):x}var q=require("react"),le=B(I(),1),D=require("react/jsx-runtime");function de({wide:a,openPlugin:t}){let[e,s]=(0,q.useState)(!1),[r,l]=(0,q.useState)(!1),o=(0,q.useRef)(!1),d=async()=>{if(!o.current){o.current=!0,l(!0);try{await t()||s(!0)}finally{o.current=!1,l(!1)}}};return(0,D.jsxs)(D.Fragment,{children:[(0,D.jsxs)("button",{type:"button",className:le.default.sidebarButton,"data-wide":a,title:"微信连接","aria-label":"微信连接",disabled:r,onClick:()=>void d(),children:[(0,D.jsxs)("svg",{width:"20",height:"20",viewBox:"0 0 24 24",fill:"none",stroke:"currentColor",strokeWidth:"1.7","aria-hidden":"true",children:[(0,D.jsx)("path",{d:"M20 11.5a8 8 0 0 1-8 8 9 9 0 0 1-3.5-.7L4 20l1.2-4.2A7.8 7.8 0 0 1 4 11.5a8 8 0 0 1 16 0Z"}),(0,D.jsx)("path",{d:"M8 11.5h.01M12 11.5h.01M16 11.5h.01",strokeWidth:"2.5",strokeLinecap:"round"})]}),a?(0,D.jsx)("span",{children:r?"正在打开…":"微信连接"}):null]}),e?(0,D.jsx)("small",{role:"status",children:"插件详情暂不可用，请打开「设置 → 微信连接」。"}):null]})}async function pe(a){try{let t=a("pluginNavigation"),e=a("remote.pluginManager");if(typeof t?.openBundle!="function"||typeof e?.listBundles!="function")return!1;let s=await e.listBundles();if(!s.ok||!Array.isArray(s.value))return!1;let r=s.value.filter(o=>o.enabled&&["dsh-wechat-remote","@harness-remote/dsh-wechat-remote"].includes(o.name));if(r.length!==1)return!1;let l=a("pluginNavigation");return l!==t||typeof l.openBundle!="function"?!1:(l.openBundle(r[0].name),!0)}catch{return!1}}var L=require("react"),ve=require("@deepseek-ai/dsh-client-ui-primitives"),_=B(I(),1);var ce=require("react"),w=B(I(),1),u=require("react/jsx-runtime");function he({store:a,embedded:t=!1}){let{check:e,checking:s,progress:r,error:l,copied:o,resumeFailed:d}=(0,ce.useSyncExternalStore)(a.subscribe,a.getSnapshot,a.getSnapshot),g=!!(r&&!r.terminal),f=g||r?.phase==="unknown"||e?.mode==="busy";return(0,u.jsxs)("div",{className:t?w.default.updateEndpoint:w.default.updateCard,children:[(0,u.jsxs)("div",{className:w.default.updateRow,children:[(0,u.jsxs)("div",{className:w.default.updateCopy,children:[(0,u.jsxs)("strong",{children:["Web ",(0,u.jsx)("span",{className:w.default.updateScope,children:"当前端"})]}),e?(0,u.jsxs)("div",{className:w.default.updateVersions,children:[(0,u.jsxs)("span",{children:["DSH ",(0,u.jsx)("strong",{children:e.advice.current.agentVersion||"未确认"})]}),(0,u.jsxs)("span",{children:["插件运行 ",(0,u.jsx)("strong",{children:e.advice.current.pluginVersion||"未确认"})]}),e.channel==="preview"?(0,u.jsx)("span",{children:"预览通道"}):null]}):null]}),(0,u.jsxs)("div",{className:w.default.updateControl,children:[(0,u.jsx)("button",{type:"button",className:w.default.secondaryButton,disabled:s||g,onClick:()=>void a.refresh(),children:s?"检查中…":"检查更新"}),e&&!s?(0,u.jsx)("strong",{className:w.default.updateLabel,"data-severity":f?"unknown":e.advice.severity,role:"status",children:g?"正在更新 Web 插件":f?"更新状态待核对":e.advice.label}):null,e?.advice.checkedAt&&e.advice.severity!=="unknown"?(0,u.jsxs)("small",{className:w.default.updateChecked,children:["检查于 ",new Date(e.advice.checkedAt).toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"})]}):null]})]}),e?(0,u.jsx)(u.Fragment,{children:s?null:(0,u.jsxs)(u.Fragment,{children:[!f&&e.advice.targetVersion?(0,u.jsxs)("p",{children:["可更新至 ",e.advice.targetVersion,e.mode==="manual"?" · 需手动更新":""]}):null,!f&&(e.advice.severity==="unknown"||e.advice.severity==="required"||e.mode==="manual")?(0,u.jsxs)("details",{children:[(0,u.jsx)("summary",{children:e.mode==="manual"?"手动更新说明":"查看说明"}),e.reason?(0,u.jsx)("p",{children:e.reason}):null,(0,u.jsx)("p",{children:e.advice.message})]}):null,!f&&e.mode==="manual"&&e.manualCommand?(0,u.jsxs)("div",{className:w.default.updateCommand,children:[(0,u.jsx)("code",{children:e.manualCommand}),(0,u.jsx)("button",{type:"button",className:w.default.secondaryButton,disabled:g,onClick:()=>void a.copyCommand(),children:o?"已复制":"复制命令"})]}):null,!f&&e.canInstall?(0,u.jsxs)(u.Fragment,{children:[(0,u.jsx)("div",{className:w.default.updateActions,children:(0,u.jsx)("button",{type:"button",className:w.default.primaryButton,disabled:g||!!l,onClick:()=>void a.install(),children:"更新 Web 并重启"})}),(0,u.jsx)("small",{className:w.default.updateChecked,children:"仅更新 Web，保留配对与会话；连接会短暂中断。"})]}):null]})}):null,l?(0,u.jsx)("p",{role:"alert",children:l}):null,r?(0,u.jsxs)("div",{role:"status","aria-live":"polite",children:[!r.terminal||r.ok===!0?(0,u.jsx)("progress",{className:w.default.updateProgress,max:100,value:r.progress}):null,(0,u.jsx)("p",{children:r.message}),d?(0,u.jsx)("p",{role:"alert",children:"插件已完成更新，但未能自动打开 WebUI。请使用 DSH 启动时显示的地址打开，无需重复更新。"}):null]}):null]})}var ue=require("react"),C=B(I(),1),m=require("react/jsx-runtime");function ge({store:a,embedded:t=!1}){let{check:e,status:s,checking:r,starting:l,error:o}=(0,ue.useSyncExternalStore)(a.subscribe,a.getSnapshot,a.getSnapshot),d=l||s?.phase==="preparing"||s?.phase==="installing",g=s&&["preparing","installing","restart-required","unknown"].includes(s.phase),f=s?.phase==="restart-required"||s?.phase==="complete",p=s?.phase==="restart-required"?"已安装，待重新打开 Desktop":s?.phase==="unknown"?"更新结果待核对":s?.phase==="failed"?"更新未完成":d?"正在更新 Desktop 插件":s?.phase==="complete"?"更新已生效":"";return(0,m.jsxs)("div",{className:t?C.default.updateEndpoint:C.default.updateCard,children:[(0,m.jsxs)("div",{className:C.default.updateRow,children:[(0,m.jsxs)("div",{className:C.default.updateCopy,children:[(0,m.jsxs)("strong",{children:["Desktop ",(0,m.jsx)("span",{className:C.default.updateScope,children:"当前端"})]}),e?(0,m.jsxs)("div",{className:C.default.updateVersions,children:[(0,m.jsxs)("span",{children:["DSH ",(0,m.jsx)("strong",{children:e.advice.current.agentVersion||"未确认"})]}),(0,m.jsxs)("span",{children:["插件运行 ",(0,m.jsx)("strong",{children:e.advice.current.pluginVersion||"未确认"})]}),f&&s.targetVersion&&s.targetVersion!==e.advice.current.pluginVersion?(0,m.jsxs)("span",{children:["已安装 ",(0,m.jsx)("strong",{children:s.targetVersion})]}):null,e.channel==="preview"?(0,m.jsx)("span",{children:"预览通道"}):null]}):null]}),(0,m.jsxs)("div",{className:C.default.updateControl,children:[(0,m.jsx)("button",{type:"button",className:C.default.secondaryButton,disabled:r||d,onClick:()=>void a.refresh(),children:r?"检查中…":"检查更新"}),e?(0,m.jsx)("strong",{className:C.default.updateLabel,"data-severity":s?.phase==="failed"?"required":s?.phase==="complete"?"none":g?s?.phase==="unknown"?"unknown":"info":e.advice.severity,children:p||e.advice.label}):null,e?.advice.checkedAt?(0,m.jsxs)("small",{className:C.default.updateChecked,children:["检查于 ",new Date(e.advice.checkedAt).toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"})]}):null]})]}),e?(0,m.jsxs)(m.Fragment,{children:[!f&&!g&&e.advice.targetVersion?(0,m.jsxs)("p",{children:["可更新至 ",e.advice.targetVersion]}):null,!g&&e.reason?(0,m.jsx)("p",{children:e.reason}):null,!g&&e.canInstall?(0,m.jsxs)(m.Fragment,{children:[(0,m.jsx)("div",{className:C.default.updateActions,children:(0,m.jsx)("button",{type:"button",className:C.default.primaryButton,disabled:d||r,onClick:()=>void a.install(),children:"更新 Desktop 插件"})}),(0,m.jsx)("small",{className:C.default.updateChecked,children:"仅更新 Desktop，保留配对与会话；完成后需退出并重新打开。"})]}):null]}):null,s?.phase!=="idle"&&s?(0,m.jsxs)("div",{role:"status","aria-live":"polite",children:[d?(0,m.jsx)("progress",{className:C.default.updateProgress,"aria-label":"Desktop 插件更新中"}):null,s.phase==="restart-required"?(0,m.jsx)("p",{className:C.default.updatePeerNote,children:"任务结束后，选择「应用 → 退出」再打开 Desktop；无需重新配对，Web 不受影响。"}):s.phase!=="complete"?(0,m.jsx)("p",{children:s.message}):null]}):null,o?(0,m.jsx)("p",{role:"alert",children:o}):null]})}var U=require("react"),y=B(I(),1),i=require("react/jsx-runtime"),T=a=>a.state==="installed"&&(a.nativeState===void 0||a.nativeState==="installed"),Ie=a=>T(a)?"已安装":a.state==="draft"?"待安装":a.nativeState==="uninstalled"?"未安装":a.nativeState==="disabled"?"已停用":a.state==="pending-restart"?"待重启":"待核对",X=a=>a.templateId==="designer"||a.id==="designer"?"定制我的助手":a.name;function me({label:a,children:t}){return(0,i.jsxs)("span",{className:y.default.assistantHelpAnchor,children:[(0,i.jsx)("button",{type:"button",className:y.default.assistantHelpButton,"aria-label":a,title:t,children:"?"}),(0,i.jsx)("span",{className:y.default.assistantTooltip,role:"tooltip",children:t})]})}function fe({store:a}){let{catalog:t,preview:e,busy:s,message:r,error:l}=(0,U.useSyncExternalStore)(a.subscribe,a.getSnapshot,a.getSnapshot),o=(0,U.useRef)();(0,U.useEffect)(()=>{let n=new AbortController;return o.current=n,a.load(),()=>n.abort()},[a]);let d=t?.drafts||[],g=d.filter(n=>T(n)&&!n.replacement),f=d.filter(n=>n.state==="draft"),p=d.filter(n=>n.source!=="builtin"&&n.state!=="draft"&&(!T(n)||n.replacement)),h=t?.templates||[],b=n=>g.find(S=>S.templateId===n),x=n=>void a.start(n.presetId,o.current?.signal),k=n=>n.id==="designer"||n.templateId==="designer"?"先打开定制会话，说清职业和工作习惯；助手会设计可复用的模式。确认安装后，再用新模式开启工作会话。不会自动安装或发送消息。":`先选工作区，再用「${n.name}」开始空白会话。手机连接此电脑后可继续该会话；发卡与提醒需在小程序设置中开启「微信群协作助手」。`,N=n=>{let S=b(n.id),R=n.builtin,M=d.find(j=>j.templateId===n.id&&j.source==="builtin");return(0,i.jsxs)("article",{className:y.default.assistantChoice,"data-installed":!!S,children:[(0,i.jsxs)("div",{className:y.default.assistantChoiceCopy,children:[(0,i.jsxs)("div",{className:y.default.assistantChoiceHead,children:[(0,i.jsx)("strong",{children:X(n)}),(0,i.jsx)(me,{label:`${X(n)}使用说明`,children:k(n)})]}),(0,i.jsx)("p",{children:n.id==="designer"?"用对话设计适合自己职业的助手模式":n.description})]}),!S&&R?(0,i.jsx)("span",{className:y.default.assistantUnavailable,title:M?.reason||R.reason,children:M?.nativeState==="disabled"?"已停用":"待就绪"}):null,(0,i.jsx)("button",{type:"button",className:y.default.secondaryButton,disabled:s||!!(R&&!S),onClick:()=>S?x(S):R?void a.load():void a.choose(n.id),children:S?n.id==="designer"?"开始定制":"开始使用":R?"开始使用":"安装"})]},n.id)},A=n=>(0,i.jsxs)("div",{className:y.default.assistantEntry,children:[(0,i.jsxs)("div",{className:y.default.assistantEntryHead,children:[(0,i.jsx)("strong",{children:X(n)}),(0,i.jsx)("span",{children:Ie(n)})]}),n.replacement?(0,i.jsxs)("div",{children:[(0,i.jsxs)("p",{children:["已提供内置「",n.replacement.name,"」，无需再装同款独立包。"]}),(0,i.jsx)("p",{children:n.replacement.warning}),n.replacement.canRemoveAfterReview?(0,i.jsxs)("p",{children:["核对旧会话后，可在 DSH 插件列表卸载：",(0,i.jsx)("code",{children:n.replacement.bundleName})]}):null]}):null,T(n)?(0,i.jsx)("button",{type:"button",className:y.default.assistantSecondary,disabled:s,onClick:()=>x(n),children:"开始使用"}):n.state==="draft"?(0,i.jsx)("button",{type:"button",className:y.default.assistantPrimary,disabled:s,onClick:()=>void a.preview(n.id,n.version),children:"查看并安装"}):(0,i.jsxs)(i.Fragment,{children:[(0,i.jsx)("button",{type:"button",className:y.default.assistantSecondary,disabled:s,onClick:()=>void a.verify(n.id,n.version),children:"刷新状态"}),n.nativeState==="uninstalled"&&!n.replacement?(0,i.jsx)("button",{type:"button",className:y.default.assistantSecondary,disabled:s,onClick:()=>void a.reinstall(n.id,n.version),children:"查看并重新安装"}):null]}),!T(n)&&n.reason?(0,i.jsxs)("details",{className:y.default.assistantDetails,children:[(0,i.jsx)("summary",{children:"状态说明"}),(0,i.jsx)("p",{children:n.reason})]}):null]},`${n.id}:${n.version}`);return(0,i.jsxs)("section",{className:y.default.assistantsCard,"aria-label":"微信群协作助手","aria-busy":s,children:[(0,i.jsxs)("div",{className:y.default.assistantsHeading,children:[(0,i.jsxs)("div",{className:y.default.assistantChoiceHead,children:[(0,i.jsx)("h3",{children:"微信群协作助手"}),(0,i.jsx)(me,{label:"电脑助手与手机群协作",children:"电脑助手可独立使用，组件开关由 DSH 管理。手机发任务和提醒，需在小程序「设置 → 实验性功能」开启「微信群协作助手」。各手机独立设置，不会关闭电脑助手或已发布任务。"})]}),(0,i.jsx)("button",{type:"button",className:y.default.assistantTextButton,disabled:s,onClick:()=>void a.load(),children:s?"读取中…":"刷新"})]}),!t&&!l?(0,i.jsx)("p",{role:"status",children:"正在读取当前电脑的助手…"}):null,t&&!t.native?.supported?(0,i.jsx)("p",{role:"status",children:t.native?.reason||"当前 DSH 暂不支持安装助手，请先检查版本。"}):null,t&&(t.native?.supported||h.some(n=>n.builtin))?(0,i.jsxs)(i.Fragment,{children:[(0,i.jsx)("div",{className:y.default.assistantChoices,children:h.filter(n=>["teacher","project"].includes(n.id)).map(N)}),h.some(n=>n.id==="designer")?(0,i.jsx)("div",{className:y.default.assistantCustomize,children:h.filter(n=>n.id==="designer").map(N)}):null]}):null,e?(0,i.jsxs)("div",{className:y.default.assistantPreview,"aria-label":"安装助手预览",children:[(0,i.jsxs)("h4",{children:["安装「",e.definition.name,"」"]}),(0,i.jsx)("p",{children:e.definition.description}),(0,i.jsx)("p",{children:"新增一个可选的助手模式，不改默认模式、已有会话和资料。"}),(0,i.jsxs)("details",{className:y.default.assistantDetails,children:[(0,i.jsx)("summary",{children:"查看工作方式与安装详情"}),(0,i.jsx)("p",{children:e.definition.role}),(0,i.jsx)("ul",{children:e.definition.methods.map((n,S)=>(0,i.jsx)("li",{children:n},S))}),(0,i.jsx)("p",{children:"助手会逐步了解："}),(0,i.jsx)("ul",{children:e.definition.onboarding.map(n=>(0,i.jsxs)("li",{children:[n.label,"：",n.prompt]},n.key))}),(0,i.jsxs)("small",{children:["第 ",e.version," 版 · 内容摘要 ",e.digest.slice(0,12)," · 基础模式 ",e.native.basePreset]}),(0,i.jsx)("ul",{children:(e.native.warnings||[]).map((n,S)=>(0,i.jsx)("li",{children:n},S))})]}),(0,i.jsxs)("div",{className:y.default.assistantButtons,children:[(0,i.jsx)("button",{type:"button",className:y.default.assistantPrimary,disabled:s,onClick:()=>void a.install(),children:"确认安装"}),(0,i.jsx)("button",{type:"button",className:y.default.assistantSecondary,disabled:s,onClick:()=>a.dismissPreview(),children:"暂不安装"})]})]}):null,f.length?(0,i.jsxs)("div",{children:[(0,i.jsx)("h4",{children:"待安装的助手"}),f.map(A)]}):null,g.some(n=>!["teacher","project","designer"].includes(n.templateId))?(0,i.jsxs)("div",{children:[(0,i.jsx)("h4",{children:"我已安装的其他助手"}),g.filter(n=>!["teacher","project","designer"].includes(n.templateId)).map(A)]}):null,p.length||h.some(n=>!["teacher","project","designer"].includes(n.id))?(0,i.jsxs)("details",{className:y.default.assistantDetails,children:[(0,i.jsx)("summary",{children:"更多助手与安装记录"}),t?.native?.supported?(0,i.jsx)("div",{className:y.default.assistantChoices,children:h.filter(n=>!["teacher","project","designer"].includes(n.id)).map(N)}):null,p.length?(0,i.jsxs)("details",{className:y.default.assistantDetails,children:[(0,i.jsxs)("summary",{children:["以前安装的助手（",p.length,"）"]}),(0,i.jsx)("p",{children:"旧会话可能仍在使用旧模式；卸载前请核对，聊天与资料不会在这里删除。"}),p.map(A)]}):null]}):null,r?(0,i.jsx)("p",{role:"status",children:r}):null,l?(0,i.jsx)("p",{role:"alert",children:l}):null]})}var c=require("react/jsx-runtime");function ye({ok:a,busy:t=!1}){return(0,c.jsx)("span",{className:_.default.statusDot,"data-state":t?"busy":a?"ready":"off","aria-hidden":!0})}function Q({title:a,detail:t,ok:e,busy:s=!1}){return(0,c.jsxs)("div",{className:_.default.capability,children:[(0,c.jsx)(ye,{ok:e,busy:s}),(0,c.jsxs)("div",{className:_.default.capabilityCopy,children:[(0,c.jsx)("strong",{children:a}),(0,c.jsx)("span",{children:t})]})]})}function Z({describeHost:a,callManagement:t,store:e=W(a,t),assistants:s}){let{loadState:r,qrState:l,status:o,runtime:d,host:g,localOrigin:f,qr:p,error:h}=(0,L.useSyncExternalStore)(e.subscribe,e.getSnapshot,e.getSnapshot),{refresh:b,generateQr:x}=e,k=(0,L.useId)(),N=o?.publicRelay,A=N?.state==="enrolling"||N?.state==="connecting",n=N?.remoteAccess?.status,S=N?.state==="online"&&n==="active",R=n==="suspended"?"账户公网访问已暂停":n==="expired"?"公网访问已到期":n==="not_entitled"?"请在小程序中使用自助开通方式":n!=="active"?"配对后由小程序账户决定":S?"可在外网安全连接":A?"正在准备远程连接":"暂时离线",M=d?.publicDoor??o?.gate?.publicDoor,j=r==="ready"&&!!o?.lan.ip&&M?.state==="listening",K=N?.enabled===!0&&N.state!=="disabled",_e=o?.agent?.agentName||g?.agentName||"DeepSeek Harness",we=o?.agent?.hostName||g?.computerName||"当前电脑";return(0,c.jsxs)("section",{className:_.default.root,"aria-labelledby":k,children:[(0,c.jsxs)("div",{className:_.default.hero,children:[(0,c.jsxs)("div",{className:_.default.identity,children:[(0,c.jsx)("span",{className:_.default.mark,"aria-hidden":!0,children:(0,c.jsx)(ve.FishLogo,{size:28})}),(0,c.jsxs)("div",{className:_.default.identityCopy,children:[(0,c.jsx)("h3",{id:k,children:"微信连接"}),(0,c.jsxs)("p",{children:[_e,(0,c.jsx)("span",{"aria-hidden":!0,children:" · "}),we]})]})]}),(0,c.jsxs)("span",{className:_.default.overall,"data-ready":r==="ready",children:[(0,c.jsx)(ye,{ok:r==="ready",busy:r==="loading"}),r==="loading"?"检测中":r==="ready"?"服务正常":"暂不可用"]})]}),(0,c.jsxs)("div",{className:_.default.capabilities,children:[(0,c.jsx)(Q,{title:"局域网直连",detail:r==="loading"?"检测中":j?"已就绪":"暂不可用",ok:j,busy:r==="loading"}),(0,c.jsx)(Q,{title:"远程访问",detail:R,ok:S,busy:A||r==="loading"}),(0,c.jsx)(Q,{title:"账号连接保护",detail:K?"已启用":"配对后启用",ok:K,busy:r==="loading"})]}),h!==null?(0,c.jsxs)("div",{className:_.default.notice,role:"status",children:[(0,c.jsx)("span",{children:h}),(0,c.jsx)("button",{type:"button",onClick:()=>void b(),children:"重试"})]}):null,l==="idle"?(0,c.jsxs)("div",{className:_.default.connectCard,children:[(0,c.jsxs)("div",{children:[(0,c.jsx)("strong",{children:"添加到微信"}),(0,c.jsx)("p",{children:"打开「Agent远程管理助手」→ 添加节点，扫描配对二维码。"})]}),(0,c.jsx)("button",{type:"button",className:_.default.primaryButton,disabled:r!=="ready",onClick:()=>void x(),children:"生成二维码"})]}):(0,c.jsxs)("div",{className:_.default.pairingCard,children:[(0,c.jsxs)("div",{className:_.default.pairingHead,children:[(0,c.jsxs)("div",{children:[(0,c.jsx)("strong",{children:"扫描二维码"}),(0,c.jsx)("p",{children:"小程序「设置 → 添加节点」"})]}),(0,c.jsx)("button",{type:"button",className:_.default.secondaryButton,disabled:l==="loading"||r!=="ready",onClick:()=>void x(),children:l==="loading"?"生成中…":"重新生成"})]}),(0,c.jsxs)("div",{className:_.default.qrArea,children:[r==="ready"&&l==="ready"&&p!==null?(0,c.jsx)("img",{className:_.default.qr,src:p.qrDataUrl,alt:"Agent远程管理助手配对二维码"}):(0,c.jsx)("div",{className:_.default.qrPlaceholder,"aria-live":"polite",children:r!=="ready"?"连接恢复后可查看二维码":l==="expired"?"二维码已过期，请重新生成":l==="error"?"生成失败":"正在生成…"}),l==="ready"&&p!==null?(0,c.jsxs)("small",{className:_.default.qrValidity,children:["有效至 ",new Date(p.expiresAt).toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"})," · 切换页面不重新生成"]}):null]}),(0,c.jsx)("p",{className:_.default.securityNote,children:p?.mode==="public-relay"?"配对后自动选择更快的连接；远程内容端到端加密。":"当前可通过同一局域网连接。"})]}),(0,c.jsxs)("section",{className:_.default.updateCard,"aria-label":"插件更新",children:[(0,c.jsx)("h3",{className:_.default.updateHeading,children:"插件更新"}),f&&e.updates?(0,c.jsx)(he,{store:e.updates,embedded:!0}):null,d?.profileScope==="desktop"&&e.nativeUpdates?(0,c.jsx)(ge,{store:e.nativeUpdates,embedded:!0}):null,(0,c.jsx)($,{describeHost:a,callManagement:t,store:e,compact:!0})]}),s?(0,c.jsx)(fe,{store:s}):null]})}var G=class{constructor(t,e){this.call=t;this.openSession=e}state={catalog:null,preview:null,busy:!1,message:"",error:""};listeners=new Set;epoch=0;disposed=!1;getSnapshot=()=>this.state;subscribe=t=>(this.listeners.add(t),()=>{this.listeners.delete(t)});set(t){if(!this.disposed){this.state={...this.state,...t};for(let e of this.listeners)e()}}reset=()=>{this.epoch++,this.set({catalog:null,preview:null,busy:!1,message:"",error:""})};dispose=()=>{this.reset(),this.disposed=!0,this.listeners.clear()};async run(t){if(this.disposed||this.state.busy)return;let e=this.epoch,s=()=>!this.disposed&&e===this.epoch;this.set({busy:!0,error:""});try{await t(s)}catch(r){s()&&this.set({error:r instanceof Error?r.message:"操作未完成，请核对状态"})}finally{s()&&this.set({busy:!1})}}async read(t){t()&&this.set({catalog:null});try{let e=await this.call("assistantCatalog",{});if(!t())return;if(e?.schema!=="human.assistants.catalog.v1"||!Array.isArray(e.templates)||!Array.isArray(e.drafts))throw new Error("助手目录格式不受支持");this.set({catalog:e})}catch(e){throw t()&&this.set({message:""}),e}}load=()=>this.run(t=>this.read(t));readyAssistant(t){let e=this.state.catalog?.drafts?.find(s=>s.presetId===t);if(!e||e.state!=="installed"||e.nativeState&&e.nativeState!=="installed")throw new Error("此助手已停用或尚未就绪，请核对下方组件开关。");return e}start=(t,e)=>this.run(async s=>{if(this.set({message:""}),await this.read(s),!(!s()||e?.aborted)){if(this.readyAssistant(t),!this.openSession)throw new Error("当前 DSH 未提供快捷入口，请在新会话中选择此助手模式。");await this.openSession(t,e)}});dismissPreview=()=>{this.state.busy||this.set({preview:null,message:""})};choose=t=>this.run(async e=>{if(this.set({preview:null,message:""}),this.state.catalog?.templates?.find(d=>d.id===t)?.builtin){await this.read(e),e()&&this.set({message:"此助手已包含在插件里，请在新会话中选择；无需另装独立包。"});return}let r=this.state.catalog?.drafts?.find(d=>d.templateId===t&&d.state==="draft");if(r){let d=await this.call("assistantPreview",{id:r.id,version:r.version});e()&&this.set({preview:d});return}let l=await this.call("assistantDraft",{templateId:t});if(!e()||(await this.read(e),!e()))return;let o=await this.call("assistantPreview",{id:l.id,version:l.version});e()&&this.set({preview:o})});preview=(t,e)=>this.run(async s=>{this.set({preview:null});let r=await this.call("assistantPreview",{id:t,version:e});s()&&this.set({preview:r})});reinstall=(t,e)=>this.run(async s=>{if(this.set({preview:null,message:""}),this.state.catalog?.drafts?.some(o=>o.id===t&&o.version===e&&o.replacement)){await this.read(s),s()&&this.set({message:"这个旧模式已有内置版本，请在新会话中选择对应助手，无需重新安装旧包。"});return}let r=await this.call("assistantDraft",{sourceId:t,sourceVersion:e});if(!s()||(await this.read(s),!s()))return;let l=await this.call("assistantPreview",{id:r.id,version:r.version});s()&&this.set({preview:l})});install=()=>this.run(async t=>{let e=this.state.preview;if(!e||e.expiresAt<=Date.now())throw new Error("请重新预览后确认安装");this.set({preview:null,message:"已提交原生安装，请等待结果。"});try{let s=await this.call("assistantInstall",{id:e.id,version:e.version,digest:e.digest,previewId:e.previewId});t()&&this.set({message:s.message||(s.state==="installed"?"原生预设已生效":"请核对原生安装状态")})}finally{t()&&await this.read(t)}});verify=(t,e)=>this.run(async s=>{this.set({catalog:null,message:""});let r=await this.call("assistantStatus",{id:t,version:e});s()&&(this.set({message:r.message||"状态已核对"}),await this.read(s))})};function be(a){let t=0,e=!1;return{reset(){t++,e=!1},async start(s,r){if(!/^[a-z][a-z0-9_-]{0,63}$/.test(s))throw new Error("助手身份无效");if(e||r?.aborted)return;let l=t,o=a("uiWorkspace"),d=a("slots"),g=a("configForms")?.developerTools?.enabled?.getSnapshot(),f=d?.entries?.("conversation.hero.agentPreset"),p=Array.isArray(f)&&f.length===1?f[0]:void 0;if(g!==!0||typeof o?.clearMain!="function"||p?.options?.locale!=="settings.agentPreset"||typeof p?.inject!="function")throw new Error("当前 DSH 尚未提供快捷入口，请在原生新会话中选择此助手模式。");let h=p.inject(void 0);if(typeof h?.load!="function"||typeof h?.select!="function"||typeof h?.hooks?.agentPresetSeat?.getSnapshot!="function")throw new Error("当前 DSH 的模式选择入口不兼容，请使用原生新会话入口。");let b=()=>l===t&&!r?.aborted;e=!0;try{if(await h.load(),!b())return;let x=d.entries("conversation.hero.agentPreset");if(!Array.isArray(x)||x.length!==1||x[0]!==p)throw new Error("DSH 的模式入口已更新，请重新点击开始使用。");let k=h.hooks.agentPresetSeat.getSnapshot();if(k.busy||k.error||!k.options?.some(A=>A.id===s))throw new Error("此助手尚未就绪，请刷新状态后重试。");if(a("configForms")?.developerTools?.enabled?.getSnapshot()!==!0)throw new Error("DSH 的工作模式选择已关闭，请在原生设置中开启后重试。");o.clearMain();let N=await h.select(s);if(b()&&N)throw new Error(N)}finally{l===t&&(e=!1)}}}}var Ee=["slots","connection"];function Re(a){let t=async(p,h)=>{let b=await a.connection.rpc.call("/wechat-remote-management",p,h??{});if(!b.ok)throw Object.assign(new Error(b.error.message),{code:b.error.code});return b.value},e=async()=>{let p=await a.connection.rpc.call("/api","wechatHost/describe",{args:{request:{}}});if(!p.ok)throw new Error(`wechatHost/describe: ${p.error.code}`);let h=p.value;if(h?.ok!==!0||h.value===void 0)throw new Error("wechatHost/describe returned an invalid result");return h.value},s=new z(e,t),r=0,l=async(p,h)=>{let b=r,x=await a.connection.rpc.call("/api",`humanTools/${p}`,{args:{request:h}});if(b!==r)throw new Error("电脑连接已变化，请重新查看助手目录");if(!x.ok)throw new Error(x.error.message);let k=x.value;if(!k?.ok||typeof k.valueJson!="string"||k.valueJson.length>256*1024)throw new Error(k?.error?.message||"此节点尚未提供助手能力");return JSON.parse(k.valueJson)},o,d=new G(l,async(p,h)=>{if(!o)throw new Error("原生会话入口尚未就绪，请稍后再试。");await o.start(p,h)});a.inject(["uiWorkspace","slots","configForms"],p=>{let h=be(b=>p.get(b));o=h,p.effect(()=>()=>{h.reset(),o===h&&(o=void 0)},"wechat assistant navigation")}),a.effect(()=>{let p=a.on("connection/reset",()=>{r++,o?.reset(),d.reset()});return()=>{r++,p(),d.dispose()}},"wechat assistant lifecycle"),a.effect(()=>()=>s.dispose(),"wechat shared page");let g=()=>pe(p=>a.get(p)),f=()=>({describeHost:e,callManagement:t,store:s,assistants:d});a.slots.inject("settings.section",()=>a.slots.register({name:"settings.section",id:"harness-remote",order:30,label:"微信连接",inject:f},Z));for(let p of["plugins.bundle.activation","plugins.bundle.config"])a.slots.inject(p,()=>{let h=["dsh-wechat-remote","@harness-remote/dsh-wechat-remote"].map(b=>a.slots.register({name:p,key:b,inject:f},p==="plugins.bundle.activation"?$:Z));return()=>h.forEach(b=>b())});a.inject(["pluginNavigation","remote.pluginManager"],()=>a.slots.inject("sidebar.footer.action",()=>a.slots.register({name:"sidebar.footer.action",id:"harness-remote",order:30,label:"微信连接",inject:()=>({openPlugin:g})},de)))}

return module.exports;}});
