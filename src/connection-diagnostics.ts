/** Read-only probes use the host's fetch/dispatcher, never enrollment or a business WebSocket. */
import {
  CONNECTION_SYSTEM_CODES, diagnosticField, sanitizeConnectionFailure, sanitizeConnectionReport,
  type SafeFailure, type ConnectionDiagnosticContext, type ConnectionDiagnosticReport,
  type ConnectionDiagnosticCheck,
} from './connection-diagnostic-contract.js'

export const CONNECTION_DIAGNOSTIC_TIMEOUT_MS = 8_000
export const CONNECTION_DIAGNOSTIC_MAX_BYTES = 16_384

export function connectionHttpFailure(status: number): SafeFailure {
  if (!Number.isInteger(status) || status < 100 || status > 599) return { code: 'unknown' }
  return { code: status === 407 ? 'proxy-auth-required' : status === 429 ? 'rate-limited'
    : status >= 500 ? 'server-error' : status >= 400 ? 'request-rejected' : 'invalid-response', httpStatus: status }
}

/** A bounded walk of standard cause/AggregateError fields; raw strings never escape. */
export function classifyConnectionFailure(error: unknown): SafeFailure {
  const pending: { value: unknown; depth: number }[] = [{ value: error, depth: 0 }]
  const seen = new Set<unknown>()
  for (let index = 0; index < pending.length && index < 32; index += 1) {
    const { value, depth } = pending[index]
    if (!value || typeof value !== 'object' || seen.has(value)) continue
    seen.add(value)
    const code = diagnosticField(value, 'code'), status = diagnosticField(value, 'status')
    if (typeof code === 'string' && Object.hasOwn(CONNECTION_SYSTEM_CODES, code)) return { code: CONNECTION_SYSTEM_CODES[code], systemCode: code }
    if (typeof status === 'number' && status >= 300 && status <= 599) return connectionHttpFailure(status)
    if (code === 'invalid-response') return { code: 'invalid-response',
      ...(typeof status === 'number' && Number.isInteger(status) && status >= 100 && status <= 599 ? { httpStatus: status } : {}) }
    if (diagnosticField(value, 'name') === 'AbortError') return { code: 'cancelled' }
    if (diagnosticField(value, 'name') === 'TimeoutError') return { code: 'timeout' }
    if (depth >= 4) continue
    pending.push({ value: diagnosticField(value, 'cause'), depth: depth + 1 })
    const errors = diagnosticField(value, 'errors')
    try {
      if (Array.isArray(errors)) {
        for (let i = 0; i < Math.min(errors.length, 8) && pending.length < 32; i += 1) {
          try { pending.push({ value: errors[i], depth: depth + 1 }) } catch { /* Tolerate malformed entries. */ }
        }
      }
    } catch { /* A proxy/getter must not make error classification itself fail. */ }
  }
  return { code: 'unknown' }
}

function healthTarget(relayOrigin: string): string {
  // Only the trusted persisted origin is accepted by the caller, never request parameters.
  // Do not normalize paths/credentials into a seemingly approved target.
  if (typeof relayOrigin !== 'string' || relayOrigin.length > 2048 || relayOrigin.trim() !== relayOrigin) throw { code: 'invalid-response' }
  let target: URL
  try { target = new URL(relayOrigin) } catch { throw { code: 'invalid-response' } }
  if (target.protocol !== 'https:' || target.username || target.password || target.port || target.search || target.hash
    || (target.pathname !== '/' && target.pathname !== '') || !target.hostname) throw { code: 'invalid-response' }
  return target.origin + '/healthz'
}

function cancelBody(body: ReadableStream<Uint8Array> | null): void {
  try { void body?.cancel().catch(() => {}) } catch { /* Do not mask the original result. */ }
}

/** Race even injected fetch/stream implementations that do not honor AbortSignal. */
function bounded<T>(operation: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) {
    void operation.catch(() => {})
    return Promise.reject(new DOMException('Cancelled', 'AbortError'))
  }
  return new Promise<T>((resolve, reject) => {
    const abort = () => { cleanup(); reject(new DOMException('Cancelled', 'AbortError')) }
    const cleanup = () => signal.removeEventListener('abort', abort)
    signal.addEventListener('abort', abort, { once: true })
    operation.then(value => { cleanup(); resolve(value) }, error => { cleanup(); reject(error) })
  })
}

async function healthCheck(target: string, fetchImpl: typeof fetch, signal: AbortSignal): Promise<SafeFailure | undefined> {
  const responsePromise = fetchImpl(target, {
    method: 'GET', redirect: 'manual', credentials: 'omit', cache: 'no-store',
    headers: { accept: 'application/json' }, signal,
  })
  // If a fetch implementation ignores cancellation and returns late, discard its body.
  void responsePromise.then(response => { if (signal.aborted) cancelBody(response.body) }, () => {})
  const response = await bounded(responsePromise, signal)
  if (!response.ok) { cancelBody(response.body); return connectionHttpFailure(response.status) }
  const length = response.headers.get('content-length'), contentType = response.headers.get('content-type') || ''
  if (response.redirected || !/^application\/json(?:\s*;|\s*$)/i.test(contentType)
    || (length !== null && (!/^\d+$/.test(length) || Number(length) > CONNECTION_DIAGNOSTIC_MAX_BYTES)) || !response.body) {
    cancelBody(response.body); return { code: 'invalid-response' }
  }
  const reader = response.body.getReader(), chunks: Uint8Array[] = []
  let bytes = 0, emptyChunks = 0
  try {
    while (true) {
      const part = await bounded(reader.read(), signal)
      if (part.done) break
      // Empty chunks must not grow the array or starve the deadline with resolved reads.
      if (part.value.byteLength === 0) {
        if (++emptyChunks > 32) return { code: 'invalid-response' }
        continue
      }
      bytes += part.value.byteLength
      if (bytes > CONNECTION_DIAGNOSTIC_MAX_BYTES) return { code: 'invalid-response' }
      chunks.push(part.value)
    }
    let payload: unknown
    try { payload = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks))) }
    catch { return { code: 'invalid-response' } }
    const version = diagnosticField(payload, 'version')
    if (diagnosticField(payload, 'ok') !== true || typeof version !== 'string' || !/^[0-9][0-9A-Za-z.-]{0,63}$/.test(version)) return { code: 'invalid-response' }
    return undefined
  } finally {
    // A broken stream may never fulfill cancel(); this must not defeat our deadline.
    void reader.cancel().catch(() => {})
    try { reader.releaseLock() } catch { /* Pending read is already bounded/cancelled. */ }
  }
}

export interface ConnectionDiagnosticOptions {
  relayOrigin: string
  fetch?: typeof fetch
  signal?: AbortSignal
  context: ConnectionDiagnosticContext
}

export async function runConnectionDiagnostics(options: ConnectionDiagnosticOptions): Promise<ConnectionDiagnosticReport> {
  const started = Date.now()
  const context = options.context
  // Project immediately: callers may update their status while the probe is in flight.
  const report = sanitizeConnectionReport({
    schema: 1, source: 'plugin', startedAt: new Date(started).toISOString(),
    pluginRunningVersion: context.pluginVersion, dshVersion: context.dshVersion,
    platform: context.platform, profileKind: context.profileKind, relayEnabled: context.relayEnabled,
    relayState: context.relayState, qrKind: context.qrKind, lastPairingAttempt: context.lastPairingAttempt,
    checks: [
      { id: 'local-plugin', status: 'pass' },
      { id: 'relay-health', status: 'not-tested' },
      { id: 'agent-connection', status: context.relayEnabled === true && context.relayState === 'online' ? 'pass' : 'not-tested' },
    ],
  })!
  const check: ConnectionDiagnosticCheck = report.checks[1]
  if (options.signal?.aborted) { Object.assign(check, { status: 'cancelled', code: 'cancelled' }); return report }
  if (!report.relayEnabled) return report
  const controller = new AbortController()
  let timedOut = false
  const abort = () => controller.abort()
  options.signal?.addEventListener('abort', abort, { once: true })
  const timer = setTimeout(() => { timedOut = true; controller.abort() }, CONNECTION_DIAGNOSTIC_TIMEOUT_MS)
  try {
    const result = await healthCheck(healthTarget(options.relayOrigin), options.fetch || globalThis.fetch, controller.signal)
    if (controller.signal.aborted) throw new DOMException('Cancelled', 'AbortError')
    if (result) Object.assign(check, { status: 'fail' }, sanitizeConnectionFailure(result))
    else check.status = 'pass'
  } catch (error) {
    const failure: SafeFailure = timedOut ? { code: 'timeout' } : controller.signal.aborted ? { code: 'cancelled' }
      : classifyConnectionFailure(error)
    Object.assign(check, { status: failure.code === 'cancelled' ? 'cancelled' : 'fail' }, failure)
  } finally {
    clearTimeout(timer)
    options.signal?.removeEventListener('abort', abort)
    check.durationMs = Math.max(0, Math.min(20_000, Date.now() - started))
  }
  return report
}
