import { execFileSync } from 'node:child_process'
import {
  chmodSync,
  closeSync,
  existsSync,
  fsyncSync,
  linkSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { dirname } from 'node:path'
import { userInfo } from 'node:os'
import { randomBytes } from 'node:crypto'

/** Best-effort owner-only permissions for credentials and stable identities. */
export function tightenPrivateFile(file: string): void {
  try { chmodSync(file, 0o600) } catch { /* best effort */ }
  if (process.platform !== 'win32') return
  try {
    execFileSync('icacls', [file, '/inheritance:r', '/grant:r', `${userInfo().username}:F`], {
      timeout: 5000,
      windowsHide: true,
      stdio: 'ignore',
    })
  } catch { /* best effort */ }
}

/**
 * Replace a private JSON file without ever truncating the previous valid file.
 * The temporary file lives beside the destination, so rename is same-volume.
 */
export function writePrivateJsonAtomic(file: string, value: unknown): void {
  publishPrivateJson(file, value, true)
}

/** Publish a fully written identity once. Concurrent first starts must read
 * the winner, never overwrite it or observe an empty placeholder file. */
export function createPrivateJsonAtomic(file: string, value: unknown): boolean {
  return publishPrivateJson(file, value, false)
}

function publishPrivateJson(file: string, value: unknown, replace: boolean): boolean {
  const parent = dirname(file)
  mkdirSync(parent, { recursive: true, mode: 0o700 })
  const temporary = `${file}.${process.pid}.${randomBytes(6).toString('hex')}.tmp`
  try {
    writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, {
      encoding: 'utf8',
      mode: 0o600,
      flag: 'wx',
    })
    const fd = openSync(temporary, 'r+')
    try {
      // Some Windows filesystems reject fsync on ordinary user files. Rename
      // remains atomic; durability flush is an additional best-effort barrier.
      try { fsyncSync(fd) } catch { /* best effort */ }
    } finally { closeSync(fd) }
    tightenPrivateFile(temporary)
    if (replace) renameSync(temporary, file)
    else {
      try { linkSync(temporary, file) }
      catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'EEXIST') return false
        throw error // Do not replace an existing identity on unsupported storage.
      }
    }
    tightenPrivateFile(file)
    return true
  } finally {
    if (existsSync(temporary)) {
      try { rmSync(temporary, { force: true }) } catch { /* best effort */ }
    }
  }
}

export function readPrivateJson<T>(file: string): T {
  const value = JSON.parse(readFileSync(file, 'utf8')) as T
  tightenPrivateFile(file)
  return value
}
