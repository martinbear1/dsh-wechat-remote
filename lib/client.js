window.__ModuleLoader__.load({
	id: "@harness-remote/dsh-wechat-remote",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let react = require("react");
		let react_jsx_runtime = require("react/jsx-runtime");
		//#region \0dsh-css:E:\Deepseek Harness Public Connectivity Research\dsh-plugin-wechat\.client-build\src\client\PairingButton.module.css.mjs
		const css = ".uz21Xa_button{width:100%;color:inherit;cursor:pointer;font:inherit;background:0 0;border:none;border-radius:10px;align-items:center;gap:8px;padding:8px 10px;display:flex}.uz21Xa_button:hover{background:#808ca024}.uz21Xa_buttonLabel{font-size:13px;font-weight:500}.uz21Xa_mask{z-index:1000;background:#04060c8c;justify-content:center;align-items:center;display:flex;position:fixed;inset:0}.uz21Xa_modal{background:var(--ds-color-surface-raised,#101625);color:#e8ecf4;text-align:center;border:1px solid #808ca040;border-radius:18px;max-width:92vw;padding:20px 24px}.uz21Xa_head{justify-content:space-between;align-items:center;margin-bottom:6px;display:flex}.uz21Xa_head h3{color:#e8ecf4;margin:0;font-size:16px}.uz21Xa_close{color:#e8ecf4;cursor:pointer;opacity:.7;background:0 0;border:none;font-size:14px}.uz21Xa_close:hover{opacity:1}.uz21Xa_hint{color:#9aa4b8;margin:0 0 10px;font-size:12px}.uz21Xa_qr{background:#fff;border-radius:12px;width:224px;height:224px;padding:8px}.uz21Xa_code{color:#9aa4b8;margin:8px 0 0;font-size:12px}.uz21Xa_code code{color:#7aa2ff;letter-spacing:2px}.uz21Xa_err{color:#e58f8f;font-size:12px}.uz21Xa_channels{text-align:left;flex-direction:column;gap:6px;margin-top:12px;display:flex}.uz21Xa_channel{align-items:center;gap:8px;font-size:12.5px;display:flex}.uz21Xa_dotOk{background:#3ecf8e;border-radius:50%;flex:none;width:8px;height:8px}.uz21Xa_dotOff{background:#6b7385;border-radius:50%;flex:none;width:8px;height:8px}.uz21Xa_channelLabel{color:#e8ecf4;flex:none;font-weight:600}.uz21Xa_channelDetail{color:#9aa4b8;text-overflow:ellipsis;white-space:nowrap;overflow:hidden}.uz21Xa_footnote{color:#6b7385;margin:10px 0 0;font-size:11px}";
		const tagId = "@harness-remote/dsh-wechat-remote/PairingButton.module.css";
		if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId) + "]") === null) {
			const tag = document.createElement("style");
			tag.dataset.plugin = "@harness-remote/dsh-wechat-remote";
			tag.dataset.pluginCss = tagId;
			tag.textContent = css;
			document.head.appendChild(tag);
		}
		var PairingButton_module_css_default = {
			"head": "uz21Xa_head",
			"modal": "uz21Xa_modal",
			"qr": "uz21Xa_qr",
			"channel": "uz21Xa_channel",
			"mask": "uz21Xa_mask",
			"channelDetail": "uz21Xa_channelDetail",
			"code": "uz21Xa_code",
			"buttonLabel": "uz21Xa_buttonLabel",
			"hint": "uz21Xa_hint",
			"channels": "uz21Xa_channels",
			"dotOff": "uz21Xa_dotOff",
			"footnote": "uz21Xa_footnote",
			"close": "uz21Xa_close",
			"dotOk": "uz21Xa_dotOk",
			"channelLabel": "uz21Xa_channelLabel",
			"err": "uz21Xa_err",
			"button": "uz21Xa_button"
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
			const [runtime, setRuntime] = (0, react.useState)(null);
			const [error, setError] = (0, react.useState)(null);
			const timer = (0, react.useRef)(null);
			const refresh = async () => {
				let localOrigin = "http://127.0.0.1:3093";
				let discovered = false;
				try {
					const rpcId = `wechat-pairing-${Date.now().toString(36)}`;
					const describeRes = await fetch("/api/wechatHost.describe", {
						method: "POST",
						headers: { "content-type": "application/json" },
						body: JSON.stringify({
							type: "client-request",
							rpcId,
							method: "wechatHost.describe",
							payload: {}
						})
					});
					if (describeRes.ok) {
						const envelope = await describeRes.json();
						const gate = envelope.result?.ok === true ? envelope.result.value?.gate : void 0;
						if (gate && Number.isSafeInteger(gate.localDoor.port)) {
							discovered = true;
							setRuntime(gate);
							localOrigin = `http://127.0.0.1:${gate.localDoor.port}`;
							if (gate.localDoor.state !== "listening") {
								setQr(null);
								setStatus(null);
								setError(gate.localDoor.message || `本机配对门 ${gate.localDoor.port} 尚未就绪`);
								return;
							}
						}
					}
				} catch {}
				try {
					const codeRes = await fetch(`${localOrigin}/pair/code`);
					if (!codeRes.ok) throw new Error(`pair/code ${codeRes.status}`);
					const code = await codeRes.json();
					setQr(code);
					if (!discovered && code.profileScope) setRuntime((previous) => previous || {
						profileScope: code.profileScope || "web",
						source: "legacy-default",
						publicDoor: {
							bind: "0.0.0.0",
							port: code.port,
							state: "listening",
							errorCode: null,
							message: null
						},
						localDoor: {
							bind: "127.0.0.1",
							port: code.localPort || 3093,
							state: "listening",
							errorCode: null,
							message: null
						}
					});
					setError(null);
				} catch (err) {
					setQr(null);
					setError(`获取配对码失败：本机配对门 ${localOrigin.replace("http://127.0.0.1:", "")} 不可用`);
				}
				try {
					const statusRes = await fetch(`${localOrigin}/gate/status`);
					if (statusRes.ok) {
						const nextStatus = await statusRes.json();
						setStatus(nextStatus);
						if (nextStatus.gate) setRuntime(nextStatus.gate);
					}
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
			const publicDoor = runtime?.publicDoor || status?.gate?.publicDoor;
			const lanDetail = publicDoor?.state === "unavailable" ? publicDoor.message || `局域网门 ${publicDoor.port} 不可用` : status === null ? "检测中…" : `http://${status.lan.ip}:${status.lan.port}`;
			const localDetail = runtime === null ? "检测中…" : `http://127.0.0.1:${runtime.localDoor.port} · ${runtime.profileScope}`;
			const publicDetail = (() => {
				if (status === null) return "检测中…";
				const relay = status.publicRelay || {
					enabled: false,
					state: "disabled"
				};
				if (!relay.enabled) return "未启用（当前二维码仅供局域网）";
				if (relay.state === "online") return relay.relayOrigin || "端到端加密中继已在线";
				if (relay.state === "enrolling") return "正在注册电脑 Agent 身份…";
				if (relay.state === "connecting") return "正在连接加密中继…";
				return relay.lastError ? `离线：${relay.lastError}` : "公网 Agent 离线";
			})();
			const wechatDetail = (() => {
				if (status === null) return "检测中…";
				if (status.publicRelay?.enabled) return "扫码时由云端 wx.login 真实校验；电脑不保存 AppSecret";
				const w = status.wechat || {
					configured: false,
					bindings: 0
				};
				if (!w.configured) return "局域网旧模式尚未配置微信身份校验";
				return `局域网已绑定 ${w.bindings} 个微信账号`;
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
							children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)(ChannelRow, {
									label: "局域网",
									detail: lanDetail,
									ok: status !== null && status.lan.ip.length > 0 && publicDoor?.state !== "unavailable"
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)(ChannelRow, {
									label: "本机配对门",
									detail: localDetail,
									ok: runtime?.localDoor.state === "listening"
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)(ChannelRow, {
									label: "公网",
									detail: publicDetail,
									ok: status !== null && status.publicRelay?.state === "online"
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)(ChannelRow, {
									label: "微信身份",
									detail: wechatDetail,
									ok: status !== null && status.wechat && status.wechat.bindings > 0
								})
							]
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
							className: PairingButton_module_css_default.footnote,
							children: qr?.mode === "public-relay" ? "公网流量端到端加密；中继无法读取 DSH 内容" : "二维码 15 分钟内有效，扫码成功后自动刷新"
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
