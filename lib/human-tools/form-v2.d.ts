export declare const HUMAN_FORM_V2_KINDS: readonly ["multi-choice", "date", "time"];
export declare const HUMAN_FORM_THEMES: readonly ["blue", "green", "purple", "orange", "slate"];
export declare const HUMAN_FORM_ICONS: readonly ["clipboard", "book", "calendar", "briefcase", "checklist"];
export declare const HUMAN_FORM_LAYOUTS: readonly ["stacked", "compact"];
export declare const HUMAN_FORM_V2_FIELD_KEYS: readonly ["description", "section", "minSelected", "maxSelected", "start", "end"];
export declare function humanDate(value: unknown): value is string;
export declare function humanTime(value: unknown): value is string;
export declare function humanFormV2Field(field: Record<string, unknown>): boolean;
export declare function humanFormPresentation(value: unknown): boolean;
