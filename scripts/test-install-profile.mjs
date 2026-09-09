import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { assertRelocatableProfile, safeProfileName } from '../lib/install-profile.js'

for (const name of ['web', 'test-2', 'custom_profile']) assert(safeProfileName(name))
for (const name of ['', '..', 'a/b', 'a\\b', 'web & run', 'a'.repeat(81)]) assert(!safeProfileName(name))
const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-profile-safety-test-')))
try {
  const profile = path.join(root, 'profile'), packages = path.join(profile, 'packages')
  fs.mkdirSync(packages, { recursive: true })
  fs.writeFileSync(path.join(packages, 'fixture.txt'), 'fixture')
  assertRelocatableProfile(profile)
  const outside = path.join(root, 'outside'); fs.mkdirSync(outside)
  const link = path.join(profile, 'dependency')
  fs.symlinkSync(outside, link, 'junction')
  assert.throws(() => assertRelocatableProfile(profile))
  fs.unlinkSync(link)
  fs.symlinkSync(packages, link, 'junction')
  assert.throws(() => assertRelocatableProfile(profile), 'absolute internal links break on relocation')
  fs.unlinkSync(link)
  if (process.platform !== 'win32') {
    fs.symlinkSync('packages', link)
    assertRelocatableProfile(profile)
  }
  console.log('PASS profile names, ordinary layout, external and non-portable internal link guards')
} finally {
  assert(path.dirname(root) === fs.realpathSync(os.tmpdir()) && path.basename(root).startsWith('dsh-profile-safety-test-'))
  fs.rmSync(root, { recursive: true })
}
