import type { AgentIdentity } from './public-relay-agent.js';
/** v2 signs the exact UTF-8 body sent by fetch, not a reserialized JSON object.
 * Deploy the accepting relay before this plugin; never retry auth failures as v1.
 * This proof covers control requests only, not OSS bytes or realtime frames. */
export declare function createAgentHttpProof(identity: Pick<AgentIdentity, 'nodeId' | 'privateKeyPem'>, method: string, pathname: string, body?: string): Record<string, string>;
