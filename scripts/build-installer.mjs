import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
const root = fileURLToPath(new URL('../', import.meta.url))
const target = path.join(root, 'installer', 'lib')
fs.mkdirSync(target, { recursive: true })
for (const name of ['install-control', 'update-worker', 'install-profile', 'install-runtime', 'update-download', 'update-policy', 'secure-file']) {
  await build({ entryPoints: [path.join(root, 'src', name + '.ts')], bundle: true,
    platform: 'node', target: 'node22', format: 'esm', outfile: path.join(target, name + '.js'),
    banner: { js: '/* Generated from the shared plugin installation sources. */' } })
}
fs.writeFileSync(path.join(target, 'package.json'), '{"type":"module"}\n')
await build({ entryPoints: [path.join(root, 'installer/bin/native-recovery.mjs')], bundle: true,
  platform: 'node', target: 'node22', format: 'esm', outfile: path.join(target, 'native-recovery.js'),
  // yaml's CommonJS distribution requests Node built-ins. Preserve that native
  // loading contract in the standalone ESM helper, without external packages.
  banner: { js: "import { createRequire as recoveryRequire } from 'node:module'; const require = recoveryRequire(import.meta.url);" } })
fs.copyFileSync(path.join(root, 'LICENSE'), path.join(root, 'installer', 'LICENSE'))
if (process.argv[2]) {
  // Installer and payload may intentionally differ (installer-only hotfix).
  // Metadata must describe the actual embedded artifact, never the checkout.
  const payload = JSON.parse(execFileSync('tar', ['-xOf', process.argv[2], 'package/package.json'], {
    encoding: 'utf8', windowsHide: true, timeout: 10000, maxBuffer: 1024 * 1024,
  }))
  if (payload.name !== '@harness-remote/dsh-wechat-remote' || !/^\d+\.\d+\.\d+(?:-[\w.-]+)?$/.test(payload.version)) throw new Error('Invalid plugin payload')
  const version = payload.version
  const archive = fs.readFileSync(process.argv[2]), assets = path.join(root, 'installer/assets')
  fs.mkdirSync(assets, { recursive: true })
  // Record THIS release's native test evidence. Older release matrices are not
  // automatically proof of a new installer's compatibility or admission rules.
  const release = { version, channel: version.includes('-') ? 'preview' : 'stable', dsh: ['0.1.5-rc.1'],
    platforms: ['windows', 'macos', 'linux'], architectures: ['x64'], asset: {
      url: `https://github.com/martinbear1/dsh-wechat-remote/releases/download/v${version}/harness-remote-dsh-wechat-remote-${version}.tgz`,
      sha256: createHash('sha256').update(archive).digest('hex'), bytes: archive.length } }
  // Evidence only: this flag records a completed hardware test, never grants
  // permission to install/update/restart. Untested CPUs follow the same flow.
  if (process.argv.includes('--unverified')) {
    // A local research artifact must not inherit the previous release's
    // hardware evidence merely because it can be built on this workstation.
    release.dsh = []; release.platforms = []; release.architectures = []
  }
  if (process.argv.includes('--linux-arm64-rc1')) {
    if (process.argv.includes('--unverified')) throw new Error('Conflicting hardware evidence flags')
    release.architectures.push('arm64')
    release.targets = [
      ...release.platforms.map(platform => ({ platform, arch: 'x64', dsh: release.dsh })),
      { platform: 'linux', arch: 'arm64', dsh: ['0.1.5-rc.1'] },
    ]
  }
  const metadata = { version, catalog: {
    schemaVersion: 1, revision: `installer-${version}`, issuedAt: Date.now(), expiresAt: Date.now() + 28 * 86400000,
    releases: [release], blocked: [], retiredDsh: [] } }
  // Validate with the actual shipped selector before emitting an installer.
  const { selectInstallTarget } = await import('../installer/bin/release-selection.mjs')
  selectInstallTarget(metadata, undefined, { agentVersion: '', platform: '' })
  fs.writeFileSync(path.join(assets, 'release.json'), JSON.stringify(metadata, null, 2) + '\n')
  fs.copyFileSync(process.argv[2], path.join(assets, 'plugin.tgz'))
}
