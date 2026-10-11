window.__ModuleLoader__.load({id:"@harness-remote/dsh-wechat-remote",factory:(require)=>{var module={exports:{}};var exports=module.exports;"use strict";var wt=Object.create;var be=Object.defineProperty;var yt=Object.getOwnPropertyDescriptor;var _t=Object.getOwnPropertyNames;var xt=Object.getPrototypeOf,Ct=Object.prototype.hasOwnProperty;var kt=(t,a)=>()=>(a||t((a={exports:{}}).exports,a),a.exports),St=(t,a)=>{for(var e in a)be(t,e,{get:a[e],enumerable:!0})},je=(t,a,e,n)=>{if(a&&typeof a=="object"||typeof a=="function")for(let r of _t(a))!Ct.call(t,r)&&r!==e&&be(t,r,{get:()=>a[r],enumerable:!(n=yt(a,r))||n.enumerable});return t};var ae=(t,a,e)=>(e=t!=null?wt(xt(t)):{},je(a||!t||!t.__esModule?be(e,"default",{value:t,enumerable:!0}):e,t)),Nt=t=>je(be({},"__esModule",{value:!0}),t);var Q=kt((Ot,Me)=>{"use strict";var Et=`.hr_ead46c4_root {\r
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
`,ze="@harness-remote/dsh-wechat-remote/HarnessRemoteSettings.module.css";if(typeof document<"u"&&document.querySelector("style[data-plugin-css="+JSON.stringify(ze)+"]")===null){let t=document.createElement("style");t.dataset.plugin="@harness-remote/dsh-wechat-remote",t.dataset.pluginCss=ze,t.textContent=Et,document.head.appendChild(t)}Me.exports={root:"hr_ead46c4_root",hero:"hr_ead46c4_hero",connectCard:"hr_ead46c4_connectCard",pairingCard:"hr_ead46c4_pairingCard",identity:"hr_ead46c4_identity",mark:"hr_ead46c4_mark",identityCopy:"hr_ead46c4_identityCopy",pairingHead:"hr_ead46c4_pairingHead",securityNote:"hr_ead46c4_securityNote",sidebarButton:"hr_ead46c4_sidebarButton",actions:"hr_ead46c4_actions",pageDialog:"hr_ead46c4_pageDialog",pageDialogContent:"hr_ead46c4_pageDialogContent",helpText:"hr_ead46c4_helpText",companionCard:"hr_ead46c4_companionCard",assistantsCard:"hr_ead46c4_assistantsCard",assistantsHeading:"hr_ead46c4_assistantsHeading",assistantChoices:"hr_ead46c4_assistantChoices",assistantChoice:"hr_ead46c4_assistantChoice",assistantChoiceCopy:"hr_ead46c4_assistantChoiceCopy",assistantChoiceHead:"hr_ead46c4_assistantChoiceHead",assistantEntryHead:"hr_ead46c4_assistantEntryHead",assistantStatus:"hr_ead46c4_assistantStatus",assistantPrimary:"hr_ead46c4_assistantPrimary",assistantSecondary:"hr_ead46c4_assistantSecondary",assistantTextButton:"hr_ead46c4_assistantTextButton",assistantDetails:"hr_ead46c4_assistantDetails",assistantCustomize:"hr_ead46c4_assistantCustomize",assistantPreview:"hr_ead46c4_assistantPreview",assistantUnavailable:"hr_ead46c4_assistantUnavailable",assistantHelpAnchor:"hr_ead46c4_assistantHelpAnchor",assistantHelpButton:"hr_ead46c4_assistantHelpButton",assistantTooltip:"hr_ead46c4_assistantTooltip",assistantButtons:"hr_ead46c4_assistantButtons",assistantEntry:"hr_ead46c4_assistantEntry",overall:"hr_ead46c4_overall",statusDot:"hr_ead46c4_statusDot",capabilities:"hr_ead46c4_capabilities",capability:"hr_ead46c4_capability",capabilityCopy:"hr_ead46c4_capabilityCopy",notice:"hr_ead46c4_notice",secondaryButton:"hr_ead46c4_secondaryButton",primaryButton:"hr_ead46c4_primaryButton",qrArea:"hr_ead46c4_qrArea",qr:"hr_ead46c4_qr",qrPlaceholder:"hr_ead46c4_qrPlaceholder",qrValidity:"hr_ead46c4_qrValidity",updateCard:"hr_ead46c4_updateCard",updateHeading:"hr_ead46c4_updateHeading",updateRow:"hr_ead46c4_updateRow",updateCopy:"hr_ead46c4_updateCopy",updateControl:"hr_ead46c4_updateControl",updateLabel:"hr_ead46c4_updateLabel",updateChecked:"hr_ead46c4_updateChecked",updateActions:"hr_ead46c4_updateActions",updateEndpoint:"hr_ead46c4_updateEndpoint",companionInline:"hr_ead46c4_companionInline",updateScope:"hr_ead46c4_updateScope",updatePeerNote:"hr_ead46c4_updatePeerNote",updateDetails:"hr_ead46c4_updateDetails",updateProgress:"hr_ead46c4_updateProgress",updateVersions:"hr_ead46c4_updateVersions",updateCommand:"hr_ead46c4_updateCommand",clawbotCard:"hr_ead46c4_clawbotCard",clawbotHead:"hr_ead46c4_clawbotHead",clawbotRow:"hr_ead46c4_clawbotRow",clawbotReceiveRow:"hr_ead46c4_clawbotReceiveRow",clawbotNode:"hr_ead46c4_clawbotNode",clawbotSection:"hr_ead46c4_clawbotSection",clawbotStatus:"hr_ead46c4_clawbotStatus",clawbotPairingEntry:"hr_ead46c4_clawbotPairingEntry",clawbotNote:"hr_ead46c4_clawbotNote",clawbotToggle:"hr_ead46c4_clawbotToggle",clawbotSwitchTrack:"hr_ead46c4_clawbotSwitchTrack",clawbotTextButton:"hr_ead46c4_clawbotTextButton",clawbotManage:"hr_ead46c4_clawbotManage",clawbotError:"hr_ead46c4_clawbotError",clawbotPairing:"hr_ead46c4_clawbotPairing",clawbotPairingCopy:"hr_ead46c4_clawbotPairingCopy",clawbotActions:"hr_ead46c4_clawbotActions",assistantFeatureBody:"hr_ead46c4_assistantFeatureBody",clawbotMark:"hr_ead46c4_clawbotMark"}});var zt={};St(zt,{apply:()=>jt,inject:()=>Ut});module.exports=Nt(zt);var Le=require("react"),Je=require("@deepseek-ai/dsh-client-ui-primitives");var J=ae(Q(),1),S=require("react/jsx-runtime");function Oe({value:t,onDecide:a,deciding:e=!1,compact:n=!1}){if(!t||!n&&t.state==="idle")return null;let r={"confirmation-required":"是否更新下方指定端的插件？",deferred:"已暂缓此次联动更新",pending:"联动更新待处理",busy:"等待待更新端的任务结束",preparing:"正在准备联动更新",installing:"正在安装插件更新",verifying:"正在核验更新后的恢复状态",recovering:"正在恢复更新前的插件","restart-required":"待更新端需启动或重启确认","self-restart-required":"当前端待重启，尚未生效",unverified:"两端更新状态待核实",complete:"两端插件已对齐",unavailable:"联动更新尚未确认成功"},l=["preparing","installing","verifying","recovering"].includes(t.state),d=t.versions?.peer==="desktop"?"Desktop":t.versions?.peer==="web"?"Web":null,i=t.target?.scope==="desktop"?"Desktop":t.target?.scope==="web"?"Web":null,c=i||"更新端",p={pending:`等待 ${c} 就绪`,busy:`${c} 有任务，等待空闲`,preparing:`正在准备 ${c} 更新`,installing:`正在更新 ${c}`,verifying:`正在核对 ${c} 更新结果`,recovering:`正在恢复 ${c} 原版本`,"restart-required":`${c} 已安装，待启动或重连确认`,"self-restart-required":"当前端待重启，尚未生效",unverified:"更新状态待核对",complete:"两端版本已同步",unavailable:"更新未完成，请核对"},y=["confirmation-required","deferred"].includes(t.state);if(n&&t.state==="idle"&&!t.versions?.peerInstalled)return(0,S.jsx)("p",{className:J.default.updatePeerNote,children:"未检测到可同步更新的另一端；当前端可独立使用。"});let m=t.state==="idle"?"未发现待确认的同步更新":n&&y&&i&&t.target?`${i} 可更新至 ${t.target.version}${t.state==="deferred"?" · 已暂缓":""}`:n&&t.state==="self-restart-required"?"当前端重启后可检查同步更新":(n?p[t.state]:void 0)||r[t.state]||"插件更新状态待核对",R=y&&t.offerId&&a?(0,S.jsxs)("div",{className:J.default.updateActions,children:[(0,S.jsx)("button",{type:"button",className:J.default.primaryButton,disabled:e,onClick:()=>a("approve"),children:e?"确认中…":i?`确认更新 ${i}`:"确认更新指定端"}),(0,S.jsx)("button",{type:"button",className:J.default.secondaryButton,disabled:e,onClick:()=>a("later"),children:"稍后再说"})]}):null;return(0,S.jsxs)("aside",{className:n?J.default.companionInline:J.default.companionCard,"data-state":t.state,role:"status","aria-live":"polite",children:[n?(0,S.jsxs)("div",{className:J.default.updateRow,children:[(0,S.jsxs)("div",{className:J.default.updateCopy,children:[d?(0,S.jsxs)("div",{className:J.default.updateVersions,children:[(0,S.jsxs)("strong",{children:[d," ",(0,S.jsx)("span",{className:J.default.updateScope,children:"同一主机"})]}),(0,S.jsx)("span",{children:t.versions?.peerInstalled?`已安装 ${t.versions.peerInstalled}`:"安装或启用状态未确认"})]}):null,(0,S.jsx)("strong",{children:m})]}),R]}):(0,S.jsx)("strong",{children:m}),n?(0,S.jsx)(S.Fragment,{children:t.state!=="idle"&&t.message?(0,S.jsxs)("details",{className:J.default.updateDetails,children:[(0,S.jsx)("summary",{children:"详细状态"}),(0,S.jsx)("p",{children:t.message})]}):null}):t.message?(0,S.jsx)("p",{children:t.message}):null,!n&&t.versions?(0,S.jsxs)("small",{children:[t.versions.current==="desktop"?"Desktop":"Web","：运行 ",t.versions.running," · 已安装 ",t.versions.installed??"未确认","；",d,"：已安装 ",t.versions.peerInstalled??"未确认或未启用"]}):null,R?(0,S.jsxs)(S.Fragment,{children:[n?null:R,(0,S.jsx)("small",{className:J.default.updateChecked,children:"空闲后更新，连接会短暂中断；保留配对与会话。"})]}):null,l?(0,S.jsx)("progress",{"aria-label":"联动更新进度"}):null,t.state==="busy"?(0,S.jsx)("small",{children:"不用手动停止任务。请保持两端运行，空闲后会继续检查。"}):l?(0,S.jsx)("small",{children:"请保持两端当前状态，暂勿退出、重启或重复安装。关闭本设置页不会取消更新。"}):t.state==="unavailable"?(0,S.jsx)("small",{children:"请在待更新端核对版本，必要时使用其原安装入口。"}):null]})}function Fe(){return Object.assign(new Error("当前 DSH 或插件不支持此诊断入口，请更新后重新打开应用。"),{code:"diagnostic-unsupported"})}async function ve(t,a,e=fetch){let n=await t(),r=n.gate;if(!r)throw new Error("当前节点没有提供配对入口");let l=r.profileScope==="desktop",d=r.localDoor?.port,i=Number.isSafeInteger(d)&&d>=1&&d<=65535?`http://127.0.0.1:${d}`:null;if(r.management==="authenticated-rpc")return{host:n,runtime:r,localOrigin:l?null:i,status:()=>a("status"),pairCode:()=>a("pair-code"),diagnose:async p=>{if(r.diagnostics!=="read-only-v1")throw Fe();return a("connection-diagnostics",void 0,p)},decide:(p,y)=>a("companion-decision",{offerId:p,action:y})};if(l||r.management==="unavailable"||!i||r.localDoor.state!=="listening")throw new Error("当前节点配对入口尚未就绪");let c=async p=>{let y=await e(i+p,{cache:"no-store"});if(!y.ok)throw new Error(`配对请求失败 (${y.status})`);return y.json()};return{host:n,runtime:r,localOrigin:i,status:()=>c("/gate/status"),pairCode:()=>c("/pair/code"),diagnose:async p=>{throw Fe()},decide:async(p,y)=>{let m=await e(i+"/gate/companion/decision",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({offerId:p,action:y})});if(!m.ok)throw new Error("更新通知已变化，请刷新后重试");return m.json()}}}var we=class{constructor(a,e=globalThis.fetch){this.origin=a;this.fetcher=e.bind(globalThis)}value={check:null,checking:!1,progress:null,error:"",copied:!1,resumeFailed:!1};listeners=new Set;reading;installing=!1;disposed=!1;job=null;timer;pollGeneration=0;recovering=!1;fetcher;getSnapshot=()=>this.value;subscribe=a=>this.disposed?()=>{}:(this.listeners.add(a),this.listeners.size===1&&this.refresh(),()=>{this.listeners.delete(a)});patch(a){if(!this.disposed){this.value={...this.value,...a};for(let e of this.listeners)e()}}refresh=()=>this.disposed?Promise.resolve():this.reading?this.reading:(this.patch({checking:!0,error:"",copied:!1}),this.reading=(async()=>{try{let a=await this.fetcher(this.origin+"/gate/update/check",{signal:AbortSignal.timeout(1e4)}),e=await a.json();if(!a.ok)throw new Error(e.error||"暂时无法检查更新");if(!e.advice?.current||typeof e.advice.label!="string")throw new Error("更新检查返回信息不完整");if(this.patch({check:e}),this.installing||this.job||this.recovering)return;e.activeJob?.statusOrigin?this.follow(e.activeJob):e.lastResult?.phase==="unknown"?this.patch({progress:e.lastResult}):e.mode==="busy"?this.patch({progress:{phase:"preparing",progress:0,message:"更新仍在准备或等待确认，请稍后重新检查；不要重复安装。",terminal:!0}}):this.patch({progress:e.lastResult??null})}catch(a){this.patch({check:null,error:a instanceof Error?a.message:"暂时无法检查更新"})}finally{this.patch({checking:!1})}})().finally(()=>{this.reading=void 0}),this.reading);follow(a){if(this.disposed||this.job?.jobId===a.jobId)return;this.job=a;let e=++this.pollGeneration,n=Date.now()+10*6e4;clearTimeout(this.timer),this.patch({progress:{phase:"recovering",progress:0,message:"正在恢复更新进度…",terminal:!1}});let r=async()=>{if(this.disposed||e!==this.pollGeneration)return;let l;try{let d=await this.fetcher(a.statusOrigin+"/status",{headers:{Authorization:"Bearer "+a.statusToken},signal:AbortSignal.timeout(4e3)});if(!d.ok)throw new Error("进度暂不可用");let i=await d.json();if(i.jobId!==a.jobId||typeof i.terminal!="boolean"||typeof i.message!="string")throw new Error("进度不匹配");l=i}catch{try{let d=await this.fetcher(this.origin+"/gate/update/status",{signal:AbortSignal.timeout(3e3)}),i=await d.json();d.ok&&i.lastResult?.jobId===a.jobId&&(l=i.lastResult)}catch{}}if(!(this.disposed||e!==this.pollGeneration)){if(l&&(this.patch({progress:l}),l.terminal)){this.job=null,l.ok?this.resume(a.jobId):this.refresh();return}if(Date.now()>n){this.job=null,this.patch({progress:{phase:"unknown",progress:0,message:"暂时无法确认更新结果。请重新打开此主机 WebUI 检查版本；不要重复安装或删除节点。",terminal:!0}});return}this.timer=setTimeout(()=>void r(),1e3)}};r()}async resume(a){this.recovering=!0;let e=Date.now()+3e4,n=async()=>{try{let r=await this.fetcher(this.origin+"/gate/update/resume?job="+encodeURIComponent(a),{signal:AbortSignal.timeout(3e3)});if(!r.ok)throw new Error("尚未恢复");let l=await r.json();if(!l.url)throw new Error("缺少恢复地址");let d=new URL(l.url);if(d.origin!==window.location.origin||d.pathname!=="/"||d.username||d.password||d.hash)throw new Error("恢复地址不匹配");this.disposed||window.location.replace(d.href)}catch{if(this.disposed)return;if(Date.now()>=e){this.recovering=!1,this.patch({resumeFailed:!0});return}this.timer=setTimeout(()=>void n(),1e3)}};await n()}install=async()=>{let{check:a,checking:e,error:n,progress:r}=this.value;if(this.disposed||!a?.canInstall||e||n||r&&!r.terminal||this.installing||this.job||this.recovering)return;this.installing=!0,this.patch({error:"",check:{...a,canInstall:!1,ticket:""},progress:{phase:"download",progress:10,message:"正在下载并验证更新包；当前插件尚未替换",terminal:!1}});let l=!1;try{let d=await this.fetcher(this.origin+"/gate/update/start",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({ticket:a.ticket})}),i=await d.json();if(l=!d.ok&&typeof i.error=="string",!d.ok||!i.statusOrigin)throw new Error(i.error||"无法取得更新进度，请重新检查");this.follow(i)}catch(d){if(this.disposed)return;if(l)this.patch({progress:{phase:"failed",progress:0,message:(d instanceof Error?d.message:"更新暂不可用")+"。请重新检查更新。",terminal:!0,ok:!1}});else{try{let i=await this.fetcher(this.origin+"/gate/update/status",{signal:AbortSignal.timeout(3e3)}),c=await i.json();if(i.ok&&c.activeJob?.statusOrigin){this.follow(c.activeJob);return}}catch{}this.patch({progress:{phase:"unknown",progress:0,message:"连接中断，暂时无法确认更新结果。请稍后检查更新；不要重复安装或删除节点。",terminal:!0}})}}finally{this.installing=!1}};copyCommand=async()=>{if(!(!this.value.check?.manualCommand||this.value.checking||this.installing||this.job))try{await navigator.clipboard.writeText(this.value.check.manualCommand),this.patch({copied:!0})}catch{this.patch({error:"复制失败，请手动选中下方命令复制。"})}};dispose=()=>{this.disposed=!0,this.pollGeneration++,clearTimeout(this.timer),this.listeners.clear()}};var ye=class{constructor(a){this.call=a}value={checking:!1,starting:!1,check:null,status:null,error:null};listeners=new Set;reading;timer;disposed=!1;checkRevision=0;checkInvalidated=!1;getSnapshot=()=>this.value;patch(a){if(!this.disposed){this.value={...this.value,...a};for(let e of this.listeners)e()}}subscribe=a=>this.disposed?()=>{}:(this.listeners.add(a),this.checkInvalidated?(this.refreshInvalidatedCheck(),this.active()&&this.poll()):!this.value.check&&!this.value.starting?this.refresh():this.active()&&this.poll(),()=>{this.listeners.delete(a),this.listeners.size||(clearTimeout(this.timer),this.timer=void 0)});active(){return this.value.status&&["preparing","installing","unknown","restart-required"].includes(this.value.status.phase)}invalidateCheck=()=>{this.disposed||(this.checkRevision++,this.checkInvalidated=!0,this.value.check&&this.patch({check:{...this.value.check,canInstall:!1,ticket:""}}),this.refreshInvalidatedCheck())};refreshInvalidatedCheck(){!this.disposed&&this.checkInvalidated&&this.listeners.size&&!this.value.starting&&!this.active()&&this.refresh()}refresh=()=>{if(this.disposed||this.value.starting)return Promise.resolve();if(this.reading)return this.reading;let a=this.checkRevision;return this.checkInvalidated=!1,this.patch({checking:!0,error:null}),this.reading=(async()=>{try{let e=await this.call("update-check");if(this.disposed||a!==this.checkRevision)return;if(!e?.advice||!e.status||typeof e.canInstall!="boolean")throw Error("invalid update response");this.patch({check:e,status:e.status}),this.active()&&this.poll()}catch{if(this.disposed||a!==this.checkRevision)return;let e=!1;try{let n=await this.call("status");e=!!(n&&!n.plugin)}catch{}if(this.disposed||a!==this.checkRevision)return;this.patch({check:null,error:e?"当前运行的连接服务尚不支持此更新入口。若刚安装新版，请在任务结束后退出并重新打开 Desktop；无需重新配对。仍不可用时请在原生插件管理器核对安装。":"本次更新检查未完成，不能据此判断已是最新版。请稍后重试；配对和聊天不受此次检查失败影响。"})}finally{this.patch({checking:!1})}})().finally(()=>{this.reading=void 0,this.refreshInvalidatedCheck()}),this.reading};install=async()=>{let a=this.value.check;if(!(this.disposed||this.checkInvalidated||this.value.starting||this.value.checking||!a?.canInstall||!a.ticket)){this.patch({starting:!0,error:null,check:{...a,canInstall:!1,ticket:""}});try{let e=await this.call("update-start",{ticket:a.ticket});this.patch({status:e})}catch(e){this.patch({status:e?.code==="update/not-started"?{phase:"failed",message:e instanceof Error?e.message:"尚未启动更新，请重新检查"}:{phase:"unknown",message:"更新提交结果暂未确认，正在核对；请勿重复安装。"}})}finally{this.patch({starting:!1}),this.poll(),this.refreshInvalidatedCheck()}}};poll(){this.disposed||this.timer||!this.listeners.size||!this.active()||(this.timer=setTimeout(async()=>{try{let a=await this.call("update-status");if(!a||!["idle","preparing","installing","restart-required","complete","failed","unknown"].includes(a.phase))throw Error("invalid status");this.patch({status:a,error:a.phase==="idle"?"尚未发现已接受的更新，请重新检查后再操作。":null})}catch{this.patch({error:"更新状态暂不可用；恢复连接后继续核对，不会重复安装。"})}finally{this.timer=void 0,this.poll(),this.refreshInvalidatedCheck()}},2e3))}dispose(){this.disposed=!0,this.checkRevision++,this.checkInvalidated=!1,clearTimeout(this.timer),this.listeners.clear()}};var Re=()=>({loadState:"loading",qrState:"idle",status:null,host:null,runtime:null,localOrigin:null,qr:null,error:null,decisionError:null,deciding:!1}),qe=t=>t?.companionUpdate?.state?["preparing","installing","verifying","recovering"].includes(t.companionUpdate.state):void 0,de=class{constructor(a,e){this.describeHost=a;this.callManagement=e}updates;nativeUpdates;value=Re();listeners=new Set;timer;reading;pairing;disposed=!1;identity="";generation=0;getSnapshot=()=>this.value;subscribe=a=>this.disposed?()=>{}:(this.listeners.add(a),this.timer||(this.refresh(),this.timer=setInterval(()=>void this.refresh(),2e3)),()=>{this.listeners.delete(a),this.listeners.size||(clearInterval(this.timer),this.timer=void 0)});patch(a){if(!this.disposed){this.value={...this.value,...a};for(let e of this.listeners)e()}}async client(){let a=await ve(this.describeHost,this.callManagement);if(this.disposed)throw new Error("disposed");let e=`${a.host.agentInstanceId??a.host.computerName}/${a.runtime.profileScope??"web"}`;return this.identity&&this.identity!==e&&(this.generation++,this.value=Re(),this.updates?.dispose(),this.updates=void 0,this.nativeUpdates?.dispose(),this.nativeUpdates=void 0),this.identity=e,a.runtime.profileScope==="desktop"&&!this.nativeUpdates&&(this.nativeUpdates=new ye(this.callManagement)),this.updates?.origin!==a.localOrigin&&(this.updates?.dispose(),this.updates=a.localOrigin?new we(a.localOrigin):void 0),this.patch({host:a.host,runtime:a.runtime,localOrigin:a.localOrigin}),a}refresh=()=>this.disposed?Promise.resolve():this.reading?this.reading:(this.reading=(async()=>{try{let a=await this.client(),e=this.generation,n={...await a.status()};if(n.companionUpdate?.state==="complete"&&!n.plugin&&(n.companionUpdate={state:"unverified",message:"当前连接服务尚未提供运行版本核验，不能确认两端已对齐。若刚安装插件，请在任务结束后退出并重新打开当前应用；无需重新配对。"}),e!==this.generation)return;let r=qe(this.value.status),l=qe(n);l!==void 0&&l!==r&&this.nativeUpdates?.invalidateCheck(),this.patch({status:n,runtime:n.gate??a.runtime,loadState:"ready",error:null,...this.value.qr&&this.value.qr.expiresAt<=Date.now()?{qrState:"expired",qr:null}:{}})}catch{this.patch({loadState:"error",error:"连接服务暂未就绪。请确认 DSH 正在运行，然后重试。"})}})().finally(()=>{this.reading=void 0}),this.reading);generateQr=()=>this.disposed?Promise.resolve():this.pairing?this.pairing:(this.patch({qrState:"loading",qr:null,error:null}),this.pairing=(async()=>{try{let a=await this.client(),e=this.generation,n=await a.pairCode();if(e!==this.generation)return;if(!n?.qrDataUrl?.startsWith("data:image/")||!Number.isFinite(n.expiresAt)||n.expiresAt<=Date.now())throw new Error("invalid QR");this.patch({qr:n,qrState:"ready"}),await this.refresh()}catch{this.patch({qr:null,qrState:"error",error:"暂时无法生成配对二维码，请稍后重试。"})}})().finally(()=>{this.pairing=void 0}),this.pairing);decide=async a=>{let e=this.value.status?.companionUpdate?.offerId;if(!(this.disposed||this.value.deciding||!e)){this.patch({deciding:!0,decisionError:null});try{let n=await this.client();if(this.value.status?.companionUpdate?.offerId!==e)throw new Error("stale offer");await n.decide(e,a),await this.reading,await this.refresh()}catch{this.patch({decisionError:"更新选择未确认，请刷新后核对；不要重复安装。"})}finally{this.patch({deciding:!1})}}};dispose=()=>{this.disposed=!0,this.generation++,clearInterval(this.timer),this.timer=void 0,this.listeners.clear(),this.value=Re(),this.updates?.dispose(),this.updates=void 0,this.nativeUpdates?.dispose(),this.nativeUpdates=void 0}},Ve=new WeakMap;function _e(t,a){let e=Ve.get(t);return e||(e=new de(t,a),Ve.set(t,e)),e}var ne=ae(Q(),1),X=require("react/jsx-runtime");function xe({describeHost:t,callManagement:a,onDismiss:e,onOpenDetails:n,compact:r=!1,store:l=_e(t,a)}){let{status:d,deciding:i,decisionError:c,error:p,loadState:y}=(0,Le.useSyncExternalStore)(l.subscribe,l.getSnapshot,l.getSnapshot),m=d?.companionUpdate,R=c||p,g=(0,X.jsxs)("div",{children:[(0,X.jsx)(Oe,{value:m,compact:r,deciding:i||y!=="ready",onDecide:b=>void l.decide(b)}),!m&&!R?(0,X.jsx)("p",{className:ne.default.helpText,children:y==="loading"?"正在检查同一主机的另一端…":"另一端状态未确认；不会自动更新。"}):!r&&m?.state==="idle"?(0,X.jsx)("p",{className:ne.default.helpText,children:"未发现需要联动更新的另一端。当前节点可独立使用，不会自动安装另一端或启用已停用的插件。"}):null,R?(0,X.jsx)("p",{role:"alert",children:R}):null,e?(0,X.jsxs)("div",{className:ne.default.actions,children:[n?(0,X.jsx)("button",{type:"button",className:ne.default.primaryButton,onClick:n,children:"前往微信连接"}):null,(0,X.jsx)("button",{type:"button",className:ne.default.secondaryButton,onClick:e,children:"关闭提示（不会确认更新）"})]}):null]});return e?(0,X.jsx)(Je.Modal,{open:!0,title:"微信连接 · 联动更新",closeLabel:"关闭提示",className:ne.default.pageDialog,contentClassName:ne.default.pageDialogContent,onClose:e,children:g}):g}function oe(t,a,e=Date.now()){return!!(a?.allowed&&a.reason==="allowed"&&Number.isSafeInteger(a.validUntil)&&a.validUntil>e&&Number.isSafeInteger(t?.checkedAt)&&Number.isSafeInteger(t?.expiresAt)&&t.checkedAt>0&&t.expiresAt>t.checkedAt&&t.expiresAt-t.checkedAt<=6e4&&t.expiresAt>e&&Math.abs(e-t.checkedAt)<=6e4)}function $e(t){let a=t;if(!a||a.schemaVersion!==1||typeof a.nodeId!="string"||typeof a.groupEnabled!="boolean"||!Number.isSafeInteger(a.checkedAt)||!Number.isSafeInteger(a.expiresAt)||!a.features||["group_assistant","clawbot"].some(e=>{let n=a.features[e];return!n||typeof n.allowed!="boolean"||typeof n.reason!="string"||n.allowed&&(n.reason!=="allowed"||!Number.isSafeInteger(n.validUntil)||!n.validUntil||a.checkedAt<=0||a.expiresAt<=a.checkedAt||a.expiresAt-a.checkedAt>6e4)||n.message!==void 0&&typeof n.message!="string"}))throw new Error("使用资格暂不可用，请更新插件并刷新。");return a}var Ge=["local-plugin","relay-health","agent-connection"],Rt=Object.freeze({EAI_AGAIN:"dns",ENOTFOUND:"dns",ECONNREFUSED:"connection-refused",ECONNRESET:"connection-reset",EPIPE:"connection-reset",UND_ERR_SOCKET:"connection-reset",ENETUNREACH:"network-unreachable",EHOSTUNREACH:"network-unreachable",ENETDOWN:"network-unreachable",ETIMEDOUT:"timeout",UND_ERR_CONNECT_TIMEOUT:"timeout",UND_ERR_HEADERS_TIMEOUT:"timeout",UND_ERR_BODY_TIMEOUT:"timeout",CERT_HAS_EXPIRED:"tls-validation",CERT_NOT_YET_VALID:"tls-validation",DEPTH_ZERO_SELF_SIGNED_CERT:"tls-validation",SELF_SIGNED_CERT_IN_CHAIN:"tls-validation",UNABLE_TO_VERIFY_LEAF_SIGNATURE:"tls-validation",UNABLE_TO_GET_ISSUER_CERT:"tls-validation",UNABLE_TO_GET_ISSUER_CERT_LOCALLY:"tls-validation",CERT_UNTRUSTED:"tls-validation",CERT_REVOKED:"tls-validation",ERR_TLS_CERT_ALTNAME_INVALID:"tls-validation",ERR_TLS_CERT_SIGNATURE_ALGORITHM_UNSUPPORTED:"tls-validation"}),De={dns:["无法解析服务域名","请检查当前网络的域名解析，必要时联系网络管理员。"],"connection-refused":["连接被拒绝","请稍后重试，或请网络管理员检查访问策略。"],"connection-reset":["连接意外中断","请稍后重试；若持续发生，请联系网络管理员检查连接链路。"],"network-unreachable":["网络不可达","请确认电脑联网，或联系网络管理员。"],timeout:["检查超时","请确认电脑网络可用后重试；超时本身不能确定具体原因。"],"tls-validation":["安全证书无法验证","请联系网络管理员核查证书链和电脑时间；不要关闭证书验证。"],"proxy-auth-required":["代理要求认证","请联系网络管理员确认此应用的代理认证配置。"],"request-rejected":["服务拒绝了请求","请将诊断报告交给开发者；此状态不能单独判断账号、时钟或网络策略原因。"],"rate-limited":["请求过于频繁","请稍后再检查，避免连续发起检查。"],"server-error":["服务暂时异常","请稍后重试；若持续发生，请将报告交给开发者。"],"invalid-response":["返回内容不符合预期","可能收到登录页、重定向或异常内容；请将报告交给开发者。"],cancelled:["检查已取消","可在需要时重新检查。"],unknown:["暂时无法确定原因","请将诊断报告交给开发者，不必提供二维码或配对凭据。"]};function Pt(t){return t!==null&&typeof t=="object"&&!Array.isArray(t)?t:{}}function B(t,a){try{return Pt(t)[a]}catch{return}}function Pe(t,a,e){return typeof t=="string"&&a.includes(t)?t:e}function We(t){return typeof t=="string"&&t.length<=48&&/^\d{1,4}\.\d{1,4}\.\d{1,4}(?:-(?:rc|alpha|beta|preview|dev|history)(?:[.-]\d{1,8})*)?$/.test(t)?t:void 0}function Dt(t){if(typeof t!="string"||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(t))return;let a=Date.parse(t);return Number.isFinite(a)&&new Date(a).toISOString()===t?t:void 0}function Ae(t){let a=B(t,"code"),n={code:typeof a=="string"&&Object.hasOwn(De,a)?a:"unknown"},r=B(t,"systemCode"),l=B(t,"httpStatus");return typeof r=="string"&&Object.hasOwn(Rt,r)&&(n.systemCode=r),typeof l=="number"&&Number.isInteger(l)&&l>=100&&l<=599&&(n.httpStatus=l),n}function At(t){if(B(t,"schema")!==1||B(t,"source")!=="plugin")return null;let a=Dt(B(t,"startedAt")),e=B(t,"checks");if(!a||!Array.isArray(e)||e.length!==Ge.length)return null;let n=[];for(let l of Ge){let d=e.find(y=>B(y,"id")===l),i=B(d,"status"),c=B(d,"durationMs");if(i!=="pass"&&i!=="fail"&&i!=="not-tested"&&i!=="cancelled")return null;let p={id:l,status:i};typeof c=="number"&&Number.isFinite(c)&&(p.durationMs=Math.max(0,Math.min(2e4,Math.round(c)))),(i==="fail"||i==="cancelled")&&Object.assign(p,Ae(d)),n.push(p)}let r=We(B(t,"dshVersion"));return{schema:1,source:"plugin",startedAt:a,pluginRunningVersion:We(B(t,"pluginRunningVersion"))||"unknown",...r?{dshVersion:r}:{},platform:Pe(B(t,"platform"),["win32","darwin","linux","freebsd","openbsd","aix","sunos","unknown"],"unknown"),profileKind:Pe(B(t,"profileKind"),["desktop","web","unknown"],"unknown"),relayEnabled:B(t,"relayEnabled")===!0,relayState:Pe(B(t,"relayState"),["disabled","enrolling","connecting","online","offline","unknown"],"unknown"),checks:n}}function Te(t){try{return At(t)}catch{return null}}function Xe(t){return De[Ae({code:t}).code][0]}function Ke(t){return De[Ae({code:t}).code][1]}function Ye(t){return t==="local-plugin"?"本地插件服务":t==="relay-health"?"公网 HTTPS 基础检查":t==="agent-connection"?"当前业务连接（仅观察状态）":"未知检查"}function Qe(t){let a=Te(t);return a?JSON.stringify(a,null,2):"诊断报告不可用"}var Ze=()=>({diagnosticState:"idle",diagnosticReport:null}),Ce=class{constructor(a,e){this.describeHost=a;this.callManagement=e}value=Ze();listeners=new Set;active;disposed=!1;getSnapshot=()=>this.value;subscribe=a=>this.disposed?()=>{}:(this.listeners.add(a),()=>{this.listeners.delete(a),this.listeners.size||this.reset()});publish(a){if(!this.disposed){this.value=a;for(let e of this.listeners)try{e()}catch{}}}diagnose=()=>{if(this.disposed)return Promise.resolve();if(this.active)return this.active.promise;let a=new AbortController,e={controller:a,promise:Promise.resolve()};return this.active=e,e.promise=Promise.resolve().then(async()=>{try{if(a.signal.aborted)return;let n=await ve(this.describeHost,this.callManagement);if(this.active!==e)return;let r=await n.diagnose(a.signal);if(this.active!==e)return;let l=Te(r);if(!l)throw new Error("invalid diagnostic report");this.publish({diagnosticState:"ready",diagnosticReport:l})}catch(n){if(this.active!==e)return;let r=B(n,"code");this.publish({diagnosticState:typeof r=="string"&&["diagnostic-unsupported","diagnostic/unsupported","pairing/not-found","endpoint-not-found","not-found","not_found","unknown-endpoint","unimplemented"].includes(r)?"unsupported":"error",diagnosticReport:null})}}).finally(()=>{this.active===e&&(this.active=void 0)}),this.publish({diagnosticState:"running",diagnosticReport:null}),e.promise};cancel=(a=!1)=>{let e=this.active;if(!(!e&&(!a||this.value.diagnosticState==="idle"&&!this.value.diagnosticReport))){this.active=void 0;try{e?.controller.abort()}catch{}this.publish({diagnosticState:a?"idle":"cancelled",diagnosticReport:null})}};reset=()=>{this.cancel(!0)};dispose=()=>{this.disposed=!0,this.listeners.clear(),this.reset(),this.value=Ze()}};var ce=require("react"),et=ae(Q(),1),K=require("react/jsx-runtime");function tt({wide:t,openPlugin:a}){let[e,n]=(0,ce.useState)(!1),[r,l]=(0,ce.useState)(!1),d=(0,ce.useRef)(!1),i=async()=>{if(!d.current){d.current=!0,l(!0);try{await a()||n(!0)}finally{d.current=!1,l(!1)}}};return(0,K.jsxs)(K.Fragment,{children:[(0,K.jsxs)("button",{type:"button",className:et.default.sidebarButton,"data-wide":t,title:"微信连接","aria-label":"微信连接",disabled:r,onClick:()=>void i(),children:[(0,K.jsxs)("svg",{width:"20",height:"20",viewBox:"0 0 24 24",fill:"none",stroke:"currentColor",strokeWidth:"1.7","aria-hidden":"true",children:[(0,K.jsx)("path",{d:"M20 11.5a8 8 0 0 1-8 8 9 9 0 0 1-3.5-.7L4 20l1.2-4.2A7.8 7.8 0 0 1 4 11.5a8 8 0 0 1 16 0Z"}),(0,K.jsx)("path",{d:"M8 11.5h.01M12 11.5h.01M16 11.5h.01",strokeWidth:"2.5",strokeLinecap:"round"})]}),t?(0,K.jsx)("span",{children:r?"正在打开…":"微信连接"}):null]}),e?(0,K.jsx)("small",{role:"status",children:"插件详情暂不可用，请打开「设置 → 微信连接」。"}):null]})}async function at(t){try{let a=t("pluginNavigation"),e=t("remote.pluginManager");if(typeof a?.openBundle!="function"||typeof e?.listBundles!="function")return!1;let n=await e.listBundles();if(!n.ok||!Array.isArray(n.value))return!1;let r=n.value.filter(d=>d.enabled&&["dsh-wechat-remote","@harness-remote/dsh-wechat-remote"].includes(d.name));if(r.length!==1)return!1;let l=t("pluginNavigation");return l!==a||typeof l.openBundle!="function"?!1:(l.openBundle(r[0].name),!0)}catch{return!1}}var ke=require("react"),ht=require("@deepseek-ai/dsh-client-ui-primitives"),P=ae(Q(),1);var nt=require("react"),j=ae(Q(),1),f=require("react/jsx-runtime");function rt({store:t,embedded:a=!1}){let{check:e,checking:n,progress:r,error:l,copied:d,resumeFailed:i}=(0,nt.useSyncExternalStore)(t.subscribe,t.getSnapshot,t.getSnapshot),c=!!(r&&!r.terminal),p=c||r?.phase==="unknown"||e?.mode==="busy";return(0,f.jsxs)("div",{className:a?j.default.updateEndpoint:j.default.updateCard,children:[(0,f.jsxs)("div",{className:j.default.updateRow,children:[(0,f.jsxs)("div",{className:j.default.updateCopy,children:[(0,f.jsxs)("strong",{children:["Web ",(0,f.jsx)("span",{className:j.default.updateScope,children:"当前端"})]}),e?(0,f.jsxs)("div",{className:j.default.updateVersions,children:[(0,f.jsxs)("span",{children:["DSH ",(0,f.jsx)("strong",{children:e.advice.current.agentVersion||"未确认"})]}),(0,f.jsxs)("span",{children:["插件运行 ",(0,f.jsx)("strong",{children:e.advice.current.pluginVersion||"未确认"})]}),e.channel==="preview"?(0,f.jsx)("span",{children:"预览通道"}):null]}):null]}),(0,f.jsxs)("div",{className:j.default.updateControl,children:[(0,f.jsx)("button",{type:"button",className:j.default.secondaryButton,disabled:n||c,onClick:()=>void t.refresh(),children:n?"检查中…":"检查更新"}),e&&!n?(0,f.jsx)("strong",{className:j.default.updateLabel,"data-severity":p?"unknown":e.advice.severity,role:"status",children:c?"正在更新 Web 插件":p?"更新状态待核对":e.advice.label}):null,e?.advice.checkedAt&&e.advice.severity!=="unknown"?(0,f.jsxs)("small",{className:j.default.updateChecked,children:["检查于 ",new Date(e.advice.checkedAt).toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"})]}):null]})]}),e?(0,f.jsx)(f.Fragment,{children:n?null:(0,f.jsxs)(f.Fragment,{children:[!p&&e.advice.targetVersion?(0,f.jsxs)("p",{children:["可更新至 ",e.advice.targetVersion,e.mode==="manual"?" · 需手动更新":""]}):null,!p&&(e.advice.severity==="unknown"||e.advice.severity==="required"||e.mode==="manual")?(0,f.jsxs)("details",{children:[(0,f.jsx)("summary",{children:e.mode==="manual"?"手动更新说明":"查看说明"}),e.reason?(0,f.jsx)("p",{children:e.reason}):null,(0,f.jsx)("p",{children:e.advice.message})]}):null,!p&&e.mode==="manual"&&e.manualCommand?(0,f.jsxs)("div",{className:j.default.updateCommand,children:[(0,f.jsx)("code",{children:e.manualCommand}),(0,f.jsx)("button",{type:"button",className:j.default.secondaryButton,disabled:c,onClick:()=>void t.copyCommand(),children:d?"已复制":"复制命令"})]}):null,!p&&e.canInstall?(0,f.jsxs)(f.Fragment,{children:[(0,f.jsx)("div",{className:j.default.updateActions,children:(0,f.jsx)("button",{type:"button",className:j.default.primaryButton,disabled:c||!!l,onClick:()=>void t.install(),children:"更新 Web 并重启"})}),(0,f.jsx)("small",{className:j.default.updateChecked,children:"仅更新 Web，保留配对与会话；连接会短暂中断。"})]}):null]})}):null,l?(0,f.jsx)("p",{role:"alert",children:l}):null,r?(0,f.jsxs)("div",{role:"status","aria-live":"polite",children:[!r.terminal||r.ok===!0?(0,f.jsx)("progress",{className:j.default.updateProgress,max:100,value:r.progress}):null,(0,f.jsx)("p",{children:r.message}),i?(0,f.jsx)("p",{role:"alert",children:"插件已完成更新，但未能自动打开 WebUI。请使用 DSH 启动时显示的地址打开，无需重复更新。"}):null]}):null]})}var st=require("react"),z=ae(Q(),1),x=require("react/jsx-runtime");function it({store:t,embedded:a=!1}){let{check:e,status:n,checking:r,starting:l,error:d}=(0,st.useSyncExternalStore)(t.subscribe,t.getSnapshot,t.getSnapshot),i=l||n?.phase==="preparing"||n?.phase==="installing",c=n&&["preparing","installing","restart-required","unknown"].includes(n.phase),p=n?.phase==="restart-required"||n?.phase==="complete",y=n?.phase==="restart-required"?"已安装，待重新打开 Desktop":n?.phase==="unknown"?"更新结果待核对":n?.phase==="failed"?"更新未完成":i?"正在更新 Desktop 插件":n?.phase==="complete"?"更新已生效":"";return(0,x.jsxs)("div",{className:a?z.default.updateEndpoint:z.default.updateCard,children:[(0,x.jsxs)("div",{className:z.default.updateRow,children:[(0,x.jsxs)("div",{className:z.default.updateCopy,children:[(0,x.jsxs)("strong",{children:["Desktop ",(0,x.jsx)("span",{className:z.default.updateScope,children:"当前端"})]}),e?(0,x.jsxs)("div",{className:z.default.updateVersions,children:[(0,x.jsxs)("span",{children:["DSH ",(0,x.jsx)("strong",{children:e.advice.current.agentVersion||"未确认"})]}),(0,x.jsxs)("span",{children:["插件运行 ",(0,x.jsx)("strong",{children:e.advice.current.pluginVersion||"未确认"})]}),p&&n.targetVersion&&n.targetVersion!==e.advice.current.pluginVersion?(0,x.jsxs)("span",{children:["已安装 ",(0,x.jsx)("strong",{children:n.targetVersion})]}):null,e.channel==="preview"?(0,x.jsx)("span",{children:"预览通道"}):null]}):null]}),(0,x.jsxs)("div",{className:z.default.updateControl,children:[(0,x.jsx)("button",{type:"button",className:z.default.secondaryButton,disabled:r||i,onClick:()=>void t.refresh(),children:r?"检查中…":"检查更新"}),e?(0,x.jsx)("strong",{className:z.default.updateLabel,"data-severity":n?.phase==="failed"?"required":n?.phase==="complete"?"none":c?n?.phase==="unknown"?"unknown":"info":e.advice.severity,children:y||e.advice.label}):null,e?.advice.checkedAt?(0,x.jsxs)("small",{className:z.default.updateChecked,children:["检查于 ",new Date(e.advice.checkedAt).toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"})]}):null]})]}),e?(0,x.jsxs)(x.Fragment,{children:[!p&&!c&&e.advice.targetVersion?(0,x.jsxs)("p",{children:["可更新至 ",e.advice.targetVersion]}):null,!c&&e.reason?(0,x.jsx)("p",{children:e.reason}):null,!c&&e.canInstall?(0,x.jsxs)(x.Fragment,{children:[(0,x.jsx)("div",{className:z.default.updateActions,children:(0,x.jsx)("button",{type:"button",className:z.default.primaryButton,disabled:i||r,onClick:()=>void t.install(),children:"更新 Desktop 插件"})}),(0,x.jsx)("small",{className:z.default.updateChecked,children:"仅更新 Desktop，保留配对与会话；完成后需退出并重新打开。"})]}):null]}):null,n?.phase!=="idle"&&n?(0,x.jsxs)("div",{role:"status","aria-live":"polite",children:[i?(0,x.jsx)("progress",{className:z.default.updateProgress,"aria-label":"Desktop 插件更新中"}):null,n.phase==="restart-required"?(0,x.jsx)("p",{className:z.default.updatePeerNote,children:"任务结束后，选择「应用 → 退出」再打开 Desktop；无需重新配对，Web 不受影响。"}):n.phase!=="complete"?(0,x.jsx)("p",{children:n.message}):null]}):null,d?(0,x.jsx)("p",{role:"alert",children:d}):null]})}var O=require("react");var _=ae(Q(),1),o=require("react/jsx-runtime"),pe=t=>t.state==="installed"&&(t.nativeState===void 0||t.nativeState==="installed"),Tt=t=>pe(t)?"已安装":t.state==="draft"?"待安装":t.nativeState==="uninstalled"?"未安装":t.nativeState==="disabled"?"已停用":t.state==="pending-restart"?"待重启":"待核对",He=t=>t.templateId==="designer"||t.id==="designer"?"定制我的助手":t.name;function ot({label:t,children:a}){let e=(0,O.useId)();return(0,o.jsxs)("span",{className:_.default.assistantHelpAnchor,children:[(0,o.jsx)("button",{type:"button",className:_.default.assistantHelpButton,"aria-label":t,"aria-describedby":e,children:"?"}),(0,o.jsx)("span",{id:e,className:_.default.assistantTooltip,role:"tooltip",children:a})]})}function lt({store:t,featureCall:a}){let{catalog:e,preview:n,busy:r,message:l,error:d}=(0,O.useSyncExternalStore)(t.subscribe,t.getSnapshot,t.getSnapshot),i=(0,O.useRef)(),[c,p]=(0,O.useState)(),[y,m]=(0,O.useState)(""),[R,g]=(0,O.useState)(!1),b=(0,O.useRef)(!1),k=(0,O.useRef)(0),N=async s=>{if(!a||b.current)return;b.current=!0;let I=k.current;g(!0);try{let $=await a(s===void 0?{action:"status"}:{action:"group.enabled",enabled:s});if(I!==k.current)return;p($),m(""),s!==void 0&&t.load()}catch($){I===k.current&&(p(void 0),m($ instanceof Error?$.message:"暂时无法核对资格。"))}finally{I===k.current&&(b.current=!1,g(!1))}};(0,O.useEffect)(()=>{k.current++,b.current=!1,p(void 0),N();let s=setInterval(()=>void N(),15e3);return()=>{k.current++,b.current=!1,clearInterval(s)}},[a]);let E=c?.features.group_assistant,M=oe(c,E),G=M&&c?.groupEnabled===!0;(0,O.useEffect)(()=>{let s=new AbortController;return i.current=s,t.load(),()=>s.abort()},[t]);let T=e?.drafts||[],ee=T.filter(s=>pe(s)&&!s.replacement),re=T.filter(s=>s.state==="draft"),F=T.filter(s=>s.source!=="builtin"&&s.state!=="draft"&&(!pe(s)||s.replacement)),D=e?.templates||[],ie=s=>ee.find(I=>I.templateId===s),A=s=>void t.start(s.presetId,i.current?.signal),H=s=>s.id==="designer"||s.templateId==="designer"?"先打开定制会话，说清职业和工作习惯；助手会设计可复用的模式。确认安装后，再用新模式开启工作会话。不会自动安装或发送消息。":`先选工作区，再用「${s.name}」开始空白会话。手机连接此电脑后可继续该会话；发卡与提醒需在小程序设置中开启「微信群协作助手」。`,W=s=>{let I=ie(s.id),$=s.builtin,ue=T.find(he=>he.templateId===s.id&&he.source==="builtin");return(0,o.jsxs)("article",{className:_.default.assistantChoice,"data-installed":!!I,children:[(0,o.jsxs)("div",{className:_.default.assistantChoiceCopy,children:[(0,o.jsxs)("div",{className:_.default.assistantChoiceHead,children:[(0,o.jsx)("strong",{children:He(s)}),(0,o.jsx)(ot,{label:`${He(s)}使用说明`,children:H(s)})]}),(0,o.jsx)("p",{children:s.id==="designer"?"用对话设计适合自己职业的助手模式":s.description})]}),!I&&$?(0,o.jsx)("span",{className:_.default.assistantUnavailable,title:ue?.reason||$.reason,children:ue?.nativeState==="disabled"?"已停用":"待就绪"}):null,(0,o.jsx)("button",{type:"button",className:_.default.secondaryButton,disabled:r||!!($&&!I),onClick:()=>I?A(I):$?void t.load():void t.choose(s.id),children:I?s.id==="designer"?"开始定制":"开始使用":$?"开始使用":"安装"})]},s.id)},Y=s=>(0,o.jsxs)("div",{className:_.default.assistantEntry,children:[(0,o.jsxs)("div",{className:_.default.assistantEntryHead,children:[(0,o.jsx)("strong",{children:He(s)}),(0,o.jsx)("span",{children:Tt(s)})]}),s.replacement?(0,o.jsxs)("div",{children:[(0,o.jsxs)("p",{children:["已提供内置「",s.replacement.name,"」，无需再装同款独立包。"]}),(0,o.jsx)("p",{children:s.replacement.warning}),s.replacement.canRemoveAfterReview?(0,o.jsxs)("p",{children:["核对旧会话后，可在 DSH 插件列表卸载：",(0,o.jsx)("code",{children:s.replacement.bundleName})]}):null]}):null,pe(s)?(0,o.jsx)("button",{type:"button",className:_.default.assistantSecondary,disabled:r,onClick:()=>A(s),children:"开始使用"}):s.state==="draft"?(0,o.jsx)("button",{type:"button",className:_.default.assistantPrimary,disabled:r,onClick:()=>void t.preview(s.id,s.version),children:"查看并安装"}):(0,o.jsxs)(o.Fragment,{children:[(0,o.jsx)("button",{type:"button",className:_.default.assistantSecondary,disabled:r,onClick:()=>void t.verify(s.id,s.version),children:"刷新状态"}),s.nativeState==="uninstalled"&&!s.replacement?(0,o.jsx)("button",{type:"button",className:_.default.assistantSecondary,disabled:r,onClick:()=>void t.reinstall(s.id,s.version),children:"查看并重新安装"}):null]}),!pe(s)&&s.reason?(0,o.jsxs)("details",{className:_.default.assistantDetails,children:[(0,o.jsx)("summary",{children:"状态说明"}),(0,o.jsx)("p",{children:s.reason})]}):null]},`${s.id}:${s.version}`);return(0,o.jsxs)("section",{className:_.default.assistantsCard,"aria-label":"微信群协作助手","aria-busy":r,children:[(0,o.jsxs)("div",{className:_.default.assistantsHeading,children:[(0,o.jsxs)("div",{className:_.default.assistantChoiceHead,children:[(0,o.jsx)("h3",{children:"微信群协作助手"}),(0,o.jsx)(ot,{label:"电脑助手与手机群协作",children:"需要群协作资格、有效公网访问和剩余流量。开启本节点助手后，再在小程序设置中开启手机入口。暂停不删除资料，不取消 DSH 已开始的任务。"})]}),(0,o.jsx)("button",{type:"button",className:_.default.assistantTextButton,disabled:r||R,onClick:()=>{N(),t.load()},children:r||R?"读取中…":"刷新"})]}),(0,o.jsxs)("div",{className:_.default.clawbotReceiveRow,children:[(0,o.jsxs)("div",{children:[(0,o.jsx)("strong",{children:"启用本节点助手"}),(0,o.jsx)("p",{className:_.default.clawbotNote,role:"status",children:y||(M?c?.groupEnabled?"已开启":"有使用资格，尚未开启":E?.message||"请联网核对资格，在小程序设置中兑换体验码。")})]}),(0,o.jsxs)("label",{className:_.default.clawbotToggle,children:[(0,o.jsx)("input",{type:"checkbox",role:"switch","aria-label":"启用本节点助手",checked:c?.groupEnabled||!1,disabled:R||!a||!M&&!c?.groupEnabled,onChange:s=>void N(s.target.checked)}),(0,o.jsx)("span",{className:_.default.clawbotSwitchTrack,"aria-hidden":!0})]})]}),(0,o.jsxs)("fieldset",{className:_.default.assistantFeatureBody,disabled:!G||R,"aria-label":"助手功能",children:[!e&&!d?(0,o.jsx)("p",{role:"status",children:"正在读取当前电脑的助手…"}):null,e&&!e.native?.supported?(0,o.jsx)("p",{role:"status",children:e.native?.reason||"当前 DSH 暂不支持安装助手，请先检查版本。"}):null,e&&(e.native?.supported||D.some(s=>s.builtin))?(0,o.jsxs)(o.Fragment,{children:[(0,o.jsx)("div",{className:_.default.assistantChoices,children:D.filter(s=>["teacher","project"].includes(s.id)).map(W)}),D.some(s=>s.id==="designer")?(0,o.jsx)("div",{className:_.default.assistantCustomize,children:D.filter(s=>s.id==="designer").map(W)}):null]}):null,n?(0,o.jsxs)("div",{className:_.default.assistantPreview,"aria-label":"安装助手预览",children:[(0,o.jsxs)("h4",{children:["安装「",n.definition.name,"」"]}),(0,o.jsx)("p",{children:n.definition.description}),(0,o.jsx)("p",{children:"新增一个可选的助手模式，不改默认模式、已有会话和资料。"}),(0,o.jsxs)("details",{className:_.default.assistantDetails,children:[(0,o.jsx)("summary",{children:"查看工作方式与安装详情"}),(0,o.jsx)("p",{children:n.definition.role}),(0,o.jsx)("ul",{children:n.definition.methods.map((s,I)=>(0,o.jsx)("li",{children:s},I))}),(0,o.jsx)("p",{children:"助手会逐步了解："}),(0,o.jsx)("ul",{children:n.definition.onboarding.map(s=>(0,o.jsxs)("li",{children:[s.label,"：",s.prompt]},s.key))}),(0,o.jsxs)("small",{children:["第 ",n.version," 版 · 内容摘要 ",n.digest.slice(0,12)," · 基础模式 ",n.native.basePreset]}),(0,o.jsx)("ul",{children:(n.native.warnings||[]).map((s,I)=>(0,o.jsx)("li",{children:s},I))})]}),(0,o.jsxs)("div",{className:_.default.assistantButtons,children:[(0,o.jsx)("button",{type:"button",className:_.default.assistantPrimary,disabled:r,onClick:()=>void t.install(),children:"确认安装"}),(0,o.jsx)("button",{type:"button",className:_.default.assistantSecondary,disabled:r,onClick:()=>t.dismissPreview(),children:"暂不安装"})]})]}):null,re.length?(0,o.jsxs)("div",{children:[(0,o.jsx)("h4",{children:"待安装的助手"}),re.map(Y)]}):null,ee.some(s=>!["teacher","project","designer"].includes(s.templateId))?(0,o.jsxs)("div",{children:[(0,o.jsx)("h4",{children:"我已安装的其他助手"}),ee.filter(s=>!["teacher","project","designer"].includes(s.templateId)).map(Y)]}):null,F.length||D.some(s=>!["teacher","project","designer"].includes(s.id))?(0,o.jsxs)("details",{className:_.default.assistantDetails,children:[(0,o.jsx)("summary",{children:"更多助手与安装记录"}),e?.native?.supported?(0,o.jsx)("div",{className:_.default.assistantChoices,children:D.filter(s=>!["teacher","project","designer"].includes(s.id)).map(W)}):null,F.length?(0,o.jsxs)("details",{className:_.default.assistantDetails,children:[(0,o.jsxs)("summary",{children:["以前安装的助手（",F.length,"）"]}),(0,o.jsx)("p",{children:"旧会话可能仍在使用旧模式；卸载前请核对，聊天与资料不会在这里删除。"}),F.map(Y)]}):null]}):null,l?(0,o.jsx)("p",{role:"status",children:l}):null,d?(0,o.jsx)("p",{role:"alert",children:d}):null]})]})}var U=require("react");var w=ae(Q(),1),u=require("react/jsx-runtime"),dt={wait:"打开微信首页「＋ → 扫一扫」",scaned:"已扫码，请在微信中确认",need_verifycode:"请输入微信显示的验证码",expired:"绑定码已过期",verify_code_blocked:"验证码暂不可用，请稍后重新绑定",scaned_but_redirect:"请按微信提示继续确认",binded_redirect:"微信已有连接，请核对原节点"},ct=(t,a)=>!!(t&&["wait","scaned","scaned_but_redirect","need_verifycode"].includes(t.status)&&(t.expiresAt===void 0||t.expiresAt>a)),Ht=new Set(["正在继续微信确认流程","请用手机微信扫描二维码并确认连接","请继续完成手机微信中的确认","请输入手机微信显示的数字验证码","二维码已过期，请重新生成。","请用微信扫一扫扫描电脑上的二维码，并在微信中确认。","已暂停接入；DSH 中已经开始的任务不会被取消。","微信已绑定。选择目标会话并开启接入后，即可在 ClawBot 私聊。","微信确认本节点已有绑定。选择会话并开启接入后即可使用。","原微信连接已失效，请重新绑定。","微信连接已失效，请重新绑定。","已移除此节点的本地绑定。未完成的渠道消息已停止续发；电脑上已开始的任务仍会继续。这不是腾讯账号端的撤销授权。"]);function pt({call:t,nodeName:a,hostName:e}){let[n,r]=(0,U.useState)(),[l,d]=(0,U.useState)([]),[i,c]=(0,U.useState)(""),[p,y]=(0,U.useState)(!1),[m,R]=(0,U.useState)(""),[g,b]=(0,U.useState)(""),[k,N]=(0,U.useState)(Date.now),E=(0,U.useRef)(n);E.current=n;let M=(0,U.useRef)(!1),G=(0,U.useRef)(!1),T=(0,U.useRef)(null),ee=(0,U.useRef)(null),re=(0,U.useRef)(null),F=(0,U.useRef)(0),D=async(v,q=!1,L=!1)=>{if((["login.start","login.poll","route"].includes(v.action)||v.action==="enabled"&&v.enabled)&&!oe(E.current?.access,E.current?.access))return;let ge=v.action==="login.poll"?ee:re;if(T.current&&!(v.action==="login.cancel"&&T.current.action==="login.poll")||q&&ge.current)return;let fe={};q?ge.current=fe:(T.current={action:v.action,token:fe},F.current++);let me=F.current;q||(y(!0),R(""));try{let le=v;if(L){let te=await t({action:"enabled",enabled:!1,expectedRevision:v.expectedRevision});if(!G.current||me!==F.current)return;if("sessions"in te||te.enabled||te.revision<=(v.expectedRevision??-1)||E.current&&te.revision<E.current.revision)throw new Error("状态已变化，请刷新后重试。");E.current=te,r(te),le={...v,expectedRevision:te.revision}}let se=await t(le);if(!G.current||me!==F.current)return;if("sessions"in se)d(se.sessions);else{if(E.current&&se.revision<E.current.revision)return;let te=E.current;E.current=se,r(se),R(""),te?.pairing?.id!==se.pairing?.id&&b(""),(!M.current||v.action==="route")&&(M.current=!1,c(se.target?.id||""))}}catch(le){G.current&&me===F.current&&(v.action!=="login.poll"||E.current?.pairing?.id===v.loginId)&&R(le instanceof Error?le.message:"暂时无法读取状态")}finally{q?ge.current===fe&&(ge.current=null):T.current?.token===fe&&(T.current=null,G.current&&me===F.current&&y(!1))}};(0,U.useEffect)(()=>{G.current=!0,E.current=void 0,M.current=!1,r(void 0),d([]),c(""),b(""),R(""),D({action:"status"});let v=setInterval(()=>{let q=Date.now();N(q);let L=E.current?.pairing;oe(E.current?.access,E.current?.access,q)&&L&&ct(L,q)&&L.status!=="need_verifycode"&&D({action:"login.poll",loginId:L.id},!0),D({action:"status"},!0)},4e3);return()=>{G.current=!1,F.current++,T.current=null,ee.current=null,re.current=null,clearInterval(v)}},[t]);let ie=async()=>{await D({action:"status"}),await D({action:"sessions"})},A=n?.pairing,H=ct(A,k),W=n?.bindingState==="expired",Y=!!(n?.paired&&!W),s=oe(n?.access,n?.access,k),I=!!(s&&Y&&n?.target&&!H),$=n?s?H?"绑定完成后可开启":W?"请重新绑定":Y?n?.target?n.enabled?n.state==="ready"?"接收中":n.state==="error"?"连接异常":"连接中":"已暂停":"选择会话后可开启":"绑定后可开启":n.access?.message||"暂时无法核对使用资格":"读取中",ue=n?H?A?.status==="wait"?"等待扫码":A?.status==="need_verifycode"?"等待确认码":"等待微信确认":W?"绑定已失效":Y?"已绑定此节点":"未绑定":"读取中",he=!!(A&&(H||!Y)),mt=A&&(!H&&A.expiresAt!==void 0&&A.expiresAt<=k?dt.expired:dt[A.status]||"请重新显示绑定码"),Ne=new Map;for(let v of l){let q=v.workspaceId||"",L=Ne.get(q)||{title:v.workspaceTitle||"未分组",sessions:[]};L.sessions.push(v),Ne.set(q,L)}let bt=v=>!v.title||/^(未命名|新会话|New chat|Untitled)$/i.test(v.title)?`${v.title||"未命名"} · ${v.id.slice(-8)}`:v.title,Ee=()=>{!n||!s||H||n.paired&&!window.confirm((n.enabled?"将先暂停私聊接入，再重新绑定当前节点。":"重新绑定当前节点？")+`
微信可能提示替换已有连接，请核对后确认。完成后需手动开启接收。`)||D({action:"login.start",expectedRevision:n.revision},!1,n.paired&&n.enabled)},vt=()=>{n?.paired&&window.confirm((n.enabled?"将先暂停私聊接入，再移除此节点的绑定。":"移除此节点的绑定？")+`
不会删除会话，也不会解除微信端的授权。`+(n.pending?`
未完成的微信消息将停止处理和发送；电脑上已开始的任务仍会继续，请到原会话查看。`:""))&&D({action:"disconnect",expectedRevision:n.revision,abandonPending:n.pending>0},!1,n.enabled)};return(0,u.jsxs)("section",{className:`${w.default.updateCard} ${w.default.clawbotCard}`,"aria-label":"微信 ClawBot 私聊接线",children:[(0,u.jsxs)("div",{className:w.default.clawbotHead,children:[(0,u.jsxs)("h3",{className:w.default.updateHeading,children:[(0,u.jsx)("span",{className:w.default.clawbotMark,"aria-hidden":!0}),"微信 ClawBot 私聊接线 ",(0,u.jsx)("small",{children:"实验性"})]}),(0,u.jsxs)("button",{type:"button","aria-label":"刷新",className:w.default.clawbotTextButton,disabled:p,onClick:()=>void ie(),children:[(0,u.jsx)("span",{"aria-hidden":!0,children:"↻ "}),"刷新"]})]}),(0,u.jsxs)("p",{className:w.default.clawbotNode,children:["当前节点：",a||"读取中",e?" · "+e:""]}),(0,u.jsxs)("div",{className:w.default.clawbotSection,"aria-label":"节点绑定",children:[(0,u.jsxs)("div",{className:w.default.clawbotRow,children:[(0,u.jsx)("strong",{children:"节点绑定"}),(0,u.jsx)("span",{className:w.default.clawbotStatus,"data-state":H?"pending":W?"expired":Y?"paired":"unpaired",role:"status",children:ue})]}),he&&A?(0,u.jsxs)("div",{className:w.default.clawbotPairing,children:[H&&A.status==="wait"?(0,u.jsx)("img",{src:A.qrDataUrl,width:"180",height:"180",alt:"微信 ClawBot 节点绑定码"}):null,(0,u.jsxs)("div",{className:w.default.clawbotPairingCopy,children:[(0,u.jsx)("strong",{role:"status",children:mt}),H&&A.status==="wait"?(0,u.jsx)("p",{className:w.default.clawbotNote,children:"用微信首页扫一扫扫描此码，再确认绑定。此码不是小程序配对码。"}):null,H&&A.status==="need_verifycode"?(0,u.jsxs)("form",{onSubmit:v=>{v.preventDefault(),D({action:"login.poll",loginId:A.id,verifyCode:g}),b("")},children:[(0,u.jsx)("input",{"aria-label":"微信验证码",value:g,autoComplete:"off",inputMode:"numeric",maxLength:16,onChange:v=>b(v.target.value)}),(0,u.jsx)("button",{type:"submit",className:w.default.primaryButton,disabled:!s||p||!/^\d{1,16}$/.test(g),children:"确认验证码"})]}):null,(0,u.jsxs)("div",{className:w.default.clawbotActions,children:[H?null:(0,u.jsx)("button",{type:"button",className:w.default.primaryButton,disabled:!s||p,onClick:Ee,children:W?"重新绑定":"重新显示绑定码"}),H?(0,u.jsx)("button",{type:"button",className:w.default.clawbotTextButton,disabled:p&&T.current?.action!=="login.poll",onClick:()=>void D({action:"login.cancel",loginId:A.id}),children:"取消绑定"}):null]})]})]}):Y?null:(0,u.jsxs)("div",{className:w.default.clawbotPairingEntry,children:[(0,u.jsx)("p",{className:w.default.clawbotNote,children:"用微信首页「＋ → 扫一扫」扫描此处的 ClawBot 绑定码。"}),(0,u.jsx)("button",{type:"button",className:w.default.primaryButton,disabled:!n||!s||p,onClick:Ee,children:W?"重新绑定":"显示绑定码"})]})]}),(0,u.jsxs)("div",{className:w.default.clawbotSection,"aria-label":"微信消息",children:[(0,u.jsx)("div",{className:w.default.clawbotRow,children:(0,u.jsx)("strong",{children:"接入会话"})}),(0,u.jsxs)("div",{className:w.default.clawbotRow,children:[(0,u.jsxs)("select",{"aria-label":"ClawBot 目标会话",value:i,disabled:!n||p&&T.current?.action!=="sessions",onFocus:()=>void D({action:"sessions"}),onChange:v=>{M.current=!0,c(v.target.value)},children:[(0,u.jsx)("option",{value:"",children:"选择已有会话"}),n?.target&&!l.some(v=>v.id===n.target.id)?(0,u.jsx)("option",{value:n.target.id,children:n.target.title}):null,[...Ne].map(([v,q])=>(0,u.jsx)("optgroup",{label:q.title,children:q.sessions.map(L=>(0,u.jsx)("option",{value:L.id,children:bt(L)},L.id))},v))]}),(0,u.jsx)("button",{type:"button",className:w.default.secondaryButton,disabled:!s||!i||!n||p||i===n.target?.id,onClick:()=>void D({action:"route",sessionId:i,expectedRevision:n?.revision}),children:"接到此会话"})]}),(0,u.jsxs)("div",{className:w.default.clawbotReceiveRow,children:[(0,u.jsxs)("div",{children:[(0,u.jsx)("strong",{children:"启用私聊接入"}),(0,u.jsx)("p",{className:w.default.clawbotNote,role:"status",children:$})]}),(0,u.jsxs)("label",{className:w.default.clawbotToggle,children:[(0,u.jsx)("input",{type:"checkbox",role:"switch","aria-label":"启用私聊接入",checked:n?.enabled||!1,disabled:!n||p||!n.enabled&&!I,onChange:v=>void D({action:"enabled",enabled:v.target.checked,expectedRevision:n?.revision})}),(0,u.jsx)("span",{className:w.default.clawbotSwitchTrack,"aria-hidden":!0})]})]}),(0,u.jsx)("p",{className:w.default.clawbotNote,children:"关闭只暂停私聊接入，不解除绑定，也不取消 DSH 已开始的任务。"})]}),n?.message&&!Ht.has(n.message)?(0,u.jsx)("p",{className:w.default.clawbotNote,role:"status",children:n.message}):null,n?.uncertain?(0,u.jsxs)("p",{className:w.default.clawbotNote,children:["有 ",n.uncertain," 条消息的处理结果待确认，请到原会话查看。"]}):null,m?(0,u.jsx)("p",{className:w.default.clawbotError,role:"alert",children:m}):null,n?.paired&&!H?(0,u.jsxs)("details",{className:w.default.clawbotManage,children:[(0,u.jsx)("summary",{children:"绑定管理"}),(0,u.jsxs)("div",{className:w.default.clawbotActions,children:[W?null:(0,u.jsx)("button",{type:"button",className:w.default.secondaryButton,disabled:!s||p,onClick:Ee,children:"重新绑定"}),(0,u.jsx)("button",{type:"button",className:w.default.clawbotTextButton,disabled:p,onClick:vt,children:"移除绑定"})]})]}):null]})}var Z=require("react"),V=ae(Q(),1);var C=require("react/jsx-runtime"),It={pass:"通过",fail:"失败","not-tested":"未检测",cancelled:"已取消"},Ie=class extends Z.Component{state={failed:!1};static getDerivedStateFromError(){return{failed:!0}}render(){return this.state.failed?(0,C.jsx)("p",{role:"status",children:"连接帮助暂不可用，其他功能可继续使用。"}):this.props.children}};function ut({store:t}){let[a,e]=(0,Z.useState)(!1);return(0,C.jsxs)("details",{className:V.default.updateDetails,onToggle:n=>e(n.currentTarget.open),children:[(0,C.jsx)("summary",{children:"连接帮助"}),a?(0,C.jsx)(Ie,{children:(0,C.jsx)(Bt,{store:t})}):null]})}function Bt({store:t}){let a=(0,Z.useSyncExternalStore)(t.subscribe,t.getSnapshot,t.getSnapshot),{diagnosticState:e,diagnosticReport:n}=a,[r,l]=(0,Z.useState)(!1),[d,i]=(0,Z.useState)("idle");(0,Z.useEffect)(()=>{l(!1),i("idle")},[n]);let c=e==="running",p=n?Qe(n):"",y=async()=>{if(!(!r||!n||!p))try{await navigator.clipboard.writeText(p),t.getSnapshot().diagnosticReport===n&&i("copied")}catch{t.getSnapshot().diagnosticReport===n&&i("failed")}};return(0,C.jsxs)("section",{"aria-label":"连接诊断",children:[(0,C.jsxs)("div",{className:V.default.updateRow,children:[(0,C.jsx)("h3",{className:V.default.updateHeading,children:"连接诊断"}),(0,C.jsxs)("div",{className:V.default.updateActions,children:[(0,C.jsx)("button",{type:"button",className:V.default.secondaryButton,disabled:c,onClick:()=>void t.diagnose(),children:c?"检测中…":"检查连接"}),c?(0,C.jsx)("button",{type:"button",className:V.default.secondaryButton,onClick:()=>t.cancel(),children:"取消"}):null]})]}),(0,C.jsx)("p",{className:V.default.helpText,children:"检查结果仅供参考，不影响配对或连接，也不改配置。会访问中继健康接口，对方可见出口 IP；报告不自动上传。"}),(0,C.jsxs)("div",{role:"status","aria-live":"polite",children:[e==="cancelled"?(0,C.jsx)("p",{children:"已取消本次检查。"}):null,e==="unsupported"?(0,C.jsx)("p",{children:"当前 DSH 或插件不支持此诊断入口，请更新后重新打开应用。"}):null,e==="error"?(0,C.jsx)("p",{children:"未能取得诊断结果。请确认当前 DSH 和插件正在运行，再检查连接。"}):null,n?(0,C.jsxs)(C.Fragment,{children:[(0,C.jsxs)("p",{className:V.default.helpText,children:["检查于 ",new Date(n.startedAt).toLocaleString(),"，以下为该次检查结果。"]}),(0,C.jsx)("ul",{children:n.checks.map(m=>(0,C.jsxs)("li",{children:[Ye(m.id),"：",It[m.status],m.code?` · ${Xe(m.code)}`:null,m.httpStatus?` · HTTP ${m.httpStatus}`:null,m.systemCode?` · ${m.systemCode}`:null,m.status==="fail"?(0,C.jsx)("p",{className:V.default.helpText,children:Ke(m.code??"unknown")}):null]},m.id))}),(0,C.jsx)("p",{className:V.default.helpText,children:"基础检查通过不等于首次配对成功；未单独测试 WebSocket 握手、手机认领或票据签名。"}),(0,C.jsx)("button",{type:"button",className:V.default.secondaryButton,"aria-expanded":r,onClick:()=>l(!r),children:r?"收起报告":"预览诊断报告"}),r?(0,C.jsxs)(C.Fragment,{children:[(0,C.jsx)("pre",{style:{whiteSpace:"pre-wrap",overflowWrap:"anywhere",maxHeight:280,overflow:"auto",fontSize:12},children:p}),(0,C.jsx)("button",{type:"button",className:V.default.secondaryButton,onClick:()=>void y(),children:d==="copied"?"已复制":"复制诊断报告"}),d==="failed"?(0,C.jsx)("p",{className:V.default.helpText,children:"复制未成功，可以选中上方报告手动复制。"}):null]}):null]}):null]})]})}var h=require("react/jsx-runtime");function gt({ok:t,busy:a=!1}){return(0,h.jsx)("span",{className:P.default.statusDot,"data-state":a?"busy":t?"ready":"off","aria-hidden":!0})}function Be({title:t,detail:a,ok:e,busy:n=!1}){return(0,h.jsxs)("div",{className:P.default.capability,children:[(0,h.jsx)(gt,{ok:e,busy:n}),(0,h.jsxs)("div",{className:P.default.capabilityCopy,children:[(0,h.jsx)("strong",{children:t}),(0,h.jsx)("span",{children:a})]})]})}function Ue({describeHost:t,callManagement:a,store:e=_e(t,a),diagnostics:n,assistants:r,clawbotCall:l,featureCall:d}){let{loadState:i,qrState:c,status:p,runtime:y,host:m,localOrigin:R,qr:g,error:b}=(0,ke.useSyncExternalStore)(e.subscribe,e.getSnapshot,e.getSnapshot),{refresh:k,generateQr:N}=e,E=(0,ke.useId)(),M=p?.publicRelay,G=M?.state==="enrolling"||M?.state==="connecting",T=M?.remoteAccess?.status,ee=M?.state==="online"&&T==="active",re=T==="suspended"?"账户公网访问已暂停":T==="expired"?"公网访问已到期":T==="not_entitled"?"请在小程序中使用自助开通方式":T!=="active"?"配对后由小程序账户决定":ee?"可在外网安全连接":G?"正在准备远程连接":"暂时离线",F=y?.publicDoor??p?.gate?.publicDoor,D=i==="ready"&&!!p?.lan.ip&&F?.state==="listening",ie=M?.enabled===!0&&M.state!=="disabled",A=p?.agent?.agentName||m?.agentName||"DeepSeek Harness",H=p?.agent?.hostName||m?.computerName||"当前电脑";return(0,h.jsxs)("section",{className:P.default.root,"aria-labelledby":E,children:[(0,h.jsxs)("div",{className:P.default.hero,children:[(0,h.jsxs)("div",{className:P.default.identity,children:[(0,h.jsx)("span",{className:P.default.mark,"aria-hidden":!0,children:(0,h.jsx)(ht.FishLogo,{size:28})}),(0,h.jsxs)("div",{className:P.default.identityCopy,children:[(0,h.jsx)("h3",{id:E,children:"微信连接"}),(0,h.jsxs)("p",{children:[A,(0,h.jsx)("span",{"aria-hidden":!0,children:" · "}),H]})]})]}),(0,h.jsxs)("span",{className:P.default.overall,"data-ready":i==="ready",children:[(0,h.jsx)(gt,{ok:i==="ready",busy:i==="loading"}),i==="loading"?"检测中":i==="ready"?"服务正常":"暂不可用"]})]}),(0,h.jsxs)("div",{className:P.default.capabilities,children:[(0,h.jsx)(Be,{title:"局域网直连",detail:i==="loading"?"检测中":D?"已就绪":"暂不可用",ok:D,busy:i==="loading"}),(0,h.jsx)(Be,{title:"远程访问",detail:re,ok:ee,busy:G||i==="loading"}),(0,h.jsx)(Be,{title:"账号连接保护",detail:ie?"已启用":"配对后启用",ok:ie,busy:i==="loading"})]}),b!==null?(0,h.jsxs)("div",{className:P.default.notice,role:"status",children:[(0,h.jsx)("span",{children:b}),(0,h.jsx)("button",{type:"button",onClick:()=>void k(),children:"重试"})]}):null,c==="idle"?(0,h.jsxs)("div",{className:P.default.connectCard,children:[(0,h.jsxs)("div",{children:[(0,h.jsx)("strong",{children:"添加到微信"}),(0,h.jsx)("p",{children:"打开「Agent远程管理助手」→ 添加节点，扫描配对二维码。"})]}),(0,h.jsx)("button",{type:"button",className:P.default.primaryButton,disabled:i!=="ready",onClick:()=>void N(),children:"生成二维码"})]}):(0,h.jsxs)("div",{className:P.default.pairingCard,children:[(0,h.jsxs)("div",{className:P.default.pairingHead,children:[(0,h.jsxs)("div",{children:[(0,h.jsx)("strong",{children:"扫描二维码"}),(0,h.jsx)("p",{children:"小程序「设置 → 添加节点」"})]}),(0,h.jsx)("button",{type:"button",className:P.default.secondaryButton,disabled:c==="loading"||i!=="ready",onClick:()=>void N(),children:c==="loading"?"生成中…":"重新生成"})]}),(0,h.jsxs)("div",{className:P.default.qrArea,children:[i==="ready"&&c==="ready"&&g!==null?(0,h.jsx)("img",{className:P.default.qr,src:g.qrDataUrl,alt:"Agent远程管理助手配对二维码"}):(0,h.jsx)("div",{className:P.default.qrPlaceholder,"aria-live":"polite",children:i!=="ready"?"连接恢复后可查看二维码":c==="expired"?"二维码已过期，请重新生成":c==="error"?"生成失败":"正在生成…"}),c==="ready"&&g!==null?(0,h.jsxs)("small",{className:P.default.qrValidity,children:["有效至 ",new Date(g.expiresAt).toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"})," · 切换页面不重新生成"]}):null]}),(0,h.jsx)("p",{className:P.default.securityNote,children:g?.mode==="public-relay"?"配对后自动选择更快的连接；远程内容端到端加密。":"当前可通过同一局域网连接。"})]}),(0,h.jsxs)("section",{className:P.default.updateCard,"aria-label":"插件更新",children:[(0,h.jsx)("h3",{className:P.default.updateHeading,children:"插件更新"}),R&&e.updates?(0,h.jsx)(rt,{store:e.updates,embedded:!0}):null,y?.profileScope==="desktop"&&e.nativeUpdates?(0,h.jsx)(it,{store:e.nativeUpdates,embedded:!0}):null,(0,h.jsx)(xe,{describeHost:t,callManagement:a,store:e,compact:!0})]}),r?(0,h.jsx)(lt,{store:r,featureCall:d}):null,l?(0,h.jsx)(pt,{call:l,nodeName:A,hostName:H}):null,n?(0,h.jsx)(ut,{store:n}):null]})}var Se=class{constructor(a,e){this.call=a;this.openSession=e}state={catalog:null,preview:null,busy:!1,message:"",error:""};listeners=new Set;epoch=0;disposed=!1;getSnapshot=()=>this.state;subscribe=a=>(this.listeners.add(a),()=>{this.listeners.delete(a)});set(a){if(!this.disposed){this.state={...this.state,...a};for(let e of this.listeners)e()}}reset=()=>{this.epoch++,this.set({catalog:null,preview:null,busy:!1,message:"",error:""})};dispose=()=>{this.reset(),this.disposed=!0,this.listeners.clear()};async run(a){if(this.disposed||this.state.busy)return;let e=this.epoch,n=()=>!this.disposed&&e===this.epoch;this.set({busy:!0,error:""});try{await a(n)}catch(r){n()&&this.set({error:r instanceof Error?r.message:"操作未完成，请核对状态"})}finally{n()&&this.set({busy:!1})}}async read(a){a()&&this.set({catalog:null});try{let e=await this.call("assistantCatalog",{});if(!a())return;if(e?.schema!=="human.assistants.catalog.v1"||!Array.isArray(e.templates)||!Array.isArray(e.drafts))throw new Error("助手目录格式不受支持");this.set({catalog:e})}catch(e){throw a()&&this.set({message:""}),e}}load=()=>this.run(a=>this.read(a));readyAssistant(a){let e=this.state.catalog?.drafts?.find(n=>n.presetId===a);if(!e||e.state!=="installed"||e.nativeState&&e.nativeState!=="installed")throw new Error("此助手已停用或尚未就绪，请核对下方组件开关。");return e}start=(a,e)=>this.run(async n=>{if(this.set({message:""}),await this.read(n),!(!n()||e?.aborted)){if(this.readyAssistant(a),!this.openSession)throw new Error("当前 DSH 未提供快捷入口，请在新会话中选择此助手模式。");await this.openSession(a,e)}});dismissPreview=()=>{this.state.busy||this.set({preview:null,message:""})};choose=a=>this.run(async e=>{if(this.set({preview:null,message:""}),this.state.catalog?.templates?.find(i=>i.id===a)?.builtin){await this.read(e),e()&&this.set({message:"此助手已包含在插件里，请在新会话中选择；无需另装独立包。"});return}let r=this.state.catalog?.drafts?.find(i=>i.templateId===a&&i.state==="draft");if(r){let i=await this.call("assistantPreview",{id:r.id,version:r.version});e()&&this.set({preview:i});return}let l=await this.call("assistantDraft",{templateId:a});if(!e()||(await this.read(e),!e()))return;let d=await this.call("assistantPreview",{id:l.id,version:l.version});e()&&this.set({preview:d})});preview=(a,e)=>this.run(async n=>{this.set({preview:null});let r=await this.call("assistantPreview",{id:a,version:e});n()&&this.set({preview:r})});reinstall=(a,e)=>this.run(async n=>{if(this.set({preview:null,message:""}),this.state.catalog?.drafts?.some(d=>d.id===a&&d.version===e&&d.replacement)){await this.read(n),n()&&this.set({message:"这个旧模式已有内置版本，请在新会话中选择对应助手，无需重新安装旧包。"});return}let r=await this.call("assistantDraft",{sourceId:a,sourceVersion:e});if(!n()||(await this.read(n),!n()))return;let l=await this.call("assistantPreview",{id:r.id,version:r.version});n()&&this.set({preview:l})});install=()=>this.run(async a=>{let e=this.state.preview;if(!e||e.expiresAt<=Date.now())throw new Error("请重新预览后确认安装");this.set({preview:null,message:"已提交原生安装，请等待结果。"});try{let n=await this.call("assistantInstall",{id:e.id,version:e.version,digest:e.digest,previewId:e.previewId});a()&&this.set({message:n.message||(n.state==="installed"?"原生预设已生效":"请核对原生安装状态")})}finally{a()&&await this.read(a)}});verify=(a,e)=>this.run(async n=>{this.set({catalog:null,message:""});let r=await this.call("assistantStatus",{id:a,version:e});n()&&(this.set({message:r.message||"状态已核对"}),await this.read(n))})};function ft(t){let a=0,e=!1;return{reset(){a++,e=!1},async start(n,r){if(!/^[a-z][a-z0-9_-]{0,63}$/.test(n))throw new Error("助手身份无效");if(e||r?.aborted)return;let l=a,d=t("uiWorkspace"),i=t("slots"),c=t("configForms")?.developerTools?.enabled?.getSnapshot(),p=i?.entries?.("conversation.hero.agentPreset"),y=Array.isArray(p)&&p.length===1?p[0]:void 0;if(c!==!0||typeof d?.clearMain!="function"||y?.options?.locale!=="settings.agentPreset"||typeof y?.inject!="function")throw new Error("当前 DSH 尚未提供快捷入口，请在原生新会话中选择此助手模式。");let m=y.inject(void 0);if(typeof m?.load!="function"||typeof m?.select!="function"||typeof m?.hooks?.agentPresetSeat?.getSnapshot!="function")throw new Error("当前 DSH 的模式选择入口不兼容，请使用原生新会话入口。");let R=()=>l===a&&!r?.aborted;e=!0;try{if(await m.load(),!R())return;let g=i.entries("conversation.hero.agentPreset");if(!Array.isArray(g)||g.length!==1||g[0]!==y)throw new Error("DSH 的模式入口已更新，请重新点击开始使用。");let b=m.hooks.agentPresetSeat.getSnapshot();if(b.busy||b.error||!b.options?.some(N=>N.id===n))throw new Error("此助手尚未就绪，请刷新状态后重试。");if(t("configForms")?.developerTools?.enabled?.getSnapshot()!==!0)throw new Error("DSH 的工作模式选择已关闭，请在原生设置中开启后重试。");d.clearMain();let k=await m.select(n);if(R()&&k)throw new Error(k)}finally{l===a&&(e=!1)}}}}var Ut=["slots","connection"];function jt(t){let a=async(g,b,k)=>{let N=await t.connection.rpc.call("/wechat-remote-management",g,b??{},k);if(!N.ok)throw Object.assign(new Error(N.error.message),{code:N.error.code});return N.value},e=async()=>{let g=await t.connection.rpc.call("/api","wechatHost/describe",{args:{request:{}}});if(!g.ok)throw new Error(`wechatHost/describe: ${g.error.code}`);let b=g.value;if(b?.ok!==!0||b.value===void 0)throw new Error("wechatHost/describe returned an invalid result");return b.value},n=new de(e,a),r=0,l=async g=>{let b=r,k=await t.connection.rpc.call("/api","wechatFeatures/control",{args:{request:g}});if(b!==r)throw new Error("节点连接已变化，请重新核对资格。");if(!k.ok)throw new Error("使用资格服务暂不可用，请更新插件并刷新。");let N=k.value;if(!N?.ok)throw new Error(N?.error?.message||"使用资格核对失败。");return $e(N.value)},d=async g=>{let b=r,k=await t.connection.rpc.call("/api","wechatClawbot/control",{args:{request:g}});if(b!==r)throw new Error("节点连接已变化，请刷新 ClawBot 状态");if(!k.ok)throw new Error("ClawBot 组件暂不可用，请核对下方组件开关");let N=k.value;if(!N?.ok)throw new Error(N?.error?.message||"ClawBot 状态读取失败");return N.value},i=async(g,b)=>{let k=r,N=await t.connection.rpc.call("/api",`humanTools/${g}`,{args:{request:b}});if(k!==r)throw new Error("电脑连接已变化，请重新查看助手目录");if(!N.ok)throw new Error(N.error.message);let E=N.value;if(!E?.ok||typeof E.valueJson!="string"||E.valueJson.length>256*1024)throw new Error(E?.error?.message||"此节点尚未提供助手能力");return JSON.parse(E.valueJson)},c,p=new Se(i,async(g,b)=>{if(!c)throw new Error("原生会话入口尚未就绪，请稍后再试。");await c.start(g,b)});t.inject(["uiWorkspace","slots","configForms"],g=>{let b=ft(k=>g.get(k));c=b,g.effect(()=>()=>{b.reset(),c===b&&(c=void 0)},"wechat assistant navigation")}),t.effect(()=>{let g=t.on("connection/reset",()=>{r++,c?.reset(),p.reset()});return()=>{r++,g(),p.dispose()}},"wechat assistant lifecycle"),t.effect(()=>()=>n.dispose(),"wechat shared page");let y=new Ce(e,a);t.effect(()=>{let g=t.on("connection/reset",y.reset);return()=>{g(),y.dispose()}},"wechat connection diagnostics");let m=()=>at(g=>t.get(g)),R=()=>({describeHost:e,callManagement:a,store:n,assistants:p,clawbotCall:d,featureCall:l,diagnostics:y});t.slots.inject("settings.section",()=>t.slots.register({name:"settings.section",id:"harness-remote",order:30,label:"微信连接",inject:R},Ue));for(let g of["plugins.bundle.activation","plugins.bundle.config"])t.slots.inject(g,()=>{let b=["dsh-wechat-remote","@harness-remote/dsh-wechat-remote"].map(k=>t.slots.register({name:g,key:k,inject:R},g==="plugins.bundle.activation"?xe:Ue));return()=>b.forEach(k=>k())});t.inject(["pluginNavigation","remote.pluginManager"],()=>t.slots.inject("sidebar.footer.action",()=>t.slots.register({name:"sidebar.footer.action",id:"harness-remote",order:30,label:"微信连接",inject:()=>({openPlugin:m})},tt)))}

return module.exports;}});
