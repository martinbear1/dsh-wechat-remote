/** Reject internal operations evidence and personal environment data in files
 * that form the public documentation/release surface. Secret scanning covers
 * the whole repository independently; this guard covers contextual data that
 * generic secret detectors do not classify as credentials.
 */
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'

const tracked = execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8' })
  .split('\0')
  .filter(Boolean)
const publicText = tracked.filter(file =>
  existsSync(file) && (
    file === 'README.md' ||
    file === 'SECURITY.md' ||
    file.startsWith('docs/') ||
    file.startsWith('.github/') ||
    file === 'package.json' ||
    file === 'installer/package.json'))

const internalDocument = /(?:^|\/)(?:CURRENT-BASELINE|.*(?:WORKLOG|HANDOFF|CHECKPOINT|ROLLOUT|RESEARCH|ADMISSION-FIX|PROGRESS)|.*-AUDIT)(?:-[^/]*)?\.md$/i
const contentRules = [
  { name: 'personal Windows path', pattern: /[A-Za-z]:[\\/](?:Users|Documents and Settings)[\\/][^<>{}\s/\\]+/i },
  { name: 'personal macOS path', pattern: /\/Users\/[A-Za-z0-9._-]+\// },
  { name: 'personal Linux home', pattern: /\/home\/[A-Za-z0-9._-]+\// },
  { name: 'specific private IPv4 address', pattern: /\b(?:10(?:\.\d{1,3}){3}|192\.168(?:\.\d{1,3}){2}|172\.(?:1[6-9]|2\d|3[01])(?:\.\d{1,3}){2})\b/ },
  { name: 'runtime process identifier', pattern: /\bPID\s*[:=#]?\s*\d{2,}\b/i },
  { name: 'personal mailbox', pattern: /\b[A-Z0-9._%+-]+@(?:qq|163|126|gmail|outlook)\.com\b/i },
]

const failures = []
for (const file of publicText) {
  const normalized = file.split(path.sep).join('/')
  if (internalDocument.test(normalized)) {
    failures.push(`${normalized}: internal work record must stay outside the public repository`)
    continue
  }
  const text = readFileSync(file, 'utf8')
  for (const rule of contentRules) {
    if (rule.pattern.test(text)) failures.push(`${normalized}: ${rule.name}`)
  }
}

if (failures.length) {
  console.error('Public tree check failed:\n- ' + failures.join('\n- '))
  process.exit(1)
}
console.log(`public tree check ok: ${publicText.length} tracked public files`)
