export declare function CompanionUpdateCard({ value, onDecide, deciding }: {
    value?: {
        state: string;
        message: string;
        offerId?: string;
        versions?: {
            current: string;
            running: string;
            installed: string | null;
            peer: string;
            peerInstalled: string | null;
        };
    };
    onDecide?: (action: 'approve' | 'later') => void;
    deciding?: boolean;
}): JSX.Element | null;
