import { randomBytes } from 'node:crypto';
import nacl from 'tweetnacl';
import { lstat, mkdir, realpath } from 'node:fs/promises';
import path from 'node:path';
import { tightenPrivateFile } from '../secure-file.js';
import { WorkflowFileStore } from './persistence.js';
import { copy, exact, fail, identifier, row, StateQueue } from './data.js';
import { base64Bytes } from './submission-crypto.js';
export class ReceiverKeyFileStore {
    filename;
    store;
    constructor(filename) {
        this.filename = filename;
        if (!path.isAbsolute(filename))
            throw fail('receiver-key-invalid', '接收密钥路径无效');
        this.store = new WorkflowFileStore(filename, 64 * 1024);
    }
    async guard() {
        const parent = path.dirname(this.filename);
        await mkdir(parent, { recursive: true, mode: 0o700 });
        if ((await lstat(parent)).isSymbolicLink() || await realpath(parent) !== path.resolve(parent))
            throw fail('receiver-key-invalid', '接收密钥目录不可重定向');
        try {
            const stat = await lstat(this.filename);
            if (!stat.isFile() || stat.isSymbolicLink())
                throw fail('receiver-key-invalid', '接收密钥文件不可重定向');
        }
        catch (cause) {
            if (cause.code !== 'ENOENT')
                throw cause;
        }
    }
    async load() { await this.guard(); const value = await this.store.load(); if (value !== undefined)
        tightenPrivateFile(this.filename); return value; }
    async save(value) { await this.guard(); await this.store.save(value); tightenPrivateFile(this.filename); }
}
/** Store inside the real profile, outside the package. Upgrade/uninstall must
 * preserve this file and received objects; no silent reset on corrupt keys. */
export class ReceiverKeyring {
    state;
    nodeId;
    constructor(state, nodeId) {
        this.state = state;
        this.nodeId = nodeId;
    }
    static async open(store, nodeId) {
        if (!identifier(nodeId))
            throw fail('receiver-key-invalid', '接收节点无效');
        const raw = await store.load();
        let ledger = { schema: 'human.receiver.keys.v1', nodeId, keys: [] };
        if (raw !== undefined) {
            if (!row(raw) || !exact(raw, ['schema', 'nodeId', 'keys']) || raw.schema !== ledger.schema || raw.nodeId !== nodeId
                || !Array.isArray(raw.keys) || raw.keys.length > 32)
                throw fail('receiver-key-invalid', '接收密钥账本无效；未生成替代密钥');
            const ids = new Set();
            for (const key of raw.keys) {
                if (!row(key) || !exact(key, ['schema', 'keyId', 'algorithm', 'publicKey', 'secretKey', 'bindingKey']) || key.schema !== 'human.receiver.key.v1'
                    || !identifier(key.keyId) || ids.has(key.keyId) || key.algorithm !== 'nacl-box-v1' || typeof key.bindingKey !== 'string' || !/^[a-f0-9]{64}$/.test(key.bindingKey))
                    throw fail('receiver-key-invalid', '接收密钥账本无效');
                const pair = nacl.box.keyPair.fromSecretKey(base64Bytes(key.secretKey, 32));
                if (!nacl.verify(pair.publicKey, base64Bytes(key.publicKey, 32)))
                    throw fail('receiver-key-invalid', '接收密钥不匹配');
                ids.add(key.keyId);
            }
            ledger = copy(raw);
        }
        return new ReceiverKeyring(new StateQueue(store, ledger), nodeId);
    }
    ensure(bindingKey, signal) {
        if (!/^[a-f0-9]{64}$/.test(bindingKey))
            throw fail('receiver-binding-invalid', '接收绑定无效');
        signal.throwIfAborted();
        const prior = this.state.current().keys.slice().reverse().find(item => item.bindingKey === bindingKey);
        if (prior)
            return Promise.resolve({ schema: prior.schema, keyId: prior.keyId, algorithm: prior.algorithm, publicKey: prior.publicKey });
        return this.state.update(ledger => {
            let key = ledger.keys.slice().reverse().find(item => item.bindingKey === bindingKey);
            if (!key) {
                if (ledger.keys.length >= 32)
                    throw fail('receiver-key-capacity', '接收密钥容量已满，请保留旧密钥并检查节点迁移');
                const pair = nacl.box.keyPair.fromSecretKey(new Uint8Array(randomBytes(32)));
                key = { schema: 'human.receiver.key.v1', keyId: randomBytes(16).toString('hex'), algorithm: 'nacl-box-v1',
                    publicKey: Buffer.from(pair.publicKey).toString('base64'), secretKey: Buffer.from(pair.secretKey).toString('base64'), bindingKey };
                ledger.keys.push(key);
            }
            return { schema: key.schema, keyId: key.keyId, algorithm: key.algorithm, publicKey: key.publicKey };
        }, signal);
    }
    secret(keyId, bindingKey) {
        const key = this.state.current().keys.find(item => item.keyId === keyId && item.bindingKey === bindingKey);
        if (!key)
            throw fail('receiver-key-unavailable', '此提交的离线接收密钥不可用；请勿删除原密钥');
        return base64Bytes(key.secretKey, 32);
    }
    close() { return this.state.close(); }
}
