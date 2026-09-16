# 原生会话归档适配审阅

## 范围

从 v1.7.7-rc.1 的 8497dad 继续。仅 agentResources 服务扩展、独立 dsh-session-export 适配及生成的 Typert 契约、测试、包文件清单。原有文件 prepare 只提取共用的校验／交付过程；聊天、流式、更新器、通知、配对和云服务不改。归档能力按需调用，无空闲后台工作。

## 原生与安全边界

- 使用实际宿主 `connection.createSharedFetchHandler('/api')` 的固定 `/api/session.export` GET 路由，URLSearchParams 编码 sessionId，保留 includeDescendants=true。不读取或重建存储文件，不依赖全局／npx 安装路径，不注册替代路由。
- 入口仍是已配对客户端的现有 RPC 鉴权边界。内部 Connection 调度是宿主公开接口，不新开 HTTP 监听，不接受客户端传入下载 URL。
- 原生响应按流读取，观察取消且大小有界；错状态、非 ZIP、断流、取消、超限均不产生传输凭据。旧宿主没有 Connection 能力时明确提示电脑导出或更新 DSH；存在 Connection 但未挂载导出路由时也不宣称可用。
- 文件和归档共用 2 个准备并发、20 MiB 单文件、48 MiB 快照、16 份／5 分钟寿命。公网为现有加密 artifact 对象；局域网为 192 KiB 按需分块。没有扩大实时 HTTP 缓冲上限，没有公共 ZIP 链接。
- capabilities 的可选 purpose=sessionArchive 避免归档依赖工作区目录仍可浏览；不改变旧文件浏览响应，旧客户端可继续工作。旧插件忽略该扩展、不报告归档能力，小程序明确提示而不发失败 GET。

## 验证

构建、typecheck、verify、完整 npm test 通过；测试新增 scripts/test-session-export.mjs。设置 DSH_NATIVE_ROOT 到已安装官方 DSH 根目录可执行第 4 组原生验证：实际加载官方 Connection、导出模块和解压器，使用受控持久化／附件服务，验证原生根日志、子日志、图片、文件和 flush/close。此次 Windows 官方 DSH 0.1.5-rc.1 安装树验证四组全部通过；未设置环境时该组明确 skip，不假称验证。

配套小程序通过 483 项单元、候选及稳定插件各 22 项跨端集成、11 WXML／15 WXSS 原生编译。对象加密解密及局域网分块均核对完整字节；错误流和取消不输出残缺归档。测试不代表真实微信文件转发已验收。

没有安装、重启运行节点、修改云端或发布制品。包内版本仍为 1.7.7 候选，原 v1.7.7-rc.1 标签不移动；旧候选安装器内嵌包需在最终交付构建时重新生成。
