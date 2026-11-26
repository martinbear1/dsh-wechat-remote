import { open } from 'node:fs/promises'
import { deflateRawSync } from 'node:zlib'
import { crc32 } from '../lib/history-import/zip-reader.js'

export const message = (id, parent_id, role, fragments, status = 'FINISHED') => ({ id, parent_id, role, status, fragments, inserted_at: '2026-11-20T00:00:00Z' })
export const conversation = () => ({ id: 'synthetic-v3', title: '合成 v3 会话', current_message_id: 2, inserted_at: '2026-11-20T00:00:00Z', messages: [
  message(1, null, 'USER', [{ type: 'REQUEST', content: '记住合成事实七号。' }]),
  message(2, 1, 'ASSISTANT', [{ type: 'THINK', content: '公开思考七号' }, { type: 'RESPONSE', content: '已记录七号。' }]),
  message(3, 1, 'ASSISTANT', [{ type: 'RESPONSE', content: '另一分支。' }]),
] })
export function entries(value = conversation()) {
  return [['manifest.json', JSON.stringify({ export_format_version: 3 })],
    ['chat_session_index.json', JSON.stringify([{ id: value.id, title: value.title, inserted_at: value.inserted_at, updated_at: value.inserted_at, message_count: value.messages.length }])],
    [`chat_sessions/${value.id}.json`, JSON.stringify(value)]]
}
export function zip(values, { compress = true } = {}) {
  const locals = [], centrals = []; let offset = 0
  for (const [name, value] of values) {
    const bytes = Buffer.from(value), packed = compress ? deflateRawSync(bytes) : bytes
    const [local, central] = headers(name, bytes.length, packed.length, crc32(bytes), offset, compress ? 8 : 0)
    locals.push(local, packed); centrals.push(central); offset += local.length + packed.length
  }
  return Buffer.concat([...locals, ...centrals, end(centrals.length, centrals.reduce((n, c) => n + c.length, 0), offset)])
}
function headers(name, expanded, packed, crc, offset, method = 0) {
  const filename = Buffer.from(name), local = Buffer.alloc(30 + filename.length), central = Buffer.alloc(46 + filename.length)
  local.writeUInt32LE(0x04034b50); local.writeUInt16LE(20, 4); local.writeUInt16LE(0x800, 6); local.writeUInt16LE(method, 8)
  local.writeUInt32LE(crc, 14); local.writeUInt32LE(packed, 18); local.writeUInt32LE(expanded, 22); local.writeUInt16LE(filename.length, 26); filename.copy(local, 30)
  central.writeUInt32LE(0x02014b50); central.writeUInt16LE(20, 4); central.writeUInt16LE(20, 6); central.writeUInt16LE(0x800, 8); central.writeUInt16LE(method, 10)
  central.writeUInt32LE(crc, 16); central.writeUInt32LE(packed, 20); central.writeUInt32LE(expanded, 24); central.writeUInt16LE(filename.length, 28); central.writeUInt32LE(offset, 42); filename.copy(central, 46)
  return [local, central]
}
function end(count, centralBytes, offset) { const data = Buffer.alloc(22); data.writeUInt32LE(0x06054b50); data.writeUInt16LE(count, 8); data.writeUInt16LE(count, 10); data.writeUInt32LE(centralBytes, 12); data.writeUInt32LE(offset, 16); return data }
/** Stored, valid large export fixture written a bounded 4 MiB piece at a time. */
export async function largeZipFile(file, megabytes = 300) {
  const handle = await open(file, 'wx'), centrals = []; let offset = 0
  const write = async data => { for (let at = 0; at < data.length;) { const result = await handle.write(data, at, data.length - at); at += result.bytesWritten } offset += data.length }
  try {
    for (const [name, value] of entries()) { const data = Buffer.from(value); const [local, central] = headers(name, data.length, data.length, crc32(data), offset); centrals.push(central); await write(local); await write(data) }
    const pad = Buffer.alloc(4 * 1024 * 1024, 17), crc = crc32(pad)
    for (let part = 0; part < megabytes / 4; part++) {
      const [local, central] = headers(`chat_sessions/other_files/${part}.bin`, pad.length, pad.length, crc, offset)
      centrals.push(central); await write(local); await write(pad)
    }
    const centralAt = offset
    for (const central of centrals) await write(central)
    await write(end(centrals.length, offset - centralAt, centralAt)); return offset
  } finally { await handle.close() }
}
