import { randomBytes } from 'node:crypto';
import { lstat, mkdir, open, readFile, readdir, realpath, rename } from 'node:fs/promises';
import path from 'node:path';
import { assertScope, copy, exact, fail, identifier, row, sameScope, scopeValid } from './data.js';
import { sameTaskRef } from '../human-tools/protocol.js';
import { canonicalSubmission, decryptSubmission, sha256, submissionAnswers, submissionContext, submissionEnvelope, submissionManifest, SUBMISSION_CIPHER_MAX } from './submission-crypto.js';
const keyOf = (context) => sha256(canonicalSubmission(context));
async function syncDirectory(dir) {
    if (process.platform === 'win32')
        return; // file fsync+rename; no portable Windows directory fsync.
    const file = await open(dir, 'r');
    try {
        await file.sync();
    }
    finally {
        await file.close();
    }
}
async function writeNew(filename, value) {
    const file = await open(filename, 'wx', 0o600);
    try {
        await file.writeFile(value);
        await file.sync();
    }
    finally {
        await file.close();
    }
}
/** Ciphertext is the retained original. A committed directory contains both
 * the exact object and its durable receipt. There is no second index whose
 * transaction could falsely declare a missing file delivered. */
export class SubmissionReceiver {
    options;
    lifetime = new AbortController();
    tail = Promise.resolve();
    root = '';
    constructor(options) {
        this.options = options;
    }
    static async open(options) {
        if (!identifier(options.nodeId) || !path.isAbsolute(options.root))
            throw fail('receiver-path-invalid', '收件根目录无效');
        const receiver = new SubmissionReceiver(options);
        await mkdir(options.root, { recursive: true, mode: 0o700 });
        receiver.root = await realpath(options.root);
        if ((await lstat(options.root)).isSymbolicLink() || path.resolve(options.root) !== receiver.root)
            throw fail('receiver-path-invalid', '收件目录不可重定向');
        await receiver.recover();
        return receiver;
    }
    check(signal) { this.lifetime.signal.throwIfAborted(); signal?.throwIfAborted(); this.options.assertIdentity(); }
    serial(work) {
        const result = this.tail.then(() => { this.check(); return work(); });
        this.tail = result.catch(() => { });
        return result;
    }
    async directory(name) {
        if (!/^(?:[a-f0-9]{64}|\.stage-[a-f0-9]{64}-[a-f0-9]{24})$/.test(name))
            throw fail('receiver-path-invalid', '收件路径无效');
        if ((await lstat(this.root)).isSymbolicLink() || await realpath(this.root) !== this.root)
            throw fail('receiver-path-invalid', '收件目录已变化');
        const dir = path.join(this.root, name), stat = await lstat(dir);
        if (!stat.isDirectory() || stat.isSymbolicLink() || await realpath(dir) !== dir)
            throw fail('receiver-path-invalid', '收件路径不可重定向');
        return dir;
    }
    async readReceipt(dir) {
        const file = path.join(dir, 'receipt.json'), stat = await lstat(file);
        if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 64 * 1024)
            throw fail('receiver-store-invalid', '持久收件记录无效');
        let raw;
        try {
            raw = JSON.parse(await readFile(file, 'utf8'));
        }
        catch {
            throw fail('receiver-store-invalid', '持久收件记录不可读取');
        }
        if (!row(raw) || !exact(raw, ['schema', 'nodeId', 'origin', 'context', 'envelope', 'manifest', 'receivedAt', 'acked'])
            || raw.schema !== 'human.receiver.receipt.v1' || raw.nodeId !== this.options.nodeId || !scopeValid(raw.origin)
            || raw.origin.nodeId !== this.options.nodeId || !Number.isSafeInteger(raw.receivedAt) || Number(raw.receivedAt) < 0 || typeof raw.acked !== 'boolean')
            throw fail('receiver-store-invalid', '持久收件记录不属于此节点');
        const context = submissionContext(raw.context), envelope = submissionEnvelope(raw.envelope), manifest = submissionManifest(raw.manifest);
        if (envelope.keyId !== context.keyId || canonicalSubmission(manifest.context) !== canonicalSubmission(context))
            throw fail('receiver-store-invalid', '持久收件关联无效');
        return { ...raw, context, envelope, manifest };
    }
    async bytes(dir, receipt) {
        const filename = path.join(dir, 'payload.box'), stat = await lstat(filename);
        if (!stat.isFile() || stat.isSymbolicLink() || stat.size !== receipt.envelope.cipherBytes || stat.size > SUBMISSION_CIPHER_MAX)
            throw fail('receiver-store-invalid', '已接收附件缺失或大小不符，未发送交付确认');
        return readFile(filename);
    }
    async verified(dir, receipt) {
        const decoded = decryptSubmission(await this.bytes(dir, receipt), receipt.envelope, this.options.keys.secret(receipt.context.keyId, receipt.context.bindingKey), receipt.context, receipt.manifest.answers);
        if (canonicalSubmission(decoded.manifest) !== canonicalSubmission(receipt.manifest))
            throw fail('receiver-store-invalid', '收件记录与密文清单不符');
        return decoded;
    }
    async recover() {
        this.check();
        const entries = await readdir(this.root);
        if (entries.length > (this.options.maxItems ?? 512) * 2)
            throw fail('receiver-capacity', '收件目录条目已达到上限');
        for (const name of entries) {
            const dir = await this.directory(name);
            if (!name.startsWith('.stage-')) {
                const receipt = await this.readReceipt(dir);
                if (keyOf(receipt.context) !== name)
                    throw fail('receiver-store-invalid', '收件记录路径不匹配');
                continue;
            }
            // A crash after both fsyncs but before rename is recoverable. Partial
            // stages remain unacknowledged and counted against disk capacity.
            try {
                const receipt = await this.readReceipt(dir);
                await this.verified(dir, receipt);
                const target = path.join(this.root, keyOf(receipt.context));
                try {
                    await lstat(target);
                }
                catch (cause) {
                    if (cause.code !== 'ENOENT')
                        throw cause;
                    await rename(dir, target);
                    await syncDirectory(this.root);
                }
            }
            catch { /* Incomplete or invalid stages never become received facts. */ }
        }
        this.check();
    }
    async capacity(extra) {
        const entries = await readdir(this.root);
        let bytes = extra;
        if (entries.length >= (this.options.maxItems ?? 512))
            throw fail('receiver-capacity', '本地收件数量已达上限，云端尚未确认交付');
        for (const name of entries) {
            const dir = await this.directory(name);
            for (const child of await readdir(dir)) {
                if (!/^(?:payload\.box|receipt\.json(?:\.[a-f0-9]{24}\.tmp)?)$/.test(child))
                    throw fail('receiver-store-invalid', '收件目录存在未知文件');
                const stat = await lstat(path.join(dir, child));
                if (!stat.isFile() || stat.isSymbolicLink())
                    throw fail('receiver-path-invalid', '收件文件不可重定向');
                bytes += stat.size;
            }
        }
        if (bytes > (this.options.maxBytes ?? 1024 * 1024 * 1024))
            throw fail('receiver-capacity', '本地收件空间预算不足，未确认云端交付');
    }
    receive(origin, taskRef, bindingKey, raw, signal) {
        return this.serial(async () => {
            const active = AbortSignal.any([signal, this.lifetime.signal]);
            this.check(active);
            assertScope(origin, this.options.nodeId);
            if (!row(raw) || !identifier(raw.claimId) || !Number.isSafeInteger(raw.leaseExpiresAt) || Number(raw.leaseExpiresAt) <= (this.options.now ?? Date.now)())
                throw fail('receiver-claim-invalid', '收件租约无效或已过期');
            const context = submissionContext(raw.context), envelope = submissionEnvelope(raw.envelope), values = submissionAnswers(raw.values);
            if (!sameTaskRef(context.taskRef, taskRef) || context.bindingKey !== bindingKey || raw.submissionId !== context.submissionId || raw.version !== context.version)
                throw fail('receiver-claim-invalid', '提交不属于指定任务或接收绑定');
            const delivery = { ...raw, context, envelope, values };
            const name = keyOf(context), destination = path.join(this.root, name);
            let receipt;
            try {
                receipt = await this.readReceipt(await this.directory(name));
            }
            catch (cause) {
                if (cause.code !== 'ENOENT')
                    throw cause;
            }
            if (receipt) {
                if (!sameScope(receipt.origin, origin) || canonicalSubmission(receipt.envelope) !== canonicalSubmission(envelope)
                    || canonicalSubmission(receipt.manifest.answers) !== canonicalSubmission(values))
                    throw fail('receiver-conflict', '已接收版本不能被替换');
                await this.verified(destination, receipt);
            }
            else {
                await this.capacity(envelope.cipherBytes + 64 * 1024);
                const cipher = await this.options.download(delivery.download, envelope.cipherBytes, active);
                this.check(active);
                const decoded = decryptSubmission(cipher, envelope, this.options.keys.secret(context.keyId, bindingKey), context, values);
                await this.options.validateImage(decoded.image, decoded.manifest.file.mediaType);
                this.check(active);
                const stageName = `.stage-${name}-${randomBytes(12).toString('hex')}`, stage = path.join(this.root, stageName);
                await mkdir(stage, { mode: 0o700 });
                await this.directory(stageName);
                await writeNew(path.join(stage, 'payload.box'), cipher);
                receipt = { schema: 'human.receiver.receipt.v1', nodeId: this.options.nodeId, origin: copy(origin), context, envelope,
                    manifest: decoded.manifest, receivedAt: (this.options.now ?? Date.now)(), acked: false };
                await writeNew(path.join(stage, 'receipt.json'), JSON.stringify(receipt));
                await syncDirectory(stage);
                this.check(active);
                await rename(stage, destination);
                await syncDirectory(this.root);
            }
            this.check(active);
            // The disk receipt is authoritative before this network operation. A
            // lost response repeats only ACK, never download, model run, or publish.
            const answer = await this.options.ack(origin, taskRef, delivery, active);
            this.check(active);
            if (!row(answer) || !row(answer.delivery) || answer.delivery.state !== 'received' || answer.delivery.submissionId !== context.submissionId
                || answer.delivery.version !== context.version || answer.delivery.manifestDigest !== envelope.manifestDigest
                || answer.delivery.cipherDigest !== envelope.cipherDigest)
                throw fail('receiver-ack-invalid', '云端尚未确认持久收件回执');
            const temporary = path.join(destination, `receipt.json.${randomBytes(12).toString('hex')}.tmp`);
            await writeNew(temporary, JSON.stringify({ ...receipt, acked: true }));
            await rename(temporary, path.join(destination, 'receipt.json'));
            await syncDirectory(destination);
            this.check(active);
            return { submissionId: context.submissionId, version: context.version, state: 'received', artifactRef: name };
        });
    }
    read(origin, submissionId, bindingKey, signal) {
        return this.serial(async () => {
            this.check(signal);
            assertScope(origin, this.options.nodeId);
            if (!identifier(submissionId) || !/^[a-f0-9]{64}$/.test(bindingKey))
                throw fail('receiver-reference-invalid', '收件引用无效');
            for (const name of await readdir(this.root)) {
                if (!/^[a-f0-9]{64}$/.test(name))
                    continue;
                const dir = await this.directory(name), receipt = await this.readReceipt(dir);
                if (receipt.context.submissionId !== submissionId || receipt.context.bindingKey !== bindingKey || !sameScope(receipt.origin, origin))
                    continue;
                const result = await this.verified(dir, receipt);
                this.check(signal);
                return { ...result, artifactRef: name, receivedAt: receipt.receivedAt };
            }
            throw fail('submission-not-received', '此会话的提交尚未可靠接收到本机');
        });
    }
    close() { this.lifetime.abort(); return this.tail.then(() => { }); }
}
