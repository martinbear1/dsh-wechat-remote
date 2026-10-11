window.__ModuleLoader__.load({id:"@harness-remote/dsh-wechat-remote",factory:(require)=>{var module={exports:{}};var exports=module.exports;"use strict";var Ct=Object.create;var me=Object.defineProperty;var kt=Object.getOwnPropertyDescriptor;var St=Object.getOwnPropertyNames;var Nt=Object.getPrototypeOf,Et=Object.prototype.hasOwnProperty;var Pt=(t,a)=>()=>(a||t((a={exports:{}}).exports,a),a.exports),Rt=(t,a)=>{for(var e in a)me(t,e,{get:a[e],enumerable:!0})},ze=(t,a,e,n)=>{if(a&&typeof a=="object"||typeof a=="function")for(let r of St(a))!Et.call(t,r)&&r!==e&&me(t,r,{get:()=>a[r],enumerable:!(n=kt(a,r))||n.enumerable});return t};var ne=(t,a,e)=>(e=t!=null?Ct(Nt(t)):{},ze(a||!t||!t.__esModule?me(e,"default",{value:t,enumerable:!0}):e,t)),Dt=t=>ze(me({},"__esModule",{value:!0}),t);var Z=Pt(($t,Oe)=>{"use strict";var At=`.hr_ff5b022_root {\r
  box-sizing: border-box;\r
  width: 100%;\r
  max-width: 760px;\r
  color: var(--dsw-alias-label-primary, #171a20);\r
  display: flex;\r
  flex-direction: column;\r
  gap: 14px;\r
}\r
\r
.hr_ff5b022_hero,\r
.hr_ff5b022_connectCard,\r
.hr_ff5b022_pairingCard {\r
  border: 1px solid var(--dsw-alias-border-l2, rgba(128, 140, 160, 0.22));\r
  background: var(--dsw-alias-bg-layer-3, #fff);\r
  border-radius: 12px;\r
}\r
\r
.hr_ff5b022_hero {\r
  min-height: 72px;\r
  display: flex;\r
  align-items: center;\r
  justify-content: space-between;\r
  gap: 20px;\r
  padding: 16px 18px;\r
}\r
\r
.hr_ff5b022_identity {\r
  min-width: 0;\r
  display: flex;\r
  align-items: center;\r
  gap: 12px;\r
}\r
\r
.hr_ff5b022_mark {\r
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
.hr_ff5b022_identityCopy {\r
  min-width: 0;\r
}\r
\r
.hr_ff5b022_identityCopy h3,\r
.hr_ff5b022_identityCopy p,\r
.hr_ff5b022_connectCard p,\r
.hr_ff5b022_pairingHead p,\r
.hr_ff5b022_securityNote {\r
  margin: 0;\r
}\r
\r
.hr_ff5b022_sidebarButton { display: flex; align-items: center; gap: 10px; width: 100%; min-height: 38px; padding: 8px 12px; border: 0; border-radius: 8px; background: transparent; color: var(--dsw-alias-label-secondary, #4d5564); font: inherit; font-size: 14px; cursor: pointer; text-align: left; }\r
.hr_ff5b022_sidebarButton:hover { background: var(--dsw-alias-bg-layer-2, #eef1f5); color: var(--dsw-alias-label-primary, #171a20); }\r
.hr_ff5b022_sidebarButton[data-wide='false'] { width: 36px; min-height: 36px; padding: 8px; justify-content: center; }\r
.hr_ff5b022_sidebarButton svg { flex: none; }\r
.hr_ff5b022_sidebarButton:focus-visible { outline: 2px solid var(--dsw-alias-state-business-primary, #4e79ff); outline-offset: 2px; }\r
.hr_ff5b022_actions { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 16px; }\r
.hr_ff5b022_pageDialog.hr_ff5b022_pageDialog { width: min(820px, 100%); max-height: 100%; }\r
.hr_ff5b022_pageDialogContent.hr_ff5b022_pageDialogContent { min-height: 0; overflow-y: auto; }\r
.hr_ff5b022_helpText { color: var(--dsw-alias-label-secondary, #647084); font-size: 12px; line-height: 1.7; margin: 8px 0; }\r
\r
.hr_ff5b022_companionCard {\r
  border: 1px solid var(--dsw-alias-state-business-primary, #4e79ff);\r
  border-left-width: 4px;\r
  border-radius: 10px;\r
  background: var(--dsw-alias-bg-layer-3, #fff);\r
  padding: 14px 16px;\r
  line-height: 1.6;\r
  overflow-wrap: anywhere;\r
}\r
.hr_ff5b022_companionCard strong { font-size: 14px; }\r
.hr_ff5b022_companionCard p { margin: 4px 0; font-size: 13px; }\r
.hr_ff5b022_companionCard small { color: var(--dsw-alias-label-secondary, #4d5564); }\r
.hr_ff5b022_companionCard progress { display: block; width: 100%; margin: 8px 0; accent-color: #4e79ff; }\r
.hr_ff5b022_companionCard[data-state='complete'] { border-color: var(--dsw-alias-state-success-primary, #1f9d68); }\r
.hr_ff5b022_companionCard[data-state='unavailable'], .hr_ff5b022_companionCard[data-state='recovering'] { border-color: #b5861d; }

/* Assistant modes are a compact owner-facing catalog, not an installation log. */
.hr_ff5b022_assistantsCard { padding: 14px 18px; border: 1px solid var(--dsw-alias-border-l2, #e2e6ee); border-radius: 12px; background: var(--dsw-alias-bg-layer-3, #fff); line-height: 1.5; overflow-wrap: anywhere; }
.hr_ff5b022_assistantsCard h3, .hr_ff5b022_assistantsCard h4, .hr_ff5b022_assistantsCard p { margin: 0; }
.hr_ff5b022_assistantsCard h3 { font-size: 14px; }
.hr_ff5b022_assistantsCard h4 { font-size: 14px; margin: 16px 0 6px; }
.hr_ff5b022_assistantsCard p { color: var(--dsw-alias-label-secondary, #647084); font-size: 12px; }
.hr_ff5b022_assistantsHeading { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 4px; }
.hr_ff5b022_assistantsHeading p { margin-top: 4px; }
.hr_ff5b022_assistantChoices { display: flex; flex-direction: column; }
.hr_ff5b022_assistantChoice { padding: 10px 0; display: flex; align-items: center; gap: 12px; }
.hr_ff5b022_assistantChoiceCopy { flex: 1; min-width: 0; }
.hr_ff5b022_assistantChoiceHead, .hr_ff5b022_assistantEntryHead { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 8px; }
.hr_ff5b022_assistantChoiceHead { justify-content: flex-start; gap: 6px; }
.hr_ff5b022_assistantChoiceHead strong { font-size: 13px; }
.hr_ff5b022_assistantChoice p { flex: 1; }
.hr_ff5b022_assistantStatus { color: var(--dsw-alias-state-success-primary, #17845b); font-size: 12px; }
.hr_ff5b022_assistantPrimary, .hr_ff5b022_assistantSecondary, .hr_ff5b022_assistantTextButton { min-height: 42px; padding: 9px 16px; border-radius: 9px; font: inherit; font-size: 13px; cursor: pointer; }
.hr_ff5b022_assistantPrimary { color: #fff; background: var(--dsw-alias-state-business-primary, #4e79ff); border: 1px solid transparent; }
.hr_ff5b022_assistantSecondary { color: var(--dsw-alias-state-business-primary, #4e79ff); background: var(--dsw-alias-bg-layer-3, #fff); border: 1px solid var(--dsw-alias-border-l2, #d7deed); }
.hr_ff5b022_assistantTextButton { min-height: 32px; padding: 3px 8px; border: 0; background: transparent; color: var(--dsw-alias-state-business-primary, #4e79ff); }
.hr_ff5b022_assistantPrimary:disabled, .hr_ff5b022_assistantSecondary:disabled, .hr_ff5b022_assistantTextButton:disabled { opacity: .5; cursor: default; }
.hr_ff5b022_assistantPrimary:focus-visible, .hr_ff5b022_assistantSecondary:focus-visible, .hr_ff5b022_assistantTextButton:focus-visible, .hr_ff5b022_assistantDetails summary:focus-visible { outline: 2px solid var(--dsw-alias-state-business-primary, #4e79ff); outline-offset: 3px; }
.hr_ff5b022_assistantCustomize { margin-top: 2px; border-top: 1px solid var(--dsw-alias-border-l2, #e2e6ee); }
.hr_ff5b022_assistantCustomize > p { margin-bottom: 10px; }
.hr_ff5b022_assistantCustomize .hr_ff5b022_assistantChoice { background: transparent; }
.hr_ff5b022_assistantDetails { margin-top: 14px; color: var(--dsw-alias-label-secondary, #647084); font-size: 12px; }
.hr_ff5b022_assistantDetails summary { padding: 5px 0; cursor: pointer; }
.hr_ff5b022_assistantDetails ul { margin: 8px 0; padding-left: 20px; }
.hr_ff5b022_assistantDetails li { margin: 5px 0; }
.hr_ff5b022_assistantPreview { padding: 14px; margin-top: 16px !important; border-radius: 10px; background: var(--dsw-alias-bg-layer-1, #f0f4ff); }
.hr_ff5b022_assistantUnavailable { color: var(--dsw-alias-label-secondary, #647084); font-size: 12px; }
.hr_ff5b022_assistantHelpAnchor { display: inline-flex; position: relative; }
.hr_ff5b022_assistantHelpButton { padding: 0; width: 17px; height: 17px; border-radius: 50%; border: 1px solid var(--dsw-alias-border-l2, #bec6d2); background: transparent; color: var(--dsw-alias-label-tertiary, #8490a2); font: inherit; font-size: 11px; cursor: help; }
.hr_ff5b022_assistantTooltip { visibility: hidden; opacity: 0; position: absolute; z-index: 2; top: 24px; left: 0; width: min(300px, 55vw); padding: 10px 12px; border-radius: 8px; border: 1px solid var(--dsw-alias-border-l2, #d7deed); background: var(--dsw-alias-bg-layer-3, #fff); color: var(--dsw-alias-label-secondary, #647084); box-shadow: 0 4px 16px #0002; font-size: 12px; font-weight: normal; }
.hr_ff5b022_assistantHelpAnchor:hover .hr_ff5b022_assistantTooltip, .hr_ff5b022_assistantHelpAnchor:focus-within .hr_ff5b022_assistantTooltip { visibility: visible; opacity: 1; }
.hr_ff5b022_assistantPreview h4 { margin-top: 0; }
.hr_ff5b022_assistantPreview p + p { margin-top: 8px; }
.hr_ff5b022_assistantButtons { display: flex; gap: 10px; flex-wrap: wrap; margin-top: 14px; }
.hr_ff5b022_assistantEntry { margin-top: 10px; padding: 12px 0; border-top: 1px solid var(--dsw-alias-border-l2, #e2e6ee); }
.hr_ff5b022_assistantEntryHead { margin-bottom: 8px; font-size: 13px; }
.hr_ff5b022_assistantEntryHead > span { color: var(--dsw-alias-label-secondary, #647084); font-size: 12px; }
.hr_ff5b022_assistantEntry > button + button { margin-left: 8px; }
@media (max-width: 520px) { .hr_ff5b022_assistantsCard { padding: 12px; } .hr_ff5b022_assistantChoice { gap: 8px; } }
\r
.hr_ff5b022_identityCopy h3 {\r
  font-size: 15px;\r
  font-weight: 650;\r
  line-height: 22px;\r
}\r
\r
.hr_ff5b022_identityCopy p {\r
  color: var(--dsw-alias-label-tertiary, #7d8492);\r
  font-size: 12px;\r
  line-height: 18px;\r
  overflow: hidden;\r
  text-overflow: ellipsis;\r
  white-space: nowrap;\r
}\r
\r
.hr_ff5b022_overall {\r
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
.hr_ff5b022_overall[data-ready='true'] {\r
  color: var(--dsw-alias-state-success-primary, #1f9d68);\r
}\r
\r
.hr_ff5b022_statusDot {\r
  width: 7px;\r
  height: 7px;\r
  background: var(--dsw-alias-label-tertiary, #8b93a2);\r
  border-radius: 999px;\r
  flex: none;\r
}\r
\r
.hr_ff5b022_statusDot[data-state='ready'] {\r
  background: var(--dsw-alias-state-success-primary, #1f9d68);\r
}\r
\r
.hr_ff5b022_statusDot[data-state='busy'] {\r
  background: var(--dsw-alias-state-business-primary, #4e79ff);\r
  animation: harnessRemotePulse 1.2s ease-in-out infinite;\r
}\r
\r
.hr_ff5b022_capabilities {\r
  grid-template-columns: repeat(3, minmax(0, 1fr));\r
  gap: 10px;\r
  display: grid;\r
}\r
\r
.hr_ff5b022_capability {\r
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
.hr_ff5b022_capability > .hr_ff5b022_statusDot {\r
  margin-top: 6px;\r
}\r
\r
.hr_ff5b022_capabilityCopy {\r
  min-width: 0;\r
  display: flex;\r
  flex-direction: column;\r
  gap: 1px;\r
}\r
\r
.hr_ff5b022_capabilityCopy strong {\r
  font-size: 12.5px;\r
  font-weight: 600;\r
  line-height: 19px;\r
}\r
\r
.hr_ff5b022_capabilityCopy span {\r
  color: var(--dsw-alias-label-tertiary, #7d8492);\r
  font-size: 11px;\r
  line-height: 17px;\r
  overflow: hidden;\r
  text-overflow: ellipsis;\r
  white-space: nowrap;\r
}\r
\r
.hr_ff5b022_notice {\r
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
.hr_ff5b022_notice button,\r
.hr_ff5b022_secondaryButton {\r
  border: 1px solid var(--dsw-alias-border-l2, rgba(128, 140, 160, 0.28));\r
  color: var(--dsw-alias-label-primary, #171a20);\r
  background: var(--dsw-alias-bg-layer-1, #f5f6f8);\r
  border-radius: 7px;\r
  font: inherit;\r
  cursor: pointer;\r
}\r
\r
.hr_ff5b022_notice button {\r
  flex: none;\r
  padding: 3px 9px;\r
}\r
\r
.hr_ff5b022_connectCard {\r
  display: flex;\r
  align-items: center;\r
  justify-content: space-between;\r
  gap: 20px;\r
  padding: 18px;\r
}\r
\r
.hr_ff5b022_connectCard strong,\r
.hr_ff5b022_pairingHead strong {\r
  font-size: 14px;\r
  font-weight: 650;\r
  line-height: 21px;\r
}\r
\r
.hr_ff5b022_connectCard p,\r
.hr_ff5b022_pairingHead p {\r
  max-width: 470px;\r
  color: var(--dsw-alias-label-tertiary, #7d8492);\r
  font-size: 12px;\r
  line-height: 18px;\r
}\r
\r
.hr_ff5b022_primaryButton {\r
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
.hr_ff5b022_primaryButton:hover {\r
  filter: brightness(1.04);\r
}\r
\r
.hr_ff5b022_primaryButton:focus-visible,\r
.hr_ff5b022_secondaryButton:focus-visible,\r
.hr_ff5b022_notice button:focus-visible {\r
  outline: 2px solid var(--dsw-alias-state-business-primary, #4e79ff);\r
  outline-offset: 2px;\r
}\r
\r
.hr_ff5b022_pairingCard {\r
  padding: 18px;\r
}\r
\r
.hr_ff5b022_pairingHead {\r
  display: flex;\r
  align-items: center;\r
  justify-content: space-between;\r
  gap: 16px;\r
}\r
\r
.hr_ff5b022_secondaryButton {\r
  min-height: 32px;\r
  flex: none;\r
  padding: 0 11px;\r
  font-size: 12px;\r
}\r
\r
.hr_ff5b022_secondaryButton:disabled,\r
.hr_ff5b022_primaryButton:disabled {\r
  cursor: default;\r
  opacity: 0.55;\r
}\r
\r
.hr_ff5b022_qrArea {\r
  min-height: 292px;\r
  margin-top: 16px;\r
  display: flex;\r
  flex-direction: column;\r
  align-items: center;\r
  justify-content: center;\r
  gap: 10px;\r
}\r
\r
.hr_ff5b022_qr,\r
.hr_ff5b022_qrPlaceholder {\r
  box-sizing: border-box;\r
  width: 280px;\r
  height: 280px;\r
  border-radius: 12px;\r
}\r
\r
.hr_ff5b022_qr {\r
  background: #fff;\r
  padding: 10px;\r
  image-rendering: pixelated;\r
}\r
\r
.hr_ff5b022_qrPlaceholder {\r
  color: var(--dsw-alias-label-tertiary, #7d8492);\r
  background: var(--dsw-alias-bg-layer-1, #f5f6f8);\r
  border: 1px dashed var(--dsw-alias-border-l2, rgba(128, 140, 160, 0.28));\r
  display: grid;\r
  place-items: center;\r
  font-size: 12px;\r
}\r
\r
.hr_ff5b022_qrValidity {\r
  color: var(--dsw-alias-label-tertiary, #7d8492);\r
  font-size: 11px;\r
  line-height: 17px;\r
}\r
\r
.hr_ff5b022_securityNote {\r
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
  .hr_ff5b022_statusDot[data-state='busy'] {\r
    animation: none;\r
  }\r
}\r
\r
@media (max-width: 680px) {\r
  .hr_ff5b022_capabilities {\r
    grid-template-columns: minmax(0, 1fr);\r
  }\r
\r
  .hr_ff5b022_connectCard {\r
    align-items: stretch;\r
    flex-direction: column;\r
  }\r
\r
  .hr_ff5b022_primaryButton {\r
    width: 100%;\r
  }\r
\r
  .hr_ff5b022_qrArea {\r
    flex-direction: column;\r
    gap: 12px;\r
  }\r
\r
}\r
.hr_ff5b022_updateCard { border: 1px solid var(--dsw-alias-border-l2, #ddd); background: var(--dsw-alias-bg-layer-3, #fff); border-radius: 12px; padding: 14px 18px; line-height: 1.5; font-size: 13px; overflow-wrap: anywhere; }
.hr_ff5b022_updateHeading { font-size: 14px; line-height: 21px; margin: 0 0 8px; }
.hr_ff5b022_updateRow { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 8px 16px; }
.hr_ff5b022_updateCopy { flex: 1 1 240px; min-width: 0; }
.hr_ff5b022_updateControl { display: flex; flex-direction: column; align-items: flex-end; gap: 2px; max-width: 100%; }
.hr_ff5b022_updateControl .hr_ff5b022_updateLabel { font-size: 12px; font-weight: 500; }
.hr_ff5b022_updateControl .hr_ff5b022_updateChecked { margin-top: 0; }
.hr_ff5b022_updateRow > .hr_ff5b022_updateActions { margin-top: 0; }
.hr_ff5b022_updateEndpoint p, .hr_ff5b022_companionInline p { margin: 4px 0; }
.hr_ff5b022_updateScope { color: var(--dsw-alias-label-tertiary, #7d8492); font-size: 12px; font-weight: 400; }
.hr_ff5b022_updateEndpoint + div { margin-top: 10px; padding-top: 10px; border-top: 1px solid var(--dsw-alias-border-l2, #ddd); }
.hr_ff5b022_updateActions { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; margin-top: 8px; }
.hr_ff5b022_updateActions .hr_ff5b022_primaryButton { width: auto; min-height: 32px; padding: 0 12px; }
.hr_ff5b022_updateActions .hr_ff5b022_secondaryButton { min-height: 32px; }
.hr_ff5b022_updatePeerNote { margin: 0; color: var(--dsw-alias-label-tertiary, #7d8492); font-size: 12px; }
.hr_ff5b022_updateDetails { color: var(--dsw-alias-label-secondary, #647084); font-size: 12px; }
.hr_ff5b022_updateDetails summary { cursor: pointer; margin-top: 4px; }
.hr_ff5b022_companionInline strong { font-size: 13px; font-weight: 500; }
.hr_ff5b022_companionInline small { display: block; color: var(--dsw-alias-label-secondary, #647084); font-size: 12px; margin-top: 4px; }
.hr_ff5b022_companionInline progress { display: block; width: 100%; height: 8px; margin: 8px 0; accent-color: var(--dsw-alias-state-business-primary, #4e79ff); }
.hr_ff5b022_companionInline[data-state='complete'] .hr_ff5b022_updateCopy > strong { color: var(--dsw-alias-state-success-primary, #1f9d68); }
.hr_ff5b022_companionInline[data-state='unavailable'] .hr_ff5b022_updateCopy > strong, .hr_ff5b022_companionInline[data-state='recovering'] .hr_ff5b022_updateCopy > strong { color: #b5861d; }
.hr_ff5b022_updateLabel { color: inherit; }\r
.hr_ff5b022_updateLabel[data-severity="none"] { color: #218b5c; }\r
.hr_ff5b022_updateLabel[data-severity="unknown"] { color: var(--text-secondary, #858b96); }\r
.hr_ff5b022_updateLabel[data-severity="required"] { color: #d54052; }\r
.hr_ff5b022_updateLabel[data-severity="recommended"], .hr_ff5b022_updateLabel[data-severity="info"] { color: #b5861d; }\r
.hr_ff5b022_updateProgress { width: 100%; height: 8px; margin-top: 8px; accent-color: #7487ef; }
.hr_ff5b022_updateVersions { display: flex; flex-wrap: wrap; gap: 4px 16px; margin: 6px 0; }
.hr_ff5b022_updateVersions span { color: var(--text-secondary, #858b96); }\r
.hr_ff5b022_updateVersions strong { color: var(--text-primary, inherit); font-weight: 500; }\r
.hr_ff5b022_updateCommand { display: flex; flex-wrap: wrap; align-items: center; gap: 12px; margin-top: 12px; }\r
.hr_ff5b022_updateCommand code { flex: 1 1 240px; white-space: pre-wrap; overflow-wrap: anywhere; user-select: text; }\r
.hr_ff5b022_updateChecked { display: block; margin-top: 4px; color: var(--text-secondary, #858b96); font-size: 11px; }
.hr_ff5b022_clawbotCard { color: var(--dsw-alias-label-primary, #171a20); }
.hr_ff5b022_clawbotHead, .hr_ff5b022_clawbotRow { display: flex; align-items: center; justify-content: space-between; gap: 12px; }\r
.hr_ff5b022_clawbotHead { flex-wrap: wrap; }\r
.hr_ff5b022_clawbotHeadActions { display: flex; align-items: center; flex-shrink: 0; gap: 14px; margin-left: auto; }\r
.hr_ff5b022_clawbotHead h3 { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; margin: 0; }
.hr_ff5b022_clawbotHead small { font-size: 11px; font-weight: normal; color: var(--dsw-alias-label-tertiary, #7d8492); }
.hr_ff5b022_clawbotRow { margin: 10px 0; flex-wrap: wrap; }
.hr_ff5b022_clawbotNode { margin: 8px 0 0; font-size: 12px; overflow-wrap: anywhere; color: var(--dsw-alias-label-secondary, #647084); }
.hr_ff5b022_clawbotSection { margin-top: 18px; }
.hr_ff5b022_clawbotSection + .hr_ff5b022_clawbotSection { border-top: 1px solid var(--dsw-alias-border-l2, #ddd); padding-top: 8px; }
.hr_ff5b022_clawbotStatus { display: inline-flex; align-items: center; gap: 6px; font-size: 12px; color: var(--dsw-alias-label-secondary, #647084); }
.hr_ff5b022_clawbotStatus::before { content: ''; width: 6px; height: 6px; border-radius: 50%; background: currentColor; }
.hr_ff5b022_clawbotStatus[data-state='paired'] { color: var(--dsw-alias-state-success-primary, #218b5c); }
.hr_ff5b022_clawbotStatus[data-state='pending'] { color: var(--dsw-alias-state-business-primary, #4e79ff); }
.hr_ff5b022_clawbotStatus[data-state='expired'] { color: var(--dsw-alias-state-warning-primary, #a97513); }
.hr_ff5b022_clawbotPairingEntry { display: flex; align-items: center; flex-wrap: wrap; justify-content: space-between; gap: 8px 16px; }
.hr_ff5b022_clawbotRow select { box-sizing: border-box; flex: 1 1 180px; min-width: 0; max-width: 100%; min-height: 36px; border: 1px solid var(--dsw-alias-border-l2, #ddd); border-radius: 8px; padding: 7px 9px; color: inherit; background: var(--dsw-alias-bg-layer-3, #fff); font: inherit; }
.hr_ff5b022_clawbotToggle { display: inline-flex; position: relative; flex: 0 0 42px; width: 42px; height: 26px; align-items: center; cursor: pointer; }
.hr_ff5b022_clawbotToggle input { position: absolute; inset: 0; width: 100%; height: 100%; opacity: 0; margin: 0; z-index: 1; cursor: pointer; }
.hr_ff5b022_clawbotSwitchTrack { width: 42px; height: 24px; border-radius: 999px; background: var(--dsw-alias-bg-layer-4, #a6afbd); transition: background 150ms ease; }
.hr_ff5b022_clawbotSwitchTrack::after { content: ''; display: block; width: 18px; height: 18px; margin: 3px; border-radius: 50%; background: #fff; box-shadow: 0 1px 3px rgb(0 0 0 / 18%); transition: transform 150ms ease; }
.hr_ff5b022_clawbotToggle input:checked + .hr_ff5b022_clawbotSwitchTrack { background: var(--dsw-alias-state-business-primary, #4e79ff); }
.hr_ff5b022_clawbotToggle input:checked + .hr_ff5b022_clawbotSwitchTrack::after { transform: translateX(18px); }
.hr_ff5b022_clawbotToggle input:disabled { cursor: default; }
.hr_ff5b022_clawbotToggle input:disabled + .hr_ff5b022_clawbotSwitchTrack { opacity: .45; }
.hr_ff5b022_clawbotToggle input:focus-visible + .hr_ff5b022_clawbotSwitchTrack, .hr_ff5b022_clawbotTextButton:focus-visible, .hr_ff5b022_clawbotHistory summary:focus-visible, .hr_ff5b022_clawbotRow select:focus-visible { outline: 2px solid var(--dsw-alias-state-business-primary, #4e79ff); outline-offset: 3px; }\r
.hr_ff5b022_clawbotNote { font-size: 12px; line-height: 1.6; color: var(--dsw-alias-label-secondary, #647084); margin: 8px 0; }
.hr_ff5b022_clawbotError { color: var(--dsw-alias-state-error-primary, #b23b36); font-size: 13px; }
.hr_ff5b022_clawbotPairing { display: flex; align-items: center; gap: 20px; flex-wrap: wrap; margin-top: 12px; }
.hr_ff5b022_clawbotPairing img { display: block; flex: none; max-width: 100%; height: auto; border-radius: 8px; background: #fff; }
.hr_ff5b022_clawbotPairingCopy { flex: 1 1 200px; min-width: 0; }
.hr_ff5b022_clawbotPairingCopy form { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; margin-top: 12px; }
.hr_ff5b022_clawbotPairing input { border: 1px solid var(--dsw-alias-border-l2, #ddd); border-radius: 6px; padding: 8px; width: 120px; max-width: 100%; color: inherit; background: transparent; }
.hr_ff5b022_clawbotActions { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; margin-top: 10px; }
.hr_ff5b022_clawbotTextButton { padding: 4px 0; border: 0; color: var(--dsw-alias-state-business-primary, #4e79ff); background: transparent; font: inherit; font-size: 12px; cursor: pointer; white-space: nowrap; flex-shrink: 0; }
.hr_ff5b022_clawbotTextButton:disabled { opacity: .5; cursor: default; }
.hr_ff5b022_clawbotHistory { margin-top: 16px; color: var(--dsw-alias-label-secondary, #647084); font-size: 12px; }\r
.hr_ff5b022_clawbotHistory summary { width: fit-content; padding: 4px 0; cursor: pointer; }\r
.hr_ff5b022_assistantFeatureBody { border: 0; padding: 0; margin: 12px 0 0; min-width: 0; }
.hr_ff5b022_assistantFeatureBody:disabled { opacity: .55; }
.hr_ff5b022_clawbotMark { display: inline-flex; flex: 0 0 18px; width: 18px; height: 18px; border-radius: 5px; background: #e54443; align-items: center; justify-content: center; gap: 3px; }
.hr_ff5b022_clawbotMark::before, .hr_ff5b022_clawbotMark::after { content: ''; display: block; width: 5px; height: 5px; border-radius: 50%; background: #fff; }
@media (prefers-reduced-motion: reduce) {
  .hr_ff5b022_clawbotSwitchTrack, .hr_ff5b022_clawbotSwitchTrack::after { transition: none; }
}
`,Me="@harness-remote/dsh-wechat-remote/HarnessRemoteSettings.module.css";if(typeof document<"u"&&document.querySelector("style[data-plugin-css="+JSON.stringify(Me)+"]")===null){let t=document.createElement("style");t.dataset.plugin="@harness-remote/dsh-wechat-remote",t.dataset.pluginCss=Me,t.textContent=At,document.head.appendChild(t)}Oe.exports={root:"hr_ff5b022_root",hero:"hr_ff5b022_hero",connectCard:"hr_ff5b022_connectCard",pairingCard:"hr_ff5b022_pairingCard",identity:"hr_ff5b022_identity",mark:"hr_ff5b022_mark",identityCopy:"hr_ff5b022_identityCopy",pairingHead:"hr_ff5b022_pairingHead",securityNote:"hr_ff5b022_securityNote",sidebarButton:"hr_ff5b022_sidebarButton",actions:"hr_ff5b022_actions",pageDialog:"hr_ff5b022_pageDialog",pageDialogContent:"hr_ff5b022_pageDialogContent",helpText:"hr_ff5b022_helpText",companionCard:"hr_ff5b022_companionCard",assistantsCard:"hr_ff5b022_assistantsCard",assistantsHeading:"hr_ff5b022_assistantsHeading",assistantChoices:"hr_ff5b022_assistantChoices",assistantChoice:"hr_ff5b022_assistantChoice",assistantChoiceCopy:"hr_ff5b022_assistantChoiceCopy",assistantChoiceHead:"hr_ff5b022_assistantChoiceHead",assistantEntryHead:"hr_ff5b022_assistantEntryHead",assistantStatus:"hr_ff5b022_assistantStatus",assistantPrimary:"hr_ff5b022_assistantPrimary",assistantSecondary:"hr_ff5b022_assistantSecondary",assistantTextButton:"hr_ff5b022_assistantTextButton",assistantDetails:"hr_ff5b022_assistantDetails",assistantCustomize:"hr_ff5b022_assistantCustomize",assistantPreview:"hr_ff5b022_assistantPreview",assistantUnavailable:"hr_ff5b022_assistantUnavailable",assistantHelpAnchor:"hr_ff5b022_assistantHelpAnchor",assistantHelpButton:"hr_ff5b022_assistantHelpButton",assistantTooltip:"hr_ff5b022_assistantTooltip",assistantButtons:"hr_ff5b022_assistantButtons",assistantEntry:"hr_ff5b022_assistantEntry",overall:"hr_ff5b022_overall",statusDot:"hr_ff5b022_statusDot",capabilities:"hr_ff5b022_capabilities",capability:"hr_ff5b022_capability",capabilityCopy:"hr_ff5b022_capabilityCopy",notice:"hr_ff5b022_notice",secondaryButton:"hr_ff5b022_secondaryButton",primaryButton:"hr_ff5b022_primaryButton",qrArea:"hr_ff5b022_qrArea",qr:"hr_ff5b022_qr",qrPlaceholder:"hr_ff5b022_qrPlaceholder",qrValidity:"hr_ff5b022_qrValidity",updateCard:"hr_ff5b022_updateCard",updateHeading:"hr_ff5b022_updateHeading",updateRow:"hr_ff5b022_updateRow",updateCopy:"hr_ff5b022_updateCopy",updateControl:"hr_ff5b022_updateControl",updateLabel:"hr_ff5b022_updateLabel",updateChecked:"hr_ff5b022_updateChecked",updateActions:"hr_ff5b022_updateActions",updateEndpoint:"hr_ff5b022_updateEndpoint",companionInline:"hr_ff5b022_companionInline",updateScope:"hr_ff5b022_updateScope",updatePeerNote:"hr_ff5b022_updatePeerNote",updateDetails:"hr_ff5b022_updateDetails",updateProgress:"hr_ff5b022_updateProgress",updateVersions:"hr_ff5b022_updateVersions",updateCommand:"hr_ff5b022_updateCommand",clawbotCard:"hr_ff5b022_clawbotCard",clawbotHead:"hr_ff5b022_clawbotHead",clawbotRow:"hr_ff5b022_clawbotRow",clawbotHeadActions:"hr_ff5b022_clawbotHeadActions",clawbotNode:"hr_ff5b022_clawbotNode",clawbotSection:"hr_ff5b022_clawbotSection",clawbotStatus:"hr_ff5b022_clawbotStatus",clawbotPairingEntry:"hr_ff5b022_clawbotPairingEntry",clawbotToggle:"hr_ff5b022_clawbotToggle",clawbotSwitchTrack:"hr_ff5b022_clawbotSwitchTrack",clawbotTextButton:"hr_ff5b022_clawbotTextButton",clawbotHistory:"hr_ff5b022_clawbotHistory",clawbotNote:"hr_ff5b022_clawbotNote",clawbotError:"hr_ff5b022_clawbotError",clawbotPairing:"hr_ff5b022_clawbotPairing",clawbotPairingCopy:"hr_ff5b022_clawbotPairingCopy",clawbotActions:"hr_ff5b022_clawbotActions",assistantFeatureBody:"hr_ff5b022_assistantFeatureBody",clawbotMark:"hr_ff5b022_clawbotMark"}});var Vt={};Rt(Vt,{apply:()=>qt,inject:()=>Ft});module.exports=Dt(Vt);var Je=require("react"),$e=require("@deepseek-ai/dsh-client-ui-primitives");var W=ne(Z(),1),S=require("react/jsx-runtime");function Fe({value:t,onDecide:a,deciding:e=!1,compact:n=!1}){if(!t||!n&&t.state==="idle")return null;let r={"confirmation-required":"是否更新下方指定端的插件？",deferred:"已暂缓此次联动更新",pending:"联动更新待处理",busy:"等待待更新端的任务结束",preparing:"正在准备联动更新",installing:"正在安装插件更新",verifying:"正在核验更新后的恢复状态",recovering:"正在恢复更新前的插件","restart-required":"待更新端需启动或重启确认","self-restart-required":"当前端待重启，尚未生效",unverified:"两端更新状态待核实",complete:"两端插件已对齐",unavailable:"联动更新尚未确认成功"},l=["preparing","installing","verifying","recovering"].includes(t.state),d=t.versions?.peer==="desktop"?"Desktop":t.versions?.peer==="web"?"Web":null,i=t.target?.scope==="desktop"?"Desktop":t.target?.scope==="web"?"Web":null,c=i||"更新端",p={pending:`等待 ${c} 就绪`,busy:`${c} 有任务，等待空闲`,preparing:`正在准备 ${c} 更新`,installing:`正在更新 ${c}`,verifying:`正在核对 ${c} 更新结果`,recovering:`正在恢复 ${c} 原版本`,"restart-required":`${c} 已安装，待启动或重连确认`,"self-restart-required":"当前端待重启，尚未生效",unverified:"更新状态待核对",complete:"两端版本已同步",unavailable:"更新未完成，请核对"},y=["confirmation-required","deferred"].includes(t.state);if(n&&t.state==="idle"&&!t.versions?.peerInstalled)return(0,S.jsx)("p",{className:W.default.updatePeerNote,children:"未检测到可同步更新的另一端；当前端可独立使用。"});let b=t.state==="idle"?"未发现待确认的同步更新":n&&y&&i&&t.target?`${i} 可更新至 ${t.target.version}${t.state==="deferred"?" · 已暂缓":""}`:n&&t.state==="self-restart-required"?"当前端重启后可检查同步更新":(n?p[t.state]:void 0)||r[t.state]||"插件更新状态待核对",E=y&&t.offerId&&a?(0,S.jsxs)("div",{className:W.default.updateActions,children:[(0,S.jsx)("button",{type:"button",className:W.default.primaryButton,disabled:e,onClick:()=>a("approve"),children:e?"确认中…":i?`确认更新 ${i}`:"确认更新指定端"}),(0,S.jsx)("button",{type:"button",className:W.default.secondaryButton,disabled:e,onClick:()=>a("later"),children:"稍后再说"})]}):null;return(0,S.jsxs)("aside",{className:n?W.default.companionInline:W.default.companionCard,"data-state":t.state,role:"status","aria-live":"polite",children:[n?(0,S.jsxs)("div",{className:W.default.updateRow,children:[(0,S.jsxs)("div",{className:W.default.updateCopy,children:[d?(0,S.jsxs)("div",{className:W.default.updateVersions,children:[(0,S.jsxs)("strong",{children:[d," ",(0,S.jsx)("span",{className:W.default.updateScope,children:"同一主机"})]}),(0,S.jsx)("span",{children:t.versions?.peerInstalled?`已安装 ${t.versions.peerInstalled}`:"安装或启用状态未确认"})]}):null,(0,S.jsx)("strong",{children:b})]}),E]}):(0,S.jsx)("strong",{children:b}),n?(0,S.jsx)(S.Fragment,{children:t.state!=="idle"&&t.message?(0,S.jsxs)("details",{className:W.default.updateDetails,children:[(0,S.jsx)("summary",{children:"详细状态"}),(0,S.jsx)("p",{children:t.message})]}):null}):t.message?(0,S.jsx)("p",{children:t.message}):null,!n&&t.versions?(0,S.jsxs)("small",{children:[t.versions.current==="desktop"?"Desktop":"Web","：运行 ",t.versions.running," · 已安装 ",t.versions.installed??"未确认","；",d,"：已安装 ",t.versions.peerInstalled??"未确认或未启用"]}):null,E?(0,S.jsxs)(S.Fragment,{children:[n?null:E,(0,S.jsx)("small",{className:W.default.updateChecked,children:"空闲后更新，连接会短暂中断；保留配对与会话。"})]}):null,l?(0,S.jsx)("progress",{"aria-label":"联动更新进度"}):null,t.state==="busy"?(0,S.jsx)("small",{children:"不用手动停止任务。请保持两端运行，空闲后会继续检查。"}):l?(0,S.jsx)("small",{children:"请保持两端当前状态，暂勿退出、重启或重复安装。关闭本设置页不会取消更新。"}):t.state==="unavailable"?(0,S.jsx)("small",{children:"请在待更新端核对版本，必要时使用其原安装入口。"}):null]})}function qe(){return Object.assign(new Error("当前 DSH 或插件不支持此诊断入口，请更新后重新打开应用。"),{code:"diagnostic-unsupported"})}async function ve(t,a,e=fetch){let n=await t(),r=n.gate;if(!r)throw new Error("当前节点没有提供配对入口");let l=r.profileScope==="desktop",d=r.localDoor?.port,i=Number.isSafeInteger(d)&&d>=1&&d<=65535?`http://127.0.0.1:${d}`:null;if(r.management==="authenticated-rpc")return{host:n,runtime:r,localOrigin:l?null:i,status:()=>a("status"),pairCode:()=>a("pair-code"),diagnose:async p=>{if(r.diagnostics!=="read-only-v1")throw qe();return a("connection-diagnostics",void 0,p)},decide:(p,y)=>a("companion-decision",{offerId:p,action:y})};if(l||r.management==="unavailable"||!i||r.localDoor.state!=="listening")throw new Error("当前节点配对入口尚未就绪");let c=async p=>{let y=await e(i+p,{cache:"no-store"});if(!y.ok)throw new Error(`配对请求失败 (${y.status})`);return y.json()};return{host:n,runtime:r,localOrigin:i,status:()=>c("/gate/status"),pairCode:()=>c("/pair/code"),diagnose:async p=>{throw qe()},decide:async(p,y)=>{let b=await e(i+"/gate/companion/decision",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({offerId:p,action:y})});if(!b.ok)throw new Error("更新通知已变化，请刷新后重试");return b.json()}}}var we=class{constructor(a,e=globalThis.fetch){this.origin=a;this.fetcher=e.bind(globalThis)}value={check:null,checking:!1,progress:null,error:"",copied:!1,resumeFailed:!1};listeners=new Set;reading;installing=!1;disposed=!1;job=null;timer;pollGeneration=0;recovering=!1;fetcher;getSnapshot=()=>this.value;subscribe=a=>this.disposed?()=>{}:(this.listeners.add(a),this.listeners.size===1&&this.refresh(),()=>{this.listeners.delete(a)});patch(a){if(!this.disposed){this.value={...this.value,...a};for(let e of this.listeners)e()}}refresh=()=>this.disposed?Promise.resolve():this.reading?this.reading:(this.patch({checking:!0,error:"",copied:!1}),this.reading=(async()=>{try{let a=await this.fetcher(this.origin+"/gate/update/check",{signal:AbortSignal.timeout(1e4)}),e=await a.json();if(!a.ok)throw new Error(e.error||"暂时无法检查更新");if(!e.advice?.current||typeof e.advice.label!="string")throw new Error("更新检查返回信息不完整");if(this.patch({check:e}),this.installing||this.job||this.recovering)return;e.activeJob?.statusOrigin?this.follow(e.activeJob):e.lastResult?.phase==="unknown"?this.patch({progress:e.lastResult}):e.mode==="busy"?this.patch({progress:{phase:"preparing",progress:0,message:"更新仍在准备或等待确认，请稍后重新检查；不要重复安装。",terminal:!0}}):this.patch({progress:e.lastResult??null})}catch(a){this.patch({check:null,error:a instanceof Error?a.message:"暂时无法检查更新"})}finally{this.patch({checking:!1})}})().finally(()=>{this.reading=void 0}),this.reading);follow(a){if(this.disposed||this.job?.jobId===a.jobId)return;this.job=a;let e=++this.pollGeneration,n=Date.now()+10*6e4;clearTimeout(this.timer),this.patch({progress:{phase:"recovering",progress:0,message:"正在恢复更新进度…",terminal:!1}});let r=async()=>{if(this.disposed||e!==this.pollGeneration)return;let l;try{let d=await this.fetcher(a.statusOrigin+"/status",{headers:{Authorization:"Bearer "+a.statusToken},signal:AbortSignal.timeout(4e3)});if(!d.ok)throw new Error("进度暂不可用");let i=await d.json();if(i.jobId!==a.jobId||typeof i.terminal!="boolean"||typeof i.message!="string")throw new Error("进度不匹配");l=i}catch{try{let d=await this.fetcher(this.origin+"/gate/update/status",{signal:AbortSignal.timeout(3e3)}),i=await d.json();d.ok&&i.lastResult?.jobId===a.jobId&&(l=i.lastResult)}catch{}}if(!(this.disposed||e!==this.pollGeneration)){if(l&&(this.patch({progress:l}),l.terminal)){this.job=null,l.ok?this.resume(a.jobId):this.refresh();return}if(Date.now()>n){this.job=null,this.patch({progress:{phase:"unknown",progress:0,message:"暂时无法确认更新结果。请重新打开此主机 WebUI 检查版本；不要重复安装或删除节点。",terminal:!0}});return}this.timer=setTimeout(()=>void r(),1e3)}};r()}async resume(a){this.recovering=!0;let e=Date.now()+3e4,n=async()=>{try{let r=await this.fetcher(this.origin+"/gate/update/resume?job="+encodeURIComponent(a),{signal:AbortSignal.timeout(3e3)});if(!r.ok)throw new Error("尚未恢复");let l=await r.json();if(!l.url)throw new Error("缺少恢复地址");let d=new URL(l.url);if(d.origin!==window.location.origin||d.pathname!=="/"||d.username||d.password||d.hash)throw new Error("恢复地址不匹配");this.disposed||window.location.replace(d.href)}catch{if(this.disposed)return;if(Date.now()>=e){this.recovering=!1,this.patch({resumeFailed:!0});return}this.timer=setTimeout(()=>void n(),1e3)}};await n()}install=async()=>{let{check:a,checking:e,error:n,progress:r}=this.value;if(this.disposed||!a?.canInstall||e||n||r&&!r.terminal||this.installing||this.job||this.recovering)return;this.installing=!0,this.patch({error:"",check:{...a,canInstall:!1,ticket:""},progress:{phase:"download",progress:10,message:"正在下载并验证更新包；当前插件尚未替换",terminal:!1}});let l=!1;try{let d=await this.fetcher(this.origin+"/gate/update/start",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({ticket:a.ticket})}),i=await d.json();if(l=!d.ok&&typeof i.error=="string",!d.ok||!i.statusOrigin)throw new Error(i.error||"无法取得更新进度，请重新检查");this.follow(i)}catch(d){if(this.disposed)return;if(l)this.patch({progress:{phase:"failed",progress:0,message:(d instanceof Error?d.message:"更新暂不可用")+"。请重新检查更新。",terminal:!0,ok:!1}});else{try{let i=await this.fetcher(this.origin+"/gate/update/status",{signal:AbortSignal.timeout(3e3)}),c=await i.json();if(i.ok&&c.activeJob?.statusOrigin){this.follow(c.activeJob);return}}catch{}this.patch({progress:{phase:"unknown",progress:0,message:"连接中断，暂时无法确认更新结果。请稍后检查更新；不要重复安装或删除节点。",terminal:!0}})}}finally{this.installing=!1}};copyCommand=async()=>{if(!(!this.value.check?.manualCommand||this.value.checking||this.installing||this.job))try{await navigator.clipboard.writeText(this.value.check.manualCommand),this.patch({copied:!0})}catch{this.patch({error:"复制失败，请手动选中下方命令复制。"})}};dispose=()=>{this.disposed=!0,this.pollGeneration++,clearTimeout(this.timer),this.listeners.clear()}};var ye=class{constructor(a){this.call=a}value={checking:!1,starting:!1,check:null,status:null,error:null};listeners=new Set;reading;timer;disposed=!1;checkRevision=0;checkInvalidated=!1;getSnapshot=()=>this.value;patch(a){if(!this.disposed){this.value={...this.value,...a};for(let e of this.listeners)e()}}subscribe=a=>this.disposed?()=>{}:(this.listeners.add(a),this.checkInvalidated?(this.refreshInvalidatedCheck(),this.active()&&this.poll()):!this.value.check&&!this.value.starting?this.refresh():this.active()&&this.poll(),()=>{this.listeners.delete(a),this.listeners.size||(clearTimeout(this.timer),this.timer=void 0)});active(){return this.value.status&&["preparing","installing","unknown","restart-required"].includes(this.value.status.phase)}invalidateCheck=()=>{this.disposed||(this.checkRevision++,this.checkInvalidated=!0,this.value.check&&this.patch({check:{...this.value.check,canInstall:!1,ticket:""}}),this.refreshInvalidatedCheck())};refreshInvalidatedCheck(){!this.disposed&&this.checkInvalidated&&this.listeners.size&&!this.value.starting&&!this.active()&&this.refresh()}refresh=()=>{if(this.disposed||this.value.starting)return Promise.resolve();if(this.reading)return this.reading;let a=this.checkRevision;return this.checkInvalidated=!1,this.patch({checking:!0,error:null}),this.reading=(async()=>{try{let e=await this.call("update-check");if(this.disposed||a!==this.checkRevision)return;if(!e?.advice||!e.status||typeof e.canInstall!="boolean")throw Error("invalid update response");this.patch({check:e,status:e.status}),this.active()&&this.poll()}catch{if(this.disposed||a!==this.checkRevision)return;let e=!1;try{let n=await this.call("status");e=!!(n&&!n.plugin)}catch{}if(this.disposed||a!==this.checkRevision)return;this.patch({check:null,error:e?"当前运行的连接服务尚不支持此更新入口。若刚安装新版，请在任务结束后退出并重新打开 Desktop；无需重新配对。仍不可用时请在原生插件管理器核对安装。":"本次更新检查未完成，不能据此判断已是最新版。请稍后重试；配对和聊天不受此次检查失败影响。"})}finally{this.patch({checking:!1})}})().finally(()=>{this.reading=void 0,this.refreshInvalidatedCheck()}),this.reading};install=async()=>{let a=this.value.check;if(!(this.disposed||this.checkInvalidated||this.value.starting||this.value.checking||!a?.canInstall||!a.ticket)){this.patch({starting:!0,error:null,check:{...a,canInstall:!1,ticket:""}});try{let e=await this.call("update-start",{ticket:a.ticket});this.patch({status:e})}catch(e){this.patch({status:e?.code==="update/not-started"?{phase:"failed",message:e instanceof Error?e.message:"尚未启动更新，请重新检查"}:{phase:"unknown",message:"更新提交结果暂未确认，正在核对；请勿重复安装。"}})}finally{this.patch({starting:!1}),this.poll(),this.refreshInvalidatedCheck()}}};poll(){this.disposed||this.timer||!this.listeners.size||!this.active()||(this.timer=setTimeout(async()=>{try{let a=await this.call("update-status");if(!a||!["idle","preparing","installing","restart-required","complete","failed","unknown"].includes(a.phase))throw Error("invalid status");this.patch({status:a,error:a.phase==="idle"?"尚未发现已接受的更新，请重新检查后再操作。":null})}catch{this.patch({error:"更新状态暂不可用；恢复连接后继续核对，不会重复安装。"})}finally{this.timer=void 0,this.poll(),this.refreshInvalidatedCheck()}},2e3))}dispose(){this.disposed=!0,this.checkRevision++,this.checkInvalidated=!1,clearTimeout(this.timer),this.listeners.clear()}};var Re=()=>({loadState:"loading",qrState:"idle",status:null,host:null,runtime:null,localOrigin:null,qr:null,error:null,decisionError:null,deciding:!1}),Ve=t=>t?.companionUpdate?.state?["preparing","installing","verifying","recovering"].includes(t.companionUpdate.state):void 0,ce=class{constructor(a,e){this.describeHost=a;this.callManagement=e}updates;nativeUpdates;value=Re();listeners=new Set;timer;reading;pairing;disposed=!1;identity="";generation=0;getSnapshot=()=>this.value;subscribe=a=>this.disposed?()=>{}:(this.listeners.add(a),this.timer||(this.refresh(),this.timer=setInterval(()=>void this.refresh(),2e3)),()=>{this.listeners.delete(a),this.listeners.size||(clearInterval(this.timer),this.timer=void 0)});patch(a){if(!this.disposed){this.value={...this.value,...a};for(let e of this.listeners)e()}}async client(){let a=await ve(this.describeHost,this.callManagement);if(this.disposed)throw new Error("disposed");let e=`${a.host.agentInstanceId??a.host.computerName}/${a.runtime.profileScope??"web"}`;return this.identity&&this.identity!==e&&(this.generation++,this.value=Re(),this.updates?.dispose(),this.updates=void 0,this.nativeUpdates?.dispose(),this.nativeUpdates=void 0),this.identity=e,a.runtime.profileScope==="desktop"&&!this.nativeUpdates&&(this.nativeUpdates=new ye(this.callManagement)),this.updates?.origin!==a.localOrigin&&(this.updates?.dispose(),this.updates=a.localOrigin?new we(a.localOrigin):void 0),this.patch({host:a.host,runtime:a.runtime,localOrigin:a.localOrigin}),a}refresh=()=>this.disposed?Promise.resolve():this.reading?this.reading:(this.reading=(async()=>{try{let a=await this.client(),e=this.generation,n={...await a.status()};if(n.companionUpdate?.state==="complete"&&!n.plugin&&(n.companionUpdate={state:"unverified",message:"当前连接服务尚未提供运行版本核验，不能确认两端已对齐。若刚安装插件，请在任务结束后退出并重新打开当前应用；无需重新配对。"}),e!==this.generation)return;let r=Ve(this.value.status),l=Ve(n);l!==void 0&&l!==r&&this.nativeUpdates?.invalidateCheck(),this.patch({status:n,runtime:n.gate??a.runtime,loadState:"ready",error:null,...this.value.qr&&this.value.qr.expiresAt<=Date.now()?{qrState:"expired",qr:null}:{}})}catch{this.patch({loadState:"error",error:"连接服务暂未就绪。请确认 DSH 正在运行，然后重试。"})}})().finally(()=>{this.reading=void 0}),this.reading);generateQr=()=>this.disposed?Promise.resolve():this.pairing?this.pairing:(this.patch({qrState:"loading",qr:null,error:null}),this.pairing=(async()=>{try{let a=await this.client(),e=this.generation,n=await a.pairCode();if(e!==this.generation)return;if(!n?.qrDataUrl?.startsWith("data:image/")||!Number.isFinite(n.expiresAt)||n.expiresAt<=Date.now())throw new Error("invalid QR");this.patch({qr:n,qrState:"ready"}),await this.refresh()}catch{this.patch({qr:null,qrState:"error",error:"暂时无法生成配对二维码，请稍后重试。"})}})().finally(()=>{this.pairing=void 0}),this.pairing);decide=async a=>{let e=this.value.status?.companionUpdate?.offerId;if(!(this.disposed||this.value.deciding||!e)){this.patch({deciding:!0,decisionError:null});try{let n=await this.client();if(this.value.status?.companionUpdate?.offerId!==e)throw new Error("stale offer");await n.decide(e,a),await this.reading,await this.refresh()}catch{this.patch({decisionError:"更新选择未确认，请刷新后核对；不要重复安装。"})}finally{this.patch({deciding:!1})}}};dispose=()=>{this.disposed=!0,this.generation++,clearInterval(this.timer),this.timer=void 0,this.listeners.clear(),this.value=Re(),this.updates?.dispose(),this.updates=void 0,this.nativeUpdates?.dispose(),this.nativeUpdates=void 0}},Le=new WeakMap;function _e(t,a){let e=Le.get(t);return e||(e=new ce(t,a),Le.set(t,e)),e}var re=ne(Z(),1),Y=require("react/jsx-runtime");function xe({describeHost:t,callManagement:a,onDismiss:e,onOpenDetails:n,compact:r=!1,store:l=_e(t,a)}){let{status:d,deciding:i,decisionError:c,error:p,loadState:y}=(0,Je.useSyncExternalStore)(l.subscribe,l.getSnapshot,l.getSnapshot),b=d?.companionUpdate,E=c||p,h=(0,Y.jsxs)("div",{children:[(0,Y.jsx)(Fe,{value:b,compact:r,deciding:i||y!=="ready",onDecide:m=>void l.decide(m)}),!b&&!E?(0,Y.jsx)("p",{className:re.default.helpText,children:y==="loading"?"正在检查同一主机的另一端…":"另一端状态未确认；不会自动更新。"}):!r&&b?.state==="idle"?(0,Y.jsx)("p",{className:re.default.helpText,children:"未发现需要联动更新的另一端。当前节点可独立使用，不会自动安装另一端或启用已停用的插件。"}):null,E?(0,Y.jsx)("p",{role:"alert",children:E}):null,e?(0,Y.jsxs)("div",{className:re.default.actions,children:[n?(0,Y.jsx)("button",{type:"button",className:re.default.primaryButton,onClick:n,children:"前往微信连接"}):null,(0,Y.jsx)("button",{type:"button",className:re.default.secondaryButton,onClick:e,children:"关闭提示（不会确认更新）"})]}):null]});return e?(0,Y.jsx)($e.Modal,{open:!0,title:"微信连接 · 联动更新",closeLabel:"关闭提示",className:re.default.pageDialog,contentClassName:re.default.pageDialogContent,onClose:e,children:h}):h}function le(t,a,e=Date.now()){return!!(a?.allowed&&a.reason==="allowed"&&Number.isSafeInteger(a.validUntil)&&a.validUntil>e&&Number.isSafeInteger(t?.checkedAt)&&Number.isSafeInteger(t?.expiresAt)&&t.checkedAt>0&&t.expiresAt>t.checkedAt&&t.expiresAt-t.checkedAt<=6e4&&t.expiresAt>e&&Math.abs(e-t.checkedAt)<=6e4)}function Ge(t){let a=t;if(!a||a.schemaVersion!==1||typeof a.nodeId!="string"||typeof a.groupEnabled!="boolean"||!Number.isSafeInteger(a.checkedAt)||!Number.isSafeInteger(a.expiresAt)||!a.features||["group_assistant","clawbot"].some(e=>{let n=a.features[e];return!n||typeof n.allowed!="boolean"||typeof n.reason!="string"||n.allowed&&(n.reason!=="allowed"||!Number.isSafeInteger(n.validUntil)||!n.validUntil||a.checkedAt<=0||a.expiresAt<=a.checkedAt||a.expiresAt-a.checkedAt>6e4)||n.message!==void 0&&typeof n.message!="string"}))throw new Error("使用资格暂不可用，请更新插件并刷新。");return a}var We=["local-plugin","relay-health","agent-connection"],Ht=Object.freeze({EAI_AGAIN:"dns",ENOTFOUND:"dns",ECONNREFUSED:"connection-refused",ECONNRESET:"connection-reset",EPIPE:"connection-reset",UND_ERR_SOCKET:"connection-reset",ENETUNREACH:"network-unreachable",EHOSTUNREACH:"network-unreachable",ENETDOWN:"network-unreachable",ETIMEDOUT:"timeout",UND_ERR_CONNECT_TIMEOUT:"timeout",UND_ERR_HEADERS_TIMEOUT:"timeout",UND_ERR_BODY_TIMEOUT:"timeout",CERT_HAS_EXPIRED:"tls-validation",CERT_NOT_YET_VALID:"tls-validation",DEPTH_ZERO_SELF_SIGNED_CERT:"tls-validation",SELF_SIGNED_CERT_IN_CHAIN:"tls-validation",UNABLE_TO_VERIFY_LEAF_SIGNATURE:"tls-validation",UNABLE_TO_GET_ISSUER_CERT:"tls-validation",UNABLE_TO_GET_ISSUER_CERT_LOCALLY:"tls-validation",CERT_UNTRUSTED:"tls-validation",CERT_REVOKED:"tls-validation",ERR_TLS_CERT_ALTNAME_INVALID:"tls-validation",ERR_TLS_CERT_SIGNATURE_ALGORITHM_UNSUPPORTED:"tls-validation"}),Ae={dns:["无法解析服务域名","请检查当前网络的域名解析，必要时联系网络管理员。"],"connection-refused":["连接被拒绝","请稍后重试，或请网络管理员检查访问策略。"],"connection-reset":["连接意外中断","请稍后重试；若持续发生，请联系网络管理员检查连接链路。"],"network-unreachable":["网络不可达","请确认电脑联网，或联系网络管理员。"],timeout:["检查超时","请确认电脑网络可用后重试；超时本身不能确定具体原因。"],"tls-validation":["安全证书无法验证","请联系网络管理员核查证书链和电脑时间；不要关闭证书验证。"],"proxy-auth-required":["代理要求认证","请联系网络管理员确认此应用的代理认证配置。"],"request-rejected":["服务拒绝了请求","请将诊断报告交给开发者；此状态不能单独判断账号、时钟或网络策略原因。"],"rate-limited":["请求过于频繁","请稍后再检查，避免连续发起检查。"],"server-error":["服务暂时异常","请稍后重试；若持续发生，请将报告交给开发者。"],"invalid-response":["返回内容不符合预期","可能收到登录页、重定向或异常内容；请将报告交给开发者。"],cancelled:["检查已取消","可在需要时重新检查。"],unknown:["暂时无法确定原因","请将诊断报告交给开发者，不必提供二维码或配对凭据。"]};function Tt(t){return t!==null&&typeof t=="object"&&!Array.isArray(t)?t:{}}function B(t,a){try{return Tt(t)[a]}catch{return}}function De(t,a,e){return typeof t=="string"&&a.includes(t)?t:e}function Xe(t){return typeof t=="string"&&t.length<=48&&/^\d{1,4}\.\d{1,4}\.\d{1,4}(?:-(?:rc|alpha|beta|preview|dev|history)(?:[.-]\d{1,8})*)?$/.test(t)?t:void 0}function It(t){if(typeof t!="string"||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(t))return;let a=Date.parse(t);return Number.isFinite(a)&&new Date(a).toISOString()===t?t:void 0}function He(t){let a=B(t,"code"),n={code:typeof a=="string"&&Object.hasOwn(Ae,a)?a:"unknown"},r=B(t,"systemCode"),l=B(t,"httpStatus");return typeof r=="string"&&Object.hasOwn(Ht,r)&&(n.systemCode=r),typeof l=="number"&&Number.isInteger(l)&&l>=100&&l<=599&&(n.httpStatus=l),n}function Bt(t){if(B(t,"schema")!==1||B(t,"source")!=="plugin")return null;let a=It(B(t,"startedAt")),e=B(t,"checks");if(!a||!Array.isArray(e)||e.length!==We.length)return null;let n=[];for(let l of We){let d=e.find(y=>B(y,"id")===l),i=B(d,"status"),c=B(d,"durationMs");if(i!=="pass"&&i!=="fail"&&i!=="not-tested"&&i!=="cancelled")return null;let p={id:l,status:i};typeof c=="number"&&Number.isFinite(c)&&(p.durationMs=Math.max(0,Math.min(2e4,Math.round(c)))),(i==="fail"||i==="cancelled")&&Object.assign(p,He(d)),n.push(p)}let r=Xe(B(t,"dshVersion"));return{schema:1,source:"plugin",startedAt:a,pluginRunningVersion:Xe(B(t,"pluginRunningVersion"))||"unknown",...r?{dshVersion:r}:{},platform:De(B(t,"platform"),["win32","darwin","linux","freebsd","openbsd","aix","sunos","unknown"],"unknown"),profileKind:De(B(t,"profileKind"),["desktop","web","unknown"],"unknown"),relayEnabled:B(t,"relayEnabled")===!0,relayState:De(B(t,"relayState"),["disabled","enrolling","connecting","online","offline","unknown"],"unknown"),checks:n}}function Te(t){try{return Bt(t)}catch{return null}}function Ke(t){return Ae[He({code:t}).code][0]}function Ye(t){return Ae[He({code:t}).code][1]}function Qe(t){return t==="local-plugin"?"本地插件服务":t==="relay-health"?"公网 HTTPS 基础检查":t==="agent-connection"?"当前业务连接（仅观察状态）":"未知检查"}function Ze(t){let a=Te(t);return a?JSON.stringify(a,null,2):"诊断报告不可用"}var et=()=>({diagnosticState:"idle",diagnosticReport:null}),Ce=class{constructor(a,e){this.describeHost=a;this.callManagement=e}value=et();listeners=new Set;active;disposed=!1;getSnapshot=()=>this.value;subscribe=a=>this.disposed?()=>{}:(this.listeners.add(a),()=>{this.listeners.delete(a),this.listeners.size||this.reset()});publish(a){if(!this.disposed){this.value=a;for(let e of this.listeners)try{e()}catch{}}}diagnose=()=>{if(this.disposed)return Promise.resolve();if(this.active)return this.active.promise;let a=new AbortController,e={controller:a,promise:Promise.resolve()};return this.active=e,e.promise=Promise.resolve().then(async()=>{try{if(a.signal.aborted)return;let n=await ve(this.describeHost,this.callManagement);if(this.active!==e)return;let r=await n.diagnose(a.signal);if(this.active!==e)return;let l=Te(r);if(!l)throw new Error("invalid diagnostic report");this.publish({diagnosticState:"ready",diagnosticReport:l})}catch(n){if(this.active!==e)return;let r=B(n,"code");this.publish({diagnosticState:typeof r=="string"&&["diagnostic-unsupported","diagnostic/unsupported","pairing/not-found","endpoint-not-found","not-found","not_found","unknown-endpoint","unimplemented"].includes(r)?"unsupported":"error",diagnosticReport:null})}}).finally(()=>{this.active===e&&(this.active=void 0)}),this.publish({diagnosticState:"running",diagnosticReport:null}),e.promise};cancel=(a=!1)=>{let e=this.active;if(!(!e&&(!a||this.value.diagnosticState==="idle"&&!this.value.diagnosticReport))){this.active=void 0;try{e?.controller.abort()}catch{}this.publish({diagnosticState:a?"idle":"cancelled",diagnosticReport:null})}};reset=()=>{this.cancel(!0)};dispose=()=>{this.disposed=!0,this.listeners.clear(),this.reset(),this.value=et()}};var pe=require("react"),tt=ne(Z(),1),Q=require("react/jsx-runtime");function at({wide:t,openPlugin:a}){let[e,n]=(0,pe.useState)(!1),[r,l]=(0,pe.useState)(!1),d=(0,pe.useRef)(!1),i=async()=>{if(!d.current){d.current=!0,l(!0);try{await a()||n(!0)}finally{d.current=!1,l(!1)}}};return(0,Q.jsxs)(Q.Fragment,{children:[(0,Q.jsxs)("button",{type:"button",className:tt.default.sidebarButton,"data-wide":t,title:"微信连接","aria-label":"微信连接",disabled:r,onClick:()=>void i(),children:[(0,Q.jsxs)("svg",{width:"20",height:"20",viewBox:"0 0 24 24",fill:"none",stroke:"currentColor",strokeWidth:"1.7","aria-hidden":"true",children:[(0,Q.jsx)("path",{d:"M20 11.5a8 8 0 0 1-8 8 9 9 0 0 1-3.5-.7L4 20l1.2-4.2A7.8 7.8 0 0 1 4 11.5a8 8 0 0 1 16 0Z"}),(0,Q.jsx)("path",{d:"M8 11.5h.01M12 11.5h.01M16 11.5h.01",strokeWidth:"2.5",strokeLinecap:"round"})]}),t?(0,Q.jsx)("span",{children:r?"正在打开…":"微信连接"}):null]}),e?(0,Q.jsx)("small",{role:"status",children:"插件详情暂不可用，请打开「设置 → 微信连接」。"}):null]})}async function nt(t){try{let a=t("pluginNavigation"),e=t("remote.pluginManager");if(typeof a?.openBundle!="function"||typeof e?.listBundles!="function")return!1;let n=await e.listBundles();if(!n.ok||!Array.isArray(n.value))return!1;let r=n.value.filter(d=>d.enabled&&["dsh-wechat-remote","@harness-remote/dsh-wechat-remote"].includes(d.name));if(r.length!==1)return!1;let l=t("pluginNavigation");return l!==a||typeof l.openBundle!="function"?!1:(l.openBundle(r[0].name),!0)}catch{return!1}}var ke=require("react"),ht=require("@deepseek-ai/dsh-client-ui-primitives"),P=ne(Z(),1);var rt=require("react"),j=ne(Z(),1),g=require("react/jsx-runtime");function st({store:t,embedded:a=!1}){let{check:e,checking:n,progress:r,error:l,copied:d,resumeFailed:i}=(0,rt.useSyncExternalStore)(t.subscribe,t.getSnapshot,t.getSnapshot),c=!!(r&&!r.terminal),p=c||r?.phase==="unknown"||e?.mode==="busy";return(0,g.jsxs)("div",{className:a?j.default.updateEndpoint:j.default.updateCard,children:[(0,g.jsxs)("div",{className:j.default.updateRow,children:[(0,g.jsxs)("div",{className:j.default.updateCopy,children:[(0,g.jsxs)("strong",{children:["Web ",(0,g.jsx)("span",{className:j.default.updateScope,children:"当前端"})]}),e?(0,g.jsxs)("div",{className:j.default.updateVersions,children:[(0,g.jsxs)("span",{children:["DSH ",(0,g.jsx)("strong",{children:e.advice.current.agentVersion||"未确认"})]}),(0,g.jsxs)("span",{children:["插件运行 ",(0,g.jsx)("strong",{children:e.advice.current.pluginVersion||"未确认"})]}),e.channel==="preview"?(0,g.jsx)("span",{children:"预览通道"}):null]}):null]}),(0,g.jsxs)("div",{className:j.default.updateControl,children:[(0,g.jsx)("button",{type:"button",className:j.default.secondaryButton,disabled:n||c,onClick:()=>void t.refresh(),children:n?"检查中…":"检查更新"}),e&&!n?(0,g.jsx)("strong",{className:j.default.updateLabel,"data-severity":p?"unknown":e.advice.severity,role:"status",children:c?"正在更新 Web 插件":p?"更新状态待核对":e.advice.label}):null,e?.advice.checkedAt&&e.advice.severity!=="unknown"?(0,g.jsxs)("small",{className:j.default.updateChecked,children:["检查于 ",new Date(e.advice.checkedAt).toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"})]}):null]})]}),e?(0,g.jsx)(g.Fragment,{children:n?null:(0,g.jsxs)(g.Fragment,{children:[!p&&e.advice.targetVersion?(0,g.jsxs)("p",{children:["可更新至 ",e.advice.targetVersion,e.mode==="manual"?" · 需手动更新":""]}):null,!p&&(e.advice.severity==="unknown"||e.advice.severity==="required"||e.mode==="manual")?(0,g.jsxs)("details",{children:[(0,g.jsx)("summary",{children:e.mode==="manual"?"手动更新说明":"查看说明"}),e.reason?(0,g.jsx)("p",{children:e.reason}):null,(0,g.jsx)("p",{children:e.advice.message})]}):null,!p&&e.mode==="manual"&&e.manualCommand?(0,g.jsxs)("div",{className:j.default.updateCommand,children:[(0,g.jsx)("code",{children:e.manualCommand}),(0,g.jsx)("button",{type:"button",className:j.default.secondaryButton,disabled:c,onClick:()=>void t.copyCommand(),children:d?"已复制":"复制命令"})]}):null,!p&&e.canInstall?(0,g.jsxs)(g.Fragment,{children:[(0,g.jsx)("div",{className:j.default.updateActions,children:(0,g.jsx)("button",{type:"button",className:j.default.primaryButton,disabled:c||!!l,onClick:()=>void t.install(),children:"更新 Web 并重启"})}),(0,g.jsx)("small",{className:j.default.updateChecked,children:"仅更新 Web，保留配对与会话；连接会短暂中断。"})]}):null]})}):null,l?(0,g.jsx)("p",{role:"alert",children:l}):null,r?(0,g.jsxs)("div",{role:"status","aria-live":"polite",children:[!r.terminal||r.ok===!0?(0,g.jsx)("progress",{className:j.default.updateProgress,max:100,value:r.progress}):null,(0,g.jsx)("p",{children:r.message}),i?(0,g.jsx)("p",{role:"alert",children:"插件已完成更新，但未能自动打开 WebUI。请使用 DSH 启动时显示的地址打开，无需重复更新。"}):null]}):null]})}var it=require("react"),z=ne(Z(),1),x=require("react/jsx-runtime");function ot({store:t,embedded:a=!1}){let{check:e,status:n,checking:r,starting:l,error:d}=(0,it.useSyncExternalStore)(t.subscribe,t.getSnapshot,t.getSnapshot),i=l||n?.phase==="preparing"||n?.phase==="installing",c=n&&["preparing","installing","restart-required","unknown"].includes(n.phase),p=n?.phase==="restart-required"||n?.phase==="complete",y=n?.phase==="restart-required"?"已安装，待重新打开 Desktop":n?.phase==="unknown"?"更新结果待核对":n?.phase==="failed"?"更新未完成":i?"正在更新 Desktop 插件":n?.phase==="complete"?"更新已生效":"";return(0,x.jsxs)("div",{className:a?z.default.updateEndpoint:z.default.updateCard,children:[(0,x.jsxs)("div",{className:z.default.updateRow,children:[(0,x.jsxs)("div",{className:z.default.updateCopy,children:[(0,x.jsxs)("strong",{children:["Desktop ",(0,x.jsx)("span",{className:z.default.updateScope,children:"当前端"})]}),e?(0,x.jsxs)("div",{className:z.default.updateVersions,children:[(0,x.jsxs)("span",{children:["DSH ",(0,x.jsx)("strong",{children:e.advice.current.agentVersion||"未确认"})]}),(0,x.jsxs)("span",{children:["插件运行 ",(0,x.jsx)("strong",{children:e.advice.current.pluginVersion||"未确认"})]}),p&&n.targetVersion&&n.targetVersion!==e.advice.current.pluginVersion?(0,x.jsxs)("span",{children:["已安装 ",(0,x.jsx)("strong",{children:n.targetVersion})]}):null,e.channel==="preview"?(0,x.jsx)("span",{children:"预览通道"}):null]}):null]}),(0,x.jsxs)("div",{className:z.default.updateControl,children:[(0,x.jsx)("button",{type:"button",className:z.default.secondaryButton,disabled:r||i,onClick:()=>void t.refresh(),children:r?"检查中…":"检查更新"}),e?(0,x.jsx)("strong",{className:z.default.updateLabel,"data-severity":n?.phase==="failed"?"required":n?.phase==="complete"?"none":c?n?.phase==="unknown"?"unknown":"info":e.advice.severity,children:y||e.advice.label}):null,e?.advice.checkedAt?(0,x.jsxs)("small",{className:z.default.updateChecked,children:["检查于 ",new Date(e.advice.checkedAt).toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"})]}):null]})]}),e?(0,x.jsxs)(x.Fragment,{children:[!p&&!c&&e.advice.targetVersion?(0,x.jsxs)("p",{children:["可更新至 ",e.advice.targetVersion]}):null,!c&&e.reason?(0,x.jsx)("p",{children:e.reason}):null,!c&&e.canInstall?(0,x.jsxs)(x.Fragment,{children:[(0,x.jsx)("div",{className:z.default.updateActions,children:(0,x.jsx)("button",{type:"button",className:z.default.primaryButton,disabled:i||r,onClick:()=>void t.install(),children:"更新 Desktop 插件"})}),(0,x.jsx)("small",{className:z.default.updateChecked,children:"仅更新 Desktop，保留配对与会话；完成后需退出并重新打开。"})]}):null]}):null,n?.phase!=="idle"&&n?(0,x.jsxs)("div",{role:"status","aria-live":"polite",children:[i?(0,x.jsx)("progress",{className:z.default.updateProgress,"aria-label":"Desktop 插件更新中"}):null,n.phase==="restart-required"?(0,x.jsx)("p",{className:z.default.updatePeerNote,children:"任务结束后，选择「应用 → 退出」再打开 Desktop；无需重新配对，Web 不受影响。"}):n.phase!=="complete"?(0,x.jsx)("p",{children:n.message}):null]}):null,d?(0,x.jsx)("p",{role:"alert",children:d}):null]})}var F=require("react");var _=ne(Z(),1),o=require("react/jsx-runtime"),ue=t=>t.state==="installed"&&(t.nativeState===void 0||t.nativeState==="installed"),Ut=t=>ue(t)?"已安装":t.state==="draft"?"待安装":t.nativeState==="uninstalled"?"未安装":t.nativeState==="disabled"?"已停用":t.state==="pending-restart"?"待重启":"待核对",Ie=t=>t.templateId==="designer"||t.id==="designer"?"定制我的助手":t.name;function lt({label:t,children:a}){let e=(0,F.useId)();return(0,o.jsxs)("span",{className:_.default.assistantHelpAnchor,children:[(0,o.jsx)("button",{type:"button",className:_.default.assistantHelpButton,"aria-label":t,"aria-describedby":e,children:"?"}),(0,o.jsx)("span",{id:e,className:_.default.assistantTooltip,role:"tooltip",children:a})]})}function dt({store:t,featureCall:a}){let{catalog:e,preview:n,busy:r,message:l,error:d}=(0,F.useSyncExternalStore)(t.subscribe,t.getSnapshot,t.getSnapshot),i=(0,F.useRef)(),[c,p]=(0,F.useState)(),[y,b]=(0,F.useState)(""),[E,h]=(0,F.useState)(!1),m=(0,F.useRef)(!1),k=(0,F.useRef)(0),N=async s=>{if(!a||m.current)return;m.current=!0;let R=k.current;h(!0);try{let H=await a(s===void 0?{action:"status"}:{action:"group.enabled",enabled:s});if(R!==k.current)return;p(H),b(""),s!==void 0&&t.load()}catch(H){R===k.current&&(p(void 0),b(H instanceof Error?H.message:"暂时无法核对资格。"))}finally{R===k.current&&(m.current=!1,h(!1))}};(0,F.useEffect)(()=>{k.current++,m.current=!1,p(void 0),N();let s=setInterval(()=>void N(),15e3);return()=>{k.current++,m.current=!1,clearInterval(s)}},[a]);let M=c?.features.group_assistant,L=le(c,M),D=L&&c?.groupEnabled===!0;(0,F.useEffect)(()=>{let s=new AbortController;return i.current=s,t.load(),()=>s.abort()},[t]);let O=e?.drafts||[],J=O.filter(s=>ue(s)&&!s.replacement),$=O.filter(s=>s.state==="draft"),te=O.filter(s=>s.source!=="builtin"&&s.state!=="draft"&&(!ue(s)||s.replacement)),X=e?.templates||[],K=s=>J.find(R=>R.templateId===s),I=s=>void t.start(s.presetId,i.current?.signal),ie=s=>s.id==="designer"||s.templateId==="designer"?"先打开定制会话，说清职业和工作习惯；助手会设计可复用的模式。确认安装后，再用新模式开启工作会话。不会自动安装或发送消息。":`先选工作区，再用「${s.name}」开始空白会话。手机连接此电脑后可继续该会话；发卡与提醒需在小程序设置中开启「微信群协作助手」。`,A=s=>{let R=K(s.id),H=s.builtin,fe=O.find(oe=>oe.templateId===s.id&&oe.source==="builtin");return(0,o.jsxs)("article",{className:_.default.assistantChoice,"data-installed":!!R,children:[(0,o.jsxs)("div",{className:_.default.assistantChoiceCopy,children:[(0,o.jsxs)("div",{className:_.default.assistantChoiceHead,children:[(0,o.jsx)("strong",{children:Ie(s)}),(0,o.jsx)(lt,{label:`${Ie(s)}使用说明`,children:ie(s)})]}),(0,o.jsx)("p",{children:s.id==="designer"?"用对话设计适合自己职业的助手模式":s.description})]}),!R&&H?(0,o.jsx)("span",{className:_.default.assistantUnavailable,title:fe?.reason||H.reason,children:fe?.nativeState==="disabled"?"已停用":"待就绪"}):null,(0,o.jsx)("button",{type:"button",className:_.default.secondaryButton,disabled:r||!!(H&&!R),onClick:()=>R?I(R):H?void t.load():void t.choose(s.id),children:R?s.id==="designer"?"开始定制":"开始使用":H?"开始使用":"安装"})]},s.id)},U=s=>(0,o.jsxs)("div",{className:_.default.assistantEntry,children:[(0,o.jsxs)("div",{className:_.default.assistantEntryHead,children:[(0,o.jsx)("strong",{children:Ie(s)}),(0,o.jsx)("span",{children:Ut(s)})]}),s.replacement?(0,o.jsxs)("div",{children:[(0,o.jsxs)("p",{children:["已提供内置「",s.replacement.name,"」，无需再装同款独立包。"]}),(0,o.jsx)("p",{children:s.replacement.warning}),s.replacement.canRemoveAfterReview?(0,o.jsxs)("p",{children:["核对旧会话后，可在 DSH 插件列表卸载：",(0,o.jsx)("code",{children:s.replacement.bundleName})]}):null]}):null,ue(s)?(0,o.jsx)("button",{type:"button",className:_.default.assistantSecondary,disabled:r,onClick:()=>I(s),children:"开始使用"}):s.state==="draft"?(0,o.jsx)("button",{type:"button",className:_.default.assistantPrimary,disabled:r,onClick:()=>void t.preview(s.id,s.version),children:"查看并安装"}):(0,o.jsxs)(o.Fragment,{children:[(0,o.jsx)("button",{type:"button",className:_.default.assistantSecondary,disabled:r,onClick:()=>void t.verify(s.id,s.version),children:"刷新状态"}),s.nativeState==="uninstalled"&&!s.replacement?(0,o.jsx)("button",{type:"button",className:_.default.assistantSecondary,disabled:r,onClick:()=>void t.reinstall(s.id,s.version),children:"查看并重新安装"}):null]}),!ue(s)&&s.reason?(0,o.jsxs)("details",{className:_.default.assistantDetails,children:[(0,o.jsx)("summary",{children:"状态说明"}),(0,o.jsx)("p",{children:s.reason})]}):null]},`${s.id}:${s.version}`);return(0,o.jsxs)("section",{className:_.default.assistantsCard,"aria-label":"微信群协作助手","aria-busy":r,children:[(0,o.jsxs)("div",{className:_.default.assistantsHeading,children:[(0,o.jsxs)("div",{className:_.default.assistantChoiceHead,children:[(0,o.jsx)("h3",{children:"微信群协作助手"}),(0,o.jsx)(lt,{label:"电脑助手与手机群协作",children:"需要群协作资格、有效公网访问和剩余流量。开启本节点助手后，再在小程序设置中开启手机入口。暂停不删除资料，不取消 DSH 已开始的任务。"})]}),(0,o.jsx)("button",{type:"button",className:_.default.assistantTextButton,disabled:r||E,onClick:()=>{N(),t.load()},children:r||E?"读取中…":"刷新"})]}),(0,o.jsxs)("div",{className:_.default.clawbotReceiveRow,children:[(0,o.jsxs)("div",{children:[(0,o.jsx)("strong",{children:"启用本节点助手"}),(0,o.jsx)("p",{className:_.default.clawbotNote,role:"status",children:y||(L?c?.groupEnabled?"已开启":"有使用资格，尚未开启":M?.message||"请联网核对资格，在小程序设置中兑换体验码。")})]}),(0,o.jsxs)("label",{className:_.default.clawbotToggle,children:[(0,o.jsx)("input",{type:"checkbox",role:"switch","aria-label":"启用本节点助手",checked:c?.groupEnabled||!1,disabled:E||!a||!L&&!c?.groupEnabled,onChange:s=>void N(s.target.checked)}),(0,o.jsx)("span",{className:_.default.clawbotSwitchTrack,"aria-hidden":!0})]})]}),(0,o.jsxs)("fieldset",{className:_.default.assistantFeatureBody,disabled:!D||E,"aria-label":"助手功能",children:[!e&&!d?(0,o.jsx)("p",{role:"status",children:"正在读取当前电脑的助手…"}):null,e&&!e.native?.supported?(0,o.jsx)("p",{role:"status",children:e.native?.reason||"当前 DSH 暂不支持安装助手，请先检查版本。"}):null,e&&(e.native?.supported||X.some(s=>s.builtin))?(0,o.jsxs)(o.Fragment,{children:[(0,o.jsx)("div",{className:_.default.assistantChoices,children:X.filter(s=>["teacher","project"].includes(s.id)).map(A)}),X.some(s=>s.id==="designer")?(0,o.jsx)("div",{className:_.default.assistantCustomize,children:X.filter(s=>s.id==="designer").map(A)}):null]}):null,n?(0,o.jsxs)("div",{className:_.default.assistantPreview,"aria-label":"安装助手预览",children:[(0,o.jsxs)("h4",{children:["安装「",n.definition.name,"」"]}),(0,o.jsx)("p",{children:n.definition.description}),(0,o.jsx)("p",{children:"新增一个可选的助手模式，不改默认模式、已有会话和资料。"}),(0,o.jsxs)("details",{className:_.default.assistantDetails,children:[(0,o.jsx)("summary",{children:"查看工作方式与安装详情"}),(0,o.jsx)("p",{children:n.definition.role}),(0,o.jsx)("ul",{children:n.definition.methods.map((s,R)=>(0,o.jsx)("li",{children:s},R))}),(0,o.jsx)("p",{children:"助手会逐步了解："}),(0,o.jsx)("ul",{children:n.definition.onboarding.map(s=>(0,o.jsxs)("li",{children:[s.label,"：",s.prompt]},s.key))}),(0,o.jsxs)("small",{children:["第 ",n.version," 版 · 内容摘要 ",n.digest.slice(0,12)," · 基础模式 ",n.native.basePreset]}),(0,o.jsx)("ul",{children:(n.native.warnings||[]).map((s,R)=>(0,o.jsx)("li",{children:s},R))})]}),(0,o.jsxs)("div",{className:_.default.assistantButtons,children:[(0,o.jsx)("button",{type:"button",className:_.default.assistantPrimary,disabled:r,onClick:()=>void t.install(),children:"确认安装"}),(0,o.jsx)("button",{type:"button",className:_.default.assistantSecondary,disabled:r,onClick:()=>t.dismissPreview(),children:"暂不安装"})]})]}):null,$.length?(0,o.jsxs)("div",{children:[(0,o.jsx)("h4",{children:"待安装的助手"}),$.map(U)]}):null,J.some(s=>!["teacher","project","designer"].includes(s.templateId))?(0,o.jsxs)("div",{children:[(0,o.jsx)("h4",{children:"我已安装的其他助手"}),J.filter(s=>!["teacher","project","designer"].includes(s.templateId)).map(U)]}):null,te.length||X.some(s=>!["teacher","project","designer"].includes(s.id))?(0,o.jsxs)("details",{className:_.default.assistantDetails,children:[(0,o.jsx)("summary",{children:"更多助手与安装记录"}),e?.native?.supported?(0,o.jsx)("div",{className:_.default.assistantChoices,children:X.filter(s=>!["teacher","project","designer"].includes(s.id)).map(A)}):null,te.length?(0,o.jsxs)("details",{className:_.default.assistantDetails,children:[(0,o.jsxs)("summary",{children:["以前安装的助手（",te.length,"）"]}),(0,o.jsx)("p",{children:"旧会话可能仍在使用旧模式；卸载前请核对，聊天与资料不会在这里删除。"}),te.map(U)]}):null]}):null,l?(0,o.jsx)("p",{role:"status",children:l}):null,d?(0,o.jsx)("p",{role:"alert",children:d}):null]})]})}var T=require("react");var v=ne(Z(),1),u=require("react/jsx-runtime"),ct={wait:"打开微信首页「＋ → 扫一扫」",scaned:"已扫码，请在微信中确认",need_verifycode:"请输入微信显示的验证码",expired:"绑定码已过期",verify_code_blocked:"验证码暂不可用，请稍后重新绑定",scaned_but_redirect:"请按微信提示继续确认",binded_redirect:"微信已有连接，请核对原节点"},pt=(t,a)=>!!(t&&["wait","scaned","scaned_but_redirect","need_verifycode"].includes(t.status)&&(t.expiresAt===void 0||t.expiresAt>a)),jt=new Set(["正在继续微信确认流程","请用手机微信扫描二维码并确认连接","请继续完成手机微信中的确认","请输入手机微信显示的数字验证码","二维码已过期，请重新生成。","请用微信扫一扫扫描电脑上的二维码，并在微信中确认。","已暂停接入；DSH 中已经开始的任务不会被取消。","微信已绑定。选择目标会话并开启接入后，即可在 ClawBot 私聊。","微信确认本节点已有绑定。选择会话并开启接入后即可使用。","原微信连接已失效，请重新绑定。","微信连接已失效，请重新绑定。","已移除此节点的本地绑定。未完成的渠道消息已停止续发；电脑上已开始的任务仍会继续。这不是腾讯账号端的撤销授权。"]),zt=new Set(["有回复发送结果不确定，未自动重发；完整结果仍在原 DSH 会话。","有上次中断的处理或发送，未自动重试，请在原会话核对。"]);function ut({call:t,nodeName:a,hostName:e}){let[n,r]=(0,T.useState)(),[l,d]=(0,T.useState)([]),[i,c]=(0,T.useState)(""),[p,y]=(0,T.useState)(!1),[b,E]=(0,T.useState)(""),[h,m]=(0,T.useState)(""),[k,N]=(0,T.useState)(Date.now),[M,L]=(0,T.useState)(!1),D=(0,T.useRef)(n);D.current=n;let O=(0,T.useRef)(!1),J=(0,T.useRef)(!1),$=(0,T.useRef)(null),te=(0,T.useRef)(null),X=(0,T.useRef)(null),K=(0,T.useRef)(0),I=async(w,q=!1,G=!1)=>{if((["login.start","login.poll","route"].includes(w.action)||w.action==="enabled"&&w.enabled)&&!le(D.current?.access,D.current?.access))return;let he=w.action==="login.poll"?te:X;if($.current&&!(w.action==="login.cancel"&&$.current.action==="login.poll")||q&&he.current)return;let ge={};q?he.current=ge:($.current={action:w.action,token:ge},K.current++);let be=K.current;q||(y(!0),E(""));try{let de=w;if(G){let ae=await t({action:"enabled",enabled:!1,expectedRevision:w.expectedRevision});if(!J.current||be!==K.current)return;if("sessions"in ae||ae.enabled||ae.revision<=(w.expectedRevision??-1)||D.current&&ae.revision<D.current.revision)throw new Error("状态已变化，请刷新后重试。");D.current=ae,r(ae),de={...w,expectedRevision:ae.revision}}let se=await t(de);if(!J.current||be!==K.current)return;if("sessions"in se)d(se.sessions);else{if(D.current&&se.revision<D.current.revision)return;let ae=D.current;D.current=se,r(se),E(""),ae?.pairing?.id!==se.pairing?.id&&m(""),(!O.current||w.action==="route")&&(O.current=!1,c(se.target?.id||""))}}catch(de){J.current&&be===K.current&&(w.action!=="login.poll"||D.current?.pairing?.id===w.loginId)&&E(de instanceof Error?de.message:"暂时无法读取状态")}finally{q?he.current===ge&&(he.current=null):$.current?.token===ge&&($.current=null,J.current&&be===K.current&&y(!1))}};(0,T.useEffect)(()=>{J.current=!0,D.current=void 0,O.current=!1,r(void 0),d([]),c(""),m(""),E(""),L(!1),I({action:"status"});let w=setInterval(()=>{let q=Date.now();N(q);let G=D.current?.pairing;le(D.current?.access,D.current?.access,q)&&G&&pt(G,q)&&G.status!=="need_verifycode"&&I({action:"login.poll",loginId:G.id},!0),I({action:"status"},!0)},4e3);return()=>{J.current=!1,K.current++,$.current=null,te.current=null,X.current=null,clearInterval(w)}},[t]);let ie=async()=>{await I({action:"status"}),await I({action:"sessions"})},A=n?.pairing,U=pt(A,k),s=n?.bindingState==="expired",R=!!(n?.paired&&!s),H=le(n?.access,n?.access,k),fe=!!(H&&(n?.supportsEnableBeforeSetup||R&&n?.target&&!U)),oe=n&&!H?n.access?.message||"暂时无法核对使用资格":"",mt=!!(n?.uncertain&&zt.has(n.message)),Ne=(n?.message&&!jt.has(n.message)&&!mt?n.message:"")||(n?.enabled&&n.state==="error"&&!s?"连接异常，请刷新后重试。":""),vt=n?U?A?.status==="wait"?"等待扫码":A?.status==="need_verifycode"?"等待确认码":"等待微信确认":s?"绑定已失效":R?"已绑定此节点":"未绑定":"读取中",wt=!!(A&&(U||!R)),yt=A&&(!U&&A.expiresAt!==void 0&&A.expiresAt<=k?ct.expired:ct[A.status]||"请重新显示绑定码"),Ee=new Map;for(let w of l){let q=w.workspaceId||"",G=Ee.get(q)||{title:w.workspaceTitle||"未分组",sessions:[]};G.sessions.push(w),Ee.set(q,G)}let _t=w=>!w.title||/^(未命名|新会话|New chat|Untitled)$/i.test(w.title)?`${w.title||"未命名"} · ${w.id.slice(-8)}`:w.title,Pe=()=>{!n||!H||U||n.paired&&!window.confirm((n.enabled?"将先暂停私聊接入，再重新绑定当前节点。":"重新绑定当前节点？")+`
微信可能提示替换已有连接，请核对后确认。完成后需手动开启接收。`)||I({action:"login.start",expectedRevision:n.revision},!1,n.paired&&n.enabled)},xt=()=>{n?.paired&&window.confirm((n.enabled?"将先暂停私聊接入，再移除此节点的绑定。":"移除此节点的绑定？")+`
不会删除会话，也不会解除微信端的授权。`+(n.pending?`
未完成的微信消息将停止处理和发送；电脑上已开始的任务仍会继续，请到原会话查看。`:""))&&I({action:"disconnect",expectedRevision:n.revision,abandonPending:n.pending>0},!1,n.enabled)};return(0,u.jsxs)("section",{className:`${v.default.updateCard} ${v.default.clawbotCard}`,"aria-label":"微信 ClawBot 私聊接线",children:[(0,u.jsxs)("div",{className:v.default.clawbotHead,children:[(0,u.jsxs)("h3",{className:v.default.updateHeading,children:[(0,u.jsx)("span",{className:v.default.clawbotMark,"aria-hidden":!0}),"微信 ClawBot 私聊接线 ",(0,u.jsx)("small",{children:"实验性"})]}),(0,u.jsxs)("div",{className:v.default.clawbotHeadActions,children:[(0,u.jsxs)("button",{type:"button","aria-label":"刷新",className:v.default.clawbotTextButton,disabled:p,onClick:()=>void ie(),children:[(0,u.jsx)("span",{"aria-hidden":!0,children:"↻ "}),"刷新"]}),(0,u.jsxs)("label",{className:v.default.clawbotToggle,title:"开启或暂停当前节点的 ClawBot 私聊接线",children:[(0,u.jsx)("input",{type:"checkbox",role:"switch","aria-label":"启用当前节点的 ClawBot 私聊接线",checked:n?.enabled||!1,disabled:!n||p||!n.enabled&&!fe,onChange:w=>void I({action:"enabled",enabled:w.target.checked,expectedRevision:n?.revision})}),(0,u.jsx)("span",{className:v.default.clawbotSwitchTrack,"aria-hidden":!0})]})]})]}),(0,u.jsxs)("p",{className:v.default.clawbotNode,children:["当前节点：",a||"读取中",e?" · "+e:""]}),(0,u.jsxs)("div",{className:v.default.clawbotSection,"aria-label":"节点绑定",children:[(0,u.jsxs)("div",{className:v.default.clawbotRow,children:[(0,u.jsx)("strong",{children:"节点绑定"}),(0,u.jsxs)("div",{className:v.default.clawbotHeadActions,children:[(0,u.jsx)("span",{className:v.default.clawbotStatus,"data-state":U?"pending":s?"expired":R?"paired":"unpaired",role:"status",children:vt}),n?.paired&&!U?(0,u.jsx)("button",{type:"button",className:v.default.clawbotTextButton,"aria-label":"绑定管理","aria-expanded":M,onClick:()=>L(!M),children:"管理"}):null]})]}),n?.paired&&!U&&M?(0,u.jsxs)("div",{className:v.default.clawbotActions,"aria-label":"绑定管理操作",children:[s?null:(0,u.jsx)("button",{type:"button",className:v.default.secondaryButton,disabled:!H||p,onClick:Pe,children:"重新绑定"}),(0,u.jsx)("button",{type:"button",className:v.default.clawbotTextButton,disabled:p,onClick:xt,children:"移除绑定"})]}):null,wt&&A?(0,u.jsxs)("div",{className:v.default.clawbotPairing,children:[U&&A.status==="wait"?(0,u.jsx)("img",{src:A.qrDataUrl,width:"180",height:"180",alt:"微信 ClawBot 节点绑定码"}):null,(0,u.jsxs)("div",{className:v.default.clawbotPairingCopy,children:[(0,u.jsx)("strong",{role:"status",children:yt}),U&&A.status==="wait"?(0,u.jsx)("p",{className:v.default.clawbotNote,children:"用微信首页扫一扫扫描此码，再确认绑定。此码不是小程序配对码。"}):null,U&&A.status==="need_verifycode"?(0,u.jsxs)("form",{onSubmit:w=>{w.preventDefault(),I({action:"login.poll",loginId:A.id,verifyCode:h}),m("")},children:[(0,u.jsx)("input",{"aria-label":"微信验证码",value:h,autoComplete:"off",inputMode:"numeric",maxLength:16,onChange:w=>m(w.target.value)}),(0,u.jsx)("button",{type:"submit",className:v.default.primaryButton,disabled:!H||p||!/^\d{1,16}$/.test(h),children:"确认验证码"})]}):null,(0,u.jsxs)("div",{className:v.default.clawbotActions,children:[U?null:(0,u.jsx)("button",{type:"button",className:v.default.primaryButton,disabled:!H||p,onClick:Pe,children:s?"重新绑定":"重新显示绑定码"}),U?(0,u.jsx)("button",{type:"button",className:v.default.clawbotTextButton,disabled:p&&$.current?.action!=="login.poll",onClick:()=>void I({action:"login.cancel",loginId:A.id}),children:"取消绑定"}):null]})]})]}):R?null:(0,u.jsxs)("div",{className:v.default.clawbotPairingEntry,children:[(0,u.jsx)("p",{className:v.default.clawbotNote,children:"用微信首页「＋ → 扫一扫」扫描此处的 ClawBot 绑定码。"}),(0,u.jsx)("button",{type:"button",className:v.default.primaryButton,disabled:!n||!H||p,onClick:Pe,children:s?"重新绑定":"显示绑定码"})]})]}),(0,u.jsxs)("div",{className:v.default.clawbotSection,"aria-label":"微信消息",children:[(0,u.jsx)("div",{className:v.default.clawbotRow,children:(0,u.jsx)("strong",{children:"接入会话"})}),(0,u.jsxs)("div",{className:v.default.clawbotRow,children:[(0,u.jsxs)("select",{"aria-label":"ClawBot 目标会话",value:i,disabled:!n||p&&$.current?.action!=="sessions",onFocus:()=>void I({action:"sessions"}),onChange:w=>{O.current=!0,c(w.target.value)},children:[(0,u.jsx)("option",{value:"",children:"请选择接入会话"}),n?.target&&!l.some(w=>w.id===n.target.id)?(0,u.jsx)("option",{value:n.target.id,children:n.target.title}):null,[...Ee].map(([w,q])=>(0,u.jsx)("optgroup",{label:q.title,children:q.sessions.map(G=>(0,u.jsx)("option",{value:G.id,children:_t(G)},G.id))},w))]}),(0,u.jsx)("button",{type:"button",className:v.default.secondaryButton,disabled:!H||!i||!n||p||i===n.target?.id,onClick:()=>void I({action:"route",sessionId:i,expectedRevision:n?.revision}),children:"接到此会话"})]})]}),oe&&oe!==Ne?(0,u.jsx)("p",{className:v.default.clawbotNote,role:"status",children:oe}):null,Ne?(0,u.jsx)("p",{className:v.default.clawbotNote,role:"status",children:Ne}):null,n?.uncertain?(0,u.jsxs)("details",{className:v.default.clawbotHistory,children:[(0,u.jsxs)("summary",{children:["消息记录（",n.uncertain,"）"]}),(0,u.jsx)("p",{className:v.default.clawbotNote,children:"历史消息的处理或回复送达结果未确认，未自动重复执行或发送。请核对当时的 DSH 会话和微信记录；不影响新消息。"})]}):null,b?(0,u.jsx)("p",{className:v.default.clawbotError,role:"alert",children:b}):null]})}var ee=require("react"),V=ne(Z(),1);var C=require("react/jsx-runtime"),Mt={pass:"通过",fail:"失败","not-tested":"未检测",cancelled:"已取消"},Be=class extends ee.Component{state={failed:!1};static getDerivedStateFromError(){return{failed:!0}}render(){return this.state.failed?(0,C.jsx)("p",{role:"status",children:"连接帮助暂不可用，其他功能可继续使用。"}):this.props.children}};function ft({store:t}){let[a,e]=(0,ee.useState)(!1);return(0,C.jsxs)("details",{className:V.default.updateDetails,onToggle:n=>e(n.currentTarget.open),children:[(0,C.jsx)("summary",{children:"连接帮助"}),a?(0,C.jsx)(Be,{children:(0,C.jsx)(Ot,{store:t})}):null]})}function Ot({store:t}){let a=(0,ee.useSyncExternalStore)(t.subscribe,t.getSnapshot,t.getSnapshot),{diagnosticState:e,diagnosticReport:n}=a,[r,l]=(0,ee.useState)(!1),[d,i]=(0,ee.useState)("idle");(0,ee.useEffect)(()=>{l(!1),i("idle")},[n]);let c=e==="running",p=n?Ze(n):"",y=async()=>{if(!(!r||!n||!p))try{await navigator.clipboard.writeText(p),t.getSnapshot().diagnosticReport===n&&i("copied")}catch{t.getSnapshot().diagnosticReport===n&&i("failed")}};return(0,C.jsxs)("section",{"aria-label":"连接诊断",children:[(0,C.jsxs)("div",{className:V.default.updateRow,children:[(0,C.jsx)("h3",{className:V.default.updateHeading,children:"连接诊断"}),(0,C.jsxs)("div",{className:V.default.updateActions,children:[(0,C.jsx)("button",{type:"button",className:V.default.secondaryButton,disabled:c,onClick:()=>void t.diagnose(),children:c?"检测中…":"检查连接"}),c?(0,C.jsx)("button",{type:"button",className:V.default.secondaryButton,onClick:()=>t.cancel(),children:"取消"}):null]})]}),(0,C.jsx)("p",{className:V.default.helpText,children:"检查结果仅供参考，不影响配对或连接，也不改配置。会访问中继健康接口，对方可见出口 IP；报告不自动上传。"}),(0,C.jsxs)("div",{role:"status","aria-live":"polite",children:[e==="cancelled"?(0,C.jsx)("p",{children:"已取消本次检查。"}):null,e==="unsupported"?(0,C.jsx)("p",{children:"当前 DSH 或插件不支持此诊断入口，请更新后重新打开应用。"}):null,e==="error"?(0,C.jsx)("p",{children:"未能取得诊断结果。请确认当前 DSH 和插件正在运行，再检查连接。"}):null,n?(0,C.jsxs)(C.Fragment,{children:[(0,C.jsxs)("p",{className:V.default.helpText,children:["检查于 ",new Date(n.startedAt).toLocaleString(),"，以下为该次检查结果。"]}),(0,C.jsx)("ul",{children:n.checks.map(b=>(0,C.jsxs)("li",{children:[Qe(b.id),"：",Mt[b.status],b.code?` · ${Ke(b.code)}`:null,b.httpStatus?` · HTTP ${b.httpStatus}`:null,b.systemCode?` · ${b.systemCode}`:null,b.status==="fail"?(0,C.jsx)("p",{className:V.default.helpText,children:Ye(b.code??"unknown")}):null]},b.id))}),(0,C.jsx)("p",{className:V.default.helpText,children:"基础检查通过不等于首次配对成功；未单独测试 WebSocket 握手、手机认领或票据签名。"}),(0,C.jsx)("button",{type:"button",className:V.default.secondaryButton,"aria-expanded":r,onClick:()=>l(!r),children:r?"收起报告":"预览诊断报告"}),r?(0,C.jsxs)(C.Fragment,{children:[(0,C.jsx)("pre",{style:{whiteSpace:"pre-wrap",overflowWrap:"anywhere",maxHeight:280,overflow:"auto",fontSize:12},children:p}),(0,C.jsx)("button",{type:"button",className:V.default.secondaryButton,onClick:()=>void y(),children:d==="copied"?"已复制":"复制诊断报告"}),d==="failed"?(0,C.jsx)("p",{className:V.default.helpText,children:"复制未成功，可以选中上方报告手动复制。"}):null]}):null]}):null]})]})}var f=require("react/jsx-runtime");function gt({ok:t,busy:a=!1}){return(0,f.jsx)("span",{className:P.default.statusDot,"data-state":a?"busy":t?"ready":"off","aria-hidden":!0})}function Ue({title:t,detail:a,ok:e,busy:n=!1}){return(0,f.jsxs)("div",{className:P.default.capability,children:[(0,f.jsx)(gt,{ok:e,busy:n}),(0,f.jsxs)("div",{className:P.default.capabilityCopy,children:[(0,f.jsx)("strong",{children:t}),(0,f.jsx)("span",{children:a})]})]})}function je({describeHost:t,callManagement:a,store:e=_e(t,a),diagnostics:n,assistants:r,clawbotCall:l,featureCall:d}){let{loadState:i,qrState:c,status:p,runtime:y,host:b,localOrigin:E,qr:h,error:m}=(0,ke.useSyncExternalStore)(e.subscribe,e.getSnapshot,e.getSnapshot),{refresh:k,generateQr:N}=e,M=(0,ke.useId)(),L=p?.publicRelay,D=L?.state==="enrolling"||L?.state==="connecting",O=L?.remoteAccess?.status,J=L?.state==="online"&&O==="active",$=O==="suspended"?"账户公网访问已暂停":O==="expired"?"公网访问已到期":O==="not_entitled"?"请在小程序中使用自助开通方式":O!=="active"?"配对后由小程序账户决定":J?"可在外网安全连接":D?"正在准备远程连接":"暂时离线",te=y?.publicDoor??p?.gate?.publicDoor,X=i==="ready"&&!!p?.lan.ip&&te?.state==="listening",K=L?.enabled===!0&&L.state!=="disabled",I=p?.agent?.agentName||b?.agentName||"DeepSeek Harness",ie=p?.agent?.hostName||b?.computerName||"当前电脑";return(0,f.jsxs)("section",{className:P.default.root,"aria-labelledby":M,children:[(0,f.jsxs)("div",{className:P.default.hero,children:[(0,f.jsxs)("div",{className:P.default.identity,children:[(0,f.jsx)("span",{className:P.default.mark,"aria-hidden":!0,children:(0,f.jsx)(ht.FishLogo,{size:28})}),(0,f.jsxs)("div",{className:P.default.identityCopy,children:[(0,f.jsx)("h3",{id:M,children:"微信连接"}),(0,f.jsxs)("p",{children:[I,(0,f.jsx)("span",{"aria-hidden":!0,children:" · "}),ie]})]})]}),(0,f.jsxs)("span",{className:P.default.overall,"data-ready":i==="ready",children:[(0,f.jsx)(gt,{ok:i==="ready",busy:i==="loading"}),i==="loading"?"检测中":i==="ready"?"服务正常":"暂不可用"]})]}),(0,f.jsxs)("div",{className:P.default.capabilities,children:[(0,f.jsx)(Ue,{title:"局域网直连",detail:i==="loading"?"检测中":X?"已就绪":"暂不可用",ok:X,busy:i==="loading"}),(0,f.jsx)(Ue,{title:"远程访问",detail:$,ok:J,busy:D||i==="loading"}),(0,f.jsx)(Ue,{title:"账号连接保护",detail:K?"已启用":"配对后启用",ok:K,busy:i==="loading"})]}),m!==null?(0,f.jsxs)("div",{className:P.default.notice,role:"status",children:[(0,f.jsx)("span",{children:m}),(0,f.jsx)("button",{type:"button",onClick:()=>void k(),children:"重试"})]}):null,c==="idle"?(0,f.jsxs)("div",{className:P.default.connectCard,children:[(0,f.jsxs)("div",{children:[(0,f.jsx)("strong",{children:"添加到微信"}),(0,f.jsx)("p",{children:"打开「Agent远程管理助手」→ 添加节点，扫描配对二维码。"})]}),(0,f.jsx)("button",{type:"button",className:P.default.primaryButton,disabled:i!=="ready",onClick:()=>void N(),children:"生成二维码"})]}):(0,f.jsxs)("div",{className:P.default.pairingCard,children:[(0,f.jsxs)("div",{className:P.default.pairingHead,children:[(0,f.jsxs)("div",{children:[(0,f.jsx)("strong",{children:"扫描二维码"}),(0,f.jsx)("p",{children:"小程序「设置 → 添加节点」"})]}),(0,f.jsx)("button",{type:"button",className:P.default.secondaryButton,disabled:c==="loading"||i!=="ready",onClick:()=>void N(),children:c==="loading"?"生成中…":"重新生成"})]}),(0,f.jsxs)("div",{className:P.default.qrArea,children:[i==="ready"&&c==="ready"&&h!==null?(0,f.jsx)("img",{className:P.default.qr,src:h.qrDataUrl,alt:"Agent远程管理助手配对二维码"}):(0,f.jsx)("div",{className:P.default.qrPlaceholder,"aria-live":"polite",children:i!=="ready"?"连接恢复后可查看二维码":c==="expired"?"二维码已过期，请重新生成":c==="error"?"生成失败":"正在生成…"}),c==="ready"&&h!==null?(0,f.jsxs)("small",{className:P.default.qrValidity,children:["有效至 ",new Date(h.expiresAt).toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"})," · 切换页面不重新生成"]}):null]}),(0,f.jsx)("p",{className:P.default.securityNote,children:h?.mode==="public-relay"?"配对后自动选择更快的连接；远程内容端到端加密。":"当前可通过同一局域网连接。"})]}),(0,f.jsxs)("section",{className:P.default.updateCard,"aria-label":"插件更新",children:[(0,f.jsx)("h3",{className:P.default.updateHeading,children:"插件更新"}),E&&e.updates?(0,f.jsx)(st,{store:e.updates,embedded:!0}):null,y?.profileScope==="desktop"&&e.nativeUpdates?(0,f.jsx)(ot,{store:e.nativeUpdates,embedded:!0}):null,(0,f.jsx)(xe,{describeHost:t,callManagement:a,store:e,compact:!0})]}),r?(0,f.jsx)(dt,{store:r,featureCall:d}):null,l?(0,f.jsx)(ut,{call:l,nodeName:I,hostName:ie}):null,n?(0,f.jsx)(ft,{store:n}):null]})}var Se=class{constructor(a,e){this.call=a;this.openSession=e}state={catalog:null,preview:null,busy:!1,message:"",error:""};listeners=new Set;epoch=0;disposed=!1;getSnapshot=()=>this.state;subscribe=a=>(this.listeners.add(a),()=>{this.listeners.delete(a)});set(a){if(!this.disposed){this.state={...this.state,...a};for(let e of this.listeners)e()}}reset=()=>{this.epoch++,this.set({catalog:null,preview:null,busy:!1,message:"",error:""})};dispose=()=>{this.reset(),this.disposed=!0,this.listeners.clear()};async run(a){if(this.disposed||this.state.busy)return;let e=this.epoch,n=()=>!this.disposed&&e===this.epoch;this.set({busy:!0,error:""});try{await a(n)}catch(r){n()&&this.set({error:r instanceof Error?r.message:"操作未完成，请核对状态"})}finally{n()&&this.set({busy:!1})}}async read(a){a()&&this.set({catalog:null});try{let e=await this.call("assistantCatalog",{});if(!a())return;if(e?.schema!=="human.assistants.catalog.v1"||!Array.isArray(e.templates)||!Array.isArray(e.drafts))throw new Error("助手目录格式不受支持");this.set({catalog:e})}catch(e){throw a()&&this.set({message:""}),e}}load=()=>this.run(a=>this.read(a));readyAssistant(a){let e=this.state.catalog?.drafts?.find(n=>n.presetId===a);if(!e||e.state!=="installed"||e.nativeState&&e.nativeState!=="installed")throw new Error("此助手已停用或尚未就绪，请核对下方组件开关。");return e}start=(a,e)=>this.run(async n=>{if(this.set({message:""}),await this.read(n),!(!n()||e?.aborted)){if(this.readyAssistant(a),!this.openSession)throw new Error("当前 DSH 未提供快捷入口，请在新会话中选择此助手模式。");await this.openSession(a,e)}});dismissPreview=()=>{this.state.busy||this.set({preview:null,message:""})};choose=a=>this.run(async e=>{if(this.set({preview:null,message:""}),this.state.catalog?.templates?.find(i=>i.id===a)?.builtin){await this.read(e),e()&&this.set({message:"此助手已包含在插件里，请在新会话中选择；无需另装独立包。"});return}let r=this.state.catalog?.drafts?.find(i=>i.templateId===a&&i.state==="draft");if(r){let i=await this.call("assistantPreview",{id:r.id,version:r.version});e()&&this.set({preview:i});return}let l=await this.call("assistantDraft",{templateId:a});if(!e()||(await this.read(e),!e()))return;let d=await this.call("assistantPreview",{id:l.id,version:l.version});e()&&this.set({preview:d})});preview=(a,e)=>this.run(async n=>{this.set({preview:null});let r=await this.call("assistantPreview",{id:a,version:e});n()&&this.set({preview:r})});reinstall=(a,e)=>this.run(async n=>{if(this.set({preview:null,message:""}),this.state.catalog?.drafts?.some(d=>d.id===a&&d.version===e&&d.replacement)){await this.read(n),n()&&this.set({message:"这个旧模式已有内置版本，请在新会话中选择对应助手，无需重新安装旧包。"});return}let r=await this.call("assistantDraft",{sourceId:a,sourceVersion:e});if(!n()||(await this.read(n),!n()))return;let l=await this.call("assistantPreview",{id:r.id,version:r.version});n()&&this.set({preview:l})});install=()=>this.run(async a=>{let e=this.state.preview;if(!e||e.expiresAt<=Date.now())throw new Error("请重新预览后确认安装");this.set({preview:null,message:"已提交原生安装，请等待结果。"});try{let n=await this.call("assistantInstall",{id:e.id,version:e.version,digest:e.digest,previewId:e.previewId});a()&&this.set({message:n.message||(n.state==="installed"?"原生预设已生效":"请核对原生安装状态")})}finally{a()&&await this.read(a)}});verify=(a,e)=>this.run(async n=>{this.set({catalog:null,message:""});let r=await this.call("assistantStatus",{id:a,version:e});n()&&(this.set({message:r.message||"状态已核对"}),await this.read(n))})};function bt(t){let a=0,e=!1;return{reset(){a++,e=!1},async start(n,r){if(!/^[a-z][a-z0-9_-]{0,63}$/.test(n))throw new Error("助手身份无效");if(e||r?.aborted)return;let l=a,d=t("uiWorkspace"),i=t("slots"),c=t("configForms")?.developerTools?.enabled?.getSnapshot(),p=i?.entries?.("conversation.hero.agentPreset"),y=Array.isArray(p)&&p.length===1?p[0]:void 0;if(c!==!0||typeof d?.clearMain!="function"||y?.options?.locale!=="settings.agentPreset"||typeof y?.inject!="function")throw new Error("当前 DSH 尚未提供快捷入口，请在原生新会话中选择此助手模式。");let b=y.inject(void 0);if(typeof b?.load!="function"||typeof b?.select!="function"||typeof b?.hooks?.agentPresetSeat?.getSnapshot!="function")throw new Error("当前 DSH 的模式选择入口不兼容，请使用原生新会话入口。");let E=()=>l===a&&!r?.aborted;e=!0;try{if(await b.load(),!E())return;let h=i.entries("conversation.hero.agentPreset");if(!Array.isArray(h)||h.length!==1||h[0]!==y)throw new Error("DSH 的模式入口已更新，请重新点击开始使用。");let m=b.hooks.agentPresetSeat.getSnapshot();if(m.busy||m.error||!m.options?.some(N=>N.id===n))throw new Error("此助手尚未就绪，请刷新状态后重试。");if(t("configForms")?.developerTools?.enabled?.getSnapshot()!==!0)throw new Error("DSH 的工作模式选择已关闭，请在原生设置中开启后重试。");d.clearMain();let k=await b.select(n);if(E()&&k)throw new Error(k)}finally{l===a&&(e=!1)}}}}var Ft=["slots","connection"];function qt(t){let a=async(h,m,k)=>{let N=await t.connection.rpc.call("/wechat-remote-management",h,m??{},k);if(!N.ok)throw Object.assign(new Error(N.error.message),{code:N.error.code});return N.value},e=async()=>{let h=await t.connection.rpc.call("/api","wechatHost/describe",{args:{request:{}}});if(!h.ok)throw new Error(`wechatHost/describe: ${h.error.code}`);let m=h.value;if(m?.ok!==!0||m.value===void 0)throw new Error("wechatHost/describe returned an invalid result");return m.value},n=new ce(e,a),r=0,l=async h=>{let m=r,k=await t.connection.rpc.call("/api","wechatFeatures/control",{args:{request:h}});if(m!==r)throw new Error("节点连接已变化，请重新核对资格。");if(!k.ok)throw new Error("使用资格服务暂不可用，请更新插件并刷新。");let N=k.value;if(!N?.ok)throw new Error(N?.error?.message||"使用资格核对失败。");return Ge(N.value)},d=async h=>{let m=r,k=await t.connection.rpc.call("/api","wechatClawbot/control",{args:{request:h}});if(m!==r)throw new Error("节点连接已变化，请刷新 ClawBot 状态");if(!k.ok)throw new Error("ClawBot 组件暂不可用，请核对下方组件开关");let N=k.value;if(!N?.ok)throw new Error(N?.error?.message||"ClawBot 状态读取失败");return N.value},i=async(h,m)=>{let k=r,N=await t.connection.rpc.call("/api",`humanTools/${h}`,{args:{request:m}});if(k!==r)throw new Error("电脑连接已变化，请重新查看助手目录");if(!N.ok)throw new Error(N.error.message);let M=N.value;if(!M?.ok||typeof M.valueJson!="string"||M.valueJson.length>256*1024)throw new Error(M?.error?.message||"此节点尚未提供助手能力");return JSON.parse(M.valueJson)},c,p=new Se(i,async(h,m)=>{if(!c)throw new Error("原生会话入口尚未就绪，请稍后再试。");await c.start(h,m)});t.inject(["uiWorkspace","slots","configForms"],h=>{let m=bt(k=>h.get(k));c=m,h.effect(()=>()=>{m.reset(),c===m&&(c=void 0)},"wechat assistant navigation")}),t.effect(()=>{let h=t.on("connection/reset",()=>{r++,c?.reset(),p.reset()});return()=>{r++,h(),p.dispose()}},"wechat assistant lifecycle"),t.effect(()=>()=>n.dispose(),"wechat shared page");let y=new Ce(e,a);t.effect(()=>{let h=t.on("connection/reset",y.reset);return()=>{h(),y.dispose()}},"wechat connection diagnostics");let b=()=>nt(h=>t.get(h)),E=()=>({describeHost:e,callManagement:a,store:n,assistants:p,clawbotCall:d,featureCall:l,diagnostics:y});t.slots.inject("settings.section",()=>t.slots.register({name:"settings.section",id:"harness-remote",order:30,label:"微信连接",inject:E},je));for(let h of["plugins.bundle.activation","plugins.bundle.config"])t.slots.inject(h,()=>{let m=["dsh-wechat-remote","@harness-remote/dsh-wechat-remote"].map(k=>t.slots.register({name:h,key:k,inject:E},h==="plugins.bundle.activation"?xe:je));return()=>m.forEach(k=>k())});t.inject(["pluginNavigation","remote.pluginManager"],()=>t.slots.inject("sidebar.footer.action",()=>t.slots.register({name:"sidebar.footer.action",id:"harness-remote",order:30,label:"微信连接",inject:()=>({openPlugin:b})},at)))}

return module.exports;}});
