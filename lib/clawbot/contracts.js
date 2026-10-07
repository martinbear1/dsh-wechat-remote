export class ClawbotError extends Error {
    code;
    constructor(code, message) {
        super(message);
        this.code = code;
        this.name = 'ClawbotError';
    }
}
