# v1.7.8

- 改善全局安装和 NPX 启动 DSH 时的插件安装、升级与重启。
- 修复 Windows 中文、空格等 Node.js 路径引起的安装失败。
- 改善旧版安装记录的兼容与失败恢复，保留原有会话、配对及其他插件配置。
- 修复部分启动方式下单轮用量缺失，完善配套小程序的会话归档导出及 20 MB 超限提示。

旧插件若无法在 WebUI 一键更新，结束任务后执行 `npx -y dsh-wechat-remote@latest`；Windows 可使用 `npx.cmd -y dsh-wechat-remote@latest`。疑似同版本文件损坏时可附加 `--repair`。升级不需要重新配对，也不会升级 DSH 本体。

## 备用：使用 DSH 官方命令安装 1.7.8

以下命令直接安装本次 GitHub 发布的预构建插件包，不经过我们的一键安装器，也不需要下载源码或现场编译。首次安装和升级均可使用。

先结束任务并退出 DSH，确保终端可以运行 `pnpm`；在原来的系统账号和数据目录下执行。

全局安装 DSH 的用户：

```sh
dsh plugin --profile web add https://github.com/martinbear1/dsh-wechat-remote/releases/download/v1.7.8/harness-remote-dsh-wechat-remote-1.7.8.tgz
```

平时通过 NPX 启动 DSH 的用户：

```sh
npx @deepseek-ai/dsh plugin --profile web add https://github.com/martinbear1/dsh-wechat-remote/releases/download/v1.7.8/harness-remote-dsh-wechat-remote-1.7.8.tgz
```

Windows PowerShell 若提示禁止运行脚本，将命令开头的 `dsh` / `npx` 分别改为 `dsh.cmd` / `npx.cmd` 即可，无需修改系统执行策略。平时固定了 DSH 版本的用户，这里也保留同一 DSH 版本；自定义 profile 或 `DSH_HOME` 时使用原值。

完成后按平时的方式重新启动 DSH。官方命令不会替你自动备份或重启，也不能绕过 GitHub 网络访问、权限或包管理器本身的问题。正常升级无需重新配对。

方式依据：[DSH 官方打包与安装指南](https://deepseek-harness.github.io/deepseek-harness/develop/basic/publish)。
