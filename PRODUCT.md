# Product

<!-- impeccable:product-schema 1 -->

## Platform and users

TalkOS is a browser-based productivity workspace agent for founders, operators, students, and knowledge workers who need to turn a conversation into usable files—not another chat transcript.

## Product purpose

The user states an outcome by voice or text. TalkOS inspects the local workspace, forms a visible plan, and works across Documents, Sheets, Planner, and source-backed Research. It can create a brief, calculate a budget, schedule the work, and keep those artifacts coordinated when a constraint changes.

## Highest-value AssemblyAI use case

TalkOS is built for mid-task redirection. While the agent is researching or updating files, the user can interrupt naturally—“make it 30 guests, cap it at €800, and keep Friday free.” AssemblyAI provides the realtime speech state and interruption path. TalkOS aborts active tools, rejects late stale results, revises the task, and applies the related file changes atomically. This is materially more useful than dictation: the conversation controls live work without sacrificing consistency.

## Winning demonstration

1. Give TalkOS a short event brief.
2. Ask it to create a budget sheet, task plan, schedule, and event document.
3. Watch the workspace follow the active tool while the Activity drawer records the work.
4. Interrupt with “30 guests, €800 maximum, and keep Friday free.”
5. Show the revised artifacts, the single coordinated change receipt, one-click undo, and real CSV/ICS/Markdown exports.

## Capabilities and boundaries

- Realtime AssemblyAI voice, streamed transcripts, typed messages in the same session, barge-in, and client tools.
- Documents with TXT/Markdown/text-PDF import, revision checks, draft preservation, undo, and Markdown export.
- Sheets with CSV import/export, 1,000×26 limits, arithmetic and common formulas, formatting, and a lightweight chart.
- Planner with tasks, manual dates and times, conflict detection, task CSV, and calendar ICS export.
- Tavily-backed public-web research grouped by exact search query, with inspectable URLs, extracted text, and summaries.
- Atomic cross-tool changes with revision validation and one visible undo receipt.
- Local IndexedDB persistence for artifacts, conversation history, research, trash, and changes.
- No Google/OAuth dependency, cloud database, fake evidence, autonomous purchasing, or unrestricted computer control.

## Privacy and cost model

Users can bring AssemblyAI and Tavily credentials for the current page session; AssemblyAI may alternatively be configured by the deployment. Credentials are never written to IndexedDB. Workspace content remains on the device. The application requires no paid database and can run on a basic Next.js deployment.

## Product principles

- Produce inspectable work, not chat-only answers.
- Let the workspace follow the agent until the human chooses a different tab.
- Make searches, plans, interruptions, coordinated edits, and undo visible.
- Preserve human drafts and reject stale agent writes.
- Cite public facts with links; never invent evidence.
- Keep spoken updates short while the workspace holds the detail.
- Maintain keyboard access, visible focus, clear status, and reduced-motion support.
