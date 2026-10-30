import { test } from 'node:test'
import assert from 'node:assert/strict'
import { build } from 'esbuild'
import { fileURLToPath } from 'node:url'

const built = await build({ entryPoints: [fileURLToPath(new URL('../src/private-resources/chat-memory.ts', import.meta.url))], bundle: true,
  platform: 'node', format: 'esm', write: false })
const { installChatMemory, recallQueryParts } = await import('data:text/javascript;base64,' + Buffer.from(built.outputFiles[0].text).toString('base64'))
const user = text => ({ type: 'user/message', data: { source: { kind: 'user' }, content: [{ type: 'text', text }] } })
function fixture(rows) {
  const events = [{ type: 'harness-remote/history-import/source', data: {} }, ...rows].map((e, seq) => ({ ...e, seq }))
  const agent = { id: 'current', session: { id: 'current', header: { id: 'current' }, eventAt: seq => events[seq] } }
  const definitions = []
  const ctx = { agents: { get: id => id === agent.id ? agent : undefined }, tools: { register: tool => definitions.push(tool) },
    sessions: { get: id => id === agent.id ? agent.session : undefined },
    sessionQuery: { observeSession: async () => ({ source: 'live', header: agent.session.header, events, [Symbol.dispose]() {} }) },
    sessionProjections: { stateOf: () => ({ openTurnStartSeq: events.length }) },
    systemPrompt: { section() {}, getSectionOrder: () => 1, variable() {}, context() {} }, on() {} }
  installChatMemory(ctx, {
    // Mirrors the host distinction: generic extraction can include tool names
    // and arguments; the product adapter must remove non-visible blocks first.
    extractSessionEventText: e => (e.data.message ?? e.data).content.map(b => b.text ?? b.arguments ?? '').join('\n'),
    compileSessionTextFilter: q => new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'),
  })
  return { search: args => definitions[0].execute(args, { agent, signal: new AbortController().signal }),
    read: args => definitions[1].execute(args, { agent, signal: new AbortController().signal }) }
}
test('query components are bounded lexical clues, not a hardcoded synonym list', () => {
  assert(recallQueryParts(['船名']).includes('名'))
  assert(recallQueryParts(['信尾']).includes('信'))
  assert(!recallQueryParts(['boat']).includes('舟'))
  assert(!recallQueryParts(['TOKEN_82937']).includes('T'))
  assert(recallQueryParts(['汉字'.repeat(60), '搜索'.repeat(60)]).length <= 24)
})
test('zero literal hits can return labeled component candidates', async () => {
  const f = fixture([user('我想给小舟留个名字。')])
  const result = await f.search({ query: '船名' })
  assert.equal(result.matchMode, 'word-components')
  assert.equal(result.hits[0].matchKind, 'broad-candidate-not-confirmed')
  assert.deepEqual(result.hits[0].matchedParts, ['名'])
  assert.equal(result.hasMore, false)
})
test('fallback pagination does not claim omitted candidates are exhausted', async () => {
  const f = fixture(Array.from({ length: 20 }, (_, i) => user(`第${i}个名字`)))
  const first = await f.search({ query: '船名' })
  assert.equal(first.hits.length, 8); assert(first.hasMore)
  const second = await f.search({ query: '船名', before_seq: first.nextBeforeSeq })
  const third = await f.search({ query: '船名', before_seq: second.nextBeforeSeq })
  const seqs = [...first.hits, ...second.hits, ...third.hits].map(h => h.seq)
  assert.equal(new Set(seqs).size, 20); assert.equal(third.hasMore, false)
})
test('literal hits retain precedence and exact offset', async () => {
  const f = fixture([user('长信开头。' + '填充'.repeat(500) + '末尾礼物是风铃。'), user('没有别的赠物')])
  const result = await f.search({ query: '礼物', alternatives: ['长信'] })
  assert.equal(result.matchMode, 'literal'); assert(result.hits[0].excerpt.includes('风铃'))
})

test('multiple distant matches share one bounded excerpt budget', async () => {
  const body = '长信开头。' + '填充'.repeat(500) + '末尾礼物是风铃。'
  const result = await fixture([user(body)]).search({ query: '长信', alternatives: ['礼物'] })
  const hit = result.hits[0], windows = [hit, ...hit.additionalExcerpts]
  assert(windows.some(w => w.excerpt.includes('长信')))
  assert(windows.some(w => w.excerpt.includes('风铃')))
  assert(windows.reduce((n, w) => n + w.excerpt.length, 0) <= 600)
  for (const w of windows) assert.equal(w.excerpt, body.slice(w.offset, w.offset + w.excerpt.length))
  assert.equal((await fixture([user(body)]).read({ seq: 1 })).text, body)
})

test('unhelpful exact alternatives do not hide broad primary candidates', async () => {
  const result = await fixture([user('一封长信。'), user('小舟的名字。')]).search({ query: '信尾', alternatives: ['小舟'] })
  assert.equal(result.matchMode, 'literal')
  assert(result.hits[0].excerpt.includes('小舟'))
  assert(result.relatedCandidates[0].excerpt.includes('长信'))
  assert.equal(result.relatedCandidates[0].matchKind, 'broad-candidate-not-confirmed')
  assert.equal(result.relatedHasMore, false)
})

test('related candidate pagination exposes older originals without false exhaustion', async () => {
  const f = fixture([...Array.from({ length: 12 }, (_, i) => user(`第${i}封信`)), user('小舟的名字')])
  const first = await f.search({ query: '信尾', alternatives: ['小舟'] })
  assert.equal(first.relatedCandidates.length, 4); assert(first.relatedHasMore)
  const second = await f.search({ query: '信尾', alternatives: ['小舟'], before_seq: first.relatedNextBeforeSeq })
  const seqs = [...first.relatedCandidates, ...second.hits].map(h => h.seq)
  assert.equal(new Set(seqs).size, 12); assert.equal(second.hasMore, false)
})
test('assistant search arguments and reasoning are never recalled as visible evidence', async () => {
  const f = fixture([{ type: 'assistant/message', data: { message: { content: [
    { type: 'tool-call', arguments: 'PRIVATE_QUERY_SENTINEL' }, { type: 'reasoning', text: 'PRIVATE_REASONING_SENTINEL' },
    { type: 'text', text: '可见的原文。' },
  ] } } }])
  for (const query of ['PRIVATE_QUERY_SENTINEL', 'PRIVATE_REASONING_SENTINEL']) assert.equal((await f.search({ query })).hits.length, 0)
  assert.equal((await f.read({ seq: 1 })).text, '可见的原文。')
})
