import type { GateStatus } from './remote-page-store.js';
export declare function CompanionUpdateCard({ value, onDecide, deciding, compact }: {
    value?: GateStatus['companionUpdate'];
    onDecide?: (action: 'approve' | 'later') => void;
    deciding?: boolean;
    compact?: boolean;
}): JSX.Element | null;
