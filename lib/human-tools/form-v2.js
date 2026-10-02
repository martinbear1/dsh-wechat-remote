/** Data-only presentation and field extensions. No CSS, code, URLs or host APIs. */
import { exact, plain, row } from '../human-workflow/data.js';
export const HUMAN_FORM_V2_KINDS = ['multi-choice', 'date', 'time'];
export const HUMAN_FORM_THEMES = ['blue', 'green', 'purple', 'orange', 'slate'];
export const HUMAN_FORM_ICONS = ['clipboard', 'book', 'calendar', 'briefcase', 'checklist'];
export const HUMAN_FORM_LAYOUTS = ['stacked', 'compact'];
export const HUMAN_FORM_V2_FIELD_KEYS = ['description', 'section', 'minSelected', 'maxSelected', 'start', 'end'];
export function humanDate(value) {
    if (typeof value !== 'string' || !/^[0-9]{4}-[0-9]{2}-[0-9]{2}(?![\s\S])/.test(value))
        return false;
    const [year, month, day] = value.split('-').map(Number);
    if (year < 1 || month < 1 || month > 12)
        return false;
    const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
    return day >= 1 && day <= [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1];
}
export function humanTime(value) {
    return typeof value === 'string' && /^(?:[01][0-9]|2[0-3]):[0-5][0-9](?![\s\S])/.test(value);
}
export function humanFormV2Field(field) {
    if (field.description !== undefined && !plain(field.description, 300) || field.section !== undefined && !plain(field.section, 80))
        return false;
    if (field.kind === 'multi-choice') {
        if (!Array.isArray(field.choices) || !Number.isSafeInteger(field.minSelected) || !Number.isSafeInteger(field.maxSelected)
            || Number(field.minSelected) < 0 || Number(field.maxSelected) < Math.max(Number(field.minSelected), field.required ? 1 : 0)
            || Number(field.maxSelected) > field.choices.length)
            return false;
    }
    else if (field.minSelected !== undefined || field.maxSelected !== undefined)
        return false;
    if (field.kind === 'date' || field.kind === 'time') {
        const valid = field.kind === 'date' ? humanDate : humanTime;
        if (field.start !== undefined && !valid(field.start) || field.end !== undefined && !valid(field.end)
            || typeof field.start === 'string' && typeof field.end === 'string' && field.start > field.end)
            return false;
    }
    else if (field.start !== undefined || field.end !== undefined)
        return false;
    return true;
}
export function humanFormPresentation(value) {
    if (!row(value) || !exact(value, [], ['theme', 'icon', 'layout', 'submitLabel', 'completionText', 'blocks']))
        return false;
    if (value.theme !== undefined && !HUMAN_FORM_THEMES.includes(value.theme)
        || value.icon !== undefined && !HUMAN_FORM_ICONS.includes(value.icon)
        || value.layout !== undefined && !HUMAN_FORM_LAYOUTS.includes(value.layout)
        || value.submitLabel !== undefined && !plain(value.submitLabel, 20)
        || value.completionText !== undefined && !plain(value.completionText, 300))
        return false;
    return value.blocks === undefined || Array.isArray(value.blocks) && value.blocks.length <= 8 && value.blocks.every(block => {
        if (!row(block))
            return false;
        if (block.type === 'paragraph')
            return exact(block, ['type', 'text']) && plain(block.text, 1000);
        if (block.type === 'notice')
            return exact(block, ['type', 'text', 'tone']) && plain(block.text, 1000) && ['info', 'warning', 'success'].includes(String(block.tone));
        return block.type === 'list' && exact(block, ['type', 'items']) && Array.isArray(block.items)
            && block.items.length > 0 && block.items.length <= 8 && block.items.every(item => plain(item, 200));
    });
}
