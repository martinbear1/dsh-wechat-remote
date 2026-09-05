/**
 * dsh-wechat-remote gate — WeChat 小程序专用认证网关（原生 DSH 宿主插件）。
 *
 * web/default profile 保持占用 3092/3093；其他 profile 使用稳定推导的
 * 高位端口对。全部仍可用环境变量覆盖（见 apply 部分）。
 *
 * 进程内两个监听器：
 *
 *   1. PUBLIC door（0.0.0.0:3092 — 仅局域网直连）：
 *        - 所有请求都要求 "Authorization: Bearer <token>"（无任何 loopback
 *          豁免），唯一例外是
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
 *        - GET /pair/code  官方 Web Settings 配对页数据（CORS for :3080）
 *        - GET /gate/status 局域网门与端到端加密公网 Agent 状态
 *
 * web/default 的历史状态路径保持为 ~/.dsh/gate-wechat-state.json；其他
 * profile 按稳定 Agent 实例隔离。微信 appid/secret 配置仍存于
 * ~/.dsh/gate-wechat.json。
 * 随 DSH 同生共死 —— 无独立进程。
 */
import http from 'node:http';
import https from 'node:https';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import zlib from 'node:zlib';
import httpProxy from 'http-proxy';
import QRCode from 'qrcode';
import { WebSocketServer } from 'ws';
import WechatDirectoryService from './directory-service.js';
import WechatHostInfoService from './host-info-service.js';
import WechatHistoryService, { prewarmLatestHistory, } from './history-service.js';
import WechatAttachmentService from './attachment-service.js';
import PublicRelayGateway from './public-relay-gateway.js';
import { bindHistorySnapshotPrewarmer } from './history-prewarmer.js';
import { loadPublicRelayConfig, publicPairingPayload, } from './public-relay-agent.js';
import { agentProfileScope, defaultGateStatePath, loadAgentDescriptor, } from './agent-metadata.js';
import { hostPlatformDescriptor, selectLanIPv4 } from './host-platform.js';
import { deriveGatePorts, describeGateListenFailure } from './gate-ports.js';
import { adapterDshHome, isAllowedDshWebOrigin, resolveDshWebRuntime } from './dsh-runtime.js';
import { resolveTypertGateway } from './dsh-protocol-compat.js';
import { DshCompatibilityApi } from './dsh-compatibility-api.js';
import { tightenPrivateFile, writePrivateJsonAtomic } from './secure-file.js';
import { PluginUpdateService } from './update-service.js';
function messageOf(error) {
    return error instanceof Error ? error.message : String(error);
}
function errorCodeOf(error) {
    if (!error || typeof error !== 'object' || !('code' in error))
        return null;
    return typeof error.code === 'string' ? error.code : null;
}
function recordOf(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value)
        ? value
        : null;
}
/**
 * Mount one isolated Harness Remote runtime into the supplied Cordis fiber.
 *
 * Importing the package is intentionally inert: credentials, files, sockets,
 * timers and listening ports are created only after Cordis applies this plugin
 * and are therefore scoped to this exact plugin instance.
 */
export function mountWechatGate(ctx) {
    const dshWebRuntime = resolveDshWebRuntime(ctx);
    const UPSTREAM_PORT = dshWebRuntime.port;
    const STATE_FILE = defaultGateStatePath();
    const TARGET = {
        target: 'http://127.0.0.1:' + UPSTREAM_PORT,
        changeOrigin: true,
    };
    const WS_TARGET = {
        target: 'ws://127.0.0.1:' + UPSTREAM_PORT,
        changeOrigin: true,
    };
    const PAIR_TTL_MS = 15 * 60 * 1000;
    const MAX_ATTEMPTS = 5;
    const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    const RATE_WINDOW_MS = 60 * 1000;
    const RATE_MAX_PER_IP = 120; // general requests per IP per minute on the public door
    const CLAIM_MAX_PER_IP = 10; // claim attempts per IP per minute (brute-force brake)
    let publicRelayGateway = null;
    let publicRelayStatus = { enabled: false, state: 'disabled' };
    let agentDescriptor;
    try {
        agentDescriptor = loadAgentDescriptor();
    }
    catch (error) {
        // A damaged optional metadata file must not prevent DSH itself from booting.
        // Keep this process usable but do not overwrite evidence needed for repair.
        console.error('[wechat-gate] Agent metadata unavailable; using process-local identity:', messageOf(error));
        agentDescriptor = {
            schemaVersion: 1,
            hostId: crypto.randomBytes(18).toString('base64url'),
            agentInstanceId: crypto.randomBytes(18).toString('base64url'),
            hostName: os.hostname(),
            agentKind: 'deepseek-harness',
            agentName: 'DeepSeek Harness',
            agentVersion: 'unknown',
            hostPlatform: hostPlatformDescriptor(),
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
            const manifest = recordOf(JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8')));
            return typeof manifest?.version === 'string' && manifest.version
                ? manifest.version
                : 'unknown';
        }
        catch {
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
    function validPendingPairs(value) {
        const input = recordOf(value);
        const output = {};
        if (!input)
            return output;
        for (const [code, pairValue] of Object.entries(input)) {
            const pair = recordOf(pairValue);
            if (!/^[A-Z2-9]{8}$/.test(code) || !pair)
                continue;
            if (!Number.isSafeInteger(pair.expiresAt) ||
                !Number.isSafeInteger(pair.attempts))
                continue;
            output[code] = {
                expiresAt: Number(pair.expiresAt),
                attempts: Number(pair.attempts),
            };
        }
        return output;
    }
    function validWechatBindings(value) {
        const input = recordOf(value);
        const output = {};
        if (!input)
            return output;
        for (const [openId, token] of Object.entries(input)) {
            if (openId && typeof token === 'string' && token.length >= 32)
                output[openId] = token;
        }
        return output;
    }
    function loadState() {
        try {
            const raw = recordOf(JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')));
            // 修复升级前遗留的宽松权限。
            tightenFilePerms(STATE_FILE);
            if (raw && typeof raw.token === 'string' && raw.token.length >= 32) {
                return {
                    token: raw.token,
                    pending: validPendingPairs(raw.pending),
                    wechatBindings: validWechatBindings(raw.wechatBindings),
                };
            }
        }
        catch {
            /* first run */
        }
        const fresh = {
            token: crypto.randomBytes(32).toString('base64url'),
            pending: {},
            wechatBindings: {},
        };
        saveState(fresh);
        return fresh;
    }
    function saveState(state) {
        try {
            // 文件里同时躺着长期令牌与待配对码。临时文件落盘后同卷原子替换，
            // 避免断电/进程终止把原有效凭据截断成半份 JSON。
            writePrivateJsonAtomic(STATE_FILE, state);
        }
        catch (error) {
            console.error('[wechat-gate] failed to save state:', messageOf(error));
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
        return selectLanIPv4();
    }
    /**
     * Allow this profile's official Web UI to fetch its LOCAL door. Multiple DSH
     * profiles may use different upstream and local ports; only the configured
     * loopback WebUI origin is echoed, never an arbitrary website origin.
     */
    function setCors(req, res) {
        const origin = typeof req.headers.origin === 'string' ? req.headers.origin : '';
        if (isAllowedDshWebOrigin(origin, UPSTREAM_PORT)) {
            res.setHeader('Access-Control-Allow-Origin', origin);
            res.setHeader('Vary', 'Origin');
        }
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    }
    /** The public LAN door has no loopback authentication exemption. */
    /**
     * Append one line to the gate access log so connectivity problems can be
     * diagnosed from the PC side (~/.dsh/wechat-gate-access.log).
     */
    function accessLog(req, note) {
        try {
            const line = `${new Date().toISOString()} ${req.socket.remoteAddress ?? '?'} ${req.method} ${req.url ?? '?'} ${note}\n`;
            fs.appendFileSync(path.join(adapterDshHome(), 'wechat-gate-access.log'), line);
        }
        catch (e) {
            /* logging is best-effort */
        }
    }
    /**
     * 公共门的每 IP 请求预算。公共门对任何来源都没有 loopback 豁免，限速是
     * 敌意局域网邻居 / 互联网扫描器能撞上的第一道闸，也刹住配对码的暴力尝试
     * （单码已有次数上限，这里再兜一层按来源的节奏限制）。
     *
     * Key 只取 socket 对端地址。PUBLIC door 不再承载反向代理或 Funnel，因而
     * 永不采信客户端自带的 X-Forwarded-For，伪造头不能绕过预算。
     */
    const rateBuckets = new Map();
    function rateKey(req) {
        const sock = String(req.socket && req.socket.remoteAddress ? req.socket.remoteAddress : '');
        return ('ip:' + (sock.startsWith('::ffff:') ? sock.slice(7) : sock || 'unknown'));
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
        if (rateBuckets.size > 20000) {
            // 惰性清扫：空转的桶不无限堆积
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
        return (presented.length === expected.length &&
            crypto.timingSafeEqual(presented, expected));
    }
    const proxy = httpProxy.createProxyServer({});
    const updater = new PluginUpdateService(ctx, { web: UPSTREAM_PORT, gate: PUBLIC_PORT, local: LOCAL_PORT });
    const compatibilityApi = new DshCompatibilityApi(ctx, UPSTREAM_PORT, () => updater.isMaintaining());
    updater.trackPublicRequests(() => compatibilityApi.hasInFlightRequests());
    const compatibilityWebSockets = new WebSocketServer({
        noServer: true,
        clientTracking: false,
    });
    proxy.on('error', (err, req, res) => {
        console.error('[wechat-gate] proxy error:', err.message);
        if (res && 'writeHead' in res && !res.headersSent) {
            res.writeHead(502, { 'Content-Type': 'text/plain' });
        }
        if (res && 'end' in res && !res.destroyed) {
            res.end('Bad Gateway: DSH webserver is not ready');
        }
        else if (res && 'destroy' in res && !res.destroyed) {
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
        const compressible = /json|text|javascript|xml|svg|wasm/i.test(contentType) ||
            contentType === '';
        const noBody = status === 204 ||
            status === 304 ||
            String(req.method).toUpperCase() === 'HEAD';
        if (!alreadyEncoded && compressible && !noBody && /\bgzip\b/.test(accept)) {
            delete headers['content-length'];
            delete headers['content-md5'];
            headers['content-encoding'] = 'gzip';
            headers['vary'] = headers['vary']
                ? headers['vary'] + ', Accept-Encoding'
                : 'Accept-Encoding';
            res.writeHead(status, headers);
            const gzip = zlib.createGzip({ level: 6 });
            // A client that aborts mid-response errors the gzip stream; without a
            // handler that unhandled 'error' would kill the whole Harness process.
            gzip.on('error', () => {
                if (!res.destroyed)
                    res.destroy();
            });
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
    function readBody(req, maxBytes = 1e6) {
        return new Promise((resolve, reject) => {
            const chunks = [];
            let bytes = 0;
            req.on('data', (chunk) => {
                const value = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
                bytes += value.length;
                if (bytes > maxBytes) {
                    reject(new Error('body too large'));
                    req.destroy();
                    return;
                }
                chunks.push(value);
            });
            req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
            req.on('error', reject);
        });
    }
    async function serveCompatibleDshRpc(req, res) {
        const gateway = resolveTypertGateway(ctx);
        const probe = updater.isVerificationProbe(req);
        if (!gateway && (probe || !compatibilityApi.handlesPath(req.url || '/'))) {
            proxy.web(req, res, { ...TARGET, selfHandleResponse: true });
            return;
        }
        const controller = new AbortController();
        const abort = () => controller.abort(new Error('client disconnected'));
        req.once('aborted', abort);
        res.once('close', abort);
        try {
            const raw = await readBody(req, 32 * 1024 * 1024);
            const request = {
                method: req.method || '', path: req.url || '/',
                body: Buffer.from(raw), signal: controller.signal,
            };
            const response = await (probe ? compatibilityApi.verificationProbe(request) : compatibilityApi.request(request));
            if (res.destroyed)
                return;
            res.writeHead(response.statusCode, {
                ...response.headers,
                'Content-Length': response.body.byteLength,
            });
            res.end(response.body);
        }
        catch (error) {
            if (res.destroyed)
                return;
            res.writeHead(400, {
                'Content-Type': 'application/json; charset=utf-8',
                'Cache-Control': 'no-store',
            });
            res.end(JSON.stringify({ error: messageOf(error) }));
        }
        finally {
            req.off('aborted', abort);
            res.off('close', abort);
        }
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
        // The LAN route is additive metadata on the identity-pinned public QR.
        // Internet access always uses the dedicated E2EE relay, never this door.
        const payloadObj = { code, host: lanIPv4(), port: PUBLIC_PORT };
        let payload = JSON.stringify(payloadObj);
        let publicMode = false;
        let expiresAt = state.pending[code].expiresAt;
        const gateway = publicRelayGateway;
        if (gateway) {
            try {
                publicRelayStatus = await gateway.ensurePairingStatus();
                const raw = publicPairingPayload(publicRelayStatus);
                if (raw) {
                    const publicPayload = JSON.parse(raw);
                    // A single scan can bind the public identity and, when the phone is on
                    // the same LAN, also obtain the direct path for LAN-first routing.
                    publicPayload.lan = payloadObj;
                    payload = JSON.stringify(publicPayload);
                    publicMode = true;
                    expiresAt = Number(publicPayload.expiresAt) || expiresAt;
                }
            }
            catch (error) {
                console.warn('[wechat-gate] public pairing ticket unavailable; serving LAN QR:', messageOf(error));
            }
        }
        const qrDataUrl = await QRCode.toDataURL(payload, { width: 420, margin: 2 });
        return { code, payload, qrDataUrl, publicMode, expiresAt };
    }
    // ── LOCAL door (127.0.0.1:3093): pairing surface + status ──
    async function servePairQR(_req, res) {
        const entry = await makePairEntry();
        const html = `<!doctype html><html lang="zh"><head><meta charset="utf-8">
<meta http-equiv="refresh" content="25">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>鲸常在配对</title>
<style>
body{font-family:-apple-system,'Segoe UI',sans-serif;background:#0b0f1a;color:#e8ecf4;display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:100vh;margin:0;gap:16px;text-align:center}
h1{font-size:20px;font-weight:600;margin:0}
p{color:#9aa4b8;font-size:13px;margin:0;max-width:480px}
img{background:#fff;border-radius:14px;padding:12px}
code{color:#7aa2ff;font-size:15px;letter-spacing:3px}
</style></head>
<body>
<h1>添加到鲸常在</h1>
<p>${agentDescriptor.agentName} · ${agentDescriptor.hostName}</p>
<p>打开微信小程序，进入「添加节点」扫描二维码</p>
<img src="${entry.qrDataUrl}" alt="pairing QR">
<p>配对码：<code>${entry.code}</code> · 15 分钟内有效</p>
<p>${entry.publicMode ? '自动选择更快连接；远程内容端到端加密' : '当前仅支持同一网络连接'}</p>
</body></html>`;
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(html);
    }
    async function servePairCode(req, res) {
        setCors(req, res);
        const entry = await makePairEntry();
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
            expiresAt: entry.expiresAt,
        }));
    }
    function serveGateStatus(req, res) {
        setCors(req, res);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
            gate: gateRuntimeSnapshot(),
            lan: { ip: lanIPv4(), port: PUBLIC_PORT },
            wechat: {
                configured: Boolean(loadWechatConfig()),
                bindings: Object.keys(state.wechatBindings).length,
            },
            // Status must not echo the active pairing ticket or identity key. The QR
            // endpoint is the sole local surface that releases those screen secrets.
            publicRelay: {
                enabled: publicRelayStatus.enabled === true,
                state: publicRelayStatus.state || 'disabled',
                remoteAccess: publicRelayStatus.remoteAccess || null,
            },
            agent: {
                agentName: agentDescriptor.agentName,
                hostName: agentDescriptor.hostName,
            },
        }));
    }
    // ── PUBLIC door (0.0.0.0:3092): token-required proxy + WeChat claim/verify ──
    // ── 微信小程序身份层（本插件的主身份路径）：小程序扫电脑上的二维码，
    //    认领时带上 wx.login jsCode。网关解析出 openid（配置了真实 appid/secret
    //    走微信 code2session，否则用确定性开发态哈希），记录 openid↔token 绑定；
    //    每次启动可经 /pair/verify-wechat 复核，成功即轮换 token。
    const WECHAT_CONFIG_FILE = path.join(adapterDshHome(), 'gate-wechat.json');
    function loadWechatConfig() {
        try {
            const raw = recordOf(JSON.parse(fs.readFileSync(WECHAT_CONFIG_FILE, 'utf8')));
            // 文件里有 appsecret：尽力收敛为仅属主可读（0600 / icacls）。
            tightenFilePerms(WECHAT_CONFIG_FILE);
            if (raw &&
                typeof raw.appid === 'string' &&
                typeof raw.secret === 'string') {
                return { appid: raw.appid, secret: raw.secret };
            }
        }
        catch {
            /* not configured — dev fallback */
        }
        return null;
    }
    function resolveOpenId(jsCode) {
        return new Promise((resolve, reject) => {
            const config = loadWechatConfig();
            if (!config) {
                const hash = crypto
                    .createHash('sha256')
                    .update(String(jsCode))
                    .digest('hex');
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
                res.on('data', (chunk) => {
                    data += chunk;
                });
                res.on('end', () => {
                    try {
                        const parsed = recordOf(JSON.parse(data));
                        if (typeof parsed?.openid === 'string' && parsed.openid)
                            return resolve(parsed.openid);
                        const detail = typeof parsed?.errmsg === 'string'
                            ? parsed.errmsg
                            : `errcode ${String(parsed?.errcode ?? 'unknown')}`;
                        reject(new Error(`wechat code2session: ${detail}`));
                    }
                    catch (error) {
                        reject(error);
                    }
                });
            });
            req.on('error', reject);
            req.setTimeout(8000, () => req.destroy(new Error('code2session timeout')));
        });
    }
    async function serveClaimWechat(req, res) {
        try {
            const body = recordOf(JSON.parse((await readBody(req)) || '{}')) ?? {};
            const code = typeof body.code === 'string' ? body.code : '';
            const entry = state.pending[code];
            if (!entry ||
                entry.expiresAt < Date.now() ||
                entry.attempts >= MAX_ATTEMPTS) {
                res.writeHead(401, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'invalid or expired pairing code' }));
                return;
            }
            entry.attempts += 1;
            saveState(state);
            let openId;
            try {
                openId = await resolveOpenId(body.jsCode);
            }
            catch (error) {
                // 身份解析失败时保留配对码，避免一次性代码被瞬时 code2session 错误烧掉
                res.writeHead(401, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({
                    error: `wechat identity verification failed: ${messageOf(error)}`,
                }));
                return;
            }
            delete state.pending[code];
            state.wechatBindings[openId] = state.token;
            saveState(state);
            console.log('[wechat-gate] wechat pairing ok, openid=' + openId.slice(0, 12) + '…');
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
                token: state.token,
                openId: openId.slice(0, 8) + '…',
            }));
        }
        catch (e) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'bad request' }));
        }
    }
    async function serveVerifyWechat(req, res) {
        try {
            const body = recordOf(JSON.parse((await readBody(req)) || '{}')) ?? {};
            const configured = Boolean(loadWechatConfig());
            if (!configured) {
                // 开发回退：无真实 appid/secret 时，模拟器的 wx.login 代码跨调用不稳定，
                // openid 无法一致解析。门上的 token 校验仍证明持有权；配置 gate-wechat.json
                // 后即启用真实身份绑定校验。
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ valid: true, dev: true }));
                return;
            }
            let openId;
            try {
                openId = await resolveOpenId(body.jsCode);
            }
            catch (error) {
                res.writeHead(401, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({
                    error: `wechat identity verification failed: ${messageOf(error)}`,
                }));
                return;
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
                res.end(JSON.stringify({ valid: true, token: rotated }));
                return;
            }
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ valid: false }));
        }
        catch {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'bad request' }));
        }
    }
    const localServer = http.createServer((req, res) => {
        // Simple cross-origin GET responses need the same allow-origin header as
        // preflight responses. The old implementation only decorated OPTIONS,
        // so every Settings-page status request was rejected by the browser.
        setCors(req, res);
        if (req.method === 'OPTIONS') {
            res.writeHead(204);
            return res.end();
        }
        const url = new URL(req.url ?? '/', 'http://gate.local');
        if (url.pathname.startsWith('/gate/update/')) {
            void updater.handle(req, res);
            return;
        }
        if (updater.isMaintaining()) {
            res.writeHead(503, { 'retry-after': '5' });
            res.end('Plugin update in progress');
            return;
        }
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
        if (updater.isMaintaining() && !updater.isVerificationProbe(req)) {
            res.writeHead(503, { 'retry-after': '5' });
            res.end('Plugin update in progress');
            return;
        }
        if ((req.url || '').startsWith('/gate/update/')) {
            res.writeHead(403);
            res.end('Local WebUI only');
            return;
        }
        if (req.method === 'OPTIONS') {
            res.writeHead(204);
            return res.end();
        }
        const url = new URL(req.url ?? '/', 'http://gate.local');
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
        if (req.method === 'POST' && url.pathname.startsWith('/api/')) {
            return serveCompatibleDshRpc(req, res);
        }
        proxy.web(req, res, { ...TARGET, selfHandleResponse: true });
    });
    publicServer.on('upgrade', (req, socket, head) => {
        if (updater.isMaintaining()) {
            socket.destroy();
            return;
        }
        // A remote client can reset a WebSocket while the proxy is connecting to
        // DSH. Without this listener, Node treats ECONNRESET as an unhandled Socket
        // error and terminates the entire Harness process.
        socket.once('error', (err) => {
            console.warn('[wechat-gate] WebSocket client closed:', errorCodeOf(err) || err.message);
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
        const url = new URL(req.url ?? '/', 'http://gate.local');
        const gateway = resolveTypertGateway(ctx);
        if (gateway
            && (url.pathname === '/api/events.mux' || url.pathname === '/api/events.host')) {
            const legacyPath = url.pathname === '/api/events.mux'
                ? '/api/events.mux'
                : '/api/events.host';
            compatibilityWebSockets.handleUpgrade(req, socket, head, (webSocket) => {
                compatibilityApi.realtime.attach(legacyPath, webSocket);
            });
            return;
        }
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
        console.warn('[wechat-gate] client socket error:', errorCodeOf(err) || err.message);
        if (!socket.destroyed)
            socket.destroy();
    });
    let disposed = false;
    const openSockets = new Set();
    const trackSocket = (socket) => {
        openSockets.add(socket);
        socket.once('close', () => openSockets.delete(socket));
    };
    localServer.on('connection', trackSocket);
    publicServer.on('connection', trackSocket);
    // Cordis treats the function returned by apply as the authoritative plugin
    // effect disposer. Do not model disposal as a custom event: fiber.dispose()
    // removes registered listeners but does not emit an application event.
    const dispose = () => {
        disposed = true;
        updater.dispose();
        compatibilityApi.dispose();
        doorRuntime.localDoor.state = 'stopped';
        doorRuntime.publicDoor.state = 'stopped';
        try {
            localServer.close();
        }
        catch (e) {
            /* best-effort */
        }
        try {
            publicServer.close();
        }
        catch (e) {
            /* best-effort */
        }
        for (const socket of openSockets) {
            try {
                socket.destroy();
            }
            catch (e) {
                /* best-effort */
            }
        }
        openSockets.clear();
        try {
            publicRelayGateway?.stop();
        }
        catch (e) {
            /* best-effort */
        }
        publicRelayGateway = null;
        console.log('[wechat-gate] runtime disposed');
    };
    const mountChild = (label, plugin, config) => {
        try {
            const fiber = ctx.plugin(plugin, config);
            void Promise.resolve(fiber).catch((error) => {
                console.error(`[wechat-gate] optional ${label} service unavailable; DSH continues: ${messageOf(error)}`);
            });
        }
        catch (error) {
            console.error(`[wechat-gate] optional ${label} service unavailable; DSH continues: ${messageOf(error)}`);
        }
    };
    // Host plugin body: binds both doors in-process. Disposal closes them.
    // Every door and optional relay fails independently; none may terminate DSH.
    // 独立的 Host-only Typert 服务。它不占用 DSH 的全局 directoryPicker，
    // 因而 WebUI 继续使用官方 auto/native 目录选择器。
    mountChild('directory', WechatDirectoryService, { maxEntries: 1000 });
    // 电脑名不在 DSH 原生 host.describe 契约里；以微信端隔离的只读 Remote
    // 提供，避免为了一个客户端字段污染 DSH/WebUI 的 Host API。
    mountChild('host-info', WechatHostInfoService, {
        gateRuntime: gateRuntimeSnapshot,
    });
    // 公网历史性能适配：只读 DSH 原生 session.history，在电脑端补齐轮次
    // 并删除已完成轮次的冗余流式增量。独立 Remote 不修改 WebUI/DSH。
    const historyConfig = {
        dshPort: UPSTREAM_PORT,
        prepareSnapshot: async (payloadJson) => {
            const gateway = publicRelayGateway;
            if (!gateway)
                throw new Error('Public object transport is unavailable');
            return gateway.prepareHistorySnapshot(payloadJson);
        },
    };
    mountChild('history', WechatHistoryService, historyConfig);
    // 历史图片仍先通过 DSH 原生 session.attachment 完成会话引用校验；随后
    // 仅将端侧加密密文放入私有对象存储，让小程序公网直取，避免大体积
    // base64 占用实时中继。对象层故障返回 unavailable，由客户端原生回退。
    const attachmentConfig = {
        dshPort: UPSTREAM_PORT,
        storeAttachment: async (data, attachment, signal) => {
            const gateway = publicRelayGateway;
            if (!gateway)
                throw new Error('Public object transport is unavailable');
            return gateway.uploadAttachmentObject(data, attachment, signal);
        },
    };
    mountChild('attachment', WechatAttachmentService, attachmentConfig);
    // Product mode uses the official outbound-only relay by default so one QR
    // provisions public + LAN routes. A local config may explicitly disable or
    // override it; failures stay isolated and never alter LAN/WebUI behavior.
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
                hostPlatform: agentDescriptor.hostPlatform,
                capabilities: agentDescriptor.capabilities,
                dshPort: UPSTREAM_PORT,
                // Public E2EE dispatches in-process; it does not depend on LAN listen
                // availability or consume the shared loopback IP rate budget.
                compatibilityApi,
                // Persist only short-lived encrypted OSS object descriptors. Scope the
                // private index by stable Agent identity so multiple profiles on one
                // host cannot reuse another public node's object ticket.
                historyCachePath: path.join(adapterDshHome(), `wechat-history-snapshots-${agentDescriptor.agentInstanceId}.json`),
                onDiagnostic: (level, message) => {
                    if (level === 'warn')
                        console.warn(`[wechat-gate] ${message}`);
                    else
                        console.log(`[wechat-gate] ${message}`);
                },
                // This credential is released only inside an authenticated, identity-
                // pinned E2EE relay tunnel. It is not a DSH Remote and cannot be called
                // by WebUI or unauthenticated LAN clients.
                issueLanCredential: (rotate = false) => {
                    if (updater.isMaintaining())
                        throw new Error('插件正在更新，请稍后重连');
                    if (doorRuntime.publicDoor.state !== 'listening') {
                        throw new Error(doorRuntime.publicDoor.message ||
                            `局域网门 ${PUBLIC_PORT} 当前不可用`);
                    }
                    if (rotate) {
                        const previous = state.token;
                        const rotated = crypto.randomBytes(32).toString('base64url');
                        state.token = rotated;
                        for (const openId of Object.keys(state.wechatBindings)) {
                            if (state.wechatBindings[openId] === previous)
                                state.wechatBindings[openId] = rotated;
                        }
                        saveState(state);
                        console.log('[wechat-gate] authenticated E2EE client rotated LAN credential');
                    }
                    else {
                        console.log('[wechat-gate] authenticated E2EE client requested LAN route bootstrap');
                    }
                    return {
                        baseUrl: `http://${lanIPv4()}:${PUBLIC_PORT}`,
                        token: state.token,
                    };
                },
                onStatus: (status) => {
                    publicRelayStatus = status;
                },
            });
            void publicRelayGateway.start();
            void Promise.resolve(bindHistorySnapshotPrewarmer(ctx, {
                dshPort: UPSTREAM_PORT,
                ...(resolveTypertGateway(ctx) ? {
                    hostEventSource: (receive, disconnected) => compatibilityApi.connectEvents('/api/events.host', {
                        readyState: 1,
                        bufferedAmount: 0,
                        send: receive,
                        close: disconnected,
                    }),
                } : {}),
                warm: (service, sessionId, signal) => prewarmLatestHistory(service, sessionId, signal),
                onDiagnostic: (level, message) => {
                    if (level === 'warn')
                        console.warn(`[wechat-gate] ${message}`);
                    else
                        console.log(`[wechat-gate] ${message}`);
                },
            })).catch((error) => {
                console.warn(`[wechat-gate] optional history prewarmer unavailable: ${messageOf(error)}`);
            });
        }
    }
    catch (error) {
        publicRelayStatus = {
            enabled: true,
            state: 'offline',
            lastError: messageOf(error),
        };
        console.error('[wechat-gate] public relay disabled after configuration error:', messageOf(error));
    }
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
        catch (e) {
            /* already closed */
        }
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
    catch (error) {
        failDoor('public door', error);
    }
    return dispose;
}
