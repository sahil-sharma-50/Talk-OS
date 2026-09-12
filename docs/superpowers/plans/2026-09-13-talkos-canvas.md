# TalkOS Canvas Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Execution method is not selected by this planning request.

**Goal:** Add an agent-editable Canvas combining a full manual whiteboard with structured diagrams in the first release.

**Architecture:** Embed Excalidraw through a client-only boundary. Persist its scene as canonical board content and derive semantic diagram relationships through a dedicated adapter. Route manual edits and voice operations through TalkOS revision checks, persistence, and coordinated history.

**Tech Stack:** Existing Next.js, React, TypeScript, IndexedDB, Vitest and Testing Library; proposed `@excalidraw/excalidraw` and `@dagrejs/dagre`, pinned to compatible versions after Task 1.

**Spec:** `docs/superpowers/specs/2026-09-13-talkos-canvas-dashboard-design.md`

**Status:** Proposed implementation sequence. The user confirmed combined drawing/diagram scope and updates after completed voice instructions, with interruption and undo. No implementation has been performed.

## Global Constraints

- Keep existing documents, sheets, planners, research, conversation, trash and change history through every migration.
- Keep credentials out of persisted artifacts and exports.
- Use exact artifact and element IDs for edits, with revision checks at commit time.
- Use one canonical workspace and the existing Activity/undo pathway for content changes.
- Never fabricate metrics, citations, project membership or missing source values.
- No cloud synchronization, multiplayer or external-service polling in v1.
- Support manual editing without a live voice session.
- Do not persist partial speech or pointer-move frames as content changes.

## File boundaries

| File | Responsibility |
| --- | --- |
| `features/canvas/canvas.types.ts` | Board, scene envelope, semantic view, tool operations and limits. |
| `features/canvas/canvas-scene.ts` | SDK element creation/restoration, semantic index, atomic validated patches. |
| `features/canvas/canvas-layout.ts` | Arrange selected semantic graph nodes and update bound arrows. |
| `features/canvas/canvas-assets.ts` | Image validation, asset manifest and editor file-map translation. |
| `features/canvas/canvas-export.ts` | Native scene/TalkOS JSON and PNG/SVG export. |
| `features/canvas/canvas-history.ts` | Gesture batching, undo/redo integration and editor echo suppression. |
| `features/voice/canvas-tools.ts` | Canvas JSON schemas and executor. |
| `components/talkos/CanvasWorkspace.tsx` | Artifact rail, board actions and editor loading state. |
| `components/talkos/CanvasEditor.tsx` | Client-only Excalidraw integration, selections and gesture bridge. |
| `components/talkos/CanvasOutline.tsx` | Keyboard-accessible element/connection navigation. |

Existing integration files: `features/workspace/workspace.types.ts`, `workspace-model.ts`, `workspace-storage.ts`; `features/session/session.types.ts`; `features/voice/research-tools.ts`, `tool-workspace.ts`, `assemblyai-adapter.ts`; `components/talkos/Workspace.tsx`, `TalkOSApp.tsx`, `ActivityDrawer.tsx`, `FileActionMenu.tsx`; `app/globals.css`; `package.json` and lockfile.

## Task 1: Prove editor, history and build compatibility

**Files:** Create `components/talkos/CanvasEditor.tsx`, `features/canvas/canvas-history.ts` and `features/canvas/canvas-history.test.ts`; modify package manifests. Keep the experiment behind a development fixture until accepted.

- [ ] Record baseline `npm run typecheck` and `npm test -- --run`; inspect the installed React/Next versions and editor peer dependencies before selecting exact dependency versions.
- [ ] Load a wrapper dynamically from a client component using the documented pattern:

```tsx
const CanvasEditor = dynamic(() => import('./CanvasEditor'), { ssr: false });
```

- [ ] In the wrapper, create a rectangle, attached text, bound arrow, freehand stroke and pasted local image. Verify label editing and move/resize maintain bindings.
- [ ] Prove that programmatic updates, pointer gestures, text editing, keyboard undo/redo and editor menu undo/redo can share the canonical TalkOS history. Applying an external state must not generate another content commit. Use documented editor APIs; do not manipulate private stores.
- [ ] Demonstrate drawing → agent patch → undo patch → undo drawing → redo drawing → redo patch. Verify both scene content and change receipts, not just button clicks.
- [ ] Run `npm run build` and inspect the real browser in both themes. Record SDK version and the selected history integration in the spec before continuing. If history integration fails, this is the point to change the editor integration, not after building all the tools.

**Acceptance:** One coherent undo/redo behavior, no SSR import crash, editable graph plus drawing/image support. This is the main feasibility gate remaining after static review.

## Task 2: Persist boards and assets without losing existing work

**Files:** Create `features/canvas/canvas.types.ts`, `canvas-assets.ts`, `canvas-assets.test.ts`; modify workspace types/model/storage and their tests; extend Activity history rendering.

**Interfaces:** Export `WorkspaceCanvas` with `id`, `title`, `revision`, `updatedAt`, versioned `scene` and `assetIds`; add `canvases` and `activeCanvasId` to snapshot v3. Export `createCanvas(workspace, title, scene)`, returning the existing `WorkspaceChangeResult` convention. Add `canvas` to artifact and mutation unions.

- [ ] Write migration fixtures for v1 and v2, including document revisions, conversation, existing change receipts and trash. Assert they are preserved when upgrading to v3 and exporting/reloading.
- [ ] Add a present/absent before-state representation to change receipts so undoing new Canvas creation is supported. Normalize legacy before snapshots to present states during migration. Keep `undone` and monotonic artifact revisions compatible with existing Activity.
- [ ] Extend new receipts with the forward state needed for redo. Export `redoWorkspaceChange(workspace, changeId)` using the same result convention as undo; validate the post-undo revisions before reapplying. Legacy receipts remain undoable and expose redo only when sufficient forward state was captured during their undo. Persist history state so reload cannot replay an incompatible branch.
- [ ] Implement Canvas lifecycle branches for create, edit, rename, duplicate, trash, restore and undo. Duplicating a board remaps scene IDs and bound references consistently; immutable image assets may be shared.
- [ ] Add a dedicated asset object store via IndexedDB database version 2. Atomically save referenced assets and the workspace snapshot in one transaction. Loading verifies asset presence; a missing asset produces a recoverable missing-image state.
- [ ] Validate imports with initial limits: 2,000 scene elements/board, 100 operations/tool call, 1 MiB/tool payload, 10 MiB/image and 50 MiB unique image data/board. Use explicit error codes `canvas_limit_exceeded`, `invalid_canvas_scene`, `missing_canvas_asset` and `canvas_asset_too_large`.
- [ ] Retain assets referenced by boards, trash and retained change history. Do not introduce destructive asset collection in v1. Include required asset files in exports.
- [ ] Test creation undo, restore, duplicate bindings, malformed imports, missing images and simulated transaction failure. Run `npm test -- --run features/workspace features/canvas` and `npm run typecheck`.

**Acceptance:** Reload preserves mixed drawing/diagram/image boards and all older workspace content. Creation and editing produce usable Activity receipts.

## Task 3: Deliver the complete manual Canvas workspace

**Files:** Create `CanvasWorkspace.tsx`, `CanvasOutline.tsx`, `CanvasWorkspace.test.tsx`; complete `CanvasEditor.tsx` and `canvas-history.ts`; modify workspace navigation, runtime and styles.

**Interfaces:** `CanvasWorkspace` follows the existing `{ workspace, onChange }` pattern. The editor bridge accepts canonical board content and emits one content transaction per completed gesture. Its selection callback supplies exact selected scene IDs to the runtime.

- [ ] Add `canvas` to `WorkspaceView`, the tab list, panel selection and artifact counts. Include a blank-board action and multiple named boards with the existing file menu conventions.
- [ ] Expose pen, eraser, shapes, line/arrow, text, sticky notes, image upload/paste, selection, drag/resize/rotate, group/ungroup, zoom and fit. Preserve focused text drafts when agent work arrives; return a conflict instead of overwriting an active edit.
- [ ] Implement local gesture buffering. Content commits occur at pointer-up/text-edit completion; flush completed content before switching boards. Persist viewport on idle separately from content revision/undo. Selection is transient.
- [ ] Route Canvas undo/redo to the verified Task 1 bridge. After a new content edit, invalidate any incompatible redo branch. Activity undo checks current artifact revisions before restoring anything.
- [ ] Build an outline from scene labels/types and arrow relationships; allow keyboard selection, rename and delete. Give unlabeled strokes/images a stable accessible type-and-ID label without claiming their visual meaning.
- [ ] Test board navigation, file lifecycle, text draft preservation, one receipt per gesture, and no receipt for pan/select. Inspect desktop, compact widths, themes, focus and reduced-motion behavior in a real browser.

**Acceptance:** Every confirmed manual whiteboard capability works without microphone or agent credentials.

## Task 4: Add semantic scene operations and stable layout

**Files:** Create `canvas-scene.ts`, `canvas-scene.test.ts`, `canvas-layout.ts`, `canvas-layout.test.ts`.

**Interfaces:** `readCanvasScene(board, selectionIds, cursor?)` returns a bounded semantic view with revision and IDs. `applyCanvasOperations(board, expectedRevision, operations)` returns a validated new board or structured error without mutating its input. `arrangeCanvas(board, nodeIds, direction, signal?)` returns proposed content; it never commits workspace state itself.

```ts
type CanvasOperation =
  | { op: 'add_node'; id: string; role: 'process' | 'decision' | 'sticky' | 'text'; text: string; x: number; y: number }
  | { op: 'add_shape'; id: string; shape: 'rectangle' | 'ellipse' | 'diamond' | 'line'; x: number; y: number; width: number; height: number }
  | { op: 'connect'; id: string; sourceId: string; targetId: string; label: string }
  | { op: 'set_text'; id: string; text: string }
  | { op: 'transform'; id: string; x: number; y: number; width: number; height: number }
  | { op: 'group'; ids: string[]; groupId: string }
  | { op: 'ungroup'; groupId: string }
  | { op: 'link_artifact'; id: string; source: { kind: 'document' | 'sheet' | 'planner' | 'research'; id: string } | null }
  | { op: 'remove'; ids: string[] };
```

- [ ] Implement semantic indexing from scene shapes, bound text, arrow endpoints and namespaced metadata. A manual label/connection change must immediately appear in `readCanvasScene`.
- [ ] Resolve `link_artifact` references against exact workspace IDs before commit. Add manual link/open controls for selected nodes; missing targets display an unavailable-link state without deleting scene content.
- [ ] Apply operations to a cloned draft; restore SDK bindings with documented utilities; validate the entire result before returning it. Remove incident graph connectors when deleting a node, and record that consequence in the result. Reject duplicate IDs, unknown targets, invalid asset references and non-finite geometry.
- [ ] Preserve unselected strokes, images, groups and user-positioned elements byte-for-byte where possible. Treat graph cycles as valid. Importing an unbound arrow must not invent a semantic connection.
- [ ] Use Dagre on selected graph nodes; translate bounds and connectors through the scene adapter. Keep unrelated items fixed. Move group members together or require explicit whole-group selection.
- [ ] Test a literal flow transformation: start → onboarding → authentication → home becomes start → authentication → onboarding → home, plus authentication → error → authentication. Assert edges, preserved IDs, preserved nearby drawings and one revision increment.
- [ ] Run `npm test -- --run features/canvas/canvas-scene.test.ts features/canvas/canvas-layout.test.ts`.

**Acceptance:** Voice-relevant edits alter real relationships and retain freehand content. Scene and semantic index cannot diverge.

## Task 5: Connect Canvas to the voice agent safely

**Files:** Create `features/voice/canvas-tools.ts` and tests; modify tool registry/prompt, tool-workspace mapping, adapter and related tests.

**Interfaces:** Canvas tool execution consumes the existing `ResearchToolCall`, `WorkspaceRuntime`, and optional `AbortSignal`, returning `ResearchToolExecution`. Add an optional runtime selection getter keyed by board ID. Tools: `create_canvas`, `read_canvas`, `edit_canvas`, `arrange_canvas`.

- [ ] Register strict bounded schemas and return IDs/revisions/change IDs. `create_canvas` accepts title plus an initial operation batch; reject the entire creation if that batch is invalid. `edit_canvas` requires expected revision. Never send image bytes or every freehand point when a semantic summary is sufficient.
- [ ] Extend `get_workspace`, `workspaceForTool` and agent instructions. Describe supported operations, ambiguity handling, source links, drawing limits and the completed-instruction timing contract.
- [ ] Before committing any asynchronous layout, re-read runtime workspace; check cancellation and board revision, then merge the board mutation into that current workspace. Add per-session call-ID result caching/in-flight tracking to prevent duplicate creates and edits. Clear it on session reset.
- [ ] Extend `apply_workspace_changes` to accept Canvas edits with the existing artifact types. Prevalidate all mutations against a draft; a failure in any member leaves all artifacts untouched. Reject duplicate mutations for the same artifact within one batch unless deliberately combined into a single operation list.
- [ ] Test aborted layout, manual edit during layout, unrelated document changes during layout, duplicate call delivery, ambiguous labels, mixed document/Canvas atomicity and tool-triggered tab following.
- [ ] Run the workspace, Canvas and voice suites. Then use an actual configured voice session to create a flow, interrupt arrangement, revise it, and undo. Record time to first visible committed scene and completion latency; do not equate animation with streaming reasoning.

**Acceptance:** Both typed and spoken commands edit the same manual board; interrupted/stale operations never overwrite newer work.

## Task 6: Export, accessibility and release verification

**Files:** Create `canvas-export.ts` and tests; complete Canvas actions; update `README.md`, `PRODUCT.md` and relevant design documentation.

- [ ] Implement SDK-based PNG/SVG export with required embedded assets and current theme. Implement native scene import/export and TalkOS JSON preserving semantic metadata; pass imports through scene and asset validation before replacing anything.
- [ ] Verify export/reimport retains labels, arrows, images and roles. Recover malformed scenes with a visible error rather than silently starting an empty board.
- [ ] Exercise 500 mixed elements as a responsiveness target and enforce the 2,000-element limit. Profile drag, selection, tab switching, save size and tool serialization; report measurements on the tested browser/hardware.
- [ ] Run `npm run lint`, `npm run typecheck`, `npm test -- --run`, and `npm run build` once the feature is complete. Inspect the running browser for drawing, image paste, diagram edits, undo/redo, reload and exports.
- [ ] Record limitations and supported commands in README. Re-estimate Dashboard only after Canvas passes its end-to-end demonstration.

## Demonstration that defines completion

Draw a rough sketch and paste an image. Say “Map out the user flow for TalkOS.” Then say “Move authentication before onboarding and show what happens if login fails.” Confirm connectors and labels change correctly while the sketch/image survive. Interrupt another edit; verify stale work does not land. Undo/redo, reload, and export the board. All of this must work with the same saved board and actual Activity history.
