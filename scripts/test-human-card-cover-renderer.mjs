import test from 'node:test'
import assert from 'node:assert/strict'
import { PNG } from 'pngjs'
import jpeg from 'jpeg-js'
import { normalizeCardCoverImage } from '../lib/human-tools/card-cover-renderer.js'

const signal = () => new AbortController().signal
const pixels = () => ({ width: 50, height: 40, data: Buffer.alloc(50 * 40 * 4, 230) })
test('existing images are really decoded, re-encoded, and constrained before obtaining an asset', async () => {
  for(const mediaType of ['image/png','image/jpeg']) {
    const source = mediaType==='image/png' ? PNG.sync.write(pixels()) : jpeg.encode(pixels(), 90).data
    const image = await normalizeCardCoverImage(source, mediaType, signal())
    assert.equal(image.width,50); assert.equal(image.height,40); assert.equal(image.mediaType,mediaType)
    const decoded = mediaType==='image/png' ? PNG.sync.read(Buffer.from(image.data)) : jpeg.decode(image.data)
    assert.equal(decoded.width,50); assert.equal(decoded.height,40)
  }
  await assert.rejects(normalizeCardCoverImage(Buffer.from('<svg/>'), 'image/png', signal()), { code: 'human-cover-image-invalid' })
  await assert.rejects(normalizeCardCoverImage(Buffer.alloc(2*1024*1024+1),'image/png',signal()), /2 MiB/)
  const wrong = PNG.sync.write({ width:10,height:10,data:Buffer.alloc(400) })
  await assert.rejects(normalizeCardCoverImage(wrong,'image/png',signal()), /5:4/)
  const corrupt = PNG.sync.write(pixels()); corrupt[corrupt.length-1]^=1
  await assert.rejects(normalizeCardCoverImage(corrupt,'image/png',signal()), /校验/)
  const bomb = PNG.sync.write(pixels()); bomb.writeUInt32BE(0xffffffff,16)
  await assert.rejects(normalizeCardCoverImage(bomb,'image/png',signal()), /尺寸/)
})
test('JPEG orientation is applied before stripping metadata', async () => {
  const image = { width:40,height:50,data:Buffer.alloc(40*50*4,200) }, encoded=jpeg.encode(image,90).data
  const exif=Buffer.from('45786966000049492a0008000000010012010300010000000600000000000000','hex')
  const header=Buffer.alloc(4); header[0]=255; header[1]=225; header.writeUInt16BE(exif.length+2,2)
  const input=Buffer.concat([encoded.subarray(0,2),header,exif,encoded.subarray(2)])
  const normalized=await normalizeCardCoverImage(input,'image/jpeg',signal())
  assert.equal(normalized.width,50); assert.equal(normalized.height,40)
  assert.equal(Buffer.from(normalized.data).includes(Buffer.from('Exif\0\0')),false)
})
test('computer image validation is cancellable and admission is bounded', async () => {
  const input = PNG.sync.write(pixels())
  const stopped=new AbortController(); stopped.abort(new Error('stopped'))
  await assert.rejects(normalizeCardCoverImage(input,'image/png',stopped.signal),/stopped/)
  const running=new AbortController(), pending=normalizeCardCoverImage(input,'image/png',running.signal)
  await assert.rejects(normalizeCardCoverImage(input,'image/png',signal()),/另一张/)
  running.abort(new Error('cancelled')); await assert.rejects(pending,/cancelled/)
  const next=await normalizeCardCoverImage(input,'image/png',signal()); assert.equal(next.width,50)
})
