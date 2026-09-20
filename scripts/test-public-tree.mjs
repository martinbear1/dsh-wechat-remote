import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

const checker = fileURLToPath(new URL('./check-public-tree.mjs', import.meta.url))

function check(t, files) {
  const root = mkdtempSync(path.join(os.tmpdir(), 'public-tree-test-'))
  t.after(() => {
    assert.equal(path.dirname(root), path.resolve(os.tmpdir()))
    assert(path.basename(root).startsWith('public-tree-test-'))
    rmSync(root, { recursive: true, force: true })
  })
  execFileSync('git', ['init', '--quiet', root], { windowsHide: true })
  for (const [name, content] of Object.entries(files)) {
    const target = path.join(root, name)
    mkdirSync(path.dirname(target), { recursive: true })
    writeFileSync(target, content)
  }
  execFileSync('git', ['add', '--all'], { cwd: root, windowsHide: true, stdio: 'pipe' })
  const result = spawnSync(process.execPath, [checker], { cwd: root, encoding: 'utf8', windowsHide: true })
  assert.ifError(result.error)
  return result
}

test('user documentation and template paths are accepted', t => {
  assert.equal(check(t, {
    'README.md': 'Install the latest release. C:/Users/<name>/project',
    'docs/NATIVE-INSTALL.md': 'Restart the host after installation.',
    'installer/README.md': 'npx dsh-wechat-remote@latest',
  }).status, 0)
})

test('unreviewed and internal documentation is rejected', t => {
  assert.equal(check(t, { 'docs/NEW-NOTES.md': 'internal working notes' }).status, 1)
})

for (const filename of ['README.md', 'RELEASE-NOTES.md', 'installer/README.md', 'installer/RELEASE-NOTES.md']) {
  test(`personal paths are rejected in ${filename} without echoing their content`, t => {
    const fixture = ['C:', 'Users', 'example-person', 'private-project'].join('/')
    const result = check(t, { [filename]: fixture })
    assert.equal(result.status, 1)
    assert.match(result.stderr, /personal Windows path/)
    assert(!result.stderr.includes(fixture))
  })
}

test('personal mailboxes and specific LAN addresses are rejected', t => {
  const result = check(t, { 'SECURITY.md': ['example-person', '@qq.com'].join('') + '\n' + [192, 168, 42, 19].join('.') })
  assert.equal(result.status, 1)
  assert.match(result.stderr, /personal mailbox/)
  assert.match(result.stderr, /private IPv4/)
})

test('test fixtures remain separate from public documentation policy', t => {
  assert.equal(check(t, { 'scripts/fixture.mjs': ['C:', 'Users', 'example-person', 'fixture'].join('/') }).status, 0)
})
