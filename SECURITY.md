# Security Policy

## Supported version

Security fixes are applied to the current `main` branch. This project does not currently publish multiple supported release lines.

## Reporting a vulnerability

Please use [GitHub private vulnerability reporting](https://github.com/sahil-sharma-50/Talk-OS/security/advisories/new) when available. Do not include API keys, access tokens, workspace exports, or personal data in a public issue.

Include the affected route or component, reproduction steps, impact, and any suggested mitigation. A maintainer will review the report before public disclosure.

## Credential model

The public deployment expects visitors to provide their own AssemblyAI and optional Tavily credentials.

- Credentials are stored in tab-scoped `sessionStorage` under `talkos.credentials`.
- Credentials are not written to IndexedDB or included in workspace exports.
- AssemblyAI credentials pass through `POST /api/voice-token` to obtain a short-lived token.
- Tavily credentials pass through `POST /api/research` for constrained search and extraction requests.
- The application does not intentionally log credentials or API response bodies containing them.

Treat the device, browser profile, and deployed origin as part of the trust boundary. Clear credentials from Settings before sharing a browser session.

## Server-funded deployments

Production routes ignore server environment credentials unless `TALKOS_ALLOW_SERVER_CREDENTIALS=true`. Enable that setting only on an authenticated deployment with request limits, cost controls, monitoring, and a reviewed abuse policy. Same-origin validation is not a substitute for authentication.

Never expose provider secrets through `NEXT_PUBLIC_*` variables, client source, committed environment files, screenshots, test fixtures, or support logs.

## Data storage and third parties

Workspace artifacts, conversation history, research, trash, and change receipts are stored locally in IndexedDB. Theme preference uses `localStorage`. TalkOS has no application database or cross-device synchronization.

During use, voice audio and requested workspace context are sent to AssemblyAI. Research queries and selected URLs are sent to Tavily. Review those providers' policies before processing confidential or regulated information.
