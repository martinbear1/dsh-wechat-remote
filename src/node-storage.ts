/** Plugin-owned state only. DSH workspaces, sessions and native profiles are
 * never moved. Web's old files are rollback mirrors, not a second authority. */
import { createHash, createPrivateKey, createPublicKey, randomBytes } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, rmdirSync } from 'node:fs'
import path from 'node:path'
import { readPrivateJson, writePrivateJsonAtomic, createPrivateJsonAtomic } from './secure-file.js'

const names = ['identity.json', 'gate-wechat-state.json', 'public.json'] as const
type Name = typeof names[number]
type Value = Record<string, unknown> | null
type Hashes = Record<Name, string | null>
interface Layout { version: 1; scope: 'web'; hashes: Hashes }
interface Transaction { version: 1; before: Record<Name, { current: string | null; legacy: string | null }>; values: Record<Name, Value> }
const legacyNames: Record<Name, string> = {
  'identity.json': 'harness-remote-public-identity.json',
  'gate-wechat-state.json': 'gate-wechat-state.json',
  'public.json': 'harness-remote-public.json',
}
const conflict = () => new Error('节点配置存在并发修改或迁移冲突；未覆盖配对信息，请关闭同一 Web 节点的其他实例后重试')
function canonical(value: any): any {
  if (Array.isArray(value)) return value.map(canonical)
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]))
  return value
}
function hash(value: Value): string | null {
  return value === null ? null : createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex')
}
function read(file: string): Value {
  try {
    const value = readPrivateJson<unknown>(file)
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw conflict()
    return value as Record<string, unknown>
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null
    throw error
  }
}
export function nodeStorageDirectory(home: string, profile: string): string {
  const scope = ['web', 'default'].includes(profile.toLowerCase()) ? 'web' : profile
  const key = createHash('sha256').update(`deepseek-harness\0${scope}`).digest('hex').slice(0, 24)
  return path.join(home, 'harness-remote', 'instances', key)
}
/** Installation controller can be loaded into the OLD plugin's process. It
 * reads that process's existing credentials; migration waits for its restart. */
export function installedNodeStatePaths(home: string, profile: string): { stateFile: string; identityFile: string } {
  const directory = nodeStorageDirectory(home, profile)
  const legacy = ['web', 'default'].includes(profile.toLowerCase())
    && !existsSync(path.join(directory, 'storage-layout.json'))
  return { stateFile: legacy ? path.join(home, legacyNames['gate-wechat-state.json']) : path.join(directory, 'gate-wechat-state.json'),
    identityFile: legacy ? path.join(home, legacyNames['identity.json']) : path.join(directory, 'identity.json') }
}
function validate(values: Record<Name, Value>): void {
  const identity = values['identity.json'], gate = values['gate-wechat-state.json']
  if (identity) {
    if (typeof identity.privateKeyPem !== 'string' || typeof identity.publicKeyPem !== 'string') throw conflict()
    const privateKey = createPrivateKey(identity.privateKeyPem)
    const publicKey = createPublicKey(identity.publicKeyPem)
    if (privateKey.asymmetricKeyType !== 'ed25519' || publicKey.asymmetricKeyType !== 'ed25519') throw conflict()
    const bytes = publicKey.export({ format: 'der', type: 'spki' })
    if (!bytes.equals(createPublicKey(privateKey).export({ format: 'der', type: 'spki' }))) throw conflict()
    if (identity.nodeId !== createHash('sha256').update(bytes).digest().subarray(0, 18).toString('base64url')) throw conflict()
  }
  if (gate && (typeof gate.token !== 'string' || gate.token.length < 32)) throw conflict()
  // A grant owner can temporarily name the previous key during native reset.
  // The gate already invalidates that grant; migration must not rebind it.
  if (gate?.publicIdentityNodeId != null && typeof gate.publicIdentityNodeId !== 'string') throw conflict()
}
function files(directory: string, name: Name): { current: string; legacy: string } {
  const home = path.resolve(directory, '../../..')
  if (nodeStorageDirectory(home, 'web') !== path.normalize(directory)) throw conflict()
  return { current: path.join(directory, name), legacy: path.join(home, legacyNames[name]) }
}
function readPairs(directory: string) {
  return Object.fromEntries(names.map(name => {
    const pair = files(directory, name)
    return [name, { current: read(pair.current), legacy: read(pair.legacy) }]
  })) as Record<Name, { current: Value; legacy: Value }>
}
function locked<T>(directory: string, run: () => T): T {
  mkdirSync(directory, { recursive: true, mode: 0o700 })
  const lock = path.join(directory, '.storage-lock')
  // Never reuse a recovered owner's filename. Two contenders may both have
  // read a dead PID; only one can remove THAT generation, never its successor.
  const generation = `${process.pid}-${randomBytes(16).toString('hex')}`
  const staging = path.join(directory, `.storage-lock-pending-${generation}`)
  const ownerName = `owner-${generation}.json`
  let acquired = false
  mkdirSync(staging, { mode: 0o700 })
  try {
    // Publish a complete, nonempty directory atomically. A crash before this
    // rename leaves only an ignored preparation directory, never an ownerless
    // active lock. An existing nonempty lock cannot be replaced by rename.
    writePrivateJsonAtomic(path.join(staging, ownerName), { pid: process.pid })
    if (existsSync(lock)) {
      // A crashed writer is recoverable. Missing/ambiguous owner is never stolen.
      let pid: unknown
      let previousOwner: string
      try {
        const entries = readdirSync(lock)
        if (entries.length !== 1 || !/^(owner\.json|owner-\d+-[a-f0-9]{32}\.json)$/.test(entries[0])) throw conflict()
        previousOwner = path.join(lock, entries[0])
        pid = JSON.parse(readFileSync(previousOwner, 'utf8')).pid
      } catch { throw conflict() }
      if (!Number.isSafeInteger(pid) || Number(pid) <= 0) throw conflict()
      try { process.kill(Number(pid), 0); throw conflict() } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ESRCH') throw error
      }
      try { rmSync(previousOwner) } catch { throw conflict() }
      // Exact plugin-owned empty lock, never a computed recursive removal.
      rmdirSync(lock)
    }
    try { renameSync(staging, lock) } catch (error) {
      if (existsSync(lock)) throw conflict()
      throw error
    }
    acquired = true
    return run()
  } finally {
    const ownedDirectory = acquired ? lock : staging
    const ownerFile = path.join(ownedDirectory, ownerName)
    if (existsSync(ownerFile)) rmSync(ownerFile)
    // rmdir is required for an empty directory on Windows/Node.
    if (existsSync(ownedDirectory)) rmdirSync(ownedDirectory)
  }
}

function commit(directory: string, transaction: Transaction): Layout {
  if (transaction.version !== 1 || !transaction.values || !transaction.before) throw conflict()
  validate(transaction.values)
  const pairs = readPairs(directory)
  // Recovery may see either side of our own interrupted write, but must never
  // overwrite a third value written by an old process after the interruption.
  for (const name of names) for (const side of ['current', 'legacy'] as const) {
    const actual = hash(pairs[name][side]), next = hash(transaction.values[name])
    if (actual !== transaction.before[name]?.[side] && actual !== next) throw conflict()
  }
  for (const name of names) {
    const value = transaction.values[name]
    if (value === null) continue // Absence never authorizes deleting credentials.
    const pair = files(directory, name)
    for (const side of ['current', 'legacy'] as const) {
      if (hash(pairs[name][side]) !== hash(value)) writePrivateJsonAtomic(pair[side], value)
    }
  }
  const layout: Layout = { version: 1, scope: 'web', hashes: Object.fromEntries(names.map(name => [name, hash(transaction.values[name])])) as Hashes }
  writePrivateJsonAtomic(path.join(directory, 'storage-layout.json'), layout)
  rmSync(path.join(directory, 'storage-transaction.json'))
  return layout
}
function recover(directory: string): void {
  const journal = path.join(directory, 'storage-transaction.json')
  if (existsSync(journal)) commit(directory, readPrivateJson<Transaction>(journal))
}
function publish(directory: string, values: Record<Name, Value>, pairs: ReturnType<typeof readPairs>): void {
  validate(values)
  const transaction: Transaction = { version: 1, values,
    before: Object.fromEntries(names.map(name => [name, { current: hash(pairs[name].current), legacy: hash(pairs[name].legacy) }])) as Transaction['before'] }
  writePrivateJsonAtomic(path.join(directory, 'storage-transaction.json'), transaction)
  commit(directory, transaction)
}
function layoutAt(directory: string): Layout | null {
  const file = path.join(directory, 'storage-layout.json')
  if (!existsSync(file)) return null
  const value = readPrivateJson<Layout>(file)
  if (value.version !== 1 || value.scope !== 'web' || !value.hashes
      || names.some(name => value.hashes[name] !== null && typeof value.hashes[name] !== 'string')) throw conflict()
  return value
}
/** Before opening any network door. Idempotent on first install, upgrade,
 * restart, or re-upgrade after an old plugin changed its rollback files. */
export function prepareNodeStorage(home: string, profile: string): void {
  if (profile.toLowerCase() === 'desktop') return // Never import Web into Desktop.
  if (!['web', 'default'].includes(profile.toLowerCase())) {
    // Pre-existing custom CLI nodes used the shared operator override, but
    // already had isolated credentials. Preserve that override once, without
    // importing credentials or continuing to share its future writes.
    const directory = nodeStorageDirectory(home, profile)
    const target = path.join(directory, 'public.json')
    if (!existsSync(target) && (existsSync(path.join(directory, 'identity.json'))
        || existsSync(path.join(directory, 'gate-wechat-state.json')))) {
      const previous = read(path.join(home, 'harness-remote-public.json'))
      if (previous) createPrivateJsonAtomic(target, previous)
    }
    return
  }
  const directory = nodeStorageDirectory(home, profile)
  locked(directory, () => {
    recover(directory)
    const layout = layoutAt(directory), pairs = readPairs(directory)
    const values = {} as Record<Name, Value>
    let changed = !layout
    for (const name of names) {
      const { current, legacy } = pairs[name], a = hash(current), b = hash(legacy)
      const base = layout?.hashes[name] ?? null
      if (base !== null && (a === null || b === null)) throw conflict()
      if (a === b) values[name] = current
      else if (a === base) values[name] = legacy
      else if (b === base) values[name] = current
      else throw conflict()
      changed ||= a !== b || a !== base
    }
    validate(values)
    if (changed) publish(directory, values, pairs)
  })
}
/** One serialized transaction updates the authority and downgrade mirror.
 * External changes while running require restart, not stale in-memory writes. */
export function writeNodeState(file: string, value: unknown): void {
  const directory = path.dirname(file), name = path.basename(file) as Name
  if (!names.includes(name) || !existsSync(path.join(directory, 'storage-layout.json'))) {
    writePrivateJsonAtomic(file, value); return
  }
  locked(directory, () => {
    const interrupted = existsSync(path.join(directory, 'storage-transaction.json'))
    recover(directory)
    if (interrupted) throw new Error('已恢复中断的节点配置写入，请重启当前节点后重试')
    const layout = layoutAt(directory)!, pairs = readPairs(directory)
    for (const name of names) {
      if (hash(pairs[name].current) !== layout.hashes[name] || hash(pairs[name].legacy) !== layout.hashes[name]) throw conflict()
    }
    const values = Object.fromEntries(names.map(key => [key, pairs[key].current])) as Record<Name, Value>
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw conflict()
    values[name] = value as Record<string, unknown>
    publish(directory, values, pairs)
  })
}
