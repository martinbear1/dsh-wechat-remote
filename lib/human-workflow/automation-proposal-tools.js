import { exact, fail, plain, row, sameScope } from './data.js';
const text = { type: 'string' }, integer = { type: 'integer' };
/** Ordinary Agent may propose/read, never approve, pause, dispatch or publish.
 * This does not register the three private automatic-turn execution tools. */
export function automationProposalTools(options) {
    const scope = (exec) => {
        exec.signal.throwIfAborted();
        options.assertAgent(exec);
        const header = exec.agent?.session?.header;
        if (!header || header.id !== exec.agent?.id || !Number.isSafeInteger(header.createdAt) || !plain(String(header.id), 256))
            throw fail('workflow-scope-invalid', '需要真实原会话身份');
        return { nodeId: options.nodeId, sessionId: String(header.id), sessionGeneration: String(header.createdAt) };
    };
    const taskRef = { type: 'object', properties: { schema: { type: 'string', const: 'human.task.ref.v1' }, taskId: text, deliveryId: text }, required: ['schema', 'taskId', 'deliveryId'], additionalProperties: false };
    const output = { schema: { type: 'object' }, render: (_args, value) => [{ type: 'text', text: JSON.stringify(value) }] };
    return [{ name: 'human_automation_propose', description: 'After discussing WHEN and HOW to process with the owner, propose a data-only task rule. This only saves a draft; it NEVER enables, disables, approves or runs automation. Owner must open current-session group task management, preview the exact rule and approve. Use manual for no automation; per-submission for each submission; all-recipients waits for 1..100 explicitly chosen REAL participantRefs from human_task_lifecycle, then freezes each latest accepted submission once and processes separately (not a combined cross-person summary). Use expectedRevision from human_automation_rules. Never infer the whole group roster, fabricate refs, or include other-session tasks. maxRuns 1..100 (>= roster size), timeoutSeconds30..600, concurrency1; these are NOT cost/token limits. existing new-only uses approval server time, include-existing must be explicit.',
            parameters: { type: 'object', properties: { taskRef, expectedRevision: integer, config: { type: 'object', properties: {
                            trigger: { type: 'string', enum: ['manual', 'per-submission', 'all-recipients'] }, roundId: text, instructions: text,
                            existing: { type: 'string', enum: ['new-only', 'include-existing'] }, allowSessionResume: { type: 'boolean' }, maxRuns: integer, timeoutSeconds: integer,
                            concurrency: { type: 'integer', const: 1 }, recipientRefs: { type: 'array', items: text },
                        }, required: ['trigger', 'roundId', 'instructions', 'existing', 'allowSessionResume', 'maxRuns', 'timeoutSeconds', 'concurrency'], additionalProperties: false } }, required: ['taskRef', 'config', 'expectedRevision'], additionalProperties: false }, output,
            execute: async (value, exec) => {
                if (!row(value) || !exact(value, ['taskRef', 'config', 'expectedRevision']))
                    throw fail('automation-input-invalid', '处理规则参数无效');
                const origin = scope(exec), result = await options.runtime.propose(origin, value.taskRef, { config: value.config, expectedRevision: value.expectedRevision }, exec.signal);
                if (!sameScope(origin, scope(exec)))
                    throw fail('workflow-scope-invalid', '原生会话代次已变化');
                return result;
            } }, { name: 'human_automation_rules', description: 'Read this task current policy revision and proposed rule before discussing changes. No execution, approval or private member result access. Use current policy.revision (or 0) when drafting. Task callbacks remain original-session scoped; native workspace files keep DSH sharing semantics.',
            parameters: { type: 'object', properties: { taskRef }, required: ['taskRef'], additionalProperties: false }, output,
            execute: async (value, exec) => {
                if (!row(value) || !exact(value, ['taskRef']))
                    throw fail('automation-input-invalid', '处理规则参数无效');
                const origin = scope(exec), proposals = await options.runtime.proposals(origin, value.taskRef, exec.signal);
                const policy = options.runtime.policies(origin).find(p => p.taskRef.taskId === value.taskRef.taskId);
                if (!sameScope(origin, scope(exec)))
                    throw fail('workflow-scope-invalid', '原生会话代次已变化');
                return { ...proposals, policy: policy ? { revision: policy.revision, state: policy.state, config: policy.config } : null };
            } }];
}
