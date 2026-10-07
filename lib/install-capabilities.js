/** Live installation belongs to DSH's public PluginManager. Older CLI hosts
 * have no public maintenance transaction; private HTTP listeners and root-fiber
 * disposal are not a supported substitute. */
export const LEGACY_UPDATE_MANUAL_MESSAGE = '此安装由 DSH Web 命令行管理，不支持一键在线更新。请先通过原启动方式正常停止 Web（后台服务需暂停自动重启），再执行原安装命令；原生安装包请使用 DSH 插件管理页。未停止或修改当前节点。';
export function legacyUpdateError() {
    return Object.assign(new Error(LEGACY_UPDATE_MANUAL_MESSAGE), { code: 'NATIVE_MANUAL_UPDATE_REQUIRED' });
}
/** Compatibility denial for old installer imports; never inspects a host. */
export function assertNativeUpdateCapabilities(_context) {
    throw legacyUpdateError();
}
