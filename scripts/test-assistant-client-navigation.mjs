import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { transform } from 'esbuild'

const source = await readFile(new URL('../src/client/assistant-navigation.ts', import.meta.url), 'utf8')
const { code } = await transform(source, { loader: 'ts', format: 'esm', target: 'es2022' })
const { nativeAssistantNavigation } = await import('data:text/javascript;base64,' + Buffer.from(code).toString('base64'))
const presetId = 'assistant_teacher_test'
const receipt = (id = presetId, sessionId = 'session-new') => ({ ok: true, value: { sessionId, agentPreset: id } })
const deferred = () => {
  let resolve, reject
  return { promise: new Promise((yes, no) => { resolve = yes; reject = no }), resolve, reject }
}
function fixture() {
  const calls = [], navigation = new AbortController()
  const services = {
    'remote.session': { create: async request => { calls.push(['create', request]); return receipt() } },
    sessions: { refresh: async () => { calls.push(['refresh']) } },
    uiWorkspace: { openSession: id => { calls.push(['openSession', id]) } },
    layout: { beginNavigation: () => { calls.push(['beginNavigation']); return navigation.signal } },
    configForms: { developerTools: { enabled: { getSnapshot: () => true } } },
  }
  const controller = nativeAssistantNavigation(name => services[name])
  return { services, calls, navigation, controller }
}

test('native start uses atomic preset create, refresh, and public navigation without other mutations', async () => {
  const f = fixture()
  await f.controller.start(presetId)
  assert.deepEqual(f.calls, [['beginNavigation'], ['create', { agentPreset: presetId }], ['refresh'], ['openSession', 'session-new']])
  await f.controller.start(presetId)
  assert.deepEqual(f.calls.at(-1), ['openSession', 'session-new'])
  assert.equal(f.calls.filter(call => call[0] === 'create').length, 1)
})

test('old native API or disabled native picker fails closed before any create', async () => {
  for (const missing of ['remote.session', 'sessions', 'uiWorkspace', 'layout', 'configForms']) {
    const f = fixture()
    delete f.services[missing]
    await assert.rejects(f.controller.start(presetId), /原生界面未提供/)
    assert.deepEqual(f.calls, [])
  }
  const f = fixture()
  f.services.configForms.developerTools.enabled.getSnapshot = () => false
  await assert.rejects(f.controller.start(presetId), /原生工作模式选择尚未启用/)
  assert.deepEqual(f.calls, [])
})

test('invalid preset and already departed page cannot dispatch', async () => {
  const f = fixture(), page = new AbortController()
  await assert.rejects(f.controller.start('../other'), /身份无效/)
  page.abort()
  await f.controller.start(presetId, page.signal)
  assert.deepEqual(f.calls, [])
})

test('concurrent clicks dispatch only one native creation', async () => {
  const f = fixture(), gate = deferred()
  f.services['remote.session'].create = request => { f.calls.push(['create', request]); return gate.promise }
  const pending = f.controller.start(presetId)
  await f.controller.start(presetId)
  await f.controller.start('assistant_other')
  gate.resolve(receipt())
  await pending
  assert.equal(f.calls.filter(call => call[0] === 'create').length, 1)
})

test('lost native response remains unknown after reconnect and cannot replay', async () => {
  const f = fixture()
  f.services['remote.session'].create = async request => { f.calls.push(['create', request]); throw new Error('response lost') }
  await assert.rejects(f.controller.start(presetId), /response lost/)
  f.controller.reset()
  await assert.rejects(f.controller.start(presetId), /不会自动再次创建/)
  assert.equal(f.calls.filter(call => call[0] === 'create').length, 1)
  assert.equal(f.calls.filter(call => call[0] === 'openSession').length, 0)
})

test('connection reset fences late creation and does not erase its unknown attempt', async () => {
  const f = fixture(), gate = deferred()
  f.services['remote.session'].create = request => { f.calls.push(['create', request]); return gate.promise }
  const pending = f.controller.start(presetId)
  f.controller.reset()
  gate.resolve(receipt())
  await assert.rejects(pending, /导航或连接已变化/)
  await assert.rejects(f.controller.start(presetId), /不会自动再次创建/)
  assert.deepEqual(f.calls.map(call => call[0]), ['beginNavigation', 'create'])
})

test('reset removes old node session addresses while retaining non-replay protection', async () => {
  const f = fixture()
  await f.controller.start(presetId)
  f.calls.length = 0
  f.controller.reset()
  await assert.rejects(f.controller.start(presetId), /不会自动再次创建/)
  assert.deepEqual(f.calls, [])
})

test('native reply must acknowledge the exact requested preset and a session address', async () => {
  for (const result of [receipt('other'), receipt(presetId, ''), { ok: true, value: { sessionId: 'session-new' } }, { ok: true, value: { agentPreset: presetId } }, { ok: false }]) {
    const f = fixture()
    f.services['remote.session'].create = async request => { f.calls.push(['create', request]); return result }
    await assert.rejects(f.controller.start(presetId), /未确认指定助手身份/)
    await assert.rejects(f.controller.start(presetId), /不会自动再次创建/)
    assert.deepEqual(f.calls.map(call => call[0]), ['beginNavigation', 'create'])
  }
})

test('refresh failure keeps confirmed session and never creates a replacement on retry', async () => {
  const f = fixture()
  f.services.sessions.refresh = async () => { throw new Error('refresh failed') }
  await assert.rejects(f.controller.start(presetId), /refresh failed/)
  await f.controller.start(presetId)
  assert.equal(f.calls.filter(call => call[0] === 'create').length, 1)
  assert.deepEqual(f.calls.at(-1), ['openSession', 'session-new'])
})

test('leaving the page during creation suppresses refresh and late navigation', async () => {
  const f = fixture(), page = new AbortController(), gate = deferred()
  f.services['remote.session'].create = request => { f.calls.push(['create', request]); return gate.promise }
  const pending = f.controller.start(presetId, page.signal)
  page.abort()
  gate.resolve(receipt())
  await assert.rejects(pending, /导航或连接已变化/)
  assert.deepEqual(f.calls.map(call => call[0]), ['beginNavigation', 'create'])
  await assert.rejects(f.controller.start(presetId), /不会自动再次创建/)
})

test('page departure or another native navigation during refresh suppresses late opening', async () => {
  for (const cause of ['page', 'navigation', 'reset']) {
    const f = fixture(), page = new AbortController(), gate = deferred(), refreshed = deferred()
    f.services.sessions.refresh = () => { f.calls.push(['refresh']); refreshed.resolve(); return gate.promise }
    const pending = f.controller.start(presetId, page.signal)
    await refreshed.promise
    if (cause === 'page') page.abort()
    else if (cause === 'navigation') f.navigation.abort()
    else f.controller.reset()
    gate.resolve()
    await pending
    assert.equal(f.calls.filter(call => call[0] === 'openSession').length, 0, cause)
    if (cause === 'reset') await assert.rejects(f.controller.start(presetId), /不会自动再次创建/)
  }
})

test('beginNavigation failure does not leave the entry permanently busy', async () => {
  const f = fixture(), begin = f.services.layout.beginNavigation
  f.services.layout.beginNavigation = () => { throw new Error('layout unavailable') }
  await assert.rejects(f.controller.start(presetId), /layout unavailable/)
  f.services.layout.beginNavigation = begin
  await f.controller.start(presetId)
  assert.equal(f.calls.filter(call => call[0] === 'create').length, 1)
})

test('old connection completion cannot unlock a new connection creation', async () => {
  const f = fixture(), oldGate = deferred(), newGate = deferred()
  f.services['remote.session'].create = request => {
    f.calls.push(['create', request])
    return request.agentPreset === presetId ? oldGate.promise : newGate.promise
  }
  const oldPending = f.controller.start(presetId)
  f.controller.reset()
  const newPending = f.controller.start('assistant_other')
  oldGate.resolve(receipt())
  await assert.rejects(oldPending, /导航或连接已变化/)
  await f.controller.start('assistant_third')
  assert.equal(f.calls.filter(call => call[0] === 'create').length, 2)
  newGate.resolve(receipt('assistant_other', 'session-other'))
  await newPending
  assert.deepEqual(f.calls.filter(call => call[0] === 'openSession'), [['openSession', 'session-other']])
})
