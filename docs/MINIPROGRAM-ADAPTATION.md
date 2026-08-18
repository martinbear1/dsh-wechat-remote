# 微信小程序端适配清单（v1.0.0 插件）

> 本清单列的是**小程序代码工程（`E:\Deepseek Harness`）需要修改的全部位置**，
> 由小程序侧开发者执行。插件的协议除下列几处外与旧网关完全一致。

## 必改（不改正则无法连上新插件）

### 1. 端口：3090 → 3092，3091 → 3093

新插件为与 iOS 插件共存，采用独立端口。全局搜索 `3090`、`3091`，核对以下位置：

| 位置 | 改动 |
|---|---|
| `utils/request.js`（或任何构造 base URL 的地方） | 默认/手动配置的端口 `3090` → `3092` |
| `utils/store.js` 手动配置的默认 host/port 与帮助文案 | 同上 |
| `pages/settings/*` 手动配置表单的端口默认值、占位符、示例文案 | 同上 |
| 任何硬编码的 `:3090` / `:3091` 字符串 | 核对后替换 |

> 注意：**二维码载荷里的 `port` 字段不用改** —— 它来自电脑端插件的二维码
> （`/pair/code` 返回 `port: 3092`），扫码后自动生效。只有「手动输入/默认值」
> 的地方需要动。

### 2. `/pair/verify-wechat` 响应升级（凭证滚动）

`utils/pair.js` 的 `verifyWechatBinding()` 现在有三种返回，必须处理：

```js
// 1. 配置了真实 appid/secret 且绑定有效（新行为）：
{ valid: true, token: '<轮换后的新 token>' }
//    → 必须立刻用新 token 覆盖存储里的旧 token（旧 token 已作废！）
// 2. 开发态（未配置 gate-wechat.json，无 token 字段）：
{ valid: true, dev: true }
//    → 保持现有 token 不变（旧行为，兼容）
// 3. 身份不匹配：
{ valid: false }
//    → 现有「重新配对」处理不变
```

即：`verifyWechatBinding` 成功且返回里带 `token` 字段时，调用 `request.setToken()`
并持久化到 storage，再继续连接；`dev: true` 时不替换。

### 3. 防火墙放行新端口（真机验证前）

Windows 防火墙若已为 3090 建立过入站规则，需**新增 3092** 的放行规则
（插件不会自动开墙）。

## 建议改（文案与体验）

| 位置 | 改动 |
|---|---|
| `pages/settings/*` 配对帮助文案 | 「手机/iOS 共用二维码」等旧说法 → 微信版说明（电脑侧边栏按钮现在叫**「微信连接」**） |
| `README.md` | 端口表 3090/3091 → 3092/3093；电脑端按钮名称「手机连接」→「微信连接」 |
| 安装指引文案 | 电脑端安装命令改为：`dsh plugin --profile web add github:martinbear1/dsh-wechat-remote#v1.0.0` |

## 不用改的（协议保持兼容）

- `/api/*` RPC 信封、`/api/events.mux` + `/api/events.host` WebSocket 事件流
- `/pair/claim-wechat` 请求/响应（`{code, jsCode}` → `{token, openId}`）
- 二维码载荷结构 `{code, host, port, funnelUrl?}`
- `ENABLE_FUNNEL` 公网预留字段

## 验证路径

1. **开发态**（电脑未配 `gate-wechat.json`）：模拟器全流程 —— 扫码配对 →
   连接 → 重启小程序 → verify 返回 `{valid:true, dev:true}` → 正常连接。
2. **真实身份**（电脑配好 `gate-wechat.json`，appid=你注册的小程序，
   secret 从 mp.weixin.qq.com 获取）：真机配对后，每次启动 verify 都会返回
   新 token —— 确认小程序换 token 后连接不中断，且旧 token 立即失效。
3. 真机需：同 Wi-Fi + 防火墙放行 3092 + 开发者工具关闭域名校验（开发期）。
