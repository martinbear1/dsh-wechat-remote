/**
 * Reproducible external-plugin equivalent of DSH's unpublished clientBundle
 * preset. The output is one lazy CommonJS factory registered under the exact
 * package id; React and the DSH client runtime remain host-provided modules.
 */
import { createHash } from 'node:crypto'
import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { build } from 'esbuild'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const manifest = JSON.parse(
  await readFile(path.join(root, 'package.json'), 'utf8'),
)
const packageId = manifest.name

const cssModules = {
  name: 'dsh-css-modules',
  setup(buildApi) {
    buildApi.onLoad({ filter: /\.module\.css$/ }, async ({ path: file }) => {
      const source = await readFile(file, 'utf8')
      // CSS identifiers cannot begin with a digit. Prefixing the digest keeps
      // every generated selector valid regardless of the hash's first nibble.
      const prefix = `hr_${createHash('sha256')
        .update(`${file}\0${source}`)
        .digest('hex')
        .slice(0, 7)}`
      const names = [...source.matchAll(/\.([A-Za-z_][A-Za-z0-9_-]*)/g)].map(
        (match) => match[1],
      )
      const uniqueNames = [...new Set(names)]
      const classes = Object.fromEntries(
        uniqueNames.map((name) => [name, `${prefix}_${name}`]),
      )
      let scopedCss = source
      for (const [name, scoped] of Object.entries(classes)) {
        scopedCss = scopedCss.replace(
          new RegExp(`\\.${name}(?![A-Za-z0-9_-])`, 'g'),
          `.${scoped}`,
        )
      }
      const tagId = `${packageId}/${path.basename(file)}`
      const contents = `
const css = ${JSON.stringify(scopedCss)};
const tagId = ${JSON.stringify(tagId)};
if (typeof document !== 'undefined' && document.querySelector('style[data-plugin-css=' + JSON.stringify(tagId) + ']') === null) {
  const tag = document.createElement('style');
  tag.dataset.plugin = ${JSON.stringify(packageId)};
  tag.dataset.pluginCss = tagId;
  tag.textContent = css;
  document.head.appendChild(tag);
}
module.exports = ${JSON.stringify(classes)};
`
      return { contents, loader: 'js' }
    })
  },
}

const result = await build({
  entryPoints: [path.join(root, 'src', 'client', 'index.ts')],
  bundle: true,
  write: false,
  format: 'cjs',
  platform: 'browser',
  target: ['es2022'],
  charset: 'utf8',
  jsx: 'automatic',
  minify: true,
  legalComments: 'none',
  external: [
    'react',
    'react/jsx-runtime',
    'react-dom',
    'react-dom/client',
    '@deepseek-ai/cordis',
    '@deepseek-ai/dsh-client-connection/client',
    '@deepseek-ai/dsh-client-runtime/client',
    '@deepseek-ai/dsh-client-ui-settings/client',
    '@deepseek-ai/dsh-client-ui-slots',
  ],
  plugins: [cssModules],
})

const output = result.outputFiles?.[0]?.text
if (!output) throw new Error('Client bundle produced no JavaScript output')
const wrapped = `window.__ModuleLoader__.load({id:${JSON.stringify(packageId)},factory:(require)=>{var module={exports:{}};var exports=module.exports;${output}\nreturn module.exports;}});\n`
await writeFile(path.join(root, 'lib', 'client.js'), wrapped)
