# TalkOS Live Voice Workspace Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make TalkOS visibly voice-first with a live AssemblyAI transcript, immediate redirect handling, useful Follow Agent navigation, developer telemetry, and quieter contained drawers.

**Architecture:** The AssemblyAI adapter remains the single event boundary. It emits normalized session events plus a separate bounded telemetry stream, while pure helpers accumulate transcript deltas and map tool calls to workspace views. TalkOSApp coordinates Follow Agent and passes focused presentation data to the voice rail and Activity drawer.

**Tech Stack:** Next.js, React, TypeScript, AssemblyAI Voice Agent WebSocket events, Vitest, Testing Library, CSS.

**Spec:** `docs/superpowers/specs/2026-09-12-talkos-live-voice-workspace-design.md`

**Status:** Implemented and verified on 2026-09-12. All 95 tests, typecheck, lint, production build, and bounded browser QA passed.

## Global Constraints

- Keep Documents, Sheets, Planner, Research, and Settings; do not add applications.
- Show only the current live exchange in the voice rail; keep complete conversation history in History.
- Use only real AssemblyAI messages and local receipt timestamps for Developer Mode telemetry.
- Stop playback, abort active tools, discard queued results, and invalidate stale generations at speech start.
- Follow Agent is visible and enabled by default; a manual tab selection pauses it.
- Activity remains inside the canvas; History remains inside the voice rail.
- Activity uses a white control in light theme and a black control in dark theme.
- UI copy must not contain em dashes.
- Preserve the existing secure token endpoint, workspace persistence, tool execution, export, undo, and research deletion behavior.
- Do not introduce new runtime dependencies.

---

## File structure

- Create `components/talkos/LiveTranscript.tsx`: current-exchange presentation only.
- Create `features/voice/voice-telemetry.ts`: telemetry types, bounded event reducer, and latency derivation.
- Create `features/voice/voice-telemetry.test.ts`: pure telemetry behavior.
- Create `features/voice/tool-workspace.ts`: pure tool-name to workspace mapping.
- Create `features/voice/tool-workspace.test.ts`: mapping coverage.
- Modify `features/session/session.types.ts`: partial transcript fragment semantics and interruption event shape.
- Modify `features/session/session.reducer.ts`: accumulate partials and handle provisional interruption.
- Modify `features/session/session.reducer.test.ts`: transcript and interruption regressions.
- Modify `features/voice/voice-adapter.types.ts`: telemetry listener interface.
- Modify `features/voice/assemblyai-adapter.ts`: telemetry emission, immediate cancellation, authoritative confirmation, and early workspace switching.
- Modify `features/voice/assemblyai-adapter.test.ts`: event, cancellation, stale result, telemetry, and navigation behavior.
- Modify `features/voice/research-tools.ts`: make latest completed user direction authoritative in the live prompt.
- Modify `components/talkos/TalkOSApp.tsx`: telemetry state and Follow Agent policy.
- Modify `components/talkos/VoicePanel.tsx`: compose orb, live transcript, errors, and History.
- Modify `components/talkos/VoiceOrb.tsx`: compact circular voice control.
- Modify `components/talkos/Transcript.tsx`: left-entry and left-exit History lifecycle.
- Modify `components/talkos/ActivityDrawer.tsx`: single left-side toggle and Developer Mode.
- Modify `components/talkos/Workspace.tsx`: pass toggle into the drawer header and keep it in the canvas.
- Modify `components/talkos/talkos.test.tsx`: integrated UI behavior.
- Modify `app/globals.css`: layout, theme, motion, drawer, transcript, and canvas polish.

---

### Task 1: Streaming Transcript State and Presentation

**Files:**
- Create: `components/talkos/LiveTranscript.tsx`
- Modify: `features/session/session.types.ts`
- Modify: `features/session/session.reducer.ts`
- Modify: `features/session/session.reducer.test.ts`
- Modify: `components/talkos/VoicePanel.tsx`
- Modify: `components/talkos/talkos.test.tsx`

**Interfaces:**
- Consumes: `SessionState.partialTranscript`, `SessionState.turns`, and `SessionState.voiceState`.
- Produces: `LiveTranscript({ partialTranscript, latestTurn, voiceState })` and accumulated partial text in the session reducer.

- [ ] **Step 1: Write failing reducer tests for fragment accumulation and speaker replacement**

```ts
it("accumulates transcript fragments from the same speaker", () => {
  const first = sessionReducer(initialSessionState, {
    type: "TRANSCRIPT_PARTIAL", speaker: "user", text: "Wait", at,
  });
  const second = sessionReducer(first, {
    type: "TRANSCRIPT_PARTIAL", speaker: "user", text: ", target developers", at,
  });
  expect(second.partialTranscript).toEqual({
    speaker: "user", text: "Wait, target developers",
  });
});

it("starts a new partial when the speaker changes", () => {
  const user = sessionReducer(initialSessionState, {
    type: "TRANSCRIPT_PARTIAL", speaker: "user", text: "Build it", at,
  });
  const agent = sessionReducer(user, {
    type: "TRANSCRIPT_PARTIAL", speaker: "agent", text: "I will", at,
  });
  expect(agent.partialTranscript).toEqual({ speaker: "agent", text: "I will" });
});
```

- [ ] **Step 2: Run the reducer tests and verify the same-speaker assertion fails because the current reducer replaces the fragment**

Run: `npm test -- features/session/session.reducer.test.ts --run`

Expected: the accumulated value is missing the first fragment.

- [ ] **Step 3: Implement fragment accumulation in the reducer**

```ts
case "TRANSCRIPT_PARTIAL": {
  const fragment = event.text;
  if (!fragment) return state;
  const text = state.partialTranscript?.speaker === event.speaker
    ? `${state.partialTranscript.text}${fragment}`
    : fragment;
  return { ...state, partialTranscript: { speaker: event.speaker, text } };
}
```

Keep final-turn handling unchanged: it trims the final text, clears the partial, and appends one durable turn.

- [ ] **Step 4: Run the reducer tests and verify they pass**

Run: `npm test -- features/session/session.reducer.test.ts --run`

Expected: all reducer tests pass.

- [ ] **Step 5: Write a failing component test for current live exchange visibility**

```tsx
it("shows the current live transcript and keeps older turns in History", async () => {
  render(<TalkOSApp voiceAdapterFactory={streamingVoiceFactory} />);
  await user.click(screen.getByRole("button", { name: /start voice agent/i }));
  expect(screen.getByRole("region", { name: /live voice transcript/i }))
    .toHaveTextContent("Wait, target developers");
  expect(screen.queryByText("Earlier answer")).not.toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: /history/i }));
  expect(screen.getByText("Earlier answer")).toBeVisible();
});
```

- [ ] **Step 6: Run the component test and verify the live transcript region is missing**

Run: `npm test -- components/talkos/talkos.test.tsx --run`

Expected: Testing Library cannot find the live voice transcript region.

- [ ] **Step 7: Create LiveTranscript and compose it into VoicePanel**

```tsx
export function LiveTranscript({ partialTranscript, latestTurn, voiceState }: Props) {
  const exchange = partialTranscript ?? latestTurn;
  return (
    <section className="live-transcript" aria-label="Live voice transcript" aria-live="polite">
      <span>{exchange?.speaker === "user" ? "You" : "TalkOS"}</span>
      <p>{exchange?.text ?? idleCopy[voiceState]}</p>
      {partialTranscript ? <small>Live transcription</small> : null}
    </section>
  );
}
```

Pass `turns.at(-1) ?? null` as `latestTurn`. Keep Transcript responsible only for the History button and drawer.

- [ ] **Step 8: Run focused component and reducer tests**

Run: `npm test -- features/session/session.reducer.test.ts components/talkos/talkos.test.tsx --run`

Expected: both files pass.

- [ ] **Step 9: Commit the transcript unit**

```bash
git add components/talkos/LiveTranscript.tsx components/talkos/VoicePanel.tsx components/talkos/talkos.test.tsx features/session/session.types.ts features/session/session.reducer.ts features/session/session.reducer.test.ts
git commit -m "feat: show live voice transcript"
```

---

### Task 2: AssemblyAI Telemetry and Developer Mode

**Files:**
- Create: `features/voice/voice-telemetry.ts`
- Create: `features/voice/voice-telemetry.test.ts`
- Modify: `features/voice/voice-adapter.types.ts`
- Modify: `features/voice/assemblyai-adapter.ts`
- Modify: `features/voice/assemblyai-adapter.test.ts`
- Modify: `components/talkos/TalkOSApp.tsx`
- Modify: `components/talkos/ActivityDrawer.tsx`
- Modify: `components/talkos/talkos.test.tsx`

**Interfaces:**
- Produces: `VoiceTelemetrySnapshot`, `recordVoiceTelemetry(snapshot, event, receivedAt)`, and `VoiceAdapter.setTelemetryListener(listener)`.
- Consumes: raw AssemblyAI event type, status, and local receipt time.

- [ ] **Step 1: Write failing pure tests for bounded events and derived latency**

```ts
it("derives endpoint and response latency from event receipt times", () => {
  let state = emptyVoiceTelemetry;
  state = recordVoiceTelemetry(state, { type: "input.speech.stopped" }, 1000);
  state = recordVoiceTelemetry(state, { type: "transcript.user", text: "Change it" }, 1125);
  state = recordVoiceTelemetry(state, { type: "reply.started" }, 1340);
  expect(state.endpointLatencyMs).toBe(125);
  expect(state.responseLatencyMs).toBe(215);
});

it("keeps only the forty most recent telemetry events", () => {
  const state = Array.from({ length: 45 }, (_, index) => index).reduce(
    (current, receivedAt) => recordVoiceTelemetry(current, { type: "session.ready" }, receivedAt),
    emptyVoiceTelemetry,
  );
  expect(state.events).toHaveLength(40);
  expect(state.events[0].receivedAt).toBe(5);
});
```

- [ ] **Step 2: Run the telemetry test and verify the module is missing**

Run: `npm test -- features/voice/voice-telemetry.test.ts --run`

Expected: import resolution fails for `voice-telemetry`.

- [ ] **Step 3: Implement telemetry types and reducer**

```ts
export interface VoiceTelemetrySnapshot {
  events: VoiceTelemetryEntry[];
  endpointLatencyMs: number | null;
  responseLatencyMs: number | null;
  lastEndpointAt: number | null;
  lastUserFinalAt: number | null;
}

export function recordVoiceTelemetry(
  snapshot: VoiceTelemetrySnapshot,
  event: AssemblyTelemetryEvent,
  receivedAt: number,
): VoiceTelemetrySnapshot {
  const events = [...snapshot.events, toEntry(event, receivedAt)].slice(-40);
  // input.speech.stopped starts endpoint timing, transcript.user ends it,
  // transcript.user starts response timing, and reply.started ends it.
  return deriveTimings({ ...snapshot, events }, event, receivedAt);
}
```

Use `null` for missing measurements. Store event names and short safe labels, not fabricated timing values.

- [ ] **Step 4: Run telemetry tests and verify they pass**

Run: `npm test -- features/voice/voice-telemetry.test.ts --run`

Expected: both telemetry tests pass.

- [ ] **Step 5: Write failing adapter and component tests for telemetry delivery and Developer Mode disclosure**

```ts
const telemetry = vi.fn();
adapter.setTelemetryListener?.(telemetry);
socket.dispatchEvent(message({ type: "input.speech.stopped" }));
socket.dispatchEvent(message({ type: "transcript.user", text: "Change it" }));
expect(telemetry).toHaveBeenLastCalledWith(expect.objectContaining({
  endpointLatencyMs: expect.any(Number),
}));
```

```tsx
await user.click(screen.getByRole("button", { name: /open activity sidebar/i }));
expect(screen.queryByText(/endpoint latency/i)).not.toBeInTheDocument();
await user.click(screen.getByRole("switch", { name: /developer mode/i }));
expect(screen.getByText(/assemblyai live/i)).toBeVisible();
expect(screen.getByText(/endpoint latency/i)).toBeVisible();
```

- [ ] **Step 6: Run focused tests and verify telemetry and Developer Mode are missing**

Run: `npm test -- features/voice/assemblyai-adapter.test.ts components/talkos/talkos.test.tsx --run`

Expected: `setTelemetryListener` or the Developer Mode switch is absent.

- [ ] **Step 7: Add the adapter listener and Developer Mode UI**

```ts
export interface VoiceAdapter {
  setTelemetryListener?(listener: (snapshot: VoiceTelemetrySnapshot) => void): void;
}
```

Record each parsed AssemblyAI message before normalization, then call the listener with the updated snapshot. TalkOSApp stores the snapshot and clears it on reset or stop. ActivityDrawer owns `developerMode` state and renders the metrics and recent event list only when enabled.

- [ ] **Step 8: Run telemetry, adapter, and component tests**

Run: `npm test -- features/voice/voice-telemetry.test.ts features/voice/assemblyai-adapter.test.ts components/talkos/talkos.test.tsx --run`

Expected: all selected tests pass.

- [ ] **Step 9: Commit the telemetry unit**

```bash
git add features/voice/voice-telemetry.ts features/voice/voice-telemetry.test.ts features/voice/voice-adapter.types.ts features/voice/assemblyai-adapter.ts features/voice/assemblyai-adapter.test.ts components/talkos/TalkOSApp.tsx components/talkos/ActivityDrawer.tsx components/talkos/talkos.test.tsx
git commit -m "feat: expose assemblyai developer telemetry"
```

---

### Task 3: Immediate Redirect and Stale Work Protection

**Files:**
- Modify: `features/session/session.types.ts`
- Modify: `features/session/session.reducer.ts`
- Modify: `features/session/session.reducer.test.ts`
- Modify: `features/voice/assemblyai-adapter.ts`
- Modify: `features/voice/assemblyai-adapter.test.ts`
- Modify: `features/voice/research-tools.ts`

**Interfaces:**
- Produces: `INTERRUPTION_STARTED` for immediate visible cancellation and `INTERRUPTED` for confirmed redirect text.
- Consumes: active tool controllers, action IDs, pending results, playback sources, and AssemblyAI interruption events.

- [ ] **Step 1: Write failing reducer tests for provisional and confirmed interruption**

```ts
it("marks active work interrupted before redirect text is final", () => {
  const active = sessionReducer(initialSessionState, startedAction);
  const interrupted = sessionReducer(active, {
    type: "INTERRUPTION_STARTED", actionId: "call-1", at,
  });
  expect(interrupted.voiceState).toBe("interrupted");
  expect(interrupted.invalidatedActionIds).toContain("call-1");
  expect(interrupted.constraints).toEqual([]);
});
```

- [ ] **Step 2: Run reducer tests and verify the new event is unsupported**

Run: `npm test -- features/session/session.reducer.test.ts --run`

Expected: the active action remains active.

- [ ] **Step 3: Add the provisional interruption event and reducer branch**

```ts
| (Timed & { type: "INTERRUPTION_STARTED"; actionId?: string })
```

The reducer marks the action interrupted, clears the partial agent transcript, and changes voice state without adding a generic constraint. Existing `INTERRUPTED` handling adds the finalized user redirect once.

- [ ] **Step 4: Write failing adapter tests for immediate playback stop, tool abort, pending-result discard, and confirmed telemetry**

```ts
socket.dispatchEvent(toolCall("call-old", "search_sources"));
socket.dispatchEvent(message({ type: "input.speech.started" }));
expect(emit).toHaveBeenCalledWith(expect.objectContaining({
  type: "INTERRUPTION_STARTED", actionId: "call-old",
}));
resolveOldTool();
await flushPromises();
expect(sentMessages(socket)).not.toContainEqual(expect.objectContaining({
  type: "tool.result", call_id: "call-old",
}));
socket.dispatchEvent(message({ type: "reply.done", status: "interrupted" }));
expect(telemetry).toHaveBeenLastCalledWith(expect.objectContaining({
  events: expect.arrayContaining([
    expect.objectContaining({ kind: "interruption_confirmed" }),
  ]),
}));
```

- [ ] **Step 5: Run adapter tests and verify the provisional event or confirmation distinction fails**

Run: `npm test -- features/voice/assemblyai-adapter.test.ts --run`

Expected: the current adapter emits only generic `INTERRUPTED` at speech start.

- [ ] **Step 6: Implement the two-stage interruption boundary**

At `input.speech.started` with playback or active work:

```ts
const actionId = [...activeActionIds].at(-1) ?? pendingResults.at(-1)?.callId;
stopPlayback();
generation += 1;
activeCalls.forEach((controller) => controller.abort());
activeCalls.clear();
activeActionIds.clear();
pendingResults = [];
emit({ type: "INTERRUPTION_STARTED", actionId, at: nowIso() });
```

At the next finalized user transcript associated with an interruption, emit `INTERRUPTED` with the actual transcript as the constraint. On `reply.done` with status `interrupted`, stop playback again and record confirmation. Keep generation checks before event emission and result queuing.

Update the system prompt with: `The newest completed user turn overrides any conflicting earlier instruction. When redirected, abandon stale tool results and replan from the correction.`

- [ ] **Step 7: Run reducer and adapter tests**

Run: `npm test -- features/session/session.reducer.test.ts features/voice/assemblyai-adapter.test.ts --run`

Expected: all selected tests pass.

- [ ] **Step 8: Commit the interruption unit**

```bash
git add features/session/session.types.ts features/session/session.reducer.ts features/session/session.reducer.test.ts features/voice/assemblyai-adapter.ts features/voice/assemblyai-adapter.test.ts features/voice/research-tools.ts
git commit -m "feat: make voice redirects immediate"
```

---

### Task 4: Follow Agent Workspace Navigation

**Files:**
- Create: `features/voice/tool-workspace.ts`
- Create: `features/voice/tool-workspace.test.ts`
- Modify: `features/voice/assemblyai-adapter.ts`
- Modify: `components/talkos/TalkOSApp.tsx`
- Modify: `components/talkos/talkos.test.tsx`

**Interfaces:**
- Produces: `workspaceForTool(toolName: string): Exclude<WorkspaceView, "settings"> | null`.
- Consumes: `WorkspaceRuntime.setActiveView` and TalkOSApp's human versus agent navigation policy.

- [ ] **Step 1: Write failing mapping tests**

```ts
it.each([
  ["create_document", "documents"],
  ["update_sheet", "sheets"],
  ["create_plan", "planner"],
  ["search_sources", "research"],
  ["get_workspace", null],
])("maps %s to %s", (tool, expected) => {
  expect(workspaceForTool(tool)).toBe(expected);
});
```

- [ ] **Step 2: Run the mapping test and verify the module is missing**

Run: `npm test -- features/voice/tool-workspace.test.ts --run`

Expected: import resolution fails for `tool-workspace`.

- [ ] **Step 3: Implement explicit tool groups**

```ts
const toolViews: Record<string, Exclude<WorkspaceView, "settings">> = {
  create_document: "documents",
  update_document: "documents",
  create_sheet: "sheets",
  update_sheet: "sheets",
  create_plan: "planner",
  update_plan: "planner",
  search_sources: "research",
  read_source: "research",
  summarize_sources: "research",
};

export const workspaceForTool = (name: string) => toolViews[name] ?? null;
```

Include every exact tool name exported by `workspaceTools`; unknown and read-only workspace tools return `null`.

- [ ] **Step 4: Run mapping tests and verify they pass**

Run: `npm test -- features/voice/tool-workspace.test.ts --run`

Expected: all mapping cases pass.

- [ ] **Step 5: Write failing adapter and UI tests for tool-start switching, manual pause, and resume**

```tsx
expect(screen.getByRole("button", { name: /follow agent/i })).toHaveAttribute("aria-pressed", "true");
emitToolCall("search_sources");
expect(screen.getByRole("tabpanel", { name: /research/i })).toBeVisible();
await user.click(screen.getByRole("tab", { name: /documents/i }));
emitToolCall("update_sheet");
expect(screen.getByRole("tabpanel", { name: /documents/i })).toBeVisible();
await user.click(screen.getByRole("button", { name: /follow agent/i }));
expect(screen.getByRole("tabpanel", { name: /sheets/i })).toBeVisible();
```

- [ ] **Step 6: Run focused tests and verify Follow Agent is not persistently visible or tool-start driven**

Run: `npm test -- features/voice/assemblyai-adapter.test.ts components/talkos/talkos.test.tsx --run`

Expected: the active Follow Agent button or immediate workspace switch is missing.

- [ ] **Step 7: Switch workspace at tool start and persist Follow Agent control**

In the adapter, call `runtime.setActiveView?.(workspaceForTool(message.name))` before executing the tool when the mapping is non-null. In TalkOSApp, track `lastAgentWorkspaceRef`, keep the Follow Agent button mounted with `aria-pressed`, disable following on human tab selection, and jump to the last requested agent workspace when re-enabled.

- [ ] **Step 8: Run mapping, adapter, and UI tests**

Run: `npm test -- features/voice/tool-workspace.test.ts features/voice/assemblyai-adapter.test.ts components/talkos/talkos.test.tsx --run`

Expected: all selected tests pass.

- [ ] **Step 9: Commit the navigation unit**

```bash
git add features/voice/tool-workspace.ts features/voice/tool-workspace.test.ts features/voice/assemblyai-adapter.ts features/voice/assemblyai-adapter.test.ts components/talkos/TalkOSApp.tsx components/talkos/talkos.test.tsx
git commit -m "feat: follow agent workspace activity"
```

---

### Task 5: Drawers, Circular Voice Visual, and Clutter Reduction

**Files:**
- Modify: `components/talkos/VoiceOrb.tsx`
- Modify: `components/talkos/Transcript.tsx`
- Modify: `components/talkos/ActivityDrawer.tsx`
- Modify: `components/talkos/Workspace.tsx`
- Modify: `components/talkos/TalkOSApp.tsx`
- Modify: `components/talkos/talkos.test.tsx`
- Modify: `app/globals.css`

**Interfaces:**
- Consumes: existing theme data attribute, `audioLevel`, `VoiceState`, `activityOpen`, and drawer callbacks.
- Produces: contained Activity and History drawers, one Activity toggle, and the new circular voice visual.

- [ ] **Step 1: Write failing component tests for Activity and History controls**

```tsx
await user.click(screen.getByRole("button", { name: /open activity sidebar/i }));
const drawer = screen.getByRole("complementary", { name: /activity drawer/i });
expect(within(drawer).queryByRole("button", { name: /close activity/i })).not.toBeInTheDocument();
expect(within(drawer).getByRole("button", { name: /hide activity sidebar/i })).toBeVisible();

await user.click(screen.getByRole("button", { name: /history/i }));
const history = screen.getByRole("complementary", { name: /conversation history/i });
await user.click(within(history).getByRole("button", { name: /close history/i }));
expect(history).toHaveAttribute("data-state", "closing");
```

Add an assertion that the voice control has a circular visual marker and that header export and session duration are absent.

- [ ] **Step 2: Run component tests and verify the separate Activity X, immediate History unmount, and robot visual fail the new expectations**

Run: `npm test -- components/talkos/talkos.test.tsx --run`

Expected: the new toggle placement, closing state, or circular marker is missing.

- [ ] **Step 3: Refactor Activity to use one toggle**

Pass `onToggle` into ActivityDrawer. When open, render this button first in the drawer header:

```tsx
<button className="activity-toggle activity-toggle--inside" type="button"
  onClick={onToggle} aria-label="Hide activity sidebar">
  <PanelRightClose size={17} />
</button>
```

Remove the X import and button. Render the outside `PanelRightOpen` button only while closed.

- [ ] **Step 4: Keep History mounted through a left-exit animation**

Use `historyMounted` and `historyState: "open" | "closing"`. Closing sets the state first; `onAnimationEnd` unmounts only when closing. Apply `aria-hidden` and `inert` during exit.

- [ ] **Step 5: Replace robot markup with an original circular visual**

```tsx
<span className="voice-sphere" aria-hidden="true">
  <span className="voice-sphere__ring" />
  <span className="voice-sphere__core" />
  <span className="voice-sphere__signal" />
</span>
```

Keep the button, state copy, state hint, disabled behavior, and CSS custom property for live level. Remove face, eye, body, and robot-ear markup.

- [ ] **Step 6: Apply the layout and theme CSS**

Use `var(--surface)` for the light Activity control and `#000` under `[data-theme="dark"]`. Use `var(--canvas)` for the drawer surface. Add distinct `historyIn` and `historyOut` keyframes that translate from and to `-100%`. Reduce the canvas dot alpha, give the live transcript the majority of the rail, keep the sphere compact, and honor `prefers-reduced-motion: reduce`.

Remove the global duration and export controls from TalkOSApp. Keep document export in DocumentWorkspace. Preserve setup, theme, Follow Agent, new session, and stop.

- [ ] **Step 7: Run component tests and TypeScript checking**

Run: `npm test -- components/talkos/talkos.test.tsx --run`

Run: `npm run typecheck`

Expected: component tests pass and TypeScript exits successfully.

- [ ] **Step 8: Commit the presentation unit**

```bash
git add components/talkos/VoiceOrb.tsx components/talkos/Transcript.tsx components/talkos/ActivityDrawer.tsx components/talkos/Workspace.tsx components/talkos/TalkOSApp.tsx components/talkos/talkos.test.tsx app/globals.css
git commit -m "feat: focus talkos on live voice work"
```

---

### Task 6: Full Verification and Visual QA

**Files:**
- Modify only files needed to correct failures discovered by the commands below, with a failing regression test before each behavior fix.

**Interfaces:**
- Consumes: all units from Tasks 1 through 5.
- Produces: verified application behavior at desktop and mobile widths.

- [ ] **Step 1: Run the full automated suite**

Run: `npm test -- --run`

Expected: every Vitest test passes with zero unhandled errors.

- [ ] **Step 2: Run static verification**

Run: `npm run typecheck`

Run: `npm run lint`

Expected: both commands exit with code 0 and no warnings.

- [ ] **Step 3: Run the production build**

Run: `npm run build`

Expected: Next.js completes a production build with exit code 0.

- [ ] **Step 4: Run the interface detector once**

Run the detector command from the `impeccable` skill against the finished interface and correct only actionable findings that apply to this project.

Expected: no unresolved detector findings for the changed surface.

- [ ] **Step 5: Perform bounded browser QA**

At desktop width, inspect light and dark themes with Activity closed and open. Verify the activity control is white in light and black in dark, Developer Mode remains off until enabled, and the drawer stays within the canvas.

At mobile width, inspect the stacked voice rail and workspace once. Verify History moves in from and out to the left, transcript text remains readable, header controls remain usable, and no horizontal overflow obscures the workspace.

- [ ] **Step 6: Re-run full verification after visual fixes**

Run: `npm test -- --run && npm run typecheck && npm run lint && npm run build`

Expected: all commands exit with code 0.

- [ ] **Step 7: Commit verified corrections if any were required**

```bash
git add app/globals.css components/talkos/VoiceOrb.tsx components/talkos/LiveTranscript.tsx components/talkos/Transcript.tsx components/talkos/ActivityDrawer.tsx components/talkos/VoicePanel.tsx components/talkos/Workspace.tsx components/talkos/TalkOSApp.tsx components/talkos/talkos.test.tsx features/session/session.types.ts features/session/session.reducer.ts features/session/session.reducer.test.ts features/voice/voice-adapter.types.ts features/voice/voice-telemetry.ts features/voice/voice-telemetry.test.ts features/voice/tool-workspace.ts features/voice/tool-workspace.test.ts features/voice/assemblyai-adapter.ts features/voice/assemblyai-adapter.test.ts features/voice/research-tools.ts
git commit -m "fix: verify live voice workspace"
```

Do not stage unrelated files. Omit this commit when Step 5 required no corrections.
