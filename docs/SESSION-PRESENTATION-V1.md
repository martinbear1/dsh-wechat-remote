# 送审前展示协议与插件文案整理

2026-09-09，本地候选，基于 RC5 及原生子代理地址修复。尚未合并 main、创建 GitHub Release 或修改 Latest。

## 原生接口与通用展示

DSH `session/follow` / `session/page` 的记录、游标、投影保持原样。`src/session-presentation.ts` 只从原生投影添加 `agent.*.v1` 通用状态，历史快照和实时投影采用同一个转换函数，不修改磁盘会话、不推算缺失数值、不改变原生事件次序。

通用键包括 metrics、usage、context、composition、planMode、plan、goal；键名为 `agent.<name>.v1`。原生 sessionStats / tokenUsage / contextPressure / contextBreakdown / plan / todos / goal 均保留，以免影响已发布客户端。

统计口径：未缓存输入、缓存读取、缓存写入互斥；缓存命中率为 cacheRead / (input + cacheRead + cacheWrite)。上下文与组成标明估算；todo 执行步骤与 plan 模式分开。无目标返回 null，不能从助手文字猜测目标或计划。

typed DSH 适配路径添加上述投影；旧运行时直通路径不伪称支持新协议，由小程序的固定 DSH 兼容边界转换。新 Agent 连接器应实现同一展示模型，而不把本体字段或父子 SessionAddress 推给页面。当前没有实现 Claude 连接器。

## 插件设置

产品名改为 Agent远程管理助手。更新卡片保留当前 DSH/插件版本、检查按钮、目标版本、兼容标签、可执行的更新按钮；阻断原因折叠展示，去掉重复开发说明。预览通道仍明确标识。更新重启确认、进度、错误、包校验、鉴权和回滚行为未删减。

## 验证及边界

全套 npm test、bundle 和 verify 通过。新测试覆盖原生数据不变、附加投影、空值清除、缺失数值等。小程序与候选插件的 Windows 真实只读审计覆盖 10 条主会话、21 次工具输入/输出、7 类投影，转换结果一致。

本轮未替换三台测试主机的插件安装，未升级 DSH 本体，未改配对、账号、云端服务。手机 UI 及此精简版插件设置的真实交互需在正式发布前复测。
