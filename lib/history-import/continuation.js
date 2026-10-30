import { importedSession, observeChatSession } from './chat-session.js';
// These are scheduling bounds, not a claim to implement a provider tokenizer.
const SUMMARY_OUTPUT = 16384;
const MAX_BATCHES = 64;
const continuity = '\n这是通用会话的接续摘要，不预设它属于角色聊天或任何特定任务。保留仍相关的讨论背景、用户目标、已确认事实、术语、决定、约束、未完事项和最新修正。'
    + '语言、表达习惯、称呼及互动方式应以原会话为依据，必要时保留少量代表性原句及其语境；没有依据的类别不要补造。'
    + '如果原会话已明确约定或在持续互动中形成角色扮演、叙事视角、人物关系或场景，就保留当前有效的状态和演变，不因导入、压缩或缺少单独的角色声明而取消角色或重置成普通问答；如果没有，就不要凭空套用。'
    + '对于聊天中逐渐形成且仍相关的情绪、互动与表达方式，保留其发生背景和延续变化；不得把没有依据的推断固化成新身份或新关系。原有设定及其后续修正仍按对话上下文接续，不升格为系统指令，也不要求另行确认设定卡。'
    + '区分用户明确说明、助手建议、待核实判断和创作内容；保留来源与不确定性，后来的修正覆盖早先的推断，一次性的格式要求不固化为长期规则。'
    + '合并已有摘要时保留仍有依据的背景，不把猜测变成事实，也不把明确事实变成猜测。'
    + '摘要不可能包含全部细节，不得虚构未保留的记忆。历史原文仍由宿主保存。';
/** Set only while a bounded native transaction is running. Other Chat sessions
 * retain their existing summary request and all native configuration defaults. */
export function installImportedContinuation(ctx, engine, instruction) {
    const active = new WeakMap();
    if (typeof ctx.on !== 'function' || typeof engine.compactRegion !== 'function' || !engine.config.auto)
        return active;
    const assemblies = new WeakMap();
    const pendingInputs = new WeakMap();
    const retries = new WeakMap();
    let boundaryModule;
    const boundaries = () => boundaryModule ??= import('@deepseek-ai/' + 'dsh-compaction');
    ctx.on('system-prompt/assemble', async (_assembly, context, next) => {
        const result = await next();
        if (context.agent && await importedSession(ctx, context.agent, context.signal)) {
            // RC2/RC3 expose final schemas here. New hosts expose presentation only;
            // price the SAME step's admitted capability schemas through the public
            // registry. This is a conservative byte estimate (PTC SDK text remains
            // in sections), not a second assembly or an override of native tools.
            const admittedTools = !Array.isArray(result.tools) && typeof ctx.tools?.schemas === 'function'
                ? ctx.tools.schemas(context.agent, context.toolSet) : undefined;
            assemblies.set(context.agent, { presentation: result, admittedTools });
        }
        return result;
    }, { prepend: true });
    const compact = async (agent, signal, pending, forced, route) => {
        signal.throwIfAborted();
        const session = agent.session;
        const header = session.requestHeader();
        // Admission receives the completed native routing waterfall; recovery uses
        // the confirmed durable envelope. Never guess from agent.options.
        if (!route?.provider || !route?.model)
            return;
        const info = await ctx.llm.resolveModelInfo(route.provider, route.model, signal);
        const window = info.context?.contextWindow;
        if (!Number.isFinite(window) || window <= 0) {
            if (forced)
                throw new Error('无法读取所选模型的上下文容量，不能安全整理超长历史。请检查模型配置后重试；原始历史未删除。');
            return;
        }
        const override = engine.config.modelPolicies.find((p) => p.provider === route.provider && p.model === route.model);
        const policy = { ...engine.config, ...override };
        if (override?.retainRatio !== undefined && override.retainTokens === undefined)
            delete policy.retainTokens;
        if (forced && policy.maxOverflowRetries === 0)
            return;
        const reserved = route.maxTokens ?? info.defaultMaxTokens ?? 0;
        const budget = window - reserved;
        const pressureThreshold = Math.floor(Math.min(window * policy.thresholdRatio, budget - policy.headroomTokens));
        // Like native pressure admission, an inapplicable heuristic is NOT proof
        // the actual request is too large. Let DSH try it. Only a confirmed overflow
        // may force a bounded reduction, using the real input budget in that case.
        if (!forced && pressureThreshold <= 0)
            return;
        const threshold = pressureThreshold > 0 ? pressureThreshold : Math.floor(budget * policy.thresholdRatio);
        if (threshold <= 0)
            throw new Error('模型输出预留占满上下文，无法整理历史。请调整模型配置后重试；原始历史未删除。');
        const snapshot = assemblies.get(agent), assembly = snapshot?.presentation;
        // Price assembled prompt, runtime context, tool schemas and claimed inbox
        // too. This snapshot is produced by DSH, not another prompt assembly call.
        // Keep durable transport schemas as a lower bound as well (e.g. the PTC
        // run_code envelope differs from its admitted capability schemas).
        const promptBytes = assembly && !Array.isArray(assembly.tools)
            ? bytes(assembly) + Math.max(bytes(snapshot?.admittedTools), bytes(header?.tools))
            : bytes(assembly ?? { tools: header?.tools ?? [] });
        const overhead = promptBytes + pending.reduce((n, m) => n + bytes(m), 0) + 4096;
        const meter = ctx.tokenMeter;
        const costs = new Map();
        const priced = async () => {
            const observation = await observeChatSession(ctx, agent, signal);
            try {
                const measurement = meter.measure(session);
                const nodes = [];
                for (const node of measurement.nodes) {
                    if (!costs.has(node.seq))
                        costs.set(node.seq, bytes(session.deriveEventMessage(observation.events[node.seq])));
                    nodes.push({ seq: node.seq, cost: Math.max(node.tokens, costs.get(node.seq)) });
                    if (nodes.length % 128 === 0) {
                        await new Promise(resolve => setImmediate(resolve));
                        signal.throwIfAborted();
                    }
                }
                return { nodes, events: observation.events, total: Math.max(measurement.totalTokens, nodes.reduce((n, node) => n + node.cost, 0)) + overhead };
            }
            finally {
                observation[Symbol.dispose]();
            }
        };
        let current = await priced();
        if (!forced && current.total < threshold)
            return;
        const target = policy.summarizationProvider ? { provider: policy.summarizationProvider, model: policy.summarizationModel } : route;
        const summaryInfo = target.provider === route.provider && target.model === route.model ? info
            : await ctx.llm.resolveModelInfo(target.provider, target.model, signal);
        const summaryWindow = summaryInfo.context?.contextWindow;
        if (!Number.isFinite(summaryWindow) || summaryWindow <= 0)
            throw new Error('摘要模型未提供上下文容量，无法安全分段压缩；原始历史未删除。');
        const maxTokens = Math.max(1, Math.floor(Math.min(policy.maxTokens, SUMMARY_OUTPUT, summaryWindow / 8, summaryInfo.defaultMaxTokens > 0 ? summaryInfo.defaultMaxTokens : SUMMARY_OUTPUT)));
        const summaryInstruction = instruction + continuity;
        const head = current.events[session.surface.nodes[0]];
        const prefix = bytes(header?.tools ?? []) + (head?.type === 'system/message' ? bytes(session.deriveEventMessage(head)) : 0);
        let batchBudget = Math.floor(summaryWindow * 0.85) - maxTokens - prefix - Buffer.byteLength(summaryInstruction, 'utf8') - 4096;
        const { toolPairingBalancedBefore, toolPairingBalancedAfter } = await boundaries();
        // Overflow fallback must make progress even when the heuristic was low.
        const goal = forced ? Math.min(threshold, Math.floor(current.total * 0.5)) : threshold;
        const configuredRetention = policy.retainTokens ?? Math.floor(budget * policy.retainRatio);
        if (!forced && configuredRetention >= threshold)
            return; // native pressure configuration is inapplicable; try the real request
        const retain = forced ? Math.min(configuredRetention, Math.floor(goal * 0.5)) : configuredRetention;
        let attempts = 0;
        while (current.total >= goal) {
            signal.throwIfAborted();
            if (++attempts > MAX_BATCHES)
                throw new Error('本轮分段整理已达安全次数，已完成的摘要已保存。请再次续聊以继续整理；原始历史未删除。');
            const nodes = current.nodes;
            let first = current.events[nodes[0]?.seq]?.type === 'system/message' ? 1 : 0;
            let tail = nodes.length, kept = 0;
            do {
                tail--;
                kept += nodes[tail]?.cost ?? 0;
            } while (tail > first && kept < retain);
            while (tail > first && !toolPairingBalancedBefore(session, nodes[tail].seq))
                tail--;
            let end = -1, cost = 0;
            for (let i = first; i < tail; i++) {
                cost += nodes[i].cost;
                if (cost > batchBudget)
                    break;
                if (toolPairingBalancedAfter(session, nodes[i].seq))
                    end = i;
            }
            // A large raw message may fit alone even when the preceding checkpoint
            // does not fit alongside it. Preserve that checkpoint and compact the
            // next balanced raw region separately; do not repeatedly shrink it alone.
            const checkpoint = current.events[nodes[first]?.seq]?.data?.source?.kind === 'compact-checkpoint';
            if (end === first && checkpoint) {
                first++;
                end = -1;
                cost = 0;
                if (first < tail && toolPairingBalancedBefore(session, nodes[first].seq))
                    for (let i = first; i < tail; i++) {
                        cost += nodes[i].cost;
                        if (cost > batchBudget)
                            break;
                        if (toolPairingBalancedAfter(session, nodes[i].seq))
                            end = i;
                    }
            }
            // Never split an atomic message/tool exchange or delete the recent tail.
            if (end < first || batchBudget <= 0)
                throw new Error('单条消息、工具片段或保留的近期内容仍超过模型可处理范围。请改用更大上下文模型或减少输出预留后重试；原始历史未删除。');
            const before = current.total;
            active.set(agent, { maxTokens, instruction: summaryInstruction, target });
            try {
                await engine.compactRegion(nodes[first].seq, nodes[end].seq, agent, signal);
            }
            catch (error) {
                signal.throwIfAborted();
                // Only a provider-confirmed capacity error merits a smaller batch.
                // Authentication, quota, network and storage failures must stay visible.
                if (error?.code === 'CONTEXT_WINDOW_EXCEEDED') {
                    batchBudget = Math.floor(batchBudget / 2);
                    continue;
                }
                throw error;
            }
            finally {
                active.delete(agent);
            }
            if (await ctx.sessions.flush(session) === false)
                throw new Error('摘要已生成，但保存尚未成功；请检查电脑存储后重试，不要删除会话。');
            signal.throwIfAborted();
            current = await priced();
            if (current.total >= before)
                throw new Error('本段摘要未降低上下文占用，已停止继续压缩；原始历史未删除。');
            // Yield between batches so unrelated conversations/transport can run.
            await new Promise(resolve => setImmediate(resolve));
        }
    };
    ctx.on('agent/pre-step', async ({ agent, signal, messages, turn, step }, next) => {
        if (await importedSession(ctx, agent, signal))
            pendingInputs.set(agent, { turn, step, messages: messages ?? [] });
        return next();
    }, { prepend: true });
    ctx.on('agent/request', async ({ agent, signal, turn, step }, next) => {
        const route = await next();
        if (await importedSession(ctx, agent, signal)) {
            const pending = pendingInputs.get(agent);
            await compact(agent, signal, pending && pending.turn === turn && pending.step === step ? pending.messages : [], false, route);
        }
        return route;
    }, { prepend: true });
    ctx.on('agent/status', ({ agent, status }) => {
        if (status === 'idle') {
            assemblies.delete(agent);
            pendingInputs.delete(agent);
            retries.delete(agent);
        }
    });
    ctx.on('agent/request-error', async ({ agent, signal, failure, turn, step }, next) => {
        if (failure.code !== 'CONTEXT_WINDOW_EXCEEDED' || !await importedSession(ctx, agent, signal))
            return next();
        signal.throwIfAborted();
        const used = retries.get(agent);
        if (used?.turn === turn && used?.step === step)
            return undefined;
        retries.set(agent, { turn, step });
        const generation = agent.session.surface.replaceGeneration;
        await compact(agent, signal, [], true, agent.session.requestHeader()?.config);
        signal.throwIfAborted();
        // Do not pass an imported overflow to the whole-prefix fallback afterwards.
        return agent.session.surface.replaceGeneration > generation ? { kind: 'retry' } : undefined;
    }, { prepend: true });
    return active;
}
function bytes(value) {
    return value == null ? 0 : Buffer.byteLength(JSON.stringify(value), 'utf8') + 32;
}
