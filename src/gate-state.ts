import {
  readFileSync,
  renameSync,
} from 'node:fs'
import { randomBytes } from 'node:crypto'
import { tightenPrivateFile, writePrivateJsonAtomic } from './secure-file.js'

export interface GateState {
  publicIdentityNodeId?: string
  token: string
}

export interface GateStateLoadResult {
  readonly state: GateState
  /** False means the LAN door must stay closed; the state is process-local only. */
  readonly persistent: boolean
  readonly warning?: string
  readonly recoveredFrom?: string
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function errorCodeOf(error: unknown): string | undefined {
  if (!error || typeof error !== 'object' || !('code' in error)) return undefined
  return typeof error.code === 'string' ? error.code : undefined
}

function freshState(): GateState {
  return { token: randomBytes(32).toString('base64url') }
}

function parseState(text: string): GateState {
  const value = JSON.parse(text) as unknown
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('state root is not an object')
  }
  const raw = value as Record<string, unknown>
  if (typeof raw.token !== 'string' || raw.token.length < 32) {
    throw new Error('state token is missing or invalid')
  }
  if (raw.publicIdentityNodeId !== undefined && raw.publicIdentityNodeId !== null &&
      typeof raw.publicIdentityNodeId !== 'string') {
    throw new Error('state public identity is invalid')
  }
  return {
    token: raw.token,
    publicIdentityNodeId: typeof raw.publicIdentityNodeId === 'string'
      ? raw.publicIdentityNodeId
      : undefined,
  }
}

function corruptBackupPath(file: string): string {
  return `${file}.corrupt-${Date.now()}-${randomBytes(5).toString('hex')}`
}

/**
 * Load the private LAN credential without treating every filesystem failure as
 * a first run. A malformed file is preserved under a unique .corrupt-* name;
 * unreadable files remain untouched and make only the LAN door unavailable.
 */
export function loadGateState(file: string): GateStateLoadResult {
  let text: string
  try {
    text = readFileSync(file, 'utf8')
  } catch (error: unknown) {
    if (errorCodeOf(error) !== 'ENOENT') {
      return {
        state: freshState(),
        persistent: false,
        warning: `cannot read LAN credential state: ${messageOf(error)}`,
      }
    }
    const state = freshState()
    try {
      writePrivateJsonAtomic(file, state)
      return { state, persistent: true }
    } catch (writeError: unknown) {
      return {
        state,
        persistent: false,
        warning: `cannot create LAN credential state: ${messageOf(writeError)}`,
      }
    }
  }

  try {
    const state = parseState(text)
    tightenPrivateFile(file)
    return { state, persistent: true }
  } catch (parseError: unknown) {
    const backup = corruptBackupPath(file)
    const state = freshState()
    try {
      renameSync(file, backup)
      tightenPrivateFile(backup)
      try {
        writePrivateJsonAtomic(file, state)
      } catch (writeError: unknown) {
        // Restore the original evidence when recovery cannot be completed.
        try { renameSync(backup, file) } catch { /* keep the backup if restore also fails */ }
        throw writeError
      }
      return {
        state,
        persistent: true,
        recoveredFrom: backup,
        warning: `invalid LAN credential state was preserved at ${backup}: ${messageOf(parseError)}`,
      }
    } catch (recoveryError: unknown) {
      return {
        state,
        persistent: false,
        warning: `invalid LAN credential state was not replaced: ${messageOf(recoveryError)}`,
      }
    }
  }
}

export function saveGateState(file: string, state: GateState): void {
  writePrivateJsonAtomic(file, state)
}
