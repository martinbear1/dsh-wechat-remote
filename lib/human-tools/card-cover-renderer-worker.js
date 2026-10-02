import { workerData, parentPort } from 'node:worker_threads';
import { createRequire } from 'node:module';
import { inflateSync } from 'node:zlib';
const require = createRequire(import.meta.url);
const PNG = require('pngjs').PNG;
const jpeg = require('jpeg-js');
const MAX = 2 * 1024 * 1024;
const bad = (message = '封面图片内容无效，请提供真实的 5:4 PNG/JPEG 图片') => new Error(message);
function dimensions(width, height, ratio = true) {
    if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || width > 2048 || height > 2048
        || ratio && width * 4 !== height * 5)
        throw bad('封面尺寸须不超过 2048 像素，比例为 5:4；不会自动裁剪');
}
function pngHeader(data) {
    if (data.length < 33 || data.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a'
        || data.readUInt32BE(8) !== 13 || data.toString('ascii', 12, 16) !== 'IHDR')
        throw bad();
    const width = data.readUInt32BE(16), height = data.readUInt32BE(20);
    dimensions(width, height);
    const parts = [];
    let end = false, offset = 8;
    while (offset + 12 <= data.length) {
        const length = data.readUInt32BE(offset), type = data.toString('ascii', offset + 4, offset + 8);
        if (offset + 12 + length > data.length || type === 'acTL')
            throw bad('封面须为完整的静态图片');
        if (type === 'IDAT')
            parts.push(data.subarray(offset + 8, offset + 8 + length));
        offset += 12 + length;
        if (type === 'IEND') {
            end = true;
            break;
        }
    }
    if (!end || offset !== data.length || !parts.length)
        throw bad();
    // Bound even interlaced PNG inflation before the decoder (including 16-bit).
    inflateSync(Buffer.concat(parts), { maxOutputLength: width * height * 8 + height * 8 + 1024 });
    return { width, height };
}
function exifOrientation(app) {
    if (app.length < 6 || app.toString('ascii', 0, 6) !== 'Exif\0\0')
        return 1;
    const data = app.subarray(6), little = data.toString('ascii', 0, 2) === 'II';
    if (!little && data.toString('ascii', 0, 2) !== 'MM')
        throw bad();
    const u16 = (at) => little ? data.readUInt16LE(at) : data.readUInt16BE(at);
    const u32 = (at) => little ? data.readUInt32LE(at) : data.readUInt32BE(at);
    if (u16(2) !== 42)
        throw bad();
    const at = u32(4), count = u16(at);
    if (count > 1024 || at + 2 + count * 12 + 4 > data.length)
        throw bad();
    for (let i = 0; i < count; i++) {
        const entry = at + 2 + i * 12;
        if (u16(entry) === 0x112) {
            if (u16(entry + 2) !== 3 || u32(entry + 4) !== 1)
                throw bad();
            const value = u16(entry + 8);
            if (value < 1 || value > 8)
                throw bad();
            return value;
        }
    }
    return 1;
}
function jpegHeader(data) {
    if (data.length < 4 || data[0] !== 255 || data[1] !== 216)
        throw bad();
    let offset = 2, width = 0, height = 0, orientation = 1;
    while (offset < data.length) {
        if (data[offset++] !== 255)
            throw bad();
        while (data[offset] === 255)
            offset++;
        const type = data[offset++];
        if (type === 0xda || type === 0xd9)
            break;
        const length = data.readUInt16BE(offset);
        if (length < 2 || offset + length > data.length)
            throw bad();
        if (type === 0xe1)
            orientation = exifOrientation(data.subarray(offset + 2, offset + length));
        if ([0xc0, 0xc1, 0xc2].includes(type)) {
            height = data.readUInt16BE(offset + 3);
            width = data.readUInt16BE(offset + 5);
            dimensions(width, height, false);
        }
        offset += length;
    }
    dimensions(orientation >= 5 ? height : width, orientation >= 5 ? width : height);
    return { width, height, orientation };
}
function rotate(image, orientation) {
    if (orientation === 1)
        return image;
    const width = orientation >= 5 ? image.height : image.width, height = orientation >= 5 ? image.width : image.height;
    const data = Buffer.alloc(width * height * 4);
    for (let y = 0; y < image.height; y++)
        for (let x = 0; x < image.width; x++) {
            let dx = x, dy = y;
            if (orientation === 2)
                dx = image.width - x - 1;
            if (orientation === 3) {
                dx = image.width - x - 1;
                dy = image.height - y - 1;
            }
            if (orientation === 4)
                dy = image.height - y - 1;
            if (orientation === 5) {
                dx = y;
                dy = x;
            }
            if (orientation === 6) {
                dx = image.height - y - 1;
                dy = x;
            }
            if (orientation === 7) {
                dx = image.height - y - 1;
                dy = image.width - x - 1;
            }
            if (orientation === 8) {
                dx = y;
                dy = image.width - x - 1;
            }
            data.set(image.data.subarray((y * image.width + x) * 4, (y * image.width + x + 1) * 4), (dy * width + dx) * 4);
        }
    return { data, width, height };
}
function normalize(input, mediaType) {
    const data = Buffer.from(input);
    if (!data.length || data.length > MAX)
        throw bad();
    let encoded, width, height;
    if (mediaType === 'image/png') {
        ({ width, height } = pngHeader(data));
        const pixels = PNG.sync.read(data, { checkCRC: true });
        if (pixels.width !== width || pixels.height !== height)
            throw bad();
        encoded = PNG.sync.write({ width, height, data: pixels.data }, { colorType: 6, bitDepth: 8 });
    }
    else if (mediaType === 'image/jpeg') {
        const expected = jpegHeader(data);
        const decoded = jpeg.decode(data, { useTArray: true, formatAsRGBA: true, tolerantDecoding: false, maxResolutionInMP: 4.2, maxMemoryUsageInMB: 96 });
        if (decoded.width !== expected.width || decoded.height !== expected.height)
            throw bad();
        const image = rotate(decoded, expected.orientation);
        ({ width, height } = image);
        encoded = jpeg.encode(image, 90).data;
    }
    else
        throw bad();
    if (encoded.length > MAX)
        throw bad('清理元数据后的封面超过 2 MiB，请在电脑端导出较小图片');
    return { data: encoded, mediaType, width, height };
}
if (parentPort) {
    try {
        const image = workerData?.kind === 'image' ? normalize(workerData.data, workerData.mediaType) : (() => { throw bad(); })();
        parentPort.postMessage({ image });
    }
    catch (error) {
        const message = error instanceof Error && /^封面|^清理/.test(error.message) ? error.message : '封面图片校验失败，未上传或发送';
        parentPort.postMessage({ error: message });
    }
}
