import { pairingHttpHandler } from './pairing-http.js';
export const PAIRING_MANAGEMENT_CHANNEL = '/wechat-remote-management';
/** Old Connection implementations only checked browser origin. They must keep
 * the existing local door, never expose a new management channel without auth. */
export function mountPairingManagement(ctx, operations) {
    const value = ctx.get('connection');
    const webServer = ctx.get('webServer');
    if (typeof value?.admit !== 'function' || typeof value?.requestRejection !== 'function'
        || typeof webServer?.register !== 'function')
        return;
    const handler = createPairingHandler(operations);
    // COMPAT: 0.1.7-rc.2 Connection.rpc.handle captures a provider-shadow context
    // without webServer injection. Use the public WebServer registration and
    // native requestRejection instead, never mutate the host or weaken auth.
    // Retire this small wire adapter only after the sibling-provider regression
    // and installed-host tests pass with the official RPC convenience method.
    const unregister = ctx.effect(() => webServer.register({ kind: 'prefix',
        path: PAIRING_MANAGEMENT_CHANNEL,
        handler: pairingHttpHandler(PAIRING_MANAGEMENT_CHANNEL, value, handler.call),
    }), 'wechat pairing management');
    let disposal;
    return { dispose() { handler.stop(); return disposal ??= Promise.resolve().then(unregister); } };
}
export function createPairingHandler(operations) {
    let disposed = false;
    let pairing;
    const failure = (code, message) => ({ ok: false, error: { code, message, details: {} } });
    const handler = async (endpoint, payload, signal) => {
        if (disposed || operations.unavailable())
            return failure('pairing/unavailable', '连接服务暂不可用，请稍后重试');
        signal.throwIfAborted();
        if (!payload || typeof payload !== 'object' || Array.isArray(payload) || Object.keys(payload).length) {
            return failure('pairing/bad-request', '无效的配对请求');
        }
        if (endpoint === 'status')
            return { ok: true, value: operations.status() };
        if (endpoint !== 'pair-code')
            return failure('pairing/not-found', '不支持此管理操作');
        try {
            // Concurrent page requests share one ticket operation rather than
            // invalidating each other's QR codes. No background refresh or retry.
            if (!pairing) {
                pairing = Promise.resolve().then(() => {
                    if (disposed || operations.unavailable())
                        throw new Error('pairing stopped');
                    return operations.pairCode();
                }).finally(() => { pairing = undefined; });
            }
            const result = await pairing;
            signal.throwIfAborted();
            if (disposed || operations.unavailable())
                return failure('pairing/unavailable', '连接服务已停止，请重新打开设置');
            return { ok: true, value: result };
        }
        catch {
            return failure('pairing/unavailable', '暂时无法生成配对二维码，请稍后重试');
        }
    };
    return { call: handler, stop() { disposed = true; } };
}
