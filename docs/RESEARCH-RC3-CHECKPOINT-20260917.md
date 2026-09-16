# 1.7.7-rc.3 研究检查点

## 来源与边界

来源提交为 `daa0d21bab903384045b718f7210b557d29e0552`，分支为 `fix/install-reliability-1.7.7`。它位于 `v1.7.7-rc.2` / `8869030` 之后，包含归档超限提示澄清与边界回归；RC3 仅对齐版本字段、当前说明和完整本地制品，不修改业务逻辑，不纳入 ClawBot。

插件、安装器、两份锁文件、独立插件归档、安装器内嵌归档和发布元数据使用同一个版本 `1.7.7-rc.3`，通道为 preview。旧 RC 标签与旧制品保留。Git 提交和新标签由三端备份主任务统一登记。

本轮不发布 npm 或 GitHub Release、不推进 main、不更新云端目录、不安装或重启真实节点。生成的发布 URL 是预留的版本路径，不表示可公开下载。元数据中的 DSH/系统/架构沿用构建脚本的记录；其依据是此前版本，不能据此宣称 RC3 已获相同真机验证。RC2 节点交付及更早安装验收均保留为历史记录。

## 未修复问题

- R1：配套小程序滚动问题仍未修复。
- R2：配套小程序重试覆盖问题仍未修复。
- R3：配套小程序历史旧快照问题仍未修复。

以上三类问题由对应小程序审阅记录继续跟踪。本检查点只用于备份与继续研究，不可当作正式可发布基线；本地测试通过不替代手机体验、跨端验证或真机安装验收。

## 制品与验证

制品与证据目录：`E:/agent remote/compat-artifacts/plugin-checkpoint-1.7.7-rc.3-20260917/`。

- 插件 `harness-remote-dsh-wechat-remote-1.7.7-rc.3.tgz`：9,554,208 字节，SHA256 `9ed35854dc5eb8fce90c68506df64252ea988e883d9ff65f7d4b6abd46d67350`。
- 安装器 `dsh-wechat-remote-1.7.7-rc.3.tgz`：18,568,927 字节，SHA256 `7a0d10449bf70870534c0eba8780c67230914750698052aab078771cb469ad53`。
- 本地固定别名 `harness-remote-dsh-wechat-remote.tgz` 与带版本号的插件归档逐字节一致，仅供完整保存制品，不表示已经公开发布。
- 已完成 `npm run bundle`、安装器完整构建、两包 `npm pack`、`npm run verify` 和全量 `npm test`，退出码均为 0。归档超限专项 4 项通过；未配置真实 DSH 导出测试入口的一项跳过。Windows 宿主发现 17 项通过，POSIX symlink 一项按平台条件跳过。
- 独立核验两份清单、两份锁文件、两包版本、preview 通道、内嵌插件字节、发布条目大小/SHA256/版本路径、目录有效性及必要运行文件均通过；包中存在本轮归档超限提示，无 ClawBot 或节点私密状态文件。
- `scripts/verify-installer-payload.mjs` 仍硬编码历史 `1.7.6` / stable，本轮未运行或扩改该历史脚本；RC3 的归档一致性由独立只读核验完成。

证据文件：`bundle.log`、`build-installer.log`、`plugin-pack.json`、`installer-pack.json`、`verify.log`、`tests.log`、`artifact-verification.json`、`SHA256SUMS.txt`。本轮没有新增真机安装、节点升级或手机验收结论。
