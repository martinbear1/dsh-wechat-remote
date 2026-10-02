/** Agent-neutral, executable-code-free wire contract. No host/session authority is public. */
import { type HumanInitialRound } from './form.js';
import { type HumanCardAsset } from './card-cover.js';
export interface HumanSurface {
    readonly schemaVersion: 1;
    readonly kind: 'human.surface';
    readonly id: string;
    readonly revision: 1;
    readonly title: string;
    readonly body: string;
    /** Business locator only; never grants group identity or permission. */
    readonly targetTaskRef?: HumanTaskRef;
    readonly selectionRef?: HumanSelectionRef;
    readonly reminder?: {
        readonly title: string;
        readonly type: 'complete';
    };
    readonly workflowRef?: HumanWorkflowDraftRef;
    readonly initialRound?: HumanInitialRound;
    readonly cover?: HumanCardAsset;
    readonly actions: readonly [HumanAction];
}
export type HumanAction = {
    readonly id: 'share';
    readonly type: 'wechat.share';
    readonly label: '发送群卡' | '发送测试卡片';
} | {
    readonly id: 'select-members';
    readonly type: 'wechat.select-members';
    readonly label: '选择任务成员';
} | {
    readonly id: 'remind';
    readonly type: 'wechat.remind';
    readonly label: '提醒已选未完成人员';
} | {
    readonly id: 'workflow-approve';
    readonly type: 'workflow.approve';
    readonly label: '审核任务方案';
};
export interface HumanWorkflowDraftRef {
    readonly schema: 'human.lifecycle.draft.ref.v1';
    readonly draftId: string;
    readonly version: 1;
    readonly digest: string;
    readonly kind: 'round' | 'review' | 'reminder';
}
export type HumanOutcome = 'success' | 'cancelled' | 'failed' | 'unknown';
export interface HumanActionRequest {
    readonly scope: string;
    readonly surfaceId: string;
    readonly revision: number;
    readonly actionId: string;
    readonly attemptId: string;
}
export interface HumanTaskRef {
    readonly schema: 'human.task.ref.v1';
    readonly taskId: string;
    readonly deliveryId: string;
}
export interface HumanSelectionRef {
    readonly schema: 'human.members.ref.v1';
    readonly taskId: string;
    readonly deliveryId: string;
    readonly revision: number;
    readonly memberRefs: readonly string[];
}
export interface HumanAckRequest extends HumanActionRequest {
    readonly outcome: HumanOutcome;
    readonly taskRef?: HumanTaskRef;
    readonly selectionRef?: HumanSelectionRef;
    readonly reason?: 'no_pending_members';
}
/** Keep the untrusted nested value intact across generated RPC codecs so the
 * core can reject extra identity/credential fields instead of stripping them. */
export interface HumanAckWireRequest extends HumanActionRequest {
    readonly outcome: HumanOutcome;
    readonly taskRef?: Readonly<Record<string, string>>;
    readonly selectionRef?: Readonly<Record<string, string | number | readonly string[]>>;
    readonly reason?: string;
}
export interface HumanReceipt {
    readonly schema: 'human.action.receipt.v1';
    readonly surfaceId: string;
    readonly attemptId: string;
    readonly receiptId: string;
    readonly outcome: HumanOutcome;
    readonly taskRef?: HumanTaskRef;
    readonly selectionRef?: HumanSelectionRef;
    readonly reason?: 'no_pending_members';
    /** recorded means durable plugin state, not a message queued for another turn.
     * COMPAT(human-inbox-m0): legacy values remain readable until Inbox-based
     * research ledgers/clients have retired; never replay them into DSH Inbox. */
    readonly delivery: 'recorded' | 'pending' | 'dispatching' | 'queued' | 'uncertain';
}
export declare const HUMAN_TOOL_NAME = "human_surface_share";
export { HUMAN_SURFACE_MAX_BYTES } from './capacity.js';
export declare const HUMAN_MEMBERS_TOOL_NAME = "human_task_select_members";
export declare const HUMAN_REMIND_TOOL_NAME = "human_task_remind";
export declare const HUMAN_ACTION: Readonly<{
    readonly id: "share";
    readonly type: "wechat.share";
    readonly label: "发送群卡";
}>;
export declare const HUMAN_MEMBERS_ACTION: Readonly<{
    readonly id: "select-members";
    readonly type: "wechat.select-members";
    readonly label: "选择任务成员";
}>;
export declare const HUMAN_REMIND_ACTION: Readonly<{
    readonly id: "remind";
    readonly type: "wechat.remind";
    readonly label: "提醒已选未完成人员";
}>;
export declare const HUMAN_WORKFLOW_ACTION: Readonly<{
    readonly id: "workflow-approve";
    readonly type: "workflow.approve";
    readonly label: "审核任务方案";
}>;
export declare const HUMAN_ID: RegExp;
export declare const ATTEMPT_ID: RegExp;
export declare const TASK_REF_ID: RegExp;
export declare function humanWorkflowDraftRef(value: unknown): HumanWorkflowDraftRef | undefined;
export declare function humanTaskRef(value: unknown): HumanTaskRef | undefined;
export declare function sameTaskRef(a: HumanTaskRef | undefined, b: HumanTaskRef | undefined): boolean;
export declare function humanMemberRefs(value: unknown): value is readonly string[];
export declare function humanSelectionRef(value: unknown): HumanSelectionRef | undefined;
export declare function sameSelectionRef(a: HumanSelectionRef | undefined, b: HumanSelectionRef | undefined): boolean;
export declare function humanReminderTitle(value: unknown): value is string;
/** Strict action-specific receipt data, shared by wire validation and durable reload. */
export declare function humanReceiptData(surface: HumanSurface, value: Record<string, unknown>): boolean;
export declare function object(value: unknown): value is Record<string, unknown>;
export declare function text(value: unknown, max: number): value is string;
export declare function exactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean;
/** Reject rather than coerce newer schemas, hidden fields, arbitrary routes and actions. */
export declare function humanSurface(value: unknown): HumanSurface | undefined;
