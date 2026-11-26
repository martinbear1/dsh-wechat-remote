import { parentPort, workerData } from 'node:worker_threads';
import { HistorySourceError, parseHistorySource } from './source.js';
import { MAX_NORMALIZED_BYTES, MAX_FILE_NORMALIZED_BYTES } from './limits.js';
import { parseArchiveCatalog, readArchiveConversation, readArchiveImage } from './source-v3.js';
// The archive is data, never code. Parsing large account exports happens away
// from DSH's event loop; only this short-lived worker sees the complete input.
try {
    if (workerData.file && workerData.action === 'image') {
        const image = await readArchiveImage(workerData.file, workerData.entry);
        parentPort?.postMessage({ image });
    }
    else if (workerData.file && workerData.action === 'conversation') {
        const conversation = await readArchiveConversation(workerData.file, workerData.id);
        parentPort?.postMessage({ conversation });
    }
    else {
        const source = workerData.file ? (await parseArchiveCatalog(workerData.file)).source
            : await parseHistorySource(Buffer.from(workerData.data), workerData.sourceKind === 'share' ? 'share' : undefined);
        const bytes = Buffer.byteLength(JSON.stringify(source));
        const limit = workerData.sourceKind === 'share' ? MAX_NORMALIZED_BYTES : MAX_FILE_NORMALIZED_BYTES;
        if (bytes > limit)
            throw new HistorySourceError('source-too-large', bytes, limit);
        parentPort?.postMessage({ source, bytes });
    }
}
catch (error) {
    const code = error instanceof HistorySourceError ? error.code : error?.code === 'invalid-zip' ? 'invalid-zip' : 'invalid-source';
    parentPort?.postMessage({ error: code, ...(error instanceof HistorySourceError
            ? { actualBytes: error.actualBytes, limitBytes: error.limitBytes, diagnostic: error.diagnostic } : {}) });
}
