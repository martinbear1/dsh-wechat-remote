import assert from 'node:assert/strict'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { loadGateState, saveGateState } from '../lib/gate-state.js'

const root = mkdtempSync(path.join(tmpdir(), 'harness-remote-gate-state-'))
try {
  const firstRunFile = path.join(root, 'first', 'gate.json')
  const first = loadGateState(firstRunFile)
  assert.equal(first.persistent, true)
  assert.equal(first.state.token.length >= 32, true)
  assert.equal(existsSync(firstRunFile), true)

  const original = { token: 'a'.repeat(43), publicIdentityNodeId: 'node-stable' }
  saveGateState(firstRunFile, original)
  const existing = loadGateState(firstRunFile)
  assert.deepEqual(existing.state, original, 'valid existing credentials must not rotate')

  const corruptFile = path.join(root, 'corrupt.json')
  writeFileSync(corruptFile, '{not-json', 'utf8')
  const recovered = loadGateState(corruptFile)
  assert.equal(recovered.persistent, true)
  assert.notEqual(recovered.state.token, original.token)
  assert.equal(typeof recovered.recoveredFrom, 'string')
  assert.equal(readFileSync(recovered.recoveredFrom, 'utf8'), '{not-json')
  assert.deepEqual(JSON.parse(readFileSync(corruptFile, 'utf8')), recovered.state)
  assert.equal(readdirSync(root).filter(name => name.startsWith('corrupt.json.corrupt-')).length, 1)

  const invalidSchemaFile = path.join(root, 'invalid-schema.json')
  writeFileSync(invalidSchemaFile, '{"token":"short"}\n', 'utf8')
  const invalidSchema = loadGateState(invalidSchemaFile)
  assert.equal(invalidSchema.persistent, true)
  assert.match(invalidSchema.warning, /preserved/)
  assert.equal(readFileSync(invalidSchema.recoveredFrom, 'utf8'), '{"token":"short"}\n')

  const unreadableShape = path.join(root, 'not-a-file')
  mkdirSync(unreadableShape)
  const unavailable = loadGateState(unreadableShape)
  assert.equal(unavailable.persistent, false)
  assert.match(unavailable.warning, /cannot read/)
  assert.equal(existsSync(unreadableShape), true, 'read failures must not replace the original path')

  console.log('gate state classification and recovery tests passed')
} finally {
  rmSync(root, { recursive: true, force: true })
}
