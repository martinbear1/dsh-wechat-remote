/**
 * dsh-typert-generator assumes the official monorepo's packages/* layout.
 * This external plugin builds an ephemeral one-package workspace, runs the
 * official analyzer/emitter there, then publishes only its generated files.
 */
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { WorkspaceAnalyzer, WorkspaceTypertGenerator } from '@deepseek-ai/dsh-typert-generator'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const manifest = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'))
const temp = mkdtempSync(path.join(tmpdir(), 'dsh-wechat-typert-'))
const packageRoot = path.join(temp, 'packages', 'dsh-wechat-remote')
const protocolRoot = path.join(temp, 'packages', 'dsh-typert-protocol')

try {
  mkdirSync(path.join(packageRoot, 'src'), { recursive: true })
  mkdirSync(path.join(packageRoot, 'lib'), { recursive: true })
  mkdirSync(path.join(protocolRoot, 'src'), { recursive: true })
  copyFileSync(path.join(root, 'package.json'), path.join(packageRoot, 'package.json'))
  copyFileSync(
    path.join(root, 'src', 'directory-service.ts'),
    path.join(packageRoot, 'src', 'directory-service.ts'),
  )
  copyFileSync(
    path.join(root, 'src', 'directory-worker.ts'),
    path.join(packageRoot, 'src', 'directory-worker.ts'),
  )
  copyFileSync(
    path.join(root, 'src', 'host-platform.ts'),
    path.join(packageRoot, 'src', 'host-platform.ts'),
  )
  copyFileSync(
    path.join(root, 'src', 'host-info-service.ts'),
    path.join(packageRoot, 'src', 'host-info-service.ts'),
  )
  copyFileSync(
    path.join(root, 'src', 'history-service.ts'),
    path.join(packageRoot, 'src', 'history-service.ts'),
  )
  copyFileSync(
    path.join(root, 'src', 'history-archive.ts'),
    path.join(packageRoot, 'src', 'history-archive.ts'),
  )
  copyFileSync(
    path.join(root, 'src', 'attachment-service.ts'),
    path.join(packageRoot, 'src', 'attachment-service.ts'),
  )
  copyFileSync(
    path.join(root, 'src', 'public-relay-agent.ts'),
    path.join(packageRoot, 'src', 'public-relay-agent.ts'),
  )
  copyFileSync(
    path.join(root, 'src', 'e2ee-session.ts'),
    path.join(packageRoot, 'src', 'e2ee-session.ts'),
  )
  copyFileSync(
    path.join(root, 'src', 'dsh-tunnel-agent.ts'),
    path.join(packageRoot, 'src', 'dsh-tunnel-agent.ts'),
  )
  copyFileSync(
    path.join(root, 'src', 'public-relay-gateway.ts'),
    path.join(packageRoot, 'src', 'public-relay-gateway.ts'),
  )
  copyFileSync(
    path.join(root, 'src', 'public-object-client.ts'),
    path.join(packageRoot, 'src', 'public-object-client.ts'),
  )
  copyFileSync(
    path.join(root, 'src', 'object-crypto.ts'),
    path.join(packageRoot, 'src', 'object-crypto.ts'),
  )
  copyFileSync(
    path.join(root, 'src', 'agent-metadata.ts'),
    path.join(packageRoot, 'src', 'agent-metadata.ts'),
  )
  copyFileSync(
    path.join(root, 'src', 'gate-ports.ts'),
    path.join(packageRoot, 'src', 'gate-ports.ts'),
  )
  copyFileSync(
    path.join(root, 'src', 'secure-file.ts'),
    path.join(packageRoot, 'src', 'secure-file.ts'),
  )
  copyFileSync(path.join(root, 'src', 'index.ts'), path.join(packageRoot, 'src', 'index.ts'))
  copyFileSync(
    path.join(root, 'lib', 'directory-service.d.ts'),
    path.join(packageRoot, 'lib', 'directory-service.d.ts'),
  )
  copyFileSync(
    path.join(root, 'lib', 'host-info-service.d.ts'),
    path.join(packageRoot, 'lib', 'host-info-service.d.ts'),
  )
  copyFileSync(
    path.join(root, 'lib', 'history-service.d.ts'),
    path.join(packageRoot, 'lib', 'history-service.d.ts'),
  )
  copyFileSync(
    path.join(root, 'lib', 'attachment-service.d.ts'),
    path.join(packageRoot, 'lib', 'attachment-service.d.ts'),
  )
  const protocolPackage = path.join(root, 'node_modules', '@deepseek-ai', 'dsh-typert-protocol')
  copyFileSync(
    path.join(protocolPackage, 'lib', 'types', 'index.d.ts'),
    path.join(protocolRoot, 'src', 'index.ts'),
  )
  copyFileSync(
    path.join(protocolPackage, 'lib', 'types', 'types.d.ts'),
    path.join(protocolRoot, 'src', 'types.ts'),
  )
  writeFileSync(path.join(protocolRoot, 'package.json'), JSON.stringify({
    name: '@deepseek-ai/dsh-typert-protocol',
    version: '0.1.1-rc.1',
    type: 'module',
    exports: {
      '.': { types: './lib/types/index.d.ts', default: './lib/index.js' },
      './types': { types: './lib/types/types.d.ts', default: './lib/types/types.js' },
    },
  }, null, 2))
  writeFileSync(path.join(protocolRoot, 'tsconfig.json'), JSON.stringify({
    compilerOptions: {
      target: 'ES2022',
      module: 'ESNext',
      moduleResolution: 'Bundler',
      strict: true,
      skipLibCheck: true,
      composite: true,
    },
    include: ['src/index.ts', 'src/types.ts'],
  }, null, 2))
  writeFileSync(path.join(packageRoot, 'tsconfig.json'), JSON.stringify({
    compilerOptions: {
      target: 'ES2022',
      module: 'ESNext',
      moduleResolution: 'Bundler',
      strict: true,
      skipLibCheck: true,
      composite: true,
      types: ['node'],
      baseUrl: '.',
      paths: {
        '@deepseek-ai/dsh-typert-protocol': ['../dsh-typert-protocol/src/index.ts'],
        '@deepseek-ai/dsh-typert-protocol/types': ['../dsh-typert-protocol/src/types.ts'],
      },
    },
    include: ['src/index.ts', 'src/directory-service.ts', 'src/directory-worker.ts', 'src/host-platform.ts', 'src/host-info-service.ts', 'src/history-service.ts', 'src/history-archive.ts', 'src/attachment-service.ts', 'src/public-relay-agent.ts', 'src/public-relay-gateway.ts', 'src/public-object-client.ts', 'src/object-crypto.ts', 'src/e2ee-session.ts', 'src/dsh-tunnel-agent.ts', 'src/agent-metadata.ts', 'src/gate-ports.ts', 'src/secure-file.ts'],
  }, null, 2))
  writeFileSync(path.join(temp, 'tsconfig.host.json'), JSON.stringify({
    compilerOptions: {
      target: 'ES2022',
      module: 'ESNext',
      moduleResolution: 'Bundler',
      baseUrl: '.',
      paths: {
        '@deepseek-ai/dsh-typert-protocol': ['./packages/dsh-typert-protocol/src/index.ts'],
        '@deepseek-ai/dsh-typert-protocol/types': ['./packages/dsh-typert-protocol/src/types.ts'],
      },
    },
    files: [],
    references: [
      { path: './packages/dsh-typert-protocol/tsconfig.json' },
      { path: './packages/dsh-wechat-remote/tsconfig.json' },
    ],
  }, null, 2))
  symlinkSync(path.join(root, 'node_modules'), path.join(temp, 'node_modules'), 'junction')

  let artifacts
  try {
    artifacts = new WorkspaceTypertGenerator(temp).generate([manifest.name], ['host'])
  } catch (error) {
    const model = new WorkspaceAnalyzer({
      root: temp,
      packages: [manifest.name],
      faces: ['host'],
    }).analyze()
    const surface = model.faces.flatMap((face) => face.packages.map((pkg) => ({
      face: face.face,
      package: pkg.name,
      services: pkg.services.map((service) => service.name),
      invocations: pkg.invocations.map((invocation) => `${invocation.namespace}/${invocation.exportName}`),
    })))
    throw new Error(`Typert generation failed; analyzed surface=${JSON.stringify(surface)}`, { cause: error })
  }
  const host = artifacts.find((artifact) => artifact.package === manifest.name && artifact.face === 'host')
  if (!host) throw new Error('wechat directory Host artifact was not generated')
  if (!host.remote) throw new Error('wechat directory Remote projection was not generated')

  writeFileSync(path.join(root, 'lib', 'typert.host.js'), host.js)
  writeFileSync(path.join(root, 'lib', 'typert.host.d.ts'), host.dts)
  writeFileSync(path.join(root, 'lib', 'typert.remote-client.js'), host.remote.js)
  writeFileSync(path.join(root, 'lib', 'typert.remote-client.d.ts'), host.remote.dts)
  writeFileSync(path.join(root, 'lib', 'typert.remote-client.d.ts.map'), host.remote.dtsMap)
} finally {
  rmSync(temp, { recursive: true, force: true })
}
