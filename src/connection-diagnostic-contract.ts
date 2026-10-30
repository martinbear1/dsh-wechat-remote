/** Browser-safe, allowlisted diagnostic data. Never pass raw errors or URLs to UI. */
export type SafeFailureCode = 'dns' | 'connection-refused' | 'connection-reset' | 'network-unreachable'
  | 'timeout' | 'tls-validation' | 'proxy-auth-required' | 'request-rejected' | 'rate-limited'
  | 'server-error' | 'invalid-response' | 'cancelled' | 'unknown'
export interface SafeFailure { code: SafeFailureCode; systemCode?: string; httpStatus?: number }
/** Observation of QR credential issuance only, never a phone-claim/connection verdict. */
export interface PairingObservation extends Partial<SafeFailure> {
  status: 'running' | 'issued' | 'failed'
  startedAt: string
  finishedAt?: string
  serverCode?: string
  reason?: string
}
export const PAIRING_SERVER_CODES: Readonly<Record<string, string>> = Object.freeze({
  invalid_agent_proof: '云端未通过电脑身份校验',
  invalid_agent_key: '云端无法识别电脑身份公钥',
  agent_identity_unavailable: '云端暂时无法登记电脑身份',
  agent_revoked: '云端报告电脑身份已撤销',
  invalid_request: '云端认为申请内容不符合要求',
  unsupported_agent_proof: '云端不支持此身份校验版本',
  rate_limited: '配对凭据申请过于频繁',
  internal_error: '云端处理申请时发生异常',
})
export const PAIRING_PROOF_MESSAGES: Readonly<Record<string, string>> = Object.freeze({
  'Agent identity does not match proof': 'identity-mismatch',
  'Agent identity proof is expired or replayed': 'proof-expired-or-replayed',
  'Agent identity proof is invalid': 'proof-invalid',
  'Agent identity proof is replayed': 'proof-replayed',
})
const pairingReasonText: Readonly<Record<string, string>> = Object.freeze({
  'service-not-ready': '电脑端配对服务尚未就绪',
  'ticket-missing': '此次申请未取得首次配对凭据',
  'fetch-failed': '网络请求失败，底层未提供可识别的具体错误码',
  'identity-mismatch': '云端报告电脑身份与签名不一致',
  'proof-expired-or-replayed': '云端报告身份校验请求已过期或重复；请先核对电脑时间',
  'proof-invalid': '云端报告电脑身份签名校验未通过',
  'proof-replayed': '云端报告身份校验请求重复',
})
export type DiagnosticCheckId = 'local-plugin' | 'relay-health' | 'agent-connection'
export type DiagnosticCheckStatus = 'pass' | 'fail' | 'not-tested' | 'cancelled'
export interface ConnectionDiagnosticCheck extends Partial<SafeFailure> {
  id: DiagnosticCheckId
  status: DiagnosticCheckStatus
  durationMs?: number
}
export interface ConnectionDiagnosticContext {
  pluginVersion?: string
  dshVersion?: string
  platform?: string
  profileKind?: 'desktop' | 'web' | 'unknown'
  relayEnabled?: boolean
  relayState?: string
  pairingObservation?: PairingObservation
}
export interface ConnectionDiagnosticReport {
  schema: 1
  source: 'plugin'
  startedAt: string
  pluginRunningVersion: string
  dshVersion?: string
  platform: string
  profileKind: 'desktop' | 'web' | 'unknown'
  relayEnabled: boolean
  relayState: 'disabled' | 'enrolling' | 'connecting' | 'online' | 'offline' | 'unknown'
  checks: ConnectionDiagnosticCheck[]
  pairingObservation?: PairingObservation
}

export const DIAGNOSTIC_CHECK_IDS: readonly DiagnosticCheckId[] = ['local-plugin', 'relay-health', 'agent-connection']
export const CONNECTION_SYSTEM_CODES: Readonly<Record<string, SafeFailureCode>> = Object.freeze({
  EAI_AGAIN: 'dns', ENOTFOUND: 'dns', ECONNREFUSED: 'connection-refused', ECONNRESET: 'connection-reset',
  EPIPE: 'connection-reset', UND_ERR_SOCKET: 'connection-reset', ENETUNREACH: 'network-unreachable',
  EHOSTUNREACH: 'network-unreachable', ENETDOWN: 'network-unreachable', ETIMEDOUT: 'timeout',
  UND_ERR_CONNECT_TIMEOUT: 'timeout', UND_ERR_HEADERS_TIMEOUT: 'timeout', UND_ERR_BODY_TIMEOUT: 'timeout',
  CERT_HAS_EXPIRED: 'tls-validation', CERT_NOT_YET_VALID: 'tls-validation',
  DEPTH_ZERO_SELF_SIGNED_CERT: 'tls-validation', SELF_SIGNED_CERT_IN_CHAIN: 'tls-validation',
  UNABLE_TO_VERIFY_LEAF_SIGNATURE: 'tls-validation', UNABLE_TO_GET_ISSUER_CERT: 'tls-validation',
  UNABLE_TO_GET_ISSUER_CERT_LOCALLY: 'tls-validation', CERT_UNTRUSTED: 'tls-validation',
  CERT_REVOKED: 'tls-validation', ERR_TLS_CERT_ALTNAME_INVALID: 'tls-validation',
  ERR_TLS_CERT_SIGNATURE_ALGORITHM_UNSUPPORTED: 'tls-validation',
})
const failureText: Record<SafeFailureCode, readonly [string, string]> = {
  dns: ['无法解析服务域名', '请检查当前网络的域名解析，必要时联系网络管理员。'],
  'connection-refused': ['连接被拒绝', '请稍后重试，或请网络管理员检查访问策略。'],
  'connection-reset': ['连接意外中断', '请稍后重试；若持续发生，请联系网络管理员检查连接链路。'],
  'network-unreachable': ['网络不可达', '请确认电脑联网，或联系网络管理员。'],
  timeout: ['检查超时', '请确认电脑网络可用后重试；超时本身不能确定具体原因。'],
  'tls-validation': ['安全证书无法验证', '请联系网络管理员核查证书链和电脑时间；不要关闭证书验证。'],
  'proxy-auth-required': ['代理要求认证', '请联系网络管理员确认此应用的代理认证配置。'],
  'request-rejected': ['服务拒绝了请求', '请将诊断报告交给开发者；此状态不能单独判断账号、时钟或网络策略原因。'],
  'rate-limited': ['请求过于频繁', '请稍后再检查，避免连续发起检查。'],
  'server-error': ['服务暂时异常', '请稍后重试；若持续发生，请将报告交给开发者。'],
  'invalid-response': ['返回内容不符合预期', '可能收到登录页、重定向或异常内容；请将报告交给开发者。'],
  cancelled: ['检查已取消', '可在需要时重新检查。'],
  unknown: ['暂时无法确定原因', '请将诊断报告交给开发者，不必提供二维码或配对凭据。'],
}

function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}
/** Also handles hostile getters supplied by unexpected transport/error objects. */
export function diagnosticField(value: unknown, key: string): unknown {
  try { return record(value)[key] } catch { return undefined }
}
function choice<T extends string>(value: unknown, choices: readonly T[], fallback: T): T {
  return typeof value === 'string' && choices.includes(value as T) ? value as T : fallback
}
function safeVersion(value: unknown): string | undefined {
  return typeof value === 'string' && value.length <= 48
    && /^\d{1,4}\.\d{1,4}\.\d{1,4}(?:-(?:rc|alpha|beta|preview|dev|history)(?:[.-]\d{1,8})*)?$/.test(value) ? value : undefined
}
function safeTime(value: unknown): string | undefined {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)) return undefined
  const time = Date.parse(value)
  return Number.isFinite(time) && new Date(time).toISOString() === value ? value : undefined
}
export function sanitizeConnectionFailure(value: unknown): SafeFailure {
  const rawCode = diagnosticField(value, 'code')
  const code = typeof rawCode === 'string' && Object.hasOwn(failureText, rawCode) ? rawCode as SafeFailureCode : 'unknown'
  const result: SafeFailure = { code }
  const systemCode = diagnosticField(value, 'systemCode'), httpStatus = diagnosticField(value, 'httpStatus')
  if (typeof systemCode === 'string' && Object.hasOwn(CONNECTION_SYSTEM_CODES, systemCode)) result.systemCode = systemCode
  if (typeof httpStatus === 'number' && Number.isInteger(httpStatus) && httpStatus >= 100 && httpStatus <= 599) result.httpStatus = httpStatus
  return result
}
export function sanitizePairingObservation(value: unknown): PairingObservation | undefined {
  try {
    const status = diagnosticField(value, 'status'), startedAt = safeTime(diagnosticField(value, 'startedAt'))
    if (!startedAt || !['running', 'issued', 'failed'].includes(status as string)) return undefined
    const result: PairingObservation = { status: status as PairingObservation['status'], startedAt }
    if (status === 'running') return result
    const finishedAt = safeTime(diagnosticField(value, 'finishedAt'))
    if (!finishedAt) return undefined
    result.finishedAt = finishedAt
    if (status === 'failed') {
      Object.assign(result, sanitizeConnectionFailure(value))
      const serverCode = diagnosticField(value, 'serverCode'), reason = diagnosticField(value, 'reason')
      if (typeof serverCode === 'string' && Object.hasOwn(PAIRING_SERVER_CODES, serverCode)) result.serverCode = serverCode
      if (typeof reason === 'string' && Object.hasOwn(pairingReasonText, reason)) result.reason = reason
    }
    return result
  } catch { return undefined }
}
export function pairingFailureDescription(value: PairingObservation): string {
  const safe = sanitizePairingObservation(value)
  return (safe?.reason && pairingReasonText[safe.reason]) || (safe?.serverCode && PAIRING_SERVER_CODES[safe.serverCode])
    || (safe?.code === 'timeout' ? '申请配对凭据超时' : failureDescription(safe?.code))
}
function projectConnectionReport(value: unknown): ConnectionDiagnosticReport | null {
  if (diagnosticField(value, 'schema') !== 1 || diagnosticField(value, 'source') !== 'plugin') return null
  const startedAt = safeTime(diagnosticField(value, 'startedAt')), inputChecks = diagnosticField(value, 'checks')
  if (!startedAt || !Array.isArray(inputChecks) || inputChecks.length !== DIAGNOSTIC_CHECK_IDS.length) return null
  const checks: ConnectionDiagnosticCheck[] = []
  for (const id of DIAGNOSTIC_CHECK_IDS) {
    const input = inputChecks.find(check => diagnosticField(check, 'id') === id)
    const status = diagnosticField(input, 'status'), duration = diagnosticField(input, 'durationMs')
    if (status !== 'pass' && status !== 'fail' && status !== 'not-tested' && status !== 'cancelled') return null
    const check: ConnectionDiagnosticCheck = { id, status }
    if (typeof duration === 'number' && Number.isFinite(duration)) check.durationMs = Math.max(0, Math.min(20_000, Math.round(duration)))
    if (status === 'fail' || status === 'cancelled') Object.assign(check, sanitizeConnectionFailure(input))
    checks.push(check)
  }
  const dshVersion = safeVersion(diagnosticField(value, 'dshVersion'))
  const pairingObservation = sanitizePairingObservation(diagnosticField(value, 'pairingObservation'))
  return {
    schema: 1, source: 'plugin', startedAt,
    pluginRunningVersion: safeVersion(diagnosticField(value, 'pluginRunningVersion')) || 'unknown',
    ...(dshVersion ? { dshVersion } : {}),
    platform: choice(diagnosticField(value, 'platform'), ['win32', 'darwin', 'linux', 'freebsd', 'openbsd', 'aix', 'sunos', 'unknown'], 'unknown'),
    profileKind: choice(diagnosticField(value, 'profileKind'), ['desktop', 'web', 'unknown'], 'unknown'),
    relayEnabled: diagnosticField(value, 'relayEnabled') === true,
    relayState: choice(diagnosticField(value, 'relayState'), ['disabled', 'enrolling', 'connecting', 'online', 'offline', 'unknown'], 'unknown'),
    checks,
    ...(pairingObservation ? { pairingObservation } : {}),
  }
}
export function sanitizeConnectionReport(value: unknown): ConnectionDiagnosticReport | null {
  try { return projectConnectionReport(value) } catch { return null }
}
export function failureDescription(code: unknown): string {
  return failureText[sanitizeConnectionFailure({ code }).code][0]
}
export function failureAdvice(code: unknown): string {
  return failureText[sanitizeConnectionFailure({ code }).code][1]
}
export function diagnosticCheckLabel(id: unknown): string {
  return id === 'local-plugin' ? '本地插件服务' : id === 'relay-health' ? '公网 HTTPS 基础检查'
    : id === 'agent-connection' ? '当前业务连接（仅观察状态）' : '未知检查'
}
export function formatConnectionDiagnosticReport(value: unknown): string {
  const report = sanitizeConnectionReport(value)
  return report ? JSON.stringify(report, null, 2) : '诊断报告不可用'
}
