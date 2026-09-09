# Agent远程管理助手 · DSH 插件安装器

首次安装和升级旧插件使用同一个命令：

```sh
npx -y dsh-wechat-remote@latest
```

需已安装 DSH，使用 Node.js 22.13 或更高版本。安装工具由包依赖自动提供，无需另装 pnpm 或 Git。

安装器仅选择适配当前 DSH 和主机的正式插件，保留原配置、配对和会话，不会升级 DSH 本体。请先结束运行中的任务；安装完成后自动重启原 DSH 并尝试打开 WebUI。

支持已验证的 DSH `0.1.1-rc.2`、`0.1.2-rc.1`，Windows / macOS Intel / Linux x64。普通 Node 启动、独立的 macOS launchd 和 Linux 用户级 systemd 服务可自动恢复；无法确认启动方式时不自动停止主机。

使用其他配置时附加 `--profile 配置名称`。安装损坏需要重装时附加 `--repair`；不会自动降级。
