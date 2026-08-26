window.__ModuleLoader__.load({id:"@harness-remote/dsh-wechat-remote",factory:(require)=>{var module={exports:{}};var exports=module.exports;"use strict";var O=Object.create;var _=Object.defineProperty;var U=Object.getOwnPropertyDescriptor;var X=Object.getOwnPropertyNames;var V=Object.getPrototypeOf,W=Object.prototype.hasOwnProperty;var F=(t,e)=>()=>(e||t((e={exports:{}}).exports,e),e.exports),T=(t,e)=>{for(var a in e)_(t,a,{get:e[a],enumerable:!0})},P=(t,e,a,o)=>{if(e&&typeof e=="object"||typeof e=="function")for(let d of X(e))!W.call(t,d)&&d!==a&&_(t,d,{get:()=>e[d],enumerable:!(o=U(e,d))||o.enumerable});return t};var K=(t,e,a)=>(a=t!=null?O(V(t)):{},P(e||!t||!t.__esModule?_(a,"default",{value:t,enumerable:!0}):a,t)),Y=t=>P(_({},"__esModule",{value:!0}),t);var I=F((on,z)=>{"use strict";var nn=`.hr_cd758f9_root {
  box-sizing: border-box;
  width: 100%;
  max-width: 760px;
  color: var(--dsw-alias-label-primary, #171a20);
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.hr_cd758f9_hero,
.hr_cd758f9_connectCard,
.hr_cd758f9_pairingCard {
  border: 1px solid var(--dsw-alias-border-l2, rgba(128, 140, 160, 0.22));
  background: var(--dsw-alias-bg-layer-3, #fff);
  border-radius: 12px;
}

.hr_cd758f9_hero {
  min-height: 72px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
  padding: 16px 18px;
}

.hr_cd758f9_identity {
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 12px;
}

.hr_cd758f9_mark {
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

.hr_cd758f9_identityCopy {
  min-width: 0;
}

.hr_cd758f9_identityCopy h3,
.hr_cd758f9_identityCopy p,
.hr_cd758f9_connectCard p,
.hr_cd758f9_pairingHead p,
.hr_cd758f9_securityNote {
  margin: 0;
}

.hr_cd758f9_identityCopy h3 {
  font-size: 15px;
  font-weight: 650;
  line-height: 22px;
}

.hr_cd758f9_identityCopy p {
  color: var(--dsw-alias-label-tertiary, #7d8492);
  font-size: 12px;
  line-height: 18px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.hr_cd758f9_overall {
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

.hr_cd758f9_overall[data-ready='true'] {
  color: var(--dsw-alias-state-success-primary, #1f9d68);
}

.hr_cd758f9_statusDot {
  width: 7px;
  height: 7px;
  background: var(--dsw-alias-label-tertiary, #8b93a2);
  border-radius: 999px;
  flex: none;
}

.hr_cd758f9_statusDot[data-state='ready'] {
  background: var(--dsw-alias-state-success-primary, #1f9d68);
}

.hr_cd758f9_statusDot[data-state='busy'] {
  background: var(--dsw-alias-state-business-primary, #4e79ff);
  animation: harnessRemotePulse 1.2s ease-in-out infinite;
}

.hr_cd758f9_capabilities {
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
  display: grid;
}

.hr_cd758f9_capability {
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

.hr_cd758f9_capability > .hr_cd758f9_statusDot {
  margin-top: 6px;
}

.hr_cd758f9_capabilityCopy {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.hr_cd758f9_capabilityCopy strong {
  font-size: 12.5px;
  font-weight: 600;
  line-height: 19px;
}

.hr_cd758f9_capabilityCopy span {
  color: var(--dsw-alias-label-tertiary, #7d8492);
  font-size: 11px;
  line-height: 17px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.hr_cd758f9_notice {
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

.hr_cd758f9_notice button,
.hr_cd758f9_secondaryButton {
  border: 1px solid var(--dsw-alias-border-l2, rgba(128, 140, 160, 0.28));
  color: var(--dsw-alias-label-primary, #171a20);
  background: var(--dsw-alias-bg-layer-1, #f5f6f8);
  border-radius: 7px;
  font: inherit;
  cursor: pointer;
}

.hr_cd758f9_notice button {
  flex: none;
  padding: 3px 9px;
}

.hr_cd758f9_connectCard {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
  padding: 18px;
}

.hr_cd758f9_connectCard strong,
.hr_cd758f9_pairingHead strong {
  font-size: 14px;
  font-weight: 650;
  line-height: 21px;
}

.hr_cd758f9_connectCard p,
.hr_cd758f9_pairingHead p {
  max-width: 470px;
  color: var(--dsw-alias-label-tertiary, #7d8492);
  font-size: 12px;
  line-height: 18px;
}

.hr_cd758f9_primaryButton {
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

.hr_cd758f9_primaryButton:hover {
  filter: brightness(1.04);
}

.hr_cd758f9_primaryButton:focus-visible,
.hr_cd758f9_secondaryButton:focus-visible,
.hr_cd758f9_notice button:focus-visible {
  outline: 2px solid var(--dsw-alias-state-business-primary, #4e79ff);
  outline-offset: 2px;
}

.hr_cd758f9_pairingCard {
  padding: 18px;
}

.hr_cd758f9_pairingHead {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}

.hr_cd758f9_secondaryButton {
  min-height: 32px;
  flex: none;
  padding: 0 11px;
  font-size: 12px;
}

.hr_cd758f9_secondaryButton:disabled {
  cursor: default;
  opacity: 0.55;
}

.hr_cd758f9_qrArea {
  min-height: 236px;
  margin-top: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 24px;
}

.hr_cd758f9_qr,
.hr_cd758f9_qrPlaceholder {
  box-sizing: border-box;
  width: 224px;
  height: 224px;
  border-radius: 12px;
}

.hr_cd758f9_qr {
  background: #fff;
  padding: 8px;
}

.hr_cd758f9_qrPlaceholder {
  color: var(--dsw-alias-label-tertiary, #7d8492);
  background: var(--dsw-alias-bg-layer-1, #f5f6f8);
  border: 1px dashed var(--dsw-alias-border-l2, rgba(128, 140, 160, 0.28));
  display: grid;
  place-items: center;
  font-size: 12px;
}

.hr_cd758f9_qrMeta {
  min-width: 150px;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 5px;
}

.hr_cd758f9_qrMeta span,
.hr_cd758f9_qrMeta small {
  color: var(--dsw-alias-label-tertiary, #7d8492);
  font-size: 11px;
  line-height: 17px;
}

.hr_cd758f9_qrMeta code {
  color: var(--dsw-alias-state-business-primary, #4e79ff);
  font-family: var(--ds-font-family-code, ui-monospace, monospace);
  font-size: 16px;
  letter-spacing: 2px;
}

.hr_cd758f9_securityNote {
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
  .hr_cd758f9_statusDot[data-state='busy'] {
    animation: none;
  }
}

@media (max-width: 680px) {
  .hr_cd758f9_capabilities {
    grid-template-columns: minmax(0, 1fr);
  }

  .hr_cd758f9_connectCard {
    align-items: stretch;
    flex-direction: column;
  }

  .hr_cd758f9_primaryButton {
    width: 100%;
  }

  .hr_cd758f9_qrArea {
    flex-direction: column;
    gap: 12px;
  }

  .hr_cd758f9_qrMeta {
    align-items: center;
  }
}
`,B="@harness-remote/dsh-wechat-remote/HarnessRemoteSettings.module.css";if(typeof document<"u"&&document.querySelector("style[data-plugin-css="+JSON.stringify(B)+"]")===null){let t=document.createElement("style");t.dataset.plugin="@harness-remote/dsh-wechat-remote",t.dataset.pluginCss=B,t.textContent=nn,document.head.appendChild(t)}z.exports={root:"hr_cd758f9_root",hero:"hr_cd758f9_hero",connectCard:"hr_cd758f9_connectCard",pairingCard:"hr_cd758f9_pairingCard",identity:"hr_cd758f9_identity",mark:"hr_cd758f9_mark",identityCopy:"hr_cd758f9_identityCopy",pairingHead:"hr_cd758f9_pairingHead",securityNote:"hr_cd758f9_securityNote",overall:"hr_cd758f9_overall",statusDot:"hr_cd758f9_statusDot",capabilities:"hr_cd758f9_capabilities",capability:"hr_cd758f9_capability",capabilityCopy:"hr_cd758f9_capabilityCopy",notice:"hr_cd758f9_notice",secondaryButton:"hr_cd758f9_secondaryButton",primaryButton:"hr_cd758f9_primaryButton",qrArea:"hr_cd758f9_qrArea",qr:"hr_cd758f9_qr",qrPlaceholder:"hr_cd758f9_qrPlaceholder",qrMeta:"hr_cd758f9_qrMeta"}});var an={};T(an,{apply:()=>tn,inject:()=>en});module.exports=Y(an);var s=require("react"),r=K(I(),1),n=require("react/jsx-runtime"),E="http://127.0.0.1:3093";function j({ok:t,busy:e=!1}){return(0,n.jsx)("span",{className:r.default.statusDot,"data-state":e?"busy":t?"ready":"off","aria-hidden":!0})}function x({title:t,detail:e,ok:a,busy:o=!1}){return(0,n.jsxs)("div",{className:r.default.capability,children:[(0,n.jsx)(j,{ok:a,busy:o}),(0,n.jsxs)("div",{className:r.default.capabilityCopy,children:[(0,n.jsx)("strong",{children:t}),(0,n.jsx)("span",{children:e})]})]})}async function G(t){try{let e=await t(),a=e.gate;return!a||!Number.isSafeInteger(a.localDoor.port)?{origin:E,runtime:null,host:e}:{origin:`http://127.0.0.1:${a.localDoor.port}`,runtime:a,host:e}}catch{return{origin:E,runtime:null,host:null}}}function M({describeHost:t}){let[e,a]=(0,s.useState)("loading"),[o,d]=(0,s.useState)("idle"),[p,v]=(0,s.useState)(null),[A,h]=(0,s.useState)(null),[w,C]=(0,s.useState)(null),[f,R]=(0,s.useState)(null),[H,m]=(0,s.useState)(null),l=(0,s.useRef)(!0),g=(0,s.useCallback)(async()=>{try{let i=await G(t);if(!l.current)return;if(h(i.runtime),C(i.host),i.runtime!==null&&i.runtime.localDoor.state!=="listening")throw new Error("local-door-unavailable");let c=await fetch(`${i.origin}/gate/status`);if(!c.ok)throw new Error(`gate/status ${c.status}`);let u=await c.json();if(!l.current)return;v(u),h(u.gate??i.runtime),a("ready"),m(null)}catch{if(!l.current)return;a("error"),m("连接服务暂未就绪。请确认 DSH 正在运行，然后重试。")}},[t]),N=(0,s.useCallback)(async()=>{d("loading"),m(null);try{let i=await G(t);if(!l.current)return;if(h(i.runtime),C(i.host),i.runtime!==null&&i.runtime.localDoor.state!=="listening")throw new Error("local-door-unavailable");let[c,u]=await Promise.all([fetch(`${i.origin}/pair/code`),fetch(`${i.origin}/gate/status`)]);if(!c.ok)throw new Error(`pair/code ${c.status}`);let J=await c.json();if(!l.current)return;if(R(J),d("ready"),u.ok){let S=await u.json();v(S),h(S.gate??i.runtime),a("ready")}}catch{if(!l.current)return;R(null),d("error"),m("暂时无法生成配对码，请稍后重试。")}},[t]);(0,s.useEffect)(()=>{l.current=!0,g();let i=window.setInterval(()=>void g(),3e4);return()=>{l.current=!1,window.clearInterval(i)}},[g]);let y=p?.publicRelay,k=y?.state==="enrolling"||y?.state==="connecting",b=y?.state==="online",L=b?"可在外网安全连接":k?"正在准备远程连接":y?.enabled?"暂时离线":"未启用",Z=A?.localDoor??p?.gate?.localDoor,D=e==="ready"&&!!p?.lan.ip&&Z?.state==="listening",q=b||p?.wechat.configured===!0,$=p?.agent?.agentName||w?.agentName||"DeepSeek Harness",Q=p?.agent?.hostName||w?.computerName||"当前电脑";return(0,n.jsxs)("section",{className:r.default.root,"aria-labelledby":"harness-remote-title",children:[(0,n.jsxs)("div",{className:r.default.hero,children:[(0,n.jsxs)("div",{className:r.default.identity,children:[(0,n.jsx)("span",{className:r.default.mark,"aria-hidden":!0,children:(0,n.jsx)("svg",{viewBox:"0 0 24 24",width:"22",height:"22",children:(0,n.jsx)("path",{fill:"currentColor",d:"M4 4h6v6H4V4Zm10 0h6v6h-6V4ZM4 14h6v6H4v-6Zm10 0h3v3h-3v-3Zm3 3h3v3h-3v-3Zm-3 3h3v-3h-3v3Zm6-6v3h-3v-3h3Z"})})}),(0,n.jsxs)("div",{className:r.default.identityCopy,children:[(0,n.jsx)("h3",{id:"harness-remote-title",children:"鲸常在"}),(0,n.jsxs)("p",{children:[$,(0,n.jsx)("span",{"aria-hidden":!0,children:" · "}),Q]})]})]}),(0,n.jsxs)("span",{className:r.default.overall,"data-ready":e==="ready",children:[(0,n.jsx)(j,{ok:e==="ready",busy:e==="loading"}),e==="loading"?"检测中":e==="ready"?"服务正常":"暂不可用"]})]}),(0,n.jsxs)("div",{className:r.default.capabilities,children:[(0,n.jsx)(x,{title:"局域网直连",detail:e==="loading"?"检测中":D?"已就绪":"暂不可用",ok:D,busy:e==="loading"}),(0,n.jsx)(x,{title:"远程访问",detail:L,ok:b,busy:k||e==="loading"}),(0,n.jsx)(x,{title:"微信账号保护",detail:q?"已启用":"配对后启用",ok:q,busy:e==="loading"})]}),H!==null?(0,n.jsxs)("div",{className:r.default.notice,role:"status",children:[(0,n.jsx)("span",{children:H}),(0,n.jsx)("button",{type:"button",onClick:()=>void g(),children:"重试"})]}):null,o==="idle"?(0,n.jsxs)("div",{className:r.default.connectCard,children:[(0,n.jsxs)("div",{children:[(0,n.jsx)("strong",{children:"添加到微信"}),(0,n.jsx)("p",{children:"打开「鲸常在」小程序，扫描一次即可绑定这台电脑。"})]}),(0,n.jsx)("button",{type:"button",className:r.default.primaryButton,onClick:()=>void N(),children:"生成配对码"})]}):(0,n.jsxs)("div",{className:r.default.pairingCard,children:[(0,n.jsxs)("div",{className:r.default.pairingHead,children:[(0,n.jsxs)("div",{children:[(0,n.jsx)("strong",{children:"扫描二维码"}),(0,n.jsx)("p",{children:"小程序「设置 → 添加节点」"})]}),(0,n.jsx)("button",{type:"button",className:r.default.secondaryButton,disabled:o==="loading",onClick:()=>void N(),children:o==="loading"?"生成中…":"重新生成"})]}),(0,n.jsxs)("div",{className:r.default.qrArea,children:[o==="ready"&&f!==null?(0,n.jsx)("img",{className:r.default.qr,src:f.qrDataUrl,alt:"鲸常在配对二维码"}):(0,n.jsx)("div",{className:r.default.qrPlaceholder,"aria-live":"polite",children:o==="error"?"生成失败":"正在生成…"}),o==="ready"&&f!==null?(0,n.jsxs)("div",{className:r.default.qrMeta,children:[(0,n.jsx)("span",{children:"配对码"}),(0,n.jsx)("code",{children:f.code}),(0,n.jsx)("small",{children:"15 分钟内有效"})]}):null]}),(0,n.jsx)("p",{className:r.default.securityNote,children:f?.mode==="public-relay"?"配对后自动选择更快的连接；远程内容端到端加密。":"当前可通过同一局域网连接。"})]})]})}var en=["slots","connection"];function tn(t){let e=async()=>{let a=await t.connection.rpc.call("/api","wechatHost/describe",{args:{request:{}}});if(!a.ok)throw new Error(`wechatHost/describe: ${a.error.code}`);let o=a.value;if(o?.ok!==!0||o.value===void 0)throw new Error("wechatHost/describe returned an invalid result");return o.value};t.slots.inject("settings.section",()=>t.slots.register({name:"settings.section",id:"harness-remote",order:30,label:"微信连接",inject:()=>({describeHost:e})},M))}

return module.exports;}});
