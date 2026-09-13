# ARM64 真实安装验收与慢启动修复（2026-09-14）

## 范围与结论

用户要求在局域网 Linux 电视盒子上安装 DSH `0.1.5-rc.1`，对比新旧公网安装器，验证本体、插件和节点配对能力。随后明确要求先完成一行命令安装验收，暂停配对。

- 真实硬件：X96-Q v5.1，四核 Cortex-A53，约 2 GB RAM，Debian 12 / Armbian，`aarch64` / Node `arm64`。
- Node `22.22.2`，npm `10.9.7`，DSH CLI `0.1.5-rc.1`。
- DSH 来自真实 `npm install --global --prefix <隔离目录> @deepseek-ai/dsh@0.1.5-rc.1`。该版本的依赖范围允许部分内部包解析到 `0.1.5-rc.2`，本次未改锁定它们；这是实际 npm 安装结果，不是声称所有内部包均为 rc.1 的构建。
- 只操作电视盒子的隔离测试目录；未动 Windows、Mac、Ubuntu 的 DSH 配置和节点。

| 实际运行对象 | 结果 |
| --- | --- |
| 公网安装器 `1.7.2` | 退出 1，复现“当前 DSH 版本或系统尚无已验证的插件版本”；没有写入插件，原 DSH 仍可用 |
| 公网安装器 `1.7.3` | 越过准入限制并写入插件；重启 60 秒超时，回退停进程再因 10 秒限时失败；不能算安装成功 |
| 本地打包修正候选 | 未运行 DSH、没有 profile 的场景，一条 npx 命令完成初始化、安装、自动重启和验证，退出 0 |
| 候选包重复执行 | 返回“无需更新”，不重启、不改变节点身份 |
| 候选包 `--repair` | 创建真实测试工作区及一条空会话后重装，自动重启成功；身份、令牌、会话 ID 集合不变，历史可读，公网 online |

**候选包未发布。** 验收时 npm `latest` 仍是 `1.7.3`。候选保留开发中的 `1.7.3` 包内版本，仅用于本地 tarball 验证，不能冒充公网同版本；后续发布必须递增安装器版本并对公网最终包复测。

## 架构拒绝的确切原因

公网 `1.7.2` 内置规则包含 Linux、DSH `0.1.5-rc.1`，但 `architectures` 只有 `x64`。在实际盒子环境中没有匹配项。相同公开代码的对照探针仅将输入架构改为 x64 后就匹配；这项对照是规则测试，不是 x64 硬件运行测试。

公网 `1.7.2`、`1.7.3` 和本轮候选携带的插件归档完全相同，都是插件 `1.7.2`：

`SHA256 0eb296a3a0c84f080148280f9b9419516a9dc640c9e13aa8cf014120aea591ee`

因此首次旧版拒绝不是插件二进制缺少 ARM64，也不是本体版本 rc.1 不在旧规则中。

## 慢启动复现与修复

公网 `1.7.3` 首次失败后，通过普通启动命令恢复已写入的隔离 profile，约 63.35 秒后插件本地接口可用。此步骤只用于定位，未计入安装通过。

再次从新的隔离 home 执行公网 `npx -y dsh-wechat-remote@1.7.3`：取消 Node 人工 heap 上限、nice、CPUQuota 和 IOWeight，只保留防止整个家庭主机 OOM 的 1400 MB / 256 MB swap 保护。CPU 无节流，内存 max / oom / oom_kill 均为 0，仍复现 60 秒验证失败。观察到 70.3 秒进程尚在、75.3 秒已退出，回退的 10 秒停止预算不够。

共享代码调整：

1. 重启健康检查总限时 60 → 180 秒；仍按真实接口就绪立即结束，未增加固定等待，也未绕过版本、会话、维护状态或数据校验。
2. 仅对本次持有的重启进程句柄，正常 SIGTERM 退出等待 10 → 30 秒；不增加强杀，不按端口查找并杀其他进程。
3. 冷启动 profile 初始化及原生安装握手最大等待均为 180 秒；profile 初始化增加提前退出检查。
4. 回退再次失败时保存独立 `rollback-failure.json`，不再丢失第二个失败原因。

第一次候选完整成功的真实重启耗时约 63.42 秒：`restarted-process.json` 为 04:17:08.844，`verification-complete.json` 为 04:18:12.264。这直接说明旧 60 秒边界会误判此设备。

本轮没有进行完整故障注入回退验收，也不声称所有回退分支已验证。特别是首次安装回退到原本没有插件的 profile，现有健康检查仍依赖插件 RPC，需要另行验证/完善；本次没有借伪造验证文件、跳过维护保护或手动改事务状态来算通过。

## 验收证据

候选安装器归档 SHA256：

`6568f187378564b5b17287c4f6b5384b7dfac5e629bd9b06e11b75f5c53247bb`

候选安装命令为一条 `npx -y --package <candidate.tgz> dsh-wechat-remote`，并非公网 `@latest`。对应 `--repair` 重装也只执行一条命令。未改动 npm 公共缓存中的旧、新发布包。

本地私有证据目录：`E:/agent remote/compat-artifacts/tvbox-arm64-rc1-20260914/`。

- `old-installer-proof.json`、`admission-comparison.json`
- `public-173-default-runtime-proof.json`、`public-173-restart-observations.ndjson`
- `candidate-cold-proof.json`、`candidate-repeat-repair-proof.json`
- `candidate/dsh-wechat-remote-1.7.3.tgz`

电视盒子隔离目录：`/mnt/data/dsh-arm64-rc1-test-20260914/`。通过测试的运行 profile 在 `case-installer-1.7.3-candidate-cold-packed/dsh-home`。其余失败目录及原始备份均保留。测试过程中纠正过 HOME、npm 代理配置、systemd scope 注入的服务标记和本地 tarball 的 npx 参数，这些早期测试环境错误未计为产品准入测试结果。

`npm run bundle`、`npm run test:updates`、完整 `npm test` 均通过；新增正常慢退出、退出等待有界、已退出句柄不发信号的回归检查。

## 当前状态与未覆盖边界

- 真实 ARM64 插件本地接口、工作区创建、会话创建、历史读取、自动重启、身份保存及公网在线已验证。
- 用户要求暂缓配对，尚未在小程序认领此节点，也未发起模型调用；不把接口可用等同于模型对话实测。
- 安装器修复尚未 npm / GitHub 发布；插件内的 WebUI 非 x64 自动更新限制未在本轮移除或验收。
- 家庭电视浏览器 `summer2026-kiosk.service` 按用户授权暂停以腾出内存；`summer2026.service`、`kindle.service`、`mosquitto.service`、`docker.service` 验收时保持 active。未删除家庭服务数据、未改系统 npm/代理/登录配置。
- 测试节点保留运行以便下一步配对；不是新增开机自启动服务，主机重启后需重新启动该隔离测试实例。
