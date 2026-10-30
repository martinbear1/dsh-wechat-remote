/** Native attachment request selection. No network probing or version guesses. */
import type { Context } from '@deepseek-ai/cordis'

type Row = Record<string, any>
export interface DurableImageReference {
  attachmentId: string
  mediaType: string
  bytes: number
  width: number
  height: number
  name?: string
  originalDimensions?: { width: number; height: number }
}

export function imageReference(value: unknown): DurableImageReference | undefined {
  const ref = value as Partial<DurableImageReference> | null
  const positive = (n: unknown) => Number.isSafeInteger(n) && Number(n) > 0
  if (!ref || typeof ref.attachmentId !== 'string' || !ref.attachmentId
      || typeof ref.mediaType !== 'string' || !/^image\/(png|jpeg|webp|gif)$/.test(ref.mediaType)
      || !positive(ref.bytes) || !positive(ref.width) || !positive(ref.height)
      || (ref.name !== undefined && typeof ref.name !== 'string')
      || (ref.originalDimensions !== undefined && (!positive(ref.originalDimensions?.width) || !positive(ref.originalDimensions?.height)))) return undefined
  return { attachmentId: ref.attachmentId, mediaType: ref.mediaType, bytes: ref.bytes!, width: ref.width!, height: ref.height!,
    ...(ref.name !== undefined ? { name: ref.name } : {}),
    ...(ref.originalDimensions ? { originalDimensions: { ...ref.originalDimensions } } : {}) }
}

export function nativeAttachmentField(ctx: Pick<Context, 'get'>): 'attachmentId' | 'attachment' {
  const registry = ctx.get('typert') as Row | undefined
  const descriptor = registry?.local?.get('session/attachment')
  if (!descriptor) {
    if (registry?.local?.hasSeen?.('session/attachment')) throw new Error('DSH 图片接口正在更新，请稍后重试')
    return 'attachmentId' // Old source-mode hosts have no generated descriptors.
  }
  const codec = descriptor.parameters?.find((item: Row) => item.wire === 'request')?.codec
  const schema = typeof codec?.create === 'function' ? codec.create() : codec?.schema
  const ref = { attachmentId: `sha256:${'0'.repeat(64)}`, mediaType: 'image/png', bytes: 1, width: 1, height: 1 }
  const idOnly = schema?.safeParse({ sessionId: 'session-00000000-0000-4000-8000-000000000001', attachmentId: ref.attachmentId })
  const complete = schema?.safeParse({ sessionId: 'session-00000000-0000-4000-8000-000000000001', attachment: ref })
  if (idOnly?.success && idOnly.data?.attachmentId === ref.attachmentId) return 'attachmentId'
  if (complete?.success && complete.data?.attachment?.attachmentId === ref.attachmentId) return 'attachment'
  throw new Error('DSH 图片接口契约暂不支持；未读取图片')
}

function imageInContent(content: unknown, id: string): DurableImageReference | undefined {
  if (!Array.isArray(content)) return undefined
  for (const part of content) {
    if (part?.type !== 'image' || part.attachment?.attachmentId !== id) continue
    const ref = imageReference(part.attachment)
    if (ref) return ref
  }
  return undefined
}

/** Same durable content locations as native RC3 attachment admission. This
 * compatibility lookup is only for id-only consumers (including group covers).
 * Modern phone reads already carry the recorded reference and do not scan history. */
export function referencedSessionImage(events: readonly Row[], id: string, signal?: AbortSignal): DurableImageReference | undefined {
  for (const event of events) {
    signal?.throwIfAborted()
    const data = event.data || {}
    let ref: DurableImageReference | undefined
    switch (event.type) {
      case 'user/message': case 'tool/ptc-dispatch': ref = imageInContent(data.content, id); break
      case 'system/message': case 'developer/message': case 'tool/result': case 'team/message/queued':
        ref = imageInContent(data.message?.content, id); break
      case 'agent/inbox/spliced':
        for (const message of Array.isArray(data.inserted) ? data.inserted : []) {
          ref = imageInContent(message?.content, id)
          if (ref) break
        }
        break
      case 'compaction/summary': ref = imageInContent(data.summary, id) || imageInContent(data.rawOutput, id); break
      case 'assistant/message': ref = imageInContent(data.message?.content, id)
        // The durable stream also carries tool-returned image blocks.
        if (ref) break
        // fall through
      case 'assistant/attempt':
        // Native AssistantStreamRecord stores block-end as an unpacked chunk;
        // no delta expansion (or new llm export on old hosts) is required.
        for (const record of Array.isArray(data.stream) ? data.stream : []) {
          if (record?.type !== 'chunk' || record.chunk?.type !== 'block-end') continue
          ref = imageInContent([record.chunk.block], id)
          if (ref) break
        }
    }
    if (ref) return ref
  }
  return undefined
}

export async function nativeAttachmentRequest(ctx: Pick<Context, 'get'>, request: Row, signal?: AbortSignal): Promise<Row> {
  signal?.throwIfAborted()
  const id = typeof request.attachmentId === 'string' ? request.attachmentId : request.attachment?.attachmentId
  if (typeof request.sessionId !== 'string' || !request.sessionId || typeof id !== 'string' || !id) throw new Error('会话图片引用无效')
  const field = nativeAttachmentField(ctx)
  // Strip the optional mobile bridge field before old strict native admission.
  if (field === 'attachmentId') return { sessionId: request.sessionId, attachmentId: id }
  let ref = imageReference(request.attachment)
  if (request.attachment !== undefined && (!ref || ref.attachmentId !== id)) throw new Error('会话图片引用无效')
  if (!ref) {
    const query = ctx.get('sessionQuery') as Row | undefined
    if (typeof query?.observeSession !== 'function') throw new Error('此宿主需要完整图片引用，请刷新会话后重试')
    const observation = await query.observeSession(request.sessionId, { signal, projectionMode: 'none' })
    try {
      signal?.throwIfAborted()
      ref = referencedSessionImage(observation.events, id, signal)
    } finally { observation[Symbol.dispose]() }
    if (!ref) throw new Error('此图片不在当前会话中')
  }
  return { sessionId: request.sessionId, attachment: ref }
}
