# 插件 1.7.6：安装来源、原生机制与 ARM64 更新审阅

## 发布边界

- 最终用户授权：从 `v1.7.6-rc.1` 继续，保留通知功能，合入 npx 安装及 ARM64 WebUI 更新修复；插件、npm 和 GitHub 正式发布统一 `1.7.6`。
- 先前的“npm 1.7.6 内嵌原样 1.7.5”、以及“从 1.7.5 单独发稳定修复版”均已被用户后续指令替代，未发布。独立候选分支 `release/1.7.6-stable` 不用于本次发布；不得混用其产物。
- 既有 `v1.7.6-rc.1` 标签和附件不改写；新版本继承其功能，不把源码或通知能力退回 1.7.5。
- 当前 Windows 用户节点不升级、不重启；所有新增实际测试使用独立 home、npm prefix/cache 和端口。无模型调用、无真实凭据或公网节点注册。

## 审阅结论与改动

| 链路 | 核对结果 | 本次处理 |
| --- | --- | --- |
| 首次安装识别 | 旧代码先从 PATH 选 CLI；纯 npx 找不到、共存时可能选错全局副本 | 现有 profile 先原生握手，以宿主真实 CLI/PID/home/profile 为准；只有未运行时才发现安装候选 |
| 安装候选 | Windows shim 是文本，不等于 POSIX 链接；缓存不在另一终端 PATH | 只读检查标准包目录、项目父目录、已构建源码、npm 配置的 prefix/cache；不执行 shim、不扫描全盘、不下载另一份 DSH |
| 多版本与身份 | 多个缓存版本不能按日期或版本号猜用户意图 | 去重后要求选择；显式 CLI/启动 PID 仍严格校验，home/profile/令牌校验保留 |
| 非默认端口/慢热加载 | 只检查 3080 可能误启动第二个宿主 | 有界进程检查仅用于阻止额外启动，不能授权安装或停止某 PID |
| 安装执行 | `stageProfile` 调 DSH 原生 `plugin --profile ... add`，由原生 CLI 维护 bundle 列表 | 保留；不手写常规 profile manifest，不覆盖 DSH 的 node_modules 或全局 shim |
| 临时安装控制 | 通过原生用户 patch/HMR 加载，随机令牌绑定一次操作 | 保留精确恢复和并发用户编辑保护；补充握手地址检查，区分查找/取消错误与等待超时 |
| 打包 | 原构建器从根插件版本推断内嵌归档版本，独立安装器修复会误标 | 从实际归档 package.json 读取插件版本；最终内嵌插件与 GitHub 1.7.6 附件逐字节相同 |
| POSIX 重启 | npm/npx 的 argv 可保留 `.bin/dsh` 链接，而宿主上报真实 `lib/bin.js`；Mac 实际首次安装复现范围校验失败 | 验证链接与真实 CLI 一致后规范化启动入口，其余参数不变；运行中进程识别同时覆盖 bin 链接 |
| ARM64 WebUI | 1.7.5 存在单独的 x64 判断，与已修复的一行命令入口不同 | 删除重复架构门槛，保留原生能力、任务保存、启动归属、完整性校验和回退 |
| 云端 | 旧版把未实测组合排除在更新推荐之外 | 共享策略中实测记录仅是证据，不作白名单；未知 DSH/CPU 仍推荐较新正式版，仅保留明确撤回/已知不兼容及通道、不降级约束 |
| 小程序 | 通用更新展示和安装命令，不持有本地安装目录逻辑 | 不改页面/连接/配对；相关 12 项回归通过 |

## 与官方插件机制的关系

对照官方 `docs/user/develop/basic/publish.md`、`packages/boot/app-boot/README.md` 以及本机 DSH 0.1.5-rc.1 的原生加载/安装实现：

- 根清单声明 `dsh.bundle.patch`，bundle 的 `cordis.patch.yml` 插入本包；这是官方配置层，不是二进制修改或对本体打补丁。
- 入口使用 Cordis `apply` / `inject`，释放函数清理监听、连接、定时器及子服务；既有 lifecycle 回归通过。
- 插件通过宿主 `webServer`、Typert、Session 等服务工作。旧小程序协议的转换集中在宿主兼容层；不修改 Session 原型或重写 DSH 安装文件。
- 浏览器端依赖宿主 React/连接/设置插槽，并按宿主 module loader 格式生成惰性包。官方 settings-card cookbook 明确说明外部插件需自行复现该输出格式，因为内部构建 preset 尚未发布。此适配不是“获得官方认证”的证明；宿主将来变更客户端加载契约仍需回归。
- 分发预构建 tarball，依赖随包提供，原生 pnpm 安装禁用构建脚本；不要求终端用户允许未知 prepare 脚本。
- 并非所有代码都属于 DSH 官方 SDK：微信认证、公网加密、云端对象及小程序 RPC 为本产品的独立功能。它们通过原生扩展点接入，不应包装为官方背书。

参考：
- https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/user/develop/basic/publish.md
- https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/boot/app-boot/README.md
- https://docs.npmjs.com/cli/v11/commands/npm-exec/
- https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/cookbook/adding-a-settings-card.md
- https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/subsystems/client-modules.md

## 一键更新审阅及明确边界

- `UpdateService.eligibility` 直接使用当前进程 `argv[1]` 的真实 CLI，不依赖首次安装器的 PATH 查找。
- worker 记录实际 Node、CLI、参数、工作目录以及宿主管理方式；在原宿主环境中创建，完成原生保存/停机、暂存安装、重启验证和失败恢复。
- npx 来源本身不是拒绝条件；缓存路径失效时不能静默下载另一版 DSH 或改为全局版。
- **保留而非宣称解决的边界**：Electron、附加 Node 启动参数、未确认的进程管理方式、非标准配置或不可安全迁移的链接依赖等仍会安全拒绝自动重启。这些是实际启动/保存能力与归属条件，不可用缺少测试记录替代；CPU 或 DSH 未登记不会阻止更新。允许尝试不等于声称所有组合实测通过。
- 自定义 `DSH_HOME` 必须在新终端保持一致或指定 `--home`，配置名用 `--profile`。不同 OS 用户、WSL/容器属于不同运行环境，不能从宿主随意替换。多份同时使用同一可写 profile 的进程不是受支持的安装目标。
- ARM64 修复属于实际插件 runtime，用户已追加授权合入正式 1.7.6；不能宣称旧 1.7.5 自身的 WebUI 已被远程修好。旧 ARM 插件需要用新版一行命令升级一次。

## 验证方式

- 新增只读发现/身份单测：全局、npx、Windows shim、项目、本地构建源码、自定义 prefix、多缓存版本、失效缓存、中文/空格、参数与拒绝错误目标。
- 全量原有插件测试、制品校验、类型检查，以及云端/小程序的关联更新回归。
- 实际 npx 验收必须同时隔离 npm prefix 和 cache：仅移除 PATH 仍可能被 npm 复用现有全局包。验收脚本强制检查启动进程确实来自独立缓存。
- 未授权访问的新 DSH WebUI 会返回 401；仅作为服务已监听的信号，随后必须以当前测试 profile、真实进程及认证 RPC 确认身份。
- 实际测试及发布回读的最终结果在完成后追加。不得把发现阶段的模拟、旧的全局环境测试或未完成的用例写成 npx 端到端通过。

## 最终候选验收（2026-09-15）

- 基于 RC 的正式候选保留全部通知源码；通知 12 项、全量原有插件回归、更新策略 24 项、安全 18 项、选择 12 项及发现 17 项（Windows 跳过 POSIX 链接专属项）通过。
- Windows / macOS Intel / Linux x64 分别使用实际 npm npx 缓存中的 DSH 0.1.5-rc.1，在空数据目录首次安装同一候选包、从普通 PATH 重复安装、再次以 npx 启动均通过。校验安装后的 update-policy/update-service/update-worker 字节与候选归档相同，排除同版旧 npm 缓存误测。
- 最终锁恢复候选报告目录分别为 `npx-native-proof-bjOvtm`、`npx-native-proof-I6d9s7`、`npx-native-proof-CWLIaD`。旧运行节点、配对和全局 DSH 安装未改动。
- 初次 ARM 故障注入暴露：候选插件加载失败时，DSH 的退出可能挂起，SIGTERM 后未退出导致备份无法复位。现在只对本次事务持有句柄的新候选进程，在等待正常退出超时后发送 SIGKILL，再验证退出后恢复；绝不强杀发现到的 PID 或用户原宿主。
- 进一步复测发现 DSH 原生 atomic-write 的凭据锁可能在独占创建后、写入 PID 前被中断，空锁不会按年龄自动过期。候选停机前捕获 PID 内容或 Linux 中该子进程仍打开的精确文件描述符（设备/inode 一致），确认子进程退出后再将同一锁移入本次事务备份；不改凭据，不删除未知归属或被替换的锁。正常进程与未知锁保持原样，独立安全测试覆盖这些边界。
- 云端 115 项与小程序 12 项关联测试通过；小程序零改动。云端程序改动仅共享更新策略，通知/配对/支付/客服/中继其他源码保持不变。
- 最终锁恢复候选插件 9549941 字节，SHA256 `ddd14140e93eaf1704dcca7380b1f99d8243089c2be337eaf94d2e87de4a0ff5`；npm 包 18505422 字节，SHA256 `9d8e5a509ba39dee880a52af07fd8e9f7f1cf36f5b8073c245d123602eeb1f87`。内嵌插件与独立归档逐字节一致。此前未发布候选归档仅保留为审阅证据，不用于发布。发布后必须再次下载核对。
- 最终同一归档的 Windows x64、macOS Intel、Linux x64、Linux ARM64 均通过原生 1.7.5 → 1.7.6 命令升级、WebUI 后续升级/自动重启、故意损坏候选后的失败回退；每步核对会话及配对不变。后三类场景使用真实宿主与更新 API，仅下载传输指向隔离的未发布合成版本，不对用户节点注入故障。报告为 `lockfix-candidate/forward-{windows,mac,linux,arm64}.json`，均 `ok=true`。
- ARM64 实际复现空凭据锁，失败候选 PID 的打开文件描述符证明归属；停机后锁被保留到该事务的 `candidate-credentials-lock.before-rollback`，旧插件恢复成功。旧 1.7.5 的架构错误也已在同一真机复现，不把模拟放行等同于实际重启。

## 后续发布流程

- GitHub/npm 发布本身不会自动同步云端目录。每次发布须从实际插件归档生成版本、渠道、下载 URL、字节数和 SHA256，验证线上文件相同，再原子更新云端配置目录。
- 普通目录更新由服务热加载，不必重启；本次 1.2.13 因共享策略源码变化才部署并重启中继。部署不得触碰独立通知服务、数据库和账号/配对状态。
- 旧 1.7.5/RC 更新器内的本地架构门槛不会因云端更新而消失；旧 ARM 或未登记 DSH 用户需用新版 npm 命令过渡一次。1.7.6 起按实际能力检查，实测矩阵不再用于更新准入。
