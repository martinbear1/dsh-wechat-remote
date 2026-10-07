window.__ModuleLoader__.load({id:"@harness-remote/dsh-wechat-remote",factory:(require)=>{var module={exports:{}};var exports=module.exports;"use strict";var Ce=Object.create;var M=Object.defineProperty;var Se=Object.getOwnPropertyDescriptor;var Ne=Object.getOwnPropertyNames;var Pe=Object.getPrototypeOf,Ie=Object.prototype.hasOwnProperty;var He=(s,t)=>()=>(t||s((t={exports:{}}).exports,t),t.exports),De=(s,t)=>{for(var e in t)M(s,e,{get:t[e],enumerable:!0})},Y=(s,t,e,a)=>{if(t&&typeof t=="object"||typeof t=="function")for(let n of Ne(t))!Ie.call(s,n)&&n!==e&&M(s,n,{get:()=>t[n],enumerable:!(a=Se(t,n))||a.enumerable});return s};var j=(s,t,e)=>(e=s!=null?Ce(Pe(s)):{},Y(t||!s||!s.__esModule?M(e,"default",{value:s,enumerable:!0}):e,s)),Ae=s=>Y(M({},"__esModule",{value:!0}),s);var R=He((qe,te)=>{"use strict";var Ee=`.hr_9d7800b_root {\r
  box-sizing: border-box;\r
  width: 100%;\r
  max-width: 760px;\r
  color: var(--dsw-alias-label-primary, #171a20);\r
  display: flex;\r
  flex-direction: column;\r
  gap: 14px;\r
}\r
\r
.hr_9d7800b_hero,\r
.hr_9d7800b_connectCard,\r
.hr_9d7800b_pairingCard {\r
  border: 1px solid var(--dsw-alias-border-l2, rgba(128, 140, 160, 0.22));\r
  background: var(--dsw-alias-bg-layer-3, #fff);\r
  border-radius: 12px;\r
}\r
\r
.hr_9d7800b_hero {\r
  min-height: 72px;\r
  display: flex;\r
  align-items: center;\r
  justify-content: space-between;\r
  gap: 20px;\r
  padding: 16px 18px;\r
}\r
\r
.hr_9d7800b_identity {\r
  min-width: 0;\r
  display: flex;\r
  align-items: center;\r
  gap: 12px;\r
}\r
\r
.hr_9d7800b_mark {\r
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
.hr_9d7800b_identityCopy {\r
  min-width: 0;\r
}\r
\r
.hr_9d7800b_identityCopy h3,\r
.hr_9d7800b_identityCopy p,\r
.hr_9d7800b_connectCard p,\r
.hr_9d7800b_pairingHead p,\r
.hr_9d7800b_securityNote {\r
  margin: 0;\r
}\r
\r
.hr_9d7800b_sidebarButton { display: flex; align-items: center; gap: 10px; width: 100%; min-height: 38px; padding: 8px 12px; border: 0; border-radius: 8px; background: transparent; color: var(--dsw-alias-label-secondary, #4d5564); font: inherit; font-size: 14px; cursor: pointer; text-align: left; }\r
.hr_9d7800b_sidebarButton:hover { background: var(--dsw-alias-bg-layer-2, #eef1f5); color: var(--dsw-alias-label-primary, #171a20); }\r
.hr_9d7800b_sidebarButton[data-wide='false'] { width: 36px; min-height: 36px; padding: 8px; justify-content: center; }\r
.hr_9d7800b_sidebarButton svg { flex: none; }\r
.hr_9d7800b_sidebarButton:focus-visible { outline: 2px solid var(--dsw-alias-state-business-primary, #4e79ff); outline-offset: 2px; }\r
.hr_9d7800b_actions { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 16px; }\r
.hr_9d7800b_pageDialog.hr_9d7800b_pageDialog { width: min(820px, 100%); max-height: 100%; }\r
.hr_9d7800b_pageDialogContent.hr_9d7800b_pageDialogContent { min-height: 0; overflow-y: auto; }\r
.hr_9d7800b_helpText { color: var(--dsw-alias-label-secondary, #647084); font-size: 12px; line-height: 1.7; margin: 8px 0; }\r
\r
.hr_9d7800b_companionCard {\r
  border: 1px solid var(--dsw-alias-state-business-primary, #4e79ff);\r
  border-left-width: 4px;\r
  border-radius: 10px;\r
  background: var(--dsw-alias-bg-layer-3, #fff);\r
  padding: 14px 16px;\r
  line-height: 1.6;\r
  overflow-wrap: anywhere;\r
}\r
.hr_9d7800b_companionCard strong { font-size: 14px; }\r
.hr_9d7800b_companionCard p { margin: 4px 0; font-size: 13px; }\r
.hr_9d7800b_companionCard small { color: var(--dsw-alias-label-secondary, #4d5564); }\r
.hr_9d7800b_companionCard progress { display: block; width: 100%; margin: 8px 0; accent-color: #4e79ff; }\r
.hr_9d7800b_companionCard[data-state='complete'] { border-color: var(--dsw-alias-state-success-primary, #1f9d68); }\r
.hr_9d7800b_companionCard[data-state='unavailable'], .hr_9d7800b_companionCard[data-state='recovering'] { border-color: #b5861d; }

/* Assistant modes are a compact owner-facing catalog, not an installation log. */
.hr_9d7800b_assistantsCard { padding: 14px 18px; border: 1px solid var(--dsw-alias-border-l2, #e2e6ee); border-radius: 12px; background: var(--dsw-alias-bg-layer-3, #fff); line-height: 1.5; overflow-wrap: anywhere; }
.hr_9d7800b_assistantsCard h3, .hr_9d7800b_assistantsCard h4, .hr_9d7800b_assistantsCard p { margin: 0; }
.hr_9d7800b_assistantsCard h3 { font-size: 14px; }
.hr_9d7800b_assistantsCard h4 { font-size: 14px; margin: 16px 0 6px; }
.hr_9d7800b_assistantsCard p { color: var(--dsw-alias-label-secondary, #647084); font-size: 12px; }
.hr_9d7800b_assistantsHeading { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 4px; }
.hr_9d7800b_assistantsHeading p { margin-top: 4px; }
.hr_9d7800b_assistantChoices { display: flex; flex-direction: column; }
.hr_9d7800b_assistantChoice { padding: 10px 0; display: flex; align-items: center; gap: 12px; }
.hr_9d7800b_assistantChoiceCopy { flex: 1; min-width: 0; }
.hr_9d7800b_assistantChoiceHead, .hr_9d7800b_assistantEntryHead { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 8px; }
.hr_9d7800b_assistantChoiceHead { justify-content: flex-start; gap: 6px; }
.hr_9d7800b_assistantChoiceHead strong { font-size: 13px; }
.hr_9d7800b_assistantChoice p { flex: 1; }
.hr_9d7800b_assistantStatus { color: var(--dsw-alias-state-success-primary, #17845b); font-size: 12px; }
.hr_9d7800b_assistantPrimary, .hr_9d7800b_assistantSecondary, .hr_9d7800b_assistantTextButton { min-height: 42px; padding: 9px 16px; border-radius: 9px; font: inherit; font-size: 13px; cursor: pointer; }
.hr_9d7800b_assistantPrimary { color: #fff; background: var(--dsw-alias-state-business-primary, #4e79ff); border: 1px solid transparent; }
.hr_9d7800b_assistantSecondary { color: var(--dsw-alias-state-business-primary, #4e79ff); background: var(--dsw-alias-bg-layer-3, #fff); border: 1px solid var(--dsw-alias-border-l2, #d7deed); }
.hr_9d7800b_assistantTextButton { min-height: 32px; padding: 3px 8px; border: 0; background: transparent; color: var(--dsw-alias-state-business-primary, #4e79ff); }
.hr_9d7800b_assistantPrimary:disabled, .hr_9d7800b_assistantSecondary:disabled, .hr_9d7800b_assistantTextButton:disabled { opacity: .5; cursor: default; }
.hr_9d7800b_assistantPrimary:focus-visible, .hr_9d7800b_assistantSecondary:focus-visible, .hr_9d7800b_assistantTextButton:focus-visible, .hr_9d7800b_assistantDetails summary:focus-visible { outline: 2px solid var(--dsw-alias-state-business-primary, #4e79ff); outline-offset: 3px; }
.hr_9d7800b_assistantCustomize { margin-top: 2px; border-top: 1px solid var(--dsw-alias-border-l2, #e2e6ee); }
.hr_9d7800b_assistantCustomize > p { margin-bottom: 10px; }
.hr_9d7800b_assistantCustomize .hr_9d7800b_assistantChoice { background: transparent; }
.hr_9d7800b_assistantDetails { margin-top: 14px; color: var(--dsw-alias-label-secondary, #647084); font-size: 12px; }
.hr_9d7800b_assistantDetails summary { padding: 5px 0; cursor: pointer; }
.hr_9d7800b_assistantDetails ul { margin: 8px 0; padding-left: 20px; }
.hr_9d7800b_assistantDetails li { margin: 5px 0; }
.hr_9d7800b_assistantPreview { padding: 14px; margin-top: 16px !important; border-radius: 10px; background: var(--dsw-alias-bg-layer-1, #f0f4ff); }
.hr_9d7800b_assistantUnavailable { color: var(--dsw-alias-label-secondary, #647084); font-size: 12px; }
.hr_9d7800b_assistantLaunch { display: flex; flex-direction: column; align-items: stretch; gap: 10px; min-width: 0; font-size: 13px; }
.hr_9d7800b_assistantLaunch p { margin: 0; color: var(--dsw-alias-label-secondary, #647084); }
.hr_9d7800b_assistantLaunch select { font: inherit; min-height: 36px; padding: 6px 10px; border-radius: 8px; background: var(--dsw-alias-bg-layer-3, #fff); color: inherit; border: 1px solid var(--dsw-alias-border-l2, #d7deed); }
.hr_9d7800b_assistantLaunch .hr_9d7800b_assistantTextButton { align-self: flex-start; padding-left: 0; }
.hr_9d7800b_assistantWorkspacePath { overflow-wrap: anywhere; font-size: 12px; }
.hr_9d7800b_assistantHelpAnchor { display: inline-flex; position: relative; }
.hr_9d7800b_assistantHelpButton { padding: 0; width: 17px; height: 17px; border-radius: 50%; border: 1px solid var(--dsw-alias-border-l2, #bec6d2); background: transparent; color: var(--dsw-alias-label-tertiary, #8490a2); font: inherit; font-size: 11px; cursor: help; }
.hr_9d7800b_assistantTooltip { visibility: hidden; opacity: 0; position: absolute; z-index: 2; top: 24px; left: 0; width: min(300px, 55vw); padding: 10px 12px; border-radius: 8px; border: 1px solid var(--dsw-alias-border-l2, #d7deed); background: var(--dsw-alias-bg-layer-3, #fff); color: var(--dsw-alias-label-secondary, #647084); box-shadow: 0 4px 16px #0002; font-size: 12px; font-weight: normal; }
.hr_9d7800b_assistantHelpAnchor:hover .hr_9d7800b_assistantTooltip, .hr_9d7800b_assistantHelpAnchor:focus-within .hr_9d7800b_assistantTooltip { visibility: visible; opacity: 1; }
.hr_9d7800b_assistantPreview h4 { margin-top: 0; }
.hr_9d7800b_assistantPreview p + p { margin-top: 8px; }
.hr_9d7800b_assistantButtons { display: flex; gap: 10px; flex-wrap: wrap; margin-top: 14px; }
.hr_9d7800b_assistantEntry { margin-top: 10px; padding: 12px 0; border-top: 1px solid var(--dsw-alias-border-l2, #e2e6ee); }
.hr_9d7800b_assistantEntryHead { margin-bottom: 8px; font-size: 13px; }
.hr_9d7800b_assistantEntryHead > span { color: var(--dsw-alias-label-secondary, #647084); font-size: 12px; }
.hr_9d7800b_assistantEntry > button + button { margin-left: 8px; }
@media (max-width: 520px) { .hr_9d7800b_assistantsCard { padding: 12px; } .hr_9d7800b_assistantChoice { gap: 8px; } }
\r
.hr_9d7800b_identityCopy h3 {\r
  font-size: 15px;\r
  font-weight: 650;\r
  line-height: 22px;\r
}\r
\r
.hr_9d7800b_identityCopy p {\r
  color: var(--dsw-alias-label-tertiary, #7d8492);\r
  font-size: 12px;\r
  line-height: 18px;\r
  overflow: hidden;\r
  text-overflow: ellipsis;\r
  white-space: nowrap;\r
}\r
\r
.hr_9d7800b_overall {\r
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
.hr_9d7800b_overall[data-ready='true'] {\r
  color: var(--dsw-alias-state-success-primary, #1f9d68);\r
}\r
\r
.hr_9d7800b_statusDot {\r
  width: 7px;\r
  height: 7px;\r
  background: var(--dsw-alias-label-tertiary, #8b93a2);\r
  border-radius: 999px;\r
  flex: none;\r
}\r
\r
.hr_9d7800b_statusDot[data-state='ready'] {\r
  background: var(--dsw-alias-state-success-primary, #1f9d68);\r
}\r
\r
.hr_9d7800b_statusDot[data-state='busy'] {\r
  background: var(--dsw-alias-state-business-primary, #4e79ff);\r
  animation: harnessRemotePulse 1.2s ease-in-out infinite;\r
}\r
\r
.hr_9d7800b_capabilities {\r
  grid-template-columns: repeat(3, minmax(0, 1fr));\r
  gap: 10px;\r
  display: grid;\r
}\r
\r
.hr_9d7800b_capability {\r
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
.hr_9d7800b_capability > .hr_9d7800b_statusDot {\r
  margin-top: 6px;\r
}\r
\r
.hr_9d7800b_capabilityCopy {\r
  min-width: 0;\r
  display: flex;\r
  flex-direction: column;\r
  gap: 1px;\r
}\r
\r
.hr_9d7800b_capabilityCopy strong {\r
  font-size: 12.5px;\r
  font-weight: 600;\r
  line-height: 19px;\r
}\r
\r
.hr_9d7800b_capabilityCopy span {\r
  color: var(--dsw-alias-label-tertiary, #7d8492);\r
  font-size: 11px;\r
  line-height: 17px;\r
  overflow: hidden;\r
  text-overflow: ellipsis;\r
  white-space: nowrap;\r
}\r
\r
.hr_9d7800b_notice {\r
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
.hr_9d7800b_notice button,\r
.hr_9d7800b_secondaryButton {\r
  border: 1px solid var(--dsw-alias-border-l2, rgba(128, 140, 160, 0.28));\r
  color: var(--dsw-alias-label-primary, #171a20);\r
  background: var(--dsw-alias-bg-layer-1, #f5f6f8);\r
  border-radius: 7px;\r
  font: inherit;\r
  cursor: pointer;\r
}\r
\r
.hr_9d7800b_notice button {\r
  flex: none;\r
  padding: 3px 9px;\r
}\r
\r
.hr_9d7800b_connectCard {\r
  display: flex;\r
  align-items: center;\r
  justify-content: space-between;\r
  gap: 20px;\r
  padding: 18px;\r
}\r
\r
.hr_9d7800b_connectCard strong,\r
.hr_9d7800b_pairingHead strong {\r
  font-size: 14px;\r
  font-weight: 650;\r
  line-height: 21px;\r
}\r
\r
.hr_9d7800b_connectCard p,\r
.hr_9d7800b_pairingHead p {\r
  max-width: 470px;\r
  color: var(--dsw-alias-label-tertiary, #7d8492);\r
  font-size: 12px;\r
  line-height: 18px;\r
}\r
\r
.hr_9d7800b_primaryButton {\r
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
.hr_9d7800b_primaryButton:hover {\r
  filter: brightness(1.04);\r
}\r
\r
.hr_9d7800b_primaryButton:focus-visible,\r
.hr_9d7800b_secondaryButton:focus-visible,\r
.hr_9d7800b_notice button:focus-visible {\r
  outline: 2px solid var(--dsw-alias-state-business-primary, #4e79ff);\r
  outline-offset: 2px;\r
}\r
\r
.hr_9d7800b_pairingCard {\r
  padding: 18px;\r
}\r
\r
.hr_9d7800b_pairingHead {\r
  display: flex;\r
  align-items: center;\r
  justify-content: space-between;\r
  gap: 16px;\r
}\r
\r
.hr_9d7800b_secondaryButton {\r
  min-height: 32px;\r
  flex: none;\r
  padding: 0 11px;\r
  font-size: 12px;\r
}\r
\r
.hr_9d7800b_secondaryButton:disabled,\r
.hr_9d7800b_primaryButton:disabled {\r
  cursor: default;\r
  opacity: 0.55;\r
}\r
\r
.hr_9d7800b_qrArea {\r
  min-height: 292px;\r
  margin-top: 16px;\r
  display: flex;\r
  flex-direction: column;\r
  align-items: center;\r
  justify-content: center;\r
  gap: 10px;\r
}\r
\r
.hr_9d7800b_qr,\r
.hr_9d7800b_qrPlaceholder {\r
  box-sizing: border-box;\r
  width: 280px;\r
  height: 280px;\r
  border-radius: 12px;\r
}\r
\r
.hr_9d7800b_qr {\r
  background: #fff;\r
  padding: 10px;\r
  image-rendering: pixelated;\r
}\r
\r
.hr_9d7800b_qrPlaceholder {\r
  color: var(--dsw-alias-label-tertiary, #7d8492);\r
  background: var(--dsw-alias-bg-layer-1, #f5f6f8);\r
  border: 1px dashed var(--dsw-alias-border-l2, rgba(128, 140, 160, 0.28));\r
  display: grid;\r
  place-items: center;\r
  font-size: 12px;\r
}\r
\r
.hr_9d7800b_qrValidity {\r
  color: var(--dsw-alias-label-tertiary, #7d8492);\r
  font-size: 11px;\r
  line-height: 17px;\r
}\r
\r
.hr_9d7800b_securityNote {\r
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
  .hr_9d7800b_statusDot[data-state='busy'] {\r
    animation: none;\r
  }\r
}\r
\r
@media (max-width: 680px) {\r
  .hr_9d7800b_capabilities {\r
    grid-template-columns: minmax(0, 1fr);\r
  }\r
\r
  .hr_9d7800b_connectCard {\r
    align-items: stretch;\r
    flex-direction: column;\r
  }\r
\r
  .hr_9d7800b_primaryButton {\r
    width: 100%;\r
  }\r
\r
  .hr_9d7800b_qrArea {\r
    flex-direction: column;\r
    gap: 12px;\r
  }\r
\r
}\r
.hr_9d7800b_updateCard { border: 1px solid var(--dsw-alias-border-l2, #ddd); background: var(--dsw-alias-bg-layer-3, #fff); border-radius: 12px; padding: 16px 18px; line-height: 1.5; font-size: 13px; overflow-wrap: anywhere; }
.hr_9d7800b_updateHeading { font-size: 14px; line-height: 21px; margin: 0 0 10px; }
.hr_9d7800b_updateEndpoint p, .hr_9d7800b_companionInline p { margin: 4px 0; }
.hr_9d7800b_updateScope { color: var(--dsw-alias-label-tertiary, #7d8492); font-size: 12px; font-weight: 400; }
.hr_9d7800b_updateEndpoint + div { margin-top: 12px; padding-top: 12px; border-top: 1px solid var(--dsw-alias-border-l2, #ddd); }
.hr_9d7800b_updateActions { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; margin-top: 8px; }
.hr_9d7800b_updateActions .hr_9d7800b_primaryButton { width: auto; min-height: 32px; padding: 0 12px; }
.hr_9d7800b_updateActions .hr_9d7800b_secondaryButton { min-height: 32px; }
.hr_9d7800b_updatePeerNote { margin: 0; color: var(--dsw-alias-label-tertiary, #7d8492); font-size: 12px; }
.hr_9d7800b_updateDetails { color: var(--dsw-alias-label-secondary, #647084); font-size: 12px; }
.hr_9d7800b_updateDetails summary { cursor: pointer; margin-top: 4px; }
.hr_9d7800b_companionInline > .hr_9d7800b_pairingHead { margin-bottom: 5px; flex-wrap: wrap; gap: 6px 12px; }
.hr_9d7800b_companionInline > strong { font-size: 13px; font-weight: 500; }
.hr_9d7800b_companionInline small { display: block; color: var(--dsw-alias-label-secondary, #647084); font-size: 12px; margin-top: 4px; }
.hr_9d7800b_companionInline progress { display: block; width: 100%; height: 8px; margin: 8px 0; accent-color: var(--dsw-alias-state-business-primary, #4e79ff); }
.hr_9d7800b_companionInline[data-state='complete'] > strong { color: var(--dsw-alias-state-success-primary, #1f9d68); }
.hr_9d7800b_companionInline[data-state='unavailable'] > strong, .hr_9d7800b_companionInline[data-state='recovering'] > strong { color: #b5861d; }
.hr_9d7800b_updateLabel { color: inherit; }\r
.hr_9d7800b_updateLabel[data-severity="none"] { color: #218b5c; }\r
.hr_9d7800b_updateLabel[data-severity="unknown"] { color: var(--text-secondary, #858b96); }\r
.hr_9d7800b_updateLabel[data-severity="required"] { color: #d54052; }\r
.hr_9d7800b_updateLabel[data-severity="recommended"], .hr_9d7800b_updateLabel[data-severity="info"] { color: #b5861d; }\r
.hr_9d7800b_updateProgress { width: 100%; height: 8px; margin-top: 8px; accent-color: #7487ef; }
.hr_9d7800b_updateVersions { display: flex; flex-wrap: wrap; gap: 4px 16px; margin: 6px 0; }
.hr_9d7800b_updateVersions span { color: var(--text-secondary, #858b96); }\r
.hr_9d7800b_updateVersions strong { color: var(--text-primary, inherit); font-weight: 500; }\r
.hr_9d7800b_updateCommand { display: flex; flex-wrap: wrap; align-items: center; gap: 12px; margin-top: 12px; }\r
.hr_9d7800b_updateCommand code { flex: 1 1 240px; white-space: pre-wrap; overflow-wrap: anywhere; user-select: text; }\r
.hr_9d7800b_updateChecked { display: block; margin-top: 4px; color: var(--text-secondary, #858b96); font-size: 11px; }
`,ee="@harness-remote/dsh-wechat-remote/HarnessRemoteSettings.module.css";if(typeof document<"u"&&document.querySelector("style[data-plugin-css="+JSON.stringify(ee)+"]")===null){let s=document.createElement("style");s.dataset.plugin="@harness-remote/dsh-wechat-remote",s.dataset.pluginCss=ee,s.textContent=Ee,document.head.appendChild(s)}te.exports={root:"hr_9d7800b_root",hero:"hr_9d7800b_hero",connectCard:"hr_9d7800b_connectCard",pairingCard:"hr_9d7800b_pairingCard",identity:"hr_9d7800b_identity",mark:"hr_9d7800b_mark",identityCopy:"hr_9d7800b_identityCopy",pairingHead:"hr_9d7800b_pairingHead",securityNote:"hr_9d7800b_securityNote",sidebarButton:"hr_9d7800b_sidebarButton",actions:"hr_9d7800b_actions",pageDialog:"hr_9d7800b_pageDialog",pageDialogContent:"hr_9d7800b_pageDialogContent",helpText:"hr_9d7800b_helpText",companionCard:"hr_9d7800b_companionCard",assistantsCard:"hr_9d7800b_assistantsCard",assistantsHeading:"hr_9d7800b_assistantsHeading",assistantChoices:"hr_9d7800b_assistantChoices",assistantChoice:"hr_9d7800b_assistantChoice",assistantChoiceCopy:"hr_9d7800b_assistantChoiceCopy",assistantChoiceHead:"hr_9d7800b_assistantChoiceHead",assistantEntryHead:"hr_9d7800b_assistantEntryHead",assistantStatus:"hr_9d7800b_assistantStatus",assistantPrimary:"hr_9d7800b_assistantPrimary",assistantSecondary:"hr_9d7800b_assistantSecondary",assistantTextButton:"hr_9d7800b_assistantTextButton",assistantDetails:"hr_9d7800b_assistantDetails",assistantCustomize:"hr_9d7800b_assistantCustomize",assistantPreview:"hr_9d7800b_assistantPreview",assistantUnavailable:"hr_9d7800b_assistantUnavailable",assistantLaunch:"hr_9d7800b_assistantLaunch",assistantWorkspacePath:"hr_9d7800b_assistantWorkspacePath",assistantHelpAnchor:"hr_9d7800b_assistantHelpAnchor",assistantHelpButton:"hr_9d7800b_assistantHelpButton",assistantTooltip:"hr_9d7800b_assistantTooltip",assistantButtons:"hr_9d7800b_assistantButtons",assistantEntry:"hr_9d7800b_assistantEntry",overall:"hr_9d7800b_overall",statusDot:"hr_9d7800b_statusDot",capabilities:"hr_9d7800b_capabilities",capability:"hr_9d7800b_capability",capabilityCopy:"hr_9d7800b_capabilityCopy",notice:"hr_9d7800b_notice",secondaryButton:"hr_9d7800b_secondaryButton",primaryButton:"hr_9d7800b_primaryButton",qrArea:"hr_9d7800b_qrArea",qr:"hr_9d7800b_qr",qrPlaceholder:"hr_9d7800b_qrPlaceholder",qrValidity:"hr_9d7800b_qrValidity",updateCard:"hr_9d7800b_updateCard",updateHeading:"hr_9d7800b_updateHeading",updateEndpoint:"hr_9d7800b_updateEndpoint",companionInline:"hr_9d7800b_companionInline",updateScope:"hr_9d7800b_updateScope",updateActions:"hr_9d7800b_updateActions",updatePeerNote:"hr_9d7800b_updatePeerNote",updateDetails:"hr_9d7800b_updateDetails",updateLabel:"hr_9d7800b_updateLabel",updateProgress:"hr_9d7800b_updateProgress",updateVersions:"hr_9d7800b_updateVersions",updateCommand:"hr_9d7800b_updateCommand",updateChecked:"hr_9d7800b_updateChecked"}});var ze={};De(ze,{apply:()=>Ue,inject:()=>Re});module.exports=Ae(ze);var ie=require("react"),oe=require("@deepseek-ai/dsh-client-ui-primitives");var I=j(R(),1),_=require("react/jsx-runtime");function se({value:s,onDecide:t,deciding:e=!1,compact:a=!1}){if(!s||!a&&s.state==="idle")return null;let n={"confirmation-required":"是否更新下方指定端的插件？",deferred:"已暂缓此次联动更新",pending:"联动更新待处理",busy:"等待待更新端的任务结束",preparing:"正在准备联动更新",installing:"正在安装插件更新",verifying:"正在核验更新后的恢复状态",recovering:"正在恢复更新前的插件","restart-required":"待更新端需启动或重启确认","self-restart-required":"当前端待重启，尚未生效",unverified:"两端更新状态待核实",complete:"两端插件已对齐",unavailable:"联动更新尚未确认成功"},l=["preparing","installing","verifying","recovering"].includes(s.state),r=s.versions?.peer==="desktop"?"Desktop":s.versions?.peer==="web"?"Web":null,d=s.target?.scope==="desktop"?"Desktop":s.target?.scope==="web"?"Web":null,h=d||"更新端",g={pending:`等待 ${h} 就绪`,busy:`${h} 有任务，等待空闲`,preparing:`正在准备 ${h} 更新`,installing:`正在更新 ${h}`,verifying:`正在核对 ${h} 更新结果`,recovering:`正在恢复 ${h} 原版本`,"restart-required":`${h} 已安装，待启动或重连确认`,"self-restart-required":"当前端待重启，尚未生效",unverified:"更新状态待核对",complete:"两端版本已同步",unavailable:"更新未完成，请核对"},p=["confirmation-required","deferred"].includes(s.state);return a&&s.state==="idle"&&!s.versions?.peerInstalled?(0,_.jsx)("p",{className:I.default.updatePeerNote,children:"未检测到可同步更新的另一端；当前端可独立使用。"}):(0,_.jsxs)("aside",{className:a?I.default.companionInline:I.default.companionCard,"data-state":s.state,role:"status","aria-live":"polite",children:[a&&r?(0,_.jsxs)("div",{className:I.default.pairingHead,children:[(0,_.jsxs)("strong",{children:[r," ",(0,_.jsx)("span",{className:I.default.updateScope,children:"同一主机"})]}),(0,_.jsx)("span",{className:I.default.updateScope,children:s.versions?.peerInstalled?`已安装 ${s.versions.peerInstalled}`:"安装或启用状态未确认"})]}):null,a&&p&&d&&s.target?(0,_.jsxs)("p",{children:[(0,_.jsxs)("strong",{children:[d," 可更新至 ",s.target.version]}),s.state==="deferred"?" · 已暂缓":""]}):(0,_.jsx)("strong",{children:s.state==="idle"?"未发现待确认的同步更新":(a?g[s.state]:void 0)||n[s.state]||"插件更新状态待核对"}),a&&(s.target||s.state==="idle")?(0,_.jsx)(_.Fragment,{children:s.state!=="idle"&&s.message?(0,_.jsxs)("details",{className:I.default.updateDetails,children:[(0,_.jsx)("summary",{children:"详细状态"}),(0,_.jsx)("p",{children:s.message})]}):null}):s.message?(0,_.jsx)("p",{children:s.message}):null,!a&&s.versions?(0,_.jsxs)("small",{children:[s.versions.current==="desktop"?"Desktop":"Web","：运行 ",s.versions.running," · 已安装 ",s.versions.installed??"未确认","；",r,"：已安装 ",s.versions.peerInstalled??"未确认或未启用"]}):null,p&&s.offerId&&t?(0,_.jsxs)(_.Fragment,{children:[(0,_.jsxs)("div",{className:I.default.updateActions,children:[(0,_.jsx)("button",{type:"button",className:I.default.primaryButton,disabled:e,onClick:()=>t("approve"),children:e?"确认中…":d?`确认更新 ${d}`:"确认更新指定端"}),(0,_.jsx)("button",{type:"button",className:I.default.secondaryButton,disabled:e,onClick:()=>t("later"),children:"稍后再说"})]}),(0,_.jsx)("small",{className:I.default.updateChecked,children:"等待该端任务结束后更新，连接会短暂中断；保留配对与会话。"})]}):null,l?(0,_.jsx)("progress",{"aria-label":"联动更新进度"}):null,s.state==="busy"?(0,_.jsx)("small",{children:"不用手动停止任务。请保持两端运行，空闲后会继续检查。"}):l?(0,_.jsx)("small",{children:"请保持两端当前状态，暂勿退出、重启或重复安装。关闭本设置页不会取消更新。"}):s.state==="unavailable"?(0,_.jsx)("small",{children:"请在待更新端核对版本，必要时使用其原安装入口。"}):null]})}async function ae(s,t,e=fetch){let a=await s(),n=a.gate;if(!n)throw new Error("当前节点没有提供配对入口");let l=n.profileScope==="desktop",r=n.localDoor?.port,d=Number.isSafeInteger(r)&&r>=1&&r<=65535?`http://127.0.0.1:${r}`:null;if(n.management==="authenticated-rpc")return{host:a,runtime:n,localOrigin:l?null:d,status:()=>t("status"),pairCode:()=>t("pair-code"),decide:(g,p)=>t("companion-decision",{offerId:g,action:p})};if(l||n.management==="unavailable"||!d||n.localDoor.state!=="listening")throw new Error("当前节点配对入口尚未就绪");let h=async g=>{let p=await e(d+g,{cache:"no-store"});if(!p.ok)throw new Error(`配对请求失败 (${p.status})`);return p.json()};return{host:a,runtime:n,localOrigin:d,status:()=>h("/gate/status"),pairCode:()=>h("/pair/code"),decide:async(g,p)=>{let m=await e(d+"/gate/companion/decision",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({offerId:g,action:p})});if(!m.ok)throw new Error("更新通知已变化，请刷新后重试");return m.json()}}}var J=class{constructor(t,e=globalThis.fetch){this.origin=t;this.fetcher=e.bind(globalThis)}value={check:null,checking:!1,progress:null,error:"",copied:!1,resumeFailed:!1};listeners=new Set;reading;installing=!1;disposed=!1;job=null;timer;pollGeneration=0;recovering=!1;fetcher;getSnapshot=()=>this.value;subscribe=t=>this.disposed?()=>{}:(this.listeners.add(t),this.listeners.size===1&&this.refresh(),()=>{this.listeners.delete(t)});patch(t){if(!this.disposed){this.value={...this.value,...t};for(let e of this.listeners)e()}}refresh=()=>this.disposed?Promise.resolve():this.reading?this.reading:(this.patch({checking:!0,error:"",copied:!1}),this.reading=(async()=>{try{let t=await this.fetcher(this.origin+"/gate/update/check",{signal:AbortSignal.timeout(1e4)}),e=await t.json();if(!t.ok)throw new Error(e.error||"暂时无法检查更新");if(!e.advice?.current||typeof e.advice.label!="string")throw new Error("更新检查返回信息不完整");if(this.patch({check:e}),this.installing||this.job||this.recovering)return;e.activeJob?.statusOrigin?this.follow(e.activeJob):e.lastResult?.phase==="unknown"?this.patch({progress:e.lastResult}):e.mode==="busy"?this.patch({progress:{phase:"preparing",progress:0,message:"更新仍在准备或等待确认，请稍后重新检查；不要重复安装。",terminal:!0}}):this.patch({progress:e.lastResult??null})}catch(t){this.patch({check:null,error:t instanceof Error?t.message:"暂时无法检查更新"})}finally{this.patch({checking:!1})}})().finally(()=>{this.reading=void 0}),this.reading);follow(t){if(this.disposed||this.job?.jobId===t.jobId)return;this.job=t;let e=++this.pollGeneration,a=Date.now()+10*6e4;clearTimeout(this.timer),this.patch({progress:{phase:"recovering",progress:0,message:"正在恢复更新进度…",terminal:!1}});let n=async()=>{if(this.disposed||e!==this.pollGeneration)return;let l;try{let r=await this.fetcher(t.statusOrigin+"/status",{headers:{Authorization:"Bearer "+t.statusToken},signal:AbortSignal.timeout(4e3)});if(!r.ok)throw new Error("进度暂不可用");let d=await r.json();if(d.jobId!==t.jobId||typeof d.terminal!="boolean"||typeof d.message!="string")throw new Error("进度不匹配");l=d}catch{try{let r=await this.fetcher(this.origin+"/gate/update/status",{signal:AbortSignal.timeout(3e3)}),d=await r.json();r.ok&&d.lastResult?.jobId===t.jobId&&(l=d.lastResult)}catch{}}if(!(this.disposed||e!==this.pollGeneration)){if(l&&(this.patch({progress:l}),l.terminal)){this.job=null,l.ok?this.resume(t.jobId):this.refresh();return}if(Date.now()>a){this.job=null,this.patch({progress:{phase:"unknown",progress:0,message:"暂时无法确认更新结果。请重新打开此主机 WebUI 检查版本；不要重复安装或删除节点。",terminal:!0}});return}this.timer=setTimeout(()=>void n(),1e3)}};n()}async resume(t){this.recovering=!0;let e=Date.now()+3e4,a=async()=>{try{let n=await this.fetcher(this.origin+"/gate/update/resume?job="+encodeURIComponent(t),{signal:AbortSignal.timeout(3e3)});if(!n.ok)throw new Error("尚未恢复");let l=await n.json();if(!l.url)throw new Error("缺少恢复地址");let r=new URL(l.url);if(r.origin!==window.location.origin||r.pathname!=="/"||r.username||r.password||r.hash)throw new Error("恢复地址不匹配");this.disposed||window.location.replace(r.href)}catch{if(this.disposed)return;if(Date.now()>=e){this.recovering=!1,this.patch({resumeFailed:!0});return}this.timer=setTimeout(()=>void a(),1e3)}};await a()}install=async()=>{let{check:t,checking:e,error:a,progress:n}=this.value;if(this.disposed||!t?.canInstall||e||a||n&&!n.terminal||this.installing||this.job||this.recovering)return;this.installing=!0,this.patch({error:"",check:{...t,canInstall:!1,ticket:""},progress:{phase:"download",progress:10,message:"正在下载并验证更新包；当前插件尚未替换",terminal:!1}});let l=!1;try{let r=await this.fetcher(this.origin+"/gate/update/start",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({ticket:t.ticket})}),d=await r.json();if(l=!r.ok&&typeof d.error=="string",!r.ok||!d.statusOrigin)throw new Error(d.error||"无法取得更新进度，请重新检查");this.follow(d)}catch(r){if(this.disposed)return;if(l)this.patch({progress:{phase:"failed",progress:0,message:(r instanceof Error?r.message:"更新暂不可用")+"。请重新检查更新。",terminal:!0,ok:!1}});else{try{let d=await this.fetcher(this.origin+"/gate/update/status",{signal:AbortSignal.timeout(3e3)}),h=await d.json();if(d.ok&&h.activeJob?.statusOrigin){this.follow(h.activeJob);return}}catch{}this.patch({progress:{phase:"unknown",progress:0,message:"连接中断，暂时无法确认更新结果。请稍后检查更新；不要重复安装或删除节点。",terminal:!0}})}}finally{this.installing=!1}};copyCommand=async()=>{if(!(!this.value.check?.manualCommand||this.value.checking||this.installing||this.job))try{await navigator.clipboard.writeText(this.value.check.manualCommand),this.patch({copied:!0})}catch{this.patch({error:"复制失败，请手动选中下方命令复制。"})}};dispose=()=>{this.disposed=!0,this.pollGeneration++,clearTimeout(this.timer),this.listeners.clear()}};var L=class{constructor(t){this.call=t}value={checking:!1,starting:!1,check:null,status:null,error:null};listeners=new Set;reading;timer;disposed=!1;checkRevision=0;checkInvalidated=!1;getSnapshot=()=>this.value;patch(t){if(!this.disposed){this.value={...this.value,...t};for(let e of this.listeners)e()}}subscribe=t=>this.disposed?()=>{}:(this.listeners.add(t),this.checkInvalidated?(this.refreshInvalidatedCheck(),this.active()&&this.poll()):!this.value.check&&!this.value.starting?this.refresh():this.active()&&this.poll(),()=>{this.listeners.delete(t),this.listeners.size||(clearTimeout(this.timer),this.timer=void 0)});active(){return this.value.status&&["preparing","installing","unknown","restart-required"].includes(this.value.status.phase)}invalidateCheck=()=>{this.disposed||(this.checkRevision++,this.checkInvalidated=!0,this.value.check&&this.patch({check:{...this.value.check,canInstall:!1,ticket:""}}),this.refreshInvalidatedCheck())};refreshInvalidatedCheck(){!this.disposed&&this.checkInvalidated&&this.listeners.size&&!this.value.starting&&!this.active()&&this.refresh()}refresh=()=>{if(this.disposed||this.value.starting)return Promise.resolve();if(this.reading)return this.reading;let t=this.checkRevision;return this.checkInvalidated=!1,this.patch({checking:!0,error:null}),this.reading=(async()=>{try{let e=await this.call("update-check");if(this.disposed||t!==this.checkRevision)return;if(!e?.advice||!e.status||typeof e.canInstall!="boolean")throw Error("invalid update response");this.patch({check:e,status:e.status}),this.active()&&this.poll()}catch{if(this.disposed||t!==this.checkRevision)return;let e=!1;try{let a=await this.call("status");e=!!(a&&!a.plugin)}catch{}if(this.disposed||t!==this.checkRevision)return;this.patch({check:null,error:e?"当前运行的连接服务尚不支持此更新入口。若刚安装新版，请在任务结束后退出并重新打开 Desktop；无需重新配对。仍不可用时请在原生插件管理器核对安装。":"本次更新检查未完成，不能据此判断已是最新版。请稍后重试；配对和聊天不受此次检查失败影响。"})}finally{this.patch({checking:!1})}})().finally(()=>{this.reading=void 0,this.refreshInvalidatedCheck()}),this.reading};install=async()=>{let t=this.value.check;if(!(this.disposed||this.checkInvalidated||this.value.starting||this.value.checking||!t?.canInstall||!t.ticket)){this.patch({starting:!0,error:null,check:{...t,canInstall:!1,ticket:""}});try{let e=await this.call("update-start",{ticket:t.ticket});this.patch({status:e})}catch(e){this.patch({status:e?.code==="update/not-started"?{phase:"failed",message:e instanceof Error?e.message:"尚未启动更新，请重新检查"}:{phase:"unknown",message:"更新提交结果暂未确认，正在核对；请勿重复安装。"}})}finally{this.patch({starting:!1}),this.poll(),this.refreshInvalidatedCheck()}}};poll(){this.disposed||this.timer||!this.listeners.size||!this.active()||(this.timer=setTimeout(async()=>{try{let t=await this.call("update-status");if(!t||!["idle","preparing","installing","restart-required","complete","failed","unknown"].includes(t.phase))throw Error("invalid status");this.patch({status:t,error:t.phase==="idle"?"尚未发现已接受的更新，请重新检查后再操作。":null})}catch{this.patch({error:"更新状态暂不可用；恢复连接后继续核对，不会重复安装。"})}finally{this.timer=void 0,this.poll(),this.refreshInvalidatedCheck()}},2e3))}dispose(){this.disposed=!0,this.checkRevision++,this.checkInvalidated=!1,clearTimeout(this.timer),this.listeners.clear()}};var X=()=>({loadState:"loading",qrState:"idle",status:null,host:null,runtime:null,localOrigin:null,qr:null,error:null,decisionError:null,deciding:!1}),ne=s=>s?.companionUpdate?.state?["preparing","installing","verifying","recovering"].includes(s.companionUpdate.state):void 0,T=class{constructor(t,e){this.describeHost=t;this.callManagement=e}updates;nativeUpdates;value=X();listeners=new Set;timer;reading;pairing;disposed=!1;identity="";generation=0;getSnapshot=()=>this.value;subscribe=t=>this.disposed?()=>{}:(this.listeners.add(t),this.timer||(this.refresh(),this.timer=setInterval(()=>void this.refresh(),2e3)),()=>{this.listeners.delete(t),this.listeners.size||(clearInterval(this.timer),this.timer=void 0)});patch(t){if(!this.disposed){this.value={...this.value,...t};for(let e of this.listeners)e()}}async client(){let t=await ae(this.describeHost,this.callManagement);if(this.disposed)throw new Error("disposed");let e=`${t.host.agentInstanceId??t.host.computerName}/${t.runtime.profileScope??"web"}`;return this.identity&&this.identity!==e&&(this.generation++,this.value=X(),this.updates?.dispose(),this.updates=void 0,this.nativeUpdates?.dispose(),this.nativeUpdates=void 0),this.identity=e,t.runtime.profileScope==="desktop"&&!this.nativeUpdates&&(this.nativeUpdates=new L(this.callManagement)),this.updates?.origin!==t.localOrigin&&(this.updates?.dispose(),this.updates=t.localOrigin?new J(t.localOrigin):void 0),this.patch({host:t.host,runtime:t.runtime,localOrigin:t.localOrigin}),t}refresh=()=>this.disposed?Promise.resolve():this.reading?this.reading:(this.reading=(async()=>{try{let t=await this.client(),e=this.generation,a={...await t.status()};if(a.companionUpdate?.state==="complete"&&!a.plugin&&(a.companionUpdate={state:"unverified",message:"当前连接服务尚未提供运行版本核验，不能确认两端已对齐。若刚安装插件，请在任务结束后退出并重新打开当前应用；无需重新配对。"}),e!==this.generation)return;let n=ne(this.value.status),l=ne(a);l!==void 0&&l!==n&&this.nativeUpdates?.invalidateCheck(),this.patch({status:a,runtime:a.gate??t.runtime,loadState:"ready",error:null,...this.value.qr&&this.value.qr.expiresAt<=Date.now()?{qrState:"expired",qr:null}:{}})}catch{this.patch({loadState:"error",error:"连接服务暂未就绪。请确认 DSH 正在运行，然后重试。"})}})().finally(()=>{this.reading=void 0}),this.reading);generateQr=()=>this.disposed?Promise.resolve():this.pairing?this.pairing:(this.patch({qrState:"loading",qr:null,error:null}),this.pairing=(async()=>{try{let t=await this.client(),e=this.generation,a=await t.pairCode();if(e!==this.generation)return;if(!a?.qrDataUrl?.startsWith("data:image/")||!Number.isFinite(a.expiresAt)||a.expiresAt<=Date.now())throw new Error("invalid QR");this.patch({qr:a,qrState:"ready"}),await this.refresh()}catch{this.patch({qr:null,qrState:"error",error:"暂时无法生成配对二维码，请稍后重试。"})}})().finally(()=>{this.pairing=void 0}),this.pairing);decide=async t=>{let e=this.value.status?.companionUpdate?.offerId;if(!(this.disposed||this.value.deciding||!e)){this.patch({deciding:!0,decisionError:null});try{let a=await this.client();if(this.value.status?.companionUpdate?.offerId!==e)throw new Error("stale offer");await a.decide(e,t),await this.reading,await this.refresh()}catch{this.patch({decisionError:"更新选择未确认，请刷新后核对；不要重复安装。"})}finally{this.patch({deciding:!1})}}};dispose=()=>{this.disposed=!0,this.generation++,clearInterval(this.timer),this.timer=void 0,this.listeners.clear(),this.value=X(),this.updates?.dispose(),this.updates=void 0,this.nativeUpdates?.dispose(),this.nativeUpdates=void 0}},re=new WeakMap;function O(s,t){let e=re.get(s);return e||(e=new T(s,t),re.set(s,e)),e}var U=j(R(),1),H=require("react/jsx-runtime");function $({describeHost:s,callManagement:t,onDismiss:e,onOpenDetails:a,compact:n=!1,store:l=O(s,t)}){let{status:r,deciding:d,decisionError:h,error:g,loadState:p}=(0,ie.useSyncExternalStore)(l.subscribe,l.getSnapshot,l.getSnapshot),m=r?.companionUpdate,v=h||g,N=(0,H.jsxs)("div",{children:[(0,H.jsx)(se,{value:m,compact:n,deciding:d||p!=="ready",onDecide:x=>void l.decide(x)}),!m&&!v?(0,H.jsx)("p",{className:U.default.helpText,children:p==="loading"?"正在检查同一主机的另一端…":"另一端状态未确认；不会自动更新。"}):!n&&m?.state==="idle"?(0,H.jsx)("p",{className:U.default.helpText,children:"未发现需要联动更新的另一端。当前节点可独立使用，不会自动安装另一端或启用已停用的插件。"}):null,v?(0,H.jsx)("p",{role:"alert",children:v}):null,e?(0,H.jsxs)("div",{className:U.default.actions,children:[a?(0,H.jsx)("button",{type:"button",className:U.default.primaryButton,onClick:a,children:"前往微信连接"}):null,(0,H.jsx)("button",{type:"button",className:U.default.secondaryButton,onClick:e,children:"关闭提示（不会确认更新）"})]}):null]});return e?(0,H.jsx)(oe.Modal,{open:!0,title:"微信连接 · 联动更新",closeLabel:"关闭提示",className:U.default.pageDialog,contentClassName:U.default.pageDialogContent,onClose:e,children:N}):N}var W=require("react"),le=j(R(),1),D=require("react/jsx-runtime");function de({wide:s,openPlugin:t}){let[e,a]=(0,W.useState)(!1),[n,l]=(0,W.useState)(!1),r=(0,W.useRef)(!1),d=async()=>{if(!r.current){r.current=!0,l(!0);try{await t()||a(!0)}finally{r.current=!1,l(!1)}}};return(0,D.jsxs)(D.Fragment,{children:[(0,D.jsxs)("button",{type:"button",className:le.default.sidebarButton,"data-wide":s,title:"微信连接","aria-label":"微信连接",disabled:n,onClick:()=>void d(),children:[(0,D.jsxs)("svg",{width:"20",height:"20",viewBox:"0 0 24 24",fill:"none",stroke:"currentColor",strokeWidth:"1.7","aria-hidden":"true",children:[(0,D.jsx)("path",{d:"M20 11.5a8 8 0 0 1-8 8 9 9 0 0 1-3.5-.7L4 20l1.2-4.2A7.8 7.8 0 0 1 4 11.5a8 8 0 0 1 16 0Z"}),(0,D.jsx)("path",{d:"M8 11.5h.01M12 11.5h.01M16 11.5h.01",strokeWidth:"2.5",strokeLinecap:"round"})]}),s?(0,D.jsx)("span",{children:n?"正在打开…":"微信连接"}):null]}),e?(0,D.jsx)("small",{role:"status",children:"插件详情暂不可用，请打开「设置 → 微信连接」。"}):null]})}async function pe(s){try{let t=s("pluginNavigation"),e=s("remote.pluginManager");if(typeof t?.openBundle!="function"||typeof e?.listBundles!="function")return!1;let a=await e.listBundles();if(!a.ok||!Array.isArray(a.value))return!1;let n=a.value.filter(r=>r.enabled&&["dsh-wechat-remote","@harness-remote/dsh-wechat-remote"].includes(r.name));if(n.length!==1)return!1;let l=s("pluginNavigation");return l!==t||typeof l.openBundle!="function"?!1:(l.openBundle(n[0].name),!0)}catch{return!1}}var G=require("react"),ve=require("@deepseek-ai/dsh-client-ui-primitives"),w=j(R(),1);var ce=require("react"),k=j(R(),1),u=require("react/jsx-runtime");function he({store:s,embedded:t=!1}){let{check:e,checking:a,progress:n,error:l,copied:r,resumeFailed:d}=(0,ce.useSyncExternalStore)(s.subscribe,s.getSnapshot,s.getSnapshot),h=!!(n&&!n.terminal),g=h||n?.phase==="unknown"||e?.mode==="busy";return(0,u.jsxs)("div",{className:t?k.default.updateEndpoint:k.default.updateCard,children:[(0,u.jsxs)("div",{className:k.default.pairingHead,children:[(0,u.jsxs)("strong",{children:["Web ",(0,u.jsx)("span",{className:k.default.updateScope,children:"当前端"})]}),(0,u.jsx)("button",{type:"button",className:k.default.secondaryButton,disabled:a||h,onClick:()=>void s.refresh(),children:a?"检查中…":"检查更新"})]}),e?(0,u.jsxs)(u.Fragment,{children:[e.channel==="preview"?(0,u.jsx)("span",{className:k.default.updateLabel,"data-severity":"recommended",children:"预览通道"}):null,(0,u.jsxs)("div",{className:k.default.updateVersions,children:[(0,u.jsxs)("span",{children:["DSH ",(0,u.jsx)("strong",{children:e.advice.current.agentVersion||"未确认"})]}),(0,u.jsxs)("span",{children:["插件运行 ",(0,u.jsx)("strong",{children:e.advice.current.pluginVersion||"未确认"})]})]}),a?null:(0,u.jsxs)(u.Fragment,{children:[(0,u.jsx)("strong",{className:k.default.updateLabel,"data-severity":g?"unknown":e.advice.severity,role:"status",children:h?"正在更新 Web 插件":g?"更新状态待核对":e.advice.label}),!g&&e.advice.targetVersion?(0,u.jsxs)("p",{children:["可更新至 ",e.advice.targetVersion,e.mode==="manual"?" · 需手动更新":""]}):null,!g&&(e.advice.severity==="unknown"||e.advice.severity==="required"||e.mode==="manual")?(0,u.jsxs)("details",{children:[(0,u.jsx)("summary",{children:e.mode==="manual"?"手动更新说明":"查看说明"}),e.reason?(0,u.jsx)("p",{children:e.reason}):null,(0,u.jsx)("p",{children:e.advice.message})]}):null,!g&&e.mode==="manual"&&e.manualCommand?(0,u.jsxs)("div",{className:k.default.updateCommand,children:[(0,u.jsx)("code",{children:e.manualCommand}),(0,u.jsx)("button",{type:"button",className:k.default.secondaryButton,disabled:h,onClick:()=>void s.copyCommand(),children:r?"已复制":"复制命令"})]}):null,!g&&e.canInstall?(0,u.jsxs)(u.Fragment,{children:[(0,u.jsx)("div",{className:k.default.updateActions,children:(0,u.jsx)("button",{type:"button",className:k.default.primaryButton,disabled:h||!!l,onClick:()=>void s.install(),children:"更新 Web 并重启"})}),(0,u.jsx)("small",{className:k.default.updateChecked,children:"仅更新 Web，保留配对与会话；连接会短暂中断。"})]}):null,e.advice.checkedAt&&e.advice.severity!=="unknown"?(0,u.jsxs)("small",{className:k.default.updateChecked,children:["检查于 ",new Date(e.advice.checkedAt).toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"})]}):null]})]}):null,l?(0,u.jsx)("p",{role:"alert",children:l}):null,n?(0,u.jsxs)("div",{role:"status","aria-live":"polite",children:[!n.terminal||n.ok===!0?(0,u.jsx)("progress",{className:k.default.updateProgress,max:100,value:n.progress}):null,(0,u.jsx)("p",{children:n.message}),d?(0,u.jsx)("p",{role:"alert",children:"插件已完成更新，但未能自动打开 WebUI。请使用 DSH 启动时显示的地址打开，无需重复更新。"}):null]}):null]})}var ue=require("react"),S=j(R(),1),y=require("react/jsx-runtime");function ge({store:s,embedded:t=!1}){let{check:e,status:a,checking:n,starting:l,error:r}=(0,ue.useSyncExternalStore)(s.subscribe,s.getSnapshot,s.getSnapshot),d=l||a?.phase==="preparing"||a?.phase==="installing",h=a&&["preparing","installing","restart-required","unknown"].includes(a.phase),g=a?.phase==="restart-required"||a?.phase==="complete",p=a?.phase==="restart-required"?"已安装，待重新打开 Desktop":a?.phase==="unknown"?"更新结果待核对":d?"正在更新 Desktop 插件":a?.phase==="complete"?"更新已生效":"";return(0,y.jsxs)("div",{className:t?S.default.updateEndpoint:S.default.updateCard,children:[(0,y.jsxs)("div",{className:S.default.pairingHead,children:[(0,y.jsxs)("strong",{children:["Desktop ",(0,y.jsx)("span",{className:S.default.updateScope,children:"当前端"})]}),(0,y.jsx)("button",{type:"button",className:S.default.secondaryButton,disabled:n||d,onClick:()=>void s.refresh(),children:n?"检查中…":"检查更新"})]}),e?(0,y.jsxs)(y.Fragment,{children:[e.channel==="preview"?(0,y.jsx)("span",{className:S.default.updateLabel,"data-severity":"recommended",children:"预览通道"}):null,(0,y.jsxs)("div",{className:S.default.updateVersions,children:[(0,y.jsxs)("span",{children:["DSH ",(0,y.jsx)("strong",{children:e.advice.current.agentVersion||"未确认"})]}),(0,y.jsxs)("span",{children:["插件运行 ",(0,y.jsx)("strong",{children:e.advice.current.pluginVersion||"未确认"})]}),g&&a.targetVersion&&a.targetVersion!==e.advice.current.pluginVersion?(0,y.jsxs)("span",{children:["已安装 ",(0,y.jsx)("strong",{children:a.targetVersion})]}):null]}),(0,y.jsx)("strong",{className:S.default.updateLabel,"data-severity":a?.phase==="complete"?"none":h?a?.phase==="unknown"?"unknown":"info":e.advice.severity,children:p||e.advice.label}),!g&&!h&&e.advice.targetVersion?(0,y.jsxs)("p",{children:["可更新至 ",e.advice.targetVersion]}):null,!h&&e.reason?(0,y.jsx)("p",{children:e.reason}):null,!h&&e.canInstall?(0,y.jsxs)(y.Fragment,{children:[(0,y.jsx)("div",{className:S.default.updateActions,children:(0,y.jsx)("button",{type:"button",className:S.default.primaryButton,disabled:d||n,onClick:()=>void s.install(),children:"更新 Desktop 插件"})}),(0,y.jsx)("small",{className:S.default.updateChecked,children:"仅更新 Desktop，保留配对与会话；完成后需退出并重新打开。"})]}):null,e.advice.checkedAt?(0,y.jsxs)("small",{className:S.default.updateChecked,children:["检查于 ",new Date(e.advice.checkedAt).toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"})]}):null]}):null,a?.phase!=="idle"&&a?(0,y.jsxs)("div",{role:"status","aria-live":"polite",children:[d?(0,y.jsx)("progress",{className:S.default.updateProgress,"aria-label":"Desktop 插件更新中"}):null,(0,y.jsx)("p",{children:a.message})]}):null,r?(0,y.jsx)("p",{role:"alert",children:r}):null]})}var q=require("react"),be=require("@deepseek-ai/dsh-client-ui-primitives"),b=j(R(),1),o=require("react/jsx-runtime"),V=s=>s.state==="installed"&&(s.nativeState===void 0||s.nativeState==="installed"),Be=s=>V(s)?"已安装":s.state==="draft"?"待安装":s.nativeState==="uninstalled"?"未安装":s.nativeState==="disabled"?"已停用":s.state==="pending-restart"?"待重启":"待核对",Q=s=>s.templateId==="designer"||s.id==="designer"?"定制我的助手":s.name;function me({label:s,children:t}){return(0,o.jsxs)("span",{className:b.default.assistantHelpAnchor,children:[(0,o.jsx)("button",{type:"button",className:b.default.assistantHelpButton,"aria-label":s,title:t,children:"?"}),(0,o.jsx)("span",{className:b.default.assistantTooltip,role:"tooltip",children:t})]})}function fe({store:s}){let{catalog:t,preview:e,busy:a,message:n,error:l,launch:r}=(0,q.useSyncExternalStore)(s.subscribe,s.getSnapshot,s.getSnapshot),d=(0,q.useRef)();(0,q.useEffect)(()=>{let i=new AbortController;return d.current=i,s.load(),()=>i.abort()},[s]);let h=t?.drafts||[],g=h.filter(i=>V(i)&&!i.replacement),p=h.filter(i=>i.state==="draft"),m=h.filter(i=>i.source!=="builtin"&&i.state!=="draft"&&(!V(i)||i.replacement)),v=t?.templates||[],N=i=>g.find(f=>f.templateId===i),x=i=>void s.prepareStart(i.presetId,d.current?.signal),A=i=>i.id==="designer"||i.templateId==="designer"?"先打开定制会话，说清职业和工作习惯；助手会设计可复用的模式。确认安装后，再用新模式开启工作会话。不会自动安装或发送消息。":`先选工作区，再用「${i.name}」开始空白会话。手机连接此电脑后可继续该会话；发卡与提醒需在小程序设置中开启「微信群协作助手」。`,B=i=>{let f=N(i.id),E=i.builtin,P=h.find(z=>z.templateId===i.id&&z.source==="builtin");return(0,o.jsxs)("article",{className:b.default.assistantChoice,"data-installed":!!f,children:[(0,o.jsxs)("div",{className:b.default.assistantChoiceCopy,children:[(0,o.jsxs)("div",{className:b.default.assistantChoiceHead,children:[(0,o.jsx)("strong",{children:Q(i)}),(0,o.jsx)(me,{label:`${Q(i)}使用说明`,children:A(i)})]}),(0,o.jsx)("p",{children:i.id==="designer"?"用对话设计适合自己职业的助手模式":i.description})]}),!f&&E?(0,o.jsx)("span",{className:b.default.assistantUnavailable,title:P?.reason||E.reason,children:P?.nativeState==="disabled"?"已停用":"待就绪"}):null,(0,o.jsx)("button",{type:"button",className:b.default.secondaryButton,disabled:a||!!(E&&!f),onClick:()=>f?x(f):E?void s.load():void s.choose(i.id),children:f?i.id==="designer"?"开始定制":"开始使用":E?"开始使用":"安装"})]},i.id)},C=i=>(0,o.jsxs)("div",{className:b.default.assistantEntry,children:[(0,o.jsxs)("div",{className:b.default.assistantEntryHead,children:[(0,o.jsx)("strong",{children:Q(i)}),(0,o.jsx)("span",{children:Be(i)})]}),i.replacement?(0,o.jsxs)("div",{children:[(0,o.jsxs)("p",{children:["已提供内置「",i.replacement.name,"」，无需再装同款独立包。"]}),(0,o.jsx)("p",{children:i.replacement.warning}),i.replacement.canRemoveAfterReview?(0,o.jsxs)("p",{children:["核对旧会话后，可在 DSH 插件列表卸载：",(0,o.jsx)("code",{children:i.replacement.bundleName})]}):null]}):null,V(i)?(0,o.jsx)("button",{type:"button",className:b.default.assistantSecondary,disabled:a,onClick:()=>x(i),children:"开始使用"}):i.state==="draft"?(0,o.jsx)("button",{type:"button",className:b.default.assistantPrimary,disabled:a,onClick:()=>void s.preview(i.id,i.version),children:"查看并安装"}):(0,o.jsxs)(o.Fragment,{children:[(0,o.jsx)("button",{type:"button",className:b.default.assistantSecondary,disabled:a,onClick:()=>void s.verify(i.id,i.version),children:"刷新状态"}),i.nativeState==="uninstalled"&&!i.replacement?(0,o.jsx)("button",{type:"button",className:b.default.assistantSecondary,disabled:a,onClick:()=>void s.reinstall(i.id,i.version),children:"查看并重新安装"}):null]}),!V(i)&&i.reason?(0,o.jsxs)("details",{className:b.default.assistantDetails,children:[(0,o.jsx)("summary",{children:"状态说明"}),(0,o.jsx)("p",{children:i.reason})]}):null]},`${i.id}:${i.version}`);return(0,o.jsxs)("section",{className:b.default.assistantsCard,"aria-label":"微信群协作助手","aria-busy":a,children:[(0,o.jsxs)("div",{className:b.default.assistantsHeading,children:[(0,o.jsxs)("div",{className:b.default.assistantChoiceHead,children:[(0,o.jsx)("h3",{children:"微信群协作助手"}),(0,o.jsx)(me,{label:"电脑助手与手机群协作",children:"电脑助手可独立使用，组件开关由 DSH 管理。手机发任务和提醒，需在小程序「设置 → 实验性功能」开启「微信群协作助手」。各手机独立设置，不会关闭电脑助手或已发布任务。"})]}),(0,o.jsx)("button",{type:"button",className:b.default.assistantTextButton,disabled:a,onClick:()=>void s.load(),children:a?"读取中…":"刷新"})]}),!t&&!l?(0,o.jsx)("p",{role:"status",children:"正在读取当前电脑的助手…"}):null,t&&!t.native?.supported?(0,o.jsx)("p",{role:"status",children:t.native?.reason||"当前 DSH 暂不支持安装助手，请先检查版本。"}):null,t&&(t.native?.supported||v.some(i=>i.builtin))?(0,o.jsxs)(o.Fragment,{children:[(0,o.jsx)("div",{className:b.default.assistantChoices,children:v.filter(i=>["teacher","project"].includes(i.id)).map(B)}),v.some(i=>i.id==="designer")?(0,o.jsx)("div",{className:b.default.assistantCustomize,children:v.filter(i=>i.id==="designer").map(B)}):null]}):null,e?(0,o.jsxs)("div",{className:b.default.assistantPreview,"aria-label":"安装助手预览",children:[(0,o.jsxs)("h4",{children:["安装「",e.definition.name,"」"]}),(0,o.jsx)("p",{children:e.definition.description}),(0,o.jsx)("p",{children:"新增一个可选的助手模式，不改默认模式、已有会话和资料。"}),(0,o.jsxs)("details",{className:b.default.assistantDetails,children:[(0,o.jsx)("summary",{children:"查看工作方式与安装详情"}),(0,o.jsx)("p",{children:e.definition.role}),(0,o.jsx)("ul",{children:e.definition.methods.map((i,f)=>(0,o.jsx)("li",{children:i},f))}),(0,o.jsx)("p",{children:"助手会逐步了解："}),(0,o.jsx)("ul",{children:e.definition.onboarding.map(i=>(0,o.jsxs)("li",{children:[i.label,"：",i.prompt]},i.key))}),(0,o.jsxs)("small",{children:["第 ",e.version," 版 · 内容摘要 ",e.digest.slice(0,12)," · 基础模式 ",e.native.basePreset]}),(0,o.jsx)("ul",{children:(e.native.warnings||[]).map((i,f)=>(0,o.jsx)("li",{children:i},f))})]}),(0,o.jsxs)("div",{className:b.default.assistantButtons,children:[(0,o.jsx)("button",{type:"button",className:b.default.assistantPrimary,disabled:a,onClick:()=>void s.install(),children:"确认安装"}),(0,o.jsx)("button",{type:"button",className:b.default.assistantSecondary,disabled:a,onClick:()=>s.dismissPreview(),children:"暂不安装"})]})]}):null,p.length?(0,o.jsxs)("div",{children:[(0,o.jsx)("h4",{children:"待安装的助手"}),p.map(C)]}):null,g.some(i=>!["teacher","project","designer"].includes(i.templateId))?(0,o.jsxs)("div",{children:[(0,o.jsx)("h4",{children:"我已安装的其他助手"}),g.filter(i=>!["teacher","project","designer"].includes(i.templateId)).map(C)]}):null,m.length||v.some(i=>!["teacher","project","designer"].includes(i.id))?(0,o.jsxs)("details",{className:b.default.assistantDetails,children:[(0,o.jsx)("summary",{children:"更多助手与安装记录"}),t?.native?.supported?(0,o.jsx)("div",{className:b.default.assistantChoices,children:v.filter(i=>!["teacher","project","designer"].includes(i.id)).map(B)}):null,m.length?(0,o.jsxs)("details",{className:b.default.assistantDetails,children:[(0,o.jsxs)("summary",{children:["以前安装的助手（",m.length,"）"]}),(0,o.jsx)("p",{children:"旧会话可能仍在使用旧模式；卸载前请核对，聊天与资料不会在这里删除。"}),m.map(C)]}):null]}):null,n?(0,o.jsx)("p",{role:"status",children:n}):null,l?(0,o.jsx)("p",{role:"alert",children:l}):null,r?(0,o.jsx)(be.Modal,{open:!0,title:"选择工作区",closeLabel:"取消新会话",onClose:()=>s.dismissStart(),children:(0,o.jsxs)("div",{className:b.default.assistantLaunch,"aria-busy":a,children:[(0,o.jsxs)("p",{children:["助手模式：",(0,o.jsx)("strong",{children:r.name})]}),(0,o.jsx)("label",{htmlFor:"assistant-workspace",children:"工作区"}),(0,o.jsxs)("select",{id:"assistant-workspace",value:r.selectedId,disabled:a,onChange:i=>s.selectWorkspace(i.target.value),children:[r.selectedId?null:(0,o.jsx)("option",{value:"",children:"请选择工作区"}),r.choices.items.map(i=>(0,o.jsx)("option",{value:i.id,children:i.name},i.id))]}),r.choices.items.find(i=>i.id===r.selectedId)?.path?(0,o.jsx)("p",{className:b.default.assistantWorkspacePath,children:r.choices.items.find(i=>i.id===r.selectedId)?.path}):null,(0,o.jsx)("button",{type:"button",className:b.default.assistantTextButton,disabled:a,onClick:()=>void s.pickWorkspace(d.current?.signal),children:"选择其他文件夹…"}),(0,o.jsx)("p",{children:"确认后才创建空白会话，不会自动发送消息。"}),l?(0,o.jsx)("p",{role:"alert",children:l}):null,(0,o.jsxs)("div",{className:b.default.assistantButtons,children:[(0,o.jsx)("button",{type:"button",className:b.default.primaryButton,disabled:a||!r.selectedId,onClick:()=>void s.confirmStart(d.current?.signal),children:a?"正在准备…":"开始会话"}),(0,o.jsx)("button",{type:"button",className:b.default.secondaryButton,disabled:a,onClick:()=>s.dismissStart(),children:"取消"})]})]})}):null]})}var c=require("react/jsx-runtime");function ye({ok:s,busy:t=!1}){return(0,c.jsx)("span",{className:w.default.statusDot,"data-state":t?"busy":s?"ready":"off","aria-hidden":!0})}function Z({title:s,detail:t,ok:e,busy:a=!1}){return(0,c.jsxs)("div",{className:w.default.capability,children:[(0,c.jsx)(ye,{ok:e,busy:a}),(0,c.jsxs)("div",{className:w.default.capabilityCopy,children:[(0,c.jsx)("strong",{children:s}),(0,c.jsx)("span",{children:t})]})]})}function K({describeHost:s,callManagement:t,store:e=O(s,t),assistants:a}){let{loadState:n,qrState:l,status:r,runtime:d,host:h,localOrigin:g,qr:p,error:m}=(0,G.useSyncExternalStore)(e.subscribe,e.getSnapshot,e.getSnapshot),{refresh:v,generateQr:N}=e,x=(0,G.useId)(),A=r?.publicRelay,B=A?.state==="enrolling"||A?.state==="connecting",C=A?.remoteAccess?.status,i=A?.state==="online"&&C==="active",f=C==="suspended"?"账户公网访问已暂停":C==="expired"?"公网访问已到期":C==="not_entitled"?"请在小程序中使用自助开通方式":C!=="active"?"配对后由小程序账户决定":i?"可在外网安全连接":B?"正在准备远程连接":"暂时离线",E=d?.publicDoor??r?.gate?.publicDoor,P=n==="ready"&&!!r?.lan.ip&&E?.state==="listening",z=A?.enabled===!0&&A.state!=="disabled",xe=r?.agent?.agentName||h?.agentName||"DeepSeek Harness",ke=r?.agent?.hostName||h?.computerName||"当前电脑";return(0,c.jsxs)("section",{className:w.default.root,"aria-labelledby":x,children:[(0,c.jsxs)("div",{className:w.default.hero,children:[(0,c.jsxs)("div",{className:w.default.identity,children:[(0,c.jsx)("span",{className:w.default.mark,"aria-hidden":!0,children:(0,c.jsx)(ve.FishLogo,{size:28})}),(0,c.jsxs)("div",{className:w.default.identityCopy,children:[(0,c.jsx)("h3",{id:x,children:"微信连接"}),(0,c.jsxs)("p",{children:[xe,(0,c.jsx)("span",{"aria-hidden":!0,children:" · "}),ke]})]})]}),(0,c.jsxs)("span",{className:w.default.overall,"data-ready":n==="ready",children:[(0,c.jsx)(ye,{ok:n==="ready",busy:n==="loading"}),n==="loading"?"检测中":n==="ready"?"服务正常":"暂不可用"]})]}),d?.profileScope==="desktop"&&r&&(!r.plugin||r.plugin.runningVersion!==r.plugin.installedVersion)?(0,c.jsxs)("aside",{className:w.default.companionCard,"data-state":"self-restart-required",role:"status",children:[(0,c.jsx)("strong",{children:r.plugin?"新版插件尚未生效，请完整重启 Desktop":"刚升级插件？请先完整重启 Desktop"}),r.plugin?(0,c.jsxs)("p",{children:["正在运行 ",r.plugin.runningVersion,"；已安装 ",r.plugin.installedVersion,"。"]}):(0,c.jsx)("p",{children:"当前连接服务尚不能核验运行版本，不能把安装完成当作新版已生效。"}),(0,c.jsx)("p",{children:"等当前任务结束后，选择顶部「应用 → 退出」，再重新打开 Desktop。仅关闭窗口、刷新页面或开关插件不能保证新版生效。"}),(0,c.jsx)("small",{children:"不必重装或重新配对。此操作不会升级或重启 Web。"})]}):null,(0,c.jsxs)("div",{className:w.default.capabilities,children:[(0,c.jsx)(Z,{title:"局域网直连",detail:n==="loading"?"检测中":P?"已就绪":"暂不可用",ok:P,busy:n==="loading"}),(0,c.jsx)(Z,{title:"远程访问",detail:f,ok:i,busy:B||n==="loading"}),(0,c.jsx)(Z,{title:"账号连接保护",detail:z?"已启用":"配对后启用",ok:z,busy:n==="loading"})]}),m!==null?(0,c.jsxs)("div",{className:w.default.notice,role:"status",children:[(0,c.jsx)("span",{children:m}),(0,c.jsx)("button",{type:"button",onClick:()=>void v(),children:"重试"})]}):null,l==="idle"?(0,c.jsxs)("div",{className:w.default.connectCard,children:[(0,c.jsxs)("div",{children:[(0,c.jsx)("strong",{children:"添加到微信"}),(0,c.jsx)("p",{children:"打开「Agent远程管理助手」→ 添加节点，扫描配对二维码。"})]}),(0,c.jsx)("button",{type:"button",className:w.default.primaryButton,disabled:n!=="ready",onClick:()=>void N(),children:"生成二维码"})]}):(0,c.jsxs)("div",{className:w.default.pairingCard,children:[(0,c.jsxs)("div",{className:w.default.pairingHead,children:[(0,c.jsxs)("div",{children:[(0,c.jsx)("strong",{children:"扫描二维码"}),(0,c.jsx)("p",{children:"小程序「设置 → 添加节点」"})]}),(0,c.jsx)("button",{type:"button",className:w.default.secondaryButton,disabled:l==="loading"||n!=="ready",onClick:()=>void N(),children:l==="loading"?"生成中…":"重新生成"})]}),(0,c.jsxs)("div",{className:w.default.qrArea,children:[n==="ready"&&l==="ready"&&p!==null?(0,c.jsx)("img",{className:w.default.qr,src:p.qrDataUrl,alt:"Agent远程管理助手配对二维码"}):(0,c.jsx)("div",{className:w.default.qrPlaceholder,"aria-live":"polite",children:n!=="ready"?"连接恢复后可查看二维码":l==="expired"?"二维码已过期，请重新生成":l==="error"?"生成失败":"正在生成…"}),l==="ready"&&p!==null?(0,c.jsxs)("small",{className:w.default.qrValidity,children:["有效至 ",new Date(p.expiresAt).toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"})," · 切换页面不重新生成"]}):null]}),(0,c.jsx)("p",{className:w.default.securityNote,children:p?.mode==="public-relay"?"配对后自动选择更快的连接；远程内容端到端加密。":"当前可通过同一局域网连接。"})]}),(0,c.jsxs)("section",{className:w.default.updateCard,"aria-label":"插件更新",children:[(0,c.jsx)("h3",{className:w.default.updateHeading,children:"插件更新"}),g&&e.updates?(0,c.jsx)(he,{store:e.updates,embedded:!0}):null,d?.profileScope==="desktop"&&e.nativeUpdates?(0,c.jsx)(ge,{store:e.nativeUpdates,embedded:!0}):null,(0,c.jsx)($,{describeHost:s,callManagement:t,store:e,compact:!0})]}),a?(0,c.jsx)(fe,{store:a}):null]})}var F=class{constructor(t,e,a){this.call=t;this.openSession=e;this.workspaceNavigation=a}state={catalog:null,preview:null,busy:!1,message:"",error:"",launch:null};listeners=new Set;epoch=0;disposed=!1;getSnapshot=()=>this.state;subscribe=t=>(this.listeners.add(t),()=>{this.listeners.delete(t)});set(t){if(!this.disposed){this.state={...this.state,...t};for(let e of this.listeners)e()}}reset=()=>{this.epoch++,this.set({catalog:null,preview:null,busy:!1,message:"",error:"",launch:null})};dispose=()=>{this.reset(),this.disposed=!0,this.listeners.clear()};async run(t){if(this.disposed||this.state.busy)return;let e=this.epoch,a=()=>!this.disposed&&e===this.epoch;this.set({busy:!0,error:""});try{await t(a)}catch(n){a()&&this.set({error:n instanceof Error?n.message:"操作未完成，请核对状态"})}finally{a()&&this.set({busy:!1})}}async read(t){t()&&this.set({catalog:null});try{let e=await this.call("assistantCatalog",{});if(!t())return;if(e?.schema!=="human.assistants.catalog.v1"||!Array.isArray(e.templates)||!Array.isArray(e.drafts))throw new Error("助手目录格式不受支持");this.set({catalog:e})}catch(e){throw t()&&this.set({message:""}),e}}load=()=>this.run(t=>this.read(t));prepareStart=(t,e)=>this.run(async a=>{if(this.set({launch:null,message:""}),await this.read(a),!a()||e?.aborted)return;let n=this.readyAssistant(t);if(!this.workspaceNavigation)throw new Error("原生工作区选择暂不可用，请使用 DSH 新会话入口。");let l=this.workspaceNavigation.list();this.set({launch:{presetId:t,name:n.name,choices:l,selectedId:l.preferredId}})});dismissStart=()=>{this.state.busy||this.set({launch:null,error:""})};selectWorkspace=t=>{let e=this.state.launch;!this.state.busy&&e?.choices.items.some(a=>a.id===t)&&this.set({launch:{...e,selectedId:t}})};pickWorkspace=t=>this.run(async e=>{let a=this.state.launch;if(!a||!this.workspaceNavigation||t?.aborted)return;let n=await this.workspaceNavigation.pick(t);if(!e()||t?.aborted||!n)return;let l=this.workspaceNavigation.list();if(!l.items.some(r=>r.id===n))throw new Error("工作区列表尚未更新，请稍后重新打开。");this.set({launch:{...a,choices:l,selectedId:n}})});confirmStart=t=>{let e=this.state.launch;return e?.selectedId?this.start(e.presetId,t,e.selectedId):Promise.resolve()};readyAssistant(t){let e=this.state.catalog?.drafts?.find(a=>a.presetId===t);if(!e||e.state!=="installed"||e.nativeState&&e.nativeState!=="installed")throw new Error("此助手已停用或尚未就绪，请核对下方组件开关。");return e}start=(t,e,a)=>this.run(async n=>{if(this.set({message:""}),await this.read(n),!(!n()||e?.aborted)){if(this.readyAssistant(t),!this.openSession)throw new Error("当前 DSH 未提供快捷入口，请在新会话中选择此助手模式。");await this.openSession(t,e,a),n()&&this.set({launch:null})}});dismissPreview=()=>{this.state.busy||this.set({preview:null,message:""})};choose=t=>this.run(async e=>{if(this.set({preview:null,message:""}),this.state.catalog?.templates?.find(d=>d.id===t)?.builtin){await this.read(e),e()&&this.set({message:"此助手已包含在插件里，请在新会话中选择；无需另装独立包。"});return}let n=this.state.catalog?.drafts?.find(d=>d.templateId===t&&d.state==="draft");if(n){let d=await this.call("assistantPreview",{id:n.id,version:n.version});e()&&this.set({preview:d});return}let l=await this.call("assistantDraft",{templateId:t});if(!e()||(await this.read(e),!e()))return;let r=await this.call("assistantPreview",{id:l.id,version:l.version});e()&&this.set({preview:r})});preview=(t,e)=>this.run(async a=>{this.set({preview:null});let n=await this.call("assistantPreview",{id:t,version:e});a()&&this.set({preview:n})});reinstall=(t,e)=>this.run(async a=>{if(this.set({preview:null,message:""}),this.state.catalog?.drafts?.some(r=>r.id===t&&r.version===e&&r.replacement)){await this.read(a),a()&&this.set({message:"这个旧模式已有内置版本，请在新会话中选择对应助手，无需重新安装旧包。"});return}let n=await this.call("assistantDraft",{sourceId:t,sourceVersion:e});if(!a()||(await this.read(a),!a()))return;let l=await this.call("assistantPreview",{id:n.id,version:n.version});a()&&this.set({preview:l})});install=()=>this.run(async t=>{let e=this.state.preview;if(!e||e.expiresAt<=Date.now())throw new Error("请重新预览后确认安装");this.set({preview:null,message:"已提交原生安装，请等待结果。"});try{let a=await this.call("assistantInstall",{id:e.id,version:e.version,digest:e.digest,previewId:e.previewId});t()&&this.set({message:a.message||(a.state==="installed"?"原生预设已生效":"请核对原生安装状态")})}finally{t()&&await this.read(t)}});verify=(t,e)=>this.run(async a=>{this.set({catalog:null,message:""});let n=await this.call("assistantStatus",{id:t,version:e});a()&&(this.set({message:n.message||"状态已核对"}),await this.read(a))})};function we(s,t){let e=0,a=!1,n=(l,r,d)=>l?.schema==="human.assistant.session-intent.v1"&&l.presetId===r&&l.workspaceId===(d??null)&&typeof l.nodeId=="string"&&(l.state==="none"||/^[a-f0-9]{32}$/.test(l.attemptId)&&/^session-[a-f0-9-]{36}$/.test(l.sessionId));return{reset(){e++,a=!1},workspaces(){let l=s("workspaces")?.list?.getSnapshot(),r=s("sessions")?.list?.getSnapshot();if(l?.phase!=="ready"||r?.phase!=="ready")throw new Error("工作区还在读取，请稍后再试。");let d=Object.values(r.byId||{}).find(p=>p.retainedBy?.mainView>0),h=[...l.items].sort((p,m)=>_e(m,r.byId)-_e(p,r.byId)),g=h.find(p=>p.sessionIds.includes(d?.id))||h[0];return{items:h.map(p=>({id:p.workspaceId,name:p.title||p.name||p.path,path:p.path})),preferredId:g?.workspaceId||""}},async pickWorkspace(l){let r=s("uiWorkspace"),d=s("workspaces"),h=e;if(typeof r?.pickDirectory!="function"||typeof d?.create!="function")throw new Error("原生文件夹选择器暂不可用，请先在 DSH 添加工作区。");let g=()=>{if(h!==e||l?.aborted)throw new Error("连接或页面已变化，请重新选择工作区。")};g();let p=await r.pickDirectory();if(g(),p===null)return;if(typeof p!="string"||!p)throw new Error("文件夹选择结果无效");let m=await d.create({path:p});return g(),m.workspaceId},async start(l,r,d=!1,h){if(!/^[a-z][a-z0-9_-]{0,63}$/.test(l))throw new Error("助手身份无效");let g=s("remote.session"),p=s("sessions"),m=s("uiWorkspace"),v=s("layout"),N=s("configForms")?.developerTools?.enabled?.getSnapshot();if(!t||N!==!0||typeof g?.create!="function"||typeof p?.refresh!="function"||typeof m?.openSession!="function"||typeof v?.beginNavigation!="function")throw new Error("当前原生界面未提供助手会话入口，或原生工作模式选择尚未启用；请使用 DSH 的新会话入口选择此预设。");if(a||r?.aborted)return;let x=e,A=v.beginNavigation(),B=()=>x===e&&!A.aborted&&!r?.aborted,C=()=>{if(!B())throw new Error("导航或连接已变化，请核对原生会话列表；没有自动跳转。")};if(B()){a=!0;try{if(h!==void 0){let P=s("workspaces")?.list?.getSnapshot();if(P?.phase!=="ready"||!P.items.some(z=>z.workspaceId===h))throw new Error("所选工作区已不可用，请重新选择。")}let i={presetId:l,...h?{workspaceId:h}:{}},f=await t("assistantSessionStatus",i);if(C(),!n(f,l,h))throw new Error("会话创建意图格式无效");if(f.state==="unknown"||f.state==="conflict")throw new Error("上次新建结果尚未确认，请核对原生会话列表；不会自动再次创建。");let E=f.nodeId;if(f.state==="none"||d){if(f=await t("assistantSessionPrepare",{...i,...f.state==="created"?{previousAttemptId:f.attemptId}:{}}),C(),!n(f,l,h)||f.nodeId!==E)throw new Error("节点或会话创建意图已变化");if(f.dispatch===!0&&f.state==="unknown"){let P=await g.create({agentPreset:l,sessionId:f.sessionId,...h?{workspaceId:h}:{}});if(C(),!P?.ok||P.value?.sessionId!==f.sessionId||P.value?.agentPreset!==l)throw new Error("原生宿主未确认指定助手身份和会话，请核对会话列表；不会自动重试。")}if(f=await t("assistantSessionStatus",{attemptId:f.attemptId}),C(),!n(f,l,h)||f.nodeId!==E)throw new Error("节点或会话创建意图已变化")}if(f.state!=="created")throw new Error("上次新建结果尚未确认，请核对原生会话列表；不会自动再次创建。");await p.refresh(),C(),m.openSession(f.sessionId)}finally{x===e&&(a=!1)}}}}}function _e(s,t){let e=s.sessionIds.map(a=>t[a]?.updatedAt).filter(Number.isFinite);return e.length?Math.max(...e):Date.parse(s.createdAt)||0}var Re=["slots","connection"];function Ue(s){let t=async(p,m)=>{let v=await s.connection.rpc.call("/wechat-remote-management",p,m??{});if(!v.ok)throw Object.assign(new Error(v.error.message),{code:v.error.code});return v.value},e=async()=>{let p=await s.connection.rpc.call("/api","wechatHost/describe",{args:{request:{}}});if(!p.ok)throw new Error(`wechatHost/describe: ${p.error.code}`);let m=p.value;if(m?.ok!==!0||m.value===void 0)throw new Error("wechatHost/describe returned an invalid result");return m.value},a=new T(e,t),n=0,l=async(p,m)=>{let v=n,N=await s.connection.rpc.call("/api",`humanTools/${p}`,{args:{request:m}});if(v!==n)throw new Error("电脑连接已变化，请重新查看助手目录");if(!N.ok)throw new Error(N.error.message);let x=N.value;if(!x?.ok||typeof x.valueJson!="string"||x.valueJson.length>256*1024)throw new Error(x?.error?.message||"此节点尚未提供助手能力");return JSON.parse(x.valueJson)},r,d=new F(l,async(p,m,v)=>{if(!r)throw new Error("原生会话入口尚未就绪，请稍后再试。");if(!v)throw new Error("请先选择工作区。");await r.start(p,m,!0,v)},{list:()=>{if(!r)throw new Error("原生工作区入口尚未就绪");return r.workspaces()},pick:async p=>{if(!r)throw new Error("原生工作区入口尚未就绪");return r.pickWorkspace(p)}});s.inject(["remote.session","sessions","uiWorkspace","layout","workspaces","configForms"],p=>{let m=we(v=>p.get(v),l);r=m,p.effect(()=>()=>{m.reset(),r===m&&(r=void 0)},"wechat assistant navigation")}),s.effect(()=>{let p=s.on("connection/reset",()=>{n++,r?.reset(),d.reset()});return()=>{n++,p(),d.dispose()}},"wechat assistant lifecycle"),s.effect(()=>()=>a.dispose(),"wechat shared page");let h=()=>pe(p=>s.get(p)),g=()=>({describeHost:e,callManagement:t,store:a,assistants:d});s.slots.inject("settings.section",()=>s.slots.register({name:"settings.section",id:"harness-remote",order:30,label:"微信连接",inject:g},K));for(let p of["plugins.bundle.activation","plugins.bundle.config"])s.slots.inject(p,()=>{let m=["dsh-wechat-remote","@harness-remote/dsh-wechat-remote"].map(v=>s.slots.register({name:p,key:v,inject:g},p==="plugins.bundle.activation"?$:K));return()=>m.forEach(v=>v())});s.inject(["pluginNavigation","remote.pluginManager"],()=>s.slots.inject("sidebar.footer.action",()=>s.slots.register({name:"sidebar.footer.action",id:"harness-remote",order:30,label:"微信连接",inject:()=>({openPlugin:h})},de)))}

return module.exports;}});
