/** Architecture is catalog policy, not a second hard-coded host restriction.
 * This unit test does NOT claim hardware restart coverage; native integration
 * tests exercise the actual host and worker separately. */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-update-architecture-'))
const previousHome = process.env.DSH_HOME
process.env.DSH_HOME = directory
const { PluginUpdateService } = await import('../lib/update-service.js')
const arch = Object.getOwnPropertyDescriptor(process, 'arch')
const electron = Object.getOwnPropertyDescriptor(process.versions, 'electron')
try {
  const service = new PluginUpdateService({ get: () => undefined }, { web: 7280, gate: 7292, local: 7293 })
  for (const cpu of ['x64', 'arm64']) {
    Object.defineProperty(process, 'arch', { ...arch, value: cpu })
    const result = service.eligibility()
    assert.equal(result.eligible, false, 'This test runner is not a native DSH host')
    assert(!/架构/.test(result.reason), 'CPU alone must not reject a release admitted by the catalog')
    Object.defineProperty(process.versions, 'electron', { configurable: true, value: 'fixture' })
    assert.match(service.eligibility().reason, /启动方式尚不支持自动重启/)
    delete process.versions.electron
  }
  console.log('PASS ARM64 and x64 share native host checks; unsupported launcher is still refused')
} finally {
  Object.defineProperty(process, 'arch', arch)
  if (electron) Object.defineProperty(process.versions, 'electron', electron)
  else delete process.versions.electron
  if (previousHome === undefined) delete process.env.DSH_HOME
  else process.env.DSH_HOME = previousHome
  assert(path.dirname(directory) === os.tmpdir() && path.basename(directory).startsWith('dsh-update-architecture-'))
  fs.rmSync(directory, { recursive: true })
}
