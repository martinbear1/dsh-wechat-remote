// Generated copy: the plugin TypeScript remains the single policy source.
import fs from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'
const directory = process.argv.find(a => !a.startsWith('--') && a !== process.argv[0] && a !== process.argv[1])
if (!directory) throw new Error('Provide the cloud repository directory')
const source = fs.readFileSync(new URL('../src/update-policy.ts', import.meta.url))
const compiled = fs.readFileSync(new URL('../lib/update-policy.js', import.meta.url), 'utf8')
const filename = path.resolve(directory, 'src/update-policy.js')
const content = '// GENERATED from plugin src/update-policy.ts; do not edit.\n// source SHA256: '
  + createHash('sha256').update(source).digest('hex') + '\n' + compiled
if (process.argv.includes('--check')) {
  if (fs.readFileSync(filename, 'utf8') !== content) throw new Error('Cloud/host update policy drift')
} else fs.writeFileSync(filename, content)
console.log('Policy synchronized')
