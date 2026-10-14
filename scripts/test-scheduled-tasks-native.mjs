/** Actual installed DSH Schedule + JSON-domain service in a disposable directory.
 * Never opens a live profile, activates a real Agent, sends a model prompt or
 * connects to the network. A fake receiver acknowledges one synthetic inbox
 * delivery; the native timer, receipt and task storage remain genuine. */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'
import { execFileSync } from 'node:child_process'
import { pathToFileURL, fileURLToPath } from 'node:url'
import { build } from 'esbuild'
const archive = process.env.HARNESS_DSH_ASAR
assert(archive, 'HARNESS_DSH_ASAR is required; native verification must not silently skip')
const pluginEntry = process.env.HARNESS_SCHEDULE_PLUGIN_ENTRY
const pluginLib = pluginEntry ? path.dirname(path.dirname(path.resolve(pluginEntry))) : undefined
if (pluginEntry) {
  assert(fs.existsSync(pluginEntry), 'HARNESS_SCHEDULE_PLUGIN_ENTRY must name the packaged service.js')
  assert(fs.existsSync(path.join(pluginLib, 'typert.host.js')), 'packaged reflection is required alongside the service')
}
const stage = process.env.HARNESS_SCHEDULE_NATIVE_STAGE
const work = stage || fs.mkdtempSync(path.join(os.tmpdir(), 'schedule-native-'))
assert.equal(path.dirname(path.resolve(work)), path.resolve(os.tmpdir()))
assert(path.basename(work).startsWith('schedule-native-'))
let ctx, fd, streamLife, streamPump, compatibility
const originalFetch = globalThis.fetch
let networkCalls = 0, agentActivations = 0
globalThis.fetch = async () => { networkCalls++; throw Error('Native Schedule test forbids network') }
try {
  if (!stage) {
    fd = fs.openSync(archive, 'r')
    const prefix = Buffer.alloc(16); fs.readSync(fd, prefix, 0, 16, 0)
    const bytes = Buffer.alloc(prefix.readUInt32LE(12)); fs.readSync(fd, bytes, 0, bytes.length, 16)
    const tree = JSON.parse(bytes), dataStart = 8 + prefix.readUInt32LE(4)
    function materialize(entry, relative) {
      const target = path.resolve(work, relative)
      assert(target.startsWith(work + path.sep)); assert(!entry.link)
      if (entry.files) for (const [name, child] of Object.entries(entry.files)) materialize(child, path.join(relative, name))
      else if (/\.(?:[mc]?js|json|node|dll|wasm|ya?ml)$/.test(relative)) {
        fs.mkdirSync(path.dirname(target), { recursive: true })
        if (entry.unpacked) fs.copyFileSync(path.join(archive + '.unpacked', relative), target)
        else { const data = Buffer.alloc(entry.size); fs.readSync(fd, data, 0, data.length, dataStart + Number(entry.offset)); fs.writeFileSync(target, data) }
      }
    }
    materialize(tree.files.dsh, 'dsh')
    process.stdout.write(execFileSync(process.execPath, [fileURLToPath(import.meta.url)], { env: { ...process.env, HARNESS_SCHEDULE_NATIVE_STAGE: work }, encoding: 'utf8', windowsHide: true, timeout: 90000 }))
  } else {
    const anchor = path.join(work, 'dsh/node_modules/@deepseek-ai/dsh/package.json')
    const require = createRequire(anchor), load = name => import(pathToFileURL(require.resolve(name)).href)
    const { Context } = await load('@deepseek-ai/cordis')
    const { default: Typert } = await load('@deepseek-ai/dsh-typert-registry')
    const { TypertGatewayService } = await load('@deepseek-ai/dsh-api-gateway')
    const { HostConnectionService } = await load('@deepseek-ai/dsh-client-connection')
    const remoteEvents = await load('@deepseek-ai/dsh-api-remotes')
    const storage = await load('@deepseek-ai/dsh-storage'), json = await load('@deepseek-ai/dsh-storage-json'), domain = await load('@deepseek-ai/dsh-storage-domain')
    const { default: ScheduleService } = await load('@deepseek-ai/dsh-schedule')
    const { TYPERT } = await load('@deepseek-ai/dsh-schedule/typert')
    const output = await build({ entryPoints: [pluginEntry || fileURLToPath(new URL('../src/scheduled-tasks/service.ts', import.meta.url))], bundle: true, packages: 'external', write: false, platform: 'node', format: 'esm', target: 'node22' })
    const modulePath = path.join(work, 'dsh/scheduled-adapter.mjs')
    fs.writeFileSync(modulePath, output.outputFiles[0].contents)
    const { WechatSchedulesService } = await import(pathToFileURL(modulePath).href)
    const compatibilityOutput = await build({ entryPoints: [pluginLib ? path.join(pluginLib, 'dsh-realtime-compat.js') : fileURLToPath(new URL('../src/dsh-realtime-compat.ts', import.meta.url))], bundle: true, packages: 'external', write: false, platform: 'node', format: 'esm', target: 'node22' })
    const compatibilityPath = path.join(work, 'dsh/scheduled-realtime.mjs')
    fs.writeFileSync(compatibilityPath, compatibilityOutput.outputFiles[0].contents)
    const { DshRealtimeCompatibility } = await import(pathToFileURL(compatibilityPath).href)
    ctx = new Context(); new Typert(ctx)
    // Same launcher-owned version contract as the installed host, but every
    // path (including the extracted ASAR manifest) stays in this temp fixture.
    ctx.provide('profileContext', { name: 'synthetic', home: work,
      dir: path.join(work, 'synthetic-profile'), installAnchor: anchor })
    const syntheticSession = { id: 'synthetic-session' }
    const inbox = [], inboxFile = path.join(work, 'synthetic-inbox.json')
    let allowSyntheticDispatch = false, fakeAgentResolutions = 0, fakeInboxFlushes = 0
    const receiver = { session: syntheticSession, followup(message) {
      assert(allowSyntheticDispatch, 'only the explicit synthetic delivery may enter the fake inbox')
      assert.equal(inbox.length, 0, 'one one-shot task must not be delivered twice')
      inbox.push(message)
    } }
    ctx.provide('agents', { roots: () => [], withoutInitiator: work => work() })
    ctx.provide('sessions', { get: id => id === syntheticSession.id ? syntheticSession : undefined,
      flush: async session => {
        assert(allowSyntheticDispatch); assert.equal(session, syntheticSession); assert.equal(inbox.length, 1)
        // This is the explicitly fake Session persistence acknowledgement,
        // not DSH Session-log coverage. No real Session or Agent exists here.
        fs.writeFileSync(inboxFile, JSON.stringify(inbox)); fakeInboxFlushes++
        return true
      } })
    ctx.provide('tools', {})
    ctx.provide('sessionController', { resolveAgent: async id => {
      assert(allowSyntheticDispatch, 'no dispatch is permitted outside the explicit due-task case')
      assert.equal(id, syntheticSession.id)
      fakeAgentResolutions++
      return { agent: receiver }
    } })
    ctx.provide('sessionPersistence', { stat: async () => undefined })
    await ctx.plugin(storage.default); await ctx.plugin(json, { root: path.join(work, 'synthetic-storage') }); await ctx.plugin(domain, { backend: 'json' })
    const adapter = new WechatSchedulesService(ctx)
    const signal = new AbortController().signal
    new HostConnectionService(ctx, [], {})
    await ctx.plugin(TypertGatewayService, {})
    // Resolve external codecs from the actual extracted host, as profile
    // plugins do, rather than depending on the packing directory's modules.
    const reflectionOutput = await build({ entryPoints: [pluginLib ? path.join(pluginLib, 'typert.host.js') : fileURLToPath(new URL('../lib/typert.host.js', import.meta.url))], bundle: true, packages: 'external', write: false, platform: 'node', format: 'esm', target: 'node22' })
    const reflectionPath = path.join(work, 'dsh/scheduled-reflection.mjs')
    fs.writeFileSync(reflectionPath, reflectionOutput.outputFiles[0].contents)
    const { TYPERT: pluginTypert } = await import(pathToFileURL(reflectionPath).href)
    ctx.typert.register(pluginTypert)
    const descriptor = ctx.typert.local.get('wechatSchedules/control')
    assert(descriptor, 'final generated reflection must register our Remote')
    assert.equal(descriptor.service, 'wechatSchedules')
    assert.equal(descriptor.cancellation.parameter, 'signal')
    const call = async (action, input = {}) => {
      const response = await ctx.typertGateway.invoke({ namespace: 'wechatSchedules', method: 'control',
        args: { request: { action, inputJson: JSON.stringify(input) } }, signal })
      assert.equal(response.ok, true, JSON.stringify(response))
      return JSON.parse(response.valueJson)
    }
    await ctx.plugin(remoteEvents)
    streamLife = new AbortController()
    const empty = { async *[Symbol.asyncIterator]() {} }
    const stream = (await ctx.typertGateway.wireStream.open('$events', { args: {} }, empty, undefined, streamLife.signal))[Symbol.asyncIterator]()
    assert.equal((await stream.next()).value.type, 'ready')
    const wireFrames = []
    streamPump = (async () => { for (;;) { const value = await stream.next(); if (value.done) break; wireFrames.push(value.value) } })()
    streamPump.catch(() => {})
    const waitWire = async predicate => {
      const until = Date.now() + 2000
      while (!predicate()) {
        assert(Date.now() < until, 'expected official Remote wire event did not arrive')
        await new Promise(resolve => setTimeout(resolve, 5))
      }
    }
    // Keep unrelated workspace browsing synthetic and inert, while the
    // Schedule RPC and official Host event stream above remain genuine.
    const nativeGateway = ctx.typertGateway
    const compatibilityHost = {
      on: (...args) => ctx.on(...args),
      get(name) {
        if (name !== 'typertGateway') return ctx.get(name)
        return { invoke: request => nativeGateway.invoke(request), wireStream: nativeGateway.wireStream,
          stream: async request => {
            assert.equal(request.namespace, 'workspace'); assert.equal(request.method, 'follow')
            return { async *[Symbol.asyncIterator]() {
              yield { type: 'baseline' }
              if (!request.signal.aborted) await new Promise(resolve => request.signal.addEventListener('abort', resolve, { once: true }))
            } }
          } }
      },
    }
    const phoneFrames = []
    const phone = { readyState: 1, bufferedAmount: 0, send(value) { phoneFrames.push(JSON.parse(value)) }, close() { this.readyState = 3 } }
    compatibility = new DshRealtimeCompatibility(compatibilityHost)
    compatibility.connect('/api/events.host', phone)
    const phoneChanges = () => phoneFrames.filter(frame => frame.payload?.event === 'wechatSchedules/changed')
    const events = []; ctx.on('wechatSchedules/changed', value => events.push(value))
    assert.equal((await call('status')).enabled, false)
    const fork = ctx.plugin(ScheduleService, {}); await fork
    assert.equal((await call('status')).enabled, true)
    await waitWire(() => phoneChanges().some(frame => frame.payload.args[0].enabled === true))
    const rule = { title: 'Synthetic future reminder', prompt: 'Synthetic instruction; never execute',
      at: { date: '2099-01-01', time: '09:00:00', time_zone: 'Asia/Shanghai' } }
    const created = await call('create', { sessionId: 'synthetic-session', request: rule })
    await waitWire(() => wireFrames.some(frame => frame.type === 'emit' && frame.event === 'schedule/changed'))
    assert.equal(created.kind, 'at'); assert.equal(created.scheduledAt, '2099-01-01T01:00:00.000Z')
    assert.equal((await ctx.schedule.catalog()).length, 1)
    let view = await call('detail', { sessionId: 'synthetic-session', id: created.id })
    const schema = TYPERT.invocations.find(value => value.method === 'update').parameters[0].codec.create()
    const update = { sessionId: 'synthetic-session', id: created.id, expected: view.expected, title: 'Updated synthetic reminder', change: { kind: 'daily', daily: { time: '09:30:00', time_zone: 'Asia/Shanghai' } } }
    assert(schema.safeParse(update).success)
    const updated = await call('update', update); assert.equal(updated.updated, true); assert.equal(updated.record.kind, 'daily')
    assert.equal((await call('update', { ...update, title: 'Cannot overwrite conflict' })).code, 'schedule_conflict')
    const history = await call('history', { sessionId: 'synthetic-session', id: created.id, limit: 20 })
    assert.deepEqual(history.records, []); assert.equal(history.retention.days, 30)
    assert.equal((await call('history', { sessionId: 'wrong-session', id: created.id })).code, 'schedule_not_found')
    const catalogue = await call('catalog'); assert.equal(catalogue.total, 1); assert(!Object.hasOwn(catalogue.items[0], 'prompt'))
    assert.deepEqual(await call('sessionFlags', { sessionIds: ['synthetic-session', 'missing'] }), { sessionIds: ['synthetic-session'] })
    // Seed an already-delivered synthetic receipt using native domain writes:
    // this tests read semantics, not scheduler execution or model completion.
    const table = ctx.storageDomain.get('schedule').table('tasks')
    const saved = table.get(created.id), receipt = { scheduledAt: '2026-01-01T01:00:00.000Z', deliveredAt: '2026-01-01T01:00:01.000Z', messageId: 'synthetic-message' }
    await table.put(created.id, { ...saved, status: 'inactive', lastDelivery: receipt, deliveryHistory: { records: [{ ...receipt, prompt: saved.record.prompt }], earlierRecordsUnavailable: false } })
    assert.equal((await call('catalog', { status: 'inactive' })).total, 1)
    assert.deepEqual(await call('sessionFlags', { sessionIds: ['synthetic-session'] }), { sessionIds: [] })
    assert.equal((await call('history', { sessionId: 'synthetic-session', id: created.id })).records[0].messageId, receipt.messageId)
    view = await call('detail', { sessionId: 'synthetic-session', id: created.id })
    assert.equal((await call('update', { sessionId: 'synthetic-session', id: created.id, expected: view.expected, title: 'No inactive update' })).code, 'schedule_ended')
    assert.equal((await call('delete', { sessionId: 'wrong-session', id: created.id })).deleted, false)
    assert.equal((await call('delete', { sessionId: 'synthetic-session', id: created.id })).deleted, true)
    assert.equal((await call('history', { sessionId: 'synthetic-session', id: created.id })).code, 'schedule_not_found')
    await fork.dispose(); await new Promise(resolve => setImmediate(resolve))
    assert.equal((await call('status')).enabled, false)
    await waitWire(() => phoneChanges().at(-1)?.payload.args[0].enabled === false)
    assert(events.some(value => value.enabled === true)); assert.equal(events.at(-1).enabled, false)
    assert(events.every(value => Object.keys(value).length === 1 && typeof value.enabled === 'boolean'))
    const secondFork = ctx.plugin(ScheduleService, {}); await secondFork
    assert.equal((await call('status')).enabled, true)
    await waitWire(() => phoneChanges().at(-1)?.payload.args[0].enabled === true)
    assert.equal((await call('catalog')).total, 0, 'reopening does not restore deleted tasks')
    // Exercise the real native timer: no time travel, direct runtime calls or
    // seeded receipt. Only the terminal Agent inbox is a synthetic receiver.
    allowSyntheticDispatch = true
    const nativeEventsBeforeDue = wireFrames.filter(frame => frame.event === 'schedule/changed').length
    const due = await call('create', { sessionId: syntheticSession.id,
      request: { title: 'Synthetic native timer', prompt: 'SYNTHETIC_TIMER_INBOX_ONLY', after_seconds: 1 } })
    assert.equal(due.kind, 'after')
    let dueHistory
    const deliveryDeadline = Date.now() + 5000
    for (;;) {
      dueHistory = await call('history', { sessionId: syntheticSession.id, id: due.id, limit: 20 })
      if (dueHistory.records.length === 1) break
      assert(Date.now() < deliveryDeadline, 'native timer did not commit its synthetic inbox receipt')
      await new Promise(resolve => setTimeout(resolve, 20))
    }
    assert.equal(fakeAgentResolutions, 1); assert.equal(fakeInboxFlushes, 1)
    assert.equal(inbox.length, 1); assert.equal(inbox[0].source.kind, 'schedule')
    assert(inbox[0].content.some(part => part.type === 'text' && part.text.includes('SYNTHETIC_TIMER_INBOX_ONLY')))
    assert.equal(dueHistory.records[0].messageId, inbox[0].id)
    assert.equal(dueHistory.records[0].scheduledAt, due.scheduledAt)
    assert(Date.parse(dueHistory.records[0].deliveredAt) >= Date.parse(due.scheduledAt))
    assert.deepEqual(JSON.parse(fs.readFileSync(inboxFile, 'utf8')), inbox)
    const dueCatalogue = await call('catalog')
    assert.equal(dueCatalogue.total, 1); assert.equal(dueCatalogue.items[0].status, 'inactive')
    assert.equal(dueCatalogue.items[0].lastDelivery.messageId, inbox[0].id)
    assert.deepEqual(await ctx.schedule.list({ sessionId: syntheticSession.id }), [])
    assert.deepEqual(await call('sessionFlags', { sessionIds: [syntheticSession.id] }), { sessionIds: [] })
    await waitWire(() => wireFrames.filter(frame => frame.event === 'schedule/changed').length >= nativeEventsBeforeDue + 2)
    allowSyntheticDispatch = false
    assert.equal((await call('delete', { sessionId: syntheticSession.id, id: due.id })).deleted, true)
    assert.equal((await call('catalog')).total, 0)
    await secondFork.dispose(); await new Promise(resolve => setImmediate(resolve))
    assert.equal((await call('status')).enabled, false)
    await waitWire(() => phoneChanges().at(-1)?.payload.args[0].enabled === false)
    assert(phoneChanges().every(frame => frame.type === 'server-event' && frame.payload.type === 'host/remote-event'
      && Object.keys(frame.payload.args[0]).length === 1 && typeof frame.payload.args[0].enabled === 'boolean'))
    const beforeDispose = phoneFrames.length
    compatibility.dispose()
    ctx.emit('wechatSchedules/changed', { enabled: true })
    await new Promise(resolve => setImmediate(resolve))
    assert.equal(phoneFrames.length, beforeDispose, 'disposed phone bridge must remove its listener')
    // The actual Host event source has a deliberate allowlist. Generated
    // documentation.events is NOT permission to forward arbitrary events.
    // Native Schedule changes reach the peer, our local adapter invalidations
    // do not: the owning phone transport must bridge those minimal events.
    assert(remoteEvents.API_REMOTE_FORWARDED_EVENTS.some(value => value.event === 'schedule/changed'))
    assert(!remoteEvents.API_REMOTE_FORWARDED_EVENTS.some(value => value.event === 'wechatSchedules/changed'))
    assert(wireFrames.filter(frame => frame.event === 'schedule/changed').length >= 3)
    assert(!wireFrames.some(frame => frame.event === 'wechatSchedules/changed'))
    streamLife.abort(); await streamPump.catch(() => {})
    assert.equal(networkCalls, 0); assert.equal(agentActivations, 0)
    console.log(JSON.stringify({ passed: true, installedDsh: JSON.parse(fs.readFileSync(anchor, 'utf8')).version,
      plugin: pluginEntry ? 'packaged service, realtime bridge and reflection' : 'source service/realtime bridge and generated reflection',
      scenarios: ['native disabled/enabled lifecycle', 'native durable create', 'native CAS update/conflict', 'history delivery-not-completion', 'exact session binding', 'catalog/filter/flags', 'inactive update refusal', 'native delete with history', 'hot-unload event and capability', 'final generated TYPERT through actual Gateway', 'official native Remote wire events and explicit custom-event boundary', 'actual phone compatibility peer receives mount/change/unmount and disposes listener', 'real native timer delivers once to a fake Agent inbox and commits native history/inactive state'],
      wire: { nativeScheduleEvents: wireFrames.filter(frame => frame.event === 'schedule/changed').length, customEventsForwardedByOfficialHost: false, phoneBridgeInvalidations: phoneChanges().length, ownerAuthentication: 'outside this isolated bridge test' },
      nativeTimer: { fakeAgentResolutions, fakeInboxFlushes, deliveredMessages: inbox.length,
        receiver: 'synthetic; no model or real Session log', receiptSeeded: false },
      networkCalls, agentActivations, liveProfilesTouched: false }, null, 2))
  }
} finally {
  compatibility?.dispose()
  streamLife?.abort()
  if (streamPump) await streamPump.catch(() => {})
  if (ctx) await ctx.fiber.dispose()
  globalThis.fetch = originalFetch
  if (fd !== undefined) fs.closeSync(fd)
  if (!stage) fs.rmSync(work, { recursive: true, force: true })
}
