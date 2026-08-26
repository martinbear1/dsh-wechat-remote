import { randomBytes, sign } from 'node:crypto';
function proofMessage(method, pathname, nodeId, timestamp, nonce) {
    return Buffer.from(`agent-http\n${method.toUpperCase()}\n${pathname}\n${nodeId}\n${timestamp}\n${nonce}`);
}
export class PublicObjectClient {
    relayOrigin;
    identity;
    fetchImpl;
    constructor(relayOrigin, identity, fetchImpl = fetch) {
        this.relayOrigin = relayOrigin;
        this.identity = identity;
        this.fetchImpl = fetchImpl;
    }
    async download(objectId, expectedMaximum = 20 * 1024 * 1024 + 4096, signal) {
        if (!/^[A-Za-z0-9_-]{20,64}$/.test(objectId))
            throw new Error('Invalid encrypted object ID');
        const pathname = `/v1/agents/${this.identity.nodeId}/objects/${objectId}/download`;
        const ticket = await this.requestJson('GET', pathname, undefined, signal);
        if (!ticket.download || ticket.expectedBytes < 17 || ticket.expectedBytes > expectedMaximum) {
            throw new Error('Encrypted attachment ticket is invalid');
        }
        const response = await this.fetchImpl(ticket.download.url, {
            method: 'GET',
            headers: ticket.download.headers || {},
            signal: deadlineSignal(signal, 30_000),
        });
        if (!response.ok)
            throw new Error(`Encrypted attachment download failed with HTTP ${response.status}`);
        const body = new Uint8Array(await response.arrayBuffer());
        if (body.length !== ticket.expectedBytes)
            throw new Error('Encrypted attachment length mismatch');
        return body;
    }
    async upload(purpose, body, signal) {
        const pathname = `/v1/agents/${this.identity.nodeId}/objects`;
        const ticket = await this.requestJson('POST', pathname, {
            purpose,
            expectedBytes: body.length,
        }, signal);
        if (!ticket.upload || ticket.expectedBytes !== body.length)
            throw new Error('Encrypted object upload ticket is invalid');
        const uploaded = await this.fetchImpl(ticket.upload.url, {
            method: 'PUT',
            headers: ticket.upload.headers || {},
            body: Buffer.from(body),
            signal: deadlineSignal(signal, 60_000),
        });
        if (!uploaded.ok)
            throw new Error(`Encrypted object upload failed with HTTP ${uploaded.status}`);
        const completePath = `${pathname}/${ticket.objectId}/complete`;
        return this.requestJson('POST', completePath, {}, signal);
    }
    async requestJson(method, pathname, body, signal) {
        const timestamp = Date.now();
        const nonce = randomBytes(18).toString('base64url');
        const signature = sign(null, proofMessage(method, pathname, this.identity.nodeId, timestamp, nonce), this.identity.privateKeyPem).toString('base64url');
        const response = await this.fetchImpl(`${this.relayOrigin}${pathname}`, {
            method,
            headers: {
                ...(body === undefined ? {} : { 'content-type': 'application/json' }),
                'x-hr-node-id': this.identity.nodeId,
                'x-hr-timestamp': String(timestamp),
                'x-hr-nonce': nonce,
                'x-hr-signature': signature,
            },
            body: body === undefined ? undefined : JSON.stringify(body),
            signal: deadlineSignal(signal, 15_000),
        });
        if (!response.ok)
            throw new Error(`Encrypted object service failed with HTTP ${response.status}`);
        return await response.json();
    }
}
function deadlineSignal(parent, timeoutMs) {
    const timeout = AbortSignal.timeout(timeoutMs);
    return parent ? AbortSignal.any([parent, timeout]) : timeout;
}
