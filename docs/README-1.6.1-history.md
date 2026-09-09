# 历史说明（1.6.1）：Agent远程管理助手 · DeepSeek Harness 微信连接插件

当前正式版 **`1.6.1`**。支持已验证的 DSH 版本组合，提供微信配对、加密连接和 WebUI 插件更新。升级前请阅读 [发布与兼容说明](RELEASE-NOTES.md)，尤其是旧客户端的局域网授权迁移。

在 Windows、macOS 或 Linux 的 DeepSeek Harness 中安装本插件，即可用「Agent远程管理助手」微信小程序扫码添加电脑，在手机上查看工作区与会话、发送任务并接收运行结果。

小程序是独立的 DSH 客户端：数据和任务仍由用户自己的电脑及 DeepSeek Harness 处理。本插件不会修改 DSH 本体，也不会替换或抓取 WebUI。

## 功能

- 扫码添加 Windows、Mac 或 Linux 上的 DSH
- 同一 Wi-Fi 下优先使用局域网直连
- 离开局域网后可切换到加密远程连接
- 查看工作区、会话历史和实时任务状态
- 发送文字、图片及后续指令
- 一个插件适配三个操作系统，确切验证范围见文末
- 小程序节点版本提醒；WebUI 检查适合当前 DSH 的插件更新

安全局域网连接需要支持该能力的小程序版本。远程连接由小程序账户的公网访问权益控制。旧版小程序升级插件后可能需要通过公网继续连接，详见发布说明。

## 安装前准备

电脑上需要已经安装并能够正常运行：

- DeepSeek Harness（`dsh`）
- Node.js、npm 和 Git

## 安装

Windows、macOS 和 Linux 使用同一条安装命令。先结束任务并正常停止目标 DSH；保留原 `DSH_HOME`、profile 和端口，非 web profile 请替换名称：

```bash
npm exec --yes --package=pnpm@11 -- dsh plugin --profile web add github:martinbear1/dsh-wechat-remote
```

安装完成后，在没有任务运行时重新启动 DSH：

```bash
dsh web
```

如果 DSH 正在当前终端前台运行，请先按 `Ctrl + C` 正常停止，再执行 `dsh web`。如果 DSH 已在后台运行，请使用下方对应系统的“停止”或“一行重启”命令，不要直接重复启动。

### 启动、停止与后台运行

在可见终端中运行 `dsh web` 最便于查看报错。需要关闭终端后继续运行时，可以使用下面的命令。命令不包含用户名或安装路径，适用于 DSH 的标准全局安装。

#### Windows PowerShell

静默启动：

```powershell
Start-Process -FilePath 'cmd.exe' -ArgumentList '/c', 'dsh web' -WorkingDirectory $env:USERPROFILE -WindowStyle Hidden
```

只停止占用 DSH Web 默认端口 `3080` 的进程：

```powershell
Get-NetTCPConnection -LocalPort 3080 -State Listen -EA SilentlyContinue | % { Stop-Process $_.OwningProcess -Force -EA SilentlyContinue }
```

一行重启到后台：

```powershell
Get-NetTCPConnection -LocalPort 3080 -State Listen -EA SilentlyContinue | % { Stop-Process $_.OwningProcess -Force -EA SilentlyContinue }; Start-Sleep 1; Start-Process cmd.exe -ArgumentList '/c dsh web' -WindowStyle Hidden
```

这些命令只负责当前登录会话；电脑重启后需要重新启动 DSH。不要使用 `taskkill /IM node.exe`，它会误杀其他 Node.js 程序。如果修改过 DSH Web 端口，请把命令中的 `3080` 换成实际端口。

#### macOS Terminal

后台启动，并把输出保存在 `~/dsh-web.log`：

```bash
nohup dsh web >"$HOME/dsh-web.log" 2>&1 </dev/null &
```

只停止占用 DSH Web 默认端口 `3080` 的进程：

```bash
kill $(lsof -tiTCP:3080 -sTCP:LISTEN) 2>/dev/null || true
```

一行重启到后台：

```bash
kill $(lsof -tiTCP:3080 -sTCP:LISTEN) 2>/dev/null || true; sleep 1; nohup dsh web >"$HOME/dsh-web.log" 2>&1 </dev/null &
```

不要使用 `pkill node`，它会误杀其他 Node.js 程序。如果修改过 DSH Web 端口，请把命令中的 `3080` 换成实际端口。若后台启动失败，请先在可见终端运行 `dsh web`，或查看 `~/dsh-web.log`。

打开 DSH WebUI，进入 **设置 → 微信连接**。看到「Agent远程管理助手」连接页面即表示插件已加载。已有公网配对通常不需要重新扫码。

### 提示找不到 pnpm

先安装 DSH 插件管理所需的 pnpm，再重新执行上面的安装命令：

```bash
npm install -g pnpm@11
```

如果现有 DSH profile 提示 `ERR_PNPM_UNEXPECTED_STORE`，说明它曾由另一个 pnpm 大版本创建。请优先继续使用报错中显示的原版本，不要删除工作区或会话数据。

### 固定安装某个版本

不带 `#标签` 的 GitHub 安装来源是正式分支 main，而非 releases/latest。需要固定到本次版本时：

```bash
dsh plugin --profile web add github:martinbear1/dsh-wechat-remote#v1.6.1
```

## 添加电脑

1. 在电脑的 DSH WebUI 中打开 **设置 → 微信连接**。
2. 点击 **生成配对码**。
3. 打开「Agent远程管理助手」小程序，进入 **添加节点**。
4. 扫描电脑上的二维码并确认添加。
5. 添加成功后即可查看这台电脑上的工作区和会话。

配对码一次性使用并会自动过期。请勿把二维码或配对码发送给不受信任的人。

从小程序删除节点后，旧身份和旧二维码会立即失效。电脑插件会自动准备一个全新的配对身份；需要再次使用时，重新生成并扫描新二维码即可。

添加完成后通常不需要再次扫码。小程序会根据当前网络在可用连接之间自动选择；电脑需保持 DSH 运行。

## 更新

### WebUI 更新

进入 **设置 → 微信连接 → 插件更新与兼容**，先检查，再确认“更新插件并重启 DSH”。只选择支持当前 DSH、系统和架构的最新正式插件，不一定是全仓库最大版本；不会自动升级或降级 DSH。

只有存在通过 URL、SHA-256、大小及包内容校验的正式发布资产，且安装与启动方式可验证时才显示更新按钮。当前自动事务验证范围为 x64 的普通 Node CLI、独立可写 profile、pnpm 11；系统服务、受监管进程、未知架构和安装方式保留手工方式。不支持时会解释原因，不会猜测进程后强制结束。

进度依次显示下载、暂存、保存与备份、重启和校验。会话运行中拒绝进入重启阶段；重启前及重启验证期间暂停新请求。失败尝试恢复原插件；无法自动恢复时保留 `<DSH_HOME>/harness-remote-updates/<任务标识>/` 的记录和备份，提示人工处理，不覆盖新产生的用户数据。该目录含私密配置，不应上传或发给他人；暂无自动清理，确认升级稳定后再由用户清理旧备份。

正常成功后原节点无需重新扫码。页面关闭后重新打开可以读取进度。首次使用此功能，需要先手工把不带该功能的旧插件升级一次。

检查结果由正式兼容清单决定，不因 GitHub 出现更大版本就直接安装。清单确认的目标还需校验下载资产和本机安装条件；没有匹配目标时不会提供安装按钮。预发布更新须管理员显式选择，普通用户不会被自动推荐预览版。清单缺失、过期或未知不等于当前不可用，也不影响对话。

### 手工更新

重新执行安装命令即可更新到当前正式版：

```bash
dsh plugin --profile web add github:martinbear1/dsh-wechat-remote
```

更新完成后，在合适的时间重启 DSH。

## 卸载

```bash
dsh plugin --profile web remove @harness-remote/dsh-wechat-remote
```

随后重启 DSH。卸载插件不会删除用户的工作区源码，也不需要还原 DSH 或 WebUI 文件。

## 连接与安全

- 局域网连接和远程连接都需要经过配对认证。
- 远程会话内容在手机与电脑之间端到端加密。
- 电脑主动连接远程服务，不要求用户在路由器上开放入站端口。
- 图片和较大的历史数据会先在端侧加密，再通过临时对象传输。
- 微信登录凭证和服务端密钥不会写入电脑插件或配对二维码。
- 插件只访问完成配对的 DSH 能力，不会把 DSH WebUI 直接暴露到公网。

## 常见问题

### 安装后看不到“微信连接”

确认安装命令已成功完成，并且重新启动了正确的 DSH profile，然后刷新 WebUI。

### 远程连接不可用

确认电脑可以访问互联网、DSH 正在运行，并在小程序的“公网访问”卡片中查看当前权益。没有公网权益时仍可在同一局域网使用。

### 手机连接 Wi-Fi 后仍显示远程连接

小程序会先保持当前可用连接，再尝试局域网直连；若手机无法直接访问电脑，则继续使用远程连接，不需要重新配对。

### 某个磁盘或目录打不开

离线网络盘、休眠磁盘或未挂载外部卷可能暂时不可用。恢复该磁盘后重试，或选择其他本地目录。

### 插件会影响 DSH 或 WebUI 吗

插件通过 DSH 的插件机制加载，不修改 DSH 本体文件。用户确认一键更新后，会短暂暂停请求并重启当前 DSH；其余时间不接管 WebUI。卸载后 DSH 与 WebUI 仍按原方式工作。

## 支持范围

| 平台 | 状态 |
| --- | --- |
| Windows x64 | 已测试 |
| macOS Intel x64 | 已测试 |
| Linux Ubuntu x64 | 已测试 |

正式兼容声明为 `0.1.1-rc.2`、`0.1.2-rc.1`，均为 x64 三系统。`0.1.1-rc.1` 有早期候选测试，但纯 rc.1 全局安装的内部组件一致性证据不足，本次不扩大正式声明。ARM / Apple Silicon、未列出的 DSH、受监管服务的一键重启、共享 HOME / profile、断电与长期弱网未认证。详细证据分级见发布说明。

## 许可证

[MIT](LICENSE)
