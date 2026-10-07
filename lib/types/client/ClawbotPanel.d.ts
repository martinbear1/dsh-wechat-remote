import type { ClawbotRequest, ClawbotSession, ClawbotStatus } from '../clawbot/contracts.js';
export type ClawbotCall = (request: ClawbotRequest) => Promise<ClawbotStatus | {
    sessions: ClawbotSession[];
}>;
/** Owner-facing channel controls. Not a second chat UI or a preset selector. */
export declare function ClawbotPanel({ call }: {
    call: ClawbotCall;
}): JSX.Element;
