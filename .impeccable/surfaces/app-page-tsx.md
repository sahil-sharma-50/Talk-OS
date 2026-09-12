---
version: 2
slug: "app-page-tsx"
primary_target: "app/page.tsx"
related_targets: ["components/talkos/TalkOSApp.tsx","components/talkos/Workspace.tsx","components/talkos/VoicePanel.tsx","app/globals.css"]
---

# TalkOS everyday task workspace

## Scope and mode

- Target: the TalkOS application shell and its Documents, Sheets, Planner, Research, Settings, History, and Activity surfaces.
- Mode: Operate.
- Audience: founders, operators, students, and knowledge workers turning an outcome into usable artifacts.
- Job: direct work by voice or text, inspect what changes, redirect naturally, and leave with real exportable files.
- Primary action: speak through the central reactive agent or type in the composer; both use one AssemblyAI session.

## Direction

Working Canvas: a calm two-column productivity shell. The compact agent rail holds only the current one-to-one exchange; older turns and tool activity stay in drawers. The dominant dotted canvas hosts a native-feeling editor selected from Documents, Sheets, Planner, Research, and Settings. The memorable moment is an interruption that prevents stale work and produces one coordinated, undoable update across multiple artifacts.

## Implementation inventory

| Ingredient | Commitment |
| --- | --- |
| Command rail | Identity, theme, elapsed time, setup, Activity, Follow agent when paused, new session, export, Stop |
| Agent | Reactive body/waveform driven by state and actual PCM energy; start, mute, and Stop controls |
| Conversation | Latest exchange in view; persisted History drawer for older turns; always-available typed composer |
| Documents | Import, revision-safe editing, preserved drafts, per-file menu, undo, Markdown export |
| Sheets | CSV import/export, formulas, formats, visible results, lightweight chart, 1,000×26 cap |
| Planner | Tasks, due/start/end scheduling, overlap warnings, CSV/ICS export |
| Research | Exact-query collections, result list, summary, source reader, inspectable URLs |
| Activity | Objective, plan, tool ledger, interruption state, coordinated agent change receipts and undo |
| Persistence | IndexedDB workspace v2 for artifacts, research, history, trash, and receipts; secrets excluded |
| Responsive behavior | Two-column desktop; stacked agent/workspace and horizontally scrolling artifact rails on mobile |

## Constraints

- Preserve the existing cool-neutral identity and state-color rules.
- Keep the workspace larger than the agent rail.
- Do not surface human keystrokes as agent activity.
- Do not show old chat, task status, or research context permanently.
- Avoid glass, glow, decorative gradients, fake metrics, nested card mosaics, and unsupported automation claims.
- Keep every core flow keyboard accessible and respect reduced motion.

## Showcase prompt

“Turn this event brief into a budget, schedule, and final document. Actually, make it 30 guests, cap spending at €800, and keep Friday free.”

This should visibly demonstrate tool-aware navigation, interruption safety, coordinated edits, grouped undo, and AssemblyAI’s role in realtime redirection.
