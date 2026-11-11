import type { PluginItem, PluginSection, PluginPresentation, SpeechPresentation } from './protocol.js';
type Data = Record<string, any>;
export interface PresentationHost {
    get(name: string): unknown;
}
export declare const routeKey: (r: {
    provider: string;
    model: string;
}) => string;
export declare const route: (v: unknown) => v is {
    provider: string;
    model: string;
};
export declare const digest: (v: unknown) => string;
export declare function service(host: PresentationHost, name: string, methods: string[]): Data | undefined;
export declare function pageKind(item: PluginItem): string | undefined;
/** The provider registry and split billing schema supersede the coupled switch.
 * A partially loaded modern Host must never fall back to the shared key. */
export declare function independentWeb(host: PresentationHost, sections: PluginSection[]): boolean;
export declare function webCredentialRef(forms: Data[], changes?: Data[]): string;
export declare function credentialRevision(forms: Data[]): string;
export declare function effective(forms: Data[], changes: Data[], ns: string, path: string[]): unknown;
/** Only this audited object-array field is eligible for writes; other complex schemas stay desktop-only. */
export declare function hasModelRouteSchema(form: Data | undefined): boolean;
export declare function speechView(host: PresentationHost): Promise<SpeechPresentation | undefined>;
/** Native Computer Use observations: app ids and names, never local executable paths or arbitrary icon markup. */
export declare function cuaView(host: PresentationHost, forms: Data[]): Promise<PluginPresentation['cua']>;
export declare function presentation(host: PresentationHost, item: PluginItem, sections: PluginSection[], forms: Data[], signal: AbortSignal): Promise<PluginPresentation | undefined>;
export {};
