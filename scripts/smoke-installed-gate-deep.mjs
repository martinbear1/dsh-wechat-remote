import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { mkdir, readFile, rm } from 'node:fs/promises'
import path from 'node:path'
import { WebSocket } from 'ws'

const options = parseArgs(process.argv.slice(2))
const baseUrl = new URL(options['base-url'] || 'http://127.0.0.1:3092')
const stateFile = options['state-file']
const workspaceRoot = options['workspace-root']
if (!stateFile) throw new Error('--state-file is required')
if (!workspaceRoot) throw new Error('--workspace-root is required')

const state = JSON.parse(await readFile(stateFile, 'utf8'))
assert.equal(typeof state.token, 'string', 'gate state does not contain a token')
assert.ok(state.token.length >= 32, 'gate token is invalid')

const headers = {
  authorization: `Bearer ${state.token}`,
  'content-type': 'application/json',
}
const workspacePath = path.resolve(workspaceRoot, `compat-smoke-${Date.now()}`)
const passed = []
let workspaceId = null
const hostEvents = createEventCollector('/api/events.host')
const muxEvents = createEventCollector('/api/events.mux')

await mkdir(workspacePath, { recursive: true })
try {
  await Promise.all([hostEvents.opened, muxEvents.opened])

  assertOk('workspace.create', await rpc('workspace.create', { path: workspacePath }))
  passed.push('workspace.create')

  const workspaceList = valueOf('workspace.list', await rpc('workspace.list', {}))
  const workspace = workspaceList.items?.find(item => samePath(item.path, workspacePath))
  assert.ok(workspace?.workspaceId, 'workspace.list did not return the created workspace')
  workspaceId = workspace.workspaceId
  passed.push('workspace.list(created)')

  const createdSession = valueOf('session.create', await rpc('session.create', { workspaceId }))
  const sessionId = createdSession.sessionId || createdSession.session?.sessionId
  assert.equal(typeof sessionId, 'string', 'session.create did not return sessionId')
  passed.push('session.create')

  await hostEvents.waitFor(frame => frame?.payload?.type === 'host/session-added'
    && frame.payload.sessionId === sessionId)
  await muxEvents.waitFor(frame => frame?.payload?.type === 'session/subscribed'
    && frame.payload.sessionId === sessionId)
  passed.push('realtime.session-added', 'realtime.session-subscribed')

  const sessionList = valueOf('session.list', await rpc('session.list', {}))
  assert.ok(sessionList.items?.some(item => item.sessionId === sessionId), 'created session is missing')
  passed.push('session.list(created)')

  valueOf('session.history', await rpc('session.history', { sessionId, maxMessages: 16 }))
  passed.push('session.history')

  const presets = valueOf('agentPreset.list', await rpc('agentPreset.list', {})).presets || []
  const preset = presets.find(item => !item.broken) || presets[0]
  assert.ok(preset?.id, 'agentPreset.list returned no usable preset')
  assertOk('agentPreset.select', await rpc('agentPreset.select', {
    sessionId,
    agentPreset: preset.id,
  }))
  passed.push('agentPreset.select')

  valueOf('session.models', await rpc('session.models', { sessionId }))
  valueOf('commands/list', await rpc('commands/list', { args: { agentId: sessionId } }))
  valueOf('subagent.list', await rpc('subagent.list', { parentSessionId: sessionId }))
  valueOf('pluginInventory/list', await rpc('pluginInventory/list', { args: {} }))
  valueOf('llm.models', await rpc('llm.models', {}))
  passed.push('session.models', 'commands/list', 'subagent.list', 'pluginInventory/list', 'llm.models')

  assertOk('session.rename', await rpc('session.rename', {
    sessionId,
    title: 'Compatibility smoke session',
  }))
  assertOk('session.cancel', await rpc('session.cancel', { sessionId }))
  passed.push('session.rename', 'session.cancel')

  const search = await rpc('session.search', { query: 'Compatibility smoke session' })
  const searchStatus = search.ok ? 'supported' : `unavailable:${search.error?.code || 'unknown'}`

  console.log(JSON.stringify({
    ok: true,
    baseUrl: baseUrl.origin,
    passed,
    sessionSearch: searchStatus,
  }))
} finally {
  hostEvents.close()
  muxEvents.close()
  if (workspaceId) {
    try { await rpc('workspace.delete', { workspaceId }) } catch {}
  }
  await rm(workspacePath, { recursive: true, force: true })
}

function createEventCollector(eventPath) {
  const target = new URL(eventPath, baseUrl)
  target.protocol = target.protocol === 'https:' ? 'wss:' : 'ws:'
  const frames = []
  const waiters = new Set()
  const socket = new WebSocket(target, { headers: { authorization: headers.authorization } })
  const opened = new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(`${eventPath}: open timeout`)), 8_000)
    socket.once('open', () => {
      clearTimeout(timeout)
      resolve()
    })
    socket.once('error', error => {
      clearTimeout(timeout)
      reject(error)
    })
  })
  socket.on('message', data => {
    try {
      const frame = JSON.parse(Buffer.from(data).toString('utf8'))
      frames.push(frame)
      for (const waiter of waiters) waiter()
    } catch {}
  })
  return {
    opened,
    async waitFor(predicate, timeoutMs = 8_000) {
      const existing = frames.find(predicate)
      if (existing) return existing
      return await new Promise((resolve, reject) => {
        const inspect = () => {
          const frame = frames.find(predicate)
          if (!frame) return
          cleanup()
          resolve(frame)
        }
        const timeout = setTimeout(() => {
          cleanup()
          reject(new Error(`${eventPath}: expected realtime event was not observed`))
        }, timeoutMs)
        const cleanup = () => {
          clearTimeout(timeout)
          waiters.delete(inspect)
        }
        waiters.add(inspect)
      })
    },
    close() {
      try { socket.terminate() } catch {}
    },
  }
}

async function rpc(method, payload) {
  const response = await fetch(new URL(`/api/${method}`, baseUrl), {
    method: 'POST',
    headers,
    body: JSON.stringify({
      type: 'client-request',
      rpcId: `compat-${randomUUID()}`,
      method,
      payload,
    }),
  })
  assert.equal(response.status, 200, `${method}: HTTP ${response.status}`)
  const envelope = await response.json()
  assert.equal(envelope?.type, 'server-response', `${method}: invalid response envelope`)
  return envelope.result || {}
}

function assertOk(method, result) {
  assert.equal(result.ok, true, `${method}: ${result.error?.code || result.error?.message || 'failed'}`)
  return result
}

function valueOf(method, result) {
  assertOk(method, result)
  return result.value
}

function samePath(left, right) {
  if (typeof left !== 'string') return false
  const normalize = value => path.resolve(value).replaceAll('\\', '/').toLowerCase()
  return normalize(left) === normalize(right)
}

function parseArgs(args) {
  const parsed = {}
  for (let index = 0; index < args.length; index += 1) {
    const key = args[index]
    if (!key.startsWith('--')) throw new Error(`unexpected argument: ${key}`)
    const value = args[index + 1]
    if (!value || value.startsWith('--')) throw new Error(`${key} requires a value`)
    parsed[key.slice(2)] = value
    index += 1
  }
  return parsed
}
