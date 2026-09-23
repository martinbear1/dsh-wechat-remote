/** Verify a restored DSH through the same independent native control adapter.
 * Also supports restoring an already-broken plugin, without claiming it is fixed.
 * Bundled outside the profile so neither a failed add nor rollback removes it. */
import fs from 'node:fs'
import path from 'node:path'
import { randomBytes } from 'node:crypto'
import { attachControl, waitForJson } from './native-control.mjs'

export async function verifyNativeRestore(job, start, sessionIds, readableIds) {
  const directory = path.join(job.home, 'harness-remote-updates', randomBytes(16).toString('hex'))
  fs.mkdirSync(directory, { mode: 0o700 })
  fs.writeFileSync(path.join(directory, 'package.json'), '{"type":"module"}\n', { mode: 0o600 })
  const helper = path.join(directory, 'install-control.js'), token = randomBytes(24).toString('hex')
  fs.copyFileSync(path.join(job.directory, 'install-control.js'), helper)
  const remove = attachControl(job.profile, helper, { directory, token, pnpm: job.pnpm })
  let ref
  const request = async (method, payload = {}) => {
    const response = await fetch(ref.origin + '/' + method, { method: 'POST', headers: {
      authorization: `Bearer ${token}`, 'content-type': 'application/json',
    }, body: JSON.stringify(payload), redirect: 'error', signal: AbortSignal.timeout(12000) })
    const value = await response.json()
    if (!response.ok) throw new Error('原 DSH 恢复检查未通过。')
    return value
  }
  try {
    const child = start()
    ref = await waitForJson(path.join(directory, 'control-ready.json'), value =>
      Number.isInteger(value.pid) && value.pid > 0 && (!child || value.pid === child.pid)
      && /^http:\/\/127\.0\.0\.1:[1-9]\d{0,4}$/.test(value.origin), 180000)
    const host = await request('describe')
    if (host.pid !== ref.pid || host.home !== job.home || host.profile !== job.profile
      || host.cli !== job.cli || host.dshVersion !== job.dshVersion || host.pluginVersion !== job.previousVersion) {
      throw new Error('恢复后的 DSH 身份不匹配。')
    }
    const items = (await request('read', { method: 'session.list' })).items
    if (!Array.isArray(items) || JSON.stringify(items.map(s => s.sessionId).sort()) !== JSON.stringify(sessionIds)) {
      throw new Error('恢复后的会话列表不一致。')
    }
    for (const sessionId of readableIds) await request('read', { method: 'session.history', payload: { sessionId, maxMessages: 1 } })
  } finally {
    try { remove() }
    finally { if (ref) { try { await request('close') } catch {} } }
  }
}
