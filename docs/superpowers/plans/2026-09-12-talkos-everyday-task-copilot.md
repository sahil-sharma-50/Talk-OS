# TalkOS Everyday Task Copilot Implementation Plan

**Goal:** Evolve TalkOS from a voice research workspace into a hackathon-ready task copilot that turns one conversation into coordinated, exportable documents, sheets, plans, and research.

**Architecture:** Keep the reducer and AssemblyAI adapter boundary. Persist a version-2 local workspace containing four artifact families, grouped research, conversation history, trash, and atomic change receipts. Register revision-safe client tools with the AssemblyAI session and let tool execution drive the active workspace while respecting manual navigation.

**Tech stack:** Next.js 16, React 19, TypeScript, Vitest, Testing Library, AssemblyAI Voice Agents, Tavily, IndexedDB, Papa Parse.

## Implemented work

- [x] Replace the permanent conversation/context layout with current exchange plus History and Activity drawers.
- [x] Add typed commands to the same AssemblyAI session without requiring microphone permission.
- [x] Add Documents, Sheets, Planner, Research, and Settings tabs with agent-follow navigation.
- [x] Add rename, duplicate, export, Move to Trash, and restore actions for every artifact.
- [x] Add spreadsheet formulas, formats, CSV interchange, bounds, and a lightweight chart.
- [x] Add planner tasks, dates, conflict detection, task CSV, and calendar ICS.
- [x] Group research results and summaries by exact query with a source reader.
- [x] Add atomic cross-artifact edits, revision validation, interruption aborts, change receipts, and undo.
- [x] Protect the AssemblyAI Agent ID from email/password-manager autofill in client and server paths.
- [x] Drive the bot’s visual response from actual microphone/playback PCM energy.
- [x] Persist conversation history with the local workspace and preserve unsaved document drafts.
- [x] Document the AssemblyAI-specific showcase value: mid-task redirection without stale writes.

## Verification gates

- [x] TypeScript, lint, all Vitest suites, production build, and diff checks pass.
- [x] Desktop and mobile browser passes show no overlap, clipped core action, or console error.
- [x] Impeccable detector reports no unresolved high-confidence UI issue.
