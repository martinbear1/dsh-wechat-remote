/** Test-only operator in a newly created, synthetic DSH home. Never packaged. */
import http from 'node:http'
import fs from 'node:fs'

export const inject = ['sessionController', 'pluginManager', 'connection']
export async function apply(ctx) {
  const config = JSON.parse(fs.readFileSync(new URL('./probe.json', import.meta.url), 'utf8'))
  let installResult
  // Observe the host's public progress/recovery API. Never wrap installBundle
  // or replace the manager/updater; completed native outcomes are not retained.
  ctx.on('plugin-manager/install-state', event => {
    if (event.phase === 'installing' && !installResult) {
      installResult = ctx.get('pluginManager').waitForInstall(event.requestId)
    }
  })
  const server = http.createServer(async (req, res) => {
    if (req.headers.authorization !== `Bearer ${config.auth}`) { res.writeHead(403); res.end(); return }
    try {
      let value
      if (req.url === '/snapshot' && req.method === 'GET') {
        const host = ctx.get('wechatHost')
        value = { fixtureId: config.fixtureId, pid: process.pid,
          described: host ? await host.describe({}, AbortSignal.timeout(5000)) : null,
          bundles: await ctx.get('pluginManager').listBundles(),
          sessions: await ctx.get('sessionController').list({}, AbortSignal.timeout(5000)),
          entries: [...ctx.get('loader').entries()].map(entry => ({ id: entry.options.id, state: entry.fiber?.state })),
        }
      } else if (req.url === '/seed' && req.method === 'POST') {
        value = await ctx.get('sessionController').create({ cwd: config.root, sessionId: config.sessionId, agentPreset: 'standard' })
        if (!await ctx.get('sessions').flush(ctx.get('sessions').get(value.sessionId))) throw Error('fixture session was not persisted')
      } else if (req.url === '/authenticate' && req.method === 'POST') {
        // Exchange the real host's process token for its ordinary browser cookie.
        // The harness keeps this value in memory and never prints it in reports.
        value = { url: ctx.get('connection').authenticatedUrl(config.origin) }
      } else if (req.url === '/inspect-latest' && req.method === 'GET') {
        value = await ctx.get('pluginManager').inspect('dsh-wechat-remote@latest')
      } else if (req.url === '/native-result' && req.method === 'GET') {
        value = installResult ? await installResult : null
      } else if (req.url === '/exit' && req.method === 'POST') {
        value = { stopping: true, fixtureId: config.fixtureId, pid: process.pid }
        setTimeout(() => ctx.get('appExit')(0), 30)
      } else { res.writeHead(404); res.end(); return }
      res.setHeader('content-type', 'application/json'); res.end(JSON.stringify(value))
    } catch (error) { res.writeHead(500); res.end(JSON.stringify({ error: String(error.stack || error) })) }
  })
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(config.port, '127.0.0.1', resolve) })
  ctx.effect(() => () => new Promise(resolve => { server.close(resolve); server.closeAllConnections() }))
}
