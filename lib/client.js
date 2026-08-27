window.__ModuleLoader__.load({id:"@harness-remote/dsh-wechat-remote",factory:(require)=>{var module={exports:{}};var exports=module.exports;"use strict";var X=Object.create;var x=Object.defineProperty;var F=Object.getOwnPropertyDescriptor;var W=Object.getOwnPropertyNames;var K=Object.getPrototypeOf,V=Object.prototype.hasOwnProperty;var Y=(t,e)=>()=>(e||t((e={exports:{}}).exports,e),e.exports),Z=(t,e)=>{for(var r in e)x(t,r,{get:e[r],enumerable:!0})},z=(t,e,r,o)=>{if(e&&typeof e=="object"||typeof e=="function")for(let d of W(e))!V.call(t,d)&&d!==r&&x(t,d,{get:()=>e[d],enumerable:!(o=F(e,d))||o.enumerable});return t};var nn=(t,e,r)=>(r=t!=null?X(K(t)):{},z(e||!t||!t.__esModule?x(r,"default",{value:t,enumerable:!0}):r,t)),en=t=>z(x({},"__esModule",{value:!0}),t);var I=Y((dn,A)=>{"use strict";var tn=`.hr_7ff90d1_root {
  box-sizing: border-box;
  width: 100%;
  max-width: 760px;
  color: var(--dsw-alias-label-primary, #171a20);
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.hr_7ff90d1_hero,
.hr_7ff90d1_connectCard,
.hr_7ff90d1_pairingCard {
  border: 1px solid var(--dsw-alias-border-l2, rgba(128, 140, 160, 0.22));
  background: var(--dsw-alias-bg-layer-3, #fff);
  border-radius: 12px;
}

.hr_7ff90d1_hero {
  min-height: 72px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
  padding: 16px 18px;
}

.hr_7ff90d1_identity {
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 12px;
}

.hr_7ff90d1_mark {
  width: 42px;
  height: 42px;
  color: var(--dsw-alias-label-primary, #171a20);
  background: var(--dsw-alias-bg-layer-1, #f5f6f8);
  border: 1px solid var(--dsw-alias-border-l2, rgba(128, 140, 160, 0.22));
  border-radius: 11px;
  flex: none;
  display: grid;
  place-items: center;
}

.hr_7ff90d1_identityCopy {
  min-width: 0;
}

.hr_7ff90d1_identityCopy h3,
.hr_7ff90d1_identityCopy p,
.hr_7ff90d1_connectCard p,
.hr_7ff90d1_pairingHead p,
.hr_7ff90d1_securityNote {
  margin: 0;
}

.hr_7ff90d1_identityCopy h3 {
  font-size: 15px;
  font-weight: 650;
  line-height: 22px;
}

.hr_7ff90d1_identityCopy p {
  color: var(--dsw-alias-label-tertiary, #7d8492);
  font-size: 12px;
  line-height: 18px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.hr_7ff90d1_overall {
  min-height: 28px;
  color: var(--dsw-alias-label-secondary, #4d5564);
  background: var(--dsw-alias-bg-layer-1, #f5f6f8);
  border-radius: 999px;
  flex: none;
  display: inline-flex;
  align-items: center;
  gap: 7px;
  padding: 0 10px;
  font-size: 12px;
}

.hr_7ff90d1_overall[data-ready='true'] {
  color: var(--dsw-alias-state-success-primary, #1f9d68);
}

.hr_7ff90d1_statusDot {
  width: 7px;
  height: 7px;
  background: var(--dsw-alias-label-tertiary, #8b93a2);
  border-radius: 999px;
  flex: none;
}

.hr_7ff90d1_statusDot[data-state='ready'] {
  background: var(--dsw-alias-state-success-primary, #1f9d68);
}

.hr_7ff90d1_statusDot[data-state='busy'] {
  background: var(--dsw-alias-state-business-primary, #4e79ff);
  animation: harnessRemotePulse 1.2s ease-in-out infinite;
}

.hr_7ff90d1_capabilities {
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
  display: grid;
}

.hr_7ff90d1_capability {
  min-width: 0;
  min-height: 58px;
  border: 1px solid var(--dsw-alias-border-l2, rgba(128, 140, 160, 0.22));
  background: var(--dsw-alias-bg-layer-3, #fff);
  border-radius: 10px;
  display: flex;
  align-items: flex-start;
  gap: 9px;
  padding: 11px 12px;
}

.hr_7ff90d1_capability > .hr_7ff90d1_statusDot {
  margin-top: 6px;
}

.hr_7ff90d1_capabilityCopy {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.hr_7ff90d1_capabilityCopy strong {
  font-size: 12.5px;
  font-weight: 600;
  line-height: 19px;
}

.hr_7ff90d1_capabilityCopy span {
  color: var(--dsw-alias-label-tertiary, #7d8492);
  font-size: 11px;
  line-height: 17px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.hr_7ff90d1_notice {
  color: var(--dsw-alias-state-error-primary, #d34e4e);
  background: color-mix(in srgb, var(--dsw-alias-state-error-primary, #d34e4e) 7%, transparent);
  border: 1px solid color-mix(in srgb, var(--dsw-alias-state-error-primary, #d34e4e) 25%, transparent);
  border-radius: 9px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 9px 12px;
  font-size: 12px;
  line-height: 18px;
}

.hr_7ff90d1_notice button,
.hr_7ff90d1_secondaryButton {
  border: 1px solid var(--dsw-alias-border-l2, rgba(128, 140, 160, 0.28));
  color: var(--dsw-alias-label-primary, #171a20);
  background: var(--dsw-alias-bg-layer-1, #f5f6f8);
  border-radius: 7px;
  font: inherit;
  cursor: pointer;
}

.hr_7ff90d1_notice button {
  flex: none;
  padding: 3px 9px;
}

.hr_7ff90d1_connectCard {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
  padding: 18px;
}

.hr_7ff90d1_connectCard strong,
.hr_7ff90d1_pairingHead strong {
  font-size: 14px;
  font-weight: 650;
  line-height: 21px;
}

.hr_7ff90d1_connectCard p,
.hr_7ff90d1_pairingHead p {
  max-width: 470px;
  color: var(--dsw-alias-label-tertiary, #7d8492);
  font-size: 12px;
  line-height: 18px;
}

.hr_7ff90d1_primaryButton {
  min-height: 36px;
  border: 0;
  color: #fff;
  background: var(--dsw-alias-state-business-primary, #4e79ff);
  border-radius: 8px;
  flex: none;
  padding: 0 16px;
  font: inherit;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
}

.hr_7ff90d1_primaryButton:hover {
  filter: brightness(1.04);
}

.hr_7ff90d1_primaryButton:focus-visible,
.hr_7ff90d1_secondaryButton:focus-visible,
.hr_7ff90d1_notice button:focus-visible {
  outline: 2px solid var(--dsw-alias-state-business-primary, #4e79ff);
  outline-offset: 2px;
}

.hr_7ff90d1_pairingCard {
  padding: 18px;
}

.hr_7ff90d1_pairingHead {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}

.hr_7ff90d1_secondaryButton {
  min-height: 32px;
  flex: none;
  padding: 0 11px;
  font-size: 12px;
}

.hr_7ff90d1_secondaryButton:disabled {
  cursor: default;
  opacity: 0.55;
}

.hr_7ff90d1_qrArea {
  min-height: 292px;
  margin-top: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 24px;
}

.hr_7ff90d1_qr,
.hr_7ff90d1_qrPlaceholder {
  box-sizing: border-box;
  width: 280px;
  height: 280px;
  border-radius: 12px;
}

.hr_7ff90d1_qr {
  background: #fff;
  padding: 10px;
  image-rendering: pixelated;
}

.hr_7ff90d1_qrPlaceholder {
  color: var(--dsw-alias-label-tertiary, #7d8492);
  background: var(--dsw-alias-bg-layer-1, #f5f6f8);
  border: 1px dashed var(--dsw-alias-border-l2, rgba(128, 140, 160, 0.28));
  display: grid;
  place-items: center;
  font-size: 12px;
}

.hr_7ff90d1_qrMeta {
  min-width: 150px;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 5px;
}

.hr_7ff90d1_qrMeta span,
.hr_7ff90d1_qrMeta small {
  color: var(--dsw-alias-label-tertiary, #7d8492);
  font-size: 11px;
  line-height: 17px;
}

.hr_7ff90d1_qrMeta code {
  color: var(--dsw-alias-state-business-primary, #4e79ff);
  font-family: var(--ds-font-family-code, ui-monospace, monospace);
  font-size: 16px;
  letter-spacing: 2px;
}

.hr_7ff90d1_securityNote {
  color: var(--dsw-alias-label-tertiary, #7d8492);
  border-top: 1px solid var(--dsw-alias-border-l2, rgba(128, 140, 160, 0.18));
  padding-top: 12px;
  text-align: center;
  font-size: 11px;
  line-height: 17px;
}

@keyframes harnessRemotePulse {
  0%,
  100% {
    opacity: 0.45;
  }
  50% {
    opacity: 1;
  }
}

@media (prefers-reduced-motion: reduce) {
  .hr_7ff90d1_statusDot[data-state='busy'] {
    animation: none;
  }
}

@media (max-width: 680px) {
  .hr_7ff90d1_capabilities {
    grid-template-columns: minmax(0, 1fr);
  }

  .hr_7ff90d1_connectCard {
    align-items: stretch;
    flex-direction: column;
  }

  .hr_7ff90d1_primaryButton {
    width: 100%;
  }

  .hr_7ff90d1_qrArea {
    flex-direction: column;
    gap: 12px;
  }

  .hr_7ff90d1_qrMeta {
    align-items: center;
  }
}
`,B="@harness-remote/dsh-wechat-remote/HarnessRemoteSettings.module.css";if(typeof document<"u"&&document.querySelector("style[data-plugin-css="+JSON.stringify(B)+"]")===null){let t=document.createElement("style");t.dataset.plugin="@harness-remote/dsh-wechat-remote",t.dataset.pluginCss=B,t.textContent=tn,document.head.appendChild(t)}A.exports={root:"hr_7ff90d1_root",hero:"hr_7ff90d1_hero",connectCard:"hr_7ff90d1_connectCard",pairingCard:"hr_7ff90d1_pairingCard",identity:"hr_7ff90d1_identity",mark:"hr_7ff90d1_mark",identityCopy:"hr_7ff90d1_identityCopy",pairingHead:"hr_7ff90d1_pairingHead",securityNote:"hr_7ff90d1_securityNote",overall:"hr_7ff90d1_overall",statusDot:"hr_7ff90d1_statusDot",capabilities:"hr_7ff90d1_capabilities",capability:"hr_7ff90d1_capability",capabilityCopy:"hr_7ff90d1_capabilityCopy",notice:"hr_7ff90d1_notice",secondaryButton:"hr_7ff90d1_secondaryButton",primaryButton:"hr_7ff90d1_primaryButton",qrArea:"hr_7ff90d1_qrArea",qr:"hr_7ff90d1_qr",qrPlaceholder:"hr_7ff90d1_qrPlaceholder",qrMeta:"hr_7ff90d1_qrMeta"}});var on={};Z(on,{apply:()=>an,inject:()=>rn});module.exports=en(on);var s=require("react"),j=require("@deepseek-ai/dsh-client-ui-primitives"),a=nn(I(),1),n=require("react/jsx-runtime"),E="http://127.0.0.1:3093";function M({ok:t,busy:e=!1}){return(0,n.jsx)("span",{className:a.default.statusDot,"data-state":e?"busy":t?"ready":"off","aria-hidden":!0})}function w({title:t,detail:e,ok:r,busy:o=!1}){return(0,n.jsxs)("div",{className:a.default.capability,children:[(0,n.jsx)(M,{ok:r,busy:o}),(0,n.jsxs)("div",{className:a.default.capabilityCopy,children:[(0,n.jsx)("strong",{children:t}),(0,n.jsx)("span",{children:e})]})]})}async function G(t){try{let e=await t(),r=e.gate;return!r||!Number.isSafeInteger(r.localDoor.port)?{origin:E,runtime:null,host:e}:{origin:`http://127.0.0.1:${r.localDoor.port}`,runtime:r,host:e}}catch{return{origin:E,runtime:null,host:null}}}function L({describeHost:t}){let[e,r]=(0,s.useState)("loading"),[o,d]=(0,s.useState)("idle"),[f,C]=(0,s.useState)(null),[$,m]=(0,s.useState)(null),[R,H]=(0,s.useState)(null),[c,N]=(0,s.useState)(null),[k,g]=(0,s.useState)(null),p=(0,s.useRef)(!0),y=(0,s.useCallback)(async()=>{try{let i=await G(t);if(!p.current)return;if(m(i.runtime),H(i.host),i.runtime!==null&&i.runtime.localDoor.state!=="listening")throw new Error("local-door-unavailable");let l=await fetch(`${i.origin}/gate/status`);if(!l.ok)throw new Error(`gate/status ${l.status}`);let h=await l.json();if(!p.current)return;C(h),m(h.gate??i.runtime),r("ready"),g(null)}catch{if(!p.current)return;r("error"),g("连接服务暂未就绪。请确认 DSH 正在运行，然后重试。")}},[t]),_=(0,s.useCallback)(async()=>{d("loading"),g(null);try{let i=await G(t);if(!p.current)return;if(m(i.runtime),H(i.host),i.runtime!==null&&i.runtime.localDoor.state!=="listening")throw new Error("local-door-unavailable");let[l,h]=await Promise.all([fetch(`${i.origin}/pair/code`),fetch(`${i.origin}/gate/status`)]);if(!l.ok)throw new Error(`pair/code ${l.status}`);let T=await l.json();if(!p.current)return;if(N(T),d("ready"),h.ok){let P=await h.json();C(P),m(P.gate??i.runtime),r("ready")}}catch{if(!p.current)return;N(null),d("error"),g("暂时无法生成配对码，请稍后重试。")}},[t]);(0,s.useEffect)(()=>{p.current=!0,y();let i=window.setInterval(()=>void y(),3e4);return()=>{p.current=!1,window.clearInterval(i)}},[y]),(0,s.useEffect)(()=>{if(o!=="ready"||!c?.expiresAt)return;let i=Math.max(1e3,c.expiresAt-Date.now()-6e4),l=window.setTimeout(()=>void _(),i);return()=>window.clearTimeout(l)},[_,c?.expiresAt,o]);let b=f?.publicRelay,D=b?.state==="enrolling"||b?.state==="connecting",u=b?.remoteAccess?.status,v=b?.state==="online"&&u==="active",Q=u==="suspended"?"账户公网访问已暂停":u==="pending"?"体验申请审核中":u==="expired"?"公网访问已到期":u==="not_entitled"?"请在小程序中申请体验":u!=="active"?"配对后由小程序账户决定":v?"可在外网安全连接":D?"正在准备远程连接":"暂时离线",J=$?.localDoor??f?.gate?.localDoor,S=e==="ready"&&!!f?.lan.ip&&J?.state==="listening",q=v||f?.wechat.configured===!0,O=f?.agent?.agentName||R?.agentName||"DeepSeek Harness",U=f?.agent?.hostName||R?.computerName||"当前电脑";return(0,n.jsxs)("section",{className:a.default.root,"aria-labelledby":"harness-remote-title",children:[(0,n.jsxs)("div",{className:a.default.hero,children:[(0,n.jsxs)("div",{className:a.default.identity,children:[(0,n.jsx)("span",{className:a.default.mark,"aria-hidden":!0,children:(0,n.jsx)(j.FishLogo,{size:28})}),(0,n.jsxs)("div",{className:a.default.identityCopy,children:[(0,n.jsx)("h3",{id:"harness-remote-title",children:"鲸常在"}),(0,n.jsxs)("p",{children:[O,(0,n.jsx)("span",{"aria-hidden":!0,children:" · "}),U]})]})]}),(0,n.jsxs)("span",{className:a.default.overall,"data-ready":e==="ready",children:[(0,n.jsx)(M,{ok:e==="ready",busy:e==="loading"}),e==="loading"?"检测中":e==="ready"?"服务正常":"暂不可用"]})]}),(0,n.jsxs)("div",{className:a.default.capabilities,children:[(0,n.jsx)(w,{title:"局域网直连",detail:e==="loading"?"检测中":S?"已就绪":"暂不可用",ok:S,busy:e==="loading"}),(0,n.jsx)(w,{title:"远程访问",detail:Q,ok:v,busy:D||e==="loading"}),(0,n.jsx)(w,{title:"微信账号保护",detail:q?"已启用":"配对后启用",ok:q,busy:e==="loading"})]}),k!==null?(0,n.jsxs)("div",{className:a.default.notice,role:"status",children:[(0,n.jsx)("span",{children:k}),(0,n.jsx)("button",{type:"button",onClick:()=>void y(),children:"重试"})]}):null,o==="idle"?(0,n.jsxs)("div",{className:a.default.connectCard,children:[(0,n.jsxs)("div",{children:[(0,n.jsx)("strong",{children:"添加到微信"}),(0,n.jsx)("p",{children:"打开「鲸常在」→ 添加节点，扫描配对码。"})]}),(0,n.jsx)("button",{type:"button",className:a.default.primaryButton,onClick:()=>void _(),children:"生成配对码"})]}):(0,n.jsxs)("div",{className:a.default.pairingCard,children:[(0,n.jsxs)("div",{className:a.default.pairingHead,children:[(0,n.jsxs)("div",{children:[(0,n.jsx)("strong",{children:"扫描二维码"}),(0,n.jsx)("p",{children:"小程序「设置 → 添加节点」"})]}),(0,n.jsx)("button",{type:"button",className:a.default.secondaryButton,disabled:o==="loading",onClick:()=>void _(),children:o==="loading"?"生成中…":"重新生成"})]}),(0,n.jsxs)("div",{className:a.default.qrArea,children:[o==="ready"&&c!==null?(0,n.jsx)("img",{className:a.default.qr,src:c.qrDataUrl,alt:"鲸常在配对二维码"}):(0,n.jsx)("div",{className:a.default.qrPlaceholder,"aria-live":"polite",children:o==="error"?"生成失败":"正在生成…"}),o==="ready"&&c!==null?(0,n.jsxs)("div",{className:a.default.qrMeta,children:[(0,n.jsx)("span",{children:"配对码"}),(0,n.jsx)("code",{children:c.code}),(0,n.jsx)("small",{children:"15 分钟内有效"})]}):null]}),(0,n.jsx)("p",{className:a.default.securityNote,children:c?.mode==="public-relay"?"配对后自动选择更快的连接；远程内容端到端加密。":"当前可通过同一局域网连接。"})]})]})}var rn=["slots","connection"];function an(t){let e=async()=>{let r=await t.connection.rpc.call("/api","wechatHost/describe",{args:{request:{}}});if(!r.ok)throw new Error(`wechatHost/describe: ${r.error.code}`);let o=r.value;if(o?.ok!==!0||o.value===void 0)throw new Error("wechatHost/describe returned an invalid result");return o.value};t.slots.inject("settings.section",()=>t.slots.register({name:"settings.section",id:"harness-remote",order:30,label:"微信连接",inject:()=>({describeHost:e})},L))}

return module.exports;}});
