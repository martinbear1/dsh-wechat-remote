# 群工作流与 DSH 原生职业预设：已核对接口及缺口

核对时间：2026-10-02。本文是本地代码/类型声明的只读研究，未修改宿主预设、默认配置或用户目录，未创建/恢复/运行 Agent。

## 验证边界

本轮插件工作区实际安装的 `@deepseek-ai/dsh-agent-presets`、`@deepseek-ai/dsh-skill` 和 `@deepseek-ai/dsh-tools` 为 `0.1.1-rc.2`。接口证据来自这些实际依赖的 `lib/types/*.d.ts` 及插件现有适配代码，不代表已在 DSH 0.2.0 真机、Web/Desktop 所有发布版本或所有模型提供方上验收。

群工作流专项通过真实已安装 ToolRuntime 验证原生工具和 Code Mode 调用，验证的是本轮数据规则包/工作记录/卡片适配，不是完整职业预设创建器。

## 四层不能混称

- 原生 preset 决定职业工作方法、基础提示词以及宿主插件/工具组合。
- Agent 与工作实例保留具体用户、班级或项目的身份、资料和记忆，不能因相同 preset 或 cwd 自动合并。
- skill 说明何时、为何、如何使用现有工具；说明文字本身不授予权限。
- ModePackage 是可复用的群任务字段、结果字段、卡片映射、能力依赖和批准规则。它不是原生 preset，也不创建职业 Agent。

本轮工作记录按 `nodeId + sessionId + sessionGeneration + workflowId` 隔离，固定绑定模式 id/version/digest。共享模板不等于共享答案或任务；跨会话业务实例加入还未开放。

## 实际原生接口

### AgentPresets

证据：`node_modules/@deepseek-ai/dsh-agent-presets/lib/types/index.d.ts`、`authoring.d.ts`。

- `list()` / `resolve()` 重新扫描配置 roots；`read(id)` 只读原生 composition 文本。
- `authorable` 和 `roots` 反映宿主实际可写的 user root，不应由插件猜路径。
- `copy(from, id, name?)` 是公开的创建写入接口：完整复制已存在 preset 的目录，含 composition、metadata、skills 和 assets；不接受任意 composition 字符串，不覆盖已存在目标，不写 shipped root。
- `remove(id)` 只删除可写 user root 的预设；不是创建器正常流程所必需的步骤。
- `mount(agentCtx,id)` 是 Agent factory setup 阶段的受控入口，不应从群任务工具中偷偷启动一个 Agent。
- `recompose(agentCtx,id)` 要求调用方证明 Agent 尚未产生内容，接口本身不替调用方检查历史。现有对话不能靠直接调用它中途替换工具组合。
- preset 采用 standing mount。新会话可以使用文件变更后的 generation，但已经加入旧 generation 的会话保留原组合；不能把改文件描述为已更新所有旧会话。

现有手机兼容适配 `src/dsh-protocol-compat.ts` 只有 `agentPreset.list` → 原生 `agentPresets.list`，以及 `agentPreset.select` → 原生 `agentPresets.select`。选择应继续经过宿主原生控制器的空会话检查，而不是让插件直接 recompose。

### SkillRegistry

证据：`node_modules/@deepseek-ai/dsh-skill/lib/types/index.d.ts`。

- `register(SkillRegistration)` 注册受信任包内只读 skill，并返回 Cordis disposer；这适合本轮固定 `human-workflow` skill。
- 注册作用域来自调用 context：宿主 context 是全局层，preset standing context 是相应 preset 层；不能把某用户/班级资料写进全局 skill。
- `list/get` 的读取应传实际 Agent 的 `scope` 和工作区 `cwd`，并传取消信号；不能用无 scope 的全局目录冒充该 Agent 的全部技能。
- metadata 支持 `modelInvocable` / `userInvocable`，它们是技能发现与调用控制，不是云端任务授权。
- `registerProvider` 可支持独立来源，但不是本轮引入动态远端/任意 URL 技能代码的理由。

### 工具与资源适配

本轮 `human_workflow_*`、`human_mode_*` 是固定 ToolDefinition；没有 Agent approve/activate/rollback 工具。主人批准只能通过受保护的 RPC 页面进入，服务端再校验预览、精确内容版本及激活 CAS。

`src/agent-resources.ts` 的 `AgentResourcesService` 已实现当前会话工作区的文件浏览、受签名引用、稳定读取、下载及会话归档。它没有写文件/改 composition/创建职业 preset 的接口；不能用下载服务当作绕过原生作者边界的文件写入后门。本次所核对依赖中未取得一个可用于任意职业 composition 保存的 `ResourcesService` API，因此不宣称它已经具备该能力。

## 可落地的后续路径

1. 职业预设创建助手先收集工作方法和能力需求，生成宿主无关、data-only 的职业规格；不把具体学生/客户资料放进可复用规格。
2. 在当前宿主实际 `list/resolve/authorable` 能力基础上选择受信任 preset 起点，展示新增工具、提示词和资料范围，由主人明确批准。
3. 用原生 `copy` 建立独立 user preset。仅复制不能生成新的职业工作方法；若需要保存自定义职业配置，必须另做有边界的作者适配，或依赖已核实的原生作者 API。不得谎称当前 `copy` 支持提交任意 YAML。
4. 职业配置若通过插件提供，应限定受信任包内插件与固定配置 schema，预览并锁定版本；不让 Agent 注入任意 module、脚本、URL 或改变权限。先完成兼容性与失败回滚测试，再接入原生保存入口。
5. 经原生选 preset / 新会话流程创建工作实例，逐步询问身份及业务资料。业务空间 ID、工作目录和跨会话加入必须显式选择；旧会话与旧工作记录保持原版本和原范围。

当前缺口包括职业规格和原生 composition 的可靠映射、主人预览/批准和原生保存适配、能力/skill 选择、工作实例目录与记忆初始化、显式跨会话加入授权，以及对应真实宿主和模型兼容验收。群任务附件、成员姓名认领、私密结果和自动化也不能由一份 preset/skill 文本替代实现。
