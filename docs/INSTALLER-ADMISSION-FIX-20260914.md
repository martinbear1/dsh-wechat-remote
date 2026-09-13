# 命令行安装准入修复（安装器 1.7.3 开发与发布记录）

## 根因与范围

Windows x64 上的真实 DSH 0.1.5-rc.2，运行已发布 npm 安装器 1.7.2 时，被目标兼容名单拒绝。尚未登记的 DSH/架构被当成不允许安装，并非实际插件启动失败。

- 新增 installer/bin/release-selection.mjs，将命令行主动安装与自动更新推荐分离。
- 主动安装不以验证记录中的 DSH 版本、平台、架构作为准入条件，也不打印“未验证”警告；正常只显示进度和结果。
- 选择有可信安装包的正式目标；不自动选择插件预览版，不低于安装器自带版本，不降级已安装版本。
- 保留本地/有效远端的已知不兼容记录。远端不可用、无效或过期时仍可使用经过 npm 分发认证的内嵌包；同版本远端信息不能替换内嵌包的哈希。
- 保留来源/大小/SHA-256/归档审计、必要运行能力、进程和 profile 身份校验、空闲保存、备份、重启验证、失败回退。

## 与 WebUI 一键更新的关系

没有修改 WebUI 自动更新的执行服务、确认票据、兼容推荐计算逻辑或云端目录。src/update-policy.ts 仅修改说明注释，既有验证名单继续用于自动更新推荐，不再被命令行安装器当成准入名单。

WebUI 自身的架构/安全重启限制仍是原状；本修复不声称已经解除这些限制。云端未声明 rc.2 的适配目标时，WebUI 仍可能没有可选更新。这需要与主动安装准入区分，不能对外声称 WebUI 已支持所有未登记宿主。

## 验证

- npm run typecheck 通过。
- npm run test:updates 和完整 npm test 通过。
- 新增 11 组测试：包含 36 个 DSH/平台/架构组合，真实安装选择及归档审计、无额外警告、已知故障、远端不可用/过期、预览版、同版本信息、无包目标、无降级和修复重装分支。
- 将修复后的安装器打成未发布本地 npm 包，再解包运行；不是修改已发布 npm 缓存，也未把 rc.2 加入白名单来绕过复现。
- 在用户指定的这台 Windows x64 上，真实 DSH 0.1.5-rc.2 首次安装正式插件 1.7.2 成功，事务状态 complete/ok，重启后的 wechatHost/describe 和 session.list 均成功，回报 DSH 0.1.5-rc.2 / 插件 1.7.2。
- 安装的插件压缩包与已发布 1.7.2 完全一致：SHA-256 0eb296a3a0c84f080148280f9b9419516a9dc640c9e13aa8cf014120aea591ee。本次没有修改插件运行包的 WebUI 更新实现。
- 无模型调用、无真实手机扫码验收；ARM64 仅做准入逻辑模拟，未做 ARM64 真机运行验证。此次插件安装实测只在 Windows 上执行，未对其他设备或云端执行插件安装。

本地证据：compat-artifacts/installer-admission-rc2-20260914/verification.json，以及 local-installer 下的未发布测试包。旧 Windows DSH 数据已在此前清空测试环境时完整移入用户本地 dsh-backups；没有永久删除。

## 发布状态

2026-09-14 已发布 npm 安装器 dsh-wechat-remote@1.7.3，latest 指向 1.7.3；公网 registry 回读版本及 shasum 与本地待发布包一致。用户完成了登录及本次发布的 npm 安全验证。

- 安装器归档：dsh-wechat-remote-1.7.3.tgz，18,490,348 字节。
- npm shasum：42cfecf87da00581300366ff07ecd357b028664d。
- npm integrity：sha512-UZVnM7+NX9Hk58BkwDMKn+1NLOJpoQ7Zukn7bCB23isu3Jzou3gupuh5hZDFZJOpYEYGMllPGH71JC4S91VkZQ==。
- 内嵌的正式插件仍为 1.7.2，哈希与上文一致；不重新发布或覆盖已发布 1.7.2。
- 本次不修改云端兼容目录、不发布小程序、不改变插件运行包。自动更新推荐机制与此前一致。
- GitHub main 与修复提交 5cd60bd 已同步，发布标签 installer-v1.7.3 与安装器归档上传完成，发布页：https://github.com/martinbear1/dsh-wechat-remote/releases/tag/installer-v1.7.3 。插件 v1.7.2 仍为 GitHub Latest，安装器独立发布不会替代正式插件入口。
- GitHub 上传归档 SHA-256：4bff3cf6b1dc0195d117e1018e7d32c3b3342bb4798a249cb888387b3527436f，与本地归档一致。
- 已从公网 npm 重新下载并解包 1.7.3，校验外层归档和内嵌插件哈希；以三个目标环境及 Mac ARM64 模拟输入执行真实 selectRelease/归档审计均成功。这里只验证选择过程，不等同于安装或 ARM64 运行验收。
- 本地 Git bundle 全历史备份已验证；修复前备份分支也已推送 GitHub。

修改前的本地代码备份分支：backup/installer-admission-before-20260914。

## 用户指定的后续三机测试

用户确认先发布修复安装器，再亲自运行公网一行命令。环境分配为 Mac 0.1.5-rc.2、Ubuntu 0.1.5-rc.1、Windows 0.1.2-rc.1，均先备份并清空 DSH 本体、profile、插件及旧配对身份，再只安装指定 DSH，不代替用户安装插件或扫码。

旧 DSH 数据采用同机目录迁移而非永久删除，并核验身份/配置文件哈希；原自动启动配置保留于备份或保持已禁用状态，以免旧任务干扰测试。Windows 上的 Claude 连接节点及其他软件不在清理范围。

### 2026-09-14 环境准备验收

| 机器 | 精确安装版本 | 最终状态 | 同机恢复备份目录 |
| --- | --- | --- | --- |
| Mac Intel | 0.1.5-rc.2 | 全新 web profile 正常运行，无微信插件、旧公网身份、旧 gate 状态 | /Users/markin/dsh-backups/clean-0.1.5-rc.2-20260914 |
| Ubuntu x64 | 0.1.5-rc.1 | 全新 web profile 正常运行，无微信插件、旧公网身份、旧 gate 状态 | /home/martin/dsh-backups/clean-0.1.5-rc.1-20260914 |
| Windows x64 | 0.1.2-rc.1 | 全新 web profile 正常运行，无微信插件、旧公网身份、旧 gate 状态；Claude 连接节点仍正常运行 | C:/Users/Martin/dsh-backups/clean-0.1.2-rc.1-20260914 |

- Mac/Ubuntu 停机前分别确认 49/9 个会话均空闲，备份各校验 4 个身份/配置文件；Windows 本轮校验 3 个文件。Windows 更早的原始数据备份 clean-rc2-20260914-013801 也保留，不能用本轮测试备份替代它。
- Mac 原 LaunchAgent、Ubuntu 原 user systemd unit 已停止并移入同机备份；Windows 原计划任务保持禁用（XML 备份在此前备份目录）。当前三台为手动后台启动的干净测试宿主，不启用原自动启动项。
- Mac 还移除了三条已退出的旧 dsh.wechat.update.* launchd 作业；这些作业曾重建日志目录。晚到日志另存 late-stale-updater-logs 后再启动全新宿主。
- Ubuntu 直接连接 registry.npmjs.org 时解析到代理虚拟地址并在 TLS 握手中断，npm 缓存因此给出了 misleading ETARGET。确认官方 rc.1 仍存在后，通过仅本次 SSH 连接存活的 loopback 代理完成官方 npm 精确版本安装；不关闭 TLS 校验、不改长期 npm/系统代理配置。连接完成后代理隧道关闭。
- 三台均未执行公网一行命令安装插件，后续由用户亲自执行 npx -y dsh-wechat-remote@latest 并配对验收。旧备份含凭据和历史数据，仅本机保存，不上传公开仓库或 npm。
