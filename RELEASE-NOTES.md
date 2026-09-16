# v1.7.8

- 改善全局安装和 NPX 启动 DSH 时的插件安装、升级与重启。
- 修复 Windows 中文、空格等 Node.js 路径引起的安装失败。
- 改善旧版安装记录的兼容与失败恢复，保留原有会话、配对及其他插件配置。
- 修复部分启动方式下单轮用量缺失，完善配套小程序的会话归档导出及 20 MB 超限提示。

旧插件若无法在 WebUI 一键更新，结束任务后执行 `npx -y dsh-wechat-remote@latest`；Windows 可使用 `npx.cmd -y dsh-wechat-remote@latest`。疑似同版本文件损坏时可附加 `--repair`。升级不需要重新配对，也不会升级 DSH 本体。
