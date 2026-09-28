import assert from 'node:assert/strict'
import path from 'node:path'
import { test } from 'node:test'
import { startupDirectory } from '../lib/agent-metadata.js'

test('startup cwd is described honestly; internal DSH and plugin paths are not work locations', () => {
  const home = path.resolve('fixtures/自定义 DSH')
  const ctx = { get: key => key === 'profileContext' ? { name: 'desktop', home, dir: path.join(home, 'profiles/desktop'), installAnchor: path.join(home, 'package.json') } : undefined }
  for (const cwd of [home, path.join(home, 'profiles/desktop'), path.join(home, 'profiles/web'), path.resolve('fixtures/project/node_modules/plugin')]) {
    assert.deepEqual(startupDirectory(ctx, cwd), { path: cwd, usable: false })
  }
  for (const cwd of [path.resolve('fixtures/用户桌面'), path.resolve('fixtures/自定义 DSH-neighbor'), path.resolve('fixtures/Project With Spaces')]) {
    assert.deepEqual(startupDirectory(ctx, cwd), { path: cwd, usable: true })
  }
})
