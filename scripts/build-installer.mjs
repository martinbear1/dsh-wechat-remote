import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'
import { createHash } from 'node:crypto'
const root = fileURLToPath(new URL('../', import.meta.url))
const target = path.join(root, 'installer', 'lib')
fs.mkdirSync(target, { recursive: true })
for (const name of ['install-control', 'update-worker', 'install-profile', 'install-runtime', 'update-download', 'update-policy', 'secure-file']) {
  await build({ entryPoints: [path.join(root, 'src', name + '.ts')], bundle: true,
    platform: 'node', target: 'node22', format: 'esm', outfile: path.join(target, name + '.js'),
    banner: { js: '/* Generated from the shared plugin installation sources. */' } })
}
fs.writeFileSync(path.join(target, 'package.json'), '{"type":"module"}\n')
fs.copyFileSync(path.join(root, 'LICENSE'), path.join(root, 'installer', 'LICENSE'))
if (process.argv[2]) {
  const version = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).version
  const archive = fs.readFileSync(process.argv[2]), assets = path.join(root, 'installer/assets')
  fs.mkdirSync(assets, { recursive: true })
  const release = { version, channel: version.includes('-') ? 'preview' : 'stable', dsh: ['0.1.1-rc.2', '0.1.2-rc.1', '0.1.5-rc.1'],
    platforms: ['windows', 'macos', 'linux'], architectures: ['x64'], asset: {
      url: `https://github.com/martinbear1/dsh-wechat-remote/releases/download/v${version}/harness-remote-dsh-wechat-remote-${version}.tgz`,
      sha256: createHash('sha256').update(archive).digest('hex'), bytes: archive.length } }
  fs.writeFileSync(path.join(assets, 'release.json'), JSON.stringify({ version, catalog: {
    schemaVersion: 1, revision: `installer-${version}`, issuedAt: Date.now(), expiresAt: Date.now() + 28 * 86400000,
    releases: [release], blocked: [], retiredDsh: [] } }, null, 2) + '\n')
  fs.copyFileSync(process.argv[2], path.join(assets, 'plugin.tgz'))
}
