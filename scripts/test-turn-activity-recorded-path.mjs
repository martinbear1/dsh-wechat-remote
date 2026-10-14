// Exercise source without writing lib/ while other compatibility work builds.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import ts from 'typescript'
const compile = name => ts.transpileModule(fs.readFileSync(new URL('../src/' + name + '.ts', import.meta.url), 'utf8'),
  { compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 } }).outputText
const url = code => 'data:text/javascript;base64,' + Buffer.from(code).toString('base64')
const dep = url(compile('tool-result-compat'))
const { TurnActivityCompatibility, mutationResultPath } = await import(url(compile('turn-activity').replace('./tool-result-compat.js', dep)))
for (const path of ['/workspace/b/report.txt', 'C:\\work\\b\\report.txt', '\\\\host\\share\\report.txt']) {
  assert.equal(mutationResultPath('report.txt', { path }), path)
}
assert.equal(mutationResultPath('report.txt', undefined), 'report.txt')
assert.equal(mutationResultPath('report.txt', {}), 'report.txt')
assert.equal(mutationResultPath('report.txt', { path: null }), null)
assert.equal(mutationResultPath('report.txt', { path: 'relative.txt' }), null)
assert.equal(mutationResultPath('/workspace/report.txt', { path: 123 }), '/workspace/report.txt')
assert.equal(mutationResultPath(null, { path: '/workspace/report.txt' }), null)
function run(meta, fail = false) {
  const activity = new TurnActivityCompatibility()
  activity.accept({ type: 'turn/start', seq: 1, data: { turn: 1 } })
  const call = { type: 'tool/call', seq: 2, data: { turn: 1, name: 'write', callId: 'c', arguments: '{"file_path":"report.txt","content":"ok"}' } }
  const before = JSON.stringify(call)
  activity.accept(call)
  const view = activity.accept({ type: 'tool/result', seq: 3, data: { turn: 1, meta,
    message: { source: { callId: 'c' }, isError: fail, content: [{ type: 'text', text: 'done' }] } } })
  assert.equal(JSON.stringify(call), before)
  return view
}
assert.deepEqual(run({ path: '/workspace/new/report.txt' }).changedFiles, [{ reference: '/workspace/new/report.txt' }])
assert.deepEqual(run(undefined).changedFiles, [{ reference: 'report.txt' }])
assert.equal(run({ path: '/workspace/new/report.txt' }, true), undefined)
assert.equal(run({ path: 'ambiguous.txt' }), undefined)
console.log('turn activity recorded path: native absolute paths, old-host fallback, invalid metadata, no failed artifacts, unchanged call passed')
