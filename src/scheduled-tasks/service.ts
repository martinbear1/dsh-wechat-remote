import type { Context } from '@deepseek-ai/cordis'
import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import { NativeScheduledTasks, ScheduleAdapterError, scheduledError } from './native.js'
import type { ScheduledChanged, ScheduledRequest, ScheduledResult } from './protocol.js'

declare module '@deepseek-ai/cordis' {
  interface Context { wechatSchedules: WechatSchedulesService }
  interface Events {
    /** Official Schedule changed or mounted/unmounted. Invalidation only.
     * @mode emit */
    'wechatSchedules/changed'(value: ScheduledChanged): void
  }
}

/** Only mounted behind the existing owner-authenticated Host transport. This
 * service never enables the official plugin or installs a second scheduler. */
export class WechatSchedulesService extends TypertRemoteService {
  private readonly adapter: NativeScheduledTasks
  private readonly lifetime = new AbortController()
  constructor(ctx: Context) {
    super(ctx, 'wechatSchedules')
    this.adapter = new NativeScheduledTasks(ctx)
    const publish = () => {
      if (!this.lifetime.signal.aborted) ctx.emit('wechatSchedules/changed', { enabled: !!this.adapter.status().enabled })
    }
    // Optional injection tracks the native service lifetime, not a user's
    // configuration row. No timer, catalog polling, transcript reads or cache.
    ctx.inject(['schedule'], scope => {
      const emit = () => publish()
      const dispose = scope.on('schedule/changed' as any, emit)
      publish()
      return () => { dispose(); queueMicrotask(publish) }
    })
    ctx.effect(() => () => { this.lifetime.abort(); this.adapter.close() })
  }
  @Remote('control')
  async control(request: ScheduledRequest, signal: AbortSignal): Promise<ScheduledResult> {
    const combined = AbortSignal.any([signal, this.lifetime.signal])
    try {
      combined.throwIfAborted()
      if (!request || typeof request.action !== 'string' || request.action.length > 32
        || request.inputJson !== undefined && (typeof request.inputJson !== 'string' || Buffer.byteLength(request.inputJson, 'utf8') > 512 * 1024)) {
        throw new ScheduleAdapterError('invalid_request', '请求内容超出手机端支持范围。')
      }
      let input: unknown
      try { input = JSON.parse(request.inputJson || '{}') }
      catch { throw new ScheduleAdapterError('invalid_request', '请求格式无效。') }
      const value = await this.adapter.control(request.action, input, combined)
      // Deliberately do not recheck cancellation after a native mutation:
      // accepted writes can commit despite disconnect; never report rollback.
      const valueJson = JSON.stringify(value)
      if (Buffer.byteLength(valueJson, 'utf8') > 1024 * 1024) throw new ScheduleAdapterError('response_too_large', '该任务信息较大，请到电脑端查看。')
      return { ok: true, valueJson }
    } catch (error) {
      return { ok: false, error: scheduledError(error) }
    }
  }
}
