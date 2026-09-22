import { readFileSync, renameSync, } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { tightenPrivateFile, writePrivateJsonAtomic } from './secure-file.js';
function messageOf(error) {
    return error instanceof Error ? error.message : String(error);
}
function errorCodeOf(error) {
    if (!error || typeof error !== 'object' || !('code' in error))
        return undefined;
    return typeof error.code === 'string' ? error.code : undefined;
}
function freshState() {
    return { token: randomBytes(32).toString('base64url') };
}
function parseState(text) {
    const value = JSON.parse(text);
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        throw new Error('state root is not an object');
    }
    const raw = value;
    if (typeof raw.token !== 'string' || raw.token.length < 32) {
        throw new Error('state token is missing or invalid');
    }
    if (raw.publicIdentityNodeId !== undefined && raw.publicIdentityNodeId !== null &&
        typeof raw.publicIdentityNodeId !== 'string') {
        throw new Error('state public identity is invalid');
    }
    return {
        token: raw.token,
        publicIdentityNodeId: typeof raw.publicIdentityNodeId === 'string'
            ? raw.publicIdentityNodeId
            : undefined,
    };
}
function corruptBackupPath(file) {
    return `${file}.corrupt-${Date.now()}-${randomBytes(5).toString('hex')}`;
}
/**
 * Load the private LAN credential without treating every filesystem failure as
 * a first run. A malformed file is preserved under a unique .corrupt-* name;
 * unreadable files remain untouched and make only the LAN door unavailable.
 */
export function loadGateState(file) {
    let text;
    try {
        text = readFileSync(file, 'utf8');
    }
    catch (error) {
        if (errorCodeOf(error) !== 'ENOENT') {
            return {
                state: freshState(),
                persistent: false,
                warning: `cannot read LAN credential state: ${messageOf(error)}`,
            };
        }
        const state = freshState();
        try {
            writePrivateJsonAtomic(file, state);
            return { state, persistent: true };
        }
        catch (writeError) {
            return {
                state,
                persistent: false,
                warning: `cannot create LAN credential state: ${messageOf(writeError)}`,
            };
        }
    }
    try {
        const state = parseState(text);
        tightenPrivateFile(file);
        return { state, persistent: true };
    }
    catch (parseError) {
        const backup = corruptBackupPath(file);
        const state = freshState();
        try {
            renameSync(file, backup);
            tightenPrivateFile(backup);
            try {
                writePrivateJsonAtomic(file, state);
            }
            catch (writeError) {
                // Restore the original evidence when recovery cannot be completed.
                try {
                    renameSync(backup, file);
                }
                catch { /* keep the backup if restore also fails */ }
                throw writeError;
            }
            return {
                state,
                persistent: true,
                recoveredFrom: backup,
                warning: `invalid LAN credential state was preserved at ${backup}: ${messageOf(parseError)}`,
            };
        }
        catch (recoveryError) {
            return {
                state,
                persistent: false,
                warning: `invalid LAN credential state was not replaced: ${messageOf(recoveryError)}`,
            };
        }
    }
}
export function saveGateState(file, state) {
    writePrivateJsonAtomic(file, state);
}
