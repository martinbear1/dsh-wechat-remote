import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { verifyNativeRestore } from '../installer/bin/native-recovery.mjs'
for (const previousVersion of ['0.0.0', '1.7.9']) {
  test(`historical rollback ${previousVersion} cannot patch, launch or mutate a native host`, async () => {
    const home = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-native-restore-')))
    const profile = path.join(home, 'profiles/web')
    fs.mkdirSync(profile, { recursive: true })
    const original = '# native user file\n[]\n'
    const filename = path.join(profile, 'cordis.patch.yml')
    fs.writeFileSync(filename, original)
    try {
      await assert.rejects(verifyNativeRestore({ home, profile, previousVersion },
        () => assert.fail('must not launch'), []), { code: 'NATIVE_MANUAL_UPDATE_REQUIRED' })
      assert.equal(fs.readFileSync(filename, 'utf8'), original)
      assert.equal(fs.existsSync(path.join(home, 'harness-remote-updates')), false)
    } finally {
      assert.equal(path.dirname(home), fs.realpathSync(os.tmpdir()))
      assert(path.basename(home).startsWith('dsh-native-restore-'))
      fs.rmSync(home, { recursive: true })
    }
  })
}
