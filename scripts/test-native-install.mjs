/** Explicit opt-in integration test. Never points at the user's actual profile. */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { installProfile, backupProfile, PLUGIN_PACKAGE } from '../lib/install-profile.js'
import { resolveInstallRuntime, verifyInstallRuntime } from '../lib/install-runtime.js'

const [cli, archive, version, previousArchive, previousVersion] = process.argv.slice(2)
if (!cli || !archive || !version) throw new Error('Usage: node scripts/test-native-install.mjs <DSH bin.js> <verified local tgz> <version>')
const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-native-install-test-')))
const repo = fileURLToPath(new URL('../', import.meta.url))
const runtime = resolveInstallRuntime(repo)
const directory = path.join(root, 'job with spaces')
fs.mkdirSync(directory)
fs.copyFileSync(archive, path.join(directory, 'release.tgz'))
const profile = path.join(root, 'actual-home', 'profiles', 'web')
try {
  await verifyInstallRuntime(runtime)
  if (previousArchive) {
    assert(previousVersion)
    const oldJob = path.join(root, 'old-install'); fs.mkdirSync(oldJob)
    fs.copyFileSync(previousArchive, path.join(oldJob, 'release.tgz'))
    await installProfile({ profile, directory: oldJob, cli, targetVersion: previousVersion, runtime })
    fs.writeFileSync(path.join(profile, 'user-settings.json'), '{"preserve":"existing user setting"}\n')
  }
  if (previousArchive) {
    backupProfile(profile, path.join(root, 'profile-backup'))
  }
  // Real pnpm coexistence check: a local bundle and a relative external link
  // stay anchored to this ORIGINAL profile, not to an installer staging copy.
  fs.mkdirSync(profile, { recursive: true })
  const localBundle = path.join(path.dirname(profile), 'fixture-bundle')
  const linkedBundle = path.join(path.dirname(profile), 'fixture-linked')
  for (const [dir, name] of [[localBundle, 'fixture-local-bundle'], [linkedBundle, 'fixture-linked-bundle']]) {
    fs.mkdirSync(dir)
    fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name, version: '1.0.0', dsh: { bundle: { patch: './cordis.patch.yml' } } }))
    fs.writeFileSync(path.join(dir, 'cordis.patch.yml'), '[]\n')
  }
  const file = path.join(profile, 'package.json')
  const before = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file)) : { private: true, dsh: { profile: { bundles: [] } } }
  before.dependencies = { ...before.dependencies, 'fixture-local-bundle': 'file:../fixture-bundle', 'fixture-linked-bundle': 'link:../fixture-linked' }
  fs.writeFileSync(file, JSON.stringify(before))
  await installProfile({ profile, directory, cli, targetVersion: version, runtime })
  if (previousArchive) assert.equal(fs.readFileSync(path.join(profile, 'user-settings.json'), 'utf8'), '{"preserve":"existing user setting"}\n')
  const require = createRequire(path.join(profile, 'package.json'))
  const entry = require.resolve(PLUGIN_PACKAGE)
  assert(fs.existsSync(entry), 'installed package must resolve from the original profile')
  const manifest = JSON.parse(fs.readFileSync(path.join(profile, 'package.json'), 'utf8'))
  assert.equal(manifest.dependencies['fixture-local-bundle'], 'file:../fixture-bundle')
  assert.equal(manifest.dependencies['fixture-linked-bundle'], 'link:../fixture-linked')
  assert(manifest.dsh.profile.bundles.includes('fixture-local-bundle'))
  assert(manifest.dsh.profile.bundles.includes('fixture-linked-bundle'))
  assert.equal(fs.realpathSync(path.join(profile, 'node_modules/fixture-linked-bundle')), fs.realpathSync(linkedBundle))
  console.log('PASS real native pnpm preserves file/link sources and registers third-party bundles')
  assert(manifest.dsh.profile.bundles.includes(PLUGIN_PACKAGE), 'DSH must register its native bundle layer')
  const installedRoot = path.dirname(require.resolve(PLUGIN_PACKAGE + '/package.json'))
  const installedManifest = JSON.parse(fs.readFileSync(path.join(installedRoot, 'package.json'), 'utf8'))
  assert.equal(installedManifest.version, version)
  if (installedManifest.dependencies?.pnpm) await verifyInstallRuntime(resolveInstallRuntime(installedRoot))
  console.log('PASS native DSH init, original-profile install, bundle activation')
  if (previousArchive) console.log('PASS legacy profile upgrade, user settings preserved, backup available')
} catch (error) {
  console.error('Integration evidence retained at:', directory)
  throw error
}
// Retain only inside a specifically named test directory on failure; successful
// cleanup validates the absolute path so it cannot target a user DSH home.
assert(path.dirname(root) === fs.realpathSync(os.tmpdir()) && path.basename(root).startsWith('dsh-native-install-test-'))
fs.rmSync(root, { recursive: true })
