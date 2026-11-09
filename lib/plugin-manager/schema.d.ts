import type { PluginSection } from './protocol.js';
type Data = Record<string, any>;
export declare const plain: (v: unknown) => v is Data;
export declare function localized(v: unknown, fallback?: string): string;
export declare function readPath(value: unknown, path: string[]): unknown;
/** Read the native Schemastery uid/refs data envelope, never execute code from a plugin. */
export declare function formSection(view: Data, title: string, writable: boolean): PluginSection;
export declare function validateOperations(section: PluginSection, ops: unknown): asserts ops is Data[];
export {};
