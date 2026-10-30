// Exercise the shipped worker and its real Node launch contract, with synthetic
// public-share-shaped data only. No files, profiles or network are opened.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { parseImportSource } from '../lib/history-import/parse.js'
import { readPublicShare } from '../lib/history-import/share.js'
import { importError } from '../lib/history-import/errors.js'

const source = { title: '合成会话', messages: [{ message_id: 1, parent_id: null, role: 'USER',
  fragments: [{ type: 'REQUEST', content: '保留原文' }] }] }

test('shipped worker parses bounded source and rejects cancellation before spawn', async () => {
  const result = await parseImportSource(Buffer.from(JSON.stringify(source)), new AbortController().signal)
  assert.equal(result.source.conversations.length, 1)
  assert.equal(result.source.conversations[0].messages[0].text, '保留原文')
  const aborted = new AbortController(); aborted.abort()
  assert.throws(() => parseImportSource(Buffer.from('{}'), aborted.signal))
})

test('worker does not inherit a host CLI input-type flag', () => {
  const moduleUrl = new URL('../lib/history-import/parse.js', import.meta.url).href
  const script = `import { parseImportSource } from ${JSON.stringify(moduleUrl)};
    const result = await parseImportSource(Buffer.from(${JSON.stringify(JSON.stringify(source))}), new AbortController().signal);
    console.log(result.source.conversations[0].messages[0].text);`
  const output = execFileSync(process.execPath, ['--input-type=module', '-e', script], {
    encoding: 'utf8', windowsHide: true, timeout: 30_000, maxBuffer: 8192,
  })
  assert.equal(output.trim(), '保留原文')
})

test('share deadline is not misreported as user cancellation during download', async () => {
  for (const timeout of [true, false]) {
    const abort = new AbortController()
    const pending = readPublicShare('https://chat.deepseek.com/share/SyntheticTimeout', abort.signal,
      async (_url, { signal }) => new Promise((_resolve, reject) => {
        signal.addEventListener('abort', () => reject(signal.reason), { once: true })
      }))
    abort.abort(timeout ? new DOMException('private internal deadline', 'TimeoutError') : new Error('private cancellation reason'))
    await assert.rejects(pending, error => {
      assert.equal(error.message, timeout ? 'share-timeout' : 'cancelled')
      assert(!JSON.stringify(importError(error)).includes('private'))
      return true
    })
  }
})

test('parser deadline and user cancellation remain distinct before and after worker launch', async () => {
  for (const sourceKind of [undefined, 'share']) for (const timeout of [true, false]) for (const preAborted of [true, false]) {
    const abort = new AbortController(), reason = timeout
      ? new DOMException('private internal deadline', 'TimeoutError') : new Error('private cancellation reason')
    const expected = timeout ? sourceKind === 'share' ? 'share-timeout' : 'parse-timeout' : 'cancelled'
    const check = error => { assert.equal(error.message, expected); assert(!JSON.stringify(importError(error)).includes('private')); return true }
    if (preAborted) {
      abort.abort(reason)
      assert.throws(() => parseImportSource(Buffer.from(JSON.stringify(source)), abort.signal, sourceKind), check)
    } else {
      const pending = parseImportSource(Buffer.from(JSON.stringify(source)), abort.signal, sourceKind)
      abort.abort(reason)
      await assert.rejects(pending, check)
    }
  }
})
