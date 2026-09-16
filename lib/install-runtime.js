/** Shared by the npm installer and the WebUI updater. No global tool lookup. */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
export const INSTALL_PNPM_VERSION = '11.22.0';
/** WebUI updates replace the package that contains pnpm. Keep the tools alive
 * outside that profile for this operation; never relocate the user's profile. */
export async function pinInstallRuntime(runtime, directory) {
    let root = path.dirname(runtime.cli);
    while (!fs.existsSync(path.join(root, 'package.json'))) {
        const parent = path.dirname(root);
        if (parent === root)
            throw new Error('无法定位安装工具包。');
        root = parent;
    }
    const manifest = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
    if (manifest.name !== 'pnpm' || manifest.version !== runtime.version)
        throw new Error('安装工具版本不一致。');
    const target = path.join(directory, 'install-runtime');
    if (fs.existsSync(target))
        throw new Error('本次安装工具目录已存在。');
    fs.cpSync(root, target, { recursive: true, dereference: false, verbatimSymlinks: true, mode: fs.constants.COPYFILE_FICLONE });
    const pinned = { ...runtime, cli: path.join(target, path.relative(root, runtime.cli)) };
    await verifyInstallRuntime(pinned);
    return pinned;
}
export function resolveInstallRuntime(owner, executable = process.execPath, nodeVersion = process.versions.node) {
    const [major, minor] = nodeVersion.split('.').map(Number);
    if (!(major > 22 || major === 22 && minor >= 13))
        throw new Error('当前 Node.js 版本不满足安装要求（22.13 或更高），未修改插件。');
    const require = createRequire(path.resolve(owner, 'package.json'));
    let filename;
    // pnpm 11 publishes its manifest as the package's root export. Respect that
    // public export instead of reaching into a blocked package.json subpath.
    try {
        filename = require.resolve('pnpm');
    }
    catch {
        throw new Error('安装工具不完整，请使用官方安装命令自动修复。');
    }
    const manifest = JSON.parse(fs.readFileSync(filename, 'utf8'));
    if (manifest.name !== 'pnpm' || manifest.version !== INSTALL_PNPM_VERSION)
        throw new Error('安装工具版本校验失败，未修改插件。');
    const entry = typeof manifest.bin === 'string' ? manifest.bin : manifest.bin?.pnpm;
    if (typeof entry !== 'string' || path.isAbsolute(entry))
        throw new Error('安装工具入口无效。');
    const root = fs.realpathSync(path.dirname(filename)), cli = fs.realpathSync(path.resolve(root, entry));
    const relative = path.relative(root, cli);
    if (!relative || relative.startsWith('..') || path.isAbsolute(relative) || !fs.statSync(cli).isFile())
        throw new Error('安装工具入口不在包目录内。');
    return { executable: fs.realpathSync(executable), cli, version: manifest.version };
}
export function verifyInstallRuntime(runtime) {
    return new Promise((resolve, reject) => {
        const child = spawn(runtime.executable, [runtime.cli, '--version'], {
            windowsHide: true, shell: false, stdio: ['ignore', 'pipe', 'pipe'],
            env: { ...process.env, COREPACK_ENABLE_AUTO_PIN: '0', npm_config_manage_package_manager_versions: 'false' },
        });
        let stdout = '', size = 0, settled = false;
        const finish = (error) => {
            if (settled)
                return;
            settled = true;
            clearTimeout(timer);
            error ? reject(error) : resolve();
        };
        const timer = setTimeout(() => { child.kill(); finish(new Error('安装工具启动超时，未修改插件。')); }, 15000);
        child.stdout.on('data', b => { size += b.length; if (size > 16384) {
            child.kill();
            finish(new Error('安装工具响应异常。'));
        }
        else
            stdout += b.toString(); });
        child.stderr.on('data', () => { });
        child.once('error', () => finish(new Error('无法启动安装工具，未修改插件。')));
        child.once('close', code => finish(code === 0 && stdout.trim() === runtime.version ? undefined : new Error('安装工具运行验证失败，未修改插件。')));
    });
}
