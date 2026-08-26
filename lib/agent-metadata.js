import { createHash, randomBytes } from 'node:crypto';
import { existsSync, readFileSync, realpathSync } from 'node:fs';
import { homedir, hostname } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readPrivateJson, writePrivateJsonAtomic } from './secure-file.js';
import { hostPlatformDescriptor } from './host-platform.js';
const ROOT = path.join(homedir(), '.dsh', 'harness-remote');
const HOST_PATH = path.join(ROOT, 'host.json');
let cachedDescriptor = null;
export const AGENT_CAPABILITIES = Object.freeze([
    Object.freeze({ id: 'dsh.rpc', version: 1 }),
    Object.freeze({ id: 'dsh.realtime', version: 1 }),
    Object.freeze({ id: 'wechat.directory', version: 1 }),
    Object.freeze({ id: 'wechat.history-window', version: 1 }),
    Object.freeze({ id: 'wechat.attachment-object', version: 1 }),
    Object.freeze({ id: 'harness.public-relay-e2ee', version: 1 }),
    Object.freeze({ id: 'harness.lan-bootstrap', version: 1 }),
    Object.freeze({ id: 'harness.host-platform', version: 1 }),
    Object.freeze({ id: 'harness.oss-e2ee-objects', version: 1 }),
]);
function stableId(file) {
    if (existsSync(file)) {
        const stored = readPrivateJson(file);
        if (stored.version !== 1 || !/^[A-Za-z0-9_-]{20,64}$/.test(stored.id)) {
            throw new Error(`Harness Remote metadata is invalid: ${path.basename(file)}`);
        }
        return stored.id;
    }
    const id = randomBytes(18).toString('base64url');
    writePrivateJsonAtomic(file, { version: 1, id });
    return id;
}
/** Installed DSH profile name without exposing its filesystem path. */
export function agentProfileScope() {
    const modulePath = fileURLToPath(import.meta.url);
    const match = /[\\/]\.dsh[\\/]profiles[\\/]([^\\/]+)[\\/]node_modules[\\/]/i.exec(modulePath);
    if (match && /^[A-Za-z0-9._-]{1,80}$/.test(match[1]))
        return match[1];
    return 'default';
}
function instanceStorageKey() {
    return createHash('sha256')
        .update(`deepseek-harness\0${agentProfileScope()}`)
        .digest('hex')
        .slice(0, 24);
}
export function defaultAgentIdentityPath() {
    const scope = agentProfileScope();
    // Preserve an existing default web nodeId and its cloud ownership.
    if (scope === 'web' || scope === 'default') {
        return path.join(homedir(), '.dsh', 'harness-remote-public-identity.json');
    }
    return path.join(ROOT, 'instances', instanceStorageKey(), 'identity.json');
}
function packageVersionFromAncestors(start) {
    let current = path.resolve(start);
    for (let depth = 0; depth < 8; depth += 1) {
        const manifest = path.join(current, 'package.json');
        try {
            const value = JSON.parse(readFileSync(manifest, 'utf8'));
            if (value.name === '@deepseek-ai/dsh' && typeof value.version === 'string' && value.version) {
                return value.version;
            }
        }
        catch { /* continue walking */ }
        const parent = path.dirname(current);
        if (parent === current)
            break;
        current = parent;
    }
    return null;
}
/** DSH CLI version, not the plugin adapter version and not host.describe's protocol version. */
export function installedDshVersion() {
    const override = process.env.DSH_RUNTIME_VERSION;
    if (override && /^[A-Za-z0-9._+-]{1,64}$/.test(override))
        return override;
    const argvEntry = process.argv[1];
    if (argvEntry) {
        let resolvedEntry = argvEntry;
        try {
            resolvedEntry = realpathSync(argvEntry);
        }
        catch { /* use argv path */ }
        const found = packageVersionFromAncestors(path.dirname(resolvedEntry));
        if (found)
            return found;
    }
    for (const entry of String(process.env.PATH || '').split(path.delimiter)) {
        if (!entry)
            continue;
        try {
            const command = path.join(entry, process.platform === 'win32' ? 'dsh.cmd' : 'dsh');
            const found = packageVersionFromAncestors(path.dirname(realpathSync(command)));
            if (found)
                return found;
        }
        catch { /* keep searching */ }
        try {
            const value = JSON.parse(readFileSync(path.join(entry, 'node_modules', '@deepseek-ai', 'dsh', 'package.json'), 'utf8'));
            if (value.name === '@deepseek-ai/dsh' && typeof value.version === 'string' && value.version) {
                return value.version;
            }
        }
        catch { /* keep searching */ }
    }
    return 'unknown';
}
export function loadAgentDescriptor() {
    if (cachedDescriptor)
        return cachedDescriptor;
    const instancePath = path.join(ROOT, 'instances', instanceStorageKey(), 'agent.json');
    cachedDescriptor = {
        schemaVersion: 1,
        hostId: stableId(HOST_PATH),
        agentInstanceId: stableId(instancePath),
        hostName: hostname(),
        agentKind: 'deepseek-harness',
        agentName: 'DeepSeek Harness',
        agentVersion: installedDshVersion(),
        hostPlatform: hostPlatformDescriptor(),
        capabilities: AGENT_CAPABILITIES,
    };
    return cachedDescriptor;
}
