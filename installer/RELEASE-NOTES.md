# v1.7.14-rc.8

- 改善群任务卡、复杂表单与自定义封面的准备及预览。
- 内嵌同版本插件，封面图片在电脑处理，手机仅预览和发送。

本版为本地研究候选，需配套小程序与群任务服务更新，尚未完成本版真机验收。

# 1.7.9

内嵌同版本完整插件。改善网络下载失败、同版本修复安装及升级恢复的处理；新版插件的一键更新可在 GitHub 网络下载失败时使用已核验的 npm 备用来源。

首次安装和升级仍使用 `npx -y dsh-wechat-remote@latest`；Windows 推荐 `npx.cmd -y dsh-wechat-remote@latest`。请先结束运行中的任务，原有配对、会话和 DSH 版本保留。

# 1.7.8

内嵌同版本正式插件。改善全局与 NPX 使用 DSH 时的安装和升级，修复 Windows 中文 Node.js 路径问题，完善旧安装记录兼容及修复安装。

首次安装和升级仍使用 `npx -y dsh-wechat-remote@latest`；Windows 推荐 `npx.cmd -y dsh-wechat-remote@latest`。请先结束运行中的任务，原有配对和会话保留。
