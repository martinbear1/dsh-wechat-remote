/** Offline release gate: inspect the actual tarball, then import its host
 * entrypoints outside the checkout with only declared native peer packages.
 * Never builds, installs, mounts the plugin, or updates an installed profile.
 * Usage: npm run verify:pack [-- /path/to/already-packed-plugin.tgz]
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { tmpdir } from 'node:os'
import { createRequire, isBuiltin } from 'node:module'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { fileURLToPath, pathToFileURL } from 'node:url'
import vm from 'node:vm'
import ts from 'typescript'
import { auditArchive } from '../lib/update-download.js'
import { trustedReleaseAsset } from '../lib/update-policy.js'

const root = fileURLToPath(new URL('../', import.meta.url))
const packageName = specifier => specifier.startsWith('@') ? specifier.split('/').slice(0, 2).join('/') : specifier.split('/')[0]
const readJson = file => JSON.parse(fs.readFileSync(file, 'utf8'))
const filesBelow = directory => fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
  const file = path.join(directory, entry.name)
  return entry.isDirectory() ? filesBelow(file) : [file]
})

function requireLocalFile(base, file, label, directory = false) {
  const target = path.resolve(base, file)
  const relative = path.relative(base, target)
  assert((relative || directory) && relative !== '..' && !relative.startsWith('..' + path.sep) && !path.isAbsolute(relative), `${label}: path escapes package: ${file}`)
  assert(fs.existsSync(target) && (directory ? fs.statSync(target).isDirectory() : fs.statSync(target).isFile()), `${label}: missing packed file ${file}`)
  return target
}

function moduleReferences(file) {
  const source = ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true)
  const references = []
  const add = (value, directory = false) => { if (value && ts.isStringLiteralLike(value)) references.push({ specifier: value.text, directory }) }
  function visit(node) {
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) add(node.moduleSpecifier)
    if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument)) add(node.argument.literal)
    if (ts.isCallExpression(node) && (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
      ts.isIdentifier(node.expression) && node.expression.text === 'require')) add(node.arguments[0])
    // Worker/resource references are not imports, but must exist in the tarball.
    if (ts.isNewExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === 'URL' &&
      node.arguments?.[1]?.getText(source) === 'import.meta.url') {
      const value = node.arguments[0]
      add(value, ts.isStringLiteralLike(value) && value.text.endsWith('/'))
    }
    ts.forEachChild(node, visit)
  }
  visit(source)
  return references
}

export function inspectPackedPlugin(directory) {
  const manifest = readJson(path.join(directory, 'package.json'))
  const hostEntries = new Set(), peers = new Set(), bundle = new Set(manifest.bundleDependencies || [])
  const inspectExport = (value, key) => {
    if (typeof value === 'string') {
      const target = requireLocalFile(directory, value, `export ${key}`)
      if (key !== './client' && value.endsWith('.js')) hostEntries.add(target)
    } else if (value && typeof value === 'object') for (const child of Object.values(value)) inspectExport(child, key)
  }
  requireLocalFile(directory, manifest.main, 'main')
  for (const [key, value] of Object.entries(manifest.exports || {})) inspectExport(value, key)
  hostEntries.add(path.resolve(directory, manifest.main))
  for (const dependency of Object.keys(manifest.dependencies || {})) {
    assert(bundle.has(dependency), `Runtime dependency is not bundled: ${dependency}`)
    requireLocalFile(directory, `node_modules/${dependency}/package.json`, 'bundled dependency')
  }
  const modules = filesBelow(path.join(directory, 'lib')).filter(file => /\.(?:js|d\.ts)$/.test(file))
  for (const file of modules) for (const reference of moduleReferences(file)) {
    const { specifier } = reference
    if (specifier.startsWith('.')) {
      let target = path.resolve(path.dirname(file), specifier)
      if (file.endsWith('.d.ts') && target.endsWith('.js')) target = target.slice(0, -3) + '.d.ts'
      requireLocalFile(directory, path.relative(directory, target), path.relative(directory, file), reference.directory)
    } else if (!isBuiltin(specifier)) {
      const name = packageName(specifier)
      // Declaration-only references may name host types without loading them.
      if (file.endsWith('.d.ts')) continue
      assert(manifest.dependencies?.[name] || manifest.peerDependencies?.[name], `${path.relative(directory, file)}: undeclared dependency ${name}`)
      if (manifest.peerDependencies?.[name] && file !== path.join(directory, 'lib/client.js')) peers.add(name)
    }
  }
  return { manifest, hostEntries: [...hostEntries], peers: [...peers], modules: modules.length }
}

function packageDirectory(name, from) {
  const resolver = createRequire(path.join(from, 'package.json'))
  for (const lookup of resolver.resolve.paths(name) || []) {
    const candidate = path.join(lookup, name)
    if (fs.existsSync(path.join(candidate, 'package.json'))) return fs.realpathSync(candidate)
  }
  throw new Error(`Native peer fixture is unavailable locally: ${name}. Install development dependencies before this offline check.`)
}

function copyNativePeers(names, destination) {
  const copied = new Map()
  function copy(name, from) {
    const source = packageDirectory(name, from), manifest = readJson(path.join(source, 'package.json'))
    if (copied.has(name)) {
      assert.equal(copied.get(name), manifest.version, `Native peer fixture has conflicting versions of ${name}`)
      return
    }
    copied.set(name, manifest.version)
    fs.cpSync(source, path.join(destination, 'node_modules', name), { recursive: true, dereference: true,
      filter: file => !path.relative(source, file).split(path.sep).some(part => part === 'node_modules' || part === '.git') })
    const required = new Set([...Object.keys(manifest.dependencies || {}), ...Object.keys(manifest.peerDependencies || {})
      .filter(peer => !manifest.peerDependenciesMeta?.[peer]?.optional)])
    for (const child of required) copy(child, source)
  }
  for (const name of names) copy(name, root)
  return Object.fromEntries(copied)
}

function npmCli() {
  return [process.env.npm_execpath, path.join(path.dirname(process.execPath), 'node_modules/npm/bin/npm-cli.js'),
    path.resolve(path.dirname(process.execPath), '../lib/node_modules/npm/bin/npm-cli.js')]
    .find(file => file && fs.existsSync(file))
}

export function verifyPackedPlugin(existingArchive) {
  const parent = path.resolve(tmpdir()), temporary = fs.mkdtempSync(path.join(parent, 'dsh-packed-check-'))
  try {
    let archive = existingArchive && path.resolve(existingArchive)
    if (!archive) {
      const cli = npmCli()
      assert(cli, 'Run via npm run verify:pack, or pass an existing tarball')
      const packed = JSON.parse(execFileSync(process.execPath, [cli, 'pack', '--json', '--ignore-scripts', '--pack-destination', temporary],
        { cwd: root, encoding: 'utf8', windowsHide: true, timeout: 120000, maxBuffer: 8 * 1024 * 1024 }))
      assert.equal(packed.length, 1)
      archive = path.join(temporary, packed[0].filename)
    }
    const metadata = JSON.parse(execFileSync('tar', ['-xOf', archive, 'package/package.json'],
      { encoding: 'utf8', windowsHide: true, maxBuffer: 65536 }))
    const bytes = fs.readFileSync(archive), asset = { bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex'),
      url: `https://github.com/martinbear1/dsh-wechat-remote/releases/download/v${metadata.version}/packed-plugin.tgz` }
    // Reuse the real updater's size/path/type/manifest policy before extraction,
    // rather than inventing a second, subtly different tar security validator.
    assert(trustedReleaseAsset(asset, metadata.version), 'Packed artifact exceeds update policy')
    auditArchive(bytes, { version: metadata.version, asset })
    execFileSync('tar', ['-xzf', archive, '-C', temporary], { windowsHide: true })
    const directory = path.join(temporary, 'package'), inspected = inspectPackedPlugin(directory)
    assert.equal(inspected.manifest.name, '@harness-remote/dsh-wechat-remote')
    // Outside the repository, with copies rather than links back to its tree.
    // A separate host Zod copy exercises the native registry's cross-package
    // schema projection; it must not supply the plugin's own runtime import.
    const peers = copyNativePeers([...inspected.peers, 'zod'], temporary)
    const probe = `import assert from 'node:assert/strict';
      import { createRequire } from 'node:module';
      import { pathToFileURL } from 'node:url';
      const ownRequire = createRequire(${JSON.stringify(path.join(directory, 'package.json'))});
      const ownZodPath = ownRequire.resolve('zod');
      assert(ownZodPath.startsWith(${JSON.stringify(path.join(directory, 'node_modules', 'zod') + path.sep)}));
      const { z: hostZod } = await import('zod');
      const { z: packedZod } = await import(pathToFileURL(ownZodPath));
      assert.notEqual(hostZod, packedZod, 'fixture must exercise separate module instances');
      const entries = ${JSON.stringify(inspected.hostEntries.map(file => pathToFileURL(file).href))};
      for (const entry of entries) await import(entry);
      const main = await import(${JSON.stringify(pathToFileURL(path.resolve(directory, inspected.manifest.main)).href)});
      assert.equal(main.name, 'gate'); assert.equal(typeof main.apply, 'function');
      const { TYPERT } = await import(${JSON.stringify(pathToFileURL(path.join(directory, 'lib/typert.host.js')).href)});
      const projection = (z, schema) => {
        try { return { value: z.toJSONSchema(schema) }; }
        catch (error) { return { error: error.message }; }
      };
      let schemas = 0;
      for (const invocation of TYPERT.invocations) {
        for (const schema of [...invocation.parameters.map(p => p.codec?.schema), invocation.result?.schema].filter(Boolean)) {
          // Generated undefined unions are not JSON-representable under the
          // strict default; separate copies must agree on rejection as well.
          assert.deepEqual(projection(hostZod, schema), projection(packedZod, schema));
          assert.deepEqual(hostZod.toJSONSchema(schema, { unrepresentable: 'any' }), packedZod.toJSONSchema(schema, { unrepresentable: 'any' }));
          schemas++;
        }
      }
      const page = TYPERT.invocations.find(i => i.namespace === 'wechatHistory' && i.method === 'page');
      assert(page.parameters[0].codec.schema.safeParse({ sessionId: 'synthetic-packed-session' }).success);
      assert(!page.parameters[0].codec.schema.safeParse({ sessionId: 123 }).success);
      console.log('separate host Zod schema equivalence passed: ' + schemas);
      console.log('packed host imports passed: ' + entries.length);`
    const output = execFileSync(process.execPath, ['--input-type=module', '--eval', probe], { cwd: temporary,
      env: { ...process.env, NODE_PATH: '', NODE_OPTIONS: '' }, encoding: 'utf8', windowsHide: true, timeout: 15000 })
    let registration
    vm.runInNewContext(fs.readFileSync(path.join(directory, 'lib/client.js'), 'utf8'), {
      window: { __ModuleLoader__: { load(value) { registration = value } } },
    }, { timeout: 2000 })
    assert.equal(registration?.id, inspected.manifest.name)
    assert.equal(typeof registration?.factory, 'function')
    const result = { version: inspected.manifest.version, modulesChecked: inspected.modules,
      hostEntriesLoaded: inspected.hostEntries.length, nativePeerVersions: peers, browserRegistration: true,
      packedBytes: fs.statSync(archive).size,
      bundledZodBytes: filesBelow(path.join(directory, 'node_modules/zod')).reduce((n, file) => n + fs.statSync(file).size, 0),
      acceptedByUpdatePolicy: true,
      isolatedFromCheckout: true, actualTarball: true }
    console.log(output.trim())
    console.log(JSON.stringify(result, null, 2))
    return result
  } finally {
    assert.equal(path.dirname(path.resolve(temporary)), parent)
    assert(path.basename(temporary).startsWith('dsh-packed-check-'))
    fs.rmSync(temporary, { recursive: true, force: true })
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) verifyPackedPlugin(process.argv[2])
