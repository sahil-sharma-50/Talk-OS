# Feature Modules

This directory contains product logic that can be understood and tested independently of the React surfaces.

| Directory | Responsibility |
| --- | --- |
| `session/` | Voice state, conversation turns, task activity, reducer transitions, and brief export |
| `workspace/` | Versioned workspace model, revisions, persistence, imports, exports, formulas, snapshots, and navigation |
| `voice/` | AssemblyAI WebSocket adapter, system prompt, tool schemas, tool execution, interruption, and telemetry |
| `canvas/` | Canvas types, geometry, scene mutations, layout, rendering metrics, and exports |
| `dashboard/` | Dashboard types, source binding, selectors, layout, suggestions, and exports |
| `demo/` | Deterministic showcase data and scripted controller |

Feature functions should remain deterministic unless their purpose is browser storage, file parsing, media, or network coordination. Workspace changes must validate expected revisions and record coordinated agent mutations so they can be audited and undone. Tests live beside the module as `*.test.ts` or `*.test.tsx`.
