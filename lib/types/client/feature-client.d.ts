import type { FeatureGrant, FeatureLease } from '../feature-access.js';
export type FeatureView = FeatureLease & {
    groupEnabled: boolean;
};
export type FeatureCall = (request: {
    action: 'status' | 'group.enabled';
    enabled?: boolean;
}) => Promise<FeatureView>;
export declare function featureLeaseAllows(lease: {
    checkedAt?: number;
    expiresAt?: number;
} | undefined, grant: FeatureGrant | undefined, now?: number): boolean;
/** Display validation is not authority: native tools enforce independently. */
export declare function featureView(value: unknown): FeatureView;
