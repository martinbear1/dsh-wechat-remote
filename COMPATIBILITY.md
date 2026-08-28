# DSH compatibility policy

鲸常在把小程序面对的协议固定为 `harness-remote-wechat-client-v1.6.4`，并由电脑插件把不同 DSH Host API 映射到该协议。DSH 升级时，优先更新插件适配层；只有产品能力或小程序协议本身发生变化时，才要求重新发布小程序。

## 当前验证矩阵

| 操作系统 | DSH 0.1.1-rc.2 | DSH 0.1.2-alpha.1 |
| --- | --- | --- |
| Windows | 通过 | 通过 |
| macOS | 通过 | 通过 |

每一格均使用同一插件压缩包在独立 `DSH_HOME` 中安装，验证：

- DSH 启动与插件装载
- 工作区、会话、历史、模型、命令、子代理和插件清单 RPC
- Agent 预设选择、会话重命名和取消
- `events.host` 与 `events.mux` 实时通道及新会话事件

`session.search` 是否具备全文索引由 DSH 部署配置决定；索引未启用时，小程序使用已加载会话的标题搜索兜底。

## 适配边界

- `src/dsh-host-adapter.ts` 是唯一允许理解多代 DSH Host API 差异的模块。
- 旧版使用 DSH 已有的点号 RPC 和 WebSocket；新版使用官方 `connection.createSharedFetchHandler('/api')`、Typert Remote 与 Stream。
- 适配基于运行时能力探测，不根据版本字符串猜测。
- 探测失败时返回明确的 `503/service-unavailable`，不绕过 DSH 认证，也不把 WebUI 当作接口。
- 小程序、云端中继和端到端加密数据面不感知 DSH 内部版本。

## 新 DSH 版本接入流程

1. 固定上一个兼容基线和小程序契约。
2. 在独立目录获取新 DSH，禁止直接升级正式用户环境。
3. 对比官方 Host API、Remote、Stream 和插件装载能力。
4. 只在插件适配层增加能力映射；不可用能力给出可解释的降级。
5. 用同一候选包完成 Windows/macOS × 旧版/新版矩阵。
6. 运行插件测试、冻结契约测试和云端兼容测试。
7. 先发布插件版本，再安排真实设备灰度；除非冻结协议改变，否则不要求小程序发版。

维护门禁脚本：

- `npm run smoke:installed-gate`：只读核心 RPC 与双实时通道。
- `npm run smoke:installed-gate:deep`：在指定测试目录创建临时工作区和会话，验证读写及实时事件后清理。

