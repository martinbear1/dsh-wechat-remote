import type { ComponentProps, ComponentType, ReactNode } from 'react'
import * as NativeUi from '@deepseek-ai/dsh-client-ui-primitives'
import ui from './PluginUi.module.css'

export function ActionButton({ size = 'sm', variant = 'outline', ...props }: ComponentProps<typeof NativeUi.Button>): JSX.Element {
  return <NativeUi.Button size={size} variant={variant} {...props} />
}

interface SwitchProps { checked: boolean; onChange: (value: boolean) => void; label: string; disabled?: boolean; title?: string }
// Switch is public in current DSH. Older supported hosts export the remaining
// primitives but not Switch: keep that boundary local, with the same semantics.
const HostSwitch = (NativeUi as typeof NativeUi & { Switch?: ComponentType<SwitchProps> }).Switch
export function PluginSwitch(props: SwitchProps): JSX.Element {
  if (HostSwitch) return <HostSwitch {...props} />
  return <button type="button" role="switch" aria-checked={props.checked} aria-label={props.label}
    title={props.title} disabled={props.disabled} className={ui.switch} onClick={() => props.onChange(!props.checked)}>
    <span className={ui.thumb} />
  </button>
}

export function StatusLabel({ state, children }: { state: NativeUi.StateDotState | 'off'; children: ReactNode }): JSX.Element {
  return <span className={ui.status}>{state === 'off' ? <span className={ui.offDot} aria-hidden="true" />
    : <NativeUi.StateDot state={state} size={8} />}{children}</span>
}

export function FeatureIcon({ kind }: { kind: 'group' | 'clawbot' | 'resources' }): JSX.Element {
  if (kind === 'clawbot') return <span className={ui.clawbotIcon} aria-hidden="true" />
  return <svg className={ui.icon} aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
    {kind === 'group' ? <><circle cx="9" cy="8" r="3" /><path d="M3 21v-3a6 6 0 0 1 12 0v3M16 5a3 3 0 0 1 0 6m2 3a5 5 0 0 1 3 4v3" /></>
      : <><path d="m3 7 9-4 9 4-9 4Zm0 0v10l9 4 9-4V7M12 11v10" /><path d="m7.5 5 9 4v4" /></>}
  </svg>
}

export function SectionHeading({ icon, title, help, actions }: { icon: 'group' | 'clawbot' | 'resources'; title: string; help?: string; actions?: ReactNode }): JSX.Element {
  return <div className={ui.header}>
    <div className={ui.heading}><FeatureIcon kind={icon} /><h3>{title}</h3>
      {help ? <NativeUi.Tooltip label={help} side="bottom" maxWidth={320}><span className={ui.experimental} tabIndex={0}>实验性</span></NativeUi.Tooltip> : null}
    </div>
    {actions ? <div className={ui.actions}>{actions}</div> : null}
  </div>
}
