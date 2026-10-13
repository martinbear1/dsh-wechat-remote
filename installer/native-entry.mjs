/** The npm bundle contains a nested core package, not a Loader-mounted core
 * entry. Its generated Host face therefore belongs to this gate fiber through
 * the public registry API. The standalone core keeps native Loader discovery.
 * Never leave a definition behind after disable/uninstall or fall back around
 * a withdrawn strict definition. */
import { apply as mountGate, inject as gateInject } from './lib/index.js'
import { TYPERT } from './lib/typert.host.js'

export const name = 'gate'
export const inject = [...gateInject, 'typert']

export function apply(ctx) {
  ctx.typert.register(TYPERT)
  return mountGate(ctx)
}
