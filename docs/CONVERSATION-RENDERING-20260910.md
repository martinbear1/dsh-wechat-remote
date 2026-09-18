# 会话历史渲染协议

本文描述的插件适配代码已纳入 1.7.2；小程序消费端的正式发布是另一条流程。

以原生事件为事实来源，独立实现通用展示协议；不修改 DSH 日志、不用页面 DOM 当数据接口、不从回复文案猜交付物。

## 核对来源

原生版本 0.1.5-rc.1，源码固定提交 `183f08e9c6dde7e36cd2318eaee70b0da08fb35e`。2026-09-10 约 20:58–21:05 只读查看本机 Chrome 的真实五轮历史，并展开末轮和“已思考”核对。未发送模型任务或改动权限。

| 事实/规则 | 原生源码（固定提交下） | 适配职责 |
| --- | --- | --- |
| 一步消息可同时包含 reasoning 与最终正文 | `packages/client/ui-chat/src/client/conversation-nodes/assistant.ts` | 原文完整保留；只隐藏 reasoning 分部，不丢失消息身份 |
| 过程边界、最终正文锚点、工具/消息计数 | 同目录 `turn-process.ts`、`turn-process-presentation.ts` | 插件输出 `agent.activity.v1`；客户端消费可选范围和分部标记 |
| 人类输入与运行时注入分离 | 同目录 `message.ts` | 人类/插话独立保留；非人类上下文可纳入过程；中途插话时保留最终 reasoning |
| 事件顺序与显示顺序分离 | 同目录 `chat-snapshot-builder.ts` 的 `turnProcessPresentations`、`presentationPosition` | 插件证明开场输入锚点；客户端将本轮前置过程显示在输入后，不改原始 seq，不移动后续插话 |
| 完成轮的最后正文与用量/用时 | 同目录 `turn-tail.ts` | 统计由原生折叠函数提供，与过程开合、文件能力分离 |
| 显式交付与本轮文件改动不同 | `packages/client/ui-deliverables/src/client/turn-deliverables.ts` | 显式 presented 转为交付文件；成功写入/编辑转为文件改动；不猜 shell 输出 |
| 历史不完整时不进行紧凑折叠 | `packages/client/ui-chat/src/client/chat/ChatNodeSeat.tsx`、`ChatView.tsx` | 原生检查全局 hasMore；插件按最早受截断轮回补到 turn/start，只输出已验证整轮视图 |

## 真实现象与根因

原首个窗口从 seq 211 起，第一轮 start 在 seq 5、交付 seq 278、最终消息 seq 282、end seq 284；此前只回补最新轮，最早的第一轮仍缺头。下一页又只有头没有结尾。因此第一轮的过程、用量/用时无法在同一完整窗口派生。

原生完整历史显示：第一轮 55 次工具调用 / 27 条消息、5 项文件改动、6 张交付卡片、2.2M tok、8分26秒；末轮 4 次工具调用 / 2 条消息，最后 reasoning 一并折叠。上下文注入 + reasoning 折叠为“已思考”。原生记录未被删除，不能把显示暂缺称作文件丢失。

小程序另有独立错误：补历史时把整轮交付集合写进每条中间回复。现改为 resourcesByTurn 保存事实，渲染时只连接到完成轮的最终正文；刷新、展开、前插历史使用同一投影。Markdown 错位是整个列表使用一个原生 text 流，改为每个逻辑列表行独立布局，不改业务事件。

## 协议约束

- `agent.activity.v1.process` 可选 `boundary:"turn"` 表示 startSeq 是完整轮边界；`answerParts:["reasoning"]` 只控制答案中的该分部；includesContext 和 contextCount 独立声明上下文。结束条件、计数、归属必须有原生事实。旧字段/未知 schema 保持原文可见。
- `agent.resources.v1.turn` 是当前会话 scope 内轮标识。声明按 reference 去重，仅在完成轮最后正文投影一次，不能复制到所有 assistant 消息。
- `agent.turn-details.v1` 仍以原始 messageId 对应最后正文；不能因折叠的临时对象而丢失身份。
- 过程、交付、文件改动、统计、Markdown 独立。关闭一项不清除其他事实；重连重建事实缓存；迟到声明使相关投影缓存失效。
- 运行中、失败、中断、待处理项不自动隐藏。历史不完整或协议不认识时展开原文，不伪造完成。
- 与原生一致：单个上下文或最终 reasoning 也可构成过程；摘要始终保留，展开与收起共用一个控制器，没有两行门槛。

## 22:05 前置上下文与开场提问错位

只读回放本机分支会话第二轮：start 29、step 32、上下文 33、人类提问 34、上下文 35、最终正文 37、end 39。原生事件确实先注入上下文；WebUI 通过独立展示排序投影为 `提问 → 控制器 → 上下文 33 → 上下文 35 → 正文`。此前客户端用最早成员当控制器锚点，遗漏了这层原生语义。

- `agent.activity.v1.layout` 是可选的独立展示事实：`{startSeq, openingInputSeq}`。startSeq 来自完整 turn/start，openingInputSeq 是首次真实过程证据之前最早的人类输入；它不是任何时候出现的第一条人类消息。来源名称与文本均不参与判断。
- 过程证据与原生一致：可见 assistant 消息/流式内容、tool/call、append tool/result、llm/retry；空白流、tool-call 块起始、replace 回放、上下文注入不是证据。
- 插件在该输入抵达时发布 layout，结束视图再携带相同不可变事实。运行中的排序不依赖 completed；过程能否折叠仍由 process 单独控制。历史与实时链路共用适配器。
- 客户端单独缓存 layout 并在刷新时清除；先做展示排序，再做折叠、分页和渲染。只把该轮范围内输入之前的过程候选移到输入之后，保留原对象、seq 和后续插话顺序。命令、系统提示、错误与正文身份不被改写。
- 声明的输入不在窗口中时不猜位置、不折叠不完整范围；未知 schema/无 layout 的 Agent 保留原有显示。无需云端新接口，不依赖 DSH 命名。

本次验证：插件完整测试及制品校验通过；小程序 143 项单测、18 项跨端测试通过。只读回放上述原始 41 条事件，展开顺序确认为 `[34, control, 33, 35, 37]`，收起为 `[34, control, 37]`，源日志字节未变。开发者工具原生 WXML 验证运行中排序，以及六次展开/收起；控制条纵坐标均为 265。另回归 110 条中间消息的分页窗口与控制条、上下文单独构成过程的开合。截图与只读回放脚本留在工作区 `compat-artifacts/dsh015rc1-research-20260910`，不包含对真实会话的新提示词或权限操作。

## 验证边界

覆盖原始五轮离线回放、真实页面投影、分页前插、刷新、开合、迟到文件、能力热插拔、未知协议及中途插话。模拟器不等于 iPhone 真机选字/转发验收；指定 Windows 研发节点不代表其他 Agent、主机或正式版已验证。
