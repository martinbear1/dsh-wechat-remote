// In-memory source and synthetic archives only: no real host, profile, network,
// registry package or model is used by the native-update service tests.
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { gzipSync } from 'node:zlib'
import vm from 'node:vm'
import { build } from 'esbuild'

const bundle = await build({
  entryPoints: [fileURLToPath(new URL('../src/native-update-service.ts', import.meta.url))],
  bundle: true, write: false, platform: 'node', format: 'cjs', target: 'node22', packages: 'external',
})
const module = { exports: {} }
vm.runInThisContext(`(function(require,module,exports){${bundle.outputFiles[0].text}\n})`, {
  filename: 'native-update-service.source.cjs',
})(createRequire(import.meta.url), module, module.exports)
export const { NativeUpdateService, supportsNativeUpdates } = module.exports

export const integrity = bytes => ({ bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') })

export function tarArchive(files) {
  const chunks = []
  for (const [entry, content] of files) {
    const data = Buffer.from(content), header = Buffer.alloc(512)
    header.write(entry); header.write(data.length.toString(8).padStart(11, '0') + '\0', 124); header.write('0', 156)
    header.fill(32, 148, 156); header.write([...header].reduce((sum, byte) => sum + byte, 0).toString(8).padStart(6, '0') + '\0 ', 148)
    chunks.push(header, data, Buffer.alloc((512 - data.length % 512) % 512))
  }
  return gzipSync(Buffer.concat([...chunks, Buffer.alloc(1024)]))
}

export function coreArchive(version, name = '@harness-remote/dsh-wechat-remote') {
  return tarArchive([
    ['package/package.json', JSON.stringify({ name, version, dsh: { bundle: { patch: './cordis.patch.yml' } } })],
    ['package/lib/index.js', ''], ['package/lib/client.js', ''], ['package/cordis.patch.yml', '[]'],
  ])
}

export function nativeReleaseFixture(version = '1.8.0', options = {}) {
  const core = options.core ?? coreArchive(version)
  const asset = { url: `https://github.com/martinbear1/dsh-wechat-remote/releases/download/v${version}/plugin.tgz`, ...integrity(core) }
  const manifest = { name: 'dsh-wechat-remote', version, dsh: { bundle: { patch: './cordis.patch.yml' } }, ...options.manifest }
  const metadata = options.metadata ?? { version, catalog: { releases: [{ version, asset }] } }
  const files = [
    ['package/package.json', JSON.stringify(manifest)],
    ['package/native/lib/index.js', ''], ['package/native/lib/client.js', ''], ['package/cordis.patch.yml', '[]'],
    ['package/assets/plugin.tgz', core], ['package/assets/release.json', JSON.stringify(metadata)],
  ].filter(([name]) => name !== options.omit)
  const outer = tarArchive(files)
  const release = { version, asset, npmInstaller: { version,
    url: `https://registry.npmjs.org/dsh-wechat-remote/-/dsh-wechat-remote-${version}.tgz`, ...integrity(outer) } }
  return { core, outer, release }
}

export function mockArtifactFetch(t, artifacts) {
  const downloads = []
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    downloads.push(url)
    assert.equal(options.redirect, 'manual', 'production source trust and redirect validation stays active')
    assert(options.signal instanceof AbortSignal)
    const value = typeof artifacts === 'function' ? artifacts() : artifacts
    if (url === value.release.npmInstaller.url) return new Response(value.outer)
    if (url === value.release.asset.url) return new Response(value.core)
    assert.fail(`Unexpected network request: ${url}`)
  })
  return downloads
}
