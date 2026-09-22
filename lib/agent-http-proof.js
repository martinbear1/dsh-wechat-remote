import { createHash, randomBytes, sign } from 'node:crypto';
/** v2 signs the exact UTF-8 body sent by fetch, not a reserialized JSON object.
 * Deploy the accepting relay before this plugin; never retry auth failures as v1.
 * This proof covers control requests only, not OSS bytes or realtime frames. */
export function createAgentHttpProof(identity, method, pathname, body) {
    const timestamp = Date.now();
    const nonce = randomBytes(18).toString('base64url');
    const digest = createHash('sha256').update(body ?? '', 'utf8').digest('hex');
    const message = Buffer.from(`agent-http-v2\n${method.toUpperCase()}\n${pathname}\n${identity.nodeId}\n${timestamp}\n${nonce}\n${digest}`);
    return {
        'x-hr-proof-version': '2',
        'x-hr-node-id': identity.nodeId,
        'x-hr-timestamp': String(timestamp),
        'x-hr-nonce': nonce,
        'x-hr-signature': sign(null, message, identity.privateKeyPem).toString('base64url'),
    };
}
