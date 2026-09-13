# TalkOS

[![CI](https://github.com/sahil-sharma-50/Talk-OS/actions/workflows/ci.yml/badge.svg)](https://github.com/sahil-sharma-50/Talk-OS/actions/workflows/ci.yml)

TalkOS is a voice-directed productivity workspace. Speak an outcome and the agent can coordinate documents, working spreadsheets, plans, source-backed research, visual canvases, and live dashboards in one browser workspace.

The interaction is built for correction while work is happening. If a user interrupts with a new constraint, TalkOS cancels active work, rejects stale results, revises the task, and records the coordinated change as an undoable activity.

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/clone?repository-url=https%3A%2F%2Fgithub.com%2Fsahil-sharma-50%2FTalk-OS)

## Highlights

- Realtime voice sessions powered by AssemblyAI, with live captions, interruption, mute, and recovery controls.
- Documents with Markdown editing, TXT/Markdown/text-PDF import, section-aware composition, embedded canvas and sheet snapshots, and portable Markdown export.
- Sheets with CSV/XLSX import, CSV export, formatting, formulas, charts, row operations, and ranges up to `A1:Z1000`.
- Planners with task details, ordering, dates, conflict detection, CSV export, and calendar ICS export.
- Canvases with freehand drawing, shapes, connectors, images, automatic layout, and SVG/PNG/JSON export.
- Dashboards composed from selected workspace sources, with live metrics, charts, deadlines, summaries, and movable layouts.
- Tavily-backed research organized by query with inspectable sources and extracted content.
- Local-first workspace persistence, revision checks, visible activity receipts, and undo/redo for agent changes.

## Technology

- Next.js 16 App Router and React 19
- TypeScript
- AssemblyAI realtime voice agents
- Tavily search and extraction
- IndexedDB and browser session storage
- Vitest, Testing Library, and ESLint
- Vercel deployment and GitHub Actions CI

## Requirements

- Node.js 24.x
- npm 11 or a compatible npm version supplied with Node.js 24
- A modern browser with microphone support
- An AssemblyAI API key and published Agent ID for voice features
- An optional Tavily API key for live research

## Run locally

Clone and install the exact dependency versions from the lockfile:

```bash
git clone https://github.com/sahil-sharma-50/Talk-OS.git
cd Talk-OS
npm ci
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

TalkOS starts without server environment variables. Open **Settings** in the app and save your AssemblyAI API key, AssemblyAI Agent ID, and optional Tavily API key. The app keeps these values in tab-scoped `sessionStorage`; they are cleared when that browser tab session ends.

For a local development fallback, copy the example file and add credentials:

```powershell
Copy-Item .env.example .env.local
```

```bash
cp .env.example .env.local
```

Never commit `.env.local` or any other populated environment file.

## Available commands

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start the development server |
| `npm run build` | Create a production build |
| `npm start` | Serve the production build |
| `npm run lint` | Run ESLint with zero warnings allowed |
| `npm run typecheck` | Check TypeScript without emitting files |
| `npm test` | Run Vitest in watch mode |
| `npm run test:run` | Run the complete test suite once |
| `npm run check` | Run lint, types, tests, and the production build |

## How it works

```mermaid
flowchart LR
  User[User in browser] --> UI[TalkOS workspace]
  UI --> Session[(sessionStorage credentials)]
  UI --> Data[(IndexedDB workspace)]
  UI --> Token[/api/voice-token]
  Token --> AAI[AssemblyAI token service]
  UI --> Realtime[AssemblyAI realtime WebSocket]
  UI --> Research[/api/research]
  Research --> Tavily[Tavily API]
```

The browser owns the workspace state and editors. `app/api/voice-token` exchanges an AssemblyAI key for a short-lived session token; the browser then opens the realtime WebSocket directly. `app/api/research` proxies constrained Tavily search and extraction requests. Neither route stores credentials or workspace data.

See [Architecture](docs/ARCHITECTURE.md) for the module map and data flow.

## Deploy to Vercel

The default public deployment uses credentials supplied by each visitor, so no Vercel environment variables are required.

1. Select **Deploy with Vercel** above or import this GitHub repository in the Vercel dashboard.
2. Keep the repository root as the project root.
3. Leave environment variables empty.
4. Deploy, open the HTTPS URL, and add your own credentials in TalkOS **Settings**.

`vercel.json` selects the Next.js framework and reproducible npm install/build commands. Pushes and pull requests can produce Vercel preview deployments after the repository is connected.

See [Deployment](docs/DEPLOYMENT.md) for preview checks, troubleshooting, and the optional server-funded mode.

## Privacy and security

- Workspace artifacts, conversation history, research, trash, and activity receipts persist locally in IndexedDB.
- Saved API credentials use tab-scoped `sessionStorage`; TalkOS excludes them from IndexedDB and workspace exports.
- Voice content and requested workspace context are sent to AssemblyAI during an active session.
- Research queries and selected URLs are sent to Tavily.
- The application does not include a cloud database or cross-device synchronization.
- Production ignores server-side API keys unless `TALKOS_ALLOW_SERVER_CREDENTIALS=true` is explicitly enabled.

Read [Security](SECURITY.md) before enabling server-funded credentials.

## Current limits

- Sheets support columns `A` through `Z` and rows `1` through `1000`.
- Formula expressions are limited to 1,024 characters and 128 dependent cells. TalkOS implements a focused spreadsheet formula set rather than full Excel compatibility.
- PDF import requires selectable text; scanned documents need OCR first.
- Canvas and dashboard JSON can be exported, but matching JSON import flows are not available yet.
- Workspace state is local to one browser profile and is not synchronized between tabs or devices.

## Documentation

- [Product definition](PRODUCT.md)
- [Design system](DESIGN.md)
- [Architecture](docs/ARCHITECTURE.md)
- [Deployment](docs/DEPLOYMENT.md)
- [Contributing](CONTRIBUTING.md)
- [Security](SECURITY.md)

Source ownership notes are available in [`app`](app/README.md), [`components/talkos`](components/talkos/README.md), and [`features`](features/README.md).

## Contributing and license

Contributions should pass `npm run check` before a pull request is opened. See [CONTRIBUTING.md](CONTRIBUTING.md) for the development workflow.

TalkOS is available under the [MIT License](LICENSE).
