import { type ClawbotQuestionAnswer, type ClawbotQuestionItem } from './contracts.js';
/** A deliberately bounded native-question subset; unknown intent/fields must
 * stay in the native UI rather than being silently reinterpreted as a choice. */
export declare function validateQuestions(value: unknown): value is ClawbotQuestionItem[];
/** Render only plain text. Question/option content never becomes a command,
 * an executable template, an inferred answer, or an approval decision. */
export declare function formatQuestions(title: string, questions: ClawbotQuestionItem[], codes: string[]): string;
/** Parse only the answer after the explicit command and question code. Native
 * option labels are returned verbatim; numeric-looking free text needs 文字. */
export declare function parseQuestionAnswer(question: ClawbotQuestionItem, value: string): ClawbotQuestionAnswer['answers'][number];
