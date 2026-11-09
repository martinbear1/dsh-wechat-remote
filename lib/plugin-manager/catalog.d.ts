import type { PluginItem } from './protocol.js';
type Row = Record<string, any>;
export interface BuiltinCard {
    row: Row;
    rows: Row[];
    title: string;
    iconKey: PluginItem['iconKey'];
}
export declare function builtinCards(plugins: Row[], forms: Row[]): BuiltinCard[];
export interface CatalogPolicy {
    hidden: ReadonlySet<string>;
    first: readonly string[];
    more: readonly string[];
    source: string;
}
/** Resolve the installation's public pure metadata export, never a profile's
 * third-party browser entry. Older Hosts have no public display policy export. */
export declare function catalogPolicy(profile: unknown, bundles: Row[]): Promise<CatalogPolicy>;
export declare function visibleBundles(bundles: Row[], plugins: Row[], policy: CatalogPolicy): Row[];
export {};
