import { createHash } from 'node:crypto'
import { homedir } from 'node:os'
import path from 'node:path'

/** DSH-owned data root. Explicit DSH_HOME is an isolation boundary. */
export function dshDataHome(environment: NodeJS.ProcessEnv = process.env): string {
  const configured = String(environment.DSH_HOME || '').trim()
  return configured ? path.resolve(configured) : path.join(homedir(), '.dsh')
}

export function isDefaultProfile(scope: string): boolean {
  const value = scope.trim().toLowerCase()
  return value === 'web' || value === 'default'
}

/**
 * Preserve historic filenames for the default profile (zero-migration), while
 * isolating every additional Agent instance below the active DSH_HOME.
 */
export function profileDataRoot(scope: string): string {
  if (isDefaultProfile(scope)) return dshDataHome()
  const key = createHash('sha256').update(`harness-remote\0${scope}`).digest('hex').slice(0, 24)
  return path.join(dshDataHome(), 'harness-remote', 'instances', key)
}

