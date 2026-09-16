# 使用 DSH 官方方式安装插件

通常优先使用 `npx -y dsh-wechat-remote@latest`；Windows 推荐 `npx.cmd -y dsh-wechat-remote@latest`。下面的方法不经过我们的自动安装器，也不会自动备份或重启。

## 使用前

- 先结束任务并退出要安装插件的 DSH。
- 使用原来的系统账号、数据目录和 profile（一般是 `web`）。自定义目录时保留相同的 `DSH_HOME`。
- 确保终端能运行 `pnpm`。这是 DSH 官方插件命令的要求；我们的自动安装器则已自带安装工具。

## 安装最新正式插件

全局安装 DSH 的用户：

```sh
dsh plugin --profile web add https://github.com/martinbear1/dsh-wechat-remote/releases/latest/download/harness-remote-dsh-wechat-remote.tgz
```

平时通过 NPX 启动 DSH 的用户：

```sh
npx @deepseek-ai/dsh plugin --profile web add https://github.com/martinbear1/dsh-wechat-remote/releases/latest/download/harness-remote-dsh-wechat-remote.tgz
```

如果原来的启动命令指定了 DSH 版本（例如 `@deepseek-ai/dsh@0.1.5-rc.1`），这里也保留同一个版本。Windows PowerShell 可将开头的 `dsh` / `npx` 分别改为 `dsh.cmd` / `npx.cmd`。

安装完成后，按平时的方式启动 DSH。首次安装和后续更新均可使用上述 `add` 命令；已有节点正常升级不需要重新配对。此方式需要电脑能访问 GitHub 的发布附件；并不保证能绕过网络故障或包管理器自身的问题。

需要固定插件版本时，从对应 GitHub Release 选择带版本号的 `.tgz` 附件，替换命令里的下载地址即可。

依据：[DSH 官方打包与安装指南](https://deepseek-harness.github.io/deepseek-harness/develop/basic/publish)。
