/** Explicit opt-in integration test. Never points at the user's actual profile. */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { stageProfile, PLUGIN_PACKAGE } from '../lib/install-profile.js'
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
    const old = await stageProfile({ profile, directory: oldJob, cli, targetVersion: previousVersion, runtime })
    fs.mkdirSync(path.dirname(profile), { recursive: true })
    fs.renameSync(old, profile)
    fs.writeFileSync(path.join(profile, 'user-settings.json'), '{"preserve":"existing user setting"}\n')
  }
  const staged = await stageProfile({ profile, directory, cli, targetVersion: version, runtime })
  if (previousArchive) {
    assert.equal(JSON.parse(fs.readFileSync(path.join(profile, 'node_modules', PLUGIN_PACKAGE, 'package.json'), 'utf8')).version, previousVersion)
    assert.equal(fs.readFileSync(path.join(profile, 'user-settings.json'), 'utf8'), fs.readFileSync(path.join(staged, 'user-settings.json'), 'utf8'))
    fs.renameSync(profile, path.join(root, 'profile-backup'))
  } else assert(!fs.existsSync(profile), 'staging must not touch the active profile')
  fs.mkdirSync(path.dirname(profile), { recursive: true })
  fs.renameSync(staged, profile)
  const require = createRequire(path.join(profile, 'package.json'))
  const entry = require.resolve(PLUGIN_PACKAGE)
  assert(fs.existsSync(entry), 'installed package must resolve after relocating the staged profile')
  assert(fs.realpathSync(entry).startsWith(profile + path.sep), 'moved profile must be self-contained')
  const manifest = JSON.parse(fs.readFileSync(path.join(profile, 'package.json'), 'utf8'))
  assert(manifest.dsh.profile.bundles.includes(PLUGIN_PACKAGE), 'DSH must register its native bundle layer')
  const installedRoot = path.dirname(require.resolve(PLUGIN_PACKAGE + '/package.json'))
  const installedManifest = JSON.parse(fs.readFileSync(path.join(installedRoot, 'package.json'), 'utf8'))
  assert.equal(installedManifest.version, version)
  if (installedManifest.dependencies?.pnpm) await verifyInstallRuntime(resolveInstallRuntime(installedRoot))
  console.log('PASS native DSH init, package install, bundle activation, profile relocation')
  if (previousArchive) console.log('PASS legacy profile upgrade, previous version untouched while staging, user settings preserved')
} catch (error) {
  console.error('Integration evidence retained at:', directory)
  throw error
}
// Retain only inside a specifically named test directory on failure; successful
// cleanup validates the absolute path so it cannot target a user DSH home.
assert(path.dirname(root) === fs.realpathSync(os.tmpdir()) && path.basename(root).startsWith('dsh-native-install-test-'))
fs.rmSync(root, { recursive: true })
