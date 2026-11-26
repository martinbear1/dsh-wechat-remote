import { z } from 'zod'
import { REMOTE_INPUT_LIMITS } from './remote-input-limits.js'

/** Capacity gates for the three array-bearing incoming RPCs. These limits
 * already exist in the respective business validators. The official Typert
 * generator currently projects TypeScript arrays without length constraints,
 * so the gate must run BEFORE its unchanged strict schema walks the elements.
 * Keep this source-owned; do not edit generated schemas or constrain outputs.
 */
const INPUT_GATES: Readonly<Record<string, (value: unknown) => boolean>> = {
  'humanTools/ack': value => {
    const request = record(value)
    const task = record(request?.taskRef)
    if (task) {
      let keys = 0
      for (const key in task) if (Object.hasOwn(task, key) && ++keys > 3) return false
    }
    const selection = record(request?.selectionRef)
    if (!selection) return true
    let keys = 0
    for (const key in selection) {
      if (!Object.hasOwn(selection, key)) continue
      if (++keys > 5 || !within(selection[key], REMOTE_INPUT_LIMITS.selectedMembers)) return false
    }
    return true
  },
  'humanTools/automationPreview': value => within(record(record(value)?.config)?.recipientRefs, REMOTE_INPUT_LIMITS.automationRecipients),
  'wechatAttachment/prepareBatch': value => within(record(value)?.attachments, REMOTE_INPUT_LIMITS.attachmentBatch),
}

function record(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown> : undefined
}

function within(value: unknown, limit: number): boolean {
  return !Array.isArray(value) || value.length <= limit
}

/** Applied once by the build-owned manifest footer, before legacy schema
 * accessors are attached. Both old .schema readers and lazy .create readers
 * therefore receive the same Zod schema and native validation error contract.
 */
export function attachInputSizeBounds(manifest: any): void {
  for (const invocation of manifest.invocations) {
    const gate = INPUT_GATES[`${invocation.namespace}/${invocation.method}`]
    if (!gate) continue
    const codec = invocation.parameters.find((parameter: any) => parameter.wire === 'request')?.codec
    if (!codec || typeof codec.create !== 'function') throw new Error('Missing bounded RPC request codec')
    const create = codec.create.bind(codec)
    let schema: z.ZodType | undefined
    codec.create = () => schema ??= z.custom(gate, { message: 'Request collection exceeds its supported capacity' }).pipe(create())
  }
}
