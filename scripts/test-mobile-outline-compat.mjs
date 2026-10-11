// Cross-repository render contract against the actual mini-program store.
// Use the sibling checkout or HARNESS_REMOTE_MINI_DIR; all input is synthetic.
import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { withPresentationProjections } from '../lib/session-presentation.js'
import { buildBoundedHistoryWindow } from '../lib/history-service.js'

const require = createRequire(import.meta.url)
const mini = process.env.HARNESS_REMOTE_MINI_DIR || fileURLToPath(new URL('../../wechat-miniprogram', import.meta.url))
const { fixture } = require(path.join(mini, 'tests/helpers/realtime-store.js'))
const sidebar = require(path.join(mini, 'utils/workspace-sidebar.js'))
const json = value => JSON.parse(JSON.stringify(value))
function turn(seq, n) {
  return [
    { seq, type: 'turn/start', data: { turn: n } },
    { seq: seq + 1, type: 'user/message', surfaceOp: 'append', data: { id: `u${n}`, role: 'user', source: { kind: 'user' }, content: [{ type: 'text', text: `提问 ${n}` }] } },
    { seq: seq + 2, type: 'assistant/message', surfaceOp: 'append', data: { turn: n, message: { id: `a${n}`, role: 'assistant', content: [{ type: 'text', text: `回复 ${n}` }] } } },
    { seq: seq + 3, type: 'turn/end', data: { turn: n, reason: { kind: 'completed' } } },
  ].map(event => ({ event: { ...event, time: event.seq * 1000 } }))
}
const nativeValues = {
  permissions: { currentValue: 'workspace-write', options: [{ value: 'workspace-write', name: '工作区写入' }, { value: 'full', name: '完全权限' }] },
  sessionStats: { turns: 7, steps: 14, toolMs: 4000, llmMs: 12000 },
  tokenUsage: { uncachedInputTokens: 12000, cacheReadTokens: 24000, cacheWriteTokens: 0, outputTokens: 3000 },
  contextPressure: { pressureTokens: 176000, contextWindow: 1000000 },
  contextBreakdown: { systemTokens: 1000, toolsTokens: 5000, messageTokens: 170000 },
  imageLimits: { maxImageBytes: 1000000, maxImagesPerMessage: 3 },
  plan: { active: true, pending: false },
  todos: [{ content: '核查历史', status: 'in_progress' }],
  goal: { goal: { id: 'g', revision: 1, objective: '完成核查', phase: 'active', maxGoalRounds: 10 }, roundsStarted: 7 },
  futurePluginState: { retain: 'synthetic unknown state' },
}
const outline = n => Array.from({ length: n }, (_, i) => ({ turn: i + 1, seq: i * 4,
  prompt: '问'.repeat(50), response: '答'.repeat(120) }))
function raw(n, omit) {
  const projections = withPresentationProjections({ asOfSeq: 27, values: { ...nativeValues, turnOutline: outline(n) } })
  // Explicitly reconstruct only the previous mobile shape for the control.
  if (!omit) projections.values.turnOutline = outline(n)
  return { events: [...turn(20, 6), ...turn(24, 7)], hasMore: true, historyEndSeq: 27, projections }
}
const bounded = value => buildBoundedHistoryWindow({ sessionId: 's' },
  async () => ({ ok: true, value }), new AbortController().signal)
async function setup(value) {
  const f = fixture(), s = f.addSession('s', true)
  s.lastSeq = undefined
  f.store.state.sessions[0].displayTitle = '原会话'
  f.store.state.workspaces = [{ workspaceId: 'w', title: '原工作区', path: '/synthetic', sessionIds: ['s'] }]
  f.request.callRemote = async (method, args) => {
    assert.equal(method, 'wechatHistory/page')
    const page = args.request.beforeSeq === undefined ? value : {
      events: turn(16, 5), hasMore: false, historyStartSeq: 16, historyEndSeq: 19,
      coverage: { schema: 'wechat.history-page.v1', fromSeq: 16, throughSeq: 19 },
    }
    return { ok: true, value: { payloadJson: JSON.stringify(page) } }
  }
  await f.store.refetchSession('s')
  assert.equal(s.loadState, 'ready')
  return { f, s }
}
function visible({ f, s }) {
  const store = f.store
  return json({ items: s.items, trace: s.trace, hasMore: s.hasMore, from: s.loadedFromSeq, through: s.lastSeq,
    permission: store.permissionInfo('s'), plan: store.planActive('s'), context: store.contextPressure('s'),
    imageLimits: store.imageLimits('s'), stats: store.statsEntries('s'), presentation: store.presentationOf('s'),
    sidebar: sidebar.project(store.state),
    projections: Object.fromEntries(Object.entries(s.projections).filter(([key]) => key !== 'turnOutline')) })
}

test('mobile first page, earlier page, live replies and retained state are identical with/without outline', async () => {
  const old = await bounded(raw(10, false)), current = await bounded(raw(10, true))
  assert(old.ok && current.ok)
  const a = await setup(old.value), b = await setup(current.value), first = visible(b)
  assert.deepEqual(visible(a), first)
  assert.equal(first.items.filter(x => x.kind === 'user').length, 2)
  assert.equal(first.items.filter(x => x.kind === 'assistant').length, 2)
  assert.equal(first.permission.current, 'workspace-write')
  assert.equal(first.context.tokens, 176000)
  assert.equal(first.plan, true)
  assert.equal(first.presentation.goal.text, '完成核查')
  assert.equal(first.presentation.steps[0].text, '核查历史')
  assert.equal(first.sidebar.view.workspaces[0].title, '原工作区')
  assert.equal(first.imageLimits.maxImagesPerMessage, 3)
  await a.f.store.loadOlder('s'); await b.f.store.loadOlder('s')
  assert.deepEqual(visible(a), visible(b))
  assert.equal(b.s.loadedFromSeq, 16); assert.equal(b.s.hasMore, false)
  assert(b.s.items.some(x => x.message?.id === 'u5'))
  for (const target of [a, b]) {
    for (const entry of turn(28, 8)) target.f.event('s', entry.event)
    target.f.frame({ type: 'session/projection', sessionId: 's', key: 'permissions', seq: 31,
      value: { ...nativeValues.permissions, currentValue: 'full' } })
    target.f.frame({ type: 'session/projection', sessionId: 's', key: 'contextPressure', seq: 31,
      value: { pressureTokens: 180000, contextWindow: 1000000 } })
  }
  a.f.frame({ type: 'session/projection', sessionId: 's', key: 'turnOutline', seq: 31, value: outline(11) })
  assert.deepEqual(visible(a), visible(b))
  assert.equal(b.f.store.permissionInfo('s').current, 'full')
  assert.equal(b.f.store.contextPressure('s').tokens, 180000)
  assert(b.s.items.some(x => x.message?.id === 'a8'))
  assert.equal((await bounded(raw(386, false))).ok, false)
  const recovered = await bounded(raw(386, true))
  assert(recovered.ok)
  assert.deepEqual(visible(await setup(recovered.value)), first)
})
