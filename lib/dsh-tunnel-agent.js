/** Multiplexes authenticated E2EE streams onto the local DSH HTTP/WebSocket API. */
import http from 'node:http';
import { WebSocket } from 'ws';
const VERSION = 1;
const OPEN = 1;
const ACCEPT = 2;
const DATA = 3;
const END = 4;
const ERROR = 5;
const CANCEL = 6;
const KIND_HTTP = 'http';
const KIND_WEBSOCKET = 'websocket';
const FLAG_BINARY = 1;
const FLAG_FINAL = 2;
const HEADER_BYTES = 8;
const MAX_METADATA_BYTES = 16 * 1024;
const MAX_CHUNK_BYTES = 192 * 1024;
const MAX_REQUEST_BYTES = 16 * 1024 * 1024;
function concat(...parts) {
    const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
    let offset = 0;
    for (const part of parts) {
        out.set(part, offset);
        offset += part.length;
    }
    return out;
}
function uint32(value, out, offset) {
    out[offset] = (value >>> 24) & 255;
    out[offset + 1] = (value >>> 16) & 255;
    out[offset + 2] = (value >>> 8) & 255;
    out[offset + 3] = value & 255;
}
function readUint32(data, offset) {
    return data[offset] * 0x1000000 + data[offset + 1] * 0x10000 + data[offset + 2] * 0x100 + data[offset + 3];
}
function encode(type, streamId, flags = 0, payload = new Uint8Array(0)) {
    if (payload.length > MAX_CHUNK_BYTES && type === DATA)
        throw new Error('Tunnel data chunk is too large');
    if (payload.length > MAX_METADATA_BYTES && type !== DATA)
        throw new Error('Tunnel metadata is too large');
    const frame = new Uint8Array(HEADER_BYTES + payload.length);
    frame[0] = VERSION;
    frame[1] = type;
    uint32(streamId, frame, 2);
    frame[6] = flags;
    frame[7] = 0;
    frame.set(payload, HEADER_BYTES);
    return frame;
}
function decode(frame) {
    if (frame.length < HEADER_BYTES || frame[0] !== VERSION || frame[7] !== 0)
        throw new Error('Invalid DSH tunnel frame');
    const streamId = readUint32(frame, 2);
    if (!streamId || (streamId & 1) !== 1)
        throw new Error('Invalid client stream ID');
    return { type: frame[1], streamId, flags: frame[6], payload: frame.subarray(HEADER_BYTES) };
}
function json(value) {
    return new TextEncoder().encode(JSON.stringify(value));
}
function parseJson(payload) {
    if (payload.length > MAX_METADATA_BYTES)
        throw new Error('Tunnel metadata is too large');
    try {
        return JSON.parse(new TextDecoder().decode(payload));
    }
    catch {
        throw new Error('Invalid tunnel metadata');
    }
}
function safePath(value) {
    if (typeof value !== 'string' || value.length > 2048 || !value.startsWith('/api/'))
        throw new Error('Only local DSH /api paths are allowed');
    if (/[\u0000-\u001f\\]/.test(value) || value.startsWith('//'))
        throw new Error('Invalid local DSH path');
    const parsed = new URL(value, 'http://dsh.local');
    if (parsed.origin !== 'http://dsh.local' || !parsed.pathname.startsWith('/api/'))
        throw new Error('Invalid local DSH path');
    return parsed.pathname + parsed.search;
}
function safeMethod(value) {
    const method = typeof value === 'string' ? value.toUpperCase() : '';
    if (!['GET', 'POST', 'DELETE'].includes(method))
        throw new Error('DSH HTTP method is not allowed');
    return method;
}
function requestHeaders(value) {
    const source = value && typeof value === 'object' ? value : {};
    const out = {
        accept: 'application/json',
        'accept-encoding': 'identity',
        'user-agent': 'HarnessRemote-PublicAgent/1',
    };
    if (typeof source['content-type'] === 'string' && source['content-type'].length <= 128) {
        out['content-type'] = source['content-type'];
    }
    return out;
}
function responseHeaders(headers) {
    const blocked = new Set(['connection', 'transfer-encoding', 'set-cookie', 'content-encoding']);
    const out = {};
    for (const [key, value] of Object.entries(headers)) {
        if (blocked.has(key) || value === undefined)
            continue;
        if (typeof value === 'string' && value.length <= 4096)
            out[key] = value;
        else if (Array.isArray(value))
            out[key] = value.filter(item => item.length <= 4096).slice(0, 16);
    }
    return out;
}
function pieces(data) {
    if (data.length === 0)
        return [new Uint8Array(0)];
    const out = [];
    for (let offset = 0; offset < data.length; offset += MAX_CHUNK_BYTES) {
        out.push(data.subarray(offset, Math.min(offset + MAX_CHUNK_BYTES, data.length)));
    }
    return out;
}
export class DshTunnelAgent {
    sendCallback;
    dshPort;
    maxStreams;
    streams = new Map();
    sendChain = Promise.resolve();
    closed = false;
    constructor(options) {
        this.sendCallback = options.send;
        this.dshPort = options.dshPort || 3080;
        this.maxStreams = options.maxStreams || 128;
    }
    receive(rawFrame) {
        if (this.closed)
            throw new Error('DSH tunnel is closed');
        const frame = decode(new Uint8Array(rawFrame));
        try {
            if (frame.type === OPEN)
                return this.open(frame.streamId, parseJson(frame.payload));
            const stream = this.streams.get(frame.streamId);
            if (!stream)
                return;
            if (frame.type === DATA)
                return this.data(stream, frame.streamId, frame.flags, frame.payload);
            if (frame.type === END)
                return this.end(stream, frame.streamId, frame.payload);
            if (frame.type === CANCEL)
                return this.cancel(stream, frame.streamId);
            throw new Error('Client tunnel frame type is not allowed');
        }
        catch (error) {
            this.sendError(frame.streamId, error);
            const stream = this.streams.get(frame.streamId);
            if (stream)
                this.cancel(stream, frame.streamId);
        }
    }
    close() {
        this.closed = true;
        for (const [id, stream] of this.streams)
            this.cancel(stream, id);
    }
    open(streamId, value) {
        if (this.streams.has(streamId))
            throw new Error('Tunnel stream already exists');
        if (this.streams.size >= this.maxStreams)
            throw new Error('Too many concurrent DSH streams');
        const kind = value.kind;
        const path = safePath(value.path);
        if (kind === KIND_HTTP)
            this.openHttp(streamId, path, value);
        else if (kind === KIND_WEBSOCKET)
            this.openWebSocket(streamId, path, value);
        else
            throw new Error('Tunnel stream kind is not allowed');
    }
    openHttp(streamId, path, value) {
        const request = http.request({
            host: '127.0.0.1',
            port: this.dshPort,
            path,
            method: safeMethod(value.method),
            headers: requestHeaders(value.headers),
            timeout: 30_000,
        }, response => {
            this.queue(encode(ACCEPT, streamId, 0, json({
                statusCode: response.statusCode || 502,
                headers: responseHeaders(response.headers),
            })));
            response.on('data', chunk => {
                for (const part of pieces(Buffer.from(chunk)))
                    this.queue(encode(DATA, streamId, 0, part));
            });
            response.on('end', () => {
                this.streams.delete(streamId);
                this.queue(encode(END, streamId));
            });
            response.on('error', error => this.fail(streamId, error));
        });
        const stream = { kind: KIND_HTTP, request, bytes: 0 };
        this.streams.set(streamId, stream);
        request.on('timeout', () => request.destroy(new Error('Local DSH request timed out')));
        request.on('error', error => this.fail(streamId, error));
    }
    openWebSocket(streamId, path, _value) {
        const socket = new WebSocket(`ws://127.0.0.1:${this.dshPort}${path}`, {
            headers: { 'user-agent': 'HarnessRemote-PublicAgent/1' },
            maxPayload: 1024 * 1024,
            perMessageDeflate: false,
            handshakeTimeout: 10_000,
        });
        const stream = { kind: KIND_WEBSOCKET, socket, fragments: [], fragmentBytes: 0 };
        this.streams.set(streamId, stream);
        socket.on('open', () => this.queue(encode(ACCEPT, streamId, 0, json({ opened: true }))));
        socket.on('message', (data, isBinary) => {
            const message = Buffer.isBuffer(data)
                ? data
                : Array.isArray(data)
                    ? Buffer.concat(data)
                    : Buffer.from(new Uint8Array(data));
            const messagePieces = pieces(message);
            messagePieces.forEach((part, index) => {
                const flags = (isBinary ? FLAG_BINARY : 0) | (index === messagePieces.length - 1 ? FLAG_FINAL : 0);
                this.queue(encode(DATA, streamId, flags, part));
            });
        });
        socket.on('close', (code, reason) => {
            this.streams.delete(streamId);
            this.queue(encode(END, streamId, 0, json({ code, reason: reason.toString().slice(0, 256) })));
        });
        socket.on('error', error => this.fail(streamId, error));
    }
    data(stream, streamId, flags, payload) {
        if (stream.kind === KIND_HTTP) {
            stream.bytes += payload.length;
            if (stream.bytes > MAX_REQUEST_BYTES)
                throw new Error('DSH request exceeds 16 MiB');
            stream.request.write(payload);
            return;
        }
        stream.fragmentBytes += payload.length;
        if (stream.fragmentBytes > 1024 * 1024)
            throw new Error('DSH WebSocket message exceeds 1 MiB');
        stream.fragments.push(new Uint8Array(payload));
        if (!(flags & FLAG_FINAL))
            return;
        const message = concat(...stream.fragments);
        stream.fragments = [];
        stream.fragmentBytes = 0;
        stream.socket.send(message, { binary: Boolean(flags & FLAG_BINARY) });
    }
    end(stream, streamId, payload) {
        if (stream.kind === KIND_HTTP)
            stream.request.end();
        else {
            const value = payload.length ? parseJson(payload) : {};
            const code = typeof value.code === 'number' ? value.code : 1000;
            const reason = typeof value.reason === 'string' ? value.reason.slice(0, 123) : '';
            stream.socket.close(code, reason);
            this.streams.delete(streamId);
        }
    }
    cancel(stream, streamId) {
        this.streams.delete(streamId);
        if (stream.kind === KIND_HTTP)
            stream.request.destroy();
        else
            stream.socket.terminate();
    }
    fail(streamId, error) {
        const stream = this.streams.get(streamId);
        if (!stream)
            return;
        this.sendError(streamId, error);
        this.cancel(stream, streamId);
    }
    sendError(streamId, error) {
        const message = error instanceof Error ? error.message : 'DSH tunnel failed';
        this.queue(encode(ERROR, streamId, 0, json({ code: 'dsh-tunnel', message: message.slice(0, 256) })));
    }
    queue(frame) {
        this.sendChain = this.sendChain
            .then(() => this.closed ? undefined : this.sendCallback(frame))
            .then(() => undefined)
            .catch(() => this.close());
    }
}
