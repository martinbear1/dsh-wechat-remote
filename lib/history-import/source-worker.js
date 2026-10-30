import { parentPort, workerData } from 'node:worker_threads';
import { HistorySourceError, parseHistorySource } from './source.js';
import { MAX_NORMALIZED_BYTES, MAX_FILE_NORMALIZED_BYTES } from './limits.js';
// The archive is data, never code. Parsing large account exports happens away
// from DSH's event loop; only this short-lived worker sees the complete input.
try {
    const source = await parseHistorySource(Buffer.from(workerData.data), workerData.sourceKind === 'share' ? 'share' : undefined);
    const bytes = Buffer.byteLength(JSON.stringify(source));
    const limit = workerData.sourceKind === 'share' ? MAX_NORMALIZED_BYTES : MAX_FILE_NORMALIZED_BYTES;
    if (bytes > limit)
        throw new HistorySourceError('source-too-large', bytes, limit);
    parentPort?.postMessage({ source, bytes });
}
catch (error) {
    const code = error instanceof HistorySourceError ? error.code : 'invalid-source';
    parentPort?.postMessage({ error: code, ...(error instanceof HistorySourceError
            ? { actualBytes: error.actualBytes, limitBytes: error.limitBytes, diagnostic: error.diagnostic } : {}) });
}
