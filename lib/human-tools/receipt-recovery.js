import { humanReceiptData, humanTaskRef, humanSelectionRef } from './protocol.js';
import { bounded, exact, fail, row } from '../human-workflow/data.js';
import { receiverBinding } from '../human-workflow/lifecycle.js';
import { canonicalSubmission, sha256 } from '../human-workflow/submission-crypto.js';
/** This is a reconciliation adapter, not an Agent tool or execution route.
 * The server authenticates the node and checks its saved source fingerprint.
 * Missing/pending/legacy sources grant nothing; no list or cached fact is used. */
export function actionReceiptRecovery(transport, assertOrigin) {
    return async ({ surface, origin, attemptId }, signal) => {
        signal.throwIfAborted();
        transport.assertIdentity();
        await assertOrigin(origin.scope, origin.generation, signal);
        const expected = { scope: origin.scope, sessionGeneration: origin.generation, surfaceId: surface.id, attemptId };
        let response;
        try {
            response = await transport.request('action-result', { ...expected, surface }, signal);
        }
        catch (cause) {
            signal.throwIfAborted();
            transport.assertIdentity();
            await assertOrigin(origin.scope, origin.generation, signal);
            // A pre-upgrade server has no exact recovery route. Preserve the original
            // phone-ACK path; a missing endpoint is never evidence of completion.
            if (cause?.status === 404)
                return;
            throw cause;
        }
        signal.throwIfAborted();
        transport.assertIdentity();
        await assertOrigin(origin.scope, origin.generation, signal);
        const invalid = () => fail('human-recovery-invalid', '操作结果与原记录不一致，未更新或重新发送');
        if (!row(response))
            throw invalid();
        bounded(response, 16 * 1024);
        if (!exact(response, ['schema', 'binding', 'origin', 'actionId', 'surfaceId', 'attemptId', 'surfaceDigest', 'phase'], ['ok', 'outcome', 'taskRef', 'selectionRef', 'reason']) || response.schema !== 'human.action.recovery.v1'
            || Object.hasOwn(response, 'ok') && response.ok !== true
            || !row(response.origin) || !exact(response.origin, Object.keys(expected))
            || Object.entries(expected).some(([key, value]) => response.origin[key] !== value)
            || response.actionId !== surface.actions[0].id || response.surfaceId !== surface.id || response.attemptId !== attemptId
            || response.surfaceDigest !== sha256(canonicalSubmission(surface))
            || !['missing', 'pending', 'completed'].includes(String(response.phase)))
            throw invalid();
        receiverBinding(response.binding, transport.nodeId);
        if (response.phase !== 'completed') {
            if (['outcome', 'taskRef', 'selectionRef', 'reason'].some(key => Object.hasOwn(response, key)))
                throw invalid();
            return;
        }
        if (!['success', 'cancelled', 'failed', 'unknown'].includes(String(response.outcome))
            || !humanReceiptData(surface, response)
            || response.outcome === 'success' && surface.actions[0].id === 'share' && !humanTaskRef(response.taskRef)
            || response.outcome === 'success' && surface.actions[0].id === 'select-members' && !humanSelectionRef(response.selectionRef))
            throw invalid();
        return { scope: origin.scope, surfaceId: surface.id, revision: surface.revision, actionId: surface.actions[0].id, attemptId,
            outcome: response.outcome, ...(response.taskRef ? { taskRef: response.taskRef } : {}),
            ...(response.selectionRef ? { selectionRef: response.selectionRef } : {}), ...(response.reason ? { reason: response.reason } : {}) };
    };
}
