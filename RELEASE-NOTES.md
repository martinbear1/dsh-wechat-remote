# v1.7.7

- 修复 Windows 部分中文路径下插件安装失败的问题。
- 改善首次安装、旧版本升级和安装失败后的恢复，兼容全局安装及 NPX 启动的 DSH。
- 优化 DSH 未启动时的安装与默认版本选择，并提供更明确的失败提示和日志位置。

请先结束运行中的任务，再运行 `npx -y dsh-wechat-remote@latest`；Windows 推荐使用 `npx.cmd -y dsh-wechat-remote@latest`。正常升级保留配对与会话，不改变 DSH 本体版本。

旧版一键更新遇到安装错误时，可用上述命令升级。需要绕过自动安装器时，也可使用 [DSH 原生安装方式](https://github.com/martinbear1/dsh-wechat-remote/blob/main/docs/NATIVE-INSTALL.md)。
