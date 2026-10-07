window.__ModuleLoader__.load({id:"@harness-remote/dsh-wechat-remote",factory:(require)=>{var module={exports:{}};var exports=module.exports;"use strict";var Pe=Object.create;var F=Object.defineProperty;var He=Object.getOwnPropertyDescriptor;var De=Object.getOwnPropertyNames;var Ee=Object.getPrototypeOf,Re=Object.prototype.hasOwnProperty;var Ie=(a,e)=>()=>(e||a((e={exports:{}}).exports,e),e.exports),Ae=(a,e)=>{for(var t in e)F(a,t,{get:e[t],enumerable:!0})},re=(a,e,t,s)=>{if(e&&typeof e=="object"||typeof e=="function")for(let r of De(e))!Re.call(a,r)&&r!==t&&F(a,r,{get:()=>e[r],enumerable:!(s=He(e,r))||s.enumerable});return a};var T=(a,e,t)=>(t=a!=null?Pe(Ee(a)):{},re(e||!a||!a.__esModule?F(t,"default",{value:a,enumerable:!0}):t,a)),Be=a=>re(F({},"__esModule",{value:!0}),a);var q=Ie((Ve,oe)=>{"use strict";var je=`.hr_de1e1b6_root {\r
  box-sizing: border-box;\r
  width: 100%;\r
  max-width: 760px;\r
  color: var(--dsw-alias-label-primary, #171a20);\r
  display: flex;\r
  flex-direction: column;\r
  gap: 14px;\r
}\r
\r
.hr_de1e1b6_hero,\r
.hr_de1e1b6_connectCard,\r
.hr_de1e1b6_pairingCard {\r
  border: 1px solid var(--dsw-alias-border-l2, rgba(128, 140, 160, 0.22));\r
  background: var(--dsw-alias-bg-layer-3, #fff);\r
  border-radius: 12px;\r
}\r
\r
.hr_de1e1b6_hero {\r
  min-height: 72px;\r
  display: flex;\r
  align-items: center;\r
  justify-content: space-between;\r
  gap: 20px;\r
  padding: 16px 18px;\r
}\r
\r
.hr_de1e1b6_identity {\r
  min-width: 0;\r
  display: flex;\r
  align-items: center;\r
  gap: 12px;\r
}\r
\r
.hr_de1e1b6_mark {\r
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
.hr_de1e1b6_identityCopy {\r
  min-width: 0;\r
}\r
\r
.hr_de1e1b6_identityCopy h3,\r
.hr_de1e1b6_identityCopy p,\r
.hr_de1e1b6_connectCard p,\r
.hr_de1e1b6_pairingHead p,\r
.hr_de1e1b6_securityNote {\r
  margin: 0;\r
}\r
\r
.hr_de1e1b6_sidebarButton { display: flex; align-items: center; gap: 10px; width: 100%; min-height: 38px; padding: 8px 12px; border: 0; border-radius: 8px; background: transparent; color: var(--dsw-alias-label-secondary, #4d5564); font: inherit; font-size: 14px; cursor: pointer; text-align: left; }\r
.hr_de1e1b6_sidebarButton:hover { background: var(--dsw-alias-bg-layer-2, #eef1f5); color: var(--dsw-alias-label-primary, #171a20); }\r
.hr_de1e1b6_sidebarButton[data-wide='false'] { width: 36px; min-height: 36px; padding: 8px; justify-content: center; }\r
.hr_de1e1b6_sidebarButton svg { flex: none; }\r
.hr_de1e1b6_sidebarButton:focus-visible { outline: 2px solid var(--dsw-alias-state-business-primary, #4e79ff); outline-offset: 2px; }\r
.hr_de1e1b6_actions { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 16px; }\r
.hr_de1e1b6_pageDialog.hr_de1e1b6_pageDialog { width: min(820px, 100%); max-height: 100%; }\r
.hr_de1e1b6_pageDialogContent.hr_de1e1b6_pageDialogContent { min-height: 0; overflow-y: auto; }\r
.hr_de1e1b6_helpText { color: var(--dsw-alias-label-secondary, #647084); font-size: 12px; line-height: 1.7; margin: 8px 0; }\r
\r
.hr_de1e1b6_companionCard {\r
  border: 1px solid var(--dsw-alias-state-business-primary, #4e79ff);\r
  border-left-width: 4px;\r
  border-radius: 10px;\r
  background: var(--dsw-alias-bg-layer-3, #fff);\r
  padding: 14px 16px;\r
  line-height: 1.6;\r
  overflow-wrap: anywhere;\r
}\r
.hr_de1e1b6_companionCard strong { font-size: 14px; }\r
.hr_de1e1b6_companionCard p { margin: 4px 0; font-size: 13px; }\r
.hr_de1e1b6_companionCard small { color: var(--dsw-alias-label-secondary, #4d5564); }\r
.hr_de1e1b6_companionCard progress { display: block; width: 100%; margin: 8px 0; accent-color: #4e79ff; }\r
.hr_de1e1b6_companionCard[data-state='complete'] { border-color: var(--dsw-alias-state-success-primary, #1f9d68); }\r
.hr_de1e1b6_companionCard[data-state='unavailable'], .hr_de1e1b6_companionCard[data-state='recovering'] { border-color: #b5861d; }

/* Assistant modes are a compact owner-facing catalog, not an installation log. */
.hr_de1e1b6_assistantsCard { padding: 14px 18px; border: 1px solid var(--dsw-alias-border-l2, #e2e6ee); border-radius: 12px; background: var(--dsw-alias-bg-layer-3, #fff); line-height: 1.5; overflow-wrap: anywhere; }
.hr_de1e1b6_assistantsCard h3, .hr_de1e1b6_assistantsCard h4, .hr_de1e1b6_assistantsCard p { margin: 0; }
.hr_de1e1b6_assistantsCard h3 { font-size: 14px; }
.hr_de1e1b6_assistantsCard h4 { font-size: 14px; margin: 16px 0 6px; }
.hr_de1e1b6_assistantsCard p { color: var(--dsw-alias-label-secondary, #647084); font-size: 12px; }
.hr_de1e1b6_assistantsHeading { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 4px; }
.hr_de1e1b6_assistantsHeading p { margin-top: 4px; }
.hr_de1e1b6_assistantChoices { display: flex; flex-direction: column; }
.hr_de1e1b6_assistantChoice { padding: 10px 0; display: flex; align-items: center; gap: 12px; }
.hr_de1e1b6_assistantChoiceCopy { flex: 1; min-width: 0; }
.hr_de1e1b6_assistantChoiceHead, .hr_de1e1b6_assistantEntryHead { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 8px; }
.hr_de1e1b6_assistantChoiceHead { justify-content: flex-start; gap: 6px; }
.hr_de1e1b6_assistantChoiceHead strong { font-size: 13px; }
.hr_de1e1b6_assistantChoice p { flex: 1; }
.hr_de1e1b6_assistantStatus { color: var(--dsw-alias-state-success-primary, #17845b); font-size: 12px; }
.hr_de1e1b6_assistantPrimary, .hr_de1e1b6_assistantSecondary, .hr_de1e1b6_assistantTextButton { min-height: 42px; padding: 9px 16px; border-radius: 9px; font: inherit; font-size: 13px; cursor: pointer; }
.hr_de1e1b6_assistantPrimary { color: #fff; background: var(--dsw-alias-state-business-primary, #4e79ff); border: 1px solid transparent; }
.hr_de1e1b6_assistantSecondary { color: var(--dsw-alias-state-business-primary, #4e79ff); background: var(--dsw-alias-bg-layer-3, #fff); border: 1px solid var(--dsw-alias-border-l2, #d7deed); }
.hr_de1e1b6_assistantTextButton { min-height: 32px; padding: 3px 8px; border: 0; background: transparent; color: var(--dsw-alias-state-business-primary, #4e79ff); }
.hr_de1e1b6_assistantPrimary:disabled, .hr_de1e1b6_assistantSecondary:disabled, .hr_de1e1b6_assistantTextButton:disabled { opacity: .5; cursor: default; }
.hr_de1e1b6_assistantPrimary:focus-visible, .hr_de1e1b6_assistantSecondary:focus-visible, .hr_de1e1b6_assistantTextButton:focus-visible, .hr_de1e1b6_assistantDetails summary:focus-visible { outline: 2px solid var(--dsw-alias-state-business-primary, #4e79ff); outline-offset: 3px; }
.hr_de1e1b6_assistantCustomize { margin-top: 2px; border-top: 1px solid var(--dsw-alias-border-l2, #e2e6ee); }
.hr_de1e1b6_assistantCustomize > p { margin-bottom: 10px; }
.hr_de1e1b6_assistantCustomize .hr_de1e1b6_assistantChoice { background: transparent; }
.hr_de1e1b6_assistantDetails { margin-top: 14px; color: var(--dsw-alias-label-secondary, #647084); font-size: 12px; }
.hr_de1e1b6_assistantDetails summary { padding: 5px 0; cursor: pointer; }
.hr_de1e1b6_assistantDetails ul { margin: 8px 0; padding-left: 20px; }
.hr_de1e1b6_assistantDetails li { margin: 5px 0; }
.hr_de1e1b6_assistantPreview { padding: 14px; margin-top: 16px !important; border-radius: 10px; background: var(--dsw-alias-bg-layer-1, #f0f4ff); }
.hr_de1e1b6_assistantUnavailable { color: var(--dsw-alias-label-secondary, #647084); font-size: 12px; }
.hr_de1e1b6_assistantHelpAnchor { display: inline-flex; position: relative; }
.hr_de1e1b6_assistantHelpButton { padding: 0; width: 17px; height: 17px; border-radius: 50%; border: 1px solid var(--dsw-alias-border-l2, #bec6d2); background: transparent; color: var(--dsw-alias-label-tertiary, #8490a2); font: inherit; font-size: 11px; cursor: help; }
.hr_de1e1b6_assistantTooltip { visibility: hidden; opacity: 0; position: absolute; z-index: 2; top: 24px; left: 0; width: min(300px, 55vw); padding: 10px 12px; border-radius: 8px; border: 1px solid var(--dsw-alias-border-l2, #d7deed); background: var(--dsw-alias-bg-layer-3, #fff); color: var(--dsw-alias-label-secondary, #647084); box-shadow: 0 4px 16px #0002; font-size: 12px; font-weight: normal; }
.hr_de1e1b6_assistantHelpAnchor:hover .hr_de1e1b6_assistantTooltip, .hr_de1e1b6_assistantHelpAnchor:focus-within .hr_de1e1b6_assistantTooltip { visibility: visible; opacity: 1; }
.hr_de1e1b6_assistantPreview h4 { margin-top: 0; }
.hr_de1e1b6_assistantPreview p + p { margin-top: 8px; }
.hr_de1e1b6_assistantButtons { display: flex; gap: 10px; flex-wrap: wrap; margin-top: 14px; }
.hr_de1e1b6_assistantEntry { margin-top: 10px; padding: 12px 0; border-top: 1px solid var(--dsw-alias-border-l2, #e2e6ee); }
.hr_de1e1b6_assistantEntryHead { margin-bottom: 8px; font-size: 13px; }
.hr_de1e1b6_assistantEntryHead > span { color: var(--dsw-alias-label-secondary, #647084); font-size: 12px; }
.hr_de1e1b6_assistantEntry > button + button { margin-left: 8px; }
@media (max-width: 520px) { .hr_de1e1b6_assistantsCard { padding: 12px; } .hr_de1e1b6_assistantChoice { gap: 8px; } }
\r
.hr_de1e1b6_identityCopy h3 {\r
  font-size: 15px;\r
  font-weight: 650;\r
  line-height: 22px;\r
}\r
\r
.hr_de1e1b6_identityCopy p {\r
  color: var(--dsw-alias-label-tertiary, #7d8492);\r
  font-size: 12px;\r
  line-height: 18px;\r
  overflow: hidden;\r
  text-overflow: ellipsis;\r
  white-space: nowrap;\r
}\r
\r
.hr_de1e1b6_overall {\r
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
.hr_de1e1b6_overall[data-ready='true'] {\r
  color: var(--dsw-alias-state-success-primary, #1f9d68);\r
}\r
\r
.hr_de1e1b6_statusDot {\r
  width: 7px;\r
  height: 7px;\r
  background: var(--dsw-alias-label-tertiary, #8b93a2);\r
  border-radius: 999px;\r
  flex: none;\r
}\r
\r
.hr_de1e1b6_statusDot[data-state='ready'] {\r
  background: var(--dsw-alias-state-success-primary, #1f9d68);\r
}\r
\r
.hr_de1e1b6_statusDot[data-state='busy'] {\r
  background: var(--dsw-alias-state-business-primary, #4e79ff);\r
  animation: harnessRemotePulse 1.2s ease-in-out infinite;\r
}\r
\r
.hr_de1e1b6_capabilities {\r
  grid-template-columns: repeat(3, minmax(0, 1fr));\r
  gap: 10px;\r
  display: grid;\r
}\r
\r
.hr_de1e1b6_capability {\r
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
.hr_de1e1b6_capability > .hr_de1e1b6_statusDot {\r
  margin-top: 6px;\r
}\r
\r
.hr_de1e1b6_capabilityCopy {\r
  min-width: 0;\r
  display: flex;\r
  flex-direction: column;\r
  gap: 1px;\r
}\r
\r
.hr_de1e1b6_capabilityCopy strong {\r
  font-size: 12.5px;\r
  font-weight: 600;\r
  line-height: 19px;\r
}\r
\r
.hr_de1e1b6_capabilityCopy span {\r
  color: var(--dsw-alias-label-tertiary, #7d8492);\r
  font-size: 11px;\r
  line-height: 17px;\r
  overflow: hidden;\r
  text-overflow: ellipsis;\r
  white-space: nowrap;\r
}\r
\r
.hr_de1e1b6_notice {\r
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
.hr_de1e1b6_notice button,\r
.hr_de1e1b6_secondaryButton {\r
  border: 1px solid var(--dsw-alias-border-l2, rgba(128, 140, 160, 0.28));\r
  color: var(--dsw-alias-label-primary, #171a20);\r
  background: var(--dsw-alias-bg-layer-1, #f5f6f8);\r
  border-radius: 7px;\r
  font: inherit;\r
  cursor: pointer;\r
}\r
\r
.hr_de1e1b6_notice button {\r
  flex: none;\r
  padding: 3px 9px;\r
}\r
\r
.hr_de1e1b6_connectCard {\r
  display: flex;\r
  align-items: center;\r
  justify-content: space-between;\r
  gap: 20px;\r
  padding: 18px;\r
}\r
\r
.hr_de1e1b6_connectCard strong,\r
.hr_de1e1b6_pairingHead strong {\r
  font-size: 14px;\r
  font-weight: 650;\r
  line-height: 21px;\r
}\r
\r
.hr_de1e1b6_connectCard p,\r
.hr_de1e1b6_pairingHead p {\r
  max-width: 470px;\r
  color: var(--dsw-alias-label-tertiary, #7d8492);\r
  font-size: 12px;\r
  line-height: 18px;\r
}\r
\r
.hr_de1e1b6_primaryButton {\r
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
.hr_de1e1b6_primaryButton:hover {\r
  filter: brightness(1.04);\r
}\r
\r
.hr_de1e1b6_primaryButton:focus-visible,\r
.hr_de1e1b6_secondaryButton:focus-visible,\r
.hr_de1e1b6_notice button:focus-visible {\r
  outline: 2px solid var(--dsw-alias-state-business-primary, #4e79ff);\r
  outline-offset: 2px;\r
}\r
\r
.hr_de1e1b6_pairingCard {\r
  padding: 18px;\r
}\r
\r
.hr_de1e1b6_pairingHead {\r
  display: flex;\r
  align-items: center;\r
  justify-content: space-between;\r
  gap: 16px;\r
}\r
\r
.hr_de1e1b6_secondaryButton {\r
  min-height: 32px;\r
  flex: none;\r
  padding: 0 11px;\r
  font-size: 12px;\r
}\r
\r
.hr_de1e1b6_secondaryButton:disabled,\r
.hr_de1e1b6_primaryButton:disabled {\r
  cursor: default;\r
  opacity: 0.55;\r
}\r
\r
.hr_de1e1b6_qrArea {\r
  min-height: 292px;\r
  margin-top: 16px;\r
  display: flex;\r
  flex-direction: column;\r
  align-items: center;\r
  justify-content: center;\r
  gap: 10px;\r
}\r
\r
.hr_de1e1b6_qr,\r
.hr_de1e1b6_qrPlaceholder {\r
  box-sizing: border-box;\r
  width: 280px;\r
  height: 280px;\r
  border-radius: 12px;\r
}\r
\r
.hr_de1e1b6_qr {\r
  background: #fff;\r
  padding: 10px;\r
  image-rendering: pixelated;\r
}\r
\r
.hr_de1e1b6_qrPlaceholder {\r
  color: var(--dsw-alias-label-tertiary, #7d8492);\r
  background: var(--dsw-alias-bg-layer-1, #f5f6f8);\r
  border: 1px dashed var(--dsw-alias-border-l2, rgba(128, 140, 160, 0.28));\r
  display: grid;\r
  place-items: center;\r
  font-size: 12px;\r
}\r
\r
.hr_de1e1b6_qrValidity {\r
  color: var(--dsw-alias-label-tertiary, #7d8492);\r
  font-size: 11px;\r
  line-height: 17px;\r
}\r
\r
.hr_de1e1b6_securityNote {\r
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
  .hr_de1e1b6_statusDot[data-state='busy'] {\r
    animation: none;\r
  }\r
}\r
\r
@media (max-width: 680px) {\r
  .hr_de1e1b6_capabilities {\r
    grid-template-columns: minmax(0, 1fr);\r
  }\r
\r
  .hr_de1e1b6_connectCard {\r
    align-items: stretch;\r
    flex-direction: column;\r
  }\r
\r
  .hr_de1e1b6_primaryButton {\r
    width: 100%;\r
  }\r
\r
  .hr_de1e1b6_qrArea {\r
    flex-direction: column;\r
    gap: 12px;\r
  }\r
\r
}\r
.hr_de1e1b6_updateCard { border: 1px solid var(--dsw-alias-border-l2, #ddd); background: var(--dsw-alias-bg-layer-3, #fff); border-radius: 12px; padding: 14px 18px; line-height: 1.5; font-size: 13px; overflow-wrap: anywhere; }
.hr_de1e1b6_updateHeading { font-size: 14px; line-height: 21px; margin: 0 0 8px; }
.hr_de1e1b6_updateRow { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 8px 16px; }
.hr_de1e1b6_updateCopy { flex: 1 1 240px; min-width: 0; }
.hr_de1e1b6_updateControl { display: flex; flex-direction: column; align-items: flex-end; gap: 2px; max-width: 100%; }
.hr_de1e1b6_updateControl .hr_de1e1b6_updateLabel { font-size: 12px; font-weight: 500; }
.hr_de1e1b6_updateControl .hr_de1e1b6_updateChecked { margin-top: 0; }
.hr_de1e1b6_updateRow > .hr_de1e1b6_updateActions { margin-top: 0; }
.hr_de1e1b6_updateEndpoint p, .hr_de1e1b6_companionInline p { margin: 4px 0; }
.hr_de1e1b6_updateScope { color: var(--dsw-alias-label-tertiary, #7d8492); font-size: 12px; font-weight: 400; }
.hr_de1e1b6_updateEndpoint + div { margin-top: 10px; padding-top: 10px; border-top: 1px solid var(--dsw-alias-border-l2, #ddd); }
.hr_de1e1b6_updateActions { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; margin-top: 8px; }
.hr_de1e1b6_updateActions .hr_de1e1b6_primaryButton { width: auto; min-height: 32px; padding: 0 12px; }
.hr_de1e1b6_updateActions .hr_de1e1b6_secondaryButton { min-height: 32px; }
.hr_de1e1b6_updatePeerNote { margin: 0; color: var(--dsw-alias-label-tertiary, #7d8492); font-size: 12px; }
.hr_de1e1b6_updateDetails { color: var(--dsw-alias-label-secondary, #647084); font-size: 12px; }
.hr_de1e1b6_updateDetails summary { cursor: pointer; margin-top: 4px; }
.hr_de1e1b6_companionInline strong { font-size: 13px; font-weight: 500; }
.hr_de1e1b6_companionInline small { display: block; color: var(--dsw-alias-label-secondary, #647084); font-size: 12px; margin-top: 4px; }
.hr_de1e1b6_companionInline progress { display: block; width: 100%; height: 8px; margin: 8px 0; accent-color: var(--dsw-alias-state-business-primary, #4e79ff); }
.hr_de1e1b6_companionInline[data-state='complete'] .hr_de1e1b6_updateCopy > strong { color: var(--dsw-alias-state-success-primary, #1f9d68); }
.hr_de1e1b6_companionInline[data-state='unavailable'] .hr_de1e1b6_updateCopy > strong, .hr_de1e1b6_companionInline[data-state='recovering'] .hr_de1e1b6_updateCopy > strong { color: #b5861d; }
.hr_de1e1b6_updateLabel { color: inherit; }\r
.hr_de1e1b6_updateLabel[data-severity="none"] { color: #218b5c; }\r
.hr_de1e1b6_updateLabel[data-severity="unknown"] { color: var(--text-secondary, #858b96); }\r
.hr_de1e1b6_updateLabel[data-severity="required"] { color: #d54052; }\r
.hr_de1e1b6_updateLabel[data-severity="recommended"], .hr_de1e1b6_updateLabel[data-severity="info"] { color: #b5861d; }\r
.hr_de1e1b6_updateProgress { width: 100%; height: 8px; margin-top: 8px; accent-color: #7487ef; }
.hr_de1e1b6_updateVersions { display: flex; flex-wrap: wrap; gap: 4px 16px; margin: 6px 0; }
.hr_de1e1b6_updateVersions span { color: var(--text-secondary, #858b96); }\r
.hr_de1e1b6_updateVersions strong { color: var(--text-primary, inherit); font-weight: 500; }\r
.hr_de1e1b6_updateCommand { display: flex; flex-wrap: wrap; align-items: center; gap: 12px; margin-top: 12px; }\r
.hr_de1e1b6_updateCommand code { flex: 1 1 240px; white-space: pre-wrap; overflow-wrap: anywhere; user-select: text; }\r
.hr_de1e1b6_updateChecked { display: block; margin-top: 4px; color: var(--text-secondary, #858b96); font-size: 11px; }
.hr_de1e1b6_clawbotHead, .hr_de1e1b6_clawbotRow { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.hr_de1e1b6_clawbotHead h3 { display: flex; align-items: center; gap: 8px; }
.hr_de1e1b6_clawbotHead small { font-size: 11px; font-weight: normal; color: var(--muted-foreground, #7b8491); }
.hr_de1e1b6_clawbotRow { margin: 10px 0; flex-wrap: wrap; }
.hr_de1e1b6_clawbotRow select { flex: 1; min-width: 180px; max-width: 100%; border: 1px solid var(--border, #ddd); border-radius: 8px; padding: 8px; color: inherit; background: transparent; }
.hr_de1e1b6_clawbotToggle { display: flex; gap: 6px; align-items: center; font-size: 13px; white-space: nowrap; }
.hr_de1e1b6_clawbotNote { font-size: 12px; line-height: 1.6; color: var(--muted-foreground, #7b8491); margin: 8px 0; }
.hr_de1e1b6_clawbotError { color: #b23b36; font-size: 13px; }
.hr_de1e1b6_clawbotPairing { display: flex; align-items: center; gap: 20px; flex-wrap: wrap; margin-top: 12px; }
.hr_de1e1b6_clawbotPairing img { border-radius: 8px; }
.hr_de1e1b6_clawbotPairing input { border: 1px solid var(--border, #ddd); border-radius: 6px; padding: 8px; width: 120px; color: inherit; background: transparent; }
.hr_de1e1b6_clawbotMark { display: inline-flex; flex: 0 0 22px; width: 22px; height: 22px; border-radius: 50%; background: #e54443; align-items: center; justify-content: center; gap: 3px; }
.hr_de1e1b6_clawbotMark::before, .hr_de1e1b6_clawbotMark::after { content: ''; display: block; width: 5px; height: 5px; border-radius: 50%; background: #fff; }
`,ie="@harness-remote/dsh-wechat-remote/HarnessRemoteSettings.module.css";if(typeof document<"u"&&document.querySelector("style[data-plugin-css="+JSON.stringify(ie)+"]")===null){let a=document.createElement("style");a.dataset.plugin="@harness-remote/dsh-wechat-remote",a.dataset.pluginCss=ie,a.textContent=je,document.head.appendChild(a)}oe.exports={root:"hr_de1e1b6_root",hero:"hr_de1e1b6_hero",connectCard:"hr_de1e1b6_connectCard",pairingCard:"hr_de1e1b6_pairingCard",identity:"hr_de1e1b6_identity",mark:"hr_de1e1b6_mark",identityCopy:"hr_de1e1b6_identityCopy",pairingHead:"hr_de1e1b6_pairingHead",securityNote:"hr_de1e1b6_securityNote",sidebarButton:"hr_de1e1b6_sidebarButton",actions:"hr_de1e1b6_actions",pageDialog:"hr_de1e1b6_pageDialog",pageDialogContent:"hr_de1e1b6_pageDialogContent",helpText:"hr_de1e1b6_helpText",companionCard:"hr_de1e1b6_companionCard",assistantsCard:"hr_de1e1b6_assistantsCard",assistantsHeading:"hr_de1e1b6_assistantsHeading",assistantChoices:"hr_de1e1b6_assistantChoices",assistantChoice:"hr_de1e1b6_assistantChoice",assistantChoiceCopy:"hr_de1e1b6_assistantChoiceCopy",assistantChoiceHead:"hr_de1e1b6_assistantChoiceHead",assistantEntryHead:"hr_de1e1b6_assistantEntryHead",assistantStatus:"hr_de1e1b6_assistantStatus",assistantPrimary:"hr_de1e1b6_assistantPrimary",assistantSecondary:"hr_de1e1b6_assistantSecondary",assistantTextButton:"hr_de1e1b6_assistantTextButton",assistantDetails:"hr_de1e1b6_assistantDetails",assistantCustomize:"hr_de1e1b6_assistantCustomize",assistantPreview:"hr_de1e1b6_assistantPreview",assistantUnavailable:"hr_de1e1b6_assistantUnavailable",assistantHelpAnchor:"hr_de1e1b6_assistantHelpAnchor",assistantHelpButton:"hr_de1e1b6_assistantHelpButton",assistantTooltip:"hr_de1e1b6_assistantTooltip",assistantButtons:"hr_de1e1b6_assistantButtons",assistantEntry:"hr_de1e1b6_assistantEntry",overall:"hr_de1e1b6_overall",statusDot:"hr_de1e1b6_statusDot",capabilities:"hr_de1e1b6_capabilities",capability:"hr_de1e1b6_capability",capabilityCopy:"hr_de1e1b6_capabilityCopy",notice:"hr_de1e1b6_notice",secondaryButton:"hr_de1e1b6_secondaryButton",primaryButton:"hr_de1e1b6_primaryButton",qrArea:"hr_de1e1b6_qrArea",qr:"hr_de1e1b6_qr",qrPlaceholder:"hr_de1e1b6_qrPlaceholder",qrValidity:"hr_de1e1b6_qrValidity",updateCard:"hr_de1e1b6_updateCard",updateHeading:"hr_de1e1b6_updateHeading",updateRow:"hr_de1e1b6_updateRow",updateCopy:"hr_de1e1b6_updateCopy",updateControl:"hr_de1e1b6_updateControl",updateLabel:"hr_de1e1b6_updateLabel",updateChecked:"hr_de1e1b6_updateChecked",updateActions:"hr_de1e1b6_updateActions",updateEndpoint:"hr_de1e1b6_updateEndpoint",companionInline:"hr_de1e1b6_companionInline",updateScope:"hr_de1e1b6_updateScope",updatePeerNote:"hr_de1e1b6_updatePeerNote",updateDetails:"hr_de1e1b6_updateDetails",updateProgress:"hr_de1e1b6_updateProgress",updateVersions:"hr_de1e1b6_updateVersions",updateCommand:"hr_de1e1b6_updateCommand",clawbotHead:"hr_de1e1b6_clawbotHead",clawbotRow:"hr_de1e1b6_clawbotRow",clawbotToggle:"hr_de1e1b6_clawbotToggle",clawbotNote:"hr_de1e1b6_clawbotNote",clawbotError:"hr_de1e1b6_clawbotError",clawbotPairing:"hr_de1e1b6_clawbotPairing",clawbotMark:"hr_de1e1b6_clawbotMark"}});var Me={};Ae(Me,{apply:()=>Te,inject:()=>qe});module.exports=Be(Me);var ue=require("react"),he=require("@deepseek-ai/dsh-client-ui-primitives");var I=T(q(),1),w=require("react/jsx-runtime");function le({value:a,onDecide:e,deciding:t=!1,compact:s=!1}){if(!a||!s&&a.state==="idle")return null;let r={"confirmation-required":"是否更新下方指定端的插件？",deferred:"已暂缓此次联动更新",pending:"联动更新待处理",busy:"等待待更新端的任务结束",preparing:"正在准备联动更新",installing:"正在安装插件更新",verifying:"正在核验更新后的恢复状态",recovering:"正在恢复更新前的插件","restart-required":"待更新端需启动或重启确认","self-restart-required":"当前端待重启，尚未生效",unverified:"两端更新状态待核实",complete:"两端插件已对齐",unavailable:"联动更新尚未确认成功"},l=["preparing","installing","verifying","recovering"].includes(a.state),d=a.versions?.peer==="desktop"?"Desktop":a.versions?.peer==="web"?"Web":null,i=a.target?.scope==="desktop"?"Desktop":a.target?.scope==="web"?"Web":null,u=i||"更新端",m={pending:`等待 ${u} 就绪`,busy:`${u} 有任务，等待空闲`,preparing:`正在准备 ${u} 更新`,installing:`正在更新 ${u}`,verifying:`正在核对 ${u} 更新结果`,recovering:`正在恢复 ${u} 原版本`,"restart-required":`${u} 已安装，待启动或重连确认`,"self-restart-required":"当前端待重启，尚未生效",unverified:"更新状态待核对",complete:"两端版本已同步",unavailable:"更新未完成，请核对"},v=["confirmation-required","deferred"].includes(a.state);if(s&&a.state==="idle"&&!a.versions?.peerInstalled)return(0,w.jsx)("p",{className:I.default.updatePeerNote,children:"未检测到可同步更新的另一端；当前端可独立使用。"});let p=a.state==="idle"?"未发现待确认的同步更新":s&&v&&i&&a.target?`${i} 可更新至 ${a.target.version}${a.state==="deferred"?" · 已暂缓":""}`:s&&a.state==="self-restart-required"?"当前端重启后可检查同步更新":(s?m[a.state]:void 0)||r[a.state]||"插件更新状态待核对",g=v&&a.offerId&&e?(0,w.jsxs)("div",{className:I.default.updateActions,children:[(0,w.jsx)("button",{type:"button",className:I.default.primaryButton,disabled:t,onClick:()=>e("approve"),children:t?"确认中…":i?`确认更新 ${i}`:"确认更新指定端"}),(0,w.jsx)("button",{type:"button",className:I.default.secondaryButton,disabled:t,onClick:()=>e("later"),children:"稍后再说"})]}):null;return(0,w.jsxs)("aside",{className:s?I.default.companionInline:I.default.companionCard,"data-state":a.state,role:"status","aria-live":"polite",children:[s?(0,w.jsxs)("div",{className:I.default.updateRow,children:[(0,w.jsxs)("div",{className:I.default.updateCopy,children:[d?(0,w.jsxs)("div",{className:I.default.updateVersions,children:[(0,w.jsxs)("strong",{children:[d," ",(0,w.jsx)("span",{className:I.default.updateScope,children:"同一主机"})]}),(0,w.jsx)("span",{children:a.versions?.peerInstalled?`已安装 ${a.versions.peerInstalled}`:"安装或启用状态未确认"})]}):null,(0,w.jsx)("strong",{children:p})]}),g]}):(0,w.jsx)("strong",{children:p}),s?(0,w.jsx)(w.Fragment,{children:a.state!=="idle"&&a.message?(0,w.jsxs)("details",{className:I.default.updateDetails,children:[(0,w.jsx)("summary",{children:"详细状态"}),(0,w.jsx)("p",{children:a.message})]}):null}):a.message?(0,w.jsx)("p",{children:a.message}):null,!s&&a.versions?(0,w.jsxs)("small",{children:[a.versions.current==="desktop"?"Desktop":"Web","：运行 ",a.versions.running," · 已安装 ",a.versions.installed??"未确认","；",d,"：已安装 ",a.versions.peerInstalled??"未确认或未启用"]}):null,g?(0,w.jsxs)(w.Fragment,{children:[s?null:g,(0,w.jsx)("small",{className:I.default.updateChecked,children:"空闲后更新，连接会短暂中断；保留配对与会话。"})]}):null,l?(0,w.jsx)("progress",{"aria-label":"联动更新进度"}):null,a.state==="busy"?(0,w.jsx)("small",{children:"不用手动停止任务。请保持两端运行，空闲后会继续检查。"}):l?(0,w.jsx)("small",{children:"请保持两端当前状态，暂勿退出、重启或重复安装。关闭本设置页不会取消更新。"}):a.state==="unavailable"?(0,w.jsx)("small",{children:"请在待更新端核对版本，必要时使用其原安装入口。"}):null]})}async function de(a,e,t=fetch){let s=await a(),r=s.gate;if(!r)throw new Error("当前节点没有提供配对入口");let l=r.profileScope==="desktop",d=r.localDoor?.port,i=Number.isSafeInteger(d)&&d>=1&&d<=65535?`http://127.0.0.1:${d}`:null;if(r.management==="authenticated-rpc")return{host:s,runtime:r,localOrigin:l?null:i,status:()=>e("status"),pairCode:()=>e("pair-code"),decide:(m,v)=>e("companion-decision",{offerId:m,action:v})};if(l||r.management==="unavailable"||!i||r.localDoor.state!=="listening")throw new Error("当前节点配对入口尚未就绪");let u=async m=>{let v=await t(i+m,{cache:"no-store"});if(!v.ok)throw new Error(`配对请求失败 (${v.status})`);return v.json()};return{host:s,runtime:r,localOrigin:i,status:()=>u("/gate/status"),pairCode:()=>u("/pair/code"),decide:async(m,v)=>{let p=await t(i+"/gate/companion/decision",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({offerId:m,action:v})});if(!p.ok)throw new Error("更新通知已变化，请刷新后重试");return p.json()}}}var X=class{constructor(e,t=globalThis.fetch){this.origin=e;this.fetcher=t.bind(globalThis)}value={check:null,checking:!1,progress:null,error:"",copied:!1,resumeFailed:!1};listeners=new Set;reading;installing=!1;disposed=!1;job=null;timer;pollGeneration=0;recovering=!1;fetcher;getSnapshot=()=>this.value;subscribe=e=>this.disposed?()=>{}:(this.listeners.add(e),this.listeners.size===1&&this.refresh(),()=>{this.listeners.delete(e)});patch(e){if(!this.disposed){this.value={...this.value,...e};for(let t of this.listeners)t()}}refresh=()=>this.disposed?Promise.resolve():this.reading?this.reading:(this.patch({checking:!0,error:"",copied:!1}),this.reading=(async()=>{try{let e=await this.fetcher(this.origin+"/gate/update/check",{signal:AbortSignal.timeout(1e4)}),t=await e.json();if(!e.ok)throw new Error(t.error||"暂时无法检查更新");if(!t.advice?.current||typeof t.advice.label!="string")throw new Error("更新检查返回信息不完整");if(this.patch({check:t}),this.installing||this.job||this.recovering)return;t.activeJob?.statusOrigin?this.follow(t.activeJob):t.lastResult?.phase==="unknown"?this.patch({progress:t.lastResult}):t.mode==="busy"?this.patch({progress:{phase:"preparing",progress:0,message:"更新仍在准备或等待确认，请稍后重新检查；不要重复安装。",terminal:!0}}):this.patch({progress:t.lastResult??null})}catch(e){this.patch({check:null,error:e instanceof Error?e.message:"暂时无法检查更新"})}finally{this.patch({checking:!1})}})().finally(()=>{this.reading=void 0}),this.reading);follow(e){if(this.disposed||this.job?.jobId===e.jobId)return;this.job=e;let t=++this.pollGeneration,s=Date.now()+10*6e4;clearTimeout(this.timer),this.patch({progress:{phase:"recovering",progress:0,message:"正在恢复更新进度…",terminal:!1}});let r=async()=>{if(this.disposed||t!==this.pollGeneration)return;let l;try{let d=await this.fetcher(e.statusOrigin+"/status",{headers:{Authorization:"Bearer "+e.statusToken},signal:AbortSignal.timeout(4e3)});if(!d.ok)throw new Error("进度暂不可用");let i=await d.json();if(i.jobId!==e.jobId||typeof i.terminal!="boolean"||typeof i.message!="string")throw new Error("进度不匹配");l=i}catch{try{let d=await this.fetcher(this.origin+"/gate/update/status",{signal:AbortSignal.timeout(3e3)}),i=await d.json();d.ok&&i.lastResult?.jobId===e.jobId&&(l=i.lastResult)}catch{}}if(!(this.disposed||t!==this.pollGeneration)){if(l&&(this.patch({progress:l}),l.terminal)){this.job=null,l.ok?this.resume(e.jobId):this.refresh();return}if(Date.now()>s){this.job=null,this.patch({progress:{phase:"unknown",progress:0,message:"暂时无法确认更新结果。请重新打开此主机 WebUI 检查版本；不要重复安装或删除节点。",terminal:!0}});return}this.timer=setTimeout(()=>void r(),1e3)}};r()}async resume(e){this.recovering=!0;let t=Date.now()+3e4,s=async()=>{try{let r=await this.fetcher(this.origin+"/gate/update/resume?job="+encodeURIComponent(e),{signal:AbortSignal.timeout(3e3)});if(!r.ok)throw new Error("尚未恢复");let l=await r.json();if(!l.url)throw new Error("缺少恢复地址");let d=new URL(l.url);if(d.origin!==window.location.origin||d.pathname!=="/"||d.username||d.password||d.hash)throw new Error("恢复地址不匹配");this.disposed||window.location.replace(d.href)}catch{if(this.disposed)return;if(Date.now()>=t){this.recovering=!1,this.patch({resumeFailed:!0});return}this.timer=setTimeout(()=>void s(),1e3)}};await s()}install=async()=>{let{check:e,checking:t,error:s,progress:r}=this.value;if(this.disposed||!e?.canInstall||t||s||r&&!r.terminal||this.installing||this.job||this.recovering)return;this.installing=!0,this.patch({error:"",check:{...e,canInstall:!1,ticket:""},progress:{phase:"download",progress:10,message:"正在下载并验证更新包；当前插件尚未替换",terminal:!1}});let l=!1;try{let d=await this.fetcher(this.origin+"/gate/update/start",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({ticket:e.ticket})}),i=await d.json();if(l=!d.ok&&typeof i.error=="string",!d.ok||!i.statusOrigin)throw new Error(i.error||"无法取得更新进度，请重新检查");this.follow(i)}catch(d){if(this.disposed)return;if(l)this.patch({progress:{phase:"failed",progress:0,message:(d instanceof Error?d.message:"更新暂不可用")+"。请重新检查更新。",terminal:!0,ok:!1}});else{try{let i=await this.fetcher(this.origin+"/gate/update/status",{signal:AbortSignal.timeout(3e3)}),u=await i.json();if(i.ok&&u.activeJob?.statusOrigin){this.follow(u.activeJob);return}}catch{}this.patch({progress:{phase:"unknown",progress:0,message:"连接中断，暂时无法确认更新结果。请稍后检查更新；不要重复安装或删除节点。",terminal:!0}})}}finally{this.installing=!1}};copyCommand=async()=>{if(!(!this.value.check?.manualCommand||this.value.checking||this.installing||this.job))try{await navigator.clipboard.writeText(this.value.check.manualCommand),this.patch({copied:!0})}catch{this.patch({error:"复制失败，请手动选中下方命令复制。"})}};dispose=()=>{this.disposed=!0,this.pollGeneration++,clearTimeout(this.timer),this.listeners.clear()}};var Q=class{constructor(e){this.call=e}value={checking:!1,starting:!1,check:null,status:null,error:null};listeners=new Set;reading;timer;disposed=!1;checkRevision=0;checkInvalidated=!1;getSnapshot=()=>this.value;patch(e){if(!this.disposed){this.value={...this.value,...e};for(let t of this.listeners)t()}}subscribe=e=>this.disposed?()=>{}:(this.listeners.add(e),this.checkInvalidated?(this.refreshInvalidatedCheck(),this.active()&&this.poll()):!this.value.check&&!this.value.starting?this.refresh():this.active()&&this.poll(),()=>{this.listeners.delete(e),this.listeners.size||(clearTimeout(this.timer),this.timer=void 0)});active(){return this.value.status&&["preparing","installing","unknown","restart-required"].includes(this.value.status.phase)}invalidateCheck=()=>{this.disposed||(this.checkRevision++,this.checkInvalidated=!0,this.value.check&&this.patch({check:{...this.value.check,canInstall:!1,ticket:""}}),this.refreshInvalidatedCheck())};refreshInvalidatedCheck(){!this.disposed&&this.checkInvalidated&&this.listeners.size&&!this.value.starting&&!this.active()&&this.refresh()}refresh=()=>{if(this.disposed||this.value.starting)return Promise.resolve();if(this.reading)return this.reading;let e=this.checkRevision;return this.checkInvalidated=!1,this.patch({checking:!0,error:null}),this.reading=(async()=>{try{let t=await this.call("update-check");if(this.disposed||e!==this.checkRevision)return;if(!t?.advice||!t.status||typeof t.canInstall!="boolean")throw Error("invalid update response");this.patch({check:t,status:t.status}),this.active()&&this.poll()}catch{if(this.disposed||e!==this.checkRevision)return;let t=!1;try{let s=await this.call("status");t=!!(s&&!s.plugin)}catch{}if(this.disposed||e!==this.checkRevision)return;this.patch({check:null,error:t?"当前运行的连接服务尚不支持此更新入口。若刚安装新版，请在任务结束后退出并重新打开 Desktop；无需重新配对。仍不可用时请在原生插件管理器核对安装。":"本次更新检查未完成，不能据此判断已是最新版。请稍后重试；配对和聊天不受此次检查失败影响。"})}finally{this.patch({checking:!1})}})().finally(()=>{this.reading=void 0,this.refreshInvalidatedCheck()}),this.reading};install=async()=>{let e=this.value.check;if(!(this.disposed||this.checkInvalidated||this.value.starting||this.value.checking||!e?.canInstall||!e.ticket)){this.patch({starting:!0,error:null,check:{...e,canInstall:!1,ticket:""}});try{let t=await this.call("update-start",{ticket:e.ticket});this.patch({status:t})}catch(t){this.patch({status:t?.code==="update/not-started"?{phase:"failed",message:t instanceof Error?t.message:"尚未启动更新，请重新检查"}:{phase:"unknown",message:"更新提交结果暂未确认，正在核对；请勿重复安装。"}})}finally{this.patch({starting:!1}),this.poll(),this.refreshInvalidatedCheck()}}};poll(){this.disposed||this.timer||!this.listeners.size||!this.active()||(this.timer=setTimeout(async()=>{try{let e=await this.call("update-status");if(!e||!["idle","preparing","installing","restart-required","complete","failed","unknown"].includes(e.phase))throw Error("invalid status");this.patch({status:e,error:e.phase==="idle"?"尚未发现已接受的更新，请重新检查后再操作。":null})}catch{this.patch({error:"更新状态暂不可用；恢复连接后继续核对，不会重复安装。"})}finally{this.timer=void 0,this.poll(),this.refreshInvalidatedCheck()}},2e3))}dispose(){this.disposed=!0,this.checkRevision++,this.checkInvalidated=!1,clearTimeout(this.timer),this.listeners.clear()}};var te=()=>({loadState:"loading",qrState:"idle",status:null,host:null,runtime:null,localOrigin:null,qr:null,error:null,decisionError:null,deciding:!1}),pe=a=>a?.companionUpdate?.state?["preparing","installing","verifying","recovering"].includes(a.companionUpdate.state):void 0,L=class{constructor(e,t){this.describeHost=e;this.callManagement=t}updates;nativeUpdates;value=te();listeners=new Set;timer;reading;pairing;disposed=!1;identity="";generation=0;getSnapshot=()=>this.value;subscribe=e=>this.disposed?()=>{}:(this.listeners.add(e),this.timer||(this.refresh(),this.timer=setInterval(()=>void this.refresh(),2e3)),()=>{this.listeners.delete(e),this.listeners.size||(clearInterval(this.timer),this.timer=void 0)});patch(e){if(!this.disposed){this.value={...this.value,...e};for(let t of this.listeners)t()}}async client(){let e=await de(this.describeHost,this.callManagement);if(this.disposed)throw new Error("disposed");let t=`${e.host.agentInstanceId??e.host.computerName}/${e.runtime.profileScope??"web"}`;return this.identity&&this.identity!==t&&(this.generation++,this.value=te(),this.updates?.dispose(),this.updates=void 0,this.nativeUpdates?.dispose(),this.nativeUpdates=void 0),this.identity=t,e.runtime.profileScope==="desktop"&&!this.nativeUpdates&&(this.nativeUpdates=new Q(this.callManagement)),this.updates?.origin!==e.localOrigin&&(this.updates?.dispose(),this.updates=e.localOrigin?new X(e.localOrigin):void 0),this.patch({host:e.host,runtime:e.runtime,localOrigin:e.localOrigin}),e}refresh=()=>this.disposed?Promise.resolve():this.reading?this.reading:(this.reading=(async()=>{try{let e=await this.client(),t=this.generation,s={...await e.status()};if(s.companionUpdate?.state==="complete"&&!s.plugin&&(s.companionUpdate={state:"unverified",message:"当前连接服务尚未提供运行版本核验，不能确认两端已对齐。若刚安装插件，请在任务结束后退出并重新打开当前应用；无需重新配对。"}),t!==this.generation)return;let r=pe(this.value.status),l=pe(s);l!==void 0&&l!==r&&this.nativeUpdates?.invalidateCheck(),this.patch({status:s,runtime:s.gate??e.runtime,loadState:"ready",error:null,...this.value.qr&&this.value.qr.expiresAt<=Date.now()?{qrState:"expired",qr:null}:{}})}catch{this.patch({loadState:"error",error:"连接服务暂未就绪。请确认 DSH 正在运行，然后重试。"})}})().finally(()=>{this.reading=void 0}),this.reading);generateQr=()=>this.disposed?Promise.resolve():this.pairing?this.pairing:(this.patch({qrState:"loading",qr:null,error:null}),this.pairing=(async()=>{try{let e=await this.client(),t=this.generation,s=await e.pairCode();if(t!==this.generation)return;if(!s?.qrDataUrl?.startsWith("data:image/")||!Number.isFinite(s.expiresAt)||s.expiresAt<=Date.now())throw new Error("invalid QR");this.patch({qr:s,qrState:"ready"}),await this.refresh()}catch{this.patch({qr:null,qrState:"error",error:"暂时无法生成配对二维码，请稍后重试。"})}})().finally(()=>{this.pairing=void 0}),this.pairing);decide=async e=>{let t=this.value.status?.companionUpdate?.offerId;if(!(this.disposed||this.value.deciding||!t)){this.patch({deciding:!0,decisionError:null});try{let s=await this.client();if(this.value.status?.companionUpdate?.offerId!==t)throw new Error("stale offer");await s.decide(t,e),await this.reading,await this.refresh()}catch{this.patch({decisionError:"更新选择未确认，请刷新后核对；不要重复安装。"})}finally{this.patch({deciding:!1})}}};dispose=()=>{this.disposed=!0,this.generation++,clearInterval(this.timer),this.timer=void 0,this.listeners.clear(),this.value=te(),this.updates?.dispose(),this.updates=void 0,this.nativeUpdates?.dispose(),this.nativeUpdates=void 0}},ce=new WeakMap;function Z(a,e){let t=ce.get(a);return t||(t=new L(a,e),ce.set(a,t)),t}var M=T(q(),1),B=require("react/jsx-runtime");function K({describeHost:a,callManagement:e,onDismiss:t,onOpenDetails:s,compact:r=!1,store:l=Z(a,e)}){let{status:d,deciding:i,decisionError:u,error:m,loadState:v}=(0,ue.useSyncExternalStore)(l.subscribe,l.getSnapshot,l.getSnapshot),p=d?.companionUpdate,g=u||m,_=(0,B.jsxs)("div",{children:[(0,B.jsx)(le,{value:p,compact:r,deciding:i||v!=="ready",onDecide:k=>void l.decide(k)}),!p&&!g?(0,B.jsx)("p",{className:M.default.helpText,children:v==="loading"?"正在检查同一主机的另一端…":"另一端状态未确认；不会自动更新。"}):!r&&p?.state==="idle"?(0,B.jsx)("p",{className:M.default.helpText,children:"未发现需要联动更新的另一端。当前节点可独立使用，不会自动安装另一端或启用已停用的插件。"}):null,g?(0,B.jsx)("p",{role:"alert",children:g}):null,t?(0,B.jsxs)("div",{className:M.default.actions,children:[s?(0,B.jsx)("button",{type:"button",className:M.default.primaryButton,onClick:s,children:"前往微信连接"}):null,(0,B.jsx)("button",{type:"button",className:M.default.secondaryButton,onClick:t,children:"关闭提示（不会确认更新）"})]}):null]});return t?(0,B.jsx)(he.Modal,{open:!0,title:"微信连接 · 联动更新",closeLabel:"关闭提示",className:M.default.pageDialog,contentClassName:M.default.pageDialogContent,onClose:t,children:_}):_}var W=require("react"),ge=T(q(),1),j=require("react/jsx-runtime");function be({wide:a,openPlugin:e}){let[t,s]=(0,W.useState)(!1),[r,l]=(0,W.useState)(!1),d=(0,W.useRef)(!1),i=async()=>{if(!d.current){d.current=!0,l(!0);try{await e()||s(!0)}finally{d.current=!1,l(!1)}}};return(0,j.jsxs)(j.Fragment,{children:[(0,j.jsxs)("button",{type:"button",className:ge.default.sidebarButton,"data-wide":a,title:"微信连接","aria-label":"微信连接",disabled:r,onClick:()=>void i(),children:[(0,j.jsxs)("svg",{width:"20",height:"20",viewBox:"0 0 24 24",fill:"none",stroke:"currentColor",strokeWidth:"1.7","aria-hidden":"true",children:[(0,j.jsx)("path",{d:"M20 11.5a8 8 0 0 1-8 8 9 9 0 0 1-3.5-.7L4 20l1.2-4.2A7.8 7.8 0 0 1 4 11.5a8 8 0 0 1 16 0Z"}),(0,j.jsx)("path",{d:"M8 11.5h.01M12 11.5h.01M16 11.5h.01",strokeWidth:"2.5",strokeLinecap:"round"})]}),a?(0,j.jsx)("span",{children:r?"正在打开…":"微信连接"}):null]}),t?(0,j.jsx)("small",{role:"status",children:"插件详情暂不可用，请打开「设置 → 微信连接」。"}):null]})}async function me(a){try{let e=a("pluginNavigation"),t=a("remote.pluginManager");if(typeof e?.openBundle!="function"||typeof t?.listBundles!="function")return!1;let s=await t.listBundles();if(!s.ok||!Array.isArray(s.value))return!1;let r=s.value.filter(d=>d.enabled&&["dsh-wechat-remote","@harness-remote/dsh-wechat-remote"].includes(d.name));if(r.length!==1)return!1;let l=a("pluginNavigation");return l!==e||typeof l.openBundle!="function"?!1:(l.openBundle(r[0].name),!0)}catch{return!1}}var Y=require("react"),Ce=require("@deepseek-ai/dsh-client-ui-primitives"),S=T(q(),1);var fe=require("react"),D=T(q(),1),h=require("react/jsx-runtime");function ve({store:a,embedded:e=!1}){let{check:t,checking:s,progress:r,error:l,copied:d,resumeFailed:i}=(0,fe.useSyncExternalStore)(a.subscribe,a.getSnapshot,a.getSnapshot),u=!!(r&&!r.terminal),m=u||r?.phase==="unknown"||t?.mode==="busy";return(0,h.jsxs)("div",{className:e?D.default.updateEndpoint:D.default.updateCard,children:[(0,h.jsxs)("div",{className:D.default.updateRow,children:[(0,h.jsxs)("div",{className:D.default.updateCopy,children:[(0,h.jsxs)("strong",{children:["Web ",(0,h.jsx)("span",{className:D.default.updateScope,children:"当前端"})]}),t?(0,h.jsxs)("div",{className:D.default.updateVersions,children:[(0,h.jsxs)("span",{children:["DSH ",(0,h.jsx)("strong",{children:t.advice.current.agentVersion||"未确认"})]}),(0,h.jsxs)("span",{children:["插件运行 ",(0,h.jsx)("strong",{children:t.advice.current.pluginVersion||"未确认"})]}),t.channel==="preview"?(0,h.jsx)("span",{children:"预览通道"}):null]}):null]}),(0,h.jsxs)("div",{className:D.default.updateControl,children:[(0,h.jsx)("button",{type:"button",className:D.default.secondaryButton,disabled:s||u,onClick:()=>void a.refresh(),children:s?"检查中…":"检查更新"}),t&&!s?(0,h.jsx)("strong",{className:D.default.updateLabel,"data-severity":m?"unknown":t.advice.severity,role:"status",children:u?"正在更新 Web 插件":m?"更新状态待核对":t.advice.label}):null,t?.advice.checkedAt&&t.advice.severity!=="unknown"?(0,h.jsxs)("small",{className:D.default.updateChecked,children:["检查于 ",new Date(t.advice.checkedAt).toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"})]}):null]})]}),t?(0,h.jsx)(h.Fragment,{children:s?null:(0,h.jsxs)(h.Fragment,{children:[!m&&t.advice.targetVersion?(0,h.jsxs)("p",{children:["可更新至 ",t.advice.targetVersion,t.mode==="manual"?" · 需手动更新":""]}):null,!m&&(t.advice.severity==="unknown"||t.advice.severity==="required"||t.mode==="manual")?(0,h.jsxs)("details",{children:[(0,h.jsx)("summary",{children:t.mode==="manual"?"手动更新说明":"查看说明"}),t.reason?(0,h.jsx)("p",{children:t.reason}):null,(0,h.jsx)("p",{children:t.advice.message})]}):null,!m&&t.mode==="manual"&&t.manualCommand?(0,h.jsxs)("div",{className:D.default.updateCommand,children:[(0,h.jsx)("code",{children:t.manualCommand}),(0,h.jsx)("button",{type:"button",className:D.default.secondaryButton,disabled:u,onClick:()=>void a.copyCommand(),children:d?"已复制":"复制命令"})]}):null,!m&&t.canInstall?(0,h.jsxs)(h.Fragment,{children:[(0,h.jsx)("div",{className:D.default.updateActions,children:(0,h.jsx)("button",{type:"button",className:D.default.primaryButton,disabled:u||!!l,onClick:()=>void a.install(),children:"更新 Web 并重启"})}),(0,h.jsx)("small",{className:D.default.updateChecked,children:"仅更新 Web，保留配对与会话；连接会短暂中断。"})]}):null]})}):null,l?(0,h.jsx)("p",{role:"alert",children:l}):null,r?(0,h.jsxs)("div",{role:"status","aria-live":"polite",children:[!r.terminal||r.ok===!0?(0,h.jsx)("progress",{className:D.default.updateProgress,max:100,value:r.progress}):null,(0,h.jsx)("p",{children:r.message}),i?(0,h.jsx)("p",{role:"alert",children:"插件已完成更新，但未能自动打开 WebUI。请使用 DSH 启动时显示的地址打开，无需重复更新。"}):null]}):null]})}var ye=require("react"),E=T(q(),1),f=require("react/jsx-runtime");function _e({store:a,embedded:e=!1}){let{check:t,status:s,checking:r,starting:l,error:d}=(0,ye.useSyncExternalStore)(a.subscribe,a.getSnapshot,a.getSnapshot),i=l||s?.phase==="preparing"||s?.phase==="installing",u=s&&["preparing","installing","restart-required","unknown"].includes(s.phase),m=s?.phase==="restart-required"||s?.phase==="complete",v=s?.phase==="restart-required"?"已安装，待重新打开 Desktop":s?.phase==="unknown"?"更新结果待核对":s?.phase==="failed"?"更新未完成":i?"正在更新 Desktop 插件":s?.phase==="complete"?"更新已生效":"";return(0,f.jsxs)("div",{className:e?E.default.updateEndpoint:E.default.updateCard,children:[(0,f.jsxs)("div",{className:E.default.updateRow,children:[(0,f.jsxs)("div",{className:E.default.updateCopy,children:[(0,f.jsxs)("strong",{children:["Desktop ",(0,f.jsx)("span",{className:E.default.updateScope,children:"当前端"})]}),t?(0,f.jsxs)("div",{className:E.default.updateVersions,children:[(0,f.jsxs)("span",{children:["DSH ",(0,f.jsx)("strong",{children:t.advice.current.agentVersion||"未确认"})]}),(0,f.jsxs)("span",{children:["插件运行 ",(0,f.jsx)("strong",{children:t.advice.current.pluginVersion||"未确认"})]}),m&&s.targetVersion&&s.targetVersion!==t.advice.current.pluginVersion?(0,f.jsxs)("span",{children:["已安装 ",(0,f.jsx)("strong",{children:s.targetVersion})]}):null,t.channel==="preview"?(0,f.jsx)("span",{children:"预览通道"}):null]}):null]}),(0,f.jsxs)("div",{className:E.default.updateControl,children:[(0,f.jsx)("button",{type:"button",className:E.default.secondaryButton,disabled:r||i,onClick:()=>void a.refresh(),children:r?"检查中…":"检查更新"}),t?(0,f.jsx)("strong",{className:E.default.updateLabel,"data-severity":s?.phase==="failed"?"required":s?.phase==="complete"?"none":u?s?.phase==="unknown"?"unknown":"info":t.advice.severity,children:v||t.advice.label}):null,t?.advice.checkedAt?(0,f.jsxs)("small",{className:E.default.updateChecked,children:["检查于 ",new Date(t.advice.checkedAt).toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"})]}):null]})]}),t?(0,f.jsxs)(f.Fragment,{children:[!m&&!u&&t.advice.targetVersion?(0,f.jsxs)("p",{children:["可更新至 ",t.advice.targetVersion]}):null,!u&&t.reason?(0,f.jsx)("p",{children:t.reason}):null,!u&&t.canInstall?(0,f.jsxs)(f.Fragment,{children:[(0,f.jsx)("div",{className:E.default.updateActions,children:(0,f.jsx)("button",{type:"button",className:E.default.primaryButton,disabled:i||r,onClick:()=>void a.install(),children:"更新 Desktop 插件"})}),(0,f.jsx)("small",{className:E.default.updateChecked,children:"仅更新 Desktop，保留配对与会话；完成后需退出并重新打开。"})]}):null]}):null,s?.phase!=="idle"&&s?(0,f.jsxs)("div",{role:"status","aria-live":"polite",children:[i?(0,f.jsx)("progress",{className:E.default.updateProgress,"aria-label":"Desktop 插件更新中"}):null,s.phase==="restart-required"?(0,f.jsx)("p",{className:E.default.updatePeerNote,children:"任务结束后，选择「应用 → 退出」再打开 Desktop；无需重新配对，Web 不受影响。"}):s.phase!=="complete"?(0,f.jsx)("p",{children:s.message}):null]}):null,d?(0,f.jsx)("p",{role:"alert",children:d}):null]})}var J=require("react"),x=T(q(),1),o=require("react/jsx-runtime"),G=a=>a.state==="installed"&&(a.nativeState===void 0||a.nativeState==="installed"),Ue=a=>G(a)?"已安装":a.state==="draft"?"待安装":a.nativeState==="uninstalled"?"未安装":a.nativeState==="disabled"?"已停用":a.state==="pending-restart"?"待重启":"待核对",ae=a=>a.templateId==="designer"||a.id==="designer"?"定制我的助手":a.name;function we({label:a,children:e}){let t=(0,J.useId)();return(0,o.jsxs)("span",{className:x.default.assistantHelpAnchor,children:[(0,o.jsx)("button",{type:"button",className:x.default.assistantHelpButton,"aria-label":a,"aria-describedby":t,children:"?"}),(0,o.jsx)("span",{id:t,className:x.default.assistantTooltip,role:"tooltip",children:e})]})}function xe({store:a}){let{catalog:e,preview:t,busy:s,message:r,error:l}=(0,J.useSyncExternalStore)(a.subscribe,a.getSnapshot,a.getSnapshot),d=(0,J.useRef)();(0,J.useEffect)(()=>{let n=new AbortController;return d.current=n,a.load(),()=>n.abort()},[a]);let i=e?.drafts||[],u=i.filter(n=>G(n)&&!n.replacement),m=i.filter(n=>n.state==="draft"),v=i.filter(n=>n.source!=="builtin"&&n.state!=="draft"&&(!G(n)||n.replacement)),p=e?.templates||[],g=n=>u.find(y=>y.templateId===n),_=n=>void a.start(n.presetId,d.current?.signal),k=n=>n.id==="designer"||n.templateId==="designer"?"先打开定制会话，说清职业和工作习惯；助手会设计可复用的模式。确认安装后，再用新模式开启工作会话。不会自动安装或发送消息。":`先选工作区，再用「${n.name}」开始空白会话。手机连接此电脑后可继续该会话；发卡与提醒需在小程序设置中开启「微信群协作助手」。`,N=n=>{let y=g(n.id),U=n.builtin,$=i.find(C=>C.templateId===n.id&&C.source==="builtin");return(0,o.jsxs)("article",{className:x.default.assistantChoice,"data-installed":!!y,children:[(0,o.jsxs)("div",{className:x.default.assistantChoiceCopy,children:[(0,o.jsxs)("div",{className:x.default.assistantChoiceHead,children:[(0,o.jsx)("strong",{children:ae(n)}),(0,o.jsx)(we,{label:`${ae(n)}使用说明`,children:k(n)})]}),(0,o.jsx)("p",{children:n.id==="designer"?"用对话设计适合自己职业的助手模式":n.description})]}),!y&&U?(0,o.jsx)("span",{className:x.default.assistantUnavailable,title:$?.reason||U.reason,children:$?.nativeState==="disabled"?"已停用":"待就绪"}):null,(0,o.jsx)("button",{type:"button",className:x.default.secondaryButton,disabled:s||!!(U&&!y),onClick:()=>y?_(y):U?void a.load():void a.choose(n.id),children:y?n.id==="designer"?"开始定制":"开始使用":U?"开始使用":"安装"})]},n.id)},H=n=>(0,o.jsxs)("div",{className:x.default.assistantEntry,children:[(0,o.jsxs)("div",{className:x.default.assistantEntryHead,children:[(0,o.jsx)("strong",{children:ae(n)}),(0,o.jsx)("span",{children:Ue(n)})]}),n.replacement?(0,o.jsxs)("div",{children:[(0,o.jsxs)("p",{children:["已提供内置「",n.replacement.name,"」，无需再装同款独立包。"]}),(0,o.jsx)("p",{children:n.replacement.warning}),n.replacement.canRemoveAfterReview?(0,o.jsxs)("p",{children:["核对旧会话后，可在 DSH 插件列表卸载：",(0,o.jsx)("code",{children:n.replacement.bundleName})]}):null]}):null,G(n)?(0,o.jsx)("button",{type:"button",className:x.default.assistantSecondary,disabled:s,onClick:()=>_(n),children:"开始使用"}):n.state==="draft"?(0,o.jsx)("button",{type:"button",className:x.default.assistantPrimary,disabled:s,onClick:()=>void a.preview(n.id,n.version),children:"查看并安装"}):(0,o.jsxs)(o.Fragment,{children:[(0,o.jsx)("button",{type:"button",className:x.default.assistantSecondary,disabled:s,onClick:()=>void a.verify(n.id,n.version),children:"刷新状态"}),n.nativeState==="uninstalled"&&!n.replacement?(0,o.jsx)("button",{type:"button",className:x.default.assistantSecondary,disabled:s,onClick:()=>void a.reinstall(n.id,n.version),children:"查看并重新安装"}):null]}),!G(n)&&n.reason?(0,o.jsxs)("details",{className:x.default.assistantDetails,children:[(0,o.jsx)("summary",{children:"状态说明"}),(0,o.jsx)("p",{children:n.reason})]}):null]},`${n.id}:${n.version}`);return(0,o.jsxs)("section",{className:x.default.assistantsCard,"aria-label":"微信群协作助手","aria-busy":s,children:[(0,o.jsxs)("div",{className:x.default.assistantsHeading,children:[(0,o.jsxs)("div",{className:x.default.assistantChoiceHead,children:[(0,o.jsx)("h3",{children:"微信群协作助手"}),(0,o.jsx)(we,{label:"电脑助手与手机群协作",children:"电脑助手可独立使用，组件开关由 DSH 管理。手机发任务和提醒，需在小程序「设置 → 实验性功能」开启「微信群协作助手」。各手机独立设置，不会关闭电脑助手或已发布任务。"})]}),(0,o.jsx)("button",{type:"button",className:x.default.assistantTextButton,disabled:s,onClick:()=>void a.load(),children:s?"读取中…":"刷新"})]}),!e&&!l?(0,o.jsx)("p",{role:"status",children:"正在读取当前电脑的助手…"}):null,e&&!e.native?.supported?(0,o.jsx)("p",{role:"status",children:e.native?.reason||"当前 DSH 暂不支持安装助手，请先检查版本。"}):null,e&&(e.native?.supported||p.some(n=>n.builtin))?(0,o.jsxs)(o.Fragment,{children:[(0,o.jsx)("div",{className:x.default.assistantChoices,children:p.filter(n=>["teacher","project"].includes(n.id)).map(N)}),p.some(n=>n.id==="designer")?(0,o.jsx)("div",{className:x.default.assistantCustomize,children:p.filter(n=>n.id==="designer").map(N)}):null]}):null,t?(0,o.jsxs)("div",{className:x.default.assistantPreview,"aria-label":"安装助手预览",children:[(0,o.jsxs)("h4",{children:["安装「",t.definition.name,"」"]}),(0,o.jsx)("p",{children:t.definition.description}),(0,o.jsx)("p",{children:"新增一个可选的助手模式，不改默认模式、已有会话和资料。"}),(0,o.jsxs)("details",{className:x.default.assistantDetails,children:[(0,o.jsx)("summary",{children:"查看工作方式与安装详情"}),(0,o.jsx)("p",{children:t.definition.role}),(0,o.jsx)("ul",{children:t.definition.methods.map((n,y)=>(0,o.jsx)("li",{children:n},y))}),(0,o.jsx)("p",{children:"助手会逐步了解："}),(0,o.jsx)("ul",{children:t.definition.onboarding.map(n=>(0,o.jsxs)("li",{children:[n.label,"：",n.prompt]},n.key))}),(0,o.jsxs)("small",{children:["第 ",t.version," 版 · 内容摘要 ",t.digest.slice(0,12)," · 基础模式 ",t.native.basePreset]}),(0,o.jsx)("ul",{children:(t.native.warnings||[]).map((n,y)=>(0,o.jsx)("li",{children:n},y))})]}),(0,o.jsxs)("div",{className:x.default.assistantButtons,children:[(0,o.jsx)("button",{type:"button",className:x.default.assistantPrimary,disabled:s,onClick:()=>void a.install(),children:"确认安装"}),(0,o.jsx)("button",{type:"button",className:x.default.assistantSecondary,disabled:s,onClick:()=>a.dismissPreview(),children:"暂不安装"})]})]}):null,m.length?(0,o.jsxs)("div",{children:[(0,o.jsx)("h4",{children:"待安装的助手"}),m.map(H)]}):null,u.some(n=>!["teacher","project","designer"].includes(n.templateId))?(0,o.jsxs)("div",{children:[(0,o.jsx)("h4",{children:"我已安装的其他助手"}),u.filter(n=>!["teacher","project","designer"].includes(n.templateId)).map(H)]}):null,v.length||p.some(n=>!["teacher","project","designer"].includes(n.id))?(0,o.jsxs)("details",{className:x.default.assistantDetails,children:[(0,o.jsx)("summary",{children:"更多助手与安装记录"}),e?.native?.supported?(0,o.jsx)("div",{className:x.default.assistantChoices,children:p.filter(n=>!["teacher","project","designer"].includes(n.id)).map(N)}):null,v.length?(0,o.jsxs)("details",{className:x.default.assistantDetails,children:[(0,o.jsxs)("summary",{children:["以前安装的助手（",v.length,"）"]}),(0,o.jsx)("p",{children:"旧会话可能仍在使用旧模式；卸载前请核对，聊天与资料不会在这里删除。"}),v.map(H)]}):null]}):null,r?(0,o.jsx)("p",{role:"status",children:r}):null,l?(0,o.jsx)("p",{role:"alert",children:l}):null]})}var R=require("react"),P=T(q(),1),b=require("react/jsx-runtime"),ze={wait:"请用微信扫一扫",scaned:"请在微信确认",need_verifycode:"请填写微信显示的验证码",expired:"二维码已过期，请取消后重新生成",verify_code_blocked:"验证码暂不可用，请稍后重新配对",scaned_but_redirect:"请按微信提示继续确认",binded_redirect:"微信提示已连接，请核对原节点的绑定"};function ke({call:a}){let[e,t]=(0,R.useState)(),[s,r]=(0,R.useState)([]),[l,d]=(0,R.useState)(""),[i,u]=(0,R.useState)(!1),[m,v]=(0,R.useState)(""),[p,g]=(0,R.useState)(""),_=(0,R.useRef)(e);_.current=e;let k=(0,R.useRef)(!1),N=(0,R.useRef)(null),H=(0,R.useRef)(null),n=(0,R.useRef)(0),y=async(C,A=!1)=>{if(N.current&&!(C.action==="login.cancel"&&N.current.action==="login.poll")||A&&H.current)return;let V={};A?H.current=V:(N.current={action:C.action,token:V},n.current++);let O=n.current;A||(u(!0),v(""));try{let z=await a(C);if(!k.current||O!==n.current)return;"sessions"in z?r(z.sessions):(t(z),A||d(z.target?.id||""))}catch(z){k.current&&O===n.current&&v(z instanceof Error?z.message:"暂时无法读取状态")}finally{A?H.current===V&&(H.current=null):N.current?.token===V&&(N.current=null,k.current&&O===n.current&&u(!1))}};(0,R.useEffect)(()=>{k.current=!0,t(void 0),r([]),d(""),g(""),y({action:"status"});let C=setInterval(()=>{let A=_.current?.pairing;A&&!["expired","need_verifycode","verify_code_blocked","binded_redirect"].includes(A.status)?y({action:"login.poll",loginId:A.id},!0):y({action:"status"},!0)},4e3);return()=>{k.current=!1,n.current++,N.current=null,H.current=null,clearInterval(C)}},[a]);let U=async()=>{await y({action:"status"}),await y({action:"sessions"})},$=e?e.paired?e.enabled?e.state==="ready"?"已连接":e.state==="error"?"连接异常":"连接中":"已暂停":"未绑定":"待连接";return(0,b.jsxs)("section",{className:P.default.updateCard,"aria-label":"微信 ClawBot",children:[(0,b.jsxs)("div",{className:P.default.clawbotHead,children:[(0,b.jsxs)("h3",{className:P.default.updateHeading,children:[(0,b.jsx)("span",{className:P.default.clawbotMark,"aria-hidden":!0}),"微信 ClawBot ",(0,b.jsx)("small",{children:"实验性"})]}),(0,b.jsx)("button",{type:"button",className:P.default.secondaryButton,disabled:i,onClick:()=>void U(),children:"刷新"})]}),(0,b.jsxs)("div",{className:P.default.clawbotRow,children:[(0,b.jsxs)("span",{children:[$,e?.target?` · ${e.target.title}`:" · 未选择会话"]}),(0,b.jsxs)("label",{className:P.default.clawbotToggle,children:[(0,b.jsx)("input",{type:"checkbox",role:"switch",checked:e?.enabled||!1,disabled:!e||i,onChange:C=>void y({action:"enabled",enabled:C.target.checked,expectedRevision:e?.revision})}),"启用接入"]})]}),(0,b.jsx)("p",{className:P.default.clawbotNote,children:"微信私聊直接连接此节点；不依赖小程序在线，不改变会话的模式和权限。"}),(0,b.jsxs)("div",{className:P.default.clawbotRow,children:[(0,b.jsxs)("select",{"aria-label":"ClawBot 目标会话",value:l,disabled:!e||i,onFocus:()=>{s.length||y({action:"sessions"})},onChange:C=>d(C.target.value),children:[(0,b.jsx)("option",{value:"",children:"选择已有会话"}),e?.target&&!s.some(C=>C.id===e.target.id)?(0,b.jsx)("option",{value:e.target.id,children:e.target.title}):null,s.map(C=>(0,b.jsx)("option",{value:C.id,children:C.title},C.id))]}),(0,b.jsx)("button",{type:"button",className:P.default.secondaryButton,disabled:!l||!e||i,onClick:()=>void y({action:"route",sessionId:l,expectedRevision:e?.revision}),children:"接到此会话"})]}),!e?.pairing&&!e?.enabled?(0,b.jsx)("button",{type:"button",className:P.default.primaryButton,disabled:!e||i,onClick:()=>void y({action:"login.start"}),children:e?.paired?"重新确认微信连接":"连接微信 ClawBot"}):null,e?.pairing?(0,b.jsxs)("div",{className:P.default.clawbotPairing,children:[(0,b.jsx)("img",{src:e.pairing.qrDataUrl,width:"180",height:"180",alt:"微信 ClawBot 官方登录二维码"}),(0,b.jsxs)("div",{children:[(0,b.jsx)("p",{children:ze[e.pairing.status]||"请完成微信确认"}),e.pairing.status==="need_verifycode"?(0,b.jsxs)("form",{onSubmit:C=>{C.preventDefault(),y({action:"login.poll",loginId:e.pairing.id,verifyCode:p}),g("")},children:[(0,b.jsx)("input",{"aria-label":"微信验证码",value:p,autoComplete:"off",inputMode:"numeric",maxLength:16,onChange:C=>g(C.target.value)}),(0,b.jsx)("button",{type:"submit",className:P.default.primaryButton,disabled:i||!/^\d{1,16}$/.test(p),children:"确认验证码"})]}):null,(0,b.jsx)("button",{type:"button",className:P.default.secondaryButton,disabled:i&&N.current?.action!=="login.poll",onClick:()=>void y({action:"login.cancel",loginId:e.pairing.id}),children:"取消配对"})]})]}):null,e?.message?(0,b.jsx)("p",{className:P.default.clawbotNote,role:"status",children:e.message}):null,e?.uncertain?(0,b.jsxs)("p",{className:P.default.clawbotNote,children:["有 ",e.uncertain," 条处理或发送结果待核对，请查看原会话；未自动重复执行。"]}):null,m?(0,b.jsx)("p",{className:P.default.clawbotError,role:"alert",children:m}):null,e?.paired?(0,b.jsxs)("details",{className:P.default.assistantDetails,children:[(0,b.jsx)("summary",{children:"连接说明与管理"}),(0,b.jsx)("p",{className:P.default.clawbotNote,children:"支持文字。私聊中发送 /会话、/切换 编号 或 /状态。需要审批时请回到电脑或小程序；小程序遥控开关不影响这里的接入。"}),(0,b.jsx)("button",{type:"button",className:P.default.secondaryButton,disabled:i||e.enabled,onClick:()=>{window.confirm("移除此节点保存的 ClawBot 绑定？这不会删除 DSH 会话，也不是腾讯账号端的撤销授权。"+(e.pending?`
仍有未完成的渠道消息：确认后停止这些消息的处理及续发；电脑上已开始的任务仍会继续，请到原会话核对结果。`:""))&&y({action:"disconnect",expectedRevision:e.revision,abandonPending:e.pending>0})},children:"移除本地绑定"})]}):null]})}var c=require("react/jsx-runtime");function Se({ok:a,busy:e=!1}){return(0,c.jsx)("span",{className:S.default.statusDot,"data-state":e?"busy":a?"ready":"off","aria-hidden":!0})}function se({title:a,detail:e,ok:t,busy:s=!1}){return(0,c.jsxs)("div",{className:S.default.capability,children:[(0,c.jsx)(Se,{ok:t,busy:s}),(0,c.jsxs)("div",{className:S.default.capabilityCopy,children:[(0,c.jsx)("strong",{children:a}),(0,c.jsx)("span",{children:e})]})]})}function ne({describeHost:a,callManagement:e,store:t=Z(a,e),assistants:s,clawbotCall:r}){let{loadState:l,qrState:d,status:i,runtime:u,host:m,localOrigin:v,qr:p,error:g}=(0,Y.useSyncExternalStore)(t.subscribe,t.getSnapshot,t.getSnapshot),{refresh:_,generateQr:k}=t,N=(0,Y.useId)(),H=i?.publicRelay,n=H?.state==="enrolling"||H?.state==="connecting",y=H?.remoteAccess?.status,U=H?.state==="online"&&y==="active",$=y==="suspended"?"账户公网访问已暂停":y==="expired"?"公网访问已到期":y==="not_entitled"?"请在小程序中使用自助开通方式":y!=="active"?"配对后由小程序账户决定":U?"可在外网安全连接":n?"正在准备远程连接":"暂时离线",C=u?.publicDoor??i?.gate?.publicDoor,A=l==="ready"&&!!i?.lan.ip&&C?.state==="listening",V=H?.enabled===!0&&H.state!=="disabled",O=i?.agent?.agentName||m?.agentName||"DeepSeek Harness",z=i?.agent?.hostName||m?.computerName||"当前电脑";return(0,c.jsxs)("section",{className:S.default.root,"aria-labelledby":N,children:[(0,c.jsxs)("div",{className:S.default.hero,children:[(0,c.jsxs)("div",{className:S.default.identity,children:[(0,c.jsx)("span",{className:S.default.mark,"aria-hidden":!0,children:(0,c.jsx)(Ce.FishLogo,{size:28})}),(0,c.jsxs)("div",{className:S.default.identityCopy,children:[(0,c.jsx)("h3",{id:N,children:"微信连接"}),(0,c.jsxs)("p",{children:[O,(0,c.jsx)("span",{"aria-hidden":!0,children:" · "}),z]})]})]}),(0,c.jsxs)("span",{className:S.default.overall,"data-ready":l==="ready",children:[(0,c.jsx)(Se,{ok:l==="ready",busy:l==="loading"}),l==="loading"?"检测中":l==="ready"?"服务正常":"暂不可用"]})]}),(0,c.jsxs)("div",{className:S.default.capabilities,children:[(0,c.jsx)(se,{title:"局域网直连",detail:l==="loading"?"检测中":A?"已就绪":"暂不可用",ok:A,busy:l==="loading"}),(0,c.jsx)(se,{title:"远程访问",detail:$,ok:U,busy:n||l==="loading"}),(0,c.jsx)(se,{title:"账号连接保护",detail:V?"已启用":"配对后启用",ok:V,busy:l==="loading"})]}),g!==null?(0,c.jsxs)("div",{className:S.default.notice,role:"status",children:[(0,c.jsx)("span",{children:g}),(0,c.jsx)("button",{type:"button",onClick:()=>void _(),children:"重试"})]}):null,d==="idle"?(0,c.jsxs)("div",{className:S.default.connectCard,children:[(0,c.jsxs)("div",{children:[(0,c.jsx)("strong",{children:"添加到微信"}),(0,c.jsx)("p",{children:"打开「Agent远程管理助手」→ 添加节点，扫描配对二维码。"})]}),(0,c.jsx)("button",{type:"button",className:S.default.primaryButton,disabled:l!=="ready",onClick:()=>void k(),children:"生成二维码"})]}):(0,c.jsxs)("div",{className:S.default.pairingCard,children:[(0,c.jsxs)("div",{className:S.default.pairingHead,children:[(0,c.jsxs)("div",{children:[(0,c.jsx)("strong",{children:"扫描二维码"}),(0,c.jsx)("p",{children:"小程序「设置 → 添加节点」"})]}),(0,c.jsx)("button",{type:"button",className:S.default.secondaryButton,disabled:d==="loading"||l!=="ready",onClick:()=>void k(),children:d==="loading"?"生成中…":"重新生成"})]}),(0,c.jsxs)("div",{className:S.default.qrArea,children:[l==="ready"&&d==="ready"&&p!==null?(0,c.jsx)("img",{className:S.default.qr,src:p.qrDataUrl,alt:"Agent远程管理助手配对二维码"}):(0,c.jsx)("div",{className:S.default.qrPlaceholder,"aria-live":"polite",children:l!=="ready"?"连接恢复后可查看二维码":d==="expired"?"二维码已过期，请重新生成":d==="error"?"生成失败":"正在生成…"}),d==="ready"&&p!==null?(0,c.jsxs)("small",{className:S.default.qrValidity,children:["有效至 ",new Date(p.expiresAt).toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"})," · 切换页面不重新生成"]}):null]}),(0,c.jsx)("p",{className:S.default.securityNote,children:p?.mode==="public-relay"?"配对后自动选择更快的连接；远程内容端到端加密。":"当前可通过同一局域网连接。"})]}),(0,c.jsxs)("section",{className:S.default.updateCard,"aria-label":"插件更新",children:[(0,c.jsx)("h3",{className:S.default.updateHeading,children:"插件更新"}),v&&t.updates?(0,c.jsx)(ve,{store:t.updates,embedded:!0}):null,u?.profileScope==="desktop"&&t.nativeUpdates?(0,c.jsx)(_e,{store:t.nativeUpdates,embedded:!0}):null,(0,c.jsx)(K,{describeHost:a,callManagement:e,store:t,compact:!0})]}),s?(0,c.jsx)(xe,{store:s}):null,r?(0,c.jsx)(ke,{call:r}):null]})}var ee=class{constructor(e,t){this.call=e;this.openSession=t}state={catalog:null,preview:null,busy:!1,message:"",error:""};listeners=new Set;epoch=0;disposed=!1;getSnapshot=()=>this.state;subscribe=e=>(this.listeners.add(e),()=>{this.listeners.delete(e)});set(e){if(!this.disposed){this.state={...this.state,...e};for(let t of this.listeners)t()}}reset=()=>{this.epoch++,this.set({catalog:null,preview:null,busy:!1,message:"",error:""})};dispose=()=>{this.reset(),this.disposed=!0,this.listeners.clear()};async run(e){if(this.disposed||this.state.busy)return;let t=this.epoch,s=()=>!this.disposed&&t===this.epoch;this.set({busy:!0,error:""});try{await e(s)}catch(r){s()&&this.set({error:r instanceof Error?r.message:"操作未完成，请核对状态"})}finally{s()&&this.set({busy:!1})}}async read(e){e()&&this.set({catalog:null});try{let t=await this.call("assistantCatalog",{});if(!e())return;if(t?.schema!=="human.assistants.catalog.v1"||!Array.isArray(t.templates)||!Array.isArray(t.drafts))throw new Error("助手目录格式不受支持");this.set({catalog:t})}catch(t){throw e()&&this.set({message:""}),t}}load=()=>this.run(e=>this.read(e));readyAssistant(e){let t=this.state.catalog?.drafts?.find(s=>s.presetId===e);if(!t||t.state!=="installed"||t.nativeState&&t.nativeState!=="installed")throw new Error("此助手已停用或尚未就绪，请核对下方组件开关。");return t}start=(e,t)=>this.run(async s=>{if(this.set({message:""}),await this.read(s),!(!s()||t?.aborted)){if(this.readyAssistant(e),!this.openSession)throw new Error("当前 DSH 未提供快捷入口，请在新会话中选择此助手模式。");await this.openSession(e,t)}});dismissPreview=()=>{this.state.busy||this.set({preview:null,message:""})};choose=e=>this.run(async t=>{if(this.set({preview:null,message:""}),this.state.catalog?.templates?.find(i=>i.id===e)?.builtin){await this.read(t),t()&&this.set({message:"此助手已包含在插件里，请在新会话中选择；无需另装独立包。"});return}let r=this.state.catalog?.drafts?.find(i=>i.templateId===e&&i.state==="draft");if(r){let i=await this.call("assistantPreview",{id:r.id,version:r.version});t()&&this.set({preview:i});return}let l=await this.call("assistantDraft",{templateId:e});if(!t()||(await this.read(t),!t()))return;let d=await this.call("assistantPreview",{id:l.id,version:l.version});t()&&this.set({preview:d})});preview=(e,t)=>this.run(async s=>{this.set({preview:null});let r=await this.call("assistantPreview",{id:e,version:t});s()&&this.set({preview:r})});reinstall=(e,t)=>this.run(async s=>{if(this.set({preview:null,message:""}),this.state.catalog?.drafts?.some(d=>d.id===e&&d.version===t&&d.replacement)){await this.read(s),s()&&this.set({message:"这个旧模式已有内置版本，请在新会话中选择对应助手，无需重新安装旧包。"});return}let r=await this.call("assistantDraft",{sourceId:e,sourceVersion:t});if(!s()||(await this.read(s),!s()))return;let l=await this.call("assistantPreview",{id:r.id,version:r.version});s()&&this.set({preview:l})});install=()=>this.run(async e=>{let t=this.state.preview;if(!t||t.expiresAt<=Date.now())throw new Error("请重新预览后确认安装");this.set({preview:null,message:"已提交原生安装，请等待结果。"});try{let s=await this.call("assistantInstall",{id:t.id,version:t.version,digest:t.digest,previewId:t.previewId});e()&&this.set({message:s.message||(s.state==="installed"?"原生预设已生效":"请核对原生安装状态")})}finally{e()&&await this.read(e)}});verify=(e,t)=>this.run(async s=>{this.set({catalog:null,message:""});let r=await this.call("assistantStatus",{id:e,version:t});s()&&(this.set({message:r.message||"状态已核对"}),await this.read(s))})};function Ne(a){let e=0,t=!1;return{reset(){e++,t=!1},async start(s,r){if(!/^[a-z][a-z0-9_-]{0,63}$/.test(s))throw new Error("助手身份无效");if(t||r?.aborted)return;let l=e,d=a("uiWorkspace"),i=a("slots"),u=a("configForms")?.developerTools?.enabled?.getSnapshot(),m=i?.entries?.("conversation.hero.agentPreset"),v=Array.isArray(m)&&m.length===1?m[0]:void 0;if(u!==!0||typeof d?.clearMain!="function"||v?.options?.locale!=="settings.agentPreset"||typeof v?.inject!="function")throw new Error("当前 DSH 尚未提供快捷入口，请在原生新会话中选择此助手模式。");let p=v.inject(void 0);if(typeof p?.load!="function"||typeof p?.select!="function"||typeof p?.hooks?.agentPresetSeat?.getSnapshot!="function")throw new Error("当前 DSH 的模式选择入口不兼容，请使用原生新会话入口。");let g=()=>l===e&&!r?.aborted;t=!0;try{if(await p.load(),!g())return;let _=i.entries("conversation.hero.agentPreset");if(!Array.isArray(_)||_.length!==1||_[0]!==v)throw new Error("DSH 的模式入口已更新，请重新点击开始使用。");let k=p.hooks.agentPresetSeat.getSnapshot();if(k.busy||k.error||!k.options?.some(H=>H.id===s))throw new Error("此助手尚未就绪，请刷新状态后重试。");if(a("configForms")?.developerTools?.enabled?.getSnapshot()!==!0)throw new Error("DSH 的工作模式选择已关闭，请在原生设置中开启后重试。");d.clearMain();let N=await p.select(s);if(g()&&N)throw new Error(N)}finally{l===e&&(t=!1)}}}}var qe=["slots","connection"];function Te(a){let e=async(p,g)=>{let _=await a.connection.rpc.call("/wechat-remote-management",p,g??{});if(!_.ok)throw Object.assign(new Error(_.error.message),{code:_.error.code});return _.value},t=async()=>{let p=await a.connection.rpc.call("/api","wechatHost/describe",{args:{request:{}}});if(!p.ok)throw new Error(`wechatHost/describe: ${p.error.code}`);let g=p.value;if(g?.ok!==!0||g.value===void 0)throw new Error("wechatHost/describe returned an invalid result");return g.value},s=new L(t,e),r=0,l=async p=>{let g=r,_=await a.connection.rpc.call("/api","wechatClawbot/control",{args:{request:p}});if(g!==r)throw new Error("节点连接已变化，请刷新 ClawBot 状态");if(!_.ok)throw new Error("ClawBot 组件暂不可用，请核对下方组件开关");let k=_.value;if(!k?.ok)throw new Error(k?.error?.message||"ClawBot 状态读取失败");return k.value},d=async(p,g)=>{let _=r,k=await a.connection.rpc.call("/api",`humanTools/${p}`,{args:{request:g}});if(_!==r)throw new Error("电脑连接已变化，请重新查看助手目录");if(!k.ok)throw new Error(k.error.message);let N=k.value;if(!N?.ok||typeof N.valueJson!="string"||N.valueJson.length>256*1024)throw new Error(N?.error?.message||"此节点尚未提供助手能力");return JSON.parse(N.valueJson)},i,u=new ee(d,async(p,g)=>{if(!i)throw new Error("原生会话入口尚未就绪，请稍后再试。");await i.start(p,g)});a.inject(["uiWorkspace","slots","configForms"],p=>{let g=Ne(_=>p.get(_));i=g,p.effect(()=>()=>{g.reset(),i===g&&(i=void 0)},"wechat assistant navigation")}),a.effect(()=>{let p=a.on("connection/reset",()=>{r++,i?.reset(),u.reset()});return()=>{r++,p(),u.dispose()}},"wechat assistant lifecycle"),a.effect(()=>()=>s.dispose(),"wechat shared page");let m=()=>me(p=>a.get(p)),v=()=>({describeHost:t,callManagement:e,store:s,assistants:u,clawbotCall:l});a.slots.inject("settings.section",()=>a.slots.register({name:"settings.section",id:"harness-remote",order:30,label:"微信连接",inject:v},ne));for(let p of["plugins.bundle.activation","plugins.bundle.config"])a.slots.inject(p,()=>{let g=["dsh-wechat-remote","@harness-remote/dsh-wechat-remote"].map(_=>a.slots.register({name:p,key:_,inject:v},p==="plugins.bundle.activation"?K:ne));return()=>g.forEach(_=>_())});a.inject(["pluginNavigation","remote.pluginManager"],()=>a.slots.inject("sidebar.footer.action",()=>a.slots.register({name:"sidebar.footer.action",id:"harness-remote",order:30,label:"微信连接",inject:()=>({openPlugin:m})},be)))}

return module.exports;}});
