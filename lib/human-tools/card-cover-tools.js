import { cardCoverSource } from './card-cover-assets.js';
import { exact, fail, row, sameScope } from '../human-workflow/data.js';
const object = (properties) => ({ type: 'object', properties, required: Object.keys(properties), additionalProperties: false });
export function cardCoverTool(nodeId, assets, assertAgent) {
    const scope = (exec) => {
        const session = exec.agent?.session;
        if (!session || exec.agent?.id !== session.id || session.header?.id !== session.id || !Number.isSafeInteger(session.header.createdAt))
            throw fail('cover-scope-invalid', '封面需要当前真实会话');
        return { nodeId, sessionId: String(session.id), sessionGeneration: String(session.header.createdAt) };
    };
    return { name: 'human_card_cover_prepare', description: 'Safely prepare one existing finished PNG/JPEG as an immutable PUBLIC group-card cover. Use source.kind=attachment with an exact current-session attachmentId, or workspace with an explicitly authorized relative reference inside this session workspace. To create artwork, first use whichever tools are actually available on this computer; this plugin supplies no fonts, drawing engine, templates or image generator and requires no particular creation tool. Never guess private submission attachments or absolute paths. Input and normalized output must be <=2MiB, 5:4 and <=2048 pixels per side; normalization removes metadata, never silently crops. Pass the exact returned asset as cover to human_surface_share/human_task_create or public round content.cover. Omit cover to keep the default image. The owner must preview the final image and approve public sharing. Upload only stages a private temporary asset, not a group message. Same root call recovers the exact saved image, not a replacement. No URLs, scripts or hidden private text.',
        parameters: object({ source: { oneOf: [object({ kind: { type: 'string', const: 'attachment' }, attachmentId: { type: 'string', description: 'Exact current-session native image reference, explicitly chosen for public use.' } }),
                    object({ kind: { type: 'string', const: 'workspace' }, reference: { type: 'string', description: 'Explicit relative workspace path; no URL, absolute path, .., or symlink escape.' } })] } }),
        output: { schema: { type: 'object' }, render: (_input, value) => [{ type: 'text', text: JSON.stringify(value) }] },
        async execute(input, exec) {
            assertAgent(exec);
            exec.signal.throwIfAborted();
            const before = scope(exec);
            const source = row(input) && exact(input, ['source']) && cardCoverSource(input.source);
            if (!source)
                throw fail('cover-source-invalid', '封面来源参数无效');
            const asset = await assets.prepare(before, source, String(exec.rootCallId), exec.signal);
            assertAgent(exec);
            exec.signal.throwIfAborted();
            if (!sameScope(before, scope(exec)))
                throw fail('cover-scope-invalid', '封面准备期间会话已变化');
            return { asset, state: 'ready', visibility: 'private-staging-until-owner-shares', next: 'Pass the exact asset as cover; owner must preview the image. Not sent.' };
        } };
}
