# 1.7.7-rc.2 研究节点交付

## 版本与边界

源代码：`7600f4080568cb05a31771db5e74a3aec6bf16ac`，分支 `fix/install-reliability-1.7.7`。继承已保存的 `v1.7.7-rc.1` / `8497dad` 和跨端归档修复 `8d6ddba`，不含 ClawBot。原 RC1 标签不移动；本次以 RC2 保存新检查点。

用户要求字段一致后，插件、安装器、两份锁文件、内嵌包和说明统一为 `1.7.7-rc.2`，通道为 preview。版本校验已加入现有 verify，不另建发布机制。此前仅写 `1.7.7` 的研究包不再用于这次交付。

小程序为独立产品版本线，当前开发工程仍为 `1.7.6-trial.1` 包字段、`perf/miniprogram-rendering-20260916` 分支，功能代码 `701ec50`；它不是已上传体验包的代码。只有从此工程生成的真机调试／预览包包含本轮优化。插件 RC2 不代表小程序也叫 RC2。

本次不发布 npm/GitHub、不推进 main、不更新云端、不上传或提审小程序，不更新电视盒子或儿童笔记本。

## 可核验制品

- 插件 `harness-remote-dsh-wechat-remote-1.7.7-rc.2.tgz`：SHA256 `f7b99a4fd4cc536e53da0fc7f9af2c5f303143ccae8fe85d21ae0432821ec294`。
- 安装器 `dsh-wechat-remote-1.7.7-rc.2.tgz`：SHA256 `93bbd9afb51f764a7f06b4ae8b56d9d5aca4aed65a71d07c99781f5f2e3042ad`。
- 两包内插件逐字节一致；声明的版本、preview 通道、大小和 SHA 均与内容一致。运行包未包含 ClawBot 目录。
- 制品、清单及本地证据：`E:/agent remote/compat-artifacts/session-export-cross-end-20260916/node-rollout-rc2/`。私人恢复资料只保留本机，不纳入 Git 或公开安装包。

## 三台结果

| 主机 | DSH | 插件／运行时上报 | 会话保留 | 公网最终状态 | 鉴权 WebUI／原生归档 |
| --- | --- | --- | --- | --- | --- |
| Windows Peach x64 | 0.1.5-rc.1 | 1.7.7-rc.2 | 9/9 | online | 通过／1,923,211 字节 |
| MacBook Intel x64 | 0.1.5-rc.1 | 1.7.7-rc.2 | 4/4 | online | 通过／423 字节 |
| Ubuntu x64 | 0.1.5-rc.1 | 1.7.7-rc.2 | 2/2 | online | 通过／421 字节 |

逐台核对 95 个运行／声明／注册文件与目标包相同，凭据、设置、节点身份和配对摘要未变，会话 ID 清单未变。归档使用真实宿主公开 Connection 和鉴权分块接口，在同一主机内存中读取并校验字节／ZIP 特征后释放；没有把会话内容上传到测试服务。Mac/Ubuntu 本次抽取的会话较小，不以它们代替有附件的大归档用例；非空日志及图片／文件归档已有原生模块回归证据，手机转发仍待验收。

Windows 使用打包安装器正常升级。Mac/Ubuntu 先前研究包字段为 1.7.7，语义排序高于 RC2，因此本次按用户明确授权固定安装目标：使用相同原生控制通道、同一个更新 worker 和官方 plugin add 完成切换，没有改包内旧版本伪装升级，也没有放宽产品安装器禁止自动降级的规则。一次性操作记录在证据目录，不进入插件运行代码。

Mac 在版本对齐指令到达前已安装无后缀构建，之后按相同方式再次对齐 RC2。首次额外 WebUI 探测因 Node fetch 不保留浏览器重定向 Cookie 返回 401；修正的是只读验收请求，未改 DSH 鉴权。最终三台均按原生 Cookie 跳转验证成功。

## 恢复资料

- Windows 原 profile：`C:/Users/Martin/.dsh/harness-remote-updates/b563e3134eae8a8efabf1dd4b2fcb15e/profile-before`。
- Mac 原 profile：`/Users/markin/.dsh/harness-remote-updates/d685e498919a3cf5adea8138a8880f90/profile-before`。更早 ClawBot 无关，Mac 本轮未含此功能。
- Ubuntu 原 profile：`/home/martin/.dsh/harness-remote-updates/9e4b2e8333018acd212113665ea1698d/profile-before`。
- Windows 的 `.dsh/clawbot/state.json` 内容未变，并额外保存私有副本；旧插件代码保存在更新前 profile 中。恢复需要明确切回对应构建，不能只改版本字段。无须重新扫码或删除节点。

## 验证及尚待验收

插件全量回归通过；版本对齐后的更新专项通过。Windows 上既有 POSIX symlink 单测跳过仍如实保留，三台真实更新结果不能据此写成所有平台／架构都验证完成。配套小程序 483 单元、公网子集 20、候选／正式插件各 22 集成、11 WXML、15 WXSS 和 76 运行 JS 检查通过。

记录：`rc2-plugin-tests.log`、`rc2-update-tests.log`、`rc2-miniprogram-verification/verification.json`，均在本次证据父目录。抽屉帧率、键盘与光标观感、手机后台恢复、5G 切换、微信订阅和文件转发不由这些检查替代。
