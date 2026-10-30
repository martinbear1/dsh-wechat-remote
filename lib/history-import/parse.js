import { Worker } from 'node:worker_threads';
export function parseImportSource(data, signal, sourceKind) {
    // A shared overall deadline can expire while this worker is running. Keep
    // it distinct from an explicit cancel, without exposing the raw reason.
    const abortError = () => new Error(signal.reason?.name === 'TimeoutError'
        ? sourceKind === 'share' ? 'share-timeout' : 'parse-timeout' : 'cancelled');
    if (signal.aborted)
        throw abortError();
    return new Promise((resolve, reject) => {
        const worker = new Worker(new URL('./source-worker.js', import.meta.url), {
            // Do not inherit a host CLI's --input-type/debug/loader flags. This
            // data-only worker needs only Node's built-in modules and our parser.
            workerData: { data, sourceKind }, execArgv: [], resourceLimits: { maxOldGenerationSizeMb: 256, maxYoungGenerationSizeMb: 32 },
        });
        let finished = false;
        const complete = (error, value) => {
            if (finished)
                return;
            finished = true;
            clearTimeout(timer);
            signal.removeEventListener('abort', abort);
            void worker.terminate().catch(() => { });
            if (error)
                reject(error);
            else
                resolve(value);
        };
        const abort = () => complete(abortError());
        const timer = setTimeout(() => complete(new Error('parse-timeout')), 20_000);
        timer.unref();
        worker.once('message', value => value?.source && Number.isSafeInteger(value.bytes)
            ? complete(undefined, value) : complete(Object.assign(new Error(value?.error || 'invalid-source'), { actualBytes: value?.actualBytes, limitBytes: value?.limitBytes, diagnostic: value?.diagnostic })));
        worker.once('error', () => complete(new Error('parse-unavailable')));
        worker.once('exit', () => { if (!finished)
            complete(new Error('parse-unavailable')); });
        signal.addEventListener('abort', abort, { once: true });
        if (signal.aborted)
            abort();
    });
}
