/** Historical journal metadata only. Plugins do not own DSH processes or OS
 * services. Starting/stopping them is deliberately absent from this module. */
export type HostManager = {
    kind: 'process';
} | {
    kind: 'systemd';
    unit: string;
} | {
    kind: 'launchd';
    label: string;
    domain: string;
    plist: string;
};
