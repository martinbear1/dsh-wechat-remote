/** One-operation control channel hosted by DSH's native plugin context. */
import fs from 'node:fs'
import path from 'node:path'
import http from 'node:http'
import type { Context } from '@deepseek-ai/cordis'
import { adapterDshHome, resolveDshWebRuntime } from './dsh-runtime.js'
import { resolveAgentProfileScope, gateStatePathForProfile, loadAgentDescriptor, defaultAgentIdentityPath } from './agent-metadata.js'
import { deriveGatePorts } from './gate-ports.js'
import { resolveTypertGateway, invokeLegacyRpc } from './dsh-protocol-compat.js'
import { currentHostManager, startUpdateWorker } from './install-lifecycle.js'
import { writePrivateJsonAtomic } from './secure-file.js'
import { homedir } from 'node:os'

export interface InstallControlConfig { directory: string; token: string; pnpm: string }
export async function quiesceNativeHost(ctx: Context, read: (method: string) => Promise<any>, disposing: () => void): Promise<void> {
  const items = (await read('session.list')).items
  if (!Array.isArray(items) || items.some((s: any) => s.running !== false)) throw new Error('请等待运行中的会话结束后再更新。')
  const sessions = ctx.get('sessions') as any
  if (!sessions?.list || !sessions.flush) throw new Error('当前 DSH 不支持保存检查。')
  for (const session of sessions.list()) if (!await sessions.flush(session)) throw new Error('会话保存未完成。')
  if ((await read('session.list')).items.some((s: any) => s.running !== false)) throw new Error('有新会话开始运行，请稍后重试。')
  disposing()
  await ctx.fiber.dispose()
}
export async function createInstallControl(context: Context, config: InstallControlConfig): Promise<{ origin: string; close(): void }> {
  const ctx = context.root
  const home = adapterDshHome(), id = path.basename(config.directory)
  if (!/^[a-f0-9]{32}$/.test(id) || !/^[a-f0-9]{48}$/.test(config.token)
    || path.dirname(config.directory) !== path.join(home, 'harness-remote-updates')
    || fs.realpathSync(config.directory) !== config.directory) throw new Error('安装控制请求不属于当前 DSH。')
  const scope = resolveAgentProfileScope('', process.argv, home), profile = path.join(home, 'profiles', scope)
  const cli = fs.realpathSync(process.argv[1])
  const manifest = JSON.parse(fs.readFileSync(path.resolve(cli, '../../package.json'), 'utf8'))
  if (manifest.name !== '@deepseek-ai/dsh' || process.execArgv.length || !process.argv.includes('web')) throw new Error('此 DSH 启动方式尚不支持自动更新。')
  const manager = currentHostManager(), webPort = resolveDshWebRuntime(ctx, process.env).port
  const ports = deriveGatePorts(scope, loadAgentDescriptor().agentInstanceId)
  const nativeExit = ctx.get('appExit') as ((code: number) => void) | undefined
  const gateway = resolveTypertGateway(ctx)
  let launched = false, quiesced = false
  const read = async (method: string, payload = {}): Promise<any> => {
    if (!['session.list', 'session.history'].includes(method)) throw new Error('不支持的安装检查')
    const request = { type: 'client-request' as const, rpcId: 'installer-read', method, payload }
    const response = gateway
      ? await invokeLegacyRpc(gateway, request, { signal: AbortSignal.timeout(10000), describeHost: () => ({}) })
      : await (await fetch(`http://127.0.0.1:${webPort}/api/${method}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(request), signal: AbortSignal.timeout(10000), redirect: 'error' })).json() as any
    if (!response.result?.ok) throw new Error('无法验证 DSH 会话状态，未停止节点。')
    return response.result.value
  }
  const version = () => {
    try { return JSON.parse(fs.readFileSync(path.join(profile, 'node_modules/@harness-remote/dsh-wechat-remote/package.json'), 'utf8')).version }
    catch { return '0.0.0' }
  }
  const server = http.createServer(async (req, res) => {
    const json = (status: number, value: unknown) => { res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' }); res.end(JSON.stringify(value)) }
    if (!['127.0.0.1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress || '')
      || req.headers.host !== `127.0.0.1:${(server.address() as any).port}` || req.headers['x-forwarded-for']
      || req.headers.authorization !== `Bearer ${config.token}` || req.method !== 'POST') return json(403, {})
    try {
      let body = ''
      for await (const chunk of req) { body += chunk.toString(); if (body.length > 4096) throw new Error('请求过大') }
      const input = body ? JSON.parse(body) : {}
      if (req.url === '/describe') return json(200, { pid: process.pid, cli, executable: process.execPath,
        argv: process.argv.slice(1), execArgv: process.execArgv, cwd: process.cwd(), home, profile, webPort,
        stateFile: gateStatePathForProfile(scope, homedir(), home), identityFile: defaultAgentIdentityPath(), gatePort: ports.publicPort, localPort: ports.localPort, manager, dshVersion: manifest.version,
        pluginVersion: version(), platform: process.platform, arch: process.arch, quiesced })
      if (req.url === '/read' && !quiesced) return json(200, await read(input.method, input.payload))
      if (req.url === '/launch' && !launched && !quiesced) {
        const filename = path.join(config.directory, 'job.json')
        const job = JSON.parse(fs.readFileSync(filename, 'utf8'))
        if (job.id !== id || job.controlOrigin !== origin || job.statusToken !== config.token || job.parentPid !== process.pid
          || job.home !== home || job.profile !== profile || job.cli !== cli || job.pnpm !== config.pnpm) throw new Error('安装目标发生变化')
        startUpdateWorker(manager, config.directory, process.execPath); launched = true
        return json(200, { started: true })
      }
      if (req.url === '/quiesce' && launched && !quiesced) {
        // Native disposal closes every transport and flushes every service,
        // including old plugins with no updater-aware public-transport fence.
        // The private control server deliberately survives this one disposal.
        await quiesceNativeHost(ctx, read, () => { quiesced = true })
        return json(200, { quiesced: true, pid: process.pid })
      }
      if (req.url === '/shutdown' && quiesced) {
        json(200, { stopping: true })
        setTimeout(() => { close(); if (nativeExit) nativeExit(0); else process.exit(0) }, 50)
        return
      }
      if (req.url === '/close' && !quiesced) { json(200, { closed: true }); close(); return }
      json(409, { error: '安装状态不允许此操作' })
    } catch (error) { json(409, { error: error instanceof Error ? error.message : '安装控制失败' }) }
  })
  await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve) })
  const origin = `http://127.0.0.1:${(server.address() as any).port}`
  const timer = setTimeout(() => { if (!launched) close() }, 120000)
  timer.unref()
  function close() { clearTimeout(timer); server.closeAllConnections(); server.close() }
  writePrivateJsonAtomic(path.join(config.directory, 'control-ready.json'), { origin, pid: process.pid })
  return { origin, close }
}

/** Loaded temporarily through the official profile patch/HMR extension point. */
export const apply = async (ctx: Context, config: InstallControlConfig): Promise<void> => {
  await createInstallControl(ctx, config)
}
export const inject = ['webServer', 'sessions', 'appExit']
