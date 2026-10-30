/** Native tool presentation admission, without taking ownership of an existing
 * Agent's executor. The legacy temporary presentation API remains unchanged. */
import { fail } from './data.js';
export function nativeAutomationToolsSupported(tools, prompt) {
    return typeof tools?.presentAs === 'function'
        || typeof tools?.resolve === 'function' && typeof tools?.setExecutor === 'function' && typeof prompt?.assemble === 'function';
}
/** Legacy hosts offer a reversible presentation lease. Current hosts do not:
 * disposing setExecutor deliberately leaves an unavailable selection. Verify
 * the owning composition's REAL model declarations instead, and never replace
 * that executor. PTC-only/custom transports cannot be widened to direct calls:
 * automation's existing guard forbids nested execution. Dispose temporary
 * step admission before returning; no executor or admission lease survives. */
export async function prepareAutomationTools(agent, names, modelSelection, signal) {
    signal.throwIfAborted();
    const tools = agent.ctx.get('tools');
    if (typeof tools?.presentAs === 'function')
        return tools.presentAs('native');
    const prompt = agent.ctx.get('systemPrompt');
    if (!nativeAutomationToolsSupported(tools, prompt))
        throw fail('automation-unsupported', '宿主没有可核验的原生工具执行接口；手动群任务仍可使用');
    const toolSet = await tools.resolve({ agent, modelSelection, signal });
    try {
        signal.throwIfAborted();
        const assembly = await prompt.assemble({ agent, scope: agent, modelSelection, signal, toolSet });
        signal.throwIfAborted();
        const offered = new Set(Array.isArray(assembly.tools) ? assembly.tools.map((tool) => tool.name) : []);
        if (!names.length || names.some(name => !offered.has(name)))
            throw fail('automation-executor-unsupported', '当前原生工具执行器不支持受限自动处理的直接工具调用');
        return () => { };
    }
    finally {
        toolSet.dispose();
    }
}
