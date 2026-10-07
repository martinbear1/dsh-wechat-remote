import type { Context } from '@deepseek-ai/cordis'
import { scopeOf } from '@deepseek-ai/dsh-scope'
import type { ToolDefinition, ToolRuntime } from '@deepseek-ai/dsh-tools'

type Dispose = () => void
type Contribution = (ctx: Context) => Dispose

/** Shared implementations, not a host ToolRuntime registration. Only an
 * explicit native preset/agent composition may publish these contributions.
 * The backend owns storage; each mount owns its model-visible registrations. */
export class ScopedCapabilities {
  private readonly definitions = new Map<string, ToolDefinition>()
  private readonly contributions = new Set<Contribution>()
  private readonly mounts = new Map<object, Dispose>()
  private closed = false
  constructor(private readonly lifetime: AbortSignal) {}

  has(name: string): boolean { return !this.closed && this.definitions.has(name) }

  add(tool: ToolDefinition): Dispose {
    this.assertPreparing()
    if (this.definitions.has(tool.name)) throw new Error(`重复的协作工具：${tool.name}`)
    this.definitions.set(tool.name, tool)
    return () => { this.definitions.delete(tool.name) }
  }

  contribute(register: Contribution): Dispose {
    this.assertPreparing(); this.contributions.add(register)
    return () => { this.contributions.delete(register) }
  }

  mount(ctx: Context): Dispose {
    this.lifetime.throwIfAborted()
    const key = scopeOf(ctx)
    if (!key) throw new Error('微信群协作能力只能装载到原生预设或 Agent 作用域，不能全局装载')
    if (this.closed || this.mounts.has(key)) throw new Error('协作能力已停用或此作用域已装载')
    const tools = ctx.get('tools') as ToolRuntime
    const active = new AbortController(), removers: Dispose[] = []
    const signal = AbortSignal.any([this.lifetime, active.signal])
    let disposed = false
    const dispose = () => {
      if (disposed) return
      disposed = true; active.abort(new Error('此模式的微信群协作能力已停用'))
      this.mounts.delete(key)
      // Releasing one failed contribution must not retain the other tools.
      let failure: unknown
      for (const remove of removers.reverse()) { try { remove() } catch (error) { failure ??= error } }
      if (failure) throw failure
    }
    try {
      for (const definition of this.definitions.values()) {
        removers.push(tools.register({ ...definition, async execute(args, exec) {
          signal.throwIfAborted()
          const result = await definition.execute(args, { ...exec, signal: AbortSignal.any([exec.signal, signal]) })
          signal.throwIfAborted()
          return result
        } }))
      }
      for (const register of this.contributions) removers.push(register(ctx))
      this.mounts.set(key, dispose)
      return dispose
    } catch (error) { dispose(); throw error }
  }

  close(): void {
    if (this.closed) return
    this.closed = true
    let failure: unknown
    for (const dispose of [...this.mounts.values()]) { try { dispose() } catch (error) { failure ??= error } }
    this.definitions.clear(); this.contributions.clear()
    if (failure) throw failure
  }

  private assertPreparing(): void {
    this.lifetime.throwIfAborted()
    if (this.closed || this.mounts.size) throw new Error('不能修改正在使用或已停用的协作能力目录')
  }
}
