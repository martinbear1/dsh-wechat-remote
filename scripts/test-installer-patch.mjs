import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import assert from 'node:assert/strict'
import { attachControl } from '../installer/bin/native-control.mjs'
import { verifyNativeRestore } from '../installer/lib/native-recovery.js'
assert.equal(typeof verifyNativeRestore, 'function', 'standalone recovery bundle must load without external dependencies')
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'installer-patch-proof-'))
try {
  for (const concurrent of [false, true]) {
    const profile = path.join(root, String(concurrent)), directory = path.join(profile, 'a'.repeat(32))
    fs.mkdirSync(directory, {recursive:true})
    const file = path.join(profile, 'cordis.patch.yml'), original = '# preserved comment\n- insert: []\n'
    fs.writeFileSync(file, original)
    const remove = attachControl(profile, path.join(directory, 'install-control.js'), { directory, token: 'synthetic' })
    assert(fs.readFileSync(file, 'utf8').includes('file:///'))
    if (concurrent) fs.appendFileSync(file, '\n- insert:\n  - id: user-added\n    name: example\n')
    remove()
    const restored = fs.readFileSync(file, 'utf8')
    if (concurrent) { assert(restored.includes('user-added')); assert(!restored.includes('wechat-installer-')) }
    else assert.equal(restored, original)
    assert(!fs.readdirSync(profile).some(name => name.includes('.wechat-')))
  }
  console.log('PASS atomic native patch, exact restoration and concurrent user edits')
} finally {
  assert(path.dirname(root) === os.tmpdir() && path.basename(root).startsWith('installer-patch-proof-'))
  fs.rmSync(root, { recursive: true })
}
