import type { Context } from '@deepseek-ai/cordis'
import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import { HistoryImportController, importError } from './controller.js'
import { ImportReceipts } from './receipts.js'
import { nativeCapabilities, commitNativeImport, inspectNativeImport } from './native.js'
import { parseImportSource } from './parse.js'
import { readPublicShare } from './share.js'

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
      capabilities: () => nativeCapabilities(host),
      parse: parseImportSource, share: readPublicShare,
      commit: (request, signal) => commitNativeImport(host, request, signal),
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
    } catch (error) { return { ok: false, error: importError(error) } }
  }
}
