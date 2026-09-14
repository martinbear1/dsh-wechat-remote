# 任务通知研发：当前插件契约

更新日期：2026-09-15。当前仅 kind=next 的统一提醒，不再有 complete/pending 两种预约。完整部署与验收记录见 ../../notifications-harness-remote-cloud-server/docs/TASK-NOTIFICATIONS-UNIFIED-20260915.md。

- 分支 research/task-notifications-20260914；main 仍为 1.7.5 / b767155；未发布新版本。
- 只修改自有插件，绝不修改 DSH 本体、用户配置、会话或配对。
- HR_TASK_NOTIFICATIONS_ENABLED=1 显式打开；关闭时不注册观察钩子、定时器或通知 RPC。
- 可选 RPC 仅 prepare 与短期 presence，使用原认证 LAN/E2EE 通道。不决策、不回答、不授权。
- 原生 Session 优先 snapshotEvents()，兼容旧 events 属性；绑定实际 session 对象、turn、seq、进程 epoch。尚未加载的闲置 Session 不伪造可用能力。
- 问答观察 ask_user_question 的执行生命周期，next 恰好一次，不等待网络、不改变结果/异常；审批使用 asked/decided 日志。
- 运行中遇到仍待处理的问答或审批，与明确 reason.kind=completed 的 turn/end，共享同一预约；已处理的旧待办不补发。异常、取消、重载、子工具结束不是成功完成。
- 当前待办尚未处理不能开启新的下一次预约；处理后可自愿再次订阅。已在等待登记的同一预约仍可重试。
- 重复和超时 prepare 重用同一个 watch/ID；最多16个 watch，每3秒最多4个并行观察，轮转，避免慢节点请求拖住整个观察队列。
- 未授权预约云端10分钟过期；显式登记后24小时。进程重启不猜测恢复，发送结果不确定不自动重发。
- 只发送状态类别、事件散列及节点/会话/轮次，不发送正文、答案、路径、命令。插件不持有微信 AppSecret。

验证：TypeScript 编译、verify、原有完整 npm test、8 项通知测试、21 项既有跨端集成、统一通知三端契约均通过。
Windows 当前安装副本已接入本次研发代码，2个通知文件哈希一致，原DSH核心与配对哈希一致、4会话保留、公网 online；不应把它称作完全未修改的正式制品。
更新/回退操作脚本 scripts/update-windows-notification-lab.ps1；初始从正式版切到研发版的备份、脚本继续保留作为灾备，不属于运行时代码。
