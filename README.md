# TalkOS

TalkOS is an AssemblyAI-powered productivity workspace agent. Speak or type an outcome and it turns the conversation into coordinated documents, working spreadsheets, plans, visual canvases, live dashboards, and source-backed research. Interrupt mid-task to change a constraint; active work is cancelled, stale results are discarded, and related files can be updated as one undoable change.

## Run locally

```powershell
npm install
npm run dev
```

Open `http://localhost:3000`. Typing does not request microphone permission. To use live voice, open **Settings** and provide an AssemblyAI API key plus the published Voice Agent ID. Add a Tavily API key only when live web research is needed. AssemblyAI credentials can instead be supplied through deployment environment variables; see `.env.example`.

## What the workspace can do

- **Documents:** import TXT, Markdown, and text PDFs; edit, rename, duplicate, trash/restore, undo, and export Markdown.
- **Sheets:** import/export CSV, calculate arithmetic and `SUM`, `AVERAGE`, `MIN`, `MAX`, and `COUNT`, apply basic number formats, and show a quick chart.
- **Planner:** create tasks, set due/start/end times, record blockers and risk, flag overlaps, and export task CSV or calendar ICS.
- **Research:** keep every Tavily search grouped with its results, extracted source text, and sourced summary.
- **Canvas:** draw freely, add images, compose diagrams, group and arrange items, and export SVG, PNG, or TalkOS JSON.
- **Dashboard:** select exact workspace sources and build live task, budget, deadline, risk, chart, and sourced-summary widgets.
- **Coordination:** apply revision-checked changes with one Activity receipt, cancellation, and undo/redo for agent-driven Canvas and Dashboard work.

Workspace data, conversation history, research, trash, and change receipts persist in IndexedDB. Credentials stay in memory and are not written to browser storage.

## Why AssemblyAI matters

The showcase interaction is redirection, not transcription. A user can interrupt while TalkOS is working, add a new constraint, and prevent the previous tool result from landing. The same AssemblyAI session accepts typed commands, so voice and keyboard remain interchangeable.

## Verification

```powershell
npm run lint
npm run typecheck
npm test -- --run
npm run build
```
