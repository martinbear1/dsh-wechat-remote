import { mkdir, open, rename, unlink } from 'node:fs/promises';
import { dirname } from 'node:path';
import { randomBytes } from 'node:crypto';
import { bounded } from './data.js';
/** Pass a file inside the actual node/profile directory. The registry also
 * checks the persisted node id so a misconfigured path cannot borrow another node. */
export class WorkflowFileStore {
    file;
    maxBytes;
    constructor(file, maxBytes = 2 * 1024 * 1024) {
        this.file = file;
        this.maxBytes = maxBytes;
        if (!Number.isSafeInteger(maxBytes) || maxBytes < 1024 || maxBytes > 96 * 1024 * 1024)
            throw new Error('工作流账本容量配置无效');
    }
    async load() {
        try {
            const file = await open(this.file, 'r');
            try {
                if ((await file.stat()).size > this.maxBytes)
                    throw new Error('工作流账本超过容量限制');
                return JSON.parse(await file.readFile('utf8'));
            }
            finally {
                await file.close();
            }
        }
        catch (cause) {
            if (cause.code === 'ENOENT')
                return undefined;
            throw cause;
        }
    }
    async save(value) {
        bounded(value, this.maxBytes);
        await mkdir(dirname(this.file), { recursive: true, mode: 0o700 });
        const temporary = `${this.file}.${process.pid}.${randomBytes(6).toString('hex')}.tmp`;
        try {
            const file = await open(temporary, 'wx', 0o600);
            try {
                await file.writeFile(JSON.stringify(value));
                await file.sync();
            }
            finally {
                await file.close();
            }
            await rename(temporary, this.file);
            if (process.platform !== 'win32') {
                const directory = await open(dirname(this.file), 'r');
                try {
                    await directory.sync();
                }
                finally {
                    await directory.close();
                }
            }
        }
        finally {
            try {
                await unlink(temporary);
            }
            catch (cause) {
                if (cause.code !== 'ENOENT')
                    throw cause;
            }
        }
    }
}
