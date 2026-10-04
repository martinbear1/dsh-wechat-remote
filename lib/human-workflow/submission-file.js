/** Data admission only: never execute or extract participant documents to disk.
 * These product bounds are not WeChat limits or an antivirus guarantee. */
import { inflateRawSync } from 'node:zlib';
import { fail } from './data.js';
import { SUBMISSION_FILE_MAX, submissionFileType, submissionImageType } from './submission-file-contract.js';
const invalid = (message = '文件内容与声明格式不符，尚未确认电脑收件') => fail('submission-file-invalid', message);
const MAX_ENTRIES = 512, MAX_ENTRY = 16 * 1024 * 1024, MAX_EXPANDED = 32 * 1024 * 1024, MAX_RATIO = 200;
function utf8(data) {
    try {
        return new TextDecoder('utf-8', { fatal: true }).decode(data);
    }
    catch {
        throw invalid('文本文档须使用有效 UTF-8 编码');
    }
}
const crcTable = Array.from({ length: 256 }, (_, n) => { let value = n; for (let i = 0; i < 8; i++)
    value = (value & 1) ? 0xedb88320 ^ (value >>> 1) : value >>> 1; return value >>> 0; });
function crc32(data) { let crc = 0xffffffff; for (const byte of data)
    crc = crcTable[(crc ^ byte) & 255] ^ (crc >>> 8); return (crc ^ 0xffffffff) >>> 0; }
function xml(data) {
    const value = utf8(data);
    if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f]|<!\s*(?:DOCTYPE|ENTITY)/i.test(value))
        throw invalid('Office XML 含不支持的声明或控制字符');
    validateXmlStructure(value);
    return value;
}
function attributes(tag) {
    const result = Object.create(null);
    const rest = tag.replace(/^<[^\s/>]+/, '').replace(/\/?\s*>$/, '');
    let cursor = 0;
    const pattern = /\s+([A-Za-z_:][\w.:-]*)\s*=\s*(["'])([^<>]*?)\2/g;
    for (const match of rest.matchAll(pattern)) {
        if (rest.slice(cursor, match.index).trim() || Object.hasOwn(result, match[1]))
            throw invalid('Office XML 属性无效');
        result[match[1]] = match[3];
        cursor = match.index + match[0].length;
    }
    if (rest.slice(cursor).trim())
        throw invalid('Office XML 属性无效');
    return result;
}
/** A deliberately bounded XML admission subset, not a schema evaluator.
 * DTDs, custom entities and processing instructions never reach a reader. */
function validateXmlStructure(value) {
    const stack = [];
    let cursor = value.charCodeAt(0) === 0xfeff ? 1 : 0, roots = 0, tokens = 0;
    const text = (part) => {
        if (part.includes(']]>') || /&(?!(?:amp|lt|gt|apos|quot|#\d+|#x[\da-fA-F]+);)/.test(part))
            throw invalid('Office XML 实体无效');
        for (const match of part.matchAll(/&#(x[\da-fA-F]+|\d+);/g)) {
            const point = match[1].startsWith('x') ? parseInt(match[1].slice(1), 16) : Number(match[1]);
            if (!(point === 9 || point === 10 || point === 13 || point >= 32 && point <= 0xd7ff || point >= 0xe000 && point <= 0xfffd || point >= 0x10000 && point <= 0x10ffff))
                throw invalid('Office XML 字符无效');
        }
    };
    while (cursor < value.length) {
        if (++tokens > 200000)
            throw invalid('Office XML 结构超过校验预算');
        if (value[cursor] !== '<') {
            let end = value.indexOf('<', cursor);
            if (end < 0)
                end = value.length;
            const part = value.slice(cursor, end);
            text(part);
            if (!stack.length && part.trim())
                throw invalid('Office XML 根内容无效');
            cursor = end;
            continue;
        }
        if (value.startsWith('<!--', cursor)) {
            const end = value.indexOf('-->', cursor + 4);
            if (end < 0 || value.slice(cursor + 4, end).includes('--'))
                throw invalid('Office XML 注释无效');
            cursor = end + 3;
            continue;
        }
        if (value.startsWith('<![CDATA[', cursor)) {
            const end = value.indexOf(']]>', cursor + 9);
            if (end < 0 || !stack.length)
                throw invalid('Office XML CDATA 无效');
            cursor = end + 3;
            continue;
        }
        if (value.startsWith('<?xml ', cursor)) {
            const end = value.indexOf('?>', cursor + 6);
            if (end < 0 || value.slice(0, cursor).replace(/^\uFEFF/, '').trim() || roots)
                throw invalid('Office XML 声明无效');
            cursor = end + 2;
            continue;
        }
        const end = value.indexOf('>', cursor);
        if (end < 0)
            throw invalid('Office XML 标签未闭合');
        const tag = value.slice(cursor, end + 1);
        const close = /^<\/([A-Za-z_][\w.:-]*)\s*>$/.exec(tag);
        if (close) {
            if (stack.pop() !== close[1])
                throw invalid('Office XML 标签不匹配');
        }
        else {
            const open = /^<([A-Za-z_][\w.:-]*)(?:\s[^<>]*?)?\/?\s*>$/.exec(tag);
            if (!open || !stack.length && ++roots !== 1)
                throw invalid('Office XML 根结构无效');
            for (const attribute of Object.values(attributes(tag)))
                text(attribute);
            if (!/\/\s*>$/.test(tag)) {
                stack.push(open[1]);
                if (stack.length > 256)
                    throw invalid('Office XML 嵌套过深');
            }
        }
        cursor = end + 1;
    }
    if (stack.length || roots !== 1)
        throw invalid('Office XML 主内容未完整闭合');
}
function xmlRoot(value) {
    const clean = value.replace(/^\uFEFF/, '').replace(/^\s*<\?xml\s[\s\S]*?\?>/, '').replace(/<!--[\s\S]*?-->/g, '').trim();
    const root = /^<((?:[A-Za-z_][\w.-]*:)?([A-Za-z_][\w.-]*))(?:\s[^<>]*?)?\/?\s*>/.exec(clean);
    if (!root)
        return;
    const attrs = attributes(root[0]), prefix = root[1].includes(':') ? root[1].split(':')[0] : '';
    return { name: root[2], namespace: attrs[prefix ? `xmlns:${prefix}` : 'xmlns'] };
}
/** Bounds are checked before inflation. Central/local metadata and CRC are
 * verified for every member, including members not used by the main document. */
function officeParts(data) {
    if (data.readUInt32LE(0) !== 0x04034b50)
        throw invalid();
    let end = -1;
    for (let offset = data.length - 22; offset >= Math.max(0, data.length - 22 - 65535); offset--) {
        if (data.readUInt32LE(offset) === 0x06054b50 && offset + 22 + data.readUInt16LE(offset + 20) === data.length) {
            end = offset;
            break;
        }
    }
    if (end < 0 || data.readUInt16LE(end + 4) !== 0 || data.readUInt16LE(end + 6) !== 0)
        throw invalid('Office 压缩包结构不支持');
    const count = data.readUInt16LE(end + 10), centralSize = data.readUInt32LE(end + 12), central = data.readUInt32LE(end + 16);
    if (!count || count > MAX_ENTRIES || data.readUInt16LE(end + 8) !== count || central + centralSize !== end)
        throw invalid('Office 压缩包目录或容量不支持');
    const files = new Map(), ranges = [];
    let cursor = central, expanded = 0;
    for (let entry = 0; entry < count; entry++) {
        if (cursor + 46 > end || data.readUInt32LE(cursor) !== 0x02014b50)
            throw invalid();
        const flags = data.readUInt16LE(cursor + 8), method = data.readUInt16LE(cursor + 10), crc = data.readUInt32LE(cursor + 16);
        const packed = data.readUInt32LE(cursor + 20), size = data.readUInt32LE(cursor + 24);
        const nameLength = data.readUInt16LE(cursor + 28), extraLength = data.readUInt16LE(cursor + 30), commentLength = data.readUInt16LE(cursor + 32);
        const local = data.readUInt32LE(cursor + 42), entryEnd = cursor + 46 + nameLength + extraLength + commentLength;
        if (entryEnd > end || !nameLength || nameLength > 512 || data.readUInt16LE(cursor + 34) !== 0
            || flags & ~0x080e || flags & 1 || ![0, 8].includes(method) || size > MAX_ENTRY || packed > data.length
            || size > Math.max(1024, packed * MAX_RATIO) || (expanded += size) > MAX_EXPANDED)
            throw invalid('Office 文件加密、压缩方式或展开容量不支持');
        const nameBytes = data.subarray(cursor + 46, cursor + 46 + nameLength), name = utf8(nameBytes);
        if (/^[\\/]|[\\\u0000-\u001f\u007f:]|(?:^|\/)\.\.?\//.test(name) || name.split('/').some(piece => piece === '.' || piece === '..')
            || files.has(name) || /(?:^|\/)(?:vbaproject|activex|embeddings)(?:[/.]|$)|\.(?:exe|dll|com|js|vbs|ps1|bat|cmd)$/i.test(name))
            throw invalid('Office 文件包含不支持的路径、宏或嵌入内容');
        // Reject Unix symlink members and ZIP64 extra records; no disk extraction.
        const mode = (data.readUInt32LE(cursor + 38) >>> 16) & 0xf000;
        if (mode === 0xa000)
            throw invalid();
        for (let extra = cursor + 46 + nameLength; extra < cursor + 46 + nameLength + extraLength;) {
            if (extra + 4 > entryEnd)
                throw invalid();
            const id = data.readUInt16LE(extra), length = data.readUInt16LE(extra + 2);
            extra += length + 4;
            if (id === 1 || extra > cursor + 46 + nameLength + extraLength)
                throw invalid();
        }
        if (local + 30 > central || data.readUInt32LE(local) !== 0x04034b50 || data.readUInt16LE(local + 6) !== flags
            || data.readUInt16LE(local + 8) !== method)
            throw invalid();
        const localName = data.readUInt16LE(local + 26), localExtra = data.readUInt16LE(local + 28), start = local + 30 + localName + localExtra, finish = start + packed;
        if (finish > central || localName !== nameLength || !data.subarray(local + 30, local + 30 + localName).equals(nameBytes)
            || !(flags & 8) && (data.readUInt32LE(local + 14) !== crc || data.readUInt32LE(local + 18) !== packed || data.readUInt32LE(local + 22) !== size))
            throw invalid();
        for (let extra = local + 30 + localName; extra < start;) {
            if (extra + 4 > start)
                throw invalid();
            const id = data.readUInt16LE(extra), length = data.readUInt16LE(extra + 2);
            extra += length + 4;
            if (id === 1 || extra > start)
                throw invalid();
        }
        let rangeEnd = finish;
        if (flags & 8) {
            let descriptor = finish;
            if (descriptor + 4 <= central && data.readUInt32LE(descriptor) === 0x08074b50)
                descriptor += 4;
            if (descriptor + 12 > central || data.readUInt32LE(descriptor) !== crc || data.readUInt32LE(descriptor + 4) !== packed || data.readUInt32LE(descriptor + 8) !== size)
                throw invalid();
            rangeEnd = descriptor + 12;
        }
        if (ranges.some(([a, b]) => local < b && rangeEnd > a))
            throw invalid();
        ranges.push([local, rangeEnd]);
        let clear;
        try {
            if (method === 0)
                clear = data.subarray(start, finish);
            else {
                const decoded = inflateRawSync(data.subarray(start, finish), { maxOutputLength: Math.max(1, size), info: true });
                if (decoded.engine.bytesWritten !== packed)
                    throw invalid('Office 压缩成员包含未解码尾部');
                clear = decoded.buffer;
            }
        }
        catch {
            throw invalid('Office 压缩成员无法完整解码');
        }
        if (clear.length !== size || crc32(clear) !== crc)
            throw invalid('Office 压缩成员校验失败');
        if (/\.(?:xml|rels)$/i.test(name))
            xml(clear);
        files.set(name, clear);
        cursor = entryEnd;
    }
    if (cursor !== end)
        throw invalid();
    return files;
}
const office = {
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['word/document.xml', 'document', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml', 'wordprocessingml'],
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['xl/workbook.xml', 'workbook', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml', 'spreadsheetml'],
    'application/vnd.openxmlformats-officedocument.presentationml.presentation': ['ppt/presentation.xml', 'presentation', 'application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml', 'presentationml'],
};
export function validateSubmissionFile(data, mediaType) {
    if (!(data instanceof Uint8Array) || !data.length || data.length > SUBMISSION_FILE_MAX || !submissionFileType(mediaType))
        throw invalid();
    const bytes = Buffer.from(data);
    if (submissionImageType(mediaType)) {
        if (mediaType === 'image/png' ? !bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
            : !(bytes.length > 3 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255))
            throw fail('submission-image-invalid', '图片格式与声明不符');
        return; // Receiver MUST additionally use the host's full image decoder.
    }
    if (mediaType === 'text/plain' || mediaType === 'text/csv') {
        if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(utf8(bytes)))
            throw invalid('文本文件含不支持的控制字符');
        return; // CSV formulas are inert bytes; never evaluate or open a spreadsheet.
    }
    if (mediaType === 'application/pdf') {
        if (!/^%PDF-(?:1\.[0-7]|2\.0)[\r\n]/.test(bytes.subarray(0, 16).toString('latin1'))
            || !/%%EOF\s*$/.test(bytes.subarray(-1024).toString('latin1')))
            throw invalid('PDF 文件头或结束标记无效');
        return; // Admission, not rendering, content extraction or malware scanning.
    }
    if (bytes.length < 30)
        throw invalid();
    const parts = officeParts(bytes), definition = office[mediaType];
    if (!definition || !parts.has('[Content_Types].xml') || !parts.has('_rels/.rels') || !parts.has(definition[0]))
        throw invalid('Office 文档缺少必要主内容');
    const types = xml(parts.get('[Content_Types].xml')), rels = xml(parts.get('_rels/.rels')), main = xml(parts.get(definition[0]));
    const cleanTypes = types.replace(/<!--[\s\S]*?-->/g, ''), cleanRels = rels.replace(/<!--[\s\S]*?-->/g, '');
    const overrides = [...cleanTypes.matchAll(/<(?:[A-Za-z_][\w.-]*:)?Override\s[^<>]*\/>/g)].map(match => attributes(match[0]));
    const links = [...cleanRels.matchAll(/<(?:[A-Za-z_][\w.-]*:)?Relationship\s[^<>]*\/>/g)].map(match => attributes(match[0]));
    const mainTypes = overrides.filter(entry => entry.PartName === `/${definition[0]}`);
    const mainLinks = links.filter(entry => /^(?:http:\/\/schemas\.openxmlformats\.org\/officeDocument\/2006|http:\/\/purl\.oclc\.org\/ooxml\/officeDocument)\/relationships\/officeDocument$/.test(entry.Type || ''));
    const typesRoot = xmlRoot(types), relsRoot = xmlRoot(rels), mainRoot = xmlRoot(main);
    if (/macroEnabled|vbaProject|activeX|oleObject/i.test(types) || typesRoot?.name !== 'Types' || typesRoot.namespace !== 'http://schemas.openxmlformats.org/package/2006/content-types'
        || relsRoot?.name !== 'Relationships' || relsRoot.namespace !== 'http://schemas.openxmlformats.org/package/2006/relationships'
        || mainTypes.length !== 1 || mainTypes[0].ContentType !== definition[2]
        || mainLinks.length !== 1 || mainLinks[0].Target?.replace(/^\//, '') !== definition[0] || mainLinks[0].TargetMode !== undefined && mainLinks[0].TargetMode !== 'Internal'
        || mainRoot?.name !== definition[1] || ![`http://schemas.openxmlformats.org/${definition[3]}/2006/main`, `http://purl.oclc.org/ooxml/${definition[3]}/main`].includes(mainRoot.namespace || ''))
        throw invalid('Office 主文档类型不符或含宏内容');
    // Relationship targets and document fields are retained as inert data. No
    // external relationship is fetched, no formula/macro is evaluated, and this
    // bounded package check is NOT a malware scan or rendering guarantee.
}
