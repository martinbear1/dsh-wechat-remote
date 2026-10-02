/** Product budgets for data-only card definitions, not WeChat platform limits.
 * Keep in sync with cloud human-tasks/capacity.js and mini human-capacity.js.
 * Form -> round -> Surface -> request leaves space for each signed envelope.
 * File bytes, member answers, identity proofs and sync facts have other limits. */
export const HUMAN_FORM_MAX_BYTES = 64 * 1024
export const HUMAN_ROUND_MAX_BYTES = 96 * 1024
export const HUMAN_SURFACE_MAX_BYTES = 128 * 1024
export const HUMAN_CARD_REQUEST_MAX_BYTES = 256 * 1024
// 16 rounds + 16 drafts at <=96 KiB, 20 answers at <=12,000 B,
// plus bounded references, participants and transport metadata.
export const HUMAN_LIFECYCLE_RESPONSE_MAX_BYTES = 4 * 1024 * 1024
// 128 retained Surfaces at <=128 KiB plus origins and four receipts each.
export const HUMAN_LEDGER_MAX_BYTES = 24 * 1024 * 1024
