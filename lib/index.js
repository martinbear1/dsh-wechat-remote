// @ts-nocheck
/**
 * dsh-wechat-remote gate — WeChat 小程序专用认证网关（原生 DSH 宿主插件）。
 *
 * 与 iOS 插件（dsh-harness-remote，端口 3090/3091）完全独立、可共存：
 * web/default profile 保持占用 3092/3093；其他 profile 使用稳定推导的
 * 高位端口对。全部仍可用环境变量覆盖（见 apply 部分）。
 *
 * 进程内两个监听器：
 *
 *   1. PUBLIC door（0.0.0.0:3092 — 局域网 + 未来 Tailscale Funnel 目标）：
 *        - 所有请求都要求 "Authorization: Bearer <token>"（无任何 loopback
 *          豁免：Funnel 转发流量来自 127.0.0.1，必须视同外部），唯一例外是
 *          POST /pair/claim-wechat —— 用一次性配对码 + wx.login jsCode 换取
 *          长期 token，并把 token 与解析出的微信 openid 一对一绑定。
 *        - POST /pair/verify-wechat（需 Bearer）：每次启动用新 jsCode 复核
 *          当前微信身份与绑定一致；配置了真实 appid/secret 时，复核成功即
 *          **轮换 token**（旧凭证立即作废，泄露窗口 = 一次会话）。
 *        - 其余请求反代到 DSH 127.0.0.1:3080（Host 重写走官方栅栏合法通道）。
 *        - 加固：每 IP 限速（429）、常数时间 token 比较、状态文件 0600。
 *
 *   2. LOCAL door（127.0.0.1:3093 — 仅本机可访问）：
 *        - GET /pair       电脑端配对页（二维码 + 配对码）
 *        - GET /pair/code  官方 Web UI 侧边栏按钮数据（CORS for :3080）
 *        - GET /gate/status 局域网 / Tailscale / Funnel 连通性
 *
 * 状态（token + 待配对码 + openid↔token 绑定）存于
 * ~/.dsh/gate-wechat-state.json；微信 appid/secret 配置存于
 * ~/.dsh/gate-wechat.json（未配置时降级为开发态身份，功能全通）。
 * 随 DSH 同生共死 —— 无独立进程。
 */
import http from 'node:http';
import https from 'node:https';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import zlib from 'node:zlib';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import httpProxy from 'http-proxy';
import QRCode from 'qrcode';
import WechatDirectoryService from './directory-service.js';
import WechatHostInfoService from './host-info-service.js';
import WechatHistoryService from './history-service.js';
import PublicRelayGateway from './public-relay-gateway.js';
import { loadPublicRelayConfig, publicPairingPayload } from './public-relay-agent.js';
import { agentProfileScope, loadAgentDescriptor } from './agent-metadata.js';
import { deriveGatePorts, describeGateListenFailure } from './gate-ports.js';
import { tightenPrivateFile, writePrivateJsonAtomic } from './secure-file.js';
const UPSTREAM_PORT = Number(process.env.DSH_PORT || 3080);
const STATE_FILE = path.join(os.homedir(), '.dsh', 'gate-wechat-state.json');
const TARGET = { target: 'http://127.0.0.1:' + UPSTREAM_PORT, changeOrigin: true };
const WS_TARGET = { target: 'ws://127.0.0.1:' + UPSTREAM_PORT, changeOrigin: true };
const PAIR_TTL_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 5;
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const RATE_WINDOW_MS = 60 * 1000;
const RATE_MAX_PER_IP = 120; // general requests per IP per minute on the public door
const CLAIM_MAX_PER_IP = 10; // claim attempts per IP per minute (brute-force brake)
const execFileAsync = promisify(execFile);
let publicRelayGateway = null;
let publicRelayStatus = { enabled: false, state: 'disabled' };
let agentDescriptor;
try {
    agentDescriptor = loadAgentDescriptor();
}
catch (error) {
    // A damaged optional metadata file must not prevent DSH itself from booting.
    // Keep this process usable but do not overwrite evidence needed for repair.
    console.error('[wechat-gate] Agent metadata unavailable; using process-local identity:', error.message);
    agentDescriptor = {
        schemaVersion: 1,
        hostId: crypto.randomBytes(18).toString('base64url'),
        agentInstanceId: crypto.randomBytes(18).toString('base64url'),
        hostName: os.hostname(),
        agentKind: 'deepseek-harness',
        agentName: 'DeepSeek Harness',
        agentVersion: 'unknown',
        capabilities: [],
    };
}
const selectedGatePorts = deriveGatePorts(agentProfileScope(), agentDescriptor.agentInstanceId, process.env);
const PUBLIC_PORT = selectedGatePorts.publicPort;
const LOCAL_PORT = selectedGatePorts.localPort;
for (const warning of selectedGatePorts.warnings) {
    console.warn(`[wechat-gate] ${warning}`);
}
const doorRuntime = {
    profileScope: selectedGatePorts.profileScope,
    source: selectedGatePorts.source,
    publicDoor: {
        bind: '0.0.0.0',
        port: PUBLIC_PORT,
        state: 'starting',
        errorCode: null,
        message: null,
    },
    localDoor: {
        bind: '127.0.0.1',
        port: LOCAL_PORT,
        state: 'starting',
        errorCode: null,
        message: null,
    },
};
function gateRuntimeSnapshot() {
    return {
        profileScope: doorRuntime.profileScope,
        source: doorRuntime.source,
        publicDoor: { ...doorRuntime.publicDoor },
        localDoor: { ...doorRuntime.localDoor },
    };
}
function installedPluginVersion() {
    try {
        return JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version || 'unknown';
    }
    catch (e) {
        return 'unknown';
    }
}
/**
 * 收紧凭据文件权限：POSIX 上 0600；Windows 上 chmod 只映射只读位、
 * 无安全意义，改用 icacls 去掉继承并把 ACL 收敛为仅当前用户完全控制。
 * 全部尽力而为 —— 失败不阻断配对流程。
 */
function tightenFilePerms(file) {
    tightenPrivateFile(file);
}
function loadState() {
    try {
        const raw = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
        // 修复升级前遗留的宽松权限。
        tightenFilePerms(STATE_FILE);
        if (raw && typeof raw.token === 'string' && raw.token.length >= 32) {
            // WeChat openid → token bindings (mini program identity layer).
            if (!raw.wechatBindings)
                raw.wechatBindings = {};
            return raw;
        }
    }
    catch (e) { /* first run */ }
    const fresh = { token: crypto.randomBytes(32).toString('base64url'), pending: {}, wechatBindings: {} };
    saveState(fresh);
    return fresh;
}
function saveState(state) {
    try {
        // 文件里同时躺着长期令牌与待配对码。临时文件落盘后同卷原子替换，
        // 避免断电/进程终止把原有效凭据截断成半份 JSON。
        writePrivateJsonAtomic(STATE_FILE, state);
    }
    catch (e) {
        console.error('[wechat-gate] failed to save state:', e.message);
    }
}
const state = loadState();
function randomCode(len = 8) {
    let out = '';
    for (let i = 0; i < len; i++)
        out += ALPHABET[crypto.randomInt(ALPHABET.length)];
    return out;
}
function lanIPv4() {
    const list = [];
    for (const ifaces of Object.values(os.networkInterfaces())) {
        for (const iface of ifaces || []) {
            if (iface.family === 'IPv4' && !iface.internal)
                list.push(iface.address);
        }
    }
    return (list.find((a) => a.startsWith('192.168.')) ||
        list.find((a) => a.startsWith('10.')) ||
        list[0] ||
        '127.0.0.1');
}
/**
 * Allow this profile's official Web UI to fetch its LOCAL door. Multiple DSH
 * profiles may use different upstream and local ports; only the configured
 * loopback WebUI origin is echoed, never an arbitrary website origin.
 */
function setCors(req, res) {
    const origin = typeof req.headers.origin === 'string' ? req.headers.origin : '';
    try {
        const parsed = new URL(origin);
        const loopback = parsed.hostname === '127.0.0.1' || parsed.hostname === 'localhost' || parsed.hostname === '[::1]';
        const port = parsed.port || (parsed.protocol === 'https:' ? '443' : '80');
        if (loopback && parsed.protocol === 'http:' && port === String(UPSTREAM_PORT)) {
            res.setHeader('Access-Control-Allow-Origin', origin);
            res.setHeader('Vary', 'Origin');
        }
    }
    catch { /* requests without a browser Origin are still allowed locally */ }
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}
/**
 * The public door has NO loopback exemption: Funnel-forwarded traffic arrives
 * from 127.0.0.1 (tailscaled) and must not be treated as local.
 */
/**
 * Append one line to the gate access log so connectivity problems can be
 * diagnosed from the PC side (~/.dsh/wechat-gate-access.log).
 */
function accessLog(req, note) {
    try {
        const line = `${new Date().toISOString()} ${req.socket.remoteAddress ?? '?'} ${req.method} ${req.url ?? '?'} ${note}\n`;
        fs.appendFileSync(path.join(os.homedir(), '.dsh', 'wechat-gate-access.log'), line);
    }
    catch (e) { /* logging is best-effort */ }
}
/**
 * 公共门的每 IP 请求预算。公共门对任何来源都没有 loopback 豁免，限速是
 * 敌意局域网邻居 / 互联网扫描器能撞上的第一道闸，也刹住配对码的暴力尝试
 * （单码已有次数上限，这里再兜一层按来源的节奏限制）。
 *
 * Key 规则：socket 对端是 loopback 时（Tailscale Funnel 由 tailscaled 从
 * 127.0.0.1 连进来），采信 Funnel 附带的 X-Forwarded-For；直连的局域网
 * 客户端一律按 socket 地址计数，忽略其自带的 XFF —— 伪造头不能绕过预算。
 */
const rateBuckets = new Map();
function rateKey(req) {
    const sock = String(req.socket && req.socket.remoteAddress ? req.socket.remoteAddress : '');
    const loopback = sock === '127.0.0.1' || sock === '::1' || sock === '::ffff:127.0.0.1';
    if (loopback) {
        const xff = req.headers['x-forwarded-for'];
        if (typeof xff === 'string' && xff.trim())
            return 'xff:' + xff.split(',')[0].trim();
    }
    return 'ip:' + (sock.startsWith('::ffff:') ? sock.slice(7) : (sock || 'unknown'));
}
function allowRequest(req, isClaim) {
    const key = rateKey(req);
    const now = Date.now();
    let bucket = rateBuckets.get(key);
    if (!bucket || bucket.windowStart + RATE_WINDOW_MS < now) {
        bucket = { windowStart: now, count: 0, claimCount: 0 };
        rateBuckets.set(key, bucket);
    }
    if (isClaim && ++bucket.claimCount > CLAIM_MAX_PER_IP)
        return false;
    if (++bucket.count > RATE_MAX_PER_IP)
        return false;
    if (rateBuckets.size > 20000) { // 惰性清扫：空转的桶不无限堆积
        for (const [k, v] of rateBuckets) {
            if (v.windowStart + RATE_WINDOW_MS < now)
                rateBuckets.delete(k);
        }
    }
    return true;
}
function reject429(res) {
    res.writeHead(429, { 'Content-Type': 'text/plain', 'Retry-After': '30' });
    res.end('too many requests');
}
function authorized(req) {
    const header = req.headers.authorization;
    if (typeof header !== 'string' || !header.startsWith('Bearer '))
        return false;
    const presented = Buffer.from(header.slice('Bearer '.length));
    const expected = Buffer.from(state.token);
    // 常数时间比较：不向能观测响应时延的攻击者泄漏任何前缀信息。
    return presented.length === expected.length && crypto.timingSafeEqual(presented, expected);
}
const proxy = httpProxy.createProxyServer({});
proxy.on('error', (err, req, res) => {
    console.error('[wechat-gate] proxy error:', err.message);
    if (res && typeof res.writeHead === 'function' && !res.headersSent) {
        res.writeHead(502, { 'Content-Type': 'text/plain' });
    }
    if (res && typeof res.end === 'function' && !res.destroyed) {
        res.end('Bad Gateway: DSH webserver is not ready');
    }
    else if (res && typeof res.destroy === 'function' && !res.destroyed) {
        res.destroy();
    }
});
// With selfHandleResponse the gate owns the response stream, which lets us
// gzip large JSON payloads (session.history for a long session is ~9 MB —
// ~870 KB gzipped, a 10x cut that makes cellular loads usable).
proxy.on('proxyRes', (proxyRes, req, res) => {
    const status = proxyRes.statusCode ?? 502;
    const headers = { ...(proxyRes.headers || {}) };
    const accept = String(req.headers['accept-encoding'] || '');
    const alreadyEncoded = Boolean(headers['content-encoding']);
    const contentType = String(headers['content-type'] || '');
    const compressible = /json|text|javascript|xml|svg|wasm/i.test(contentType) || contentType === '';
    const noBody = status === 204 || status === 304 || String(req.method).toUpperCase() === 'HEAD';
    if (!alreadyEncoded && compressible && !noBody && /\bgzip\b/.test(accept)) {
        delete headers['content-length'];
        delete headers['content-md5'];
        headers['content-encoding'] = 'gzip';
        headers['vary'] = headers['vary'] ? headers['vary'] + ', Accept-Encoding' : 'Accept-Encoding';
        res.writeHead(status, headers);
        const gzip = zlib.createGzip({ level: 6 });
        // A client that aborts mid-response errors the gzip stream; without a
        // handler that unhandled 'error' would kill the whole Harness process.
        gzip.on('error', () => { if (!res.destroyed)
            res.destroy(); });
        proxyRes.pipe(gzip).pipe(res);
    }
    else {
        res.writeHead(status, headers);
        proxyRes.pipe(res);
    }
    proxyRes.on('error', (err) => {
        console.warn('[wechat-gate] upstream response error:', err.message);
        if (!res.destroyed)
            res.destroy();
    });
});
function readBody(req) {
    return new Promise((resolve, reject) => {
        let data = '';
        req.on('data', (chunk) => {
            data += chunk;
            if (data.length > 1e6) {
                reject(new Error('body too large'));
                req.destroy();
            }
        });
        req.on('end', () => resolve(data));
        req.on('error', reject);
    });
}
async function makePairEntry() {
    const now = Date.now();
    for (const [code, entry] of Object.entries(state.pending)) {
        if (entry.expiresAt < now)
            delete state.pending[code];
    }
    const code = randomCode();
    state.pending[code] = { expiresAt: now + PAIR_TTL_MS, attempts: 0 };
    saveState(state);
    // The phone claims over the PUBLIC door (LAN / Funnel), so the payload
    // carries the public port; the funnel URL (when enabled) rides along so
    // the app can auto-fallback to the public channel outside the LAN.
    scheduleNetworkDiagnosticsRefresh();
    const funnel = networkDiagnostics.funnel;
    const payloadObj = { code, host: lanIPv4(), port: PUBLIC_PORT };
    if (funnel.enabled && funnel.url)
        payloadObj.funnelUrl = funnel.url;
    let payload = JSON.stringify(payloadObj);
    let publicMode = false;
    if (publicRelayGateway) {
        try {
            publicRelayStatus = await publicRelayGateway.ensurePairingStatus();
            const raw = publicPairingPayload(publicRelayStatus);
            if (raw) {
                const publicPayload = JSON.parse(raw);
                // A single scan can bind the public identity and, when the phone is on
                // the same LAN, also obtain the direct path for LAN-first routing.
                publicPayload.lan = payloadObj;
                payload = JSON.stringify(publicPayload);
                publicMode = true;
            }
        }
        catch (e) {
            console.warn('[wechat-gate] public pairing ticket unavailable; serving LAN QR:', e.message);
        }
    }
    const qrDataUrl = await QRCode.toDataURL(payload, { width: 320, margin: 1 });
    return { code, payload, qrDataUrl, publicMode };
}
// ── LOCAL door (127.0.0.1:3093): pairing surface + status ──
async function servePairQR(req, res) {
    const entry = await makePairEntry();
    const html = `<!doctype html><html lang="zh"><head><meta charset="utf-8">
<meta http-equiv="refresh" content="25">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Harness Remote 配对</title>
<style>
body{font-family:-apple-system,'Segoe UI',sans-serif;background:#0b0f1a;color:#e8ecf4;display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:100vh;margin:0;gap:16px;text-align:center}
h1{font-size:20px;font-weight:600;margin:0}
p{color:#9aa4b8;font-size:13px;margin:0;max-width:480px}
img{background:#fff;border-radius:14px;padding:12px}
code{color:#7aa2ff;font-size:15px;letter-spacing:3px}
</style></head>
<body>
<h1>Harness Remote · 微信配对</h1>
<p>打开微信小程序「Harness Remote」→ 设置 → 扫码配对，扫下面的二维码</p>
<img src="${entry.qrDataUrl}" alt="pairing QR">
<p>配对码：<code>${entry.code}</code></p>
<p>Agent：${agentDescriptor.agentName} · ${agentDescriptor.hostName} · ${selectedGatePorts.profileScope}<br>
局域网门：http://${lanIPv4()}:${PUBLIC_PORT} · 本机配对门：127.0.0.1:${LOCAL_PORT}</p>
<p>${entry.publicMode ? '已启用端到端加密公网连接；局域网可用时仍会优先直连' : '当前为局域网连接'}；二维码 15 分钟内有效</p>
</body></html>`;
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(html);
}
async function servePairCode(req, res) {
    setCors(req, res);
    const entry = await makePairEntry();
    const funnel = networkDiagnostics.funnel;
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
        code: entry.code,
        host: lanIPv4(),
        port: PUBLIC_PORT,
        localPort: LOCAL_PORT,
        profileScope: selectedGatePorts.profileScope,
        gate: gateRuntimeSnapshot(),
        qrDataUrl: entry.qrDataUrl,
        mode: entry.publicMode ? 'public-relay' : 'lan',
        payload: entry.payload,
        ...(funnel.enabled && funnel.url ? { funnelUrl: funnel.url } : {}),
    }));
}
async function probeTailscale() {
    try {
        const { stdout } = await execFileAsync('tailscale', ['status', '--json'], {
            timeout: 4000,
            windowsHide: true,
            encoding: 'utf8',
        });
        const s = JSON.parse(String(stdout));
        const self = s && s.Self;
        const ips = self && Array.isArray(self.TailscaleIPs) ? self.TailscaleIPs : [];
        const ip = ips.find((a) => a.startsWith('100.')) || ips[0] || null;
        return { installed: true, loggedIn: Boolean(self && self.UserID), ip };
    }
    catch (e) {
        return { installed: false, loggedIn: false, ip: null };
    }
}
async function probeFunnel() {
    try {
        const { stdout } = await execFileAsync('tailscale', ['funnel', 'status', '--json'], {
            timeout: 4000,
            windowsHide: true,
            encoding: 'utf8',
        });
        const s = JSON.parse(String(stdout));
        const hosts = Object.keys((s && s.Web) || {});
        const host = hosts.find((h) => h.endsWith(':443')) || hosts[0] || null;
        if (!host)
            return { enabled: false, url: null };
        const allow = Boolean(s.AllowFunnel && s.AllowFunnel[host] === true);
        return { enabled: allow, url: allow ? `https://${host.split(':')[0]}` : null };
    }
    catch (e) {
        return { enabled: false, url: null };
    }
}
const NETWORK_DIAGNOSTIC_TTL_MS = 60_000;
let networkDiagnostics = {
    expiresAt: 0,
    refreshing: false,
    tailscale: { installed: false, loggedIn: false, ip: null },
    funnel: { enabled: false, url: null },
};
/** Pairing/status return immediately; optional legacy diagnostics refresh off-path. */
function scheduleNetworkDiagnosticsRefresh() {
    if (networkDiagnostics.refreshing || networkDiagnostics.expiresAt > Date.now())
        return;
    networkDiagnostics.refreshing = true;
    void Promise.all([probeTailscale(), probeFunnel()])
        .then(([tailscale, funnel]) => {
        networkDiagnostics = {
            expiresAt: Date.now() + NETWORK_DIAGNOSTIC_TTL_MS,
            refreshing: false,
            tailscale,
            funnel,
        };
    })
        .catch(() => {
        networkDiagnostics = {
            ...networkDiagnostics,
            expiresAt: Date.now() + NETWORK_DIAGNOSTIC_TTL_MS,
            refreshing: false,
        };
    });
}
function serveGateStatus(req, res) {
    setCors(req, res);
    scheduleNetworkDiagnosticsRefresh();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
        gate: gateRuntimeSnapshot(),
        lan: { ip: lanIPv4(), port: PUBLIC_PORT },
        tailscale: networkDiagnostics.tailscale,
        funnel: networkDiagnostics.funnel,
        wechat: {
            configured: Boolean(loadWechatConfig()),
            bindings: Object.keys(state.wechatBindings).length,
        },
        // Status must not echo the active pairing ticket or identity key. The QR
        // endpoint is the sole local surface that releases those screen secrets.
        publicRelay: {
            enabled: publicRelayStatus.enabled === true,
            state: publicRelayStatus.state || 'disabled',
            relayOrigin: publicRelayStatus.relayOrigin,
            lastError: publicRelayStatus.lastError,
        },
        agent: agentDescriptor,
    }));
}
// ── PUBLIC door (0.0.0.0:3092): token-required proxy + WeChat claim/verify ──
// ── 微信小程序身份层（本插件的主身份路径）：小程序扫电脑上的二维码，
//    认领时带上 wx.login jsCode。网关解析出 openid（配置了真实 appid/secret
//    走微信 code2session，否则用确定性开发态哈希），记录 openid↔token 绑定；
//    每次启动可经 /pair/verify-wechat 复核，成功即轮换 token。
const WECHAT_CONFIG_FILE = path.join(os.homedir(), '.dsh', 'gate-wechat.json');
function loadWechatConfig() {
    try {
        const raw = JSON.parse(fs.readFileSync(WECHAT_CONFIG_FILE, 'utf8'));
        // 文件里有 appsecret：尽力收敛为仅属主可读（0600 / icacls）。
        tightenFilePerms(WECHAT_CONFIG_FILE);
        if (raw && typeof raw.appid === 'string' && typeof raw.secret === 'string')
            return raw;
    }
    catch (e) { /* not configured — dev fallback */ }
    return null;
}
function resolveOpenId(jsCode) {
    return new Promise((resolve, reject) => {
        const config = loadWechatConfig();
        if (!config) {
            const hash = crypto.createHash('sha256').update(String(jsCode)).digest('hex');
            return resolve('dev:' + hash.slice(0, 24));
        }
        const qs = new URLSearchParams({
            appid: config.appid,
            secret: config.secret,
            js_code: String(jsCode),
            grant_type: 'authorization_code',
        });
        const req = https.get('https://api.weixin.qq.com/sns/jscode2session?' + qs.toString(), (res) => {
            let data = '';
            res.on('data', (chunk) => { data += chunk; });
            res.on('end', () => {
                try {
                    const parsed = JSON.parse(data);
                    if (parsed.openid)
                        return resolve(parsed.openid);
                    reject(new Error('wechat code2session: ' + (parsed.errmsg || ('errcode ' + parsed.errcode))));
                }
                catch (e) {
                    reject(e);
                }
            });
        });
        req.on('error', reject);
        req.setTimeout(8000, () => req.destroy(new Error('code2session timeout')));
    });
}
async function serveClaimWechat(req, res) {
    try {
        const body = JSON.parse((await readBody(req)) || '{}');
        const entry = state.pending[body.code];
        if (!entry || entry.expiresAt < Date.now() || entry.attempts >= MAX_ATTEMPTS) {
            res.writeHead(401, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({ error: 'invalid or expired pairing code' }));
        }
        entry.attempts += 1;
        saveState(state);
        let openId;
        try {
            openId = await resolveOpenId(body.jsCode);
        }
        catch (e) {
            // 身份解析失败时保留配对码，避免一次性代码被瞬时 code2session 错误烧掉
            res.writeHead(401, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({ error: 'wechat identity verification failed: ' + e.message }));
        }
        delete state.pending[body.code];
        state.wechatBindings[openId] = state.token;
        saveState(state);
        console.log('[wechat-gate] wechat pairing ok, openid=' + openId.slice(0, 12) + '…');
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ token: state.token, openId: openId.slice(0, 8) + '…' }));
    }
    catch (e) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'bad request' }));
    }
}
async function serveVerifyWechat(req, res) {
    try {
        const body = JSON.parse((await readBody(req)) || '{}');
        const configured = Boolean(loadWechatConfig());
        if (!configured) {
            // 开发回退：无真实 appid/secret 时，模拟器的 wx.login 代码跨调用不稳定，
            // openid 无法一致解析。门上的 token 校验仍证明持有权；配置 gate-wechat.json
            // 后即启用真实身份绑定校验。
            res.writeHead(200, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({ valid: true, dev: true }));
        }
        let openId;
        try {
            openId = await resolveOpenId(body.jsCode);
        }
        catch (e) {
            res.writeHead(401, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({ error: 'wechat identity verification failed: ' + e.message }));
        }
        const valid = state.wechatBindings[openId] === state.token;
        if (valid) {
            // 凭证滚动：复核成功即轮换长期 token，旧凭证立即作废。
            // 泄露窗口被压到「上次复核 → 本次复核」之间；门上的 authorized()
            // 自本轮起只认新 token。注意：同一 openid 在多设备同时使用时，
            // 先复核的设备会作废另一台设备持有的旧 token（个人工具可接受）。
            const rotated = crypto.randomBytes(32).toString('base64url');
            state.token = rotated;
            state.wechatBindings[openId] = rotated;
            saveState(state);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({ valid: true, token: rotated }));
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ valid: false }));
    }
    catch (e) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'bad request' }));
    }
}
const localServer = http.createServer((req, res) => {
    if (req.method === 'OPTIONS') {
        setCors(req, res);
        res.writeHead(204);
        return res.end();
    }
    const url = new URL(req.url, 'http://gate.local');
    if (url.pathname === '/pair')
        return servePairQR(req, res);
    if (url.pathname === '/pair/code')
        return servePairCode(req, res);
    if (url.pathname === '/gate/status')
        return serveGateStatus(req, res);
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('not found');
});
const publicServer = http.createServer((req, res) => {
    if (req.method === 'OPTIONS') {
        res.writeHead(204);
        return res.end();
    }
    const url = new URL(req.url, 'http://gate.local');
    if (url.pathname === '/pair/claim-wechat') {
        if (!allowRequest(req, true)) {
            accessLog(req, 'DENIED-429');
            return reject429(res);
        }
        accessLog(req, 'claim-wechat');
        return serveClaimWechat(req, res);
    }
    if (!allowRequest(req, false)) {
        accessLog(req, 'DENIED-429');
        return reject429(res);
    }
    if (url.pathname === '/pair/verify-wechat') {
        if (!authorized(req)) {
            accessLog(req, 'DENIED-401');
            res.writeHead(401, { 'Content-Type': 'text/plain' });
            return res.end('unauthorized');
        }
        accessLog(req, 'verify-wechat');
        return serveVerifyWechat(req, res);
    }
    if (!authorized(req)) {
        accessLog(req, 'DENIED-401');
        res.writeHead(401, { 'Content-Type': 'text/plain' });
        return res.end('unauthorized');
    }
    // 远程客户端可能带浏览器标记头（开发者工具模拟器发 Origin + Sec-Fetch-*）。
    // 上游 web 服务器按协议 §3.4 对浏览器直连校验 Origin==Host 与 sec-fetch-site；
    // 经网关代理的远程客户端以 token 为唯一凭证，剥离这些头避免误伤
    // （Web UI 直连 3080，不受影响）。
    stripBrowserMarkers(req);
    accessLog(req, 'ok');
    proxy.web(req, res, { ...TARGET, selfHandleResponse: true });
});
publicServer.on('upgrade', (req, socket, head) => {
    // A remote client can reset a WebSocket while the proxy is connecting to
    // DSH. Without this listener, Node treats ECONNRESET as an unhandled Socket
    // error and terminates the entire Harness process.
    socket.once('error', (err) => {
        console.warn('[wechat-gate] WebSocket client closed:', err.code || err.message);
        if (!socket.destroyed)
            socket.destroy();
    });
    if (!allowRequest(req, false)) {
        socket.write('HTTP/1.1 429 Too Many Requests\r\n\r\n');
        return socket.destroy();
    }
    if (!authorized(req)) {
        socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
        return socket.destroy();
    }
    stripBrowserMarkers(req);
    proxy.ws(req, socket, head, WS_TARGET);
});
/**
 * 剥离浏览器标记头（Origin/Referer/Sec-Fetch-*），使上游协议 §3.4 的
 * 浏览器直连校验只作用于真正从 3080 直连的 Web UI。
 */
function stripBrowserMarkers(req) {
    delete req.headers.origin;
    delete req.headers.referer;
    for (const key of Object.keys(req.headers)) {
        if (key.indexOf('sec-fetch-') === 0)
            delete req.headers[key];
    }
}
publicServer.on('clientError', (err, socket) => {
    console.warn('[wechat-gate] client socket error:', err.code || err.message);
    if (!socket.destroyed)
        socket.destroy();
});
export const name = 'gate';
/**
 * Host plugin body: binds both doors in-process. Disposal closes them.
 *
 * 故障隔离（官方偏好：坏插件绝不影响原生 DSH 运行）：每个门的 listen/
 * 运行时 'error' 事件都被本地吞掉并只记日志 —— 端口被占、绑定失败等
 * 任何情况都不会把异常外溢成未处理事件（否则 Node 会直接杀死整个 DSH
 * 进程）。两扇门独立失败独立关闭：公网门坏了不连坐本地门，反之亦然；
 * 无论哪扇门失败，DSH 本体照常运行。
 * @param ctx - host context.
 */
export function apply(ctx) {
    // Optional Tailscale/Funnel diagnostics are warmed in a child process and
    // never delay DSH startup, the QR endpoint, or WebUI interaction.
    scheduleNetworkDiagnosticsRefresh();
    // 独立的 Host-only Typert 服务。它不占用 DSH 的全局 directoryPicker，
    // 因而 WebUI 继续使用官方 auto/native 目录选择器。
    ctx.plugin(WechatDirectoryService, { maxEntries: 1000 });
    // 电脑名不在 DSH 原生 host.describe 契约里；以微信端隔离的只读 Remote
    // 提供，避免为了一个客户端字段污染 DSH/WebUI 的 Host API。
    ctx.plugin(WechatHostInfoService, { gateRuntime: gateRuntimeSnapshot });
    // 公网历史性能适配：只读 DSH 原生 session.history，在电脑端补齐轮次
    // 并删除已完成轮次的冗余流式增量。独立 Remote 不修改 WebUI/DSH。
    ctx.plugin(WechatHistoryService, { dshPort: UPSTREAM_PORT });
    // Public mode is strictly opt-in. With no enabled config file this branch
    // does not generate an identity, open an outbound socket, or alter LAN/WebUI.
    try {
        const relayConfig = loadPublicRelayConfig();
        if (relayConfig) {
            publicRelayGateway = new PublicRelayGateway(relayConfig, {
                agentVersion: agentDescriptor.agentVersion,
                adapterVersion: installedPluginVersion(),
                hostId: agentDescriptor.hostId,
                agentInstanceId: agentDescriptor.agentInstanceId,
                agentKind: agentDescriptor.agentKind,
                agentName: agentDescriptor.agentName,
                hostName: agentDescriptor.hostName,
                capabilities: agentDescriptor.capabilities,
                dshPort: UPSTREAM_PORT,
                // This credential is released only inside an authenticated, identity-
                // pinned E2EE relay tunnel. It is not a DSH Remote and cannot be called
                // by WebUI or unauthenticated LAN clients.
                issueLanCredential: () => {
                    if (doorRuntime.publicDoor.state !== 'listening') {
                        throw new Error(doorRuntime.publicDoor.message || `局域网门 ${PUBLIC_PORT} 当前不可用`);
                    }
                    console.log('[wechat-gate] authenticated E2EE client requested LAN route bootstrap');
                    return {
                        baseUrl: `http://${lanIPv4()}:${PUBLIC_PORT}`,
                        token: state.token,
                    };
                },
                onStatus: (status) => { publicRelayStatus = status; },
            });
            void publicRelayGateway.start();
        }
    }
    catch (e) {
        publicRelayStatus = { enabled: true, state: 'offline', lastError: e.message };
        console.error('[wechat-gate] public relay disabled after configuration error:', e.message);
    }
    let disposed = false;
    const failDoor = (which, err) => {
        const runtime = which === 'local door' ? doorRuntime.localDoor : doorRuntime.publicDoor;
        const failure = describeGateListenFailure(which === 'local door' ? 'local' : 'public', runtime.bind, runtime.port, err);
        runtime.state = disposed ? 'stopped' : 'unavailable';
        runtime.errorCode = failure.code;
        runtime.message = failure.message;
        console.error(`[wechat-gate] ${runtime.message} DSH 本体继续运行。`);
        if (disposed)
            return;
        try {
            if (which === 'local door')
                localServer.close();
            else
                publicServer.close();
        }
        catch (e) { /* already closed */ }
    };
    localServer.on('error', (err) => failDoor('local door', err));
    publicServer.on('error', (err) => failDoor('public door', err));
    try {
        localServer.listen(LOCAL_PORT, '127.0.0.1', () => {
            doorRuntime.localDoor.state = 'listening';
            doorRuntime.localDoor.errorCode = null;
            doorRuntime.localDoor.message = null;
            console.log(`[wechat-gate] local door (pairing/status): http://127.0.0.1:${LOCAL_PORT}`);
        });
    }
    catch (e) {
        failDoor('local door', e);
    }
    try {
        publicServer.listen(PUBLIC_PORT, '0.0.0.0', () => {
            doorRuntime.publicDoor.state = 'listening';
            doorRuntime.publicDoor.errorCode = null;
            doorRuntime.publicDoor.message = null;
            console.log(`[wechat-gate] public door (wechat token required): 0.0.0.0:${PUBLIC_PORT} -> ${TARGET.target}`);
        });
    }
    catch (e) {
        failDoor('public door', e);
    }
    ctx.on('dispose', () => {
        disposed = true;
        doorRuntime.localDoor.state = 'stopped';
        doorRuntime.publicDoor.state = 'stopped';
        try {
            localServer.close();
        }
        catch (e) { /* best-effort */ }
        try {
            publicServer.close();
        }
        catch (e) { /* best-effort */ }
        try {
            publicRelayGateway?.stop();
        }
        catch (e) { /* best-effort */ }
        publicRelayGateway = null;
    });
}
