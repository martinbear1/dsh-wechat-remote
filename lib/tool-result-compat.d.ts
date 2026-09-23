/** Native facts, not inferred text. Shared by live/history activity and mobile
 * presentation. Remove the wrapper projection when all clients accept V4. */
type Row = Record<string, any>;
export declare function toolResultFailed(message: Row | undefined): boolean;
export declare function presentToolResult<T extends Row>(entry: T): T;
export {};
