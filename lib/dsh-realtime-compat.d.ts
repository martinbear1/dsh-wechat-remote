import type { Context } from '@deepseek-ai/cordis';
import type { WebSocket } from 'ws';
import { type LegacyClientRequest } from './dsh-protocol-compat.js';
type JsonRecord = Record<string, unknown>;
/** A downlink may be a LAN WebSocket or an authenticated E2EE virtual stream. */
export interface LegacyRealtimePeer {
    readonly readyState: number;
    readonly bufferedAmount: number;
    send(message: string): void;
    close(code: number, reason: string): void;
}
export interface ReadonlySessionConflict {
    readonly sessionId: string;
    readonly observedAt: number;
    readonly reason: 'writer-held';
}
/** Convert one new Host event into the released mini-program vocabulary. */
export declare function legacyHostPayload(frame: JsonRecord): JsonRecord | null;
/**
 * One process-local adapter for the two pre-0.1.2 downlinks. It consumes the
 * new reconnect-safe streams but emits only the long-lived client contract.
 */
export declare class DshRealtimeCompatibility {
    private readonly ctx;
    private readonly sockets;
    private readonly knownSessions;
    private readonly pending;
    private readonly responding;
    private readonly sessionRequests;
    private readonly readonlyConflicts;
    private remoteOwner?;
    private disposed;
    constructor(ctx: Context);
    /** Scoped to authenticated phone RPCs; never changes native Agent ownership. */
    trackSessionRequest(request: LegacyClientRequest): () => void;
    /** Bounded metadata only: no message bodies, credentials or filesystem paths. */
    getReadonlyConflicts(): readonly ReadonlySessionConflict[];
    /**
     * TEMPORARY COMPATIBILITY / 临时误报规避，不是 DSH 会话冲突的根因修复。
     * 已在 DSH 0.1.7-rc.2 对应原生代码中独立复现：电脑端浏览历史的
     * history.follow 在返回 snapshot 后仍会 promote/resolveObservedAgent，
     * 另一进程持有写入权时产生 api-session/error；已发布小程序又把该广播
     * 显示为全局聊天错误，即使手机并未发起修改操作。
     *
     * 本函数只调整我们插件到小程序的通知语义。原生的后台激活、写入占用和
     * 电脑端错误仍可能发生；绝不能据此宣称两端会话冲突已解决。不得修改、
     * 覆盖或 monkey-patch DSH 本体，不得强行释放/夺取原生写入权。
     *
     * 原生广播没有发起客户端标识，下面是保守的状态判定，不是精确溯源：
     * 仅完整文案匹配 + 当前端无 Agent/附着 Session + 无匹配的在途手机操作
     * 时降为被动占用诊断。能力不明、查询失败、活动会话及其他错误原样保留；
     * 真正发送/修改操作的 RPC 失败绝不在此吞掉。诊断保留在有界内存记录中。
     *
     * TODO(upstream-readonly-follow): 待官方明确区分只读浏览与激活，并在相应
     * 版本实测后复核此兼容分支；不能仅凭版本号或本次不弹错就删除写入保护。
     * 回归：test-native-two-process-browse.mjs（原生复现，仅默认未修改模式）、
     * test-passive-writer-notification.mjs（插件通知和真实失败保留）。
     */
    private readonlyConflict;
    attach(path: '/api/events.mux' | '/api/events.host', socket: WebSocket): void;
    connect(path: '/api/events.mux' | '/api/events.host', socket: LegacyRealtimePeer): () => void;
    subscribeSession(sessionId: unknown): void;
    respond(value: unknown): Promise<{
        readonly accepted: boolean;
        readonly reason?: string;
    }>;
    dispose(): void;
    private gateway;
    private run;
    private ensureRemoteEvents;
    private remove;
    private send;
    private followWorkspace;
    private followControl;
    private controlFrame;
    private startSession;
    private followRemoteEvents;
    private pendingWaterfall;
    private settlePending;
    private dispatchRemoteEventResult;
}
export {};
