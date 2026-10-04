/** Public identity evidence, not a business filter or a native routing-ID export. */
import { type HumanTaskRef } from '../human-tools/protocol.js';
export declare const recipientSnapshot: (value: unknown) => value is string;
export declare function recipientFacts(value: unknown, taskRef: HumanTaskRef, roundId: string | null, offset: number, snapshot?: string): {
    schema: string;
    taskRef: HumanTaskRef;
    roundId: string | null;
    asOf: number;
    revision: number;
    snapshot: string;
    nextOffset: unknown;
    coverage: Record<string, unknown>;
    recipients: {
        identity: {
            schema: "human.member.identity.v1";
            groupRef: string;
            memberRef: string;
        };
        recipientRef: import("../human-tools/protocol.js").HumanRecipientRef;
        participantRef: unknown;
        sources: any[];
        observedAt: unknown;
        confirmedAt: unknown;
        identityVerifiedAt: unknown;
        canTarget: boolean;
        unavailableReason: unknown;
        submissionFacts: unknown;
    }[];
};
