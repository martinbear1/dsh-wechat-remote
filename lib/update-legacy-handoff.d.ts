import type { Server, RequestListener } from 'node:http';
import type { Context } from '@deepseek-ai/cordis';
/** Admission for our own transports during a verified legacy cold start. */
export interface LegacyGateStartup {
    bindDoor(server: Server, normal: RequestListener, door: 'public' | 'local', port: number): void;
    onRelease(start: () => void): void;
}
/** Returns undefined on the normal path: no asynchronous startup wait. */
export declare function legacyUpdateHandoff(ctx: Context, mount: (startup?: LegacyGateStartup) => () => void): Promise<() => void> | undefined;
