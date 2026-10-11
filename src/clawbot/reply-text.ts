/** Local resource budgets, not Weixin service limits. Keep the full native
 * response within the host's 256 KiB budget; transport chunks never trim it. */
export const REPLY_TEXT_MAX_BYTES = 256 * 1024
export const TEXT_PART_MAX_BYTES = 1800
export const REPLY_NOTICE_MAX_BYTES = 2048
export const REPLY_MAX_NOTICES = 8
// A UTF-8 codepoint can leave at most three unused bytes in a full chunk.
export const REPLY_MAX_TEXT_PARTS = Math.ceil(REPLY_TEXT_MAX_BYTES / (TEXT_PART_MAX_BYTES - 3))
  + REPLY_MAX_NOTICES * Math.ceil(REPLY_NOTICE_MAX_BYTES / (TEXT_PART_MAX_BYTES - 3))
export const REPLY_TOTAL_TEXT_MAX_BYTES = REPLY_TEXT_MAX_BYTES + REPLY_MAX_NOTICES * REPLY_NOTICE_MAX_BYTES

/** Preserve every character, including leading/trailing whitespace and emoji
 * surrogate pairs. Empty native output creates no text request or placeholder. */
export function splitText(text: string): string[] {
  const parts: string[] = []
  let part = '', bytes = 0
  for (const char of text) {
    const size = Buffer.byteLength(char)
    if (bytes + size > TEXT_PART_MAX_BYTES) { parts.push(part); part = ''; bytes = 0 }
    part += char; bytes += size
  }
  if (part) parts.push(part)
  return parts
}
