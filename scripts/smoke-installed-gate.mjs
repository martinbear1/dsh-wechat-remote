import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { WebSocket } from 'ws'

const options = parseArgs(process.argv.slice(2))
const baseUrl = new URL(options['base-url'] || 'http://127.0.0.1:3092')
const stateFile = options['state-file']
if (!stateFile) throw new Error('--state-file is required')

const state = JSON.parse(await readFile(stateFile, 'utf8'))
assert.equal(typeof state.token, 'string', 'gate state does not contain a token')
assert.ok(state.token.length >= 32, 'gate token is invalid')

const headers = {
  authorization: `Bearer ${state.token}`,
  'content-type': 'application/json',
}

const checks = []
for (const [method, payload] of [
  ['host.describe', {}],
  ['session.list', {}],
  ['workspace.list', {}],
  ['agentPreset.list', {}],
  ['llm.providers', {}],
]) {
  const result = await rpc(method, payload)
  assert.equal(result.ok, true, `${method}: ${result.error?.code || result.error?.message || 'failed'}`)
  checks.push(method)
}

await Promise.all([
  openEventStream('/api/events.host'),
  openEventStream('/api/events.mux'),
])

console.log(JSON.stringify({
  ok: true,
  baseUrl: baseUrl.origin,
  rpc: checks,
  webSockets: ['/api/events.host', '/api/events.mux'],
}))

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

function openEventStream(path) {
  return new Promise((resolve, reject) => {
    const target = new URL(path, baseUrl)
    target.protocol = target.protocol === 'https:' ? 'wss:' : 'ws:'
    const socket = new WebSocket(target, { headers: { authorization: headers.authorization } })
    const timeout = setTimeout(() => finish(new Error(`${path}: open timeout`)), 8_000)
    const finish = (error) => {
      clearTimeout(timeout)
      socket.removeAllListeners()
      try { socket.terminate() } catch {}
      if (error) reject(error)
      else resolve()
    }
    socket.once('open', () => finish())
    socket.once('error', finish)
    socket.once('unexpected-response', (_request, response) => {
      finish(new Error(`${path}: HTTP ${response.statusCode || 'unknown'}`))
    })
  })
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
