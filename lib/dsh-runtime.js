import { homedir } from 'node:os';
import path from 'node:path';
/** Match DSH's home override without importing a package absent in older DSH. */
export function adapterDshHome(environment = process.env, userHome = homedir()) {
    const configured = environment.DSH_HOME;
    const selected = configured && configured.trim() ? configured : path.join(userHome, '.dsh');
    const expanded = selected === '~' ? userHome
        : /^~[\\/]/.test(selected) ? path.join(userHome, selected.slice(2)) : selected;
    return path.resolve(expanded);
}
function validPort(value) {
    const parsed = typeof value === 'number'
        ? value
        : typeof value === 'string' && /^\d{1,5}$/.test(value)
            ? Number(value)
            : Number.NaN;
    return Number.isSafeInteger(parsed) && parsed >= 1 && parsed <= 65_535
        ? parsed
        : null;
}
/**
 * Resolve the listening DSH Web port from the host service itself.
 *
 * `dsh --port` is a command-line option, not an inherited `DSH_PORT`
 * environment variable. Reading `ctx.webServer.port` therefore keeps the
 * adapter attached to the correct profile and also supports `--port 0` after
 * DSH has selected an OS-assigned port. The environment variable remains a
 * compatibility fallback for hand-built/older compositions.
 */
export function resolveDshWebRuntime(ctx, environment = process.env) {
    const webServer = ctx.get('webServer');
    const servicePort = validPort(webServer?.port);
    if (servicePort !== null)
        return { port: servicePort, source: 'web-server' };
    const environmentPort = validPort(environment.DSH_PORT);
    if (environmentPort !== null)
        return { port: environmentPort, source: 'environment' };
    return { port: 3080, source: 'legacy-default' };
}
/** Only the active profile's loopback Web UI may read the local pairing door. */
export function isAllowedDshWebOrigin(origin, port) {
    if (!origin)
        return false;
    try {
        const parsed = new URL(origin);
        const loopback = parsed.hostname === '127.0.0.1'
            || parsed.hostname === 'localhost'
            || parsed.hostname === '[::1]';
        const effectivePort = parsed.port || (parsed.protocol === 'https:' ? '443' : '80');
        return loopback
            && parsed.protocol === 'http:'
            && effectivePort === String(port)
            && parsed.username === ''
            && parsed.password === ''
            && parsed.pathname === '/'
            && parsed.search === ''
            && parsed.hash === '';
    }
    catch {
        return false;
    }
}
