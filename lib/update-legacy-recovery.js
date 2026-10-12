/** One bounded participant in an authenticated, explicitly requested legacy Web
 * update. It never installs, restores user data, controls another process or
 * changes the frozen worker's verdict. A verified rollback can release the old
 * maintenance receipt; that receipt is also used by the original failed-update
 * path and does not mean that the upgrade succeeded.
 */
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { createHash, randomBytes } from 'node:crypto';
import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
const frozenWorkers = {
    '1.7.10': '5eb3b67760f15f3d468b5c85d84c595e9ba7b9c94bfb70eec8c0f5476e64a2dc',
    '1.7.13': '1438dcfff4b1684d68d1b3088e0b402714cef3d0676dd03bafbcd76932c3e813',
};
const mismatch = '升级后数据校验不一致；停止自动操作并保留备份';
const owner = '@harness-remote/dsh-wechat-remote';
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
const execute = promisify(execFile);
const inside = (parent, file) => {
    const relative = path.relative(parent, file);
    return Boolean(relative) && !relative.startsWith('..') && !path.isAbsolute(relative);
};
async function json(file, limit = 16384) {
    const stat = await fsp.lstat(file);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size > limit)
        throw Error('Invalid recovery record');
    return JSON.parse(await fsp.readFile(file, 'utf8'));
}
async function writeRecord(file, value) {
    const temporary = `${file}.${randomBytes(8).toString('hex')}.tmp`;
    try {
        await fsp.writeFile(temporary, JSON.stringify(value), { mode: 0o600, flag: 'wx' });
        await fsp.rename(temporary, file);
    }
    finally {
        await fsp.unlink(temporary).catch(() => { });
    }
}
function originOf(value) {
    const url = new URL(value);
    if (url.protocol !== 'http:' || url.hostname !== '127.0.0.1' || !url.port
        || url.username || url.password || url.pathname !== '/' || url.search || url.hash)
        throw Error('Invalid worker origin');
    return url.origin;
}
async function validate(request) {
    const { job } = request;
    if (!frozenWorkers[job.previousVersion] || !/^[a-f0-9]{32}$/.test(job.id)
        || job.directory !== path.join(job.home, 'harness-remote-updates', job.id)
        || path.dirname(job.profile) !== path.join(job.home, 'profiles')
        || !inside(job.home, job.stateFile) || !/^[a-f0-9]{48}$/.test(job.statusToken)
        || ![job.webPort, job.gatePort, job.localPort].every(port => Number.isInteger(port) && port > 0 && port < 65536)
        || new Set([job.webPort, job.gatePort, job.localPort]).size !== 3)
        throw Error('Invalid recovery scope');
    const managed = job.manager?.kind === 'systemd' && process.platform === 'linux'
        && /^[A-Za-z0-9_.@-]{1,180}\.service$/.test(job.manager.unit || '');
    if ((job.manager?.kind !== 'process' && !managed) || path.basename(job.profile) === 'desktop')
        throw Error('Unsupported Web recovery lifecycle');
    for (const directory of [job.home, job.profile, job.directory]) {
        if (await fsp.realpath(directory) !== directory || !(await fsp.lstat(directory)).isDirectory())
            throw Error('Recovery scope changed');
    }
    const saved = await json(path.join(job.directory, 'job.json'));
    for (const key of ['id', 'directory', 'home', 'profile', 'stateFile', 'webPort', 'gatePort', 'localPort', 'statusToken', 'targetVersion', 'previousVersion', 'dshVersion']) {
        if (saved[key] !== job[key])
            throw Error('Recovery job changed');
    }
    if (saved.manager?.kind !== job.manager?.kind || saved.manager?.unit !== job.manager?.unit)
        throw Error('Recovery lifecycle changed');
    if (await fsp.readFile(path.join(job.profile, '.harness-remote-update.lock'), 'utf8') !== job.id
        || (await json(path.join(job.directory, 'authorized.json'))).id !== job.id)
        throw Error('Recovery transaction is not authorized');
    const ready = await json(path.join(job.directory, 'worker-ready.json'));
    if (ready.id !== job.id || originOf(ready.origin) !== originOf(request.workerOrigin))
        throw Error('Recovery worker changed');
    const worker = path.join(job.directory, 'update-worker.js');
    const stat = await fsp.lstat(worker);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 128 * 1024
        || sha(await fsp.readFile(worker)) !== frozenWorkers[job.previousVersion])
        throw Error('Unrecognized frozen worker');
}
async function responseJson(response, limit) {
    if (!response.ok || !response.body)
        throw Error('Recovery endpoint is unavailable');
    const reader = response.body.getReader(), parts = [];
    let bytes = 0;
    try {
        while (true) {
            const next = await reader.read();
            if (next.done)
                break;
            bytes += next.value.length;
            if (bytes > limit)
                throw Error('Recovery response exceeds its bound');
            parts.push(next.value);
        }
    }
    finally {
        await reader.cancel().catch(() => { });
    }
    return JSON.parse(Buffer.concat(parts).toString('utf8'));
}
async function status(request, signal) {
    const { job } = request;
    const value = await responseJson(await fetch(request.workerOrigin + '/status', { headers: {
            origin: `http://127.0.0.1:${job.webPort}`, authorization: `Bearer ${job.statusToken}`,
        }, signal: AbortSignal.any([signal, AbortSignal.timeout(2000)]), redirect: 'error' }), 16384);
    if (value.jobId !== job.id && !(job.previousVersion === '1.7.10' && value.jobId === undefined))
        throw Error('Wrong recovery worker');
    if (typeof value.terminal !== 'boolean')
        throw Error('Invalid recovery status');
    return value;
}
async function runtimePid(job) {
    const saved = await json(path.join(job.directory, 'job.json'));
    let pid;
    if (job.manager?.kind === 'systemd') {
        const result = await execute('systemctl', ['--user', 'show', job.manager.unit, '--property=MainPID', '--value'], { timeout: 5000, maxBuffer: 16384 });
        pid = Number(result.stdout.trim());
    }
    else {
        const restarted = await json(path.join(job.directory, 'restarted-process.json'));
        if (restarted.cli !== saved.cli || restarted.home !== job.home || restarted.webPort !== job.webPort)
            throw Error('Restarted process belongs to another host');
        pid = restarted.pid;
    }
    if (!Number.isInteger(pid) || pid < 1)
        throw Error('Restored process is not known');
    process.kill(pid, 0); // Existence check only; never stop or signal the host.
    if (process.platform === 'linux') {
        const argv = (await fsp.readFile(`/proc/${pid}/cmdline`, 'utf8')).split('\0').filter(Boolean);
        if (JSON.stringify(argv.slice(1)) !== JSON.stringify(saved.argv))
            throw Error('Restored process command changed');
    }
    return pid;
}
/** Bounded streaming byte-prefix proof, not a JSON rewrite or a zstd decoder.
 * For compressed native append logs, the old digest must match exactly before
 * a new frame's magic. Even an incidental magic cannot forge the old SHA256.
 * Together with native history reads this proves preservation and availability,
 * not complete semantic validation of every newly appended on-disk frame.
 */
export async function verifyLegacyRecoveryData(job, signal) {
    const before = await json(path.join(job.directory, 'before-hashes.json'), 8 * 1024 * 1024);
    if (!before || Array.isArray(before) || typeof before !== 'object' || !before.$binding
        || Object.keys(before).length > 100000)
        throw Error('Invalid original data ledger');
    const proof = { files: 0, appended: [] };
    let budget = 1024 * 1024 * 1024;
    for (const [relative, expected] of Object.entries(before)) {
        signal.throwIfAborted();
        if (typeof expected !== 'string' || !/^[a-f0-9]{64}$/.test(expected))
            throw Error('Invalid original digest');
        if (relative === '$binding') {
            const state = await json(job.stateFile);
            if (sha(JSON.stringify([state.token, state.publicIdentityNodeId])) !== expected)
                throw Error('Pairing changed');
            continue;
        }
        const file = path.resolve(job.home, relative);
        if (!inside(job.home, file) || path.relative(job.home, file) !== relative)
            throw Error('Invalid original data path');
        if (await fsp.realpath(path.dirname(file)) !== path.dirname(file))
            throw Error('Data parent is not a plain directory');
        const initial = await fsp.lstat(file);
        if (initial.isSymbolicLink()) {
            if (sha(await fsp.readlink(file)) !== expected)
                throw Error('Data link changed');
            proof.files++;
            continue;
        }
        if (!initial.isFile() || initial.size > 256 * 1024 * 1024 || initial.size > budget)
            throw Error('Data verification bound exceeded');
        budget -= initial.size;
        const kind = /^sessions[\\/].*[\\/]session\.v\d+\.jsonl(\.zstd)?$/.exec(relative);
        const compressed = Boolean(kind?.[1]), hash = createHash('sha256');
        const magic = Buffer.from([0x28, 0xb5, 0x2f, 0xfd]);
        let tail = Buffer.alloc(0), bytes = 0, prefix = -1;
        const stream = fs.createReadStream(file, { highWaterMark: 64 * 1024, signal });
        for await (const chunk of stream) {
            signal.throwIfAborted();
            const block = Buffer.concat([tail, chunk]);
            if (bytes + block.length > initial.size)
                throw Error('Data grew during recovery verification');
            const end = compressed ? Math.max(0, block.length - 3) : block.length;
            let cursor = 0;
            if (kind && prefix < 0) {
                let position = block.indexOf(compressed ? magic : 10);
                while (position >= 0 && position < end) {
                    const boundary = compressed ? position : position + 1;
                    hash.update(block.subarray(cursor, boundary));
                    bytes += boundary - cursor;
                    cursor = boundary;
                    if (bytes > 0 && hash.copy().digest('hex') === expected) {
                        prefix = bytes;
                        break;
                    }
                    position = block.indexOf(compressed ? magic : 10, position + 1);
                }
            }
            hash.update(block.subarray(cursor, end));
            bytes += end - cursor;
            tail = block.subarray(end);
        }
        hash.update(tail);
        bytes += tail.length;
        const current = hash.digest('hex'), final = await fsp.lstat(file);
        if (initial.ino !== final.ino || initial.size !== final.size || initial.mtimeMs !== final.mtimeMs || bytes !== initial.size)
            throw Error('Data changed during recovery verification');
        if (current !== expected) {
            if (!kind || prefix <= 0 || prefix >= bytes)
                throw Error('Existing data was rewritten or removed');
            proof.appended.push({ file: relative, originalSha256: expected, currentSha256: current, originalBytes: prefix, currentBytes: bytes });
        }
        proof.files++;
    }
    return proof;
}
async function rpc(job, method, payload, signal) {
    const state = await json(job.stateFile);
    const value = await responseJson(await fetch(`http://127.0.0.1:${job.gatePort}/api/${method}`, {
        method: 'POST', headers: { authorization: `Bearer ${state.token}`, 'content-type': 'application/json', 'x-harness-update-probe': job.statusToken },
        body: JSON.stringify({ type: 'client-request', rpcId: 'legacy-rollback-recovery', method, payload }),
        signal: AbortSignal.any([signal, AbortSignal.timeout(5000)]), redirect: 'error',
    }), 4 * 1024 * 1024);
    if (!value.result?.ok)
        throw Error('Native rollback read failed');
    return value.result.value;
}
/** Inverse of official dsh-session-persistence-jsonl encodeSegment (rc.2,
 * lib/index.js:853): escapes UTF-16 code units, including lone surrogates, as
 * uppercase ~XXXX. This value is only a native RPC identity, never a path.
 */
export function decodeLegacySessionDirectory(segment) {
    if (!/^(?:[A-Za-z0-9._-]|~[0-9A-F]{4})+$/.test(segment))
        throw Error('Invalid native session directory');
    const value = segment.replace(/~([0-9A-F]{4})/g, (_escape, hex) => String.fromCharCode(parseInt(hex, 16)));
    const canonical = value === '.' ? '~002E' : value === '..' ? '~002E~002E'
        : value.split('').map(unit => /^[A-Za-z0-9._-]$/.test(unit) ? unit
            : `~${unit.charCodeAt(0).toString(16).toUpperCase().padStart(4, '0')}`).join('');
    if (canonical !== segment)
        throw Error('Noncanonical native session directory');
    return value;
}
async function nativeRestored(job, data, signal) {
    const manifest = await json(path.join(job.profile, 'node_modules', owner, 'package.json'), 128 * 1024);
    if (manifest.name !== owner || manifest.version !== job.previousVersion)
        throw Error('Old package has not been restored');
    const description = await rpc(job, 'wechatHost/describe', { args: { request: {} } }, signal);
    if (!description?.ok || description.value?.pluginVersion !== job.previousVersion || description.value?.agentVersion !== job.dshVersion)
        throw Error('Actual old runtime is not ready');
    const list = await rpc(job, 'session.list', {}, signal);
    if (!Array.isArray(list.items) || list.items.length > 10000)
        throw Error('Invalid native session list');
    const ids = new Set();
    for (const item of list.items) {
        if (typeof item.sessionId !== 'string' || !item.sessionId || ids.has(item.sessionId))
            throw Error('Invalid native session identity');
        ids.add(item.sessionId);
    }
    // Byte proofs cover every original file. Read only changed histories: an old
    // unreadable unrelated session must not become a new recovery requirement.
    // A native list may be paginated or hide archived sessions, so direct history
    // reads do not depend on membership in this particular list response.
    const reads = new Set(data.appended.map(item => decodeLegacySessionDirectory(path.basename(path.dirname(item.file)))));
    for (const sessionId of reads) {
        await rpc(job, 'session.history', { sessionId, maxMessages: 1 }, signal);
    }
    return { listed: ids.size, historiesRead: reads.size };
}
async function fenceStatuses(job, signal) {
    return Promise.all([job.webPort, job.gatePort, job.localPort].map(async (port) => {
        const response = await fetch(`http://127.0.0.1:${port}/gate/status`, { redirect: 'error', signal: AbortSignal.any([signal, AbortSignal.timeout(3000)]) });
        await response.body?.cancel();
        return response.status;
    }));
}
/** Must observe a live active worker itself; disk journals cannot start recovery. */
export async function runLegacyRecovery(request, ready = () => { }) {
    await validate(request);
    const { job } = request, lifetime = AbortSignal.timeout(8 * 60 * 1000);
    let value = await status(request, lifetime);
    if (value.terminal || !['restarting', 'verifying'].includes(value.phase))
        throw Error('Recovery requires a live startup transaction');
    const candidatePid = await runtimePid(job);
    await writeRecord(path.join(job.directory, 'recovery-participant.json'), { id: job.id, pid: process.pid, candidatePid,
        lifecycle: job.manager?.kind, unit: job.manager?.kind === 'systemd' ? `dsh-wechat-recovery-${job.id}.service` : undefined });
    ready();
    while (!value.terminal) {
        await delay(500, undefined, { signal: lifetime });
        value = await status(request, lifetime);
    }
    if (value.phase !== 'attention' || value.ok !== false)
        return;
    await validate(request);
    const result = await json(path.join(job.directory, 'result.json'));
    if (result.phase !== 'attention' || result.terminal !== true || result.ok !== false)
        throw Error('Worker verdict is not final');
    for (const name of ['failure.json', 'rollback-failure.json']) {
        if ((await json(path.join(job.directory, name))).message !== mismatch)
            throw Error('Failure is not the known byte-comparison rollback');
    }
    const signal = AbortSignal.any([lifetime, AbortSignal.timeout(90000)]);
    const restoredPid = await runtimePid(job);
    if (restoredPid === candidatePid)
        throw Error('Candidate process was not replaced by the rollback');
    const initialData = await verifyLegacyRecoveryData(job, signal);
    const sessions = await nativeRestored(job, initialData, signal);
    const data = await verifyLegacyRecoveryData(job, signal);
    if (!(await fenceStatuses(job, signal)).every(code => code === 503))
        throw Error('Old maintenance no longer belongs to this recovery');
    await validate(request);
    const current = await status(request, signal);
    if (current.phase !== 'attention' || current.ok !== false || !current.terminal)
        throw Error('Worker verdict changed');
    const audit = { id: job.id, outcome: 'rollback-recovered', upgradeSucceeded: false, restoredVersion: job.previousVersion, restoredPid,
        verifiedAt: new Date().toISOString(), sessions, data, originalVerdict: result };
    // Preserve the worker's result, failures and original digests. Its original
    // rollback path also uses this same maintenance receipt with ok:false.
    await writeRecord(path.join(job.directory, 'maintenance-recovery.json'), audit);
    const receipt = path.join(job.directory, 'verification-complete.json');
    try {
        await fsp.lstat(receipt);
        throw Error('Maintenance receipt already exists');
    }
    catch (error) {
        if (error.code !== 'ENOENT')
            throw error;
    }
    await writeRecord(receipt, { id: job.id, outcome: 'rollback-recovered' });
    let released = false;
    for (let attempt = 0; attempt < 30; attempt++) {
        if ((await fenceStatuses(job, signal)).every(code => code !== 503)) {
            released = true;
            break;
        }
        await delay(100, undefined, { signal });
    }
    if (!released)
        throw Error('Old runtime did not release maintenance');
    const lock = path.join(job.profile, '.harness-remote-update.lock');
    if (await fsp.readFile(lock, 'utf8') === job.id)
        await fsp.unlink(lock);
    await writeRecord(path.join(job.directory, 'maintenance-recovery.json'), { ...audit, maintenanceReleased: true });
}
/** Called only by an already authenticated Web handoff. Failure is diagnostic,
 * never an exception on the ordinary upgrade/startup path. */
export async function startLegacyRecovery(request) {
    try {
        await validate(request);
        const live = await status(request, AbortSignal.timeout(2500));
        if (live.terminal || !['restarting', 'verifying'].includes(live.phase))
            return;
        const filename = path.join(request.job.directory, 'legacy-recovery.mjs');
        // The profile may be renamed/removed during rollback. The participant has
        // only built-in imports and is copied into this transaction before launch.
        await fsp.copyFile(fileURLToPath(import.meta.url), filename, fs.constants.COPYFILE_EXCL);
        if (request.job.manager?.kind === 'systemd') {
            await execute('systemd-run', ['--user', '--quiet', '--collect', `--unit=dsh-wechat-recovery-${request.job.id}`,
                '--property=Type=exec', '--property=RuntimeMaxSec=510', `--working-directory=${request.job.directory}`,
                process.execPath, filename, '--legacy-recovery', request.job.directory, request.workerOrigin], { timeout: 10000, maxBuffer: 16384 });
            for (let attempt = 0; attempt < 30; attempt++) {
                try {
                    if ((await json(path.join(request.job.directory, 'recovery-participant.json'))).id === request.job.id)
                        return;
                }
                catch { }
                await delay(100);
            }
            return;
        }
        const child = spawn(process.execPath, [filename, '--legacy-recovery', request.job.directory, request.workerOrigin], {
            detached: true, windowsHide: true, stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
        });
        await new Promise(resolve => {
            let finished = false;
            const timer = setTimeout(finish, 3000);
            function finish() { if (finished)
                return; finished = true; clearTimeout(timer); child.removeAllListeners('message'); if (child.connected)
                child.disconnect(); child.unref(); resolve(); }
            child.once('error', finish);
            child.once('message', message => { if (message?.ready === request.job.id)
                finish(); });
        });
    }
    catch { /* unsupported/stale/duplicate participants never impede the host */ }
}
if (process.argv[2] === '--legacy-recovery' && process.argv[1]
    && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
    const directory = path.resolve(process.argv[3] || '');
    void (async () => {
        const job = await json(path.join(directory, 'job.json'));
        if (job.directory !== directory)
            throw Error('Recovery directory changed');
        await runLegacyRecovery({ job, workerOrigin: process.argv[4] }, () => {
            process.send?.({ ready: job.id });
            if (process.connected)
                process.disconnect();
        });
    })().catch(async (error) => {
        // This is a diagnostic, not a replacement worker result. No credentials.
        try {
            await writeRecord(path.join(directory, 'maintenance-recovery-refused.json'), { message: String(error?.message || 'Recovery unavailable') });
        }
        catch { }
    });
}
