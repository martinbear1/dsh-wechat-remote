import assert from 'node:assert/strict'
import { Context } from '@deepseek-ai/cordis'

import {
  isAllowedDshWebOrigin,
  resolveDshWebRuntime,
} from '../lib/dsh-runtime.js'

const ctx = new Context()
ctx.get = name => name === 'webServer' ? { port: 3180 } : undefined

assert.deepEqual(
  resolveDshWebRuntime(ctx, { DSH_PORT: '3080' }),
  { port: 3180, source: 'web-server' },
  'the active DSH service wins over a stale inherited environment value',
)

const fallback = new Context()
assert.deepEqual(
  resolveDshWebRuntime(fallback, { DSH_PORT: '4567' }),
  { port: 4567, source: 'environment' },
)
assert.deepEqual(
  resolveDshWebRuntime(fallback, { DSH_PORT: 'not-a-port' }),
  { port: 3080, source: 'legacy-default' },
)

for (const origin of [
  'http://127.0.0.1:3180',
  'http://localhost:3180',
  'http://[::1]:3180',
]) {
  assert.equal(isAllowedDshWebOrigin(origin, 3180), true, origin)
}
for (const origin of [
  undefined,
  'https://127.0.0.1:3180',
  'http://127.0.0.1:3080',
  'http://example.test:3180',
  'http://127.0.0.1:3180/path',
  'http://user@127.0.0.1:3180',
]) {
  assert.equal(isAllowedDshWebOrigin(origin, 3180), false, String(origin))
}

console.log('DSH Web runtime compatibility tests passed')
