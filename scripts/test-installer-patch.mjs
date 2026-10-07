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
    assert.throws(() => attachControl(profile, path.join(directory, 'install-control.js'), { directory, token: 'synthetic' }), { code: 'NATIVE_MANUAL_UPDATE_REQUIRED' })
    assert.equal(fs.readFileSync(file, 'utf8'), original)
    if (concurrent) fs.appendFileSync(file, '\n- insert:\n  - id: user-added\n    name: example\n')
    const restored = fs.readFileSync(file, 'utf8')
    if (concurrent) { assert(restored.includes('user-added')); assert(!restored.includes('wechat-installer-')) }
    else assert.equal(restored, original)
    assert(!fs.readdirSync(profile).some(name => name.includes('.wechat-')))
  }
  console.log('PASS retired control cannot patch native profile or undo concurrent user edits')
} finally {
  assert(path.dirname(root) === os.tmpdir() && path.basename(root).startsWith('installer-patch-proof-'))
  fs.rmSync(root, { recursive: true })
}
