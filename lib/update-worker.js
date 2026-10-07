/** Historical worker entry is fail-closed. Offline installation uses DSH's
 * native CLI directly; no live restart/rollback transaction is supported. */
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { legacyUpdateError } from './install-capabilities.js';
/** Used only by the stopped-host native CLI installer. */
export function releaseOwnedUpdateLock(lock, id) {
    try {
        if (fs.readFileSync(lock, 'utf8') === id)
            fs.unlinkSync(lock);
    }
    catch { /* never remove another job's lock */ }
}
const hashFile = (f) => createHash('sha256').update(fs.readFileSync(f)).digest('hex');
/** Read-only audit helpers retained for durable-data regression checks. */
export function durableSnapshot(job) {
    const result = {};
    const walk = (dir) => {
        if (!fs.existsSync(dir))
            return;
        for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
            const file = path.join(dir, e.name);
            // Coordination receipts and the migration journal/ledger are runtime
            // bookkeeping, not user data. QR tickets may expire while upgrading.
            // Their durable binding is checked separately below.
            if (path.relative(job.home, file).split(path.sep).includes('harness-remote')
                && (['installation-offers', '.storage-lock', 'storage-layout.json', 'storage-transaction.json', 'gate-wechat-state.json'].includes(e.name)
                    || /^\.storage-lock-pending-\d+-[a-f0-9]{32}$/.test(e.name)))
                continue;
            if (e.isSymbolicLink())
                result[path.relative(job.home, file)] = createHash('sha256').update(fs.readlinkSync(file)).digest('hex');
            else if (e.isDirectory())
                walk(file);
            else if (e.isFile())
                result[path.relative(job.home, file)] = hashFile(file);
        }
    };
    walk(path.join(job.home, 'sessions'));
    walk(path.join(job.home, 'attachments'));
    walk(path.join(job.home, 'harness-remote'));
    for (const e of fs.readdirSync(job.home, { withFileTypes: true })) {
        if (e.isFile() && /(?:identity|settings|credentials|public|gate-wechat)/i.test(e.name) && !e.name.endsWith('.log')) {
            // Pairing tickets may legitimately expire. Protect durable identity and
            // the encrypted-LAN grant, not transient QR state.
            const f = path.join(job.home, e.name);
            if (e.name === 'gate-wechat-state.json' || f === job.stateFile)
                continue;
            result[e.name] = hashFile(f);
        }
    }
    if (fs.existsSync(job.stateFile)) {
        const state = JSON.parse(fs.readFileSync(job.stateFile, 'utf8'));
        result['$binding'] = createHash('sha256').update(JSON.stringify([state.token, state.publicIdentityNodeId])).digest('hex');
    }
    return result;
}
export function assertPreserved(before, after) {
    for (const [key, hash] of Object.entries(before))
        if (after[key] !== hash)
            throw new Error('升级后数据校验不一致；停止自动操作并保留备份');
}
/** Deny even a well-formed historical job before inspecting its paths, calling
 * quiesce, emitting progress, acquiring a lock or changing files/processes. */
export async function executeUpdate(_job, _progress, _quiesce) {
    throw legacyUpdateError();
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    console.error(legacyUpdateError().message);
    process.exitCode = 1;
    if (process.connected)
        process.disconnect();
}
