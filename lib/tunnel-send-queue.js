export class TunnelSendQueue {
    options;
    streams = new Map();
    waiters = new Set();
    pumping = false;
    closed = false;
    queuedBytes = 0;
    inFlightBytes = 0;
    interactiveBurst = 0;
    lastStream = 0;
    constructor(options) {
        this.options = options;
    }
    get bytes() { return this.queuedBytes + this.inFlightBytes; }
    get highWaterBytes() { return this.options.highWaterBytes ?? 256 * 1024; }
    enqueue(id, priority, frame, terminal = false) {
        if (this.closed)
            return;
        const stream = this.streams.get(id) ?? { priority, frames: [], bytes: 0 };
        const limit = this.options.maxBytes ?? 4 * 1024 * 1024;
        const reserve = Math.min(64 * 1024, Math.floor(limit / 8));
        if (this.bytes + frame.byteLength > limit - (terminal ? 0 : reserve)
            || stream.bytes + frame.byteLength > (this.options.maxStreamBytes ?? limit)) {
            this.discard(id);
            if (terminal) {
                this.close();
                this.options.onFailure();
                return;
            }
            this.options.onOverflow(id);
            return;
        }
        stream.frames.push(frame);
        stream.bytes += frame.byteLength;
        this.queuedBytes += frame.byteLength;
        this.streams.set(id, stream);
        if (!this.pumping)
            void this.pump();
    }
    discard(id) {
        const stream = this.streams.get(id);
        if (stream)
            this.queuedBytes -= stream.bytes;
        this.streams.delete(id);
        this.drained();
    }
    close() {
        this.closed = true;
        this.streams.clear();
        this.queuedBytes = 0;
        this.drained();
    }
    async waitForCapacity(signal) {
        while (!this.closed && this.bytes >= this.highWaterBytes) {
            signal.throwIfAborted();
            await new Promise((resolve, reject) => {
                const cleanup = () => {
                    this.waiters.delete(wake);
                    signal.removeEventListener('abort', abort);
                };
                const wake = () => { cleanup(); resolve(); };
                const abort = () => { cleanup(); reject(signal.reason); };
                this.waiters.add(wake);
                signal.addEventListener('abort', abort, { once: true });
                if (signal.aborted)
                    abort();
            });
        }
        signal.throwIfAborted();
    }
    drained() {
        if (!this.closed && this.bytes >= this.highWaterBytes)
            return;
        for (const wake of [...this.waiters])
            wake();
        if (!this.closed)
            this.options.onDrain?.();
    }
    next() {
        const entries = [...this.streams.entries()];
        const preferred = this.interactiveBurst >= 4 ? 'bulk' : 'interactive';
        const candidates = entries.filter(([, stream]) => stream.priority === preferred);
        const available = candidates.length ? candidates : entries;
        const next = available.find(([id]) => id > this.lastStream) ?? available[0];
        if (next) {
            this.lastStream = next[0];
            this.interactiveBurst = next[1].priority === 'bulk' ? 0 : this.interactiveBurst + 1;
        }
        return next;
    }
    async pump() {
        this.pumping = true;
        let sent = 0;
        try {
            while (!this.closed) {
                const next = this.next();
                if (!next)
                    break;
                const [id, stream] = next;
                const frame = stream.frames.shift();
                stream.bytes -= frame.byteLength;
                this.queuedBytes -= frame.byteLength;
                if (!stream.frames.length)
                    this.streams.delete(id);
                this.inFlightBytes = frame.byteLength;
                await this.options.send(frame);
                this.inFlightBytes = 0;
                this.drained();
                // Immediate in-process sends must still let sockets/cancel timers run.
                if (++sent % 8 === 0)
                    await new Promise(resolve => setImmediate(resolve));
            }
        }
        catch {
            this.close();
            this.options.onFailure();
        }
        finally {
            this.inFlightBytes = 0;
            this.pumping = false;
            this.drained();
        }
    }
}
