function readEnvelope(req) {
    return new Promise((resolve, reject) => {
        let size = 0;
        const chunks = [];
        const finish = (error) => {
            clearTimeout(timer);
            req.off('data', data);
            req.off('end', end);
            req.off('error', fail);
            req.off('aborted', aborted);
            if (error) {
                reject(error);
                req.resume();
                return;
            }
            try {
                resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
            }
            catch {
                reject(new Error('invalid JSON'));
            }
        };
        const data = (chunk) => {
            size += chunk.length;
            if (size > 4096)
                finish(new Error('envelope too large'));
            else
                chunks.push(chunk);
        };
        const end = () => finish();
        const fail = (error) => finish(error);
        const aborted = () => finish(new Error('aborted'));
        const timer = setTimeout(() => finish(new Error('envelope timeout')), 5000);
        req.on('data', data);
        req.once('end', end);
        req.once('error', fail);
        req.once('aborted', aborted);
    });
}
/** Only the small Connection JSON envelope is accepted; never file bodies.
 * This does not implement auth, proxy traffic, choose ports or retry requests. */
export function pairingHttpHandler(channel, connection, handler) {
    return async (req, res) => {
        res.setHeader('Cache-Control', 'no-store');
        const reject = (status) => { res.writeHead(status); res.end(); };
        // Unauthenticated/cross-origin traffic is rejected before body parsing.
        const rejection = connection.requestRejection(req);
        if (rejection !== undefined) {
            reject(rejection === 403 ? 403 : 401);
            return;
        }
        const pathname = new URL(req.url || '/', 'http://localhost').pathname;
        const endpoint = pathname.slice(channel.length + 1);
        if (req.method !== 'POST' || !pathname.startsWith(channel + '/')
            || !['status', 'pair-code'].includes(endpoint)) {
            reject(404);
            return;
        }
        if (req.headers['content-type']?.split(';', 1)[0]?.trim().toLowerCase() !== 'application/json') {
            reject(415);
            return;
        }
        let body;
        try {
            body = await readEnvelope(req);
        }
        catch {
            res.setHeader('Connection', 'close');
            reject(400);
            return;
        }
        if (!body || typeof body !== 'object' || Array.isArray(body)) {
            reject(400);
            return;
        }
        const message = body;
        if (message.type !== 'client-request' || typeof message.rpcId !== 'string' || message.rpcId.length > 256
            || message.method !== endpoint) {
            reject(400);
            return;
        }
        const controller = new AbortController();
        const closed = () => controller.abort();
        res.once('close', closed);
        try {
            const result = await handler(endpoint, message.payload, controller.signal);
            if (res.destroyed)
                return;
            res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
            res.end(JSON.stringify({ type: 'server-response', rpcId: message.rpcId, result }));
        }
        catch {
            if (!res.destroyed)
                reject(503);
        }
        finally {
            res.off('close', closed);
        }
    };
}
