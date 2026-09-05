import { createHash } from 'node:crypto';
import { gunzipSync } from 'node:zlib';
import { trustedReleaseAsset } from './update-policy.js';
export async function boundedFetch(url, maxBytes, fetcher = fetch) {
    // GitHub release assets redirect to its own CDN. Validate EVERY hop and cap
    // response bodies even when Content-Length is absent or deliberately wrong.
    let next = url;
    for (let i = 0; i < 5; i++) {
        const u = new URL(next);
        if (u.protocol !== 'https:' || u.username || u.password || u.port
            || !['github.com', 'release-assets.githubusercontent.com', 'objects.githubusercontent.com', 'relay.xyxfood.xyz'].includes(u.hostname))
            throw new Error('更新下载来源不受信任');
        const res = await fetcher(next, { signal: AbortSignal.timeout(maxBytes <= 256 * 1024 ? 10000 : 60000), redirect: 'manual' });
        if ([301, 302, 303, 307, 308].includes(res.status)) {
            await res.body?.cancel();
            const location = res.headers.get('location');
            if (!location)
                throw new Error('更新来源重定向无效');
            next = new URL(location, next).href;
            continue;
        }
        if (!res.ok || !res.body) {
            await res.body?.cancel();
            throw new Error('更新服务暂不可用');
        }
        if (Number(res.headers.get('content-length')) > maxBytes) {
            await res.body.cancel();
            throw new Error('更新响应超过大小限制');
        }
        const reader = res.body.getReader(), chunks = [];
        let size = 0;
        try {
            for (;;) {
                const { done, value } = await reader.read();
                if (done)
                    break;
                size += value.length;
                if (size > maxBytes)
                    throw new Error('更新响应超过大小限制');
                chunks.push(value);
            }
        }
        catch (error) {
            await reader.cancel();
            throw error;
        }
        return Buffer.concat(chunks);
    }
    throw new Error('更新来源重定向过多');
}
/** Audit the npm tarball BEFORE any package manager sees it. No extraction. */
export function auditArchive(archive, release) {
    if (!release.asset || archive.length !== release.asset.bytes
        || createHash('sha256').update(archive).digest('hex') !== release.asset.sha256)
        throw new Error('更新包校验失败，未修改当前插件');
    const tar = gunzipSync(archive, { maxOutputLength: 64 * 1024 * 1024 });
    const seen = new Set();
    let manifest, entries = 0;
    for (let offset = 0; offset + 512 <= tar.length;) {
        const header = tar.subarray(offset, offset + 512);
        if (header.every(b => b === 0))
            break;
        if (++entries > 5000)
            throw new Error('更新包文件数量异常');
        const field = (start, size) => header.subarray(start, start + size).toString('utf8').replace(/\0.*$/s, '');
        const name = (field(345, 155) ? field(345, 155) + '/' : '') + field(0, 100);
        const type = field(156, 1);
        const sizeText = field(124, 12).trim();
        if (!/^[0-7]+$/.test(sizeText))
            throw new Error('更新包大小字段无效');
        const size = parseInt(sizeText, 8);
        const sumText = field(148, 8).trim();
        const sum = [...header].reduce((n, b, i) => n + (i >= 148 && i < 156 ? 32 : b), 0);
        if (!/^[0-7]+$/.test(sumText) || parseInt(sumText, 8) !== sum)
            throw new Error('更新包头校验失败');
        if (!name.startsWith('package/') || /[\\:\x00-\x1f]/.test(name)
            || name.split('/').some(part => part === '..' || part === '.')
            || name.split('/').some(part => /[. ]$/.test(part) || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part))
            || !['0', '', '5'].includes(type) || seen.has(name.toLowerCase())
            || !Number.isSafeInteger(size) || size < 0 || offset + 512 + size > tar.length)
            throw new Error('更新包包含不安全的路径或文件类型');
        seen.add(name.toLowerCase());
        if (name === 'package/package.json') {
            if (size > 65536)
                throw new Error('更新包清单过大');
            manifest = JSON.parse(tar.subarray(offset + 512, offset + 512 + size).toString('utf8'));
        }
        offset += 512 + Math.ceil(size / 512) * 512;
    }
    if (!manifest || manifest.name !== '@harness-remote/dsh-wechat-remote' || manifest.version !== release.version
        || !seen.has('package/lib/index.js') || !seen.has('package/lib/client.js'))
        throw new Error('更新包名称、版本或入口不匹配');
    const scripts = manifest.scripts;
    if (['preinstall', 'install', 'postinstall', 'prepare'].some(name => scripts?.[name]))
        throw new Error('更新包包含不允许的安装脚本');
}
export async function downloadRelease(release, fetcher = fetch) {
    if (!trustedReleaseAsset(release.asset, release.version))
        throw new Error('暂无可验证的正式更新包');
    const body = await boundedFetch(release.asset.url, release.asset.bytes, fetcher);
    auditArchive(body, release);
    return body;
}
