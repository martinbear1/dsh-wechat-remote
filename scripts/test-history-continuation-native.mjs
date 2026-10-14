/** Installed-DSH lifecycle contract for the history-continuation preset.
 * Reads app code only. All profiles, sessions and product copies are temporary;
 * model and web providers are synthetic and network requests are forbidden.
 * Run after building: HARNESS_DSH_ASAR=<installed app.asar> node this-file.mjs
 * Optional HARNESS_HISTORY_CONTINUATION_PACKAGE=<actual installer .tgz>
 * loads the archive's unchanged dsh-wechat-remote/native layout instead.
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'
import { gunzipSync } from 'node:zlib'

const archive = process.env.HARNESS_DSH_ASAR
const packedProduct = process.env.HARNESS_HISTORY_CONTINUATION_PACKAGE
assert(archive, 'HARNESS_DSH_ASAR must name installed app.asar; native verification cannot silently skip')
const stage = process.env.HARNESS_HISTORY_CONTINUATION_STAGE
const work = stage || fs.mkdtempSync(path.join(os.tmpdir(), 'history-continuation-native-'))
const project = fileURLToPath(new URL('../', import.meta.url))
assert(path.dirname(path.resolve(work)) === path.resolve(os.tmpdir()))
assert(path.basename(work).startsWith('history-continuation-native-'))

if (!stage) {
  const fd = fs.openSync(archive, 'r')
  try {
    const prefix = Buffer.alloc(16)
    fs.readSync(fd, prefix, 0, prefix.length, 0)
    const bytes = Buffer.alloc(prefix.readUInt32LE(12))
    fs.readSync(fd, bytes, 0, bytes.length, 16)
    const tree = JSON.parse(bytes), offset = 8 + prefix.readUInt32LE(4)
    function extract(entry, relative) {
      const target = path.resolve(work, relative)
      assert(target.startsWith(work + path.sep), 'archive extraction must stay in the new fixture directory')
      assert(!entry.link, 'archive links need separate review')
      if (entry.files) {
        for (const [name, child] of Object.entries(entry.files)) extract(child, path.join(relative, name))
        return
      }
      if (!/\.(?:[mc]?js|json|node|dll|wasm|ya?ml)$/.test(relative)) return
      fs.mkdirSync(path.dirname(target), { recursive: true })
      if (entry.unpacked) fs.copyFileSync(path.join(archive + '.unpacked', relative), target)
      else {
        const data = Buffer.alloc(entry.size)
        fs.readSync(fd, data, 0, data.length, offset + Number(entry.offset))
        fs.writeFileSync(target, data)
      }
    }
    extract(tree.files.dsh, 'dsh')
    const product = path.join(work, packedProduct ? 'dsh/node_modules/dsh-wechat-remote' : 'dsh/node_modules/@harness-remote/dsh-wechat-remote')
    fs.mkdirSync(product, { recursive: true })
    if (packedProduct) {
      // Extract actual release bytes without rewriting/bundling product code.
      // npm tar files must remain regular files/directories inside package/.
      const tar = gunzipSync(fs.readFileSync(packedProduct), { maxOutputLength: 256 * 1024 * 1024 })
      const seen = new Set()
      for (let at = 0; at + 512 <= tar.length;) {
        const header = tar.subarray(at, at + 512)
        if (header.every(byte => byte === 0)) break
        const field = (start, size) => header.subarray(start, start + size).toString('utf8').replace(/\0.*$/s, '')
        const name = (field(345, 155) ? field(345, 155) + '/' : '') + field(0, 100)
        const type = field(156, 1), sizeText = field(124, 12).trim()
        assert(/^[0-7]+$/.test(sizeText)); const size = parseInt(sizeText, 8)
        assert(name.startsWith('package/') && !/[\\:\x00-\x1f]/.test(name))
        assert(!name.split('/').some(part => part === '..' || part === '.'))
        assert(['0', '', '5'].includes(type), 'archive links/special entries are not accepted')
        assert(!seen.has(name.toLowerCase()), 'duplicate archive entry'); seen.add(name.toLowerCase())
        assert(at + 512 + Math.ceil(size / 512) * 512 <= tar.length)
        const target = path.resolve(product, name.slice('package/'.length))
        assert(target === product || target.startsWith(product + path.sep))
        fs.mkdirSync(type === '5' ? target : path.dirname(target), { recursive: true })
        if (type !== '5') fs.writeFileSync(target, tar.subarray(at + 512, at + 512 + size))
        at += 512 + Math.ceil(size / 512) * 512
      }
      assert.equal(JSON.parse(fs.readFileSync(path.join(product, 'package.json'))).name, 'dsh-wechat-remote')
    } else {
      fs.copyFileSync(path.join(project, 'package.json'), path.join(product, 'package.json'))
      fs.cpSync(path.join(project, 'lib'), path.join(product, 'lib'), { recursive: true })
      // Bundle only non-native dependency code into the disposable product copy.
      // Native SDK imports and the actual declaration stay external so this test
      // cannot accidentally exercise this repository's older development SDK.
      for (const name of ['history-import/native', 'history-import/service', 'private-resources/native',
        'private-resources/service', 'resource-library-component']) await build({
        entryPoints: [path.join(project, `lib/${name}.js`)],
        outfile: path.join(product, `lib/${name}.js`),
        bundle: true, platform: 'node', format: 'esm', target: 'node22',
        external: ['@deepseek-ai/*', './private-resources/service.js'],
        banner: { js: "import { createRequire as fixtureRequire } from 'node:module'; const require = fixtureRequire(import.meta.url);" },
      })
    }
    process.stdout.write(execFileSync(process.execPath, [fileURLToPath(import.meta.url)], {
      env: { ...process.env, HARNESS_HISTORY_CONTINUATION_STAGE: work }, encoding: 'utf8',
      windowsHide: true, timeout: 60000,
    }))
  } finally {
    fs.closeSync(fd)
    assert(path.dirname(path.resolve(work)) === path.resolve(os.tmpdir()))
    assert(path.basename(work).startsWith('history-continuation-native-'))
    fs.rmSync(work, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 })
  }
} else {
  const { verifyHistoryContinuation } = await import('./history-continuation-native-fixture.mjs')
  await verifyHistoryContinuation(work)
}
