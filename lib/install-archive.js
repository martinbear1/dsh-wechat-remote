/** Pack the already downloaded public npm bundle, never link an NPX cache or
 * a peer's live package directory into the destination profile. */
import fs from 'node:fs';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createHash, randomBytes } from 'node:crypto';
import { auditNativeArchive } from './update-download.js';
export function checkedNativeSource(source, version) {
    if (!path.isAbsolute(source) || !/^\d+\.\d+\.\d+(?:-[\w.-]+)?$/.test(version))
        throw new Error('安装来源无效');
    const actual = fs.realpathSync(source);
    const read = (name) => JSON.parse(fs.readFileSync(path.join(actual, name), 'utf8'));
    const manifest = read('package.json');
    if (manifest.name !== 'dsh-wechat-remote' || manifest.version !== version || manifest.dsh?.bundle?.patch !== './cordis.patch.yml'
        || ['preinstall', 'install', 'postinstall', 'prepare', 'prepack', 'postpack'].some(key => manifest.scripts?.[key]))
        throw new Error('安装包与目标版本不一致');
    const metadata = read('assets/release.json');
    const release = metadata.catalog?.releases?.find((row) => row.version === version);
    const bytes = fs.readFileSync(path.join(actual, 'assets/plugin.tgz'));
    if (!release || metadata.version !== version || release.asset?.bytes !== bytes.length
        || createHash('sha256').update(bytes).digest('hex') !== release.asset.sha256)
        throw new Error('安装包校验失败');
    return actual;
}
export async function packNativeArchive(source, version, directory) {
    const actual = checkedNativeSource(source, version);
    const pnpm = path.join(actual, 'node_modules/pnpm/bin/pnpm.cjs');
    if (!fs.existsSync(pnpm))
        throw new Error('安装包缺少内置打包工具，未使用全局工具替代');
    fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
    const temporary = path.join(directory, `packing-${randomBytes(16).toString('hex')}.tgz`);
    try {
        await promisify(execFile)(process.execPath, [pnpm, '--config.ignore-scripts=true', '--config.node-linker=hoisted', 'pack', '--out', temporary], {
            cwd: actual, windowsHide: true, timeout: 60_000, maxBuffer: 1024 * 1024,
            env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
        });
        checkedNativeSource(actual, version);
        if (fs.statSync(temporary).size > 32 * 1024 * 1024)
            throw new Error('安装包超过安全大小限制');
        const bytes = fs.readFileSync(temporary);
        auditNativeArchive(bytes, version);
        const digest = createHash('sha256').update(bytes).digest('hex');
        const archive = path.join(directory, `${digest}.tgz`);
        try {
            fs.writeFileSync(archive, bytes, { flag: 'wx', mode: 0o600 });
        }
        catch (error) {
            if (error.code !== 'EEXIST'
                || createHash('sha256').update(fs.readFileSync(archive)).digest('hex') !== digest)
                throw error;
        }
        return archive;
    }
    finally {
        try {
            fs.unlinkSync(temporary);
        }
        catch (error) {
            if (error.code !== 'ENOENT')
                throw error;
        }
    }
}
