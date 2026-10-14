import { realpathSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resourceError } from './contract.js';
/** Only shipped local code can supply native runtime capabilities. A resource
 * supplies literal authored prompts, never executable modules or templates. */
export function nativeChatCompactionModule() {
    const own = realpathSync(new URL('./chat-compaction.js', import.meta.url));
    const resolve = createRequire(import.meta.url).resolve;
    for (const name of ['dsh-wechat-remote/resource-library/chat-compaction', '@harness-remote/dsh-wechat-remote/resource-library/chat-compaction']) {
        try {
            if (realpathSync(resolve(name)) === own)
                return name;
        }
        catch { /* Try only our supported package layouts. */ }
    }
    throw resourceError('resource-host-unavailable', '当前插件尚未提供 Chat 运行组件，请更新插件。');
}
/** No standalone preset or base identity: the resource library owns the whole
 * composition and its lifecycle, exactly as it owns every delivered preset. */
export function resourceChatComposition(resource, modules, promptVariable) {
    return [
        { id: 'persona', name: '@deepseek-ai/dsh-persona', config: { prefix: `{{${promptVariable}}}`, suffix: '', complete: false } },
        { id: 'harness-private-resource-data', name: modules.prompt, config: { text: resource.systemPrompt } },
        { id: 'tool-web', name: '@deepseek-ai/dsh-tool-web', config: { fetch: true, searchTimeoutMs: 60000 } },
        { id: 'compaction', name: 'cordis:group', group: true, isolate: { compaction: true, toolResultPruner: true }, config: [
                { id: 'compaction-basic', name: modules.compaction, config: { instruction: resource.compactionPrompt } },
                { id: 'command-compact', name: '@deepseek-ai/dsh-command-compact' },
            ] },
    ];
}
