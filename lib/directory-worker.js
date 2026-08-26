import { mkdir, opendir, stat } from 'node:fs/promises';
import path from 'node:path';
function inputPath() {
    const encoded = process.env.DSH_WECHAT_DIRECTORY_PATH_B64 || '';
    const value = Buffer.from(encoded, 'base64').toString('utf8');
    if (!path.isAbsolute(value))
        throw new Error('absolute path required');
    return path.resolve(value);
}
async function list(target) {
    const requested = Number(process.env.DSH_WECHAT_DIRECTORY_LIMIT || 1000);
    const limit = Number.isSafeInteger(requested) && requested > 0 ? Math.min(requested, 5000) : 1000;
    const entries = [];
    let truncated = false;
    const dir = await opendir(target);
    try {
        for await (const dirent of dir) {
            let directory = dirent.isDirectory();
            if (!directory && dirent.isSymbolicLink()) {
                try {
                    directory = (await stat(path.join(target, dirent.name))).isDirectory();
                }
                catch {
                    directory = false;
                }
            }
            if (!directory)
                continue;
            if (entries.length >= limit) {
                truncated = true;
                break;
            }
            entries.push({ name: dirent.name, hidden: process.platform !== 'win32' && dirent.name.startsWith('.') });
        }
    }
    finally {
        await dir.close().catch(() => { });
    }
    entries.sort((left, right) => left.name.localeCompare(right.name));
    process.stdout.write(JSON.stringify({ entries, truncated }));
}
async function create(target) {
    try {
        await mkdir(target);
    }
    catch (error) {
        if (error && typeof error === 'object' && 'code' in error && error.code === 'EEXIST')
            process.exit(17);
        throw error;
    }
}
async function main() {
    const action = process.argv[2];
    const target = inputPath();
    if (action === 'list')
        return await list(target);
    if (action === 'create')
        return await create(target);
    throw new Error('unsupported directory worker action');
}
main().catch((error) => {
    process.stderr.write(error instanceof Error ? error.message : String(error));
    process.exit(1);
});
