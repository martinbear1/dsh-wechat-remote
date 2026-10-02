/** Versioned offline submission envelope. No session keys, executable fields,
 * file names, URLs or account credentials occur inside this protocol. Public
 * keys are distributed by the authenticated service: this does NOT protect
 * first contact against a malicious server replacing the whole identity. */
import { createHash } from 'node:crypto';
import nacl from 'tweetnacl';
import { exact, fail, identifier, plain, row, version } from './data.js';
import { humanTaskRef } from '../human-tools/protocol.js';
export const SUBMISSION_IMAGE_MAX = 10 * 1024 * 1024;
export const SUBMISSION_CIPHER_MAX = SUBMISSION_IMAGE_MAX + 64 * 1024;
export const SUBMISSION_MANIFEST_MAX = 32 * 1024;
export const sha512 = (value) => createHash('sha512').update(value).digest('hex');
export const sha256 = (value) => createHash('sha256').update(value).digest('hex');
export function canonicalSubmission(value) {
    if (value === null || typeof value === 'string' || typeof value === 'boolean' || typeof value === 'number' && Number.isFinite(value))
        return JSON.stringify(value);
    if (Array.isArray(value))
        return '[' + value.map(canonicalSubmission).join(',') + ']';
    if (row(value))
        return '{' + Object.keys(value).sort().map(key => JSON.stringify(key) + ':' + canonicalSubmission(value[key])).join(',') + '}';
    throw fail('submission-invalid', '提交包含不支持的数据');
}
export function base64Bytes(value, size) {
    if (typeof value !== 'string' || value.length > size * 2 || !/^[A-Za-z0-9+/]+={0,2}$/.test(value))
        throw fail('submission-invalid', '加密描述无效');
    const bytes = Buffer.from(value, 'base64');
    if (bytes.length !== size || bytes.toString('base64') !== value)
        throw fail('submission-invalid', '加密描述无效');
    return bytes;
}
export function submissionContext(value) {
    if (!row(value) || !exact(value, ['schema', 'bindingKey', 'taskRef', 'roundId', 'participantRef', 'submissionId', 'version', 'objectId', 'keyId'])
        || value.schema !== 'human.submission.context.v1' || typeof value.bindingKey !== 'string' || !/^[a-f0-9]{64}$/.test(value.bindingKey)
        || !humanTaskRef(value.taskRef) || !['roundId', 'participantRef', 'submissionId', 'objectId', 'keyId'].every(key => identifier(value[key]))
        || !version(value.version))
        throw fail('submission-context-invalid', '提交归属或版本无效');
    return structuredClone(value);
}
export function submissionEnvelope(value) {
    if (!row(value) || !exact(value, ['schema', 'keyId', 'ephemeralPublicKey', 'nonce', 'cipherBytes', 'cipherDigest', 'manifestDigest'])
        || value.schema !== 'human.submission.box.v1' || !identifier(value.keyId) || !Number.isSafeInteger(value.cipherBytes)
        || Number(value.cipherBytes) < 21 || Number(value.cipherBytes) > SUBMISSION_CIPHER_MAX
        || !['cipherDigest', 'manifestDigest'].every(key => typeof value[key] === 'string' && /^[a-f0-9]{128}$/.test(value[key])))
        throw fail('submission-envelope-invalid', '提交密文清单无效');
    base64Bytes(value.ephemeralPublicKey, 32);
    base64Bytes(value.nonce, 24);
    return structuredClone(value);
}
export function submissionAnswers(value) {
    if (!row(value) || Object.keys(value).length > 12 || Object.entries(value).some(([key, answer]) => !/^[a-z][a-z0-9_]{0,47}$/.test(key) || ['constructor', 'prototype', '__proto__'].includes(key)
        || !(typeof answer === 'boolean' || typeof answer === 'number' && Number.isFinite(answer) || plain(answer, 2000)
            || Array.isArray(answer) && answer.length <= 20 && new Set(answer).size === answer.length && answer.every(item => plain(item, 80)))))
        throw fail('submission-invalid', '提交字段无效');
    return structuredClone(value);
}
export function submissionManifest(value) {
    if (!row(value) || !exact(value, ['schema', 'context', 'answers', 'file']) || value.schema !== 'human.submission.manifest.v1'
        || !row(value.file) || !exact(value.file, ['mediaType', 'plainBytes', 'plainDigest']) || !['image/jpeg', 'image/png'].includes(String(value.file.mediaType))
        || !Number.isSafeInteger(value.file.plainBytes) || Number(value.file.plainBytes) < 1 || Number(value.file.plainBytes) > SUBMISSION_IMAGE_MAX
        || typeof value.file.plainDigest !== 'string' || !/^[a-f0-9]{128}$/.test(value.file.plainDigest))
        throw fail('submission-manifest-invalid', '附件清单无效');
    submissionContext(value.context);
    submissionAnswers(value.answers);
    if (Buffer.byteLength(canonicalSubmission(value)) > SUBMISSION_MANIFEST_MAX)
        throw fail('submission-manifest-invalid', '附件清单过大');
    return structuredClone(value);
}
export function decryptSubmission(cipher, raw, secretKey, expected, values) {
    const envelope = submissionEnvelope(raw), context = submissionContext(expected);
    if (envelope.keyId !== context.keyId || cipher.length !== envelope.cipherBytes || sha512(cipher) !== envelope.cipherDigest || secretKey.length !== 32)
        throw fail('submission-integrity-invalid', '提交密文完整性或密钥不匹配');
    const publicKey = base64Bytes(envelope.ephemeralPublicKey, 32);
    if (nacl.scalarMult(secretKey, publicKey).every(byte => byte === 0))
        throw fail('submission-integrity-invalid', '提交公钥无效');
    const clear = nacl.box.open(cipher, base64Bytes(envelope.nonce, 24), publicKey, secretKey);
    if (!clear || clear.length < 5)
        throw fail('submission-integrity-invalid', '提交解密认证失败');
    const bytes = Buffer.from(clear), length = bytes.readUInt32BE(0);
    if (!length || length > SUBMISSION_MANIFEST_MAX || length + 4 >= clear.length)
        throw fail('submission-manifest-invalid', '提交清单长度无效');
    const encoded = bytes.subarray(4, length + 4);
    if (sha512(encoded) !== envelope.manifestDigest)
        throw fail('submission-integrity-invalid', '提交清单摘要不匹配');
    let manifest;
    try {
        manifest = submissionManifest(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(encoded)));
    }
    catch {
        throw fail('submission-manifest-invalid', '提交清单格式无效');
    }
    if (canonicalSubmission(manifest) !== encoded.toString('utf8') || canonicalSubmission(manifest.context) !== canonicalSubmission(context)
        || canonicalSubmission(manifest.answers) !== canonicalSubmission(submissionAnswers(values)))
        throw fail('submission-context-invalid', '提交来源、答案或版本已变化');
    const image = bytes.subarray(length + 4);
    if (image.length !== manifest.file.plainBytes || sha512(image) !== manifest.file.plainDigest)
        throw fail('submission-integrity-invalid', '图片大小或摘要不匹配');
    const signature = manifest.file.mediaType === 'image/png' ? image.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
        : image.length > 3 && image[0] === 255 && image[1] === 216 && image[2] === 255;
    if (!signature)
        throw fail('submission-image-invalid', '图片格式与声明不符');
    // Full raster decoding/admission is mandatory in the receiver before ACK.
    return { manifest, image };
}
