// Synthetic source metadata only; no network, user archives or host mutation.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { build } from 'esbuild'
import { fileURLToPath } from 'node:url'
const built = await build({ entryPoints: [fileURLToPath(new URL('../src/history-import/search.ts', import.meta.url))], bundle: true,
  platform: 'node', format: 'esm', write: false })
const { historySearchSources, historicalSourceText, historicalFragmentText, renderHistoryResponse } = await import('data:text/javascript;base64,' + Buffer.from(built.outputFiles[0].text).toString('base64'))
const result = (url = 'https://example.test/source') => ({ url, title: '合成来源', snippet: '合成摘要', cite_index: null })
const fragment = (type, data = {}, content) => ({ type, data, ...(content === undefined ? {} : { content }) })
const response = (content, references) => fragment('RESPONSE', { id: 9, references }, content)
const message = (...fragments) => ({ id: 'm', fragments })
const open = (id = 2, url) => fragment('TOOL_OPEN', { id, result: result(url), status: 'FINISHED' })
const ref = (id = 2, type = 'TOOL_OPEN') => ({ id, type })

test('zero-based response references resolve the matching fragment, not result position', () => {
  const r = response('正文[reference:0]再引[reference:1]', [ref(), ref()]), m = message(open(), r)
  const before = JSON.stringify(m), text = renderHistoryResponse(m, r)
  assert.equal(text, '正文[来源 1](<https://example.test/source>)再引[来源 2](<https://example.test/source>)')
  assert.equal(JSON.stringify(m), before)
})
test('search reference represents all supplied results and removes duplicate URLs only for display', () => {
  const search = fragment('TOOL_SEARCH', { id: 3, queries: [{ query: '合成问题' }], results: [result(), result('https://example.test/two'), result()] })
  const r = response('[reference:0]', [ref(3, 'TOOL_SEARCH')])
  assert.equal(renderHistoryResponse(message(search, r), r), '[来源 1.1](<https://example.test/source>) [来源 1.2](<https://example.test/two>)')
  assert.equal(historySearchSources(search).length, 3)
})
test('null open result follows an explicit reference and cycles remain unchanged', () => {
  const a = fragment('TOOL_OPEN', { id: 2, result: null, reference: ref(3) }), b = open(3), r = response('[reference:0]', [ref()])
  assert.match(renderHistoryResponse(message(a, b, r), r), /https:/)
  b.data.result = null; b.data.reference = ref()
  assert.equal(renderHistoryResponse(message(a, b, r), r), r.content)
})
test('missing, duplicate, cross-message and wrong-type targets stay visible', () => {
  const r = response('[reference:0][reference:1][reference:2]', [ref(), ref(3), ref(2, 'TOOL_SEARCH')])
  assert.equal(renderHistoryResponse(message(r), r), r.content)
  assert.equal(renderHistoryResponse(message(open(), open(), r), r), r.content)
  const foreign = message(open()); assert.equal(foreign.fragments.length, 1)
  assert.equal(renderHistoryResponse(message(r), r), r.content)
})
test('partially unsafe or unresolved grouped references retain the original citation', () => {
  const group = fragment('TOOL_SEARCH', { id: 3, results: [result(), result('file:///private')] })
  const r = response('[reference:0]', [ref(3, 'TOOL_SEARCH')])
  assert.equal(renderHistoryResponse(message(group, r), r), r.content)
  const forward = fragment('RESPONSE', { id: 3, references: [ref(), ref(999)] }, '')
  r.data.references = [ref(3, 'RESPONSE')]
  assert.equal(renderHistoryResponse(message(open(), forward, r), r), r.content)
})
test('legacy citations require explicit unique cite_index and exports never guess an index', () => {
  const old = fragment('SEARCH', { results: [{ ...result(), cite_index: 7 }] }), r = response('[citation:7] [citation:0]')
  assert.match(renderHistoryResponse(message(old, r), r), /来源 8/)
  assert.match(renderHistoryResponse(message(old, r), r), /\[citation:0\]/)
  delete old.data.results[0].cite_index
  assert.equal(renderHistoryResponse(message(old, r), r), r.content)
})
test('fenced, indented, inline and multiline code plus escaped literals are untouched', () => {
  const text = '\\[reference:0]\n`[reference:0]`\n``x `[reference:0]` x``\n`start\n[reference:0]\nend`\n```md\n[reference:0]\n```\n~~~\n[reference:0]\n~~~\n    [reference:0]\n\t[reference:0]\n正文[reference:0]'
  const r = response(text, [ref()]), output = renderHistoryResponse(message(open(), r), r)
  assert.equal(output, text.replace('正文[reference:0]', '正文[来源 1](<https://example.test/source>)'))
})
test('existing links, images, link definitions and HTML remain unchanged', () => {
  const text = '[link [reference:0]](https://example.test/[reference:0])\n[link]\n(https://example.test/[reference:0])\n[reference:0](https://example.test)\n![reference:0]\n[reference:0]: https://example.test\n<a href="https://example.test">[reference:0]</a>\n<div>\n[reference:0]\n</div>'
  const r = response(text, [ref()])
  assert.equal(renderHistoryResponse(message(open(), r), r), text)
  const standalone = '[reference:0]: https://example.test\n\n[reference:0]\n\n<em>[reference:0]</em>\n\nhttps://example.test/[reference:0]'
  const second = response(standalone, [ref()])
  assert.equal(renderHistoryResponse(message(open(), second), second), standalone)
})
test('nested lists and blockquotes are prose, while nested code still stays untouched', () => {
  const text = '1. 条目\n\n    - 引用[reference:0]\n\n        后续段落[reference:0]\n\n    - ```text\n      [reference:0]\n      ```\n\n> 引用[reference:0]\n>\n> 另一段[reference:0]\n\n普通行<br>引用[reference:0]'
  const r = response(text, [ref()]), out = renderHistoryResponse(message(open(), r), r)
  assert.equal([...out.matchAll(/\[来源 1\]/g)].length, 5)
  assert.equal([...out.matchAll(/\[reference:0\]/g)].length, 1)
  assert(out.includes('      [reference:0]\n      ```'))
})

test('fifty nested-list citations and two blockquote citations are all converted', () => {
  const lines = ['1. 合成条目', '']
  for (let i = 0; i < 25; i++) lines.push('    - 引用[reference:0]', '', '        段落[reference:0]', '')
  lines.push('> 引用[reference:0]', '>', '> 引用[reference:0]')
  const r = response(lines.join('\n'), [ref()]), before = JSON.stringify(r)
  const out = renderHistoryResponse(message(open(), r), r)
  assert.equal([...out.matchAll(/\[来源 1\]/g)].length, 52)
  assert(!out.includes('[reference:0]'))
  assert.equal(JSON.stringify(r), before)
})
test('dangerous, credential-bearing, malformed and whitespace links cannot become links', () => {
  for (const url of ['file:///etc/passwd', 'javascript:alert(1)', 'data:text/html,x', 'https://u:p@example.test', 'https://example.test/\nfoo', '//example.test', 'https://example.test/<tag>', 'https://example.test/\\x']) {
    const o = open(2, url), r = response('[reference:0]', [ref()])
    assert.deepEqual(historySearchSources(o), [])
    assert.equal(renderHistoryResponse(message(o, r), r), r.content)
    assert.match(historicalSourceText(o), /不生成快捷入口/)
  }
})
test('metadata is rendered as escaped readable text rather than JSON or active HTML', () => {
  const item = { ...result('https://example.test/a_(b)'), title: '[evil](javascript:x)<img>', snippet: '*text* & <script>bad</script>', published_at: 1750000000 }
  const f = fragment('SEARCH', { results: [item], queries: [{ query: '[q]\n## header' }] }, '检索原说明')
  const out = historicalSourceText(f)
  assert.match(out, /查询：\\\[q\\\]/); assert.match(out, /&lt;img&gt;/); assert.match(out, /\\\*text\\\*/)
  assert(!out.includes('<script>')); assert(!out.includes('"results":'))
  assert(out.includes('检索原说明'))
  assert.equal(historySearchSources(f)[0].publishedAt, 1750000000)
})
test('empty results, unsupported parts and ZIP open metadata are explicit', () => {
  assert.equal(historicalSourceText(fragment('TOOL_OPEN')), undefined)
  assert.match(historicalSourceText(fragment('TOOL_OPEN', { result: null, status: 'FINISHED' })), /未提供/)
  assert.match(historicalSourceText(fragment('SEARCH', { results: [] })), /未提供/)
  assert.equal(historicalSourceText(fragment('THINK', {}, '思考')), undefined)
  const r = fragment('THINK', { references: [ref()] }, '[reference:0]')
  assert.equal(renderHistoryResponse(message(open(), r), r), r.content)
})

test('TOOL_FIND keeps supplied pattern, status and unfamiliar result fields as literal history, not a native result', () => {
  const f = fragment('TOOL_FIND', { id: 4, pattern: 'Blue', status: 'FINISHED', reference: ref(), matches: [{ line: 9, text: 'Blue waits.' }] })
  const before = JSON.stringify(f), out = historicalSourceText(f)
  assert.match(out, /网页内查找（历史记录，未重新执行）/)
  assert.match(out, /查找内容：Blue/)
  assert(out.includes(JSON.stringify(f.data)))
  assert.deepEqual(historySearchSources(f), [])
  assert.equal(JSON.stringify(f), before)
  const missing = historicalFragmentText(fragment('TOOL_FIND'))
  assert.match(missing, /源数据未提供查找详情/)
  assert(!missing.includes('成功'))
  const failed = historicalFragmentText(fragment('TOOL_FIND', { pattern: 'none', status: 'ERROR' }))
  assert(failed.includes('ERROR')); assert(!failed.includes('FINISHED'))
})

test('unknown data-only fragments are visible inert text and cannot close their literal block', () => {
  const payload = { result: { nested: ['```\n<script>alert(1)</script>', '[download](javascript:x)', 'https://example.test/private'], succeeded: false },
    status: 'UNKNOWN', arbitrary: null }
  const f = fragment('TOOL_FUTURE', payload), before = JSON.stringify(f), out = historicalFragmentText(f)
  assert.match(out, /^网页原记录 TOOL\\_FUTURE（历史记录，未重新执行）/)
  assert(out.includes(JSON.stringify(payload)))
  assert(out.includes('\n\n````\n')); assert(out.endsWith('\n````'))
  assert(!out.includes('](<')); assert(!out.includes('成功'))
  assert.equal(JSON.stringify(f), before)
  assert.equal(historicalFragmentText(fragment('TOOL_FUTURE')), undefined)
  for (const type of ['REQUEST', 'RESPONSE', 'THINK', 'FILE', 'SEARCH', 'TOOL_SEARCH', 'TOOL_OPEN', 'TIP']) {
    assert.equal(historicalFragmentText(fragment(type, payload, '已有处理路径')), undefined)
  }
})

test('generic historical rendering remains bounded rather than dropping oversized metadata', () => {
  const f = fragment('TOOL_FUTURE', { result: 'x'.repeat(24 * 1024 * 1024) })
  assert.throws(() => historicalFragmentText(f), error => error.code === 'conversation-too-large')
  assert.equal(f.data.result.length, 24 * 1024 * 1024)
})
test('large source details and expanded links are bounded without editing original data', () => {
  const f = fragment('TOOL_SEARCH', { id: 3, results: Array.from({ length: 257 }, () => result()) })
  assert.equal(historySearchSources(f).length, 257); assert.match(historicalSourceText(f), /257\./)
  const large = fragment('SEARCH', { results: [{ ...result(), snippet: 'x'.repeat(131073) }] })
  assert.equal(historySearchSources(large)[0].snippet.length, 131073); assert(historicalSourceText(large).includes(large.data.results[0].snippet))
  const tooLarge = fragment('SEARCH', { results: [{ ...result(), snippet: 'x'.repeat(24 * 1024 * 1024 + 1) }] })
  assert.throws(() => historicalSourceText(tooLarge), error => error.code === 'conversation-too-large')
  assert.throws(() => historySearchSources(tooLarge), error => error.code === 'conversation-too-large')
  const r = response('[reference:0]'.repeat(40000), [ref()])
  assert.equal(renderHistoryResponse(message(open(), r), r), r.content)
  const oversized = response('x'.repeat(1048577) + '[reference:0]', [ref()])
  assert.equal(renderHistoryResponse(message(open(), oversized), oversized), oversized.content)
})

test('over 4096 markers bypass expensive parsing without truncating any original text', () => {
  const r = response('前缀' + '[reference:0]'.repeat(4097) + '后缀', [ref()])
  assert.equal(renderHistoryResponse(message(open(), r), r), r.content)
})
