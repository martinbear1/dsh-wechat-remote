/**
 * 制品一致性守卫（微信版插件）：客户端 bundle 必须用包自身的名字注册
 * （window.__ModuleLoader__.load({ id })），宿主网关必须是微信专用表面
 * （兼容 3092/3093、多 profile 端口、claim/verify、滚动 token、独立状态文件）。
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
// 1b. 按钮从本 profile 的 Host Remote 发现实际本地门；3093 只作旧版回退。
check(client.includes('微信连接'), 'lib/client.js 按钮文案不是「微信连接」')
check(client.includes('/api/wechatHost.describe'), 'lib/client.js 没有动态发现当前 profile 的本地门')
check(client.includes('http://127.0.0.1:3093'), 'lib/client.js 缺少旧 web/default 3093 回退')
check(client.includes('本机配对门'), 'lib/client.js 未展示实际本地门端口')
check(!client.includes('127.0.0.1:3091'), 'lib/client.js 残留 iOS 本地门端口 3091')
// 1c. 侧边栏脚部布局选择器（宽屏：设置左、配对按钮右）必须在注入的 CSS 里。
for (const sel of ['[class*=_footArea]', '[class*=_settingsArea]', '[class*=_footerActions]']) {
  check(client.includes(sel), `lib/client.js 注入 CSS 缺少布局选择器 ${sel}`)
}

// 2. 宿主网关：微信专用表面与加固基线。
const host = readFileSync(path.join(root, 'lib/index.js'), 'utf8')
check(host.includes('export function apply'), 'lib/index.js 缺少 apply 导出（宿主插件不会加载）')
check(host.includes("export const name = 'gate'"), 'lib/index.js 缺少 gate name 导出')
check(host.includes("from './gate-ports.js'"), 'lib/index.js 未使用多 profile 端口推导')
check(host.includes('selectedGatePorts.publicPort'), 'lib/index.js 未使用推导出的局域网门')
check(host.includes('selectedGatePorts.localPort'), 'lib/index.js 未使用推导出的本地门')
check(host.includes('gate-wechat-state.json'), 'lib/index.js 状态文件不是独立的 gate-wechat-state.json')
check(host.includes("url.pathname === '/pair/claim-wechat'"), 'lib/index.js 缺少 /pair/claim-wechat 端点')
check(host.includes("url.pathname === '/pair/verify-wechat'"), 'lib/index.js 缺少 /pair/verify-wechat 端点')
check(!host.includes("url.pathname === '/pair/claim'"), 'lib/index.js 不应暴露 iOS 风格 /pair/claim 端点')
check(host.includes('timingSafeEqual'), 'lib/index.js 缺少常数时间 token 比较')
check(host.includes('rotated'), 'lib/index.js 缺少凭证滚动逻辑')
check(host.includes('rateBuckets'), 'lib/index.js 缺少每 IP 限速')
check(host.includes('icacls'), 'lib/index.js 缺少 Windows ACL 收紧')
check(host.includes('DSH 本体继续运行'), 'lib/index.js 缺少端口占用的崩溃隔离（server error 处理器）')
check(host.includes("runtime.state = disposed ? 'stopped' : 'unavailable'"), '端口错误没有降级成可诊断状态')
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
check(pkg.exports?.['./history']?.default === './lib/history-service.js', 'package.json exports["./history"] 未指向微信历史服务')
check(pkg.exports?.['./public-relay']?.default === './lib/public-relay-agent.js', 'package.json exports["./public-relay"] 未指向公网出站 Agent')
check(pkg.exports?.['./e2ee']?.default === './lib/e2ee-session.js', 'package.json exports["./e2ee"] 未指向 E2EE 会话')
check(pkg.exports?.['./dsh-tunnel']?.default === './lib/dsh-tunnel-agent.js', 'package.json exports["./dsh-tunnel"] 未指向 DSH 隧道')
check(pkg.exports?.['./public-gateway']?.default === './lib/public-relay-gateway.js', 'package.json exports["./public-gateway"] 未指向公网网关')
check(pkg.exports?.['./typert']?.default === './lib/typert.host.js', 'package.json exports["./typert"] 未指向严格 Host 契约')
check(pkg.dsh?.bundle?.patch === './cordis.patch.yml', 'package.json dsh.bundle.patch 未指向 cordis.patch.yml')

// 4b. 小程序目录能力必须是本包自己的惰性 Remote 服务，不能重新占用
// DSH 的全局 directoryPicker seam。
check(host.includes("from './directory-service.js'"), 'lib/index.js 未挂载微信目录 Remote 服务')
check(host.includes('ctx.plugin(WechatDirectoryService'), 'lib/index.js 未在 gate fiber 下挂载目录服务')
const directory = readFileSync(path.join(root, 'lib/directory-service.js'), 'utf8')
check(directory.includes('super(ctx, "wechatDirectory")') || directory.includes("super(ctx, 'wechatDirectory')"), '目录服务的 Cordis/Typert key 不是 wechatDirectory')
check(directory.includes('DEFAULT_OPERATION_TIMEOUT_MS = 6500'), '网络盘目录服务缺少 6.5 秒硬超时')
check(directory.includes('DSH_WECHAT_DIRECTORY_PATH_B64'), '网络盘路径没有通过非脚本数据通道传给隔离进程')
check(directory.includes('timeout: this.operationTimeoutMs'), '网络盘子进程没有配置可终止超时')
check(directory.includes('directory-timeout'), '目录服务缺少网络盘超时业务错误')
check(directory.includes('network-unavailable'), '目录服务缺少网络盘离线业务错误')
check(directory.includes('directory-worker.js'), '挂载目录没有通过跨平台可终止 worker 隔离')
const hostPlatform = readFileSync(path.join(root, 'lib/host-platform.js'), 'utf8')
check(hostPlatform.includes('Get-PSDrive'), 'Windows 适配器必须枚举真实文件系统盘，不能猜 C-Z')
check(hostPlatform.includes("kind: 'macos'") || hostPlatform.includes('kind: "macos"'), '缺少 macOS HostPlatform 适配器')
check(hostPlatform.includes("'/Volumes'") || hostPlatform.includes('"/Volumes"'), 'macOS 适配器没有建模挂载卷')
check(hostPlatform.includes('isBenchmarkAddress'), 'LAN 地址选择没有排除 macOS/VPN 基准网段')
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
for (const field of ['hostId', 'agentInstanceId', 'agentKind', 'agentName', 'agentVersion', 'hostPlatform', 'capabilities']) {
  check(hostInfo.includes(field), `Host 信息服务缺少 Agent 元数据字段 ${field}`)
}
check(typert.includes('wechatHost/describe'), '严格 Typert 契约缺少 wechatHost/describe')

// 4d. 公网长会话历史只在微信端独立 Remote 内做无损语义压缩；数据源仍是
// DSH 原生 session.history，不能改写 WebUI 或另开网络入口。
check(host.includes("from './history-service.js'"), 'lib/index.js 未挂载微信历史 Remote')
check(host.includes('ctx.plugin(WechatHistoryService'), 'lib/index.js 未在 gate fiber 下挂载历史服务')
const history = readFileSync(path.join(root, 'lib/history-service.js'), 'utf8')
check(history.includes('super(ctx, "wechatHistory")') || history.includes("super(ctx, 'wechatHistory')"), '历史服务的 Typert key 不是 wechatHistory')
check(history.includes("method: 'session.history'") || history.includes('method: "session.history"'), '历史服务没有读取 DSH 原生 session.history')
check(history.includes("event?.type !== 'assistant/chunk'") || history.includes('event?.type !== "assistant/chunk"'), '历史服务没有压缩已完成轮次的流式增量')
check(history.includes("host: '127.0.0.1'") || history.includes('host: "127.0.0.1"'), '历史服务数据源不是 loopback DSH')
check(typert.includes('wechatHistory/window'), '严格 Typert 契约缺少 wechatHistory/window')

// 4e. 产品默认使用官方中继；本机可显式关闭或覆盖。公网模块必须只出站、
// 使用独立身份和端到端加密，不得向 DSH/WebUI 写配置或新增公网监听端口。
const publicRelay = readFileSync(path.join(root, 'lib/public-relay-agent.js'), 'utf8')
for (const required of ['harness-remote-public.json', 'DEFAULT_PUBLIC_RELAY_ORIGIN', 'value.enabled === false', "protocol === 'https:' ? 'wss:'", "generateKeyPairSync('ed25519')"]) {
  check(publicRelay.includes(required), `公网 Agent 缺少安全约束：${required}`)
}
check(!publicRelay.includes('createServer('), '公网 Agent 不得创建入站 HTTP 监听器')
check(host.includes('loadPublicRelayConfig()'), '宿主没有加载公网 Agent 产品配置')
check(host.includes('if (relayConfig)'), '缺少公网 Agent 显式关闭分支')
check(host.includes('new PublicRelayGateway'), '宿主未挂载加密公网网关')
check(host.includes('issueLanCredential:'), '宿主入口未把 E2EE 局域网凭证能力挂载到公网网关')
check(host.includes('authenticated E2EE client requested LAN route bootstrap'), '宿主制品缺少局域网凭证安全诊断点')
check(!host.includes("execFileSync('tailscale'"), '配对主路径不得同步阻塞探测 Tailscale')
check(host.includes('scheduleNetworkDiagnosticsRefresh'), '可选网络诊断缺少异步缓存')
const e2ee = readFileSync(path.join(root, 'lib/e2ee-session.js'), 'utf8')
for (const required of ['AgentE2EESession', 'sign(null', 'nacl.box.before', 'nacl.secretbox']) {
  check(e2ee.includes(required), `E2EE 实现缺少安全原语：${required}`)
}
const tunnel = readFileSync(path.join(root, 'lib/dsh-tunnel-agent.js'), 'utf8')
check(tunnel.includes("startsWith('/api/')"), '公网隧道没有限制到 DSH /api 表面')
check(tunnel.includes("host: '127.0.0.1'"), '公网隧道上游不是固定 loopback DSH')
check(!tunnel.includes('createServer('), '公网隧道不得新增入站监听器')
check(tunnel.includes('MAX_SEND_QUEUE_BYTES'), '公网隧道缺少明确的待发队列字节上限')
check(tunnel.includes('response.pause()'), '公网 HTTP 隧道缺少上游背压暂停')

const secureFile = readFileSync(path.join(root, 'lib/secure-file.js'), 'utf8')
check(secureFile.includes('renameSync(temporary, file)'), '私密状态文件没有同卷原子替换')
const metadata = readFileSync(path.join(root, 'lib/agent-metadata.js'), 'utf8')
check(metadata.includes('harness-remote-public-identity.json'), '默认实例没有兼容 public-research.5 的 Agent 身份')
check(metadata.includes('agentInstanceId'), 'Agent 元数据缺少实例标识')
const gatePorts = readFileSync(path.join(root, 'lib/gate-ports.js'), 'utf8')
check(gatePorts.includes('LEGACY_PUBLIC_PORT = 3092'), 'web/default 没有保持 3092 兼容')
check(gatePorts.includes('LEGACY_LOCAL_PORT = 3093'), 'web/default 没有保持 3093 兼容')
check(/DYNAMIC_PORT_BASE = (?:32_000|32000|32e3)/.test(gatePorts), '其他 profile 未使用 32000..39999 端口区间')
check(/DYNAMIC_PORT_PAIRS = (?:4_000|4000|4e3)/.test(gatePorts), 'profile 端口区间可能越入 Windows ephemeral range')
check(gatePorts.includes('EADDRINUSE'), '端口推导模块缺少占用错误的可读诊断')

// 5. 随包附带的重启脚本必须列入 files（用户装完即可双击重启）。
for (const s of ['scripts/restart-dsh.cmd', 'scripts/restart-dsh.ps1']) {
  check(Array.isArray(pkg.files) && pkg.files.includes(s), `package.json files 缺少 ${s}`)
}
for (const artifact of ['lib/agent-metadata.js', 'lib/gate-ports.js', 'lib/secure-file.js', 'lib/host-platform.js', 'lib/directory-worker.js']) {
  check(Array.isArray(pkg.files) && pkg.files.includes(artifact), `package.json files 缺少 ${artifact}`)
}

if (fails.length > 0) {
  console.error('VERIFY FAILED:\n- ' + fails.join('\n- '))
  process.exit(1)
}
console.log(`verify ok: ${name} 制品一致（注册 id / 多 profile 实际端口 / 滚动 token / 加固基线）`)
