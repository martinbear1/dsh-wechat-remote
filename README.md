# Agent远程管理助手 · DSH 微信连接插件

在微信小程序中安全连接自己的 DeepSeek Harness，查看会话、发送任务并接收流式回复。支持局域网直连和端到端加密公网连接。

当前正式版：`1.7.8`

## 安装或升级

请先安装 DSH 和 Node.js 22.13 或更高版本，然后在电脑终端运行：

```sh
npx -y dsh-wechat-remote@latest
```

Windows CMD 或 PowerShell 可直接运行：

```powershell
npx.cmd -y dsh-wechat-remote@latest
```

首次安装和升级使用同一条命令，无需另装 pnpm 或 Git，也不会升级 DSH 本体。升级前请先结束正在运行的任务；已有节点配对和会话会保留。

安装完成后打开 DSH WebUI 的 **设置 → 微信连接**，使用「Agent远程管理助手」微信小程序扫码配对。

## 更新与故障恢复

插件可在 **设置 → 微信连接** 中检查并一键更新。如果旧版一键更新失败，重新执行上面的安装命令即可升级，无需删除配对或降低 DSH 版本。

安装需要电脑能够访问 npm。若下载或安装失败，安装器会尽量保留或恢复原插件，并在本机留下诊断日志。

自定义 profile、修复安装及其他参数见 [安装器使用说明](installer/README.md)。需要绕过 npm 安装器时，可使用 [DSH 官方原生安装方式](docs/NATIVE-INSTALL.md)。

## 支持环境

已验证 Windows x64、macOS Intel x64、Linux x64 和 Linux ARM64。公共 Wi-Fi 的设备隔离、代理或网络封锁可能影响连接。

- [版本更新说明](RELEASE-NOTES.md)
- [安全问题报告](SECURITY.md)
