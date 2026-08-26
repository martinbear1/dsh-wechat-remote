# Harness Remote 微信版（DSH 插件）

让**微信小程序**安全接入电脑上的 DeepSeek Harness：电脑安装本插件后，用微信扫一扫
完成「**微信用户 ↔ DSH**」一对一身份绑定，之后在微信里即可实时控制 DSH
（同一次扫码同时配置局域网直连和端到端加密公网中继，客户端按网络自动择优）。

> 纯插件实现：不改动 DeepSeek Harness 的任何官方代码，卸载即还原。

## 特性

- **微信身份认证**：公网扫码时由开发者云端用 `wx.login` 临时代码调用
  `code2session`，只保存 OpenID 的不可逆 subject；15 分钟短期客户端令牌不落盘
- **零成本登录**：用户不用记密码、不用填任何东西 —— 微信登录态即身份
- **公网真实身份**：AppSecret 只保存在开发者云端；电脑和小程序都不保存 OpenID、
  session_key 或 AppSecret，云端只保存 OpenID 的不可逆 HMAC 标识
- **公网端到端加密**：二维码钉扎 Ed25519 Agent 身份，每次连接使用临时 X25519 与
  XSalsa20-Poly1305；中继服务器只能路由密文
- **低延迟历史传输**：电脑先按 DSH 原生历史语义补齐轮次并压缩；小型压缩窗口直接
  复用端到端加密实时通道，大型窗口才端侧加密到私有 OSS。微信使用原生文件解压，
  对象层异常只回退一份紧凑历史，不影响 WebUI
- **一次扫码双路线**：默认连接产品官方中继，同时携带局域网路线；手机无论在 Wi-Fi
  还是移动网络扫码，之后都可在局域网直连与公网中继之间自动切换
- **只出不进**：电脑仅主动连接官方中继的 443，不开放公网端口，也不改变 DSH/WebUI；
  需要纯局域网时可在本机配置中明确关闭公网
- **双门安全边界**：
  - `web/default` profile 的局域网门继续使用 `0.0.0.0:3092`，兼容所有旧安装
  - `web/default` profile 的本地门继续使用 `127.0.0.1:3093`，配对二维码仅本机可访问
  - 同机其他 DSH profile 自动使用稳定的高位端口对，避免争抢 3092/3093
  - 每 IP 限速（429）、常数时间 token 比较、凭据文件 0600 + Windows icacls 收紧、
    CORS 仅放行官方 UI
- **透明反向代理**：验过 token 即转发到官方 `127.0.0.1:3080`（Host 重写走官方
  栅栏合法通道），自动 gzip
- **小程序专用电脑目录服务**：通过 DSH 标准 Typert Remote 契约提供
  `wechatDirectory/roots|list|create`；真实枚举本地盘与映射网络盘，不替换 WebUI
  的官方 `directory-picker-auto`，选定路径后仍由小程序调用官方 `workspace.create`。
  映射网络盘的枚举/新建运行于可终止子进程并设 6.5 秒硬超时，离线盘不会拖住 DSH
- **随 DSH 生死**：无独立进程、无自启动项；访问日志 `~/.dsh/wechat-gate-access.log`

## 系统要求

| 依赖 | 说明 |
|---|---|
| DeepSeek Harness | ≥ 0.1.0-rc.7（`dsh` 命令可用） |
| git | 安装插件时用到（Windows 需装 Git for Windows；macOS 使用系统 Git） |
| Node/npm | DSH 已依赖 Node；统一安装命令会临时提供官方 CLI 所需的 pnpm，不要求全局安装 |
| 微信小程序 | 你已注册的小程序（个人主体即可；`wx.login` 可用） |
| 公网服务 | 产品默认使用运营方提供的已备案 HTTPS/WSS 中继；用户电脑不开放公网端口 |

## 安装（一条命令）

**默认装最新正式版**（推荐）：

```bash
npm exec --yes --package=pnpm@11 -- dsh plugin --profile web add github:martinbear1/dsh-wechat-remote
```

**或指定版本**（稳定复现，如 `#v1.3.1`）：

```bash
npm exec --yes --package=pnpm@11 -- dsh plugin --profile web add github:martinbear1/dsh-wechat-remote#v1.3.1
```

然后**重启 DSH**，打开 `http://127.0.0.1:3080`，侧边栏底部出现
**「微信连接」** 按钮即安装成功。

> 其他 profile 同样适用：把 `--profile web` 换成你的 profile 名。

这条命令在 Windows PowerShell、macOS Terminal 和 Linux shell 中完全相同；
`pnpm` 只在本次 npm 执行环境中提供，不修改用户的全局包配置。

**怎么重启 DSH（Windows / macOS 通用）**：

- 若 `dsh web` 正开在一个终端窗口里：那个窗口按 **Ctrl + C**，再重新运行 `dsh web`；
- 若由服务管理器或其他工具托管：先从原来的管理入口正常停止 DSH，再运行：

```bash
dsh web
```

> ⚠️ 重启会中断正在进行的对话/任务（历史已落盘不丢，刷新页面继续）。
> 如果你的 DSH 正有重要任务在跑，请改用上面的手动两步，自己挑时间重启。

> **版本策略**：本仓库 `main` 分支只合并「已通过完整测试」的代码（开发在特性分支，
> 测试通过才合并并打版本标签），所以不带 `#版本号` 安装 = 安装那一刻的最新正式版。
> 无论哪种写法，装完都会锁定具体提交，**不会自动更新**；升级 = 重跑上面的命令 +
> 重启 DSH。所有历史版本标签保留在仓库 Tags 里，可随时回退到任意指定版本。

**为什么必须重启（且不能自动重启）？** DSH 的官方插件模型是「启动时加载」——
所有官方/第三方插件都是装完重启生效，本插件遵守同一规范，不越权做任何热插拔或
进程操作。自动重启也被有意排除：重启会中断正在进行的 agent 会话（可能丢掉正在
执行的任务），这个时机应当由用户自己掌握。重启只影响进程，**会话记录都在磁盘上，
不会丢**。

## 主机平台架构

同一个插件包在启动时选择 HostPlatform 适配器，DSH、微信和云端协议本身不分叉：

- Windows：真实枚举本地盘符和映射网络盘；
- macOS：提供主目录、POSIX 根目录与 `/Volumes` 卷入口；
- Linux：提供主目录、根目录及常见挂载入口；
- Windows 网络盘、macOS 外部卷和 Linux 挂载目录统一在可超时终止的隔离 worker 中访问，
  失联存储不会阻塞 DSH 主事件循环；
- Agent 只发布最小平台能力（平台类型、路径风格、根目录风格），不上传系统版本等额外
  设备指纹；云端只校验并透传，小程序按能力呈现。

**插件坏了会影响 DSH 吗？** 不会。本插件所有运行时错误都在进程内消化：端口被占、
网络异常、WeChat API 失败等任何故障都只让对应功能降级并记日志，**原生 DSH
照常运行**。端口占用会在 `wechatHost/describe` 与配对按钮中明确显示占用端口、
错误码和可用的环境变量，不会以未处理 `EADDRINUSE` 拖垮 DSH。

## 使用

1. 电脑上打开 `http://127.0.0.1:3080` → 点侧边栏底部「微信连接」→ 弹出配对弹窗：
   标题「扫码连接微信」、二维码 + 8 位配对码、三行状态（局域网 / 公网 /
   **微信身份**：公网模式由云端真实校验，电脑不保存 AppSecret）
2. 微信小程序「Harness Remote」→ 首次进入按初始化页引导 →「扫码配对」扫二维码
   （开发者工具模拟器无摄像头，可手动输入配对码）→ 自动完成 openid 绑定与登录
3. 之后每次打开小程序即自动复核身份并连接

### 公网连接配置

正常用户**不需要创建配置文件**。安装并重启 DSH 后，插件会生成本机独立 Ed25519
身份，只向产品官方中继 `https://relay.xyxfood.xyz` 主动发起 443/WSS 出站连接；同一个
二维码会同时包含公网配对票据和局域网路线。中继只能路由端到端密文，不能读取 DSH
内容，也不能直接访问用户电脑的局域网门或 DSH 3080。

只有以下两类高级场景才需要创建 `~/.dsh/harness-remote-public.json`：

```json
{ "enabled": false }
```

上面会明确关闭公网，只保留局域网。自托管运营方可以改用自己的无路径 HTTPS 源：

```json
{ "enabled": true, "relayOrigin": "https://你的已备案中继域名" }
```

配置文件不存在时使用产品官方中继；配置错误只会让公网功能降级并显示错误，不会修改
DSH/WebUI 配置，也不会影响局域网门和原生 DSH。

## 端口约定

| 端口 | 用途 | 归属 |
|---|---|---|
| 3080 | DeepSeek Harness 官方 Web | 官方（不变） |
| **3092** | **微信版 web/default 局域网门**（API + 配对认领） | 本插件，token 必填 |
| **3093** | **微信版 web/default 配对二维码 + 状态** | 本插件，仅本机 |
| **32000–39999** | 其他 DSH profile 的稳定偶/奇端口对 | 本插件，按 profile + Agent 实例推导 |

兼容规则：`web` 与 `default` 始终默认 `3092/3093`；其他 profile 用
`profileScope + agentInstanceId` 的 SHA-256 稳定映射选择偶数局域网门及紧邻的奇数
本地门。该区间明确低于 Windows 默认从 49152 开始的动态/临时端口段，避免与系统临时
连接争抢。插件不扫描、不抢占随机端口；极低概率发生碰撞时只停用冲突的那一扇门并给出
可操作错误。`WECHAT_GATE_PORT` / `WECHAT_GATE_LOCAL_PORT` 可分别显式覆盖默认值。
二维码、`/pair/code`、`/gate/status`、`wechatHost/describe` 和 WebUI 配对按钮都使用并
展示本 profile 的实际端口。

## 安全模型

- 官方 DSH 本身**没有认证层**（其 `/api` 栅栏是防浏览器劫持的信任边界，
  官方源码明言 "this fence is not an auth layer"）；本插件补上认证层并保持
  官方栅栏全程生效
- **微信 openid 绑定**：凭证不再是可无限复制的无主字符串 —— 攻击者即使偷到
  token，也无法通过下一次启动的身份复核；可随时按 openid 解绑
- **凭证滚动**：每次启动复核成功即轮换 token，旧 token 立即作废
- 配对码：一次性、15 分钟过期、最多 5 次尝试 + 每 IP 限速
- 局域网明文 HTTP 提示：介意可用 SSH 隧道（官方对齐路径）或等公网通道
- 公网：电脑主动出站，云端短期用户凭证 + Agent 签名证明 + 端到端密文；单 Agent 默认
  最多 8 个手机会话，Agent 解密后只允许访问 loopback DSH 的 `/api/*`

## 常见问题

**Q：公网配对失败？** 二维码 15 分钟有效且一次性；确认电脑和手机都能访问
`relay.xyxfood.xyz`（自托管时则检查自定义中继域名）。微信 `code2session` 只由云端
调用，用户电脑无需保存 AppSecret。

**Q：想换微信账号 / 解绑？** 停 DSH → 删除 `~/.dsh/gate-wechat-state.json` →
重启 DSH → 重新扫码配对。

**Q：openid 泄露了会被冒名登录吗？** 不会。openid 只是**身份标识**不是**凭证**：
登录靠的是「微信登录态 → wx.login 换 jsCode → 服务端 code2session 解析」这条链，
攻击者拿不到被绑定微信账号的登录态就伪造不出有效的 jsCode，知道 openid 字符串
本身没有任何用（好比知道别人家门牌号不等于有钥匙）。真正要保护的是电脑上的
Agent 私钥（自动收紧为当前用户专属 ACL）和配对的屏幕秘密。

**Q：需要手动开防火墙吗？** 一般不用：Node.js 自带程序级放行规则（按 node.exe
放行、覆盖所有端口），DSH 跑在 node.exe 上，实际局域网门通常自动可用。只有在你机器上存在
已有端口级防火墙规则等特殊情况下，才需要在系统防火墙中放行本节点实际显示的
局域网端口。

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
这类错误会让 WebUI 无法加载插件。改完产物先跑 `node scripts/verify.mjs`。

## License

MIT
