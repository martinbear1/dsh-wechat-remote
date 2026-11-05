import assert from 'node:assert/strict'
import test from 'node:test'
import { build } from 'esbuild'
import { fileURLToPath } from 'node:url'

const source = await build({ entryPoints: [fileURLToPath(new URL('../src/tool-record-presentation.ts', import.meta.url))],
  bundle: true, write: false, platform: 'node', format: 'esm', target: 'node22' })
const { toolRecordPresentation } = await import('data:text/javascript;base64,' + Buffer.from(source.outputFiles[0].text + '\n//# sourceURL=tool-record-location-fixture.mjs').toString('base64'))

test('partial apply_patch result retains native stopped marker, actual text and successful diffs', () => {
  const input = { event: { type: 'tool/result', data: { message: { content: [{ type: 'text', text: 'Partial changes' }] },
    meta: { stopped: true, diffs: [{ path: '/changed.txt', oldText: 'old', newText: 'new' }], private: 'not forwarded' } } } }
  const before = JSON.stringify(input), output = toolRecordPresentation(input)
  assert.equal(output.event.data.meta.stopped, true)
  assert.deepEqual(output.event.data.meta.diffs, input.event.data.meta.diffs)
  assert.equal(output.event.data.meta.private, undefined)
  assert.deepEqual(output.event.data.message, input.event.data.message)
  assert.equal(JSON.stringify(input), before)
})

test('operation-time cwd survives mobile projection without exposing unrelated metadata or changing history', () => {
  for (const cwd of ['/work/sub', 'C:\\work\\sub', '\\\\host\\share\\sub']) {
    const input = { event: { seq: 7, type: 'tool/result', data: { turn: 1,
      message: { role: 'tool', toolCallId: 'terminal', source: { kind: 'tool', callId: 'terminal' }, content: [{ type: 'text', text: 'ok' }] },
      meta: { cwd, path: cwd + '/report.txt', internalTrace: 'private diagnostic' } } } }
    const before = structuredClone(input)
    const output = toolRecordPresentation(input)
    assert.deepEqual(output.event.data.meta, { cwd, path: cwd + '/report.txt' })
    assert.deepEqual(input, before)
    assert.deepEqual(toolRecordPresentation(output), output)
  }
})

test('legacy and malformed metadata are not promoted to a fabricated execution directory', () => {
  for (const meta of [undefined, {}, { path: '/work/file' }, { cwd: null }, { cwd: 'relative' }]) {
    const input = { event: { type: 'tool/result', data: { meta } } }
    const output = toolRecordPresentation(input)
    assert.equal(output.event.data.meta?.cwd, meta?.cwd)
    assert.equal(Object.hasOwn(output.event.data.meta || {}, 'cwd'), Object.hasOwn(meta || {}, 'cwd'))
  }
})
