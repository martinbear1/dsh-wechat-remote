/**
 * 制品一致性守卫（微信版插件）：客户端 bundle 必须用包自身的名字注册
 * （window.__ModuleLoader__.load({ id })），宿主网关必须是微信专用表面
 * （3092/3093、claim-wechat/verify-wechat、滚动 token、独立状态文件）。
 * DSH 的 client-modules 加载器会拒绝「注册 id 与启动条目 id 不一致」的
 * bundle，直接打崩 Web UI —— 本脚本把这类硬约束变成可执行的回归检查。
 *
 * 运行：node scripts/verify.mjs
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const pkg = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'))
const name = pkg.name
const fails = []
const check = (ok, msg) => { if (!ok) fails.push(msg) }

// 1. 客户端 bundle：注册 id 必须等于包名，且不含任何遗留/异包 id。
const client = readFileSync(path.join(root, 'lib/client.js'), 'utf8')
check(client.includes('window.__ModuleLoader__.load'), 'lib/client.js 不是 __ModuleLoader__ bundle')
check(client.includes(`id: "${name}"`), `lib/client.js 注册 id 不是 "${name}"`)
for (const legacy of ['@deepseek-ai/dsh-client-ui-pairing', '@harness-remote/dsh-harness-remote']) {
  check(!client.includes(legacy), `lib/client.js 残留异包注册 id（${legacy}）`)
}
// 1b. 按钮文案与本地门端口必须是微信版。
check(client.includes('微信连接'), 'lib/client.js 按钮文案不是「微信连接」')
check(client.includes('http://127.0.0.1:3093/pair/code'), 'lib/client.js 本地门端口不是 3093')
check(!client.includes('127.0.0.1:3091'), 'lib/client.js 残留 iOS 本地门端口 3091')
// 1c. 侧边栏脚部布局选择器（宽屏：设置左、配对按钮右）必须在注入的 CSS 里。
for (const sel of ['[class*=_footArea]', '[class*=_settingsArea]', '[class*=_footerActions]']) {
  check(client.includes(sel), `lib/client.js 注入 CSS 缺少布局选择器 ${sel}`)
}

// 2. 宿主网关：微信专用表面与加固基线。
const host = readFileSync(path.join(root, 'lib/index.js'), 'utf8')
check(host.includes('export function apply'), 'lib/index.js 缺少 apply 导出（宿主插件不会加载）')
check(host.includes("export const name = 'gate'"), 'lib/index.js 缺少 gate name 导出')
check(host.includes('WECHAT_GATE_PORT || 3092'), 'lib/index.js 公网门默认端口不是 3092')
check(host.includes('WECHAT_GATE_LOCAL_PORT || 3093'), 'lib/index.js 本地门默认端口不是 3093')
check(host.includes('gate-wechat-state.json'), 'lib/index.js 状态文件不是独立的 gate-wechat-state.json')
check(host.includes("url.pathname === '/pair/claim-wechat'"), 'lib/index.js 缺少 /pair/claim-wechat 端点')
check(host.includes("url.pathname === '/pair/verify-wechat'"), 'lib/index.js 缺少 /pair/verify-wechat 端点')
check(!host.includes("url.pathname === '/pair/claim'"), 'lib/index.js 不应暴露 iOS 风格 /pair/claim 端点')
check(host.includes('timingSafeEqual'), 'lib/index.js 缺少常数时间 token 比较')
check(host.includes('rotated'), 'lib/index.js 缺少凭证滚动逻辑')
check(host.includes('rateBuckets'), 'lib/index.js 缺少每 IP 限速')
check(host.includes('icacls'), 'lib/index.js 缺少 Windows ACL 收紧')
check(host.includes('plugin keeps DSH alive'), 'lib/index.js 缺少端口占用的崩溃隔离（server error 处理器）')
check(host.includes('wechat: {'), 'lib/index.js 缺少 /gate/status 的微信身份字段')
check(client.includes('微信身份'), 'lib/client.js 弹窗缺少「微信身份」状态行')

// 3. bundle 补丁行必须引用本包名（否则插不进 cordis 图）。
const patch = readFileSync(path.join(root, 'cordis.patch.yml'), 'utf8')
check(patch.includes(name), `cordis.patch.yml 未引用包名 "${name}"`)
check(!patch.includes('dsh-host-directory-picker-auto'), 'cordis.patch.yml 不应覆盖 WebUI 官方 auto 目录选择器')
check(!patch.includes('dsh-host-directory-picker-browse'), 'cordis.patch.yml 不应替换 WebUI 官方目录后端')

// 4. 客户端入口必须在 exports 里可被官方扫描器发现。
check(pkg.exports?.['./client']?.default === './lib/client.js', 'package.json exports["./client"] 未指向 lib/client.js')
check(pkg.exports?.['./directory']?.default === './lib/directory-service.js', 'package.json exports["./directory"] 未指向目录服务')
check(pkg.exports?.['./host-info']?.default === './lib/host-info-service.js', 'package.json exports["./host-info"] 未指向微信 Host 信息服务')
check(pkg.exports?.['./public-relay']?.default === './lib/public-relay-agent.js', 'package.json exports["./public-relay"] 未指向公网出站 Agent')
check(pkg.exports?.['./typert']?.default === './lib/typert.host.js', 'package.json exports["./typert"] 未指向严格 Host 契约')
check(pkg.dsh?.bundle?.patch === './cordis.patch.yml', 'package.json dsh.bundle.patch 未指向 cordis.patch.yml')

// 4b. 小程序目录能力必须是本包自己的惰性 Remote 服务，不能重新占用
// DSH 的全局 directoryPicker seam。
check(host.includes("from './directory-service.js'"), 'lib/index.js 未挂载微信目录 Remote 服务')
check(host.includes('ctx.plugin(WechatDirectoryService'), 'lib/index.js 未在 gate fiber 下挂载目录服务')
const directory = readFileSync(path.join(root, 'lib/directory-service.js'), 'utf8')
check(directory.includes('super(ctx, "wechatDirectory")') || directory.includes("super(ctx, 'wechatDirectory')"), '目录服务的 Cordis/Typert key 不是 wechatDirectory')
check(directory.includes('Get-PSDrive'), 'Windows 盘符必须来自真实文件系统盘枚举，不能再猜 C-Z')
check(directory.includes('DEFAULT_OPERATION_TIMEOUT_MS = 6500'), '网络盘目录服务缺少 6.5 秒硬超时')
check(directory.includes('DSH_WECHAT_DIRECTORY_PATH_B64'), '网络盘路径没有通过非脚本数据通道传给隔离进程')
check(directory.includes('timeout: this.operationTimeoutMs'), '网络盘子进程没有配置可终止超时')
check(directory.includes('directory-timeout'), '目录服务缺少网络盘超时业务错误')
check(directory.includes('network-unavailable'), '目录服务缺少网络盘离线业务错误')
const typert = readFileSync(path.join(root, 'lib/typert.host.js'), 'utf8')
for (const method of ['roots', 'list', 'create']) {
  check(typert.includes(`wechatDirectory/${method}`), `严格 Typert 契约缺少 wechatDirectory/${method}`)
}

// 4c. 电脑名通过微信端隔离的只读 Remote 提供，不能伪造进 DSH host.describe。
check(host.includes("from './host-info-service.js'"), 'lib/index.js 未挂载微信 Host 信息 Remote')
check(host.includes('ctx.plugin(WechatHostInfoService'), 'lib/index.js 未在 gate fiber 下挂载 Host 信息服务')
const hostInfo = readFileSync(path.join(root, 'lib/host-info-service.js'), 'utf8')
check(hostInfo.includes('super(ctx, "wechatHost")') || hostInfo.includes("super(ctx, 'wechatHost')"), 'Host 信息服务的 Typert key 不是 wechatHost')
check(hostInfo.includes('computerName: hostname()'), 'Host 信息服务未从操作系统读取真实电脑名')
check(typert.includes('wechatHost/describe'), '严格 Typert 契约缺少 wechatHost/describe')

// 4d. 公网研究模块必须是显式启用、出站连接和独立身份；不得向 DSH/WebUI
// 写配置或新增公网监听端口。真正接管流量前仍由发布门禁要求 E2EE 完成。
const publicRelay = readFileSync(path.join(root, 'lib/public-relay-agent.js'), 'utf8')
for (const required of ['harness-remote-public.json', 'harness-remote-public-identity.json', "enabled !== true", "protocol = 'wss:'", "generateKeyPairSync('ed25519')"]) {
  check(publicRelay.includes(required), `公网 Agent 缺少安全约束：${required}`)
}
check(!publicRelay.includes('createServer('), '公网 Agent 不得创建入站 HTTP 监听器')
check(!host.includes("from './public-relay-agent.js'"), 'E2EE 完成前不得把公网研究模块自动挂进稳定插件 apply')

// 5. 随包附带的重启脚本必须列入 files（用户装完即可双击重启）。
for (const s of ['scripts/restart-dsh.cmd', 'scripts/restart-dsh.ps1']) {
  check(Array.isArray(pkg.files) && pkg.files.includes(s), `package.json files 缺少 ${s}`)
}

if (fails.length > 0) {
  console.error('VERIFY FAILED:\n- ' + fails.join('\n- '))
  process.exit(1)
}
console.log(`verify ok: ${name} 制品一致（注册 id / 微信端点 / 3092·3093 / 滚动 token / 加固基线）`)
