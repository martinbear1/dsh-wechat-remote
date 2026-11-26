import { MAX_FILE_BYTES, MAX_FILE_NORMALIZED_BYTES } from './limits.js';
import { openZipFile } from './zip-reader.js';
export const MAX_SOURCE_BYTES = MAX_FILE_BYTES;
export const MAX_EXPANDED_BYTES = MAX_FILE_NORMALIZED_BYTES;
/** Compatibility entry for the original small legacy export API. All archive
 * validation is shared with the disk-backed v3 reader; no second ZIP parser. */
export async function readExportZip(bytes) {
    if (bytes.length > MAX_SOURCE_BYTES)
        throw new Error('history-import/invalid-zip');
    const archive = await openZipFile(bytes);
    try {
        return await archive.read('conversations.json', MAX_EXPANDED_BYTES);
    }
    finally {
        await archive.close();
    }
}
