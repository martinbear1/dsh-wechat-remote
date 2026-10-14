/** Mobile presentation of the official DSH Schedule service. No scheduler,
 * task persistence, model tool or browser-UI proxy belongs to this module. */
export interface ScheduledRequest { readonly action: string; readonly inputJson?: string }
export interface ScheduledResult {
  readonly ok: boolean
  readonly valueJson?: string
  readonly error?: { readonly code: string; readonly message: string }
}
export interface ScheduledChanged { readonly enabled: boolean }
/** Lightweight live service state; no task/catalog/history read is needed. */
export interface ScheduledStatus {
  readonly supported: boolean
  readonly enabled: boolean
  readonly historyKind: 'delivery'
  readonly capabilities: {
    readonly create: boolean
    readonly update: boolean
    readonly delete: boolean
    readonly pause: false
  }
}
export interface ScheduledReceipt { readonly scheduledAt: string; readonly deliveredAt: string; readonly messageId: string }
export interface ScheduledRecord {
  readonly id: string
  readonly kind: 'after' | 'at' | 'every' | 'daily' | 'weekly' | 'cron'
  readonly title: string
  readonly prompt: string
  readonly scheduledAt: string
  readonly afterSeconds?: number
  readonly everySeconds?: number
  readonly time?: string
  readonly timeZone?: string
  readonly weekdays?: readonly number[]
  readonly expression?: string
}
export interface ScheduledItem extends ScheduledRecord {
  readonly sessionId: string
  readonly status: 'active' | 'inactive'
  readonly lastDelivery?: ScheduledReceipt
}
export type ScheduledSummary = Omit<ScheduledItem, 'prompt'>
export interface ScheduledCatalog {
  readonly items: readonly ScheduledSummary[]
  readonly total: number
  readonly nextCursor?: string
}
