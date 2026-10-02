import { Worker } from 'node:worker_threads'

export interface CardCoverImage { data: Uint8Array; mediaType: 'image/png' | 'image/jpeg'; width: number; height: number }
const MAX_BYTES = 2 * 1024 * 1024
let active = false
const failure = (message: string) => Object.assign(new Error(message), { code: 'human-cover-image-invalid' })

/** Raster work never blocks the host Agent event loop, executes remote input,
 * shells out, loads user fonts, or runs in the mini-program/server. */
async function run(input: object, signal: AbortSignal): Promise<CardCoverImage> {
  signal.throwIfAborted()
  if (active) throw failure('正在准备另一张封面，请完成后再试')
  active = true
  try {
    return await new Promise<CardCoverImage>((resolve, reject) => {
      const worker = new Worker(new URL('./card-cover-renderer-worker.js', import.meta.url), {
        workerData: input, execArgv: [], resourceLimits: { maxOldGenerationSizeMb: 128 },
      })
      let finished = false
      const finish = (error?: unknown, value?: CardCoverImage) => {
        if (finished) return
        finished = true; clearTimeout(timer); signal.removeEventListener('abort', abort)
        void worker.terminate().finally(() => error ? reject(error) : resolve(value!))
      }
      const abort = () => finish(signal.reason ?? failure('封面准备已取消'))
      const timer = setTimeout(() => finish(failure('封面图片处理超时，未上传或发送')), 20_000)
      signal.addEventListener('abort', abort, { once: true })
      worker.once('error', () => finish(failure('封面图片处理失败，未上传或发送')))
      worker.once('exit', () => { if (!finished) finish(failure('封面处理意外结束，未上传或发送')) })
      worker.once('message', (message: { image?: CardCoverImage; error?: string }) => {
        if (signal.aborted) return abort()
        const image = message.image
        if (message.error) return finish(failure(message.error))
        if (!image || !(image.data instanceof Uint8Array) || !image.data.length || image.data.length > MAX_BYTES
          || !['image/png', 'image/jpeg'].includes(image.mediaType) || !Number.isSafeInteger(image.width) || !Number.isSafeInteger(image.height)
          || image.width < 1 || image.height < 1 || image.width > 2048 || image.height > 2048 || image.width * 4 !== image.height * 5)
          return finish(failure('封面成品不符合图片规范'))
        finish(undefined, image)
      })
      if (signal.aborted) abort()
    })
  } finally { active = false }
}

/** Decode and re-encode on the computer to remove metadata. No silent crop.
 * The returned final pixels/bytes, not the input file, are what gets approved. */
export function normalizeCardCoverImage(data: Uint8Array, mediaType: 'image/png' | 'image/jpeg', signal: AbortSignal): Promise<CardCoverImage> {
  if (!(data instanceof Uint8Array) || !data.length || data.length > MAX_BYTES || !['image/png', 'image/jpeg'].includes(mediaType))
    return Promise.reject(failure('封面须为不超过 2 MiB 的 PNG/JPEG 图片'))
  return run({ kind: 'image', data: Uint8Array.from(data), mediaType }, signal)
}
