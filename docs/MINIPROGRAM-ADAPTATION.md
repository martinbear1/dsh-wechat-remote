# 微信小程序端适配清单（v1.0.1 · 已逐文件核实）

> 本清单基于对小程序的**逐文件阅读**（app.js / utils/request.js / utils/store.js /
> utils/pair.js / pages/settings/settings.js），由小程序侧开发者执行。
> 插件侧不修改小程序代码。

## 结论先行：端口零改动 ✅

全工程 **没有任何硬编码的 3090/3091**。baseUrl 由二维码载荷构建：

```js
// pages/settings/settings.js:151
bases.push('http://' + payload.host + ':' + payload.port)
```

新插件的二维码载荷自动带 `port: 3092`（`/pair/code` 返回），扫码路径**自动适配**。
手动配置（settings.js:199-214）是整串 URL 输入，也不含端口默认值。

**唯一例外**：已配对过的老用户，其本地存储
（`harness-remote-config-v1`）里可能存着 `:3090` 的旧 baseUrl —— 建议在启动时
检测：若 `config.baseUrl` 含 `:3090`，提示「请重新扫码配对」或自动替换为 `:3092`
后重连（二选一，写进初始化页设计即可）。

## 必改 1：`verify-wechat` 响应升级（凭证滚动）

现状：verify 只在设置页的手动按钮触发（settings.js:190-195），
`pair.verifyWechatBinding()`（pair.js:76-80）只返回 boolean；
启动流程（store.bootstrap → connect）不校验身份。

新协议下 verify 有三种返回，必须全部处理：

```js
{ valid: true, token: '<新token>' }  // 真实身份模式，绑定有效 → 旧 token 已作废
{ valid: true, dev: true }           // 开发态（电脑未配 gate-wechat.json）→ token 不变
{ valid: false }                     // 身份不匹配 → 需重新配对
```

改动点：

1. **utils/pair.js** `verifyWechatBinding()`：改为返回完整结果
   （`{ valid, token?, dev? }`），不再只返回 boolean。
2. **pages/settings/settings.js** `onVerifyBinding()`：若返回带 `token` 字段 ——
   用 `store.loadConfig()` 读出配置 → 替换 `cfg.token` → `store.saveConfig(cfg)` →
   `request.configure(当前baseUrl, 新token)` → toast 提示「校验通过（凭证已轮换）」。
   `dev: true` 时维持现状。
3. **启动自动复核（建议实现，安全性的核心）**：在 `store.connect()` 成功建立连接
   之后（此时旧 token 仍有效、WebSocket 已握手），异步调用
   `pair.verifyWechatBinding()`：
   - `dev: true` → 跳过；
   - `valid: false` → 置 `state.lastError = '微信身份校验失败，请重新扫码配对'`；
   - `token` 存在 → 同上替换并持久化（**轮换成功后旧 token 立即失效**，
     已建立的 WebSocket 不受影响，后续 HTTP 请求用新 token；下次启动直接用新 token）。
   注意顺序：**先连后验**（连接前验证会因旧 token 已被上轮轮换而 401）。

## 必改 2：电脑端配置真实微信身份（用户文档）

电脑上创建 `%USERPROFILE%\.dsh\gate-wechat.json`：

```json
{ "appid": "wxaf6cee80f99753bc", "secret": "从小程序后台获取的 AppSecret" }
```

重启 DSH 后生效：配对即绑定真实 openid、每次启动复核 + 轮换。
未配置时功能全通（开发态：verify 返回 `dev:true`、不轮换）。

## 建议改：文案

| 位置 | 内容 |
|---|---|
| 设置页/README | 电脑端侧边栏按钮名称：「手机连接」→「**微信连接**」 |
| 配对说明 | 电脑端安装命令：`dsh plugin --profile web add github:martinbear1/dsh-wechat-remote#v1.0.1` |
| 防火墙说明 | 无需手动开墙（Node 程序级规则覆盖所有端口）；真机连不上时再查 docs |

## 不用改的（协议保持兼容）

`/api/*` RPC 信封、WebSocket 双流（events.mux / events.host）、
`/pair/claim-wechat` 请求/响应、二维码载荷结构 `{code, host, port, funnelUrl?}`、
`ENABLE_FUNNEL` 公网预留开关。

## 验证路径

1. **开发态**：模拟器（域名校验关闭）→ 设置 → 扫码配对（或手动输入配对码）→
   连接成功；重启小程序 → 手动「身份复核」返回 `dev:true`。
2. **真实身份**：电脑配好 gate-wechat.json + 重启 DSH → 真机（同 Wi-Fi）扫码 →
   配对成功；每次启动自动复核 + token 轮换，连接不断、旧 token 作废。
3. 模拟器没有摄像头：**手动输入 8 位配对码是开发期硬需求**（电脑端弹窗与
   `http://127.0.0.1:3093/pair` 页面均显示配对码）。
