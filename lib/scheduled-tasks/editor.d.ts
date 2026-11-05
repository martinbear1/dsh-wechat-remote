type Row = Record<string, any>;
export declare function editorView(host: {
    get(name: string): any;
}, task?: Row): Row;
export declare function editorRequest(input: unknown, task?: Row, customText?: boolean): Row;
export {};
