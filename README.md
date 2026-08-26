# Harness Remote for DeepSeek Harness

在电脑上的 DeepSeek Harness 安装一个插件，用微信扫码添加这台电脑，随后即可在
Harness Remote 小程序中查看工作区和会话、发送任务，并在局域网与移动网络之间继续工作。

Harness Remote 是与 WebUI 平级的独立 DSH 客户端。它直接使用 DSH 的原生 RPC、事件和
会话数据，不抓取网页、不修改 WebUI，也不替换 DeepSeek Harness 本体。

当前插件版本：`v1.4.3`

## 用户能获得什么

- **扫码添加节点**：不填写 IP、端口或密码；一个二维码同时配置本地和远程连接。
- **自动选择路线**：同一网络优先局域网直连，离开 Wi-Fi 后自动使用远程连接。
- **微信账号绑定**：远程节点与完成配对的微信用户绑定，不能只凭节点地址访问。
- **端到端加密**：远程会话内容在手机与电脑之间加密，中继服务只转发密文。
- **原生 DSH 能力**：工作区、会话、实时事件、历史、附件和目录操作均来自 DSH 规范接口。
- **Windows 与 macOS 通用**：同一个仓库、同一个版本、同一条安装命令。
- **不拖累 DSH**：插件能力分别降级；连接或附件服务失败不会终止 DSH，也不会改变 WebUI。

## 支持范围

| 项目 | 当前支持状态 |
| --- | --- |
| Windows | 正式支持并完成真机验证 |
| macOS | 正式支持并完成真机验证 |
| Linux | 具备平台适配，尚未列入本版本真机验收基线 |
| DeepSeek Harness | 当前验收基线为 `0.1.1-rc.2` |
| 微信客户端 | Harness Remote 小程序 |

电脑需要能够运行 `dsh`、`node`、`npm` 和 `git`。安装命令会临时提供 DSH 插件管理所需的
`pnpm`，不要求用户提前全局安装。

> 当前 GitHub 仓库是受控测试分发渠道，安装账号需要拥有仓库访问权限。正式公开分发前，
> 会切换为不依赖私有源码权限的稳定安装渠道。

## 安装

### DSH 原生命令

已经可以在终端运行 `pnpm` 时，Windows PowerShell 和 macOS Terminal 使用完全相同的
DSH 原生命令：

```bash
dsh plugin --profile web add github:martinbear1/dsh-wechat-remote
```

不写 `#版本号` 会安装 GitHub `main` 当前的最新正式版。本仓库只在完整测试通过后更新
`main`；需要固定复现或回退时再追加版本标签，例如：

```bash
dsh plugin --profile web add github:martinbear1/dsh-wechat-remote#v1.4.3
```

`dsh plugin` 是 DeepSeek Harness 官方插件管理入口。DSH 会把 `add/remove/why` 等参数原样
交给 pnpm；这也是为什么电脑需要能找到 `pnpm`，并不是本插件使用了额外安装器。

### 未安装 pnpm：通用一键命令

如果终端提示找不到 pnpm，使用下面这条命令。它只在本次执行中临时提供 pnpm，不做全局安装，
最终执行的仍然是上面的 DSH 原生命令：

```bash
npm exec --yes --package=pnpm@11 -- dsh plugin --profile web add github:martinbear1/dsh-wechat-remote
```

安装完成后，在没有重要任务运行时重启 DSH：

```bash
dsh web
```

如果 `dsh web` 已在终端中运行，先在原终端按 `Ctrl + C` 正常停止，再重新执行。插件遵守
DSH 的启动加载机制，不会自行重启 DSH，因为强制重启可能中断正在执行的任务。

打开 DSH WebUI 后，侧边栏底部出现 **连接微信**，即表示插件已经加载。

### 安装其他 profile

将命令里的 `web` 替换为实际 profile 名即可：

```bash
dsh plugin --profile <profile> add github:martinbear1/dsh-wechat-remote
```

不同 profile 会获得彼此独立的 Agent 身份、连接状态和端口，不会争用默认实例。

## 添加到微信

1. 在电脑 DSH WebUI 侧边栏点击 **连接微信**。
2. 弹窗会显示 `DeepSeek Harness · 电脑名称`、二维码和有效期。
3. 打开 Harness Remote 小程序，进入 **添加节点**。
4. 扫描二维码并确认添加。
5. 小程序自动完成微信身份验证，并显示这台电脑上的工作区和会话。

配对界面只展示用户需要判断的三项状态：

- **局域网直连**：手机与电脑同网时是否可以直连；
- **远程访问**：离开局域网后是否可以连接；
- **微信账号保护**：当前配对是否启用账号验证。

服务器域名、端口、令牌、内部节点 ID 和底层异常不会展示给普通用户。需要排查故障时，
诊断信息只保留在电脑本机日志中。

## 日常使用

添加成功后不需要反复扫码：

- 手机回到同一 Wi-Fi，小程序会尝试切换到局域网直连；
- 手机使用 4G/5G 或外部 Wi-Fi，小程序会自动使用端到端加密远程连接；
- 网络切换或短暂断线会自动重连，不改变节点身份和会话数据；
- 删除小程序中的节点后，才需要重新扫码添加。

电脑端始终是 DSH 数据和执行能力的权威来源。WebUI 与小程序可以同时连接同一个 DSH，
两端观察的是同一组工作区、会话和原生事件。

## 更新、回退与卸载

### 更新到当前正式版

```bash
dsh plugin --profile web add github:martinbear1/dsh-wechat-remote
```

没有全局 pnpm 时，继续使用安装章节的通用一键命令。更新完成后由用户选择安全时间重启 DSH。

### 安装指定旧版本

将标签替换为需要的版本，例如：

```bash
dsh plugin --profile web add github:martinbear1/dsh-wechat-remote#v1.4.2
```

### 卸载

```bash
dsh plugin --profile web remove @harness-remote/dsh-wechat-remote
```

没有全局 pnpm 时，同样可在命令前使用临时运行环境：

```bash
npm exec --yes --package=pnpm@11 -- dsh plugin --profile web remove @harness-remote/dsh-wechat-remote
```

重启 DSH 后插件即不再加载。插件不修改 DeepSeek Harness 官方代码，因此卸载不需要还原
WebUI 或 DSH 文件。

如果还要清除这台电脑的 Harness Remote 身份和历史配对关系，请先停止 DSH，再删除用户
主目录下 `.dsh` 中由 Harness Remote 创建的状态文件。不要删除工作区目录；工作区源码和
会话文件不属于插件。

## 隐私与安全

### 远程连接

- 电脑只主动建立 HTTPS/WSS 出站连接，不要求路由器开放公网端口；
- 二维码钉扎电脑 Agent 身份，连接使用临时会话密钥；
- 消息、RPC 和实时事件在手机与电脑之间端到端加密；
- 中继只能看到路由所需的最小元数据、密文长度和时间，不能读取 DSH 内容；
- 大型历史窗口和图片附件先在端侧加密，再临时存入私有对象存储；对象存储只持有密文。

### 微信身份

- 小程序通过微信登录临时代码完成身份验证；
- AppSecret 只保存在运营方服务端，不进入电脑插件、二维码或小程序包；
- 云端保存的是用于授权判断的最小身份映射，不把微信登录凭证交给电脑；
- 配对码一次性使用并在 15 分钟后失效，重复失败会触发限速。

### 电脑本地

- Agent 私钥、配对状态和访问凭据仅写入当前用户的 `.dsh` 目录；
- 文件权限会在 Windows 和 POSIX 系统上按平台收紧；
- 局域网接口仍要求节点凭据，不因为来自同一网络而跳过认证；
- 插件只代理经过认证的 DSH API，不把 DSH WebUI 直接暴露到公网。

配对二维码和配对码在有效期内相当于临时钥匙。请只在自己的电脑屏幕上展示，不要截图发给
不受信任的人。

## 与 DSH 和 WebUI 的边界

Harness Remote 遵守以下约束：

1. **不修改 DSH 本体**：以 Cordis 插件生命周期挂载和卸载。
2. **不派生 WebUI**：小程序直接使用 DSH 原生 RPC、Typert Remote 和 Host 事件。
3. **不替换官方能力**：例如 WebUI 继续使用官方目录选择器；小程序目录能力使用独立契约。
4. **不伪造官方字段**：客户端需要但 DSH 契约没有的数据，通过插件自己的只读接口提供。
5. **可独立失败**：目录、历史、附件、局域网和远程连接分别降级，不把异常抛到 DSH 主进程。
6. **可完整释放**：插件 fiber 卸载时关闭监听器、连接、定时任务和可选服务。

数据路径如下：

```text
Harness Remote 小程序
    ├─ 同网：加密凭据保护的局域网直连 ───────────────┐
    └─ 异网：端到端加密实时中继 ────────────────────┤
                                                     ▼
                                      Harness Remote DSH 插件
                                                     │
                                      DSH 原生 RPC / 事件 / 数据
                                                     ▼
                                           DeepSeek Harness

大型历史与附件：手机/电脑端加密 ↔ 私有对象存储（仅密文）
```

## 跨平台行为

同一份插件代码根据主机平台选择适配器，云端协议和小程序协议不分叉：

- Windows：本地盘符、映射网络盘和 Windows 路径；
- macOS：用户主目录、POSIX 根目录和 `/Volumes`；
- 不可用的网络盘或外部卷在可终止 worker 中访问并设硬超时，避免阻塞 DSH 主线程；
- 节点只发布客户端真正需要的平台能力，不上传无关设备指纹。

Windows 与 macOS 不需要不同仓库、不同安装包或平台专用启动脚本。

## 常见问题

### 安装后没有“连接微信”

确认安装命令成功，并真正停止后重新启动了对应 profile 的 DSH。浏览器刷新 WebUI；如果终端
显示插件加载错误，请保留完整 DSH 启动日志用于排查。

### 出现 `ERR_PNPM_UNEXPECTED_STORE`

这表示当前 DSH profile 的 `node_modules` 是由另一个 pnpm 大版本创建的，不是插件包错误。
可以继续使用原来的 pnpm 大版本；如果要把该 profile 统一迁移到 pnpm 11，请先停止 DSH，
然后在 Windows PowerShell 或 macOS Terminal 执行：

```bash
cd ~/.dsh/profiles/web
npm exec --yes --package=pnpm@11 -- pnpm install --force
```

这只重建 `web` profile 的依赖链接，不删除工作区、会话或 DSH 凭证。完成后回到任意目录，
重新执行安装命令即可。其他 profile 请把路径中的 `web` 换成对应名称。

### 远程访问显示暂不可用

先确认电脑能正常访问互联网并保持 DSH 运行。网络恢复后插件会自动重连，通常不需要重新
扫码。局域网仍可用时，可以继续在同一网络中使用。

### 手机连上 Wi-Fi 后仍暂时显示远程连接

小程序会先保持当前可用路线，再通过已认证的远程通道获取局域网凭据并探测直连。切换过程
不要求重新配对；如果局域网不可达，则继续使用远程路线，避免为追求切换而中断会话。

### 某个磁盘或目录一直打不开

映射网络盘、离线卷或休眠存储可能不可用。插件会在超时后返回失败，不会持续卡住 DSH。
恢复该存储后再重试，或选择其他本地目录。

### 插件故障会不会破坏 DSH

插件入口本身没有导入副作用；只有 DSH 实际挂载插件后才创建状态、监听器和连接。初始化、
端口或网络错误会被限制在插件能力内，DSH 和 WebUI 继续运行。

### 去哪里看诊断信息

- 启动 DSH 的终端输出；
- 当前用户目录下 `.dsh/wechat-gate-access.log`；
- Harness Remote 小程序的“小程序日志”。

向维护者反馈时请隐藏配对码、二维码、令牌和个人路径。

## 维护者说明

### 仓库结构

```text
├─ src/                    Host 与 WebUI 客户端的唯一源码
├─ lib/                    可安装发布制品
├─ scripts/                构建、生命周期、协议与平台回归测试
├─ cordis.patch.yml        DSH 插件图声明
├─ package.json            DSH Host、Client 与 Remote 契约清单
└─ README.md
```

`src` 是唯一权威源码。`lib/client.js` 由可重复构建脚本生成，插件 ID 直接读取
`package.json`，不维护第二份手写注册信息。

### 构建与验证

```bash
npm ci
npm run bundle
npm test
npm run verify
npm pack --dry-run
```

发布前还必须完成：

- Windows 与 macOS 隔离 DSH_HOME 安装测试；
- 插件导入无副作用、Cordis dispose 后端口关闭；
- WebUI 能加载客户端 bundle；
- 局域网、公网、历史、附件和目录回归；
- 发布包脱敏扫描与文件清单检查；
- `main` 提交、版本标签和 GitHub 远端一致性检查。

## License

MIT
