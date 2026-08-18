# dsh-wechat-remote（DSH 微信小程序远程插件）

让**微信小程序**安全接入电脑上的 DeepSeek Harness：电脑安装本插件后，用微信扫一扫
完成「微信用户 ↔ DSH」一对一身份绑定，之后在微信里即可实时控制 DSH（局域网直连，
公网通道预留）。

> 纯插件实现：不改动 DeepSeek Harness 的任何官方代码，卸载即还原。
> 与 iOS 版插件（`martinbear1/dsh-harness-remote`）是**两个独立产品**，各自演进。

## 状态

- [x] 身份认证方案设计（[docs/DESIGN-auth.md](docs/DESIGN-auth.md)）
- [ ] 插件实现（宿主网关 + 配对按钮客户端插件 + bundle 聚合，单包安装）
- [ ] 隔离环境全流程验证
- [ ] 真机配对联调

## 设计原则

1. **官方原生**：cordis bundle patch + 宿主插件 + 客户端插件，`dsh plugin --profile web add`
   一条命令安装，与官方插件规范一致。
2. **微信身份优先**：openid 一对一绑定 + 每次启动复核，token 只作为传输层凭证。
3. **安全基线**：每 IP 限速、常数时间比较、凭据文件 0600/icacls、CORS 白名单。
4. **公网预留**：二维码载荷与配置里保留公网通道字段，暂不暴露。

## 相关仓库

- 微信小程序端：`E:\Deepseek Harness`（另有其 git 管理）
- iOS 插件：`martinbear1/dsh-harness-remote`
