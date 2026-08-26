import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { Context } from '@deepseek-ai/cordis'
import { remoteMethods } from '@deepseek-ai/dsh-typert-protocol'

import WechatDirectoryService from '../lib/directory-service.js'

const fail = (message) => { throw new Error(message) }
const ctx = new Context()
const fiber = await ctx.plugin(WechatDirectoryService, { maxEntries: 1000 })
const signal = new AbortController().signal
const scratch = mkdtempSync(path.join(tmpdir(), 'wechat-directory-test-'))

try {
  const service = ctx.wechatDirectory
  const methods = remoteMethods(service).map((item) => item.method)
  if (methods.join(',') !== 'roots,list,create') fail(`unexpected Remote methods: ${methods.join(',')}`)

  const roots = await service.roots({}, signal)
  if (!roots.ok || roots.value.roots.length === 0) fail('filesystem roots were not enumerated')
  if (!['windows', 'macos', 'linux', 'unknown'].includes(roots.value.platform)) fail('host platform was not returned')
  if (!['drives', 'filesystem'].includes(roots.value.rootStyle)) fail('directory root style was not returned')
  if (process.platform === 'win32') {
    const paths = roots.value.roots.map((item) => item.path.toUpperCase())
    if (!paths.includes(`${process.env.SystemDrive || 'C:'}\\`.toUpperCase())) fail('system drive is missing')
    if (new Set(paths).size !== paths.length) fail('duplicate drive roots returned')
  }

  const listed = await service.list({ path: scratch }, signal)
  if (!listed.ok || listed.value.path !== path.resolve(scratch)) fail('scratch directory cannot be listed')
  const relative = await service.list({ path: 'relative/path' }, signal)
  if (relative.ok || relative.error.code !== 'directory-unreadable') fail('relative path escaped the absolute-path fence')

  const created = await service.create({ path: scratch, name: 'child' })
  if (!created.ok || !existsSync(created.value.path)) fail('child directory was not created')
  const duplicate = await service.create({ path: scratch, name: 'child' })
  if (duplicate.ok || duplicate.error.code !== 'directory-exists') fail('duplicate directory was not rejected')
  const traversal = await service.create({ path: scratch, name: '..\\escape' })
  if (traversal.ok || traversal.error.code !== 'directory-create-failed') fail('path-segment traversal was not rejected')
} finally {
  rmSync(scratch, { recursive: true, force: true })
  await fiber.dispose()
}

console.log('directory service tests passed')
