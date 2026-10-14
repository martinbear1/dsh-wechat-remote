import { type Context } from '@deepseek-ai/cordis';
import { type InstallRuntime } from './install-runtime.js';
interface ToolRecord {
    schema: 1;
    owner: 'dsh-wechat-remote';
    runtime: InstallRuntime;
    command: string;
    digest: string;
}
/** Same PATH/PATHEXT command discovery as ordinary package commands; no process,
 * network, environment edit or package operation on the normal message path. */
export declare function commandAvailable(command: string, env?: NodeJS.ProcessEnv): boolean;
/** Content-addressed, immutable cache OUTSIDE the plugin being replaced. No npm
 * install, global PATH edits or npx cache dependency. Completed tools are retained
 * because a native configuration or package operation may still refer to them. */
export declare function persistentUpdateTool(home: string, owner?: string): Promise<ToolRecord>;
/** Called only by an explicit update, before native install admission. The
 * public configEditor handles validation, profile locks, reload and rollback. */
export declare function prepareNativeUpdateTools<T extends object>(ctx: Pick<Context, 'get'>, home: string, scope: string, manager: T): Promise<T>;
export {};
