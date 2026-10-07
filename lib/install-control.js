import { desktopOwnsLifecycle } from './dsh-host-context.js';
import { legacyUpdateError } from './install-capabilities.js';
export { legacyUpdateError } from './install-capabilities.js';
/** Read-only diagnostic; not an installation admission or host lifecycle hook. */
export async function nativeInstallSessions(ctx, signal) {
    const controller = ctx.get('sessionController');
    if (typeof controller?.list !== 'function')
        throw new Error('DSH 原生会话检查不可用，未停止节点。');
    signal.throwIfAborted();
    const value = await controller.list({}, signal);
    signal.throwIfAborted();
    if (!Array.isArray(value?.items) || value.items.some((s) => typeof s.sessionId !== 'string'
        || !s.sessionId || typeof s.running !== 'boolean')
        || new Set(value.items.map((s) => s.sessionId)).size !== value.items.length) {
        throw new Error('DSH 原生会话状态不完整，未停止节点。');
    }
    return value;
}
export async function quiesceNativeHost(_ctx, _read, _disposing) {
    throw legacyUpdateError();
}
export async function createInstallControl(context, _config) {
    if (desktopOwnsLifecycle(context.root || context))
        throw new Error('请通过 DSH 桌面应用的插件管理页更新，未停止节点。');
    throw legacyUpdateError();
}
/** Old HMR callers fail before any host resource is acquired. */
export const apply = async (ctx, config) => {
    await createInstallControl(ctx, config);
};
