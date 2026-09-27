/** Executes the official Electron-independent recovery state machine from an
 * explicitly selected upstream checkout. Dialog/stop operations are doubles;
 * this is NOT an installed Desktop UI or future-version certification. */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import path from 'node:path'
import { build } from 'esbuild'

assert(process.env.HARNESS_UPSTREAM_SOURCE, 'HARNESS_UPSTREAM_SOURCE required')
async function official(relative) {
  const output = await build({ entryPoints: [path.join(process.env.HARNESS_UPSTREAM_SOURCE, relative)],
    bundle: true, write: false, platform: 'node', format: 'esm', logLevel: 'silent' })
  return import('data:text/javascript;base64,' + Buffer.from(output.outputFiles[0].text).toString('base64'))
}
const { DesktopFatalRecovery } = await official('apps/desktop/src/fatal-recovery.ts')
const { resolveDesktopLocale } = await official('apps/desktop/src/locale.ts')
const messages = resolveDesktopLocale('zh-CN').messages

test('official fatal recovery is accessible without a functioning plugin or renderer', async () => {
  const order = [], dialogs = []
  const recovery = new DesktopFatalRecovery({ messages: () => messages,
    writeReport: async () => undefined,
    show: async options => { dialogs.push(options); return { response: 2 } },
    stop: async () => { order.push('host-stopped') },
    disablePlugins: async () => { order.push('profile-sanitized') },
    restart: () => order.push('native-relaunch'), exit: () => order.push('exit'),
  })
  await recovery.report(new Error('plugin dependency no longer exports required API'), 'host')
  assert(dialogs[0].buttons.includes(messages.disableThirdPartyPlugins))
  assert.deepEqual(order, ['host-stopped', 'profile-sanitized', 'native-relaunch'])
})

test('official recovery waits for backend exit before changing plugin activation', async () => {
  let stopped, opened
  const stop = new Promise(resolve => { stopped = resolve })
  const shown = new Promise(resolve => { opened = resolve })
  const order = []
  const recovery = new DesktopFatalRecovery({ messages: () => messages, writeReport: async () => undefined,
    show: async () => { opened(); return { response: 2 } }, stop: () => stop,
    disablePlugins: async () => { order.push('disable') }, restart: () => order.push('restart'), exit() {},
  })
  const work = recovery.report(new Error('host failed'), 'host')
  await shown
  await Promise.resolve()
  assert.deepEqual(order, [])
  stopped()
  await work
  assert.deepEqual(order, ['disable', 'restart'])
})

test('port conflict offers restart/exit, not destructive plugin recovery', async () => {
  const recovery = new DesktopFatalRecovery({ messages: () => messages, writeReport: async () => undefined,
    show: async options => { assert.deepEqual(options.buttons, [messages.exitApplication, messages.restartApplication]); return { response: 0 } },
    stop: async () => {}, disablePlugins: async () => assert.fail('must not disable'), restart: () => assert.fail('must not restart'), exit() {},
  })
  await recovery.report(new Error('listen EADDRINUSE: address already in use'), 'host')
})

test('failed recovery is reported and does not pretend the app restarted', async t => {
  t.mock.method(console, 'error', () => {})
  const dialogs = []
  let exited = false
  const recovery = new DesktopFatalRecovery({ messages: () => messages, writeReport: async () => undefined,
    show: async options => { dialogs.push(options); return { response: dialogs.length === 1 ? 2 : 0 } },
    stop: async () => {}, disablePlugins: async () => { throw Error('profile is read-only') },
    restart: () => assert.fail('must not restart'), exit: () => { exited = true },
  })
  await recovery.report(new Error('host failed'), 'host')
  assert.equal(dialogs[1].message, messages.recoveryOperationFailed)
  assert.match(dialogs[1].detail, /profile is read-only/)
  assert(exited)
})
