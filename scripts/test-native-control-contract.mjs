/** Structural contract audit against pinned native source. Complements (does
 * not replace) mutation, transport and real-device tests. No network writes. */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import ts from 'typescript'
import { execFileSync } from 'node:child_process'
import { planLegacyRpc, commandArguments } from '../lib/dsh-protocol-compat.js'

const source = process.env.HARNESS_DSH_SOURCE
assert(source, 'HARNESS_DSH_SOURCE is required')
const sha = execFileSync('git', ['-C', source, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()
const owners = {
  session: 'api/session-controller', workspace: 'api/workspace-controller',
  agentPresets: 'preset/agent-preset-registry', settings: 'api/settings-controller',
  commands: 'interaction/commands', subagents: 'subagent/subagent',
  llm: 'llm/llm', pluginInventory: 'host/plugin-inventory', messageFeedback: 'feedback/message-feedback',
  goals: 'goal/goal',
}
const methods = new Map()
for (const [namespace, directory] of Object.entries(owners)) {
  const file = path.join(source, 'packages', directory, 'src/index.ts')
  const tree = ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true)
  function visit(node) {
    if (ts.isMethodDeclaration(node)) {
      const mark = ts.getDecorators(node)?.find(d => d.expression.getText(tree) === 'Remote'
        || ts.isCallExpression(d.expression) && d.expression.expression.getText(tree) === 'Remote')
      if (mark) {
        const arg = ts.isCallExpression(mark.expression) ? mark.expression.arguments[0] : undefined
        const method = arg && ts.isStringLiteral(arg) ? arg.text : node.name.getText(tree)
        const parameters = node.parameters.filter(p => p.type?.getText(tree) !== 'AbortSignal').map(p => ({
          name: p.type?.getText(tree) === 'Agent' ? 'agentId' : p.name.getText(tree),
          optional: Boolean(p.questionToken || p.initializer || p.type?.getText(tree).includes('undefined')),
        }))
        assert(!methods.has(`${namespace}/${method}`), 'ambiguous native owner')
        methods.set(`${namespace}/${method}`, parameters)
      }
    }
    ts.forEachChild(node, visit)
  }
  visit(tree)
}
let checked = 0
function contract(namespace, method, args) {
  const key = `${namespace}/${method}`, fields = methods.get(key)
  assert(fields, `missing native endpoint ${key}`)
  for (const name of Object.keys(args)) assert(fields.some(f => f.name === name), `${key}: unknown wire argument ${name}`)
  for (const f of fields) if (!f.optional) assert(Object.hasOwn(args, f.name), `${key}: missing ${f.name}`)
  checked++
}
const examples = {
  'session.list': {}, 'session.prompt': { sessionId: 's', mode: 'queue', content: [] },
  'session.create': { workspaceId: 'w' }, 'session.selectModel': { sessionId: 's', provider: 'p', model: 'm' },
  'session.cancel': { sessionId: 's' }, 'session.updateQueue': { sessionId: 's' },
  'session.rename': { sessionId: 's', title: 't' }, 'session.fork': { sessionId: 's' },
  'session.search': { query: 'q' }, 'session.attachment': { sessionId: 's', attachmentId: 'a' },
  'host.openPath': { path: 'fixture' },
  'workspace.create': { path: 'fixture' }, 'workspace.delete': { workspaceId: 'w' },
  'workspace.rename': { workspaceId: 'w', title: 't' }, 'workspace.archiveSession': { sessionId: 's' },
  'workspace.insertBefore': {}, 'workspace.insertSessionBefore': {},
  'agentPreset.list': {}, 'agentPreset.select': { sessionId: 's', agentPreset: 'minimal' },
  'settings.update': { ns: 'agent-presets', patch: { default: 'minimal' } },
  'llm.providers': {}, 'llm.models': {}, 'pluginInventory/list': { args: {} },
  'commands/list': { args: { agentId: 's' } },
  'commands/execute': { args: { agentId: 's', line: '/help', images: [] } },
  'messageFeedback/list': { args: { request: { sessionId: 's' } } },
  'messageFeedback/put': { args: { request: { sessionId: 's' } } },
  'messageFeedback/delete': { args: { request: { sessionId: 's' } } },
  'subagents/prompt': { args: { request: { parentSessionId: 's', childSessionId: 'c', delivery: {} } } },
  'subagent.interrupt': { parentSessionId: 's', childSessionId: 'c', mode: 'continuable' },
  'goal.create': { sessionId: 's', objective: 'fixture', maxGoalRounds: 2 },
  'goal.edit': { sessionId: 's', ref: { id: 'g', revision: 1 }, objective: 'fixture' },
  ...Object.fromEntries(['pause', 'resume', 'complete', 'clear'].map(method =>
    [`goal.${method}`, { sessionId: 's', ref: { id: 'g', revision: 1 } }])),
}
for (const [method, payload] of Object.entries(examples)) {
  const plan = planLegacyRpc({ type: 'client-request', rpcId: 'contract', method, payload })
  assert.equal(plan.kind, 'invoke', method)
  const args = method === 'commands/execute'
    ? commandArguments({ commandAttachmentField: () => 'submittedAttachments' }, plan.args) : plan.args
  contract(plan.namespace, plan.method, args)
}
// Multi-step adapter reads, also shared by both Web and Desktop transports.
contract('session', 'modelCatalog', {})
contract('session', 'projections', { request: {} })
contract('session', 'page', { request: {} })
contract('session', 'follow', { request: {} })
contract('session', 'control', {})
contract('workspace', 'follow', {})
contract('settings', 'describe', {})
contract('goals', 'get', { agentId: 's' })
assert(!methods.has('subagents/list'), 'new native catalog is a parent projection, not the retired list method')
console.log(`PASS native control contract ${sha}: ${checked} endpoint/argument checks (structural, not real-model execution)`)
