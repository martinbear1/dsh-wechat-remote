// Plugin protection budgets, not limits imposed by DSH or WeChat.
// The released mini validates maxFileBytes <= 20 MiB. Never advertise the
// independent desktop share-reader budget as the phone's upload allowance.
export const MAX_FILE_BYTES = 20 * 1024 * 1024;
// A separate negotiated archive protocol, never a larger ordinary attachment.
export const MAX_ARCHIVE_BYTES = 512 * 1024 * 1024;
export const ARCHIVE_OBJECT_PART_BYTES = 4 * 1024 * 1024;
export const MAX_SHARE_BYTES = 48 * 1024 * 1024;
export const MAX_NORMALIZED_BYTES = 96 * 1024 * 1024;
export const MAX_FILE_NORMALIZED_BYTES = 64 * 1024 * 1024;
export const MAX_SELECTED_BYTES = 96 * 1024 * 1024;
export const MAX_SEED_BYTES = 112 * 1024 * 1024;
export const MAX_MESSAGES = 10000;
/** Byte counts only, never source content or an untrusted exception message. */
export function sizeLimitError(code, actualBytes, limitBytes) {
    return Object.assign(new Error(code), { code, actualBytes, limitBytes });
}
