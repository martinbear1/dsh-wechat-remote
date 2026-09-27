/** Actual local pack, with no registry, profile install or host restart. */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createHash } from 'node:crypto'
import { stageCompanionArchive } from '../lib/companion-updates.js'
import { auditNativeArchive } from '../lib/update-download.js'

const source = fileURLToPath(new URL('../installer/', import.meta.url))
const version = JSON.parse(fs.readFileSync(path.join(source, 'package.json'))).version
const home = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-companion-pack-')))
try {
  const archive = await stageCompanionArchive(home, source, version)
  assert.equal(path.extname(archive), '.tgz')
  assert(!archive.startsWith(source))
  const bytes = fs.readFileSync(archive)
  assert.equal(path.basename(archive, '.tgz'), createHash('sha256').update(bytes).digest('hex'))
  auditNativeArchive(bytes, version)
  assert(!fs.readdirSync(path.dirname(archive)).some(name => name.startsWith('packing-')))
  console.log('PASS native companion artifact: real immutable tarball, bounded audit, no profile-directory links')
} finally {
  assert.equal(path.dirname(home), fs.realpathSync(os.tmpdir()))
  assert(path.basename(home).startsWith('dsh-companion-pack-'))
  fs.rmSync(home, { recursive: true, force: true })
}
