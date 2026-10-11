import { createHash } from 'node:crypto';
export const RESOURCE_MAX_BYTES = 2 * 1024 * 1024;
export const RESOURCE_PROMPT_MAX_BYTES = 1024 * 1024;
export class ResourceError extends Error {
    code;
    constructor(code, message) {
        super(message);
        this.code = code;
        this.name = 'ResourceError';
    }
}
export const resourceError = (code, message) => new ResourceError(code, message);
export const resourceSha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
export const resourceIdValid = (value) => typeof value === 'string' && /^[a-z0-9][a-z0-9-]{0,63}$/.test(value);
export function resourceVersionValid(value) {
    if (typeof value !== 'string' || value.length > 128)
        return false;
    const match = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/.exec(value);
    return !!match && (!match[4] || match[4].split('.').every(part => !/^\d+$/.test(part) || part === '0' || part[0] !== '0'));
}
const plain = (value, max) => typeof value === 'string' && value.length <= max && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value);
export function validateResourceRelease(value) {
    if (!value || !resourceIdValid(value.resourceId) || !resourceVersionValid(value.version)
        || typeof value.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(value.sha256)
        || !Number.isSafeInteger(value.bytes) || value.bytes < 1 || value.bytes > RESOURCE_MAX_BYTES)
        throw resourceError('resource-release-invalid', '资源版本信息无效。');
    return { resourceId: value.resourceId, version: value.version, sha256: value.sha256, bytes: value.bytes };
}
/** Strict data schema. No module names, executable expressions or tool scripts
 * can enter the native composition through this transport. Prompt text is data. */
export function parseResourcePreset(bytes, expected) {
    if (!(bytes instanceof Uint8Array) || bytes.byteLength < 1 || bytes.byteLength > RESOURCE_MAX_BYTES)
        throw resourceError('resource-size-invalid', '预设文件大小无效。');
    if (expected) {
        validateResourceRelease(expected);
        if (bytes.byteLength !== expected.bytes || resourceSha256(bytes) !== expected.sha256)
            throw resourceError('resource-integrity', '下载内容与资源版本不一致，请重新下载。');
    }
    let value;
    try {
        value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
    }
    catch {
        throw resourceError('resource-json-invalid', '资源不是有效的 UTF-8 JSON 预设。');
    }
    const keys = ['schemaVersion', 'kind', 'resourceId', 'version', 'name', 'description', 'basePreset', 'systemPrompt'];
    if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).length !== keys.length
        || keys.some(key => !Object.hasOwn(value, key)) || value.schemaVersion !== 1 || value.kind !== 'preset'
        || !resourceIdValid(value.resourceId) || !resourceVersionValid(value.version)
        || !plain(value.name, 120) || !value.name.trim() || !plain(value.description, 2000)
        || !plain(value.basePreset, 256) || !value.basePreset.trim() || /[\r\n\t]/.test(value.basePreset)
        || typeof value.systemPrompt !== 'string' || !value.systemPrompt.trim() || value.systemPrompt.includes('\0')
        || /[\uD800-\uDFFF]/u.test(value.systemPrompt) || Buffer.byteLength(value.systemPrompt) > RESOURCE_PROMPT_MAX_BYTES
        || expected && (value.resourceId !== expected.resourceId || value.version !== expected.version))
        throw resourceError('resource-preset-invalid', '资源内容不符合预设格式。');
    return value;
}
export const resourceKey = (value) => resourceSha256(`${value.resourceId}\0${value.version}`);
export const resourcePresetId = (value) => `hr-resource-${value.resourceId}-${resourceSha256(value.version).slice(0, 12)}`;
