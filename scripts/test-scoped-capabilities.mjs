import test from 'node:test'
import assert from 'node:assert/strict'
import { Context } from '@deepseek-ai/cordis'
import { SystemPrompt } from '@deepseek-ai/dsh-system-prompt'
import { ToolRuntime } from '@deepseek-ai/dsh-tools'
import { createScope } from '@deepseek-ai/dsh-scope'
import { ScopedCapabilities } from '../lib/human-tools/scoped-capabilities.js'

const definition = (name = 'collaboration_probe', execute = async () => ({})) => ({
  name, description: '', parameters: { type: 'object', properties: {} },
  output: { schema: { type: 'object' }, render: () => [{ type: 'text', text: '{}' }] }, execute,
})
function setup(t) {
  const ctx = new Context(); new SystemPrompt(ctx, {})
  const tools = new ToolRuntime(ctx, { mode: 'native' }), lifetime = new AbortController()
  const catalog = new ScopedCapabilities(lifetime.signal), scopes = []
  const create = () => { const key = {}, scope = createScope(ctx, key); scopes.push(scope); return { key, ctx: scope.ctx } }
  t.after(async () => { catalog.close(); for (const scope of scopes) await scope.dispose(); await ctx.fiber.dispose() })
  return { ctx, tools, lifetime, catalog, create }
}

test('backend catalog is invisible globally; explicit native scopes inherit native tools without leaking to peers', t => {
  const h = setup(t), a = h.create(), b = h.create(), ordinary = h.create()
  h.tools.register(definition('native_probe')); h.catalog.add(definition())
  assert.throws(() => h.catalog.mount(h.ctx), /不能全局/)
  const removeA = h.catalog.mount(a.ctx), removeB = h.catalog.mount(b.ctx)
  assert.equal(h.tools.get('collaboration_probe'), undefined)
  assert.equal(h.tools.get('collaboration_probe', ordinary.key), undefined)
  for (const scope of [a, b]) {
    assert(h.tools.get('collaboration_probe', scope.key)); assert(h.tools.get('native_probe', scope.key))
  }
  assert.throws(() => h.catalog.mount(a.ctx), /已装载/)
  assert.throws(() => h.catalog.add(definition('late')), /不能修改/)
  removeA(); removeA()
  assert.equal(h.tools.get('collaboration_probe', a.key), undefined)
  assert(h.tools.get('collaboration_probe', b.key))
  h.catalog.mount(a.ctx); removeB(); h.catalog.close()
  assert.equal(h.tools.get('collaboration_probe', a.key), undefined)
  assert(h.tools.get('native_probe', a.key)); assert.equal(h.catalog.has('collaboration_probe'), false)
  assert.throws(() => h.catalog.mount(b.ctx), /停用/)
})

test('failed contribution rolls back registrations without disabling backend or foreign scope entries', t => {
  const h = setup(t), a = h.create(); let cleared = 0
  h.catalog.add(definition()); a.ctx.get('tools').register(definition('foreign_probe'))
  const remove = h.catalog.contribute(() => () => { cleared++ })
  const fail = h.catalog.contribute(() => { throw new Error('late contribution failed') })
  assert.throws(() => h.catalog.mount(a.ctx), /late contribution failed/)
  assert.equal(cleared, 1); assert.equal(h.tools.get('collaboration_probe', a.key), undefined)
  assert(h.tools.get('foreign_probe', a.key)); assert(h.catalog.has('collaboration_probe'))
  remove(); fail(); h.catalog.mount(a.ctx)
  assert(h.tools.get('collaboration_probe', a.key))
})

test('cleanup failure still releases every mount and contribution exactly once', t => {
  const h = setup(t), a = h.create(), b = h.create(); let cleaned = 0
  h.catalog.add(definition())
  h.catalog.contribute(() => () => { cleaned++; throw new Error('cleanup failed') })
  h.catalog.contribute(() => () => { cleaned++ })
  h.catalog.mount(a.ctx); h.catalog.mount(b.ctx)
  assert.throws(() => h.catalog.close(), /cleanup failed/)
  assert.equal(cleaned, 4); h.catalog.close(); assert.equal(cleaned, 4)
  assert.equal(h.tools.get('collaboration_probe', a.key), undefined)
  assert.equal(h.tools.get('collaboration_probe', b.key), undefined)
})

for (const reason of ['scope', 'backend']) test(`${reason} shutdown cancels an in-flight tool and suppresses its late success`, async t => {
  const h = setup(t), a = h.create(); let release, observed
  const paused = new Promise(resolve => { release = resolve })
  h.catalog.add(definition('collaboration_probe', async (_, exec) => { observed = exec.signal; await paused; return {} }))
  const remove = h.catalog.mount(a.ctx)
  const call = h.tools.get('collaboration_probe', a.key).execute({}, { signal: new AbortController().signal })
  assert.equal(observed.aborted, false)
  if (reason === 'scope') remove(); else h.lifetime.abort(new Error('backend stopped'))
  assert.equal(observed.aborted, true); release(); await assert.rejects(call)
})
