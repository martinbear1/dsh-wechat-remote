# 会话历史渲染归属审计（内部研发）

以原生事件为事实来源，独立实现通用展示协议；不修改 DSH 日志、不用页面 DOM 当数据接口、不从回复文案猜交付物。

## 核对来源

原生版本 0.1.5-rc.1，源码固定提交 `183f08e9c6dde7e36cd2318eaee70b0da08fb35e`。2026-09-10 约 20:58–21:05 只读查看本机 Chrome 的真实五轮历史，并展开末轮和“已思考”核对。未发送模型任务或改动权限。

| 事实/规则 | 原生源码（固定提交下） | 适配职责 |
| --- | --- | --- |
| 一步消息可同时包含 reasoning 与最终正文 | `packages/client/ui-chat/src/client/conversation-nodes/assistant.ts` | 原文完整保留；只隐藏 reasoning 分部，不丢失消息身份 |
| 过程边界、最终正文锚点、工具/消息计数 | 同目录 `turn-process.ts`、`turn-process-presentation.ts` | 插件输出 `agent.activity.v1`；客户端消费可选范围和分部标记 |
| 人类输入与运行时注入分离 | 同目录 `message.ts` | 人类/插话独立保留；非人类上下文可纳入过程；中途插话时保留最终 reasoning |
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
- 产品差异：小程序单独一个 Think 保留原工具条，多项过程合并，展开后摘要撤去。原生 WebUI 展开后仍保留可收起摘要。差异不改变数据协议。

## 验证边界

覆盖原始五轮离线回放、真实页面投影、分页前插、刷新、开合、迟到文件、能力热插拔、未知协议及中途插话。模拟器不等于 iPhone 真机选字/转发验收；指定 Windows 研发节点不代表其他 Agent、主机或正式版已验证。
