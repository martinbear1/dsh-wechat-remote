# Harness Remote 微信版（DSH 插件）

让**微信小程序**安全接入电脑上的 DeepSeek Harness：电脑安装本插件后，用微信扫一扫
完成「**微信用户 ↔ DSH**」一对一身份绑定，之后在微信里即可实时控制 DSH
（局域网直连；公网通道预留，暂不暴露）。

> 纯插件实现：不改动 DeepSeek Harness 的任何官方代码，卸载即还原。
> 与 iOS 版插件（`martinbear1/dsh-harness-remote`，端口 3090/3091）**完全独立、
> 可同时安装共存**。

## 特性

- **微信身份认证**：扫码配对时用 `wx.login` 的 jsCode 经微信 `code2session`
  解析出 **openid**，与 token 一对一绑定；**每次启动都用新的 jsCode 复核身份**，
  复核成功即**轮换 token**（旧凭证立即作废，泄露窗口 = 一次会话）
- **零成本登录**：用户不用记密码、不用填任何东西 —— 微信登录态即身份
- **开发态降级**：电脑上未配置微信 appid/secret 时自动降级为开发态身份
  （功能全通，配好 `gate-wechat.json` 后自动启用真实 openid 绑定）
- **双门安全**（与 iOS 插件同款防线）：
  - 公网门 `0.0.0.0:3092` —— 除 `POST /pair/claim-wechat` 外一律要求 Bearer token
  - 本地门 `127.0.0.1:3093` —— 配对二维码 / 状态，仅本机可访问
  - 每 IP 限速（429）、常数时间 token 比较、凭据文件 0600 + Windows icacls 收紧、
    CORS 仅放行官方 UI
- **透明反向代理**：验过 token 即转发到官方 `127.0.0.1:3080`（Host 重写走官方
  栅栏合法通道），自动 gzip
- **随 DSH 生死**：无独立进程、无自启动项；访问日志 `~/.dsh/wechat-gate-access.log`

## 系统要求

| 依赖 | 说明 |
|---|---|
| DeepSeek Harness | ≥ 0.1.0-rc.7（`dsh` 命令可用） |
| git | 安装插件时用到 |
| 微信小程序 | 你已注册的小程序（个人主体即可；`wx.login` 可用） |
| Tailscale（可选） | 仅当未来启用公网通道 |

## 安装（一条命令）

```bash
dsh plugin --profile web add github:martinbear1/dsh-wechat-remote#v1.0.0
```

然后**重启 DSH**，打开 `http://127.0.0.1:3080`，侧边栏底部出现
**「微信连接」** 按钮即安装成功。

> 其他 profile 同样适用：把 `--profile web` 换成你的 profile 名。

## 使用

1. 电脑上打开 `http://127.0.0.1:3080` → 点侧边栏底部「微信连接」→ 弹出二维码
2. 微信小程序「Harness Remote」→ 设置 → **扫码配对** → 扫电脑上的二维码
   → 自动完成 openid 绑定与登录
3. 之后每次打开小程序即自动复核身份并连接（局域网）

### 启用真实微信身份（可选但推荐）

在电脑上创建 `%USERPROFILE%\.dsh\gate-wechat.json`（权限会自动收紧为仅属主可读）：

```json
{ "appid": "你的小程序AppID", "secret": "你的小程序AppSecret" }
```

重启 DSH 后生效。未配置时功能全通，但身份层降级为开发态
（verify 不再轮换 token）。

## 端口约定（与 iOS 插件共存）

| 端口 | 用途 | 归属 |
|---|---|---|
| 3080 | DeepSeek Harness 官方 Web | 官方（不变） |
| 3090 / 3091 | iOS 版插件（公网门 / 本地门） | iOS 插件（若安装） |
| **3092** | **微信版公网门**（API + 配对认领） | 本插件，token 必填 |
| **3093** | **微信版配对二维码 + 状态** | 本插件，仅本机 |

环境变量覆盖：`WECHAT_GATE_PORT` / `WECHAT_GATE_LOCAL_PORT`。

## 安全模型

- 官方 DSH 本身**没有认证层**（其 `/api` 栅栏是防浏览器劫持的信任边界，
  官方源码明言 "this fence is not an auth layer"）；本插件补上认证层并保持
  官方栅栏全程生效
- **微信 openid 绑定**：凭证不再是可无限复制的无主字符串 —— 攻击者即使偷到
  token，也无法通过下一次启动的身份复核；可随时按 openid 解绑
- **凭证滚动**：每次启动复核成功即轮换 token，旧 token 立即作废
- 配对码：一次性、15 分钟过期、最多 5 次尝试 + 每 IP 限速
- 局域网明文 HTTP 提示：介意可用 SSH 隧道（官方对齐路径）或等公网通道
- 公网（预留）：二维码载荷与小程序配置保留 `funnelUrl` 字段；小程序发布版
  真机必须 HTTPS + 备案域名反代

## 小程序端适配

本插件协议与旧网关高度兼容，但端口和 verify 响应有变化 —— 见
[docs/MINIPROGRAM-ADAPTATION.md](docs/MINIPROGRAM-ADAPTATION.md)
（**由小程序侧开发者按其修改，插件侧不动小程序代码**）。

## 常见问题

**Q：配对失败？** 二维码 15 分钟有效且一次性；扫码后若提示微信身份解析失败，
确认电脑能访问 api.weixin.qq.com，或先不配 `gate-wechat.json` 走开发态。

**Q：想换微信账号 / 解绑？** 停 DSH → 删除 `~/.dsh/gate-wechat-state.json` →
重启 DSH → 重新扫码配对。

**Q：和 iOS 插件同时装会冲突吗？** 不会：两插件端口（3090/3091 vs 3092/3093）
与状态文件相互独立；Web UI 侧边栏会同时出现「手机连接」与「微信连接」两个按钮。

**Q：如何卸载？**
```bash
dsh plugin --profile web remove @harness-remote/dsh-wechat-remote
```
重启 DSH 即完全移除。

## 仓库结构

```
dsh-plugin-wechat/
├── lib/                 # 产物（直接安装即用）
│   ├── index.js         #   微信认证网关宿主插件（随 DSH 进程加载）
│   ├── client.js        #   微信连接按钮客户端插件（浏览器加载）
│   └── types/           #   类型声明
├── src/                 # 参考源码（配对按钮 UI）
├── scripts/verify.mjs   # 制品一致性守卫（发布前必跑）
├── docs/                # 设计讨论 + 小程序端适配清单
├── cordis.patch.yml     # bundle 补丁：向插件图插入本包
└── package.json         # 单包三角色：bundle + 宿主插件 + 客户端插件
```

## 从源码重建（维护者）

客户端产物（`lib/client.js`）使用 DeepSeek Harness 官方客户端工具链构建，
**预设 id 参数必须等于包名**：

```bash
clientBundle('@harness-remote/dsh-wechat-remote', ['lib/types/index.js'])
```

⚠️ 注册 id 与包名不一致会直接导致 Web UI 报 "Failed to load plugins"
（iOS 插件 v1.0.1 的事故即源于此）。改完产物先跑 `node scripts/verify.mjs`。

## License

MIT
