/** Remove only generated browser declarations so renamed UI files cannot linger. */
import { rm } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
await rm(path.join(root, 'lib', 'types', 'client'), {
  recursive: true,
  force: true,
})
