import assert from 'node:assert/strict'
import { homedir } from 'node:os'

import { hostPlatform, hostPlatformDescriptor, selectLanIPv4 } from '../lib/host-platform.js'

const info = (address, internal = false) => ({
  address,
  netmask: '255.255.255.0',
  family: 'IPv4',
  mac: '00:00:00:00:00:00',
  internal,
  cidr: `${address}/24`,
})

assert.equal(selectLanIPv4({
  utun4: [info('198.18.0.1')],
  en0: [info('192.168.3.243')],
}), '192.168.3.243')
assert.equal(selectLanIPv4({
  overlay0: [info('100.64.0.1')],
  en0: [info('172.20.10.2')],
}), '172.20.10.2')
assert.equal(selectLanIPv4({ lo0: [info('127.0.0.1', true)] }), '127.0.0.1')

const descriptor = hostPlatformDescriptor()
assert.ok(['windows', 'macos', 'linux', 'unknown'].includes(descriptor.kind))
assert.ok(['windows', 'posix'].includes(descriptor.pathStyle))
const roots = await hostPlatform.filesystemRoots(new AbortController().signal)
assert.ok(roots.some(root => homedir() === root.path || homedir().startsWith(root.path)))
if (process.platform === 'darwin') {
  assert.equal(descriptor.kind, 'macos')
  assert.ok(roots.some(root => root.path === '/'))
  assert.ok(roots.some(root => root.path === '/Volumes'))
}

console.log(`host platform tests passed: ${descriptor.kind}`)
