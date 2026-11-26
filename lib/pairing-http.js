/** Alpha hosts moved authentication into providers. Keep the old authenticated
 * request fence, or use the operator Peer already admitted by WebServer.
 * Never infer trust from loopback, cookies, headers or an authenticated phone. */
export function pairingRequestRejection(connection, request, peer) {
    if (typeof connection.requestRejection === 'function') {
        const rejection = connection.requestRejection(request);
        return rejection === undefined ? undefined : rejection === 403 ? 403 : 401;
    }
    if (typeof connection.authentication?.register !== 'function' || typeof connection.admit !== 'function')
        return 401;
    if (!peer)
        return 401;
    // New authentication providers can also represent shared-session readers.
    // Generating pairing credentials and updating this node belong to its owner.
    return peer.principal?.kind === 'owner' && peer.signal?.aborted === false ? undefined : 403;
}
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
    return async (req, res, peer) => {
        res.setHeader('Cache-Control', 'no-store');
        const reject = (status) => { res.writeHead(status); res.end(); };
        // Unauthenticated/cross-origin traffic is rejected before body parsing.
        const rejection = pairingRequestRejection(connection, req, peer);
        if (rejection !== undefined) {
            reject(rejection);
            return;
        }
        const pathname = new URL(req.url || '/', 'http://localhost').pathname;
        const endpoint = pathname.slice(channel.length + 1);
        if (req.method !== 'POST' || !pathname.startsWith(channel + '/')
            || !['status', 'pair-code', 'connection-diagnostics', 'update-check', 'update-start', 'update-status'].includes(endpoint)) {
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
        peer?.signal.addEventListener('abort', closed, { once: true });
        if (peer?.signal.aborted)
            closed();
        try {
            controller.signal.throwIfAborted();
            const result = await handler(endpoint, message.payload, controller.signal);
            controller.signal.throwIfAborted();
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
            peer?.signal.removeEventListener('abort', closed);
        }
    };
}
