/**
 * Deterministic single-entry ZIP used for encrypted history snapshots.
 *
 * The Agent compresses JSON before object encryption; the mini program then
 * uses WeChat's native FileSystemManager.unzip implementation. This keeps the
 * package small and avoids doing inflate work on the mini-program JS thread.
 */
import { deflateRawSync } from 'node:zlib';
const FILE_NAME = Buffer.from('history.json', 'utf8');
const UTF8_FLAG = 0x0800;
const DEFLATE = 8;
let crcTable;
function table() {
    if (crcTable)
        return crcTable;
    const values = new Uint32Array(256);
    for (let index = 0; index < values.length; index += 1) {
        let value = index;
        for (let bit = 0; bit < 8; bit += 1) {
            value = (value & 1) !== 0 ? (0xedb88320 ^ (value >>> 1)) : (value >>> 1);
        }
        values[index] = value >>> 0;
    }
    crcTable = values;
    return values;
}
function crc32(data) {
    const values = table();
    let value = 0xffffffff;
    for (const byte of data)
        value = values[(value ^ byte) & 255] ^ (value >>> 8);
    return (value ^ 0xffffffff) >>> 0;
}
function localHeader(crc, compressedBytes, clearBytes) {
    const header = Buffer.alloc(30);
    header.writeUInt32LE(0x04034b50, 0);
    header.writeUInt16LE(20, 4);
    header.writeUInt16LE(UTF8_FLAG, 6);
    header.writeUInt16LE(DEFLATE, 8);
    header.writeUInt32LE(crc, 14);
    header.writeUInt32LE(compressedBytes, 18);
    header.writeUInt32LE(clearBytes, 22);
    header.writeUInt16LE(FILE_NAME.length, 26);
    return header;
}
function centralHeader(crc, compressedBytes, clearBytes) {
    const header = Buffer.alloc(46);
    header.writeUInt32LE(0x02014b50, 0);
    header.writeUInt16LE(20, 4);
    header.writeUInt16LE(20, 6);
    header.writeUInt16LE(UTF8_FLAG, 8);
    header.writeUInt16LE(DEFLATE, 10);
    header.writeUInt32LE(crc, 16);
    header.writeUInt32LE(compressedBytes, 20);
    header.writeUInt32LE(clearBytes, 24);
    header.writeUInt16LE(FILE_NAME.length, 28);
    return header;
}
function endRecord(centralBytes, centralOffset) {
    const record = Buffer.alloc(22);
    record.writeUInt32LE(0x06054b50, 0);
    record.writeUInt16LE(1, 8);
    record.writeUInt16LE(1, 10);
    record.writeUInt32LE(centralBytes, 12);
    record.writeUInt32LE(centralOffset, 16);
    return record;
}
export function archiveHistoryJson(payloadJson) {
    const clear = Buffer.from(payloadJson, 'utf8');
    if (!clear.length)
        throw new Error('History snapshot is empty');
    const compressed = deflateRawSync(clear, { level: 6 });
    const crc = crc32(clear);
    const local = Buffer.concat([
        localHeader(crc, compressed.length, clear.length),
        FILE_NAME,
        compressed,
    ]);
    const central = Buffer.concat([
        centralHeader(crc, compressed.length, clear.length),
        FILE_NAME,
    ]);
    return new Uint8Array(Buffer.concat([local, central, endRecord(central.length, local.length)]));
}
export const HISTORY_ARCHIVE_ENTRY = 'history.json';
