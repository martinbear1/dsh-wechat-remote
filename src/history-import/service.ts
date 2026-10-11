import type { Context } from '@deepseek-ai/cordis'
import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import { HistoryImportController, importError } from './controller.js'
import { ImportReceipts } from './receipts.js'
import { nativeCapabilities, commitNativeImport, inspectNativeImport } from './native.js'
import { parseImportSource } from './parse.js'
import { readPublicShare } from './share.js'
import { FeatureAccessError, featureMessage, hostFeatureAccess } from '../feature-access.js'

export interface HistoryImportResult {
  readonly ok: boolean
  readonly valueJson?: string
  readonly error?: { readonly code: string; readonly message: string }
}
/** A separate optional RPC behind the existing owner-authenticated transport.
 * No replacement of native session.create/history, no hooks in chat execution,
 * no startup IO and no additional server/listener/cloud service. */
export class WechatImportService extends TypertRemoteService {
  private readonly controller: HistoryImportController
  constructor(host: Context, config: { receiptDirectory: string }) {
    super(host, 'wechatImport')
    this.controller = new HistoryImportController({
      capabilities: async () => {
        const native = await nativeCapabilities(host)
        try {
          const access = hostFeatureAccess(host)
          try { await access.refresh() } catch { /* show unavailable without denying read-only capability discovery */ }
          return { ...native, enabled: access.historyImportEnabled(), access: access.grant('history_import', false) }
        } catch { return { ...native, enabled: false, access: { allowed: false, reason: 'unavailable', validUntil: null, message: featureMessage('unavailable') } } }
      },
      authorize: signal => hostFeatureAccess(host).authorizeHistoryImport(signal),
      owner: async signal => { try { return await hostFeatureAccess(host).currentOwner(signal) } catch { signal.throwIfAborted(); return undefined } },
      parse: parseImportSource, share: readPublicShare,
      commit: (request, signal, beforeCreate) => commitNativeImport(host, request, signal, beforeCreate),
      inspect: (request, signal) => inspectNativeImport(host, request, signal),
      receipts: new ImportReceipts(config.receiptDirectory),
    })
    host.effect(() => () => this.controller.dispose())
  }
  @Remote('control')
  async control(request: { action: string; inputJson?: string }, signal: AbortSignal): Promise<HistoryImportResult> {
    try {
      if (typeof request.action !== 'string' || request.action.length > 32 || (request.inputJson?.length ?? 0) > 270000) throw new Error('invalid-request')
      const result = await this.controller.control(request.action, JSON.parse(request.inputJson || '{}'), signal)
      return { ok: true, valueJson: JSON.stringify(result) }
    } catch (error) { return { ok: false, error: error instanceof FeatureAccessError ? { code: error.code, message: error.message } : importError(error) } }
  }
}
