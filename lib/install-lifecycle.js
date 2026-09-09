/** Host lifecycle adapters. Never discover a process merely from an open port. */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync, spawn } from 'node:child_process';
const serviceName = (s) => /^[A-Za-z0-9_.@-]{1,180}$/.test(s);
function run(command, args) {
    return execFileSync(command, args, { encoding: 'utf8', windowsHide: true, timeout: 15000, maxBuffer: 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}
export function validateManager(value) {
    if (value.kind === 'process')
        return;
    if (value.kind === 'systemd' && process.platform === 'linux' && serviceName(value.unit) && value.unit.endsWith('.service'))
        return;
    if (value.kind === 'launchd' && process.platform === 'darwin' && serviceName(value.label)
        && /^gui\/\d+$/.test(value.domain) && value.domain === `gui/${process.getuid?.()}`
        && path.isAbsolute(value.plist) && fs.statSync(value.plist).isFile())
        return;
    throw new Error('无法确认原后台服务，未停止 DSH。');
}
/** Called INSIDE DSH, so pid and service ownership cannot be guessed by a client. */
export function currentHostManager() {
    if (process.env.PM2_HOME || process.env.NODE_APP_INSTANCE || process.env.KUBERNETES_SERVICE_HOST || process.env.container)
        throw new Error('此后台管理方式尚不支持自动重启。');
    if (process.platform === 'linux') {
        const group = fs.readFileSync('/proc/self/cgroup', 'utf8');
        const units = group.split(/[\n/]/).filter(s => serviceName(s) && s.endsWith('.service'));
        const unit = units.at(-1);
        if (unit && !/^user@\d+\.service$/.test(unit)) {
            const pid = Number(run('systemctl', ['--user', 'show', unit, '--property=MainPID', '--value']));
            if (pid !== process.pid)
                throw new Error('DSH 不是该服务的独立主进程，未停止后台服务。');
            return { kind: 'systemd', unit };
        }
        if (process.env.INVOCATION_ID)
            throw new Error('无法确认 systemd 服务归属，未停止 DSH。');
    }
    if (process.platform === 'darwin') {
        const rows = run('/bin/launchctl', ['list']).split('\n');
        const row = rows.map(s => s.trim().split(/\s+/)).find(parts => parts[0] === String(process.pid));
        if (row) {
            const label = row[2], domain = `gui/${process.getuid?.()}`;
            if (!serviceName(label))
                throw new Error('后台任务名称无效。');
            const printed = run('/bin/launchctl', ['print', `${domain}/${label}`]);
            const plist = /^\s*path = (.+\.plist)\s*$/m.exec(printed)?.[1];
            if (!plist)
                throw new Error('后台任务缺少可恢复的启动配置。');
            const result = { kind: 'launchd', label, domain, plist };
            validateManager(result);
            return result;
        }
        if (process.env.LAUNCH_JOBKEY_LABEL)
            throw new Error('无法确认 launchd 服务归属，未停止 DSH。');
    }
    return { kind: 'process' };
}
export function stopManagedHost(manager) {
    validateManager(manager);
    if (manager.kind === 'systemd')
        run('systemctl', ['--user', 'stop', manager.unit]);
    else if (manager.kind === 'launchd')
        run('/bin/launchctl', ['bootout', `${manager.domain}/${manager.label}`]);
    else
        throw new Error('普通 DSH 进程必须由其启动握手停止。');
}
export function startManagedHost(manager) {
    validateManager(manager);
    if (manager.kind === 'systemd')
        run('systemctl', ['--user', 'start', manager.unit]);
    else if (manager.kind === 'launchd')
        run('/bin/launchctl', ['bootstrap', manager.domain, manager.plist]);
    else
        throw new Error('普通 DSH 进程必须由原环境启动。');
}
/** Service-owned children may be killed with their parent: use a sibling job. */
export function startUpdateWorker(manager, directory, executable) {
    validateManager(manager);
    const id = path.basename(directory);
    if (!/^[a-f0-9]{32}$/.test(id))
        throw new Error('无效的更新任务');
    const args = [path.join(directory, 'update-worker.js'), path.join(directory, 'job.json')];
    if (manager.kind === 'systemd') {
        run('systemd-run', ['--user', '--quiet', '--collect', `--unit=dsh-wechat-update-${id}`, '--property=Type=exec', `--working-directory=${directory}`, executable, ...args]);
    }
    else if (manager.kind === 'launchd') {
        run('/bin/launchctl', ['submit', '-l', `dsh.wechat.update.${id}`, '-o', path.join(directory, 'worker.log'), '-e', path.join(directory, 'worker.log'), '--', executable, ...args]);
    }
    else {
        const log = fs.openSync(path.join(directory, 'worker.log'), 'a', 0o600);
        const child = spawn(executable, args, { cwd: directory, env: process.env, windowsHide: true, detached: true, stdio: ['ignore', log, log] });
        fs.closeSync(log);
        child.unref();
        child.on('error', () => { });
        if (!child.pid)
            throw new Error('无法启动更新进程');
    }
}
/** Remove only this operation's transient launchd label after its progress lease. */
export function finishUpdateWorker(manager, directory) {
    const id = path.basename(directory);
    if (manager?.kind !== 'launchd' || !/^[a-f0-9]{32}$/.test(id))
        return;
    try {
        run('/bin/launchctl', ['remove', `dsh.wechat.update.${id}`]);
    }
    catch { /* The job may terminate itself during removal. */ }
}
