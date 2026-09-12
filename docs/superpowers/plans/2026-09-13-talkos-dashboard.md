# TalkOS Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Execution method is not selected by this planning request.

**Goal:** Add configurable project dashboards whose metrics and charts stay connected to explicitly selected TalkOS sources.

**Architecture:** Persist dashboard definitions and source bindings as revisioned artifacts; derive live widget values from the canonical workspace. Numeric calculations run locally, while document/research summaries carry source revisions or fingerprints and explicit freshness states. Reuse Canvas's artifact lifecycle/history foundation without importing its editor.

**Tech Stack:** Existing React, TypeScript, IndexedDB, Vitest and Testing Library; native CSS grid/SVG; existing sheet formula evaluator.

**Spec:** `docs/superpowers/specs/2026-09-13-talkos-canvas-dashboard-design.md`

**Dependency:** Planned after Canvas snapshot v3 and history extensions. Dashboard produces v4; it remains independent of board rendering and Canvas tools.

**Status:** Proposed implementation sequence. User confirmed that each dashboard chooses its source documents, sheets, planners and research, and selected completed-instruction voice edits. Automatic local updates are the proposed v1 behavior.

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
| `features/dashboard/dashboard.types.ts` | Dashboard, source bindings, widget definitions and value-state union. |
| `features/dashboard/dashboard-bindings.ts` | Validate source types, membership, range shapes and units. |
| `features/dashboard/dashboard-selectors.ts` | Pure widget calculations from workspace plus injected clock. |
| `features/dashboard/dashboard-freshness.ts` | Document revisions/research fingerprints for summaries. |
| `features/voice/dashboard-tools.ts` | Dashboard tool schemas and executor. |
| `components/talkos/DashboardWorkspace.tsx` | Dashboard list, source selection, title/date and layout editor. |
| `components/talkos/DashboardWidget.tsx` | Widget type switch, provenance, freshness and error states. |
| `components/talkos/DashboardChart.tsx` | Grouped bar chart and equivalent accessible data table. |

Modify workspace types/model/storage, Planner workspace and task schemas, agent tool registry/prompt, tool-to-tab mapping, workspace navigation, runtime source navigation, styles and existing tests. Keep new dashboard logic out of the large central tool dispatcher except registration/delegation.

## Task 1: Add dashboard artifacts and explicit source contracts

**Files:** Create `dashboard.types.ts`, `dashboard-bindings.ts`, `dashboard-bindings.test.ts`; extend workspace types/model/storage and lifecycle tests.

**Interfaces:** Export `WorkspaceDashboard` with ID/title/revision/time, selected typed source references, optional launch date/timezone, and widget definitions. Snapshot v4 adds `dashboards` and `activeDashboardId`. Source membership is explicit, not determined by titles or active tabs.

```ts
type DashboardSource =
  | { kind: 'document'; id: string }
  | { kind: 'sheet'; id: string }
  | { kind: 'planner'; id: string }
  | { kind: 'research'; id: string };

type WidgetState<T> =
  | { status: 'ready'; value: T; sourceLabel: string }
  | { status: 'empty'; reason: string }
  | { status: 'missing'; reason: string }
  | { status: 'invalid'; reason: string }
  | { status: 'stale'; value: T; reason: string };
```

- [ ] Define a discriminated widget union for metric, progress, deadline, task list, bar chart and sourced summary. Every widget has a stable ID, title and grid size/order. Numerical widgets contain a whitelisted binding recipe; never executable expressions supplied by the agent.
- [ ] Define binding kinds for task completion/count/blocked/high-risk/overdue, sheet sum/budget comparison, category aggregation, deadline and source summary. Planner recipes require explicit planner IDs; sheet recipes require exact A1 ranges and currency where relevant.
- [ ] Implement creation/edit/rename/duplicate/trash/restore through shared lifecycle/history helpers. Dashboard duplication keeps source references and remaps widget IDs; it does not copy source artifacts.
- [ ] Add v3-to-v4 migration and preserve v1/v2 migration chains. Backfill only empty dashboard arrays; never infer source membership, budgets or deadlines from legacy prose.
- [ ] Validate at most 50 widgets/dashboard and 50 selected sources, unique widget IDs, selected-source membership, widget size presets and binding types. Preserve orphaned existing bindings as missing states when sources are later removed.
- [ ] Test migration preserving Canvas assets/history; dashboard lifecycle; duplicate widget IDs; cross-type source IDs; and a deleted source restored from trash.

**Acceptance:** Dashboard definitions round-trip without storing model-invented metrics or disrupting existing artifacts.

## Task 2: Add explicit blocker and risk data to Planner

**Files:** Modify `features/workspace/workspace.types.ts`, `components/talkos/PlannerWorkspace.tsx`, `features/voice/research-tools.ts`, planner exports and relevant tests.

**Interfaces:** Add optional `blockedReason?: string` and `riskLevel?: 'low' | 'medium' | 'high'` to `PlannerTask`. Completion remains the existing boolean. JSON tool fields are `blocked_reason` and `risk_level`.

- [ ] Add manual controls for blocked reason and risk assessment, including “Not assessed.” Marking complete excludes the task from active blocker/high-risk counts without deleting its metadata.
- [ ] Extend read/create/update Planner tool schemas and parser; prevent full-task replacements from silently dropping omitted optional metadata for matching IDs. Clearing requires an explicit empty blocked reason or null risk input, normalized to an absent optional property.
- [ ] Preserve metadata in workspace JSON; add columns to Planner CSV and include readable details in ICS descriptions. Update export tests for correct escaping.
- [ ] Test metadata survives ordinary completion/date/title edits and agent updates, explicit clearing works, and old tasks remain unassessed.
- [ ] Run `npm test -- --run features/workspace features/voice/research-tools.test.ts` plus Planner component tests.

**Acceptance:** Blocked/high-risk dashboard counts have inspectable underlying data editable by voice and manually.

## Task 3: Implement trustworthy live calculations

**Files:** Create `dashboard-selectors.ts`, `dashboard-selectors.test.ts`, `dashboard-freshness.ts`, `dashboard-freshness.test.ts`; complete binding validation.

**Interfaces:** `resolveDashboardWidget(workspace, dashboard, widgetId, now)` returns `WidgetState` for that widget. `now` is an injected `Date`, not a hidden global clock. Cache sheet evaluation per sheet revision; no model calls during rendering.

- [ ] Calculate progress using completed/total selected tasks, remaining count, explicit blockers/high-risk and overdue counts. Deduplicate repeated planner/task identities. With zero tasks show empty rather than a misleading percentage.
- [ ] Use `evaluateSheet` for selected numeric cells. Exclude header rows by explicit range selection. Skip empty cells in sums, but report nonnumeric nonempty values and formula errors. Do not convert `#REF!`, `#CYCLE!` or text to zero.
- [ ] Implement spending/category aggregation on equal-height column ranges; trim category labels, group repeated labels, and display uncategorized amounts as “Uncategorized.” Reject inconsistent ranges and non-finite numeric values.
- [ ] Compute budget amount and percentage only with a numeric budget > 0; retain negative spending/refunds as explicit values. Do not infer currency from symbol text or add mixed units. No automatic currency conversion.
- [ ] Calculate calendar-day deadlines using the dashboard timezone, including DST crossings, today and overdue dates. Invalid dates/timezones produce invalid states.
- [ ] Implement document-summary freshness using revision and research-summary freshness using a stable fingerprint of relevant content/membership. Missing sources are missing; changed sources are stale. Sourced prose retains citations and is refreshed only through an explicit tool operation.
- [ ] Add exact fixtures: 3/4 completed gives 75%; zero tasks gives empty; category amounts 100+50 give 150; an invalid formula gives invalid; editing a document marks its summary stale; deleting a sheet gives missing; restoring it resolves again.
- [ ] Run `npm test -- --run features/dashboard` and `npm run typecheck`.

**Acceptance:** The same inputs always produce the same metrics; missing data, calculation failures and stale interpretation remain distinguishable.

## Task 4: Build the editable Dashboard tab

**Files:** Create `DashboardWorkspace.tsx`, `DashboardWidget.tsx`, `DashboardChart.tsx` and component tests; modify Workspace navigation, runtime source navigation and styles.

**Interfaces:** Workspace props follow `{ workspace, onChange }` plus a typed source-opening callback. Source navigation selects both the destination tab and artifact/collection ID. Widget renderers consume resolved data and never modify source artifacts.

- [ ] Add Dashboard navigation and the existing artifact rail/actions pattern. Show an honest blank state with Create dashboard and source-selection controls.
- [ ] Add a source chooser grouped by Documents, Sheets, Planner and Research; store exact references, label missing selected sources and let users replace bindings. Show optional launch date/timezone separately from inferred planner dates.
- [ ] Render responsive widgets with compact/full-width presets, move earlier/later controls, edit title/binding and remove. Every edit is a revisioned definition change. Add keyboard-reachable source links and the method behind each metric.
- [ ] Recompute widgets when referenced artifact revisions/content change. Recompute date widgets on local date rollover and browser focus. Dispose timers/listeners on unmount. Avoid writing recalculated metric values back into IndexedDB.
- [ ] Provide bar charts with a zero baseline, labels and an equivalent data table; preserve negative amounts. Never display a time-series trend from a single current snapshot.
- [ ] Test source sheet edits update amount/chart without calling the agent, undoing that sheet edit updates them again, summary staleness is visible and missing-source links never navigate to unrelated active files.
- [ ] Inspect compact layout, themes, focus order, chart legibility and empty/error states in the browser.

**Acceptance:** A user can manually assemble a useful dashboard that updates as its linked workspace data changes.

## Task 5: Let the agent compose and edit dashboards

**Files:** Create `features/voice/dashboard-tools.ts` and tests; extend tool registry/prompt, `get_workspace`, tool-to-tab map and atomic mutation schemas.

**Interfaces:** Use existing `ResearchToolCall`, `WorkspaceRuntime`, `AbortSignal` and `ResearchToolExecution`. Register `create_dashboard`, `read_dashboard`, and `edit_dashboard`. Read returns definition, revision, resolved values, provenance and unresolved bindings.

- [ ] Creation requires title, explicit selected sources and bounded widget definitions. Editing requires dashboard ID/revision and operations to add/update/remove widgets, change source membership or change title/date/layout.
- [ ] Instruct the model to inspect/read sources, ask when project/budget selection is ambiguous, and build only supported bindings. “Build me a dashboard” does not authorize fabricating unavailable risk/budget figures.
- [ ] Reuse call-ID deduplication and cancellation safeguards. Re-read current workspace before committing; atomic multi-artifact changes must validate all revisions and binding references against their final draft state.
- [ ] Implement “Add a chart showing spending by category” as a bound widget creation. Missing category/amount data returns an actionable requirement; adding a chart alone does not rewrite the sheet.
- [ ] Test generated definitions rather than only tool registration: create → read resolved metrics → edit sheet → read updated metrics → add category chart → undo dashboard edit. Test invalid widget recipes, stale revisions, cancelled execution and sources removed during a request.
- [ ] Run `npm test -- --run features/dashboard features/voice features/workspace`.

**Acceptance:** Agent-produced widgets are inspectable definitions whose values remain connected to real sources.

## Task 6: Finish the integrated demonstration and regression checks

**Files:** Complete component/integration tests and update README/Product/Design documentation.

- [ ] Use deterministic fixtures to demonstrate remaining tasks, blocked tasks, task-completion percentage, budget usage, launch countdown, category spending and cited findings. Clearly label fixture data in tests/demo setup; ordinary empty workspaces must not display it.
- [ ] Confirm JSON export/import includes dashboards and bindings alongside all other artifacts. Deleting/restoring linked artifacts updates missing-source states without losing widget configuration.
- [ ] Run `npm run lint`, `npm run typecheck`, `npm test -- --run`, and `npm run build`. Record actual results and any remaining provider/browser limitations.
- [ ] In a real configured voice session, create a dashboard, add a chart, change a linked budget sheet, mark a task blocked, and undo. Verify numerical updates happen locally and source links point to the exact records.

## Demonstration that defines completion

Select a project brief, budget sheet, task planner and research collection. Say “Build me a dashboard for this project,” then “Add a chart showing spending by category.” Edit a spending cell and complete a task manually; watch the bound widgets update without another agent call. Open a widget's source, remove and restore that source, revise the brief to show a stale summary, undo a dashboard edit, and reload. The dashboard must retain its configuration and remain truthful at every step.
