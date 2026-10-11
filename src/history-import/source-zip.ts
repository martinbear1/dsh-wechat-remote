import { inflateRaw } from 'node:zlib'

export const MAX_SOURCE_BYTES = 20 * 1024 * 1024
export const MAX_EXPANDED_BYTES = 64 * 1024 * 1024

function invalid(): never { throw new Error('history-import/invalid-zip') }
const crcTable = Uint32Array.from({ length: 256 }, (_, n) => {
  for (let bit = 0; bit < 8; bit++) n = n & 1 ? 0xedb88320 ^ n >>> 1 : n >>> 1
  return n >>> 0
})
function crc32(bytes: Buffer): number {
  let crc = 0xffffffff
  for (const byte of bytes) crc = crcTable[(crc ^ byte) & 255] ^ crc >>> 8
  return (crc ^ 0xffffffff) >>> 0
}
function decode(bytes: Buffer): string {
  try { return new TextDecoder('utf-8', { fatal: true }).decode(bytes) } catch { return invalid() }
}

/** Read one known export entry in memory. Never extract paths or execute archive contents. */
export async function readExportZip(bytes: Buffer): Promise<Buffer> {
  if (bytes.length > MAX_SOURCE_BYTES || bytes.length < 22) return invalid()
  let end = -1
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--) {
    if (bytes.readUInt32LE(i) === 0x06054b50 && i + 22 + bytes.readUInt16LE(i + 20) === bytes.length) { end = i; break }
  }
  if (end < 0 || bytes.readUInt16LE(end + 4) || bytes.readUInt16LE(end + 6)) return invalid()
  const count = bytes.readUInt16LE(end + 10), centralSize = bytes.readUInt32LE(end + 12), central = bytes.readUInt32LE(end + 16)
  if (!count || count > 1024 || count !== bytes.readUInt16LE(end + 8) || central + centralSize !== end) return invalid()
  const names = new Set<string>(), ranges: [number, number][] = []
  let cursor = central, expanded = 0
  let selected: { start: number; size: number; expanded: number; method: number; crc: number } | undefined
  for (let i = 0; i < count; i++) {
    if (cursor + 46 > end || bytes.readUInt32LE(cursor) !== 0x02014b50) return invalid()
    const flags = bytes.readUInt16LE(cursor + 8), method = bytes.readUInt16LE(cursor + 10), crc = bytes.readUInt32LE(cursor + 16)
    const size = bytes.readUInt32LE(cursor + 20), full = bytes.readUInt32LE(cursor + 24)
    const nameSize = bytes.readUInt16LE(cursor + 28), extra = bytes.readUInt16LE(cursor + 30), comment = bytes.readUInt16LE(cursor + 32)
    const local = bytes.readUInt32LE(cursor + 42), next = cursor + 46 + nameSize + extra + comment
    if (next > end || flags & ~0x808 || ![0, 8].includes(method) || bytes.readUInt16LE(cursor + 34) || [size, full, local].includes(0xffffffff)) return invalid()
    const name = decode(bytes.subarray(cursor + 46, cursor + 46 + nameSize))
    if (!name || /[\\\x00:]/.test(name) || name.startsWith('/') || name.split('/').some(part => part === '.' || part === '..') || names.has(name)) return invalid()
    if ((bytes.readUInt32LE(cursor + 38) >>> 16 & 0xf000) === 0xa000) return invalid()
    names.add(name); expanded += full
    if (expanded > MAX_EXPANDED_BYTES || local + 30 > central || bytes.readUInt32LE(local) !== 0x04034b50) return invalid()
    const localNameSize = bytes.readUInt16LE(local + 26), localExtra = bytes.readUInt16LE(local + 28)
    const start = local + 30 + localNameSize + localExtra
    if (start + size > central || localNameSize !== nameSize || bytes.readUInt16LE(local + 6) !== flags || bytes.readUInt16LE(local + 8) !== method) return invalid()
    if (decode(bytes.subarray(local + 30, local + 30 + localNameSize)) !== name) return invalid()
    if (!(flags & 8) && (bytes.readUInt32LE(local + 14) !== crc || bytes.readUInt32LE(local + 18) !== size || bytes.readUInt32LE(local + 22) !== full)) return invalid()
    if (method === 0 && size !== full) return invalid()
    let localEnd = start + size
    if (flags & 8) {
      if (localEnd + 12 > central) return invalid()
      const descriptor = bytes.readUInt32LE(localEnd) === 0x08074b50 ? localEnd + 4 : localEnd
      if (descriptor + 12 > central || bytes.readUInt32LE(descriptor) !== crc || bytes.readUInt32LE(descriptor + 4) !== size || bytes.readUInt32LE(descriptor + 8) !== full) return invalid()
      localEnd = descriptor + 12
    }
    ranges.push([local, localEnd])
    if (name === 'conversations.json') selected = { start, size, expanded: full, method, crc }
    cursor = next
  }
  if (cursor !== end || !selected) return invalid()
  ranges.sort((a, b) => a[0] - b[0])
  if (ranges.some((range, index) => index > 0 && range[0] < ranges[index - 1][1])) return invalid()
  const entry = selected, compressed = bytes.subarray(entry.start, entry.start + entry.size)
  let result: Buffer
  try {
    result = entry.method === 0 ? Buffer.from(compressed) : await new Promise<Buffer>((resolve, reject) => {
      inflateRaw(compressed, { maxOutputLength: Math.min(MAX_EXPANDED_BYTES, entry.expanded + 1) }, (error, output) => error ? reject(error) : resolve(output))
    })
  } catch { return invalid() }
  if (result.length !== entry.expanded || crc32(result) !== entry.crc) return invalid()
  return result
}
