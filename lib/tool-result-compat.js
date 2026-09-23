export function toolResultFailed(message) {
    return message?.isError === true || Array.isArray(message?.content)
        && message.content.some((block) => block?.type === 'tool-result' && block.isError === true);
}
export function presentToolResult(entry) {
    const event = entry.event, message = event?.data?.message;
    if (event?.type !== 'tool/result' || message?.role !== 'tool' || !Array.isArray(message.content))
        return entry;
    // Explicit, idempotent wire-only V4 -> existing mobile format conversion.
    // Raw disk records, identity, source and ordering are never changed.
    if (message.content.some((block) => block?.type === 'tool-result'))
        return entry;
    if (typeof message.toolCallId !== 'string' || message.source?.kind !== 'tool'
        || message.source.callId !== message.toolCallId)
        throw new Error('DSH 工具结果缺少匹配的调用标识');
    const { toolCallId, isError, ...rest } = message;
    return { ...entry, event: { ...event, data: { ...event.data, message: {
                    ...rest, role: 'user', content: [{ type: 'tool-result', toolCallId, content: message.content,
                            ...(isError === undefined ? {} : { isError }) }],
                } } } };
}
