/** Product budgets for data-only card definitions, not WeChat platform limits.
 * Keep in sync with cloud human-tasks/capacity.js and mini human-capacity.js.
 * Form -> round -> Surface -> request leaves space for each signed envelope.
 * File bytes, member answers, identity proofs and sync facts have other limits. */
export declare const HUMAN_FORM_MAX_BYTES: number;
export declare const HUMAN_ROUND_MAX_BYTES: number;
export declare const HUMAN_SURFACE_MAX_BYTES: number;
export declare const HUMAN_CARD_REQUEST_MAX_BYTES: number;
export declare const HUMAN_LIFECYCLE_RESPONSE_MAX_BYTES: number;
export declare const HUMAN_LEDGER_MAX_BYTES: number;
