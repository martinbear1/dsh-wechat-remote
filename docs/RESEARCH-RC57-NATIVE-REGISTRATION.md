# RC57 原生安装接口注册修复（研发验收记录）

## 修复范围

- 外层 npm 安装器通过相对 `native/index.js` 入口挂载内嵌核心，使用 DSH 公开 `ctx.typert.register(TYPERT)` 登记核心生成的 Host face。登记归属当前 gate fiber，停用和卸载时由 Cordis effect 撤回。独立核心包仍使用官方 Typert Loader 自动发现，不加第二份登记。
- 相对入口保留内嵌核心的 client manifest 归属，避免把外层纯安装器误当成浏览器双面插件而丢失设置页模块。六个组件及核心 lib 内容仍与内置核心归档一致。
- 安装弹窗在 Host 接口不可读、状态尚未确认时给出有条件的手动重启建议。不伪造运行版本、不强行认定必须重启，也不增加自动重启、安装准入检查或另一端联动逻辑。

## 已验证

- Ubuntu DSH 0.2.0-rc.2、Mac Web DSH 0.1.7-rc.2：两种原有包归属（原版 1.7.13 外层、原版内嵌核心）通过原生删除/Add 后装 RC57；各自独立完整宿主、原生 manager、真实 pnpm 和本机 registry。
- 核心归属的旧接口撤回后，RC57 在同一进程重新登记严格定义，Host RPC 恢复；冷启动后两种归属均为一份插件、六组件 active、严格 RPC 有效、原生客户端模块进入 boot graph。
- 停用后严格定义撤回，重新启用后恢复；合成会话、配对身份、设置和另一端文件保留。
- Windows Desktop 实际 0.2.0-rc.1 发布运行时：原版 1.7.13 updater 与候选 updater 的五组独立原生升级、五组独立进程恢复通过。这一组不启动真实 gate 或应用窗口，不称为 Desktop GUI 验收。
- 完整 `npm test`、安装结果单元/组件测试、核心归档闭包、外层/内嵌核心字节一致性与旧更新归档读入范围检查通过。

## 保留的真实边界

- 原生管理器安装的旧外层 1.7.13 卸载后，同一个进程仍可能缓存旧模块解析与代码。重装后会出现子组件 failed-to-import、运行版本仍为旧版；需要正常重启实际 Web 服务。此修复不接管 Node/DSH 模块缓存，也不掩盖 native activation 诊断。
- 原有核心归属的重装在 native activation 检查时仍可能显示四个 `fiber state 1`（loading）警告，随后组件变为 active。严格接口不再永久缺失。瞬间 loading 诊断未被改写或隐藏。
- 本机 pnpm 可正常复用内容地址缓存。测试同时核对 registry 元数据和已安装 manifest、入口、client 字节，不把合法缓存命中伪报成新下载。
- 隔离完整宿主测试中的旧核心安装是官方 CLI Add 的原版内嵌归档，不是再次执行原版 NPX；不能把它等同于用户命令行全流程验收。用户的第二组原版 NPX 安装基线将在第一组真机验收后再准备。
- 真机 Mac 第一组已另行用原生 `inspect/installBundle/setBundleEnabled` 路径安装原版 1.7.13；原代码未修改，RC57 未安装，由用户执行卸载、Add `dsh-wechat-remote@latest`。
- 尚未正式发布；未知 Host/CPU 的兼容和手机重新接入不能凭上述测试宣称全部通过。

## 测试与恢复证据

研发备份：`../backups/native-interface-registration-rc57-20261013`。Mac 第一组记录：`../backups/mac-native13-reinstall-rc57-20261013`。只保存去敏后的证据；真实配对、会话、环境和 auth launch URL 留在原主机的私有备份中。
