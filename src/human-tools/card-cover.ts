import { exact, row } from '../human-workflow/data.js'

/** Immutable public reference only. An asset-shaped value is not authority;
 * the node ledger and cloud must both confirm its origin and ready state. */
export interface HumanCardAsset {
  readonly schema: 'human.card.asset.v1'; readonly assetRef: string; readonly sha256: string; readonly bytes: number
  readonly mediaType: 'image/png' | 'image/jpeg'; readonly width: number; readonly height: number
}
export const HUMAN_CARD_ASSET_MAX_BYTES = 2 * 1024 * 1024
export function humanCardAsset(value: unknown): HumanCardAsset | undefined {
  if (!row(value) || !exact(value, ['schema', 'assetRef', 'sha256', 'bytes', 'mediaType', 'width', 'height'])
    || value.schema !== 'human.card.asset.v1' || typeof value.assetRef !== 'string' || !/^[A-Za-z0-9_-]{24,64}(?![\s\S])/.test(value.assetRef)
    || typeof value.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(value.sha256)
    || !Number.isSafeInteger(value.bytes) || Number(value.bytes) < 1 || Number(value.bytes) > HUMAN_CARD_ASSET_MAX_BYTES
    || !['image/png', 'image/jpeg'].includes(String(value.mediaType))
    || !Number.isSafeInteger(value.width) || !Number.isSafeInteger(value.height) || Number(value.width) < 1 || Number(value.height) < 1
    || Number(value.width) > 2048 || Number(value.height) > 2048 || Number(value.width) * 4 !== Number(value.height) * 5) return
  return { schema: 'human.card.asset.v1', assetRef: value.assetRef, sha256: value.sha256, bytes: Number(value.bytes),
    mediaType: value.mediaType as HumanCardAsset['mediaType'], width: Number(value.width), height: Number(value.height) }
}
export const HUMAN_CARD_ASSET_SCHEMA = { type: 'object', description: 'Exact PUBLIC cover asset returned by human_card_cover_prepare. Never invent its reference/digest, supply paths/URLs, or reuse another session asset. The owner previews the actual image before sharing.',
  properties: { schema: { type: 'string', enum: ['human.card.asset.v1'] }, assetRef: { type: 'string' }, sha256: { type: 'string' }, bytes: { type: 'integer' },
    mediaType: { type: 'string', enum: ['image/png', 'image/jpeg'] }, width: { type: 'integer' }, height: { type: 'integer' } },
  required: ['schema', 'assetRef', 'sha256', 'bytes', 'mediaType', 'width', 'height'], additionalProperties: false } as const

/** Covers belong only to a public new round, never private correction or
 * reminder/review content. Other content rules remain cloud-authoritative. */
export function lifecycleCoverValid(kind: 'round' | 'review' | 'reminder', content: Record<string, unknown>): boolean {
  if (Object.hasOwn(content, 'cover') && (kind !== 'round' || content.recipientRefs !== null || !humanCardAsset(content.cover))) return false
  return kind !== 'review' || !row(content.correction) || !Object.hasOwn(content.correction, 'cover')
}
