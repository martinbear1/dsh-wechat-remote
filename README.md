# 鲸常在 · DeepSeek Harness 微信连接插件

在 Windows 或 macOS 的 DeepSeek Harness 中安装本插件，即可用「鲸常在」微信小程序扫码添加这台电脑，在手机上查看工作区与会话、发送任务并接收运行结果。

小程序是独立的 DSH 客户端：数据和任务仍由用户自己的电脑及 DeepSeek Harness 处理。本插件不会修改 DSH 本体，也不会替换或抓取 WebUI。

## 功能

- 扫码添加 Windows 或 Mac 上的 DSH
- 同一 Wi-Fi 下优先使用局域网直连
- 离开局域网后可切换到加密远程连接
- 查看工作区、会话历史和实时任务状态
- 发送文字、图片及后续指令
- 一个插件版本同时支持 Windows 和 macOS

局域网连接免费使用。远程连接由「鲸常在」小程序中的公网访问权益控制；没有公网权益时，不影响同一局域网内使用。

## 安装前准备

电脑上需要已经安装并能够正常运行：

- DeepSeek Harness（`dsh`）
- Node.js、npm 和 Git

## 安装

Windows PowerShell 和 macOS Terminal 使用同一条 DSH 原生命令：

```bash
dsh plugin --profile web add github:martinbear1/dsh-wechat-remote
```

安装完成后，在没有任务运行时重新启动 DSH：

```bash
dsh web
```

如果 DSH 已经在当前终端运行，请先按 `Ctrl + C` 正常停止，再执行 `dsh web`。

打开 DSH WebUI，进入 **设置 → 微信连接**。看到「鲸常在」连接页面即表示插件已加载。

### 提示找不到 pnpm

先安装 DSH 插件管理所需的 pnpm，再重新执行上面的安装命令：

```bash
npm install -g pnpm@11
```

如果现有 DSH profile 提示 `ERR_PNPM_UNEXPECTED_STORE`，说明它曾由另一个 pnpm 大版本创建。请优先继续使用报错中显示的原版本，不要删除工作区或会话数据。

### 固定安装某个版本

普通用户不需要填写版本号；默认安装 `main` 上的最新正式版。只有复现或回退时才需要指定标签，例如：

```bash
dsh plugin --profile web add github:martinbear1/dsh-wechat-remote#v1.5.3
```

## 添加电脑

1. 在电脑的 DSH WebUI 中打开 **设置 → 微信连接**。
2. 点击 **生成配对码**。
3. 打开「鲸常在」小程序，进入 **添加节点**。
4. 扫描电脑上的二维码并确认添加。
5. 添加成功后即可查看这台电脑上的工作区和会话。

配对码一次性使用并会自动过期。请勿把二维码或配对码发送给不受信任的人。

添加完成后通常不需要再次扫码。小程序会根据当前网络在可用连接之间自动选择；电脑需保持 DSH 运行。

## 更新

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

不会。插件通过 DSH 的插件机制加载，异常会限制在插件功能内；卸载后 DSH 与 WebUI 仍按原方式工作。

## 支持范围

| 平台 | 状态 |
| --- | --- |
| Windows | 支持 |
| macOS | 支持 |
| Linux | 尚未列入正式测试范围 |

当前版本：`v1.5.3`

## 许可证

[MIT](LICENSE)
