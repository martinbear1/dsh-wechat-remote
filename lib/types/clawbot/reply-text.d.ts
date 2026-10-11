/** Local resource budgets, not Weixin service limits. Keep the full native
 * response within the host's 256 KiB budget; transport chunks never trim it. */
export declare const REPLY_TEXT_MAX_BYTES: number;
export declare const TEXT_PART_MAX_BYTES = 1800;
export declare const REPLY_NOTICE_MAX_BYTES = 2048;
export declare const REPLY_MAX_NOTICES = 8;
export declare const REPLY_MAX_TEXT_PARTS: number;
export declare const REPLY_TOTAL_TEXT_MAX_BYTES: number;
/** Preserve every character, including leading/trailing whitespace and emoji
 * surrogate pairs. Empty native output creates no text request or placeholder. */
export declare function splitText(text: string): string[];
