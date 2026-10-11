// Exercise the shipped worker and its real Node launch contract, with synthetic
// public-share-shaped data only. No files, profiles or network are opened.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { parseImportSource } from '../lib/history-import/parse.js'

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
