import { open } from 'node:fs/promises';
import { inflateRaw } from 'node:zlib';
import { createHash } from 'node:crypto';
import { MAX_ARCHIVE_BYTES } from './limits.js';
const bad = () => { throw Object.assign(new Error('invalid-zip'), { code: 'invalid-zip' }); };
const crcTable = Uint32Array.from({ length: 256 }, (_, value) => {
    for (let bit = 0; bit < 8; bit++)
        value = value & 1 ? 0xedb88320 ^ value >>> 1 : value >>> 1;
    return value >>> 0;
});
export function crc32(bytes) {
    let value = 0xffffffff;
    for (const byte of bytes)
        value = crcTable[(value ^ byte) & 255] ^ value >>> 8;
    return (value ^ 0xffffffff) >>> 0;
}
function decode(bytes) { try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
}
catch {
    return bad();
} }
/** Random access on a plugin-owned staging file. No archive path is extracted.
 * Every declared range is validated before reading selected entries. Inflate
 * runs only in the bounded parser worker, with an enforced output ceiling. */
export async function openZipFile(file) {
    let handle;
    if (typeof file === 'string')
        handle = await open(file, 'r');
    const length = handle ? (await handle.stat()).size : file.length;
    const read = async (offset, count) => {
        if (offset < 0 || count < 0 || offset + count > length)
            return bad();
        if (!handle)
            return file.subarray(offset, offset + count);
        const output = Buffer.alloc(count);
        for (let done = 0; done < count;) {
            const result = await handle.read(output, done, count - done, offset + done);
            if (!result.bytesRead)
                return bad();
            done += result.bytesRead;
        }
        return output;
    };
    try {
        if (length < 22 || length > MAX_ARCHIVE_BYTES)
            return bad();
        const tailOffset = Math.max(0, length - 65557), tail = await read(tailOffset, length - tailOffset);
        let end = -1;
        for (let at = tail.length - 22; at >= 0; at--)
            if (tail.readUInt32LE(at) === 0x06054b50 && at + 22 + tail.readUInt16LE(at + 20) === tail.length) {
                end = at;
                break;
            }
        if (end < 0 || tail.readUInt16LE(end + 4) || tail.readUInt16LE(end + 6))
            return bad();
        const count = tail.readUInt16LE(end + 10), centralBytes = tail.readUInt32LE(end + 12), centralOffset = tail.readUInt32LE(end + 16);
        if (!count || count > 50000 || count !== tail.readUInt16LE(end + 8) || centralBytes > 16 * 1024 * 1024
            || centralOffset + centralBytes !== tailOffset + end)
            return bad();
        const central = await read(centralOffset, centralBytes), entries = new Map(), ranges = [];
        let cursor = 0, expandedTotal = 0;
        for (let index = 0; index < count; index++) {
            if (cursor + 46 > central.length || central.readUInt32LE(cursor) !== 0x02014b50)
                return bad();
            const flags = central.readUInt16LE(cursor + 8), method = central.readUInt16LE(cursor + 10), crc = central.readUInt32LE(cursor + 16);
            const bytes = central.readUInt32LE(cursor + 20), expanded = central.readUInt32LE(cursor + 24);
            const nameBytes = central.readUInt16LE(cursor + 28), extra = central.readUInt16LE(cursor + 30), comment = central.readUInt16LE(cursor + 32);
            const localOffset = central.readUInt32LE(cursor + 42), next = cursor + 46 + nameBytes + extra + comment;
            if (next > central.length || flags & ~0x808 || ![0, 8].includes(method) || central.readUInt16LE(cursor + 34)
                || [bytes, expanded, localOffset].includes(0xffffffff) || (central.readUInt32LE(cursor + 38) >>> 16 & 0xf000) === 0xa000)
                return bad();
            const name = decode(central.subarray(cursor + 46, cursor + 46 + nameBytes));
            if (!name || name.length > 1024 || /[\\\x00:]/.test(name) || name.startsWith('/') || name.split('/').some(part => part === '.' || part === '..') || entries.has(name))
                return bad();
            expandedTotal += expanded;
            if (expandedTotal > 2 * 1024 * 1024 * 1024 || localOffset + 30 > centralOffset || method === 0 && bytes !== expanded)
                return bad();
            const local = await read(localOffset, 30);
            if (local.readUInt32LE(0) !== 0x04034b50 || local.readUInt16LE(6) !== flags || local.readUInt16LE(8) !== method || local.readUInt16LE(26) !== nameBytes)
                return bad();
            const start = localOffset + 30 + nameBytes + local.readUInt16LE(28);
            if (start + bytes > centralOffset || decode(await read(localOffset + 30, nameBytes)) !== name)
                return bad();
            if (!(flags & 8) && (local.readUInt32LE(14) !== crc || local.readUInt32LE(18) !== bytes || local.readUInt32LE(22) !== expanded))
                return bad();
            let finish = start + bytes;
            if (flags & 8) {
                const descriptor = await read(finish, Math.min(16, centralOffset - finish)), position = descriptor.length >= 4 && descriptor.readUInt32LE(0) === 0x08074b50 ? 4 : 0;
                if (descriptor.length < position + 12 || descriptor.readUInt32LE(position) !== crc || descriptor.readUInt32LE(position + 4) !== bytes || descriptor.readUInt32LE(position + 8) !== expanded)
                    return bad();
                finish += position + 12;
            }
            ranges.push([localOffset, finish]);
            entries.set(name, { name, start, bytes, expanded, method, crc });
            cursor = next;
        }
        if (cursor !== central.length)
            return bad();
        ranges.sort((left, right) => left[0] - right[0]);
        if (ranges.some((range, index) => index && range[0] < ranges[index - 1][1]))
            return bad();
        return { entries,
            async read(name, maximum) {
                const entry = entries.get(name);
                if (!entry || entry.expanded > maximum || entry.bytes > maximum)
                    return bad();
                const compressed = await read(entry.start, entry.bytes);
                let output;
                try {
                    output = entry.method === 0 ? compressed : await new Promise((resolve, reject) => inflateRaw(compressed, { maxOutputLength: Math.max(1, Math.min(maximum, entry.expanded + 1)) }, (error, value) => error ? reject(error) : resolve(value)));
                }
                catch {
                    return bad();
                }
                if (output.length !== entry.expanded || crc32(output) !== entry.crc)
                    return bad();
                return output;
            },
            async hash() { const hash = createHash('sha256'); for (let offset = 0; offset < length; offset += 1024 * 1024)
                hash.update(await read(offset, Math.min(1024 * 1024, length - offset))); return hash.digest('hex'); },
            async close() { await handle?.close(); }, };
    }
    catch (error) {
        await handle?.close();
        throw error;
    }
}
