window.__ModuleLoader__.load({
	id: "@harness-remote/dsh-wechat-remote",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let react = require("react");
		let react_jsx_runtime = require("react/jsx-runtime");
		//#region \0dsh-css:E:\dsh-source\packages\client\ui-pairing\src\client\PairingButton.module.css.mjs
		const css = "._6cAPfa_button{width:100%;color:inherit;cursor:pointer;font:inherit;background:0 0;border:none;border-radius:10px;align-items:center;gap:8px;padding:8px 10px;display:flex}._6cAPfa_button:hover{background:#808ca024}._6cAPfa_buttonLabel{font-size:13px;font-weight:500}._6cAPfa_mask{z-index:1000;background:#04060c8c;justify-content:center;align-items:center;display:flex;position:fixed;inset:0}._6cAPfa_modal{background:var(--ds-color-surface-raised,#101625);color:#e8ecf4;text-align:center;border:1px solid #808ca040;border-radius:18px;max-width:92vw;padding:20px 24px}._6cAPfa_head{justify-content:space-between;align-items:center;margin-bottom:6px;display:flex}._6cAPfa_head h3{color:#e8ecf4;margin:0;font-size:16px}._6cAPfa_close{color:#e8ecf4;cursor:pointer;opacity:.7;background:0 0;border:none;font-size:14px}._6cAPfa_close:hover{opacity:1}._6cAPfa_hint{color:#9aa4b8;margin:0 0 10px;font-size:12px}._6cAPfa_qr{background:#fff;border-radius:12px;width:224px;height:224px;padding:8px}._6cAPfa_code{color:#9aa4b8;margin:8px 0 0;font-size:12px}._6cAPfa_code code{color:#7aa2ff;letter-spacing:2px}._6cAPfa_err{color:#e58f8f;font-size:12px}._6cAPfa_channels{text-align:left;flex-direction:column;gap:6px;margin-top:12px;display:flex}._6cAPfa_channel{align-items:center;gap:8px;font-size:12.5px;display:flex}._6cAPfa_dotOk{background:#3ecf8e;border-radius:50%;flex:none;width:8px;height:8px}._6cAPfa_dotOff{background:#6b7385;border-radius:50%;flex:none;width:8px;height:8px}._6cAPfa_channelLabel{color:#e8ecf4;flex:none;font-weight:600}._6cAPfa_channelDetail{color:#9aa4b8;text-overflow:ellipsis;white-space:nowrap;overflow:hidden}._6cAPfa_footnote{color:#6b7385;margin:10px 0 0;font-size:11px}[class*=_root]:not([class*=_collapsed]) [class*=_footArea]{flex-direction:row;align-items:center;gap:6px}[class*=_root]:not([class*=_collapsed]) [class*=_settingsArea]{order:1;flex:1;width:auto}[class*=_root]:not([class*=_collapsed]) [class*=_footerActions]{order:2;width:auto}";
		const tagId = "@harness-remote/dsh-wechat-remote/PairingButton.module.css";
		if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId) + "]") === null) {
			const tag = document.createElement("style");
			tag.dataset.plugin = "@harness-remote/dsh-wechat-remote";
			tag.dataset.pluginCss = tagId;
			tag.textContent = css;
			document.head.appendChild(tag);
		}
		var PairingButton_module_css_default = {
			"button": "_6cAPfa_button",
			"buttonLabel": "_6cAPfa_buttonLabel",
			"modal": "_6cAPfa_modal",
			"head": "_6cAPfa_head",
			"hint": "_6cAPfa_hint",
			"qr": "_6cAPfa_qr",
			"err": "_6cAPfa_err",
			"channelDetail": "_6cAPfa_channelDetail",
			"footnote": "_6cAPfa_footnote",
			"mask": "_6cAPfa_mask",
			"channels": "_6cAPfa_channels",
			"dotOff": "_6cAPfa_dotOff",
			"channelLabel": "_6cAPfa_channelLabel",
			"code": "_6cAPfa_code",
			"dotOk": "_6cAPfa_dotOk",
			"channel": "_6cAPfa_channel",
			"close": "_6cAPfa_close"
		};
		//#endregion
		//#region src/client/PairingButton.tsx
		/**
		* Pairing action UI: the sidebar foot button (icon in the rail, full row
		* when wide) and its modal. The modal shows the one-time QR code plus the
		* two-channel connectivity status (LAN / Tailscale Funnel), fetched from the
		* gate's same-origin endpoints (/pair/code, /gate/status).
		*/
		const QR_ICON = /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("svg", {
			width: "18",
			height: "18",
			viewBox: "0 0 24 24",
			fill: "currentColor",
			"aria-hidden": true,
			children: [
				/* @__PURE__ */ (0, react_jsx_runtime.jsx)("rect", {
					x: "3",
					y: "3",
					width: "7",
					height: "7",
					rx: "1"
				}),
				/* @__PURE__ */ (0, react_jsx_runtime.jsx)("rect", {
					x: "14",
					y: "3",
					width: "7",
					height: "7",
					rx: "1"
				}),
				/* @__PURE__ */ (0, react_jsx_runtime.jsx)("rect", {
					x: "3",
					y: "14",
					width: "7",
					height: "7",
					rx: "1"
				}),
				/* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", { d: "M14 14h3v3h-3zM17 17h4v4h-4zM14 21h3v-3h-3z" }),
				/* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", { d: "M21 14v3h-3v-3z" })
			]
		});
		function ChannelRow({ label, detail, ok }) {
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: PairingButton_module_css_default.channel,
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						className: ok ? PairingButton_module_css_default.dotOk : PairingButton_module_css_default.dotOff,
						"aria-hidden": true
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						className: PairingButton_module_css_default.channelLabel,
						children: label
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						className: PairingButton_module_css_default.channelDetail,
						children: detail
					})
				]
			});
		}
		function PairingButton({ wide }) {
			const [open, setOpen] = (0, react.useState)(false);
			const [qr, setQr] = (0, react.useState)(null);
			const [status, setStatus] = (0, react.useState)(null);
			const [error, setError] = (0, react.useState)(null);
			const timer = (0, react.useRef)(null);
			const refresh = async () => {
				try {
					const codeRes = await fetch("http://127.0.0.1:3093/pair/code");
					if (!codeRes.ok) throw new Error(`pair/code ${codeRes.status}`);
					setQr(await codeRes.json());
					setError(null);
				} catch (err) {
					setError("获取配对码失败：门卫服务未运行？");
				}
				try {
					const statusRes = await fetch("http://127.0.0.1:3093/gate/status");
					if (statusRes.ok) setStatus(await statusRes.json());
				} catch {}
			};
			(0, react.useEffect)(() => {
				if (!open) return;
				refresh();
				timer.current = window.setInterval(() => void refresh(), 3e4);
				return () => {
					if (timer.current !== null) window.clearInterval(timer.current);
					timer.current = null;
				};
			}, [open]);
			const lanDetail = status === null ? "检测中…" : `http://${status.lan.ip}:${status.lan.port}`;
			const tailscaleDetail = (() => {
				if (status === null) return "检测中…";
				const ts = status.tailscale;
				if (!ts.installed) return "未安装 Tailscale";
				if (!ts.loggedIn) return "未登录 Tailscale";
				if (status.funnel.enabled && status.funnel.url) return status.funnel.url;
				if (ts.ip) return `Tailscale ${ts.ip}`;
				return "已登录（未开启 Funnel）";
			})();
			const wechatDetail = (() => {
				if (status === null) return "检测中…";
				const w = status.wechat || {};
				if (!w.configured) return "开发态身份（电脑未配置 appid/secret）";
				return "已绑定 " + (w.bindings || 0) + " 个微信账号（真实 openid）";
			})();
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
				type: "button",
				className: PairingButton_module_css_default.button,
				title: "扫码连接微信（Harness Remote）",
				onClick: () => setOpen(true),
				children: [QR_ICON, wide ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
					className: PairingButton_module_css_default.buttonLabel,
					children: "微信连接"
				}) : null]
			}), open ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				className: PairingButton_module_css_default.mask,
				onClick: (event) => {
					if (event.target === event.currentTarget) setOpen(false);
				},
				children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: PairingButton_module_css_default.modal,
					role: "dialog",
					"aria-modal": true,
					children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: PairingButton_module_css_default.head,
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h3", { children: "扫码连接微信" }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								className: PairingButton_module_css_default.close,
								onClick: () => setOpen(false),
								"aria-label": "关闭",
								children: "✕"
							})]
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
							className: PairingButton_module_css_default.hint,
							children: "打开微信小程序「Harness Remote」→ 点「扫码配对」扫此二维码"
						}),
						qr !== null && error === null ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("img", {
							className: PairingButton_module_css_default.qr,
							src: qr.qrDataUrl,
							alt: "配对二维码"
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("p", {
							className: PairingButton_module_css_default.code,
							children: ["配对码：", /* @__PURE__ */ (0, react_jsx_runtime.jsx)("code", { children: qr.code })]
						})] }) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
							className: PairingButton_module_css_default.err,
							children: error ?? "加载中…"
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: PairingButton_module_css_default.channels,
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(ChannelRow, {
								label: "局域网",
								detail: lanDetail,
								ok: status !== null && status.lan.ip.length > 0
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(ChannelRow, {
								label: "公网",
								detail: tailscaleDetail,
								ok: status !== null && status.funnel.enabled && status.funnel.url !== null
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(ChannelRow, {
								label: "微信身份",
								detail: wechatDetail,
								ok: status !== null && status.wechat && status.wechat.bindings > 0
							})]
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
							className: PairingButton_module_css_default.footnote,
							children: "二维码 15 分钟内有效，扫码成功后自动刷新"
						})
					]
				})
			}) : null] });
		}
		//#endregion
		//#region src/client/index.ts
		/** Required services for the slot registration. */
		const inject = ["slots"];
		/**
		* Client plugin body: registers the pairing action into the footer slot.
		* @param ctx - client root context.
		*/
		function apply(ctx) {
			ctx.slots.inject("sidebar.footer.action", () => ctx.slots.register({
				name: "sidebar.footer.action",
				id: "wechat-pairing",
				order: 30
			}, PairingButton));
		}
		//#endregion
		exports.PairingButton = PairingButton;
		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});

//# sourceMappingURL=client.js.map