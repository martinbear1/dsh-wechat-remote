/** Install through DSH in the original profile; backups are never executed. */
import fs from 'node:fs';
import path from 'node:path';
import { spawn, execFile } from 'node:child_process';
export const PLUGIN_PACKAGE = '@harness-remote/dsh-wechat-remote';
export function safeProfileName(value) { return /^[A-Za-z0-9_-]{1,80}$/.test(value); }
/** Copy without following or rebasing links. Restore to the SAME original path. */
export function backupProfile(profile, backup) {
    if (fs.existsSync(backup))
        throw new Error('本次安装备份已存在，未覆盖。');
    fs.cpSync(profile, backup, { recursive: true, dereference: false, verbatimSymlinks: true,
        mode: fs.constants.COPYFILE_FICLONE,
        filter(source, target) {
            // Some Node/Windows cp implementations materialize directory junctions.
            // Copy link metadata explicitly; never traverse another plugin's target.
            if (!fs.lstatSync(source).isSymbolicLink())
                return true;
            const type = process.platform === 'win32'
                ? (fs.statSync(source, { throwIfNoEntry: false })?.isDirectory() ? 'junction' : 'file') : undefined;
            fs.symlinkSync(fs.readlinkSync(source), target, type);
            return false;
        } });
}
/** Private, per-operation PATH entry; never edit a global shim or shell profile. */
export function installToolPath(directory, runtime) {
    const bin = path.join(directory, 'tool-bin');
    fs.mkdirSync(bin, { mode: 0o700 });
    if (process.platform === 'win32') {
        // cmd reads batch files using its console code page, including detached
        // workers. Keep the file ASCII; Windows passes environment values as Unicode.
        // Delayed expansion must stay disabled for legitimate paths containing '!'.
        if (/["\r\n]/.test(runtime.executable + runtime.cli))
            throw new Error('安装工具路径包含无效字符。');
        fs.writeFileSync(path.join(bin, 'pnpm.cmd'), '@echo off\r\nsetlocal DisableDelayedExpansion\r\n"%HARNESS_INSTALL_NODE%" "%HARNESS_INSTALL_PNPM%" %*\r\n', { mode: 0o700 });
    }
    else {
        fs.writeFileSync(path.join(bin, 'pnpm'), '#!/bin/sh\nexec "$HARNESS_INSTALL_NODE" "$HARNESS_INSTALL_PNPM" "$@"\n', { mode: 0o700 });
    }
    return bin;
}
export class NativeInstallError extends Error {
    mayStillBeRunning;
    constructor(message, mayStillBeRunning = false) {
        super(message);
        this.mayStillBeRunning = mayStillBeRunning;
        this.name = 'NativeInstallError';
    }
}
export function runNativePlugin(cli, profile, home, toolPath, runtime, logFile, archiveName, timeoutMs = 600000) {
    if (!safeProfileName(profile) || !/^harness-remote-[\w.+-]+\.tgz$/.test(archiveName))
        throw new Error('无效的安装目标。');
    return new Promise((resolve, reject) => {
        const log = fs.openSync(logFile, 'a', 0o600);
        // Node can otherwise prefer an inherited Path over our PATH on Windows.
        const env = { ...process.env };
        const pathKey = Object.keys(env).find(key => key.toLowerCase() === 'path');
        const inheritedPath = pathKey ? env[pathKey] : '';
        if (process.platform === 'win32')
            for (const key of Object.keys(env))
                if (key.toLowerCase() === 'path')
                    delete env[key];
        Object.assign(env, { DSH_HOME: home, PATH: toolPath + path.delimiter + (inheritedPath || ''),
            HARNESS_INSTALL_NODE: runtime.executable, HARNESS_INSTALL_PNPM: runtime.cli,
            CI: 'true', COREPACK_ENABLE_AUTO_PIN: '0', npm_config_manage_package_manager_versions: 'false' });
        const child = spawn(runtime.executable, [cli, 'plugin', '--profile', profile, 'add',
            `file:${archiveName}`, '--ignore-scripts', '--config.frozen-lockfile=false', '--prefer-offline',
            '--config.manage-package-manager-versions=false', '--reporter=append-only'], {
            cwd: home, shell: false, windowsHide: true, detached: process.platform !== 'win32',
            stdio: ['ignore', log, log], env,
        });
        fs.closeSync(log);
        let finished = false, terminating = false, closed = false, terminationTimer;
        const fail = (message, uncertain = false) => finish(new NativeInstallError(`${message} 安装日志：${logFile}`, uncertain));
        const finish = (error) => {
            if (finished)
                return;
            finished = true;
            clearTimeout(timer);
            clearTimeout(terminationTimer);
            error ? reject(error) : resolve();
        };
        const timer = setTimeout(() => {
            if (closed)
                return;
            terminating = true;
            // DSH waits for pnpm. Killing only DSH would leave pnpm writing while
            // rollback restores files. Target only this invocation's own tree/group.
            terminationTimer = setTimeout(() => fail('安装超时，尚不能确认安装进程已退出；未自动回退，请勿重复安装。', true), 15000);
            if (process.platform === 'win32') {
                if (!child.pid)
                    return fail('安装程序未启动。');
                execFile(path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'taskkill.exe'), ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, timeout: 10000 }, error => {
                    if (error)
                        fail('安装超时，无法确认安装进程树已退出；未自动回退，请勿重复安装。', true);
                    else if (closed)
                        fail('下载或安装超时，安装进程已停止。');
                    else
                        child.once('close', () => fail('下载或安装超时，安装进程已停止。'));
                });
            }
            else {
                try {
                    if (child.pid)
                        process.kill(-child.pid, 'SIGKILL');
                }
                catch (error) {
                    if (error.code !== 'ESRCH')
                        return fail('无法停止超时的安装进程；未自动回退。', true);
                }
                if (closed)
                    fail('下载或安装超时，安装进程已停止。');
                else
                    child.once('close', () => fail('下载或安装超时，安装进程已停止。'));
            }
        }, timeoutMs);
        child.once('error', error => fail(`无法启动 DSH 原生安装程序（${error.code || error.name}）。`));
        child.once('close', (code, signal) => {
            closed = true;
            if (terminating)
                return;
            if (code === 0)
                finish();
            else
                fail(`DSH 原生安装未完成（${signal ? `信号 ${signal}` : `退出码 ${code}`}）。`);
        });
    });
}
/** The caller must stop the owning host and complete its backup first. */
export async function installProfile(job) {
    const scope = path.basename(job.profile), home = path.dirname(path.dirname(job.profile));
    if (!safeProfileName(scope) || path.dirname(job.profile) !== path.join(home, 'profiles')
        || !/^[\w.+-]{1,80}$/.test(job.targetVersion))
        throw new Error('安装目标不明确。');
    fs.mkdirSync(job.profile, { recursive: true, mode: 0o700 });
    const archiveName = `harness-remote-${job.targetVersion}.tgz`;
    fs.copyFileSync(path.join(job.directory, 'release.tgz'), path.join(job.profile, archiveName));
    const tools = installToolPath(job.directory, job.runtime);
    // DSH/pnpm own dependency resolution and bundle registration. Do not rewrite
    // the manifest, packageManager, lockfile, or other plugin sources beforehand.
    await runNativePlugin(job.cli, scope, home, tools, job.runtime, path.join(job.directory, 'install.log'), archiveName);
    const installed = path.join(job.profile, 'node_modules', PLUGIN_PACKAGE);
    if (JSON.parse(fs.readFileSync(path.join(installed, 'package.json'), 'utf8')).version !== job.targetVersion)
        throw new Error('安装后插件版本不匹配。');
    const after = JSON.parse(fs.readFileSync(path.join(job.profile, 'package.json'), 'utf8'));
    if (!after.dsh?.profile?.bundles?.includes(PLUGIN_PACKAGE))
        throw new Error('DSH 尚未将插件注册为原生 profile 层。');
}
