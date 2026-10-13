import type { FeatureGrant, FeatureLease } from '../feature-access.js'

export type FeatureView = FeatureLease & { groupEnabled: boolean; groupComponentAvailable?: boolean }
export type FeatureCall = (request: { action: 'status' | 'group.enabled' | 'assistant.enabled'; enabled?: boolean; templateId?: string }) => Promise<FeatureView>

export function featureLeaseAllows(lease: { checkedAt?: number; expiresAt?: number } | undefined,
  grant: FeatureGrant | undefined, now = Date.now()): boolean {
  return Boolean(grant?.allowed && grant.reason === 'allowed' && Number.isSafeInteger(grant.validUntil) && grant.validUntil! > now
    && Number.isSafeInteger(lease?.checkedAt) && Number.isSafeInteger(lease?.expiresAt)
    && lease!.checkedAt! > 0 && lease!.expiresAt! > lease!.checkedAt! && lease!.expiresAt! - lease!.checkedAt! <= 60000
    && lease!.expiresAt! > now && Math.abs(now - lease!.checkedAt!) <= 60000)
}

/** Display validation is not authority: native tools enforce independently. */
export function featureView(value: unknown): FeatureView {
  const v = value as FeatureView
  if (!v || v.schemaVersion !== 1 || typeof v.nodeId !== 'string' || typeof v.groupEnabled !== 'boolean'
    || v.groupComponentAvailable !== undefined && typeof v.groupComponentAvailable !== 'boolean'
    || v.groupComponentAvailable === false && v.groupEnabled
    || !Number.isSafeInteger(v.checkedAt) || !Number.isSafeInteger(v.expiresAt)
    || !v.features || ['group_assistant', 'clawbot'].some(key => {
      const row = v.features[key as keyof typeof v.features]
      return !row || typeof row.allowed !== 'boolean' || typeof row.reason !== 'string'
        || row.allowed && (row.reason !== 'allowed' || !Number.isSafeInteger(row.validUntil) || !row.validUntil
          || v.checkedAt <= 0 || v.expiresAt <= v.checkedAt || v.expiresAt - v.checkedAt > 60000)
        || row.message !== undefined && typeof row.message !== 'string'
    })) throw new Error('使用资格暂不可用，请更新插件并刷新。')
  return v
}
