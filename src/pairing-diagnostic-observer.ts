/** Passive, bounded per-gate memory. No listeners, I/O, timers, or business decisions. */
import { classifyConnectionFailure } from './connection-diagnostics.js'
import {
  diagnosticField, sanitizePairingObservation, PAIRING_SERVER_CODES, PAIRING_PROOF_MESSAGES,
  type PairingObservation,
} from './connection-diagnostic-contract.js'

/** A diagnostic fault must never escape into the operation it observes. */
export function observePairingDiagnostic<T>(observe: () => T): T | undefined {
  try { return observe() } catch { return undefined }
}

export class PairingDiagnosticObserver {
  private attempt?: object
  private observation?: PairingObservation

  begin(): object {
    const attempt = {}
    this.attempt = attempt
    this.observation = { status: 'running', startedAt: new Date().toISOString() }
    return attempt
  }

  issued(attempt: object | undefined): void { this.finish(attempt, { status: 'issued' }) }

  unavailable(attempt: object | undefined, reason: 'service-not-ready' | 'ticket-missing'): void {
    this.finish(attempt, { status: 'failed', code: 'unknown', reason })
  }

  failed(attempt: object | undefined, error: unknown): void {
    // Only fixed system/server codes and exact, known protocol messages survive.
    // Never retain the original Error, message, stack, cause, response or identity.
    const failure = classifyConnectionFailure(error)
    const code = diagnosticField(error, 'code'), message = diagnosticField(error, 'message')
    const serverCode = typeof code === 'string' && Object.hasOwn(PAIRING_SERVER_CODES, code) ? code : undefined
    const reason = code === 'invalid_agent_proof' && typeof message === 'string' && Object.hasOwn(PAIRING_PROOF_MESSAGES, message)
      ? PAIRING_PROOF_MESSAGES[message] : message === 'fetch failed' && failure.code === 'unknown' ? 'fetch-failed' : undefined
    this.finish(attempt, { status: 'failed', ...failure, ...(serverCode ? { serverCode } : {}), ...(reason ? { reason } : {}) })
  }

  snapshot(): PairingObservation | undefined { return sanitizePairingObservation(this.observation) }

  private finish(attempt: object | undefined, result: Partial<PairingObservation>): void {
    if (!attempt || attempt !== this.attempt || !this.observation) return
    this.observation = sanitizePairingObservation({ ...this.observation, ...result, finishedAt: new Date().toISOString() })
  }
}
