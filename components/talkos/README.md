# TalkOS Components

This directory contains the interactive React surfaces for the TalkOS workspace.

`TalkOSApp.tsx` is the client composition root. It owns session and workspace state, IndexedDB persistence, tab-scoped credentials, voice adapter lifecycle, active workspace navigation, and activity visibility.

The remaining components are grouped by user surface:

- `VoicePanel`, `VoiceOrb`, `Transcript`, and `LatestExchange` render the voice session.
- `Workspace` coordinates the seven main tabs.
- `DocumentWorkspace`, `SheetsWorkspace`, `PlannerWorkspace`, `ResearchWorkspace`, `CanvasWorkspace`, and `DashboardWorkspace` render the working surfaces.
- `ActivityDrawer`, `ActivityTimeline`, artifact navigation, menus, settings, and resize controls provide shared workspace behavior.

Keep state transitions and data operations in `features` when they can be tested independently of React. Components should preserve keyboard access, semantic labels, visible focus, reduced-motion behavior, and responsive containment. Place interaction tests next to the component they exercise.
