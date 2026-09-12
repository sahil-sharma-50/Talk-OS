# TalkOS Canvas and Dashboard — proposed design

Status: draft for product review. Requested work is feasibility and planning; this document does not authorize implementation. Inspected the current working tree on 2026-09-13, including existing uncommitted workspace work.

## Recommendation and feasibility

Implement Canvas first, then Dashboard. Both fit the existing Next.js/React/TypeScript application, local IndexedDB persistence, client-executed agent tools, and revision-checked workspace changes. Neither needs a new backend for the proposed scope. Actual voice latency and new editor compatibility still need an implementation spike; this review did not exercise a live provider session.

Canvas contributes visual creation and editing. Dashboard composes existing information through explicit source references. They share artifact lifecycle and tool dispatch infrastructure but should ship independently.

## Confirmed scope and proposed defaults

1. Confirmed by the user: diagrams and freehand whiteboarding matter equally from the first release, accepting a larger build. Include freehand drawing, images, arbitrary shapes, text, sticky notes, and editable diagrams together.
2. Confirmed by the user: Canvas updates after each completed instruction, with interruption and undo. Partial speech does not mutate saved diagrams. Mid-sentence visual previews are a separate later experiment.
3. Confirmed by the user: each dashboard selects its source documents, sheets, planners and research. One local workspace may contain several boards and dashboards; a dashboard stores its own project title and optional launch date. V1 does not add a global Projects subsystem.
4. Live means recomputing from local source edits and the current clock while the application is open. External polling, background monitoring, cloud synchronization, and multiplayer are outside v1.
5. Deliver the complete combined Canvas scope first and a focused Dashboard second. Item 4 is the proposed v1 boundary; the three user-selected product choices above are confirmed.

## Evidence in the current code

| Existing area | Extension point | Consequence |
| --- | --- | --- |
| `features/session/session.types.ts` | `WorkspaceView` | Add `canvas` and `dashboard`. |
| `components/talkos/Workspace.tsx` | Tab list, panel rendering, file count | Add independent workspaces and include new artifacts in counts. |
| `features/workspace/workspace.types.ts` | Snapshot v2, artifact/mutation unions | Add versioned board/dashboard types and migrate stored workspaces. |
| `features/workspace/workspace-model.ts` | Create/edit/undo/rename/duplicate/trash/restore | Extend every lifecycle branch; several current fallbacks assume Planner. |
| `features/workspace/workspace-storage.ts` | v1-to-v2 migration and JSON import | Support all old versions without erasing documents, research, history, or trash. |
| `features/voice/research-tools.ts` | Tool schemas, instructions, dispatcher | Register domain tools and include new artifacts in workspace inspection. |
| `features/voice/tool-workspace.ts` | Tool-to-tab mapping | Follow Canvas/Dashboard tool activity. |
| `features/voice/assemblyai-adapter.ts` | Abort controllers and generation tracking | Reuse interruption handling; guard new asynchronous work at commit time. |
| `components/talkos/TalkOSApp.tsx` | Workspace ref, save queue, runtime | Keep one canonical workspace; avoid full persisted writes during pointer movement. |
| `features/workspace/sheet-formulas.ts` | `evaluateSheet` | Use computed values, preserving formula errors, for dashboard calculations. |

Current Planner tasks only contain completion, notes, and dates. There is no blocked field, risk classification, project grouping, currency metadata, or historical metric series. Dashboard cannot infer these as established facts.

## Canvas design

### Editor options

| Approach | Benefit | Tradeoff |
| --- | --- | --- |
| Embedded Excalidraw with a semantic adapter — recommended | Whiteboard gestures, drawing, images, shapes, and a programmatic scene API support the confirmed combined scope. | Voice operations need graph semantics over scene elements; editor and workspace undo must be coordinated. |
| React Flow with custom whiteboard tools | Structured, addressable nodes and edges suit voice edits. | Rebuilding drawing and image workflows adds work for the user's equally important whiteboard use case. |
| Custom editor or two simultaneous editor engines | Maximum flexibility. | Adds gesture, geometry, selection, persistence, and history complexity; defer. |

Use the MIT-licensed `@excalidraw/excalidraw` editor and a small `@dagrejs/dagre` layout adapter initially; reconsider ELK if nested system boundaries become a requirement. Render the editor through a client-only dynamic wrapper as its Next.js documentation prescribes. tldraw is another viable SDK but requires a production license, so it is not the default dependency. Pin compatible dependency versions after the integration spike rather than assuming this repository's `latest` React/Next dependencies are compatible.

### Scope and interaction

Support multiple named boards; pen/freehand strokes; erasing; image upload/paste; rectangle/ellipse/diamond/line/arrow/text tools; process, decision and sticky-note objects; labeled directed connectors; pan/zoom/fit; selection; drag/resize/rotate; grouping; inline labels; connect/reconnect/delete; auto-arrange; undo/redo; duplicate; trash/restore; native scene and TalkOS JSON import/export plus PNG/SVG export. Use these to make flowcharts, mind maps, architecture diagrams, journeys, brainstorm clusters, and simple roadmaps. Roadmaps are visual arrangements in v1, not a second scheduling engine.

Reuse the artifact rail and title/actions pattern, leaving the largest possible drawing area. Load the editor only when Canvas is used. Support keyboard editing, a navigable outline of nodes/connections, visible focus, light/dark themes, and reduced motion. Pointer movement is local transient state; one finished gesture is one persisted change. Panning and selecting are view state, not content revisions or Activity receipts.

Persist board ID/title/revision/time, a versioned Excalidraw scene, sanitized persistent view settings, and an asset manifest. Scene elements are canonical. Store TalkOS semantic roles and artifact references in namespaced element metadata; derive the node/edge index from shapes, bound text, and arrow endpoints. Manual label, position, connection and deletion edits therefore update the same data read by the agent; do not maintain an independently editable second graph. Keep SDK translation inside one scene adapter. Native imported unbound shapes remain editable but do not gain invented relationships.

Persist image files once in an IndexedDB asset store, with references shared by live boards, trash, and retained undo history. Exports include required files. Do not duplicate base64 images in every revision or send image bytes with `read_canvas`. Local imported images have no automatic vision interpretation or image-generation promise. Agent commands can move/resize/delete identified images and manipulate selected strokes. Optional artifact links reference existing document/sheet/planner/research IDs; links do not create automatic two-way synchronization.

Undo ownership is an explicit integration requirement: route Canvas undo/redo and Activity undo through TalkOS's revision-checked history, including manual gestures and agent operations. Clear/bypass the editor's separate content history when applying canonical state so the two stacks cannot diverge. Prototype keyboard, toolbar, text editing and native editor menu paths before accepting the integration. If supported APIs cannot provide coherent behavior, resolve that integration before extending the feature; do not ship two conflicting Undo actions.

The model sends semantic operations, not arbitrary JavaScript, HTML, or a whole replacement diagram. Resolve labels using `read_canvas`; editing tools use exact IDs. “Move authentication before onboarding” rewires the flow and arranges the affected nodes; merely changing x coordinates is insufficient. If two nodes match, ask which one rather than guessing. Unaffected user positions stay fixed unless the user requests whole-board arrangement.

### Voice transactions

Expose `create_canvas`, `read_canvas`, `edit_canvas`, and `arrange_canvas`. `read_canvas` returns semantic IDs, types, labels, connections and selected element IDs, with bounded pagination for larger boards. `edit_canvas` takes board ID, expected revision, a change label, and a bounded operation batch. Operations add/update/remove nodes and edges, add text/sticky notes/shapes, and move/resize/group/delete identified existing elements. Validate the complete resulting scene before applying any part: unique IDs, existing endpoints, finite bounded geometry, permitted types, nonempty labels where required, valid asset references, and payload limits. Loops are permitted because retry paths are useful.

Use one revision and Activity receipt per completed batch. Initial creation must also be undoable: the existing receipt format stores only previous artifacts, so extend it to represent artifact absence. Do not pretend that existing create helpers already support this.

Capture the current revision before asynchronous layout. Before committing, re-read the canonical workspace and check revision and cancellation again. A user edit during layout returns a conflict, preserving the edit. Do not commit a previously captured whole workspace over unrelated later changes. Track recently executed tool call IDs per session so duplicate deliveries cannot create duplicate boards.

For v1, diagrams appear when valid tool calls complete. A later preview layer may show tentative changes while interpreting speech, but must be visually distinct, unpersisted, cancellable, and reconciled against the final instruction. Do not promise literal word-by-word editing based on the present adapter.

## Dashboard design

### Data ownership

A dashboard owns its title, source selection, launch date/timezone, widget definitions, and layout. Its sources own the underlying facts. It stores references and calculation recipes, not copied numerical answers. Rendering derives values from the latest canonical workspace. Source edits update linked widgets without another LLM call.

Start with six widget types: metric, progress, deadline, task list, bar chart, and sourced summary. Use native CSS/SVG for this focused set plus accessible tables; add a charting library only if the accepted chart scope grows. Use a responsive grid with size presets and move controls. Freeform widget resizing is an extension, not necessary for the first useful dashboard.

Every widget exposes its source and calculation. Missing sources show “Source unavailable”; unconfigured bindings show “Connect a source”; invalid calculations show their reason. An empty project is not 0% healthy, and an unknown budget is not €0. Widgets can open their source in the appropriate tab.

### Concrete metric contracts

| Metric | Source and calculation |
| --- | --- |
| Progress | Completed tasks / total tasks across selected planners, deduplicated by planner/task identity. Zero tasks displays “No tasks”; label the method as task completion, not estimated project completion. |
| Tasks remaining | Count tasks with `completed === false` in selected planners. |
| Blockers | Add optional `blockedReason` to Planner tasks; count incomplete tasks with a nonblank reason. Preserve this field through manual and agent edits. |
| High-risk tasks | Add optional `riskLevel: low/medium/high`; count incomplete tasks explicitly marked high. Unassessed tasks remain unassessed. |
| Budget | Sum a selected calculated numeric range and compare it with an explicitly chosen budget cell. Configure one currency per widget; do not add mixed currencies or convert them implicitly. |
| Days until launch | Explicit dashboard launch date and timezone, using calendar-day difference; show “Launch today” or “N days overdue” when applicable. Recompute across midnight and on focus. |
| Spending by category | Bind aligned category and amount ranges in one sheet; group repeated category labels and sum valid numeric amounts. Invalid/mismatched ranges and formula errors are visible. |
| Research findings | Reference collection/source IDs and show summary with citations and freshness information. |
| Project health | Prefer explainable indicators for overdue tasks, blockers and budget overrun; show unknown where inputs are missing. A model's assessment is labeled separately from measured facts. |

Source-backed document summaries need document ID, source revision, and text. Changing that document marks the summary stale; refresh is a deliberate agent operation. Research collections currently lack revisions, so use a deterministic content fingerprint to detect changed query/summary/source membership, including referenced source content. Numeric recomputation is automatic; semantic summarization is not silently rerun on every keystroke.

### Agent integration

Expose `create_dashboard`, `read_dashboard`, and `edit_dashboard`. Creation first inspects the workspace, reads candidate sources and creates supported widget definitions. If source choices are ambiguous, ask a targeted question; do not bind the first arbitrary budget sheet. Widget edits use stable IDs and expected revisions.

An instruction to add a spending chart creates a chart widget bound to an existing category/amount range. If those data do not exist, explain what is missing. Creation and layout edits are undoable. Derived refreshes neither increment the dashboard definition revision nor create Activity noise. A dashboard edit never silently rewrites source artifacts; an explicit request to update a budget uses the existing sheet mutation pathway.

## Global constraints

- Keep existing documents, sheets, planners, research, conversation, trash and change history through every migration.
- Keep credentials out of persisted artifacts and exports.
- Use exact artifact and element IDs for edits, with revision checks at commit time.
- Use one canonical workspace and the existing Activity/undo pathway for content changes.
- Never fabricate metrics, citations, project membership or missing source values.
- No cloud synchronization, multiplayer or external-service polling in v1.
- Support manual editing without a live voice session.
- Do not persist partial speech or pointer-move frames as content changes.

## Delivery and evidence

Implementation sequences: [Canvas](../plans/2026-09-13-talkos-canvas.md) and [Dashboard](../plans/2026-09-13-talkos-dashboard.md).

1. Canvas: editor/undo compatibility spike, model/lifecycle/migration and assets, full manual whiteboard, semantic voice tools, layout, exports, then the full interruption demonstration.
2. Dashboard: source contracts and Planner metadata, derivation, widget editor and agent tools, then source-change/undo demonstrations.
3. Optional expansion: tentative speech previews, automatic image interpretation/generation, advanced nested layout, global Projects, richer charts/history and shared workspaces. Each needs a separate scoped decision.

A planning allowance for an experienced developer familiar with this repository is roughly 8–14 focused engineering days for the combined Canvas scope and 4–7 for Dashboard, including integration and tests. This is an estimate, not a delivery commitment; editor/history integration and provider latency are the biggest unknowns. Re-estimate after the first Canvas vertical slice. The local `hackathon.md` lists September 30; that event deadline was not independently verified in this review.

Validation performed for this feasibility assessment: `npm run typecheck` passed; 42 existing tests passed across workspace model/storage and tool routing/execution/voice adapter. No Canvas/Dashboard code was implemented or benchmarked.

## Reference material checked

- [React Flow save and restore](https://reactflow.dev/examples/interaction/save-and-restore)
- [React Flow layout options](https://reactflow.dev/learn/layouting/layouting)
- [React Flow MIT core and Pro offering](https://reactflow.dev/pro)
- [Excalidraw repository and license](https://github.com/excalidraw/excalidraw)
- [Excalidraw scene editing API](https://docs.excalidraw.com/docs/@excalidraw/excalidraw/api/props/excalidraw-api)
- [Excalidraw Next.js integration](https://docs.excalidraw.com/docs/@excalidraw/excalidraw/integration)
- [Excalidraw restoration utilities](https://docs.excalidraw.com/docs/@excalidraw/excalidraw/api/utils/restore)
- [Excalidraw export utilities](https://docs.excalidraw.com/docs/@excalidraw/excalidraw/api/utils/export)
- [tldraw production licensing](https://tldraw.dev/community/license)
