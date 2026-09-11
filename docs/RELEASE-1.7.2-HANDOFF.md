# 插件 1.7.2：发布基线与小程序接入交接

2026-09-11，内部技术记录。公开说明使用根目录 RELEASE-NOTES.md，不能把本文件里的调试/实现细节复制成面向用户的更新日志。

## 本版边界

- 正式前版 `v1.7.1`：`f39e7a3`；研发分支发布准备前 HEAD：`3c85185`。全部中间提交已在祖先链中，采用快进汇入 main，不另做会丢失改动的拣选。
- 本版不是只有二维码修复。下表代码全部属于插件 **1.7.2** 的组成部分；后续小程序研发应首先检测/复用这些接口，不重复搬运 DSH 原生逻辑，也不要认为还要等插件另外发一个功能版。
- “插件内含能力”不等于任意宿主都提供它，必须按 scope/连接查询 capabilities，缺失则隐藏；不等于小程序相应 UI 已正式上线。当前没有完成 Claude Code/Codex 等其他 Agent 适配器。

## 1.7.1 → 1.7.2 一并纳入的研发功能

| 功能 / 来源提交 | 插件实现与通用合同 | 小程序后续应复用的方式 / 边界 |
| --- | --- | --- |
| 工作区资源与交付物；`09a2fe1` | `src/agent-resources.ts`，RPC `agentResources`，schema `agent.resources.v1`；capabilities/list/resolve/prepare/chunk/release；历史/实时 `view.agentResources` 按 turn 提供文件引用 | 使用 scope 与不透明资源 ID 浏览、定位、预览/转发；只在完成轮最终回复挂交付集合。无需重新在客户端猜 DSH 路径或解析 shell 输出来寻找附件。20 MiB 下载限制；无文件删除/改名/任意写入能力 |
| 局域网/公网文件交付；`09a2fe1` | `src/public-relay-gateway.ts` 配合资源适配：LAN 分块、公网 E2EE + OSS artifact；scope 绑定、快照版本、摘要、过期与释放 | LAN 走加密控制载体，公网只接收加密对象描述符；不能退化为中继传明文/大文件。旧节点或缺少 OSS 不伪造已支持 |
| 通用文件输入；`204fe9e` | `src/agent-inputs.ts`，RPC `agentInputs.capabilities/upload`，schema `agent.inputs.v1`；`src/dsh-compatibility-api.ts` 解析上传令牌为原生 file receipt | 上传成功得到 scope 绑定短期 token，再按既有消息提交合同发送；文件 10 MiB、最多 6 个、准备并发 2。token 是不透明回执，不拿它当路径、URL或跨会话授权 |
| 新版原生流式/中断草稿；`09a2fe1` | `src/assistant-stream-compat.ts` / `src/dsh-realtime-compat.ts`；原生 follow opt-in `assistantStream:true`；转为旧客户端 chunk；可选 `agent.transcript.v1` | 使用现有文本/思考流；瞬态 revision/index 不能推进持久历史 cursor；失败尝试和最终回复替换规则保持独立。不要把 compact stream 解码再搬进小程序 |
| 完整轮次过程与工具/文件改动；`204fe9e`、`03db407` | `src/turn-activity.ts` / `src/history-service.ts`；`agent.activity.v1`，process 边界、answerSeq、answerParts、changedFiles | 过程折叠、正文、交付、文件改动各自独立；完整轮才折叠，未完成/错误不伪装已完成。reasoning 可以折叠而正文保持可见；失败后重试工具仍属于原轮过程 |
| 回合显示顺序；`1200b40` | `agent.activity.v1.layout = {startSeq, openingInputSeq}`；原生事件顺序不改 | 先应用显示锚点，再生成折叠控制器，避免上下文条出现在用户提问之前；后续插话不随开场输入搬动，缺少锚点不猜位置 |
| 历史分页完整性；`03db407` | `src/history-service.ts` 回补最早被截断的轮，统一派生完成轮视图；投影裁掉冗余 compact samples 前先提取计时/草稿 | 历史前插、刷新、重连复用同一合同；禁止因缺半轮就生成错误计数或部分折叠。不修改 DSH 磁盘历史 |
| 原生命令/权限与附件参数兼容；`288c40e` | `src/dsh-protocol-compat.ts` 按活动 Typert 描述符选择 `images` / `submittedAttachments`；严格的权限命令与原生回执 | 继续走通用控制调用，不在小程序按 DSH 版本拼字段；未知描述符失败封闭。此条不是新建了一套跨 Agent 斜杠菜单 UI，不能宣称其他 Agent 命令已接入 |
| 原生解码速度/计时；`ad0b9d7` 及 `09a2fe1` | `src/session-presentation.ts` 保留可选 `decodeMs/decodeTokens`；`src/turn-presentation.ts` 从原生 compact 时间提取首字/输出计时，沿用 `agent.turn-details.v1` | 胶囊详情按字段可用性展示，缺失不是零，不从文本长度估算 token；不会强制拆成两个按钮。每轮详情基础功能在 1.7.1 已有，本版是补齐新版原生数据 |

服务共用既有认证/加密通道，不另开数据端口。生成的 Typert host/client、安装器共用模块和实际发布 tgz 一并更新，不能只同步 src 而漏掉运行 lib。

## 本轮配对修复

1. QR v1 由一个序列化函数同时输出同源 `relay` / `relayOrigin`，兼容已发布小程序扫码前的 LAN 路由检查；保留公钥、nodeId、票据与 HTTPS 校验。
2. 生成/刷新 QR 申请新的一次性票据，不复用已消费但未过期的旧票据；并发申请去重。独立配对页不再每 25 秒自动换码，提供手动重新生成，禁止缓存。
3. 正常同账号重新扫码保持原身份/所有权；隔离测试中旧手机 3 节点、新手机恢复后仍是同 3 节点。没有新增“每个手机一组云端节点”模型。

## 明确尚未完成

- 换机免扫码自动恢复：小程序仍需登录后发现、幂等合并节点及可信身份恢复；不能把云端返回的公钥直接当成曾扫码信任的公钥。安全恢复方案未定前，不能保证插件/云端不再需要附加证明接口。
- 当前 Windows DSH 0.1.5-rc.1 + 插件 1.7.1 的只读 `/gate/update/check` 返回 `unverified`、`canInstall:false`。旧 1.7.1 自带自动重启白名单只到 0.1.2；改变云端清单无法给旧代码增加自动升级能力。不能承诺该组合能用旧按钮直接升级，也不能绕过保护。
- 未验证的未来 DSH、ARM64、任意进程包装方式不自动扩大兼容。0.1.6 / 0.1.7 只做未来版本号与能力/目录分离的模拟测试，不是这些真实发行版的兼容认证。
- 小程序的语音、粒子首页、抽屉布局及其他 UI 不属于本次插件发布，不修改/发布小程序；不升级、停止或重启真实主机。

## 验证与证据

- 完整构建、verify、npm test；不可变小程序快照 `cc1486a3049a`、`2a196f786fd4`、`29140d5d5021` 经真实插件/隔离云端 HTTP 路由配对回归。微信登录交换及配对后连接是 fixture，不算真实手机扫码。
- 小程序 19 项跨端测试覆盖握手/身份固定/加密重放、文件输入/资源、历史与过程展示；新增配对页生命周期/票据测试。候选包通过升级器实际归档审计。
- 发布时按包内容、SHA-256、GitHub 资产和 npm integrity 回读核对。真实手机扫码和实际一键升级由用户随后测试，不写成已经替用户执行。

## DSH 超前升级后仍可更新插件

- 根因：`update-service.ts` 把当前宿主版本锁在本地 `supportedDsh` 列表（最高 0.1.2），即使线上已提供兼容目标也拒绝更新。1.7.2 删除此门槛，`install-capabilities.ts` 对 webServer 请求监听/隔离、sessions get/list/flush、原生 dispose 做只读功能检查。WebUI 和独立安装器共用同一检查，不触发保存或停机。
- 目标包仍须由可刷新目录明确声明 DSH/平台/架构兼容；保留下载来源、SHA-256、归档审计、确认票据、包名版本、原启动身份、保存空闲检查、数据备份、重启验证隔离、失败回退。只修正当前宿主的冻结版本门槛，不将目标策略改为任意版本通配。
- 发布适配新 DSH 的目标包并刷新目录后，已安装 1.7.2 可以直接检查/升级，无需先给旧更新器补一个宿主版本号。未支持的版本无目标可选时，继续明确提示待验证，不要求用户一律先更新插件才能更新 DSH。
- 顺带按 DSH 原生 CLI 修正独立安装器启动参数为 `--profile <name>`，不再混合 `web --profile` 两种入口；这是安装器启动兼容修复，不改变用户日常命令。
- `scripts/test-real-update-forward.mjs`：仅允许新建 compat-forward-* 隔离根目录；使用本机真实 DSH 0.1.5-rc.1、模型无调用、公网连接禁用。先复现原版 1.7.1 拒绝，再由本版独立安装器过渡 1.7.2，随后走未修改的 WebUI 更新入口，测试下一版安装及损坏版本的回退。新包下载在 fixture 内以本地数据替代传输，原有来源/哈希/归档校验照常执行，不冒充公网发布测试。
- 1.7.3 / 1.7.4 仅为测试目录内改版本号/故障入口的合成包，绝不发布。真实发布仍是 1.7.2。更新前后核对测试会话、可读历史、原配对与 LAN 凭据；清理只停止本次隔离进程，不触碰真实节点。
- 新增单测覆盖未来 +1/+2 宿主号与能力/目录分离、缺失能力失败封闭、保存失败/状态不可读不停止宿主。新增生成器源文件登记，确保运行包与安装器包含能力模块。
- 实际通过：Windows x64 / macOS Intel x64 / Linux x64，均为已安装的 DSH 0.1.5-rc.1；三端都通过 1.7.1 → 1.7.2 独立安装、1.7.2 → 合成 1.7.3 WebUI 更新、合成 1.7.4 启动故障回退以及历史/配对保留。证据文件 `windows-native-forward.json`、`macos-native-forward.json`、`linux-native-forward.json` 位于下述发布证据目录。未操作用户真实节点、未实际调用模型。

## 发布与备份状态

用户已追加授权将宿主能力与目标兼容策略解耦纳入本版。修复已实施，正在完成发布验证；此阶段 npm/GitHub Latest 仍是 1.7.1，生产清单未改变。实际发布完成后补充下面的渠道回读记录。

发布准备已获用户授权，目标：GitHub 正式 `v1.7.2` 并设 Latest、npm `dsh-wechat-remote@1.7.2` 的 latest、生产兼容清单新增本版。实际完成情况在发布后补记，不以计划冒充上线成功。

工作区证据目录 `E:/agent remote/compat-artifacts/plugin-release-1.7.2-20260911/`。发布前完整 Git bundle + 工作区 patch，发布后保存正式标签/备份标签、完整 bundle 与镜像恢复核验。代码备份不包含在线身份私钥、配对凭据、云端数据库或业务历史；旧标签和已发布 1.7.1 资产不移动/覆盖。
