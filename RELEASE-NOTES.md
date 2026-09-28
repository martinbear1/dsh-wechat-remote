# v1.7.13

- 修复 Web 微信连接页检查更新时出现 “Illegal invocation” 的问题。
- 修复 Web 更新时因宿主会话列表变化而误判失败的问题，保留配对与历史文件校验。
- 修复 Desktop 在联动更新结束后仍显示处理中，以及联动更新目标提示不清晰的问题。
- 改善本地安装包的联动更新处理；更新另一端仍需确认，不会自动启用已关闭的插件。

可使用微信连接页的更新入口，或执行 `npx -y dsh-wechat-remote@latest`；Windows 可使用 `npx.cmd`。Desktop 如提示待生效，请在任务结束后完全退出并重新打开，无需重新配对。

# v1.7.13-rc.2（预览测试）

- 修复部分 Web 节点更新插件时，被会话列表变化误判失败并回退的问题。
- 包含 Web 检查更新报错、Desktop 更新完成后残留提示的修复。

本版尚在验证中，暂不建议用于日常节点。

# v1.7.13-rc.1（预览测试）

- 修复 Web 微信连接页检查更新时出现 “Illegal invocation” 的问题。
- 修复另一端更新完成后，Desktop 仍残留“正在处理插件更新”提示的问题。

本版尚在验证中，暂不建议用于日常节点。

# v1.7.12

- Web 与 Desktop 可作为同一电脑上的两个独立节点分别配对、使用；升级保留已有配对与会话。
- Desktop 可在原生插件管理器安装，并在插件详情或“设置 → 微信连接”中检查、一键更新。更新另一端前会请求确认。
- 区分不同提供方的同名模型，改善新版 DSH 的权限选项、预设及新会话列表显示。
- 减少仅浏览历史时误显示的会话占用错误；真实发送或修改失败仍会提示。同一会话仍不能由两端同时操作。
- 改善 Web 更新包在慢网环境下的下载处理，保留完整性校验。

Desktop 更新后如提示待生效，请在任务结束时完全退出并重新打开，无需重新配对。Web 用户可使用原有一键更新，失败时执行 `npx -y dsh-wechat-remote@latest`；Windows 可使用 `npx.cmd`。

现有小程序的模型菜单可能未及时反映电脑上的切换；发送前请重新选择所需模型，并确认电脑已同步该选择，避免选择后立即发送。

# v1.7.12-rc.10（预览测试）

- 调整小程序模型菜单，区分不同提供方的同名模型，避免重复勾选。
- 改善新版 DSH 的权限选项显示、切换及预设设置兼容。

本版仍需真机验证，暂不建议用于日常节点。Desktop 更新后请在任务结束时完全退出并重新打开，无需重新配对。

现有小程序的模型菜单可能未及时反映电脑上的切换；发送前请重新选择所需模型，并确认电脑已同步该选择，避免选择后立即发送。

# v1.7.12-rc.9（预览测试）

- 调整 Desktop 一键更新：由原生插件管理器使用应用配置的安装源下载、安装指定版本。
- 放宽 Web 更新包的慢网下载时限，保留下载停滞检测和安装包校验。

- 调整两端共存时的报错提示：仅浏览历史产生、且确认当前端没有活动会话或手机修改操作的会话占用通知，不再显示为手机聊天失败；真实发送或修改失败仍会提示。
- 本次不修改 DSH，也不解除其会话占用限制；同一会话仍不能由两端同时操作。

仅供预览测试，暂不建议用于日常节点。Desktop 更新后请在任务结束时完全退出并重新打开，无需重新配对。

# v1.7.10

- 修复升级 DSH 0.1.7-rc.1 后，插件接口、实时连接、文件读取和部分子代理历史不兼容的问题。
- 改善故障状态下的重新安装与失败恢复，保留原配对、会话和 DSH 版本。
- 继续兼容已验证的旧版 DSH 安装方式。

升级 DSH 后如果旧插件无法使用，请先结束正在执行的任务，再执行 `npx -y dsh-wechat-remote@latest`；Windows 可使用 `npx.cmd -y dsh-wechat-remote@latest`。安装完成后刷新原 WebUI 页面，无需重新配对。

# v1.7.9

- 改善图片、附件和工作区文件在网络异常时的传输恢复。
- 优化会话历史读取和实时回复传输，修复中断过的旧会话重新打开时可能缺少后续回复的问题。
- WebUI 一键更新支持在 GitHub 下载发生网络故障时使用已核验的 npm 备用来源；完善下载超时与修复安装处理。
- 保留原有配对、会话及 DSH 版本。

旧插件若因 GitHub 下载失败而无法更新，结束任务后执行 `npx -y dsh-wechat-remote@latest`；Windows 使用 `npx.cmd -y dsh-wechat-remote@latest`。升级后可使用新版的一键更新能力。

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
