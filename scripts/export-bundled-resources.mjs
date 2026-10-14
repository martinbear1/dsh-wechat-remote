/** Offline resource publication artifact. Never uploads, grants or publishes. */
import fs from 'node:fs/promises'
import path from 'node:path'
import { bundledResourceReleases } from '../lib/private-resources/bundled.js'

if (process.argv.length !== 3) throw Error('Provide the explicit resource output directory')
const directory = path.resolve(process.argv[2])
await fs.mkdir(directory, { recursive: true })
const releases = []
for (const { content, release } of bundledResourceReleases()) {
  const file = path.join(directory, `${release.resourceId}-${release.version}.json`)
  try { await fs.writeFile(file, content, { flag: 'wx' }) }
  catch (error) {
    if (error.code !== 'EEXIST' || !(await fs.readFile(file)).equals(content)) throw error
  }
  releases.push({ ...release, file })
}
console.log(JSON.stringify({ published: false, releases }, null, 2))
