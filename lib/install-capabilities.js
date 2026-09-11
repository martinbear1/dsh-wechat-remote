export function assertNativeUpdateCapabilities(context) {
    const ctx = context.root || context;
    const web = ctx.get('webServer');
    const sessions = ctx.get('sessions');
    const missing = [];
    for (const name of ['on', 'listeners', 'removeAllListeners', 'removeListener']) {
        if (typeof web?.server?.[name] !== 'function')
            missing.push('webServer.' + name);
    }
    for (const name of ['get', 'list', 'flush']) {
        if (typeof sessions?.[name] !== 'function')
            missing.push('sessions.' + name);
    }
    if (typeof ctx.fiber?.dispose !== 'function')
        missing.push('lifecycle.dispose');
    if (missing.length)
        throw new Error('当前宿主缺少安全更新所需能力，未停止节点：' + missing.join(', '));
}
