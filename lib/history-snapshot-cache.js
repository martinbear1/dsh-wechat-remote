/**
 * Private, bounded index for encrypted OSS history snapshots.
 *
 * The native DSH history remains the source of truth. This file only keeps the
 * content digest and the short-lived encrypted object descriptor so a plugin
 * restart does not force the host to rebuild and upload an unchanged history
 * window. No history JSON, archive bytes, attachment data, or relay token is
 * persisted here.
 */
import { existsSync } from 'node:fs';
import { readPrivateJson, writePrivateJsonAtomic } from './secure-file.js';
import { HISTORY_ARCHIVE_ENTRY } from './history-archive.js';
const CACHE_VERSION = 1;
const MAX_CACHE_ENTRIES = 32;
const MIN_REMAINING_MS = 60_000;
const MAX_FUTURE_MS = 8 * 24 * 60 * 60_000;
const MAX_HISTORY_ARCHIVE_BYTES = 256 * 1024 * 1024;
const MAX_HISTORY_JSON_BYTES = 512 * 1024 * 1024;
const ENCRYPTION_SCHEME = 'xsalsa20-poly1305-chunks-v1';
const ENCRYPTION_CHUNK_BYTES = 256 * 1024;
export class HistorySnapshotCache {
    entries = new Map();
    file;
    now;
    onDiagnostic;
    persistenceEnabled;
    constructor(options = {}) {
        this.file = options.file;
        this.now = options.now || Date.now;
        this.onDiagnostic = options.onDiagnostic;
        this.persistenceEnabled = Boolean(this.file);
        this.restore();
    }
    get(digest) {
        if (!isDigest(digest))
            return undefined;
        const entry = this.entries.get(digest);
        if (!entry)
            return undefined;
        if (entry.expiresAt <= this.now() + MIN_REMAINING_MS) {
            this.entries.delete(digest);
            this.persist();
            return undefined;
        }
        // Refresh insertion order so the bound behaves like a small LRU index.
        this.entries.delete(digest);
        this.entries.set(digest, entry);
        return entry.descriptor;
    }
    set(digest, rawDescriptor) {
        if (!isDigest(digest))
            throw new Error('History snapshot digest is invalid');
        const descriptor = validateHistorySnapshotDescriptor(rawDescriptor, this.now());
        this.entries.delete(digest);
        this.entries.set(digest, { digest, descriptor, expiresAt: descriptor.expiresAt });
        this.prune();
        this.persist();
        return descriptor;
    }
    get size() {
        return this.entries.size;
    }
    restore() {
        if (!this.file || !existsSync(this.file))
            return;
        try {
            const stored = readPrivateJson(this.file);
            if (!stored || stored.version !== CACHE_VERSION || !Array.isArray(stored.entries)) {
                throw new Error('unsupported cache schema');
            }
            const now = this.now();
            let rejected = 0;
            for (const raw of stored.entries.slice(-MAX_CACHE_ENTRIES * 2)) {
                try {
                    if (!raw || typeof raw !== 'object' || !isDigest(raw.digest))
                        throw new Error('invalid digest');
                    const descriptor = validateHistorySnapshotDescriptor(raw.descriptor, now);
                    if (raw.expiresAt !== descriptor.expiresAt)
                        throw new Error('expiry mismatch');
                    this.entries.delete(raw.digest);
                    this.entries.set(raw.digest, { digest: raw.digest, descriptor, expiresAt: descriptor.expiresAt });
                }
                catch {
                    rejected += 1;
                }
            }
            this.prune();
            this.onDiagnostic?.('info', `restored ${this.entries.size} encrypted history snapshot descriptor(s)${rejected ? `; ignored ${rejected} invalid` : ''}`);
        }
        catch (error) {
            // A derived acceleration index must never prevent DSH from starting. Do
            // not overwrite a malformed file automatically; keep it as evidence and
            // continue with a clean in-memory cache for this process.
            this.persistenceEnabled = false;
            this.entries.clear();
            this.onDiagnostic?.('warn', `encrypted history snapshot cache disabled: ${messageOf(error)}`);
        }
    }
    prune() {
        const threshold = this.now() + MIN_REMAINING_MS;
        for (const [digest, entry] of this.entries) {
            if (entry.expiresAt <= threshold)
                this.entries.delete(digest);
        }
        while (this.entries.size > MAX_CACHE_ENTRIES) {
            const oldest = this.entries.keys().next().value;
            if (!oldest)
                break;
            this.entries.delete(oldest);
        }
    }
    persist() {
        if (!this.file || !this.persistenceEnabled)
            return;
        try {
            writePrivateJsonAtomic(this.file, {
                version: CACHE_VERSION,
                entries: [...this.entries.values()],
            });
        }
        catch (error) {
            // Repeated disk/ACL failures should not spam logs or affect the native
            // history path. The in-memory cache remains usable until process exit.
            this.persistenceEnabled = false;
            this.onDiagnostic?.('warn', `encrypted history snapshot cache persistence disabled: ${messageOf(error)}`);
        }
    }
}
export function validateHistorySnapshotDescriptor(raw, now = Date.now()) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw))
        throw new Error('History snapshot descriptor is invalid');
    const source = raw;
    const expiresAt = integer(source.expiresAt);
    const plainBytes = integer(source.plainBytes);
    const cipherBytes = integer(source.cipherBytes);
    const originalBytes = integer(source.originalBytes);
    if (source.v !== 1 || source.scheme !== ENCRYPTION_SCHEME ||
        typeof source.objectId !== 'string' || !/^[A-Za-z0-9_-]{20,64}$/.test(source.objectId) ||
        source.contentKind !== 'history-json' || source.contentEncoding !== 'zip' ||
        source.archiveEntry !== HISTORY_ARCHIVE_ENTRY || source.chunkBytes !== ENCRYPTION_CHUNK_BYTES ||
        plainBytes < 1 || plainBytes > MAX_HISTORY_ARCHIVE_BYTES ||
        cipherBytes < plainBytes + 20 || cipherBytes > MAX_HISTORY_ARCHIVE_BYTES + 64 * 1024 ||
        originalBytes < 1 || originalBytes > MAX_HISTORY_JSON_BYTES ||
        expiresAt <= now + MIN_REMAINING_MS || expiresAt > now + MAX_FUTURE_MS) {
        throw new Error('History snapshot descriptor is invalid');
    }
    validateBase64Url(source.key, 32, 'History snapshot key');
    validateBase64Url(source.noncePrefix, 16, 'History snapshot nonce');
    return {
        v: 1,
        scheme: ENCRYPTION_SCHEME,
        objectId: source.objectId,
        key: String(source.key),
        noncePrefix: String(source.noncePrefix),
        plainBytes,
        cipherBytes,
        chunkBytes: ENCRYPTION_CHUNK_BYTES,
        contentKind: 'history-json',
        contentEncoding: 'zip',
        archiveEntry: HISTORY_ARCHIVE_ENTRY,
        originalBytes,
        expiresAt,
    };
}
function isDigest(value) {
    return typeof value === 'string' && /^[A-Za-z0-9_-]{43}$/.test(value);
}
function integer(value) {
    return Number.isSafeInteger(value) ? Number(value) : -1;
}
function validateBase64Url(value, bytes, name) {
    if (typeof value !== 'string' || !/^[A-Za-z0-9_-]+$/.test(value) || Buffer.from(value, 'base64url').length !== bytes) {
        throw new Error(`${name} is invalid`);
    }
}
function messageOf(error) {
    return error instanceof Error ? error.message : String(error);
}
export default HistorySnapshotCache;
