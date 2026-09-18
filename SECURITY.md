# Security policy

## Reporting a vulnerability

Please do not open a public issue for vulnerabilities, credentials, private user data, or reproduction material that contains local paths and logs.

Use [GitHub private vulnerability reporting](https://github.com/martinbear1/dsh-wechat-remote/security/advisories/new). Include the affected version, impact, and the minimum reproduction needed to verify the issue. Remove pairing tickets, access tokens, account identifiers, conversation content, and complete local paths before attaching logs.

We will acknowledge a valid report, investigate it privately, and coordinate disclosure after a fix is available. Security fixes may be released without publishing operational details that would expose users before they can update.

## Supported versions

Security fixes are provided for the latest stable release. If a report concerns an older release, first verify whether it reproduces on the latest stable version without using a real user account or production node.

## Scope

This repository contains the DSH connection plugin and installer. Reports about the companion mini program or hosted relay are welcome through the same private channel, but their source and deployment are maintained separately.
