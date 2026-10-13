import type { ComponentProps, ReactNode } from 'react';
import * as NativeUi from '@deepseek-ai/dsh-client-ui-primitives';
export declare function ActionButton({ size, variant, ...props }: ComponentProps<typeof NativeUi.Button>): JSX.Element;
interface SwitchProps {
    checked: boolean;
    onChange: (value: boolean) => void;
    label: string;
    disabled?: boolean;
    title?: string;
}
export declare function PluginSwitch(props: SwitchProps): JSX.Element;
export declare function StatusLabel({ state, children }: {
    state: NativeUi.StateDotState | 'off';
    children: ReactNode;
}): JSX.Element;
export declare function FeatureIcon({ kind }: {
    kind: 'group' | 'clawbot' | 'resources';
}): JSX.Element;
export declare function SectionHeading({ icon, title, help, actions }: {
    icon: 'group' | 'clawbot' | 'resources';
    title: string;
    help?: string;
    actions?: ReactNode;
}): JSX.Element;
export {};
