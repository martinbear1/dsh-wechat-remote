/** Error messages deliberately exclude remote response bodies, credentials and URLs. */
export class ILinkError extends Error {
    code;
    apiCode;
    httpStatus;
    constructor(code, message, apiCode, httpStatus) {
        super(message);
        this.code = code;
        this.apiCode = apiCode;
        this.httpStatus = httpStatus;
        this.name = 'ILinkError';
    }
}
