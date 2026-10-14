// Read-only installed-archive inspection; never accesses a user profile.
import fs from 'node:fs'
const archive = process.env.HARNESS_DSH_ASAR
if (!archive) throw Error('HARNESS_DSH_ASAR is required')
const fd = fs.openSync(archive, 'r')
try {
  const header = Buffer.alloc(16); fs.readSync(fd, header, 0, 16, 0)
  const bytes = Buffer.alloc(header.readUInt32LE(12)); fs.readSync(fd, bytes, 0, bytes.length, 16)
  const tree = JSON.parse(bytes), dataStart = 8 + header.readUInt32LE(4)
  for (const relative of process.argv.slice(2)) {
    let entry = tree
    for (const part of relative.split('/')) entry = entry.files[part]
    if (entry.files || entry.link) throw Error('Expected regular archive file')
    const buffer = Buffer.alloc(entry.size)
    if (entry.unpacked) throw Error('Inspection only supports packed source')
    fs.readSync(fd, buffer, 0, buffer.length, dataStart + Number(entry.offset))
    console.log(JSON.stringify({ path: relative, bytes: entry.size }))
    console.log(buffer.toString('utf8'))
  }
} finally { fs.closeSync(fd) }
