# TalkOS Winning Demo Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a polished, testable TalkOS prototype that demonstrates live voice collaboration, immediate interruption, visible replanning, controlled evidence research, and a cited vendor decision brief.

**Architecture:** A Next.js App Router client renders normalized state from a pure session reducer. A deterministic demo transport and a live AssemblyAI adapter emit the same event union, while a server-only route mints short-lived AssemblyAI credentials. Browser and Notes views are projections of session state rather than independent stores.

**Tech Stack:** Next.js, React, TypeScript, CSS Modules/global CSS, Vitest, Testing Library, Lucide React, AssemblyAI Voice Agent browser protocol.

**Spec:** `docs/superpowers/specs/2026-09-12-talkos-demo-design.md`

## Global Constraints

- The primary workflow is vendor evaluation for a startup or procurement team.
- AssemblyAI must power the live voice session, transcript, turn detection, interruption, and tool-calling loop.
- The prototype remains read-only and never performs consequential external actions.
- Demo mode must complete without credentials or external research dependencies.
- The browser receives only short-lived AssemblyAI credentials; `ASSEMBLYAI_API_KEY` remains server-only.
- The judged flow must complete in under 90 seconds.
- Never expose chain-of-thought; show only concise plans, actions, observations, and user-visible rationale.

---

### Task 1: Project foundation and render contract

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `next.config.ts`
- Create: `vitest.config.ts`
- Create: `vitest.setup.ts`
- Create: `app/layout.tsx`
- Create: `app/page.tsx`
- Create: `app/globals.css`
- Create: `app/page.test.tsx`
- Create: `.gitignore`
- Create: `.env.example`

**Interfaces:**
- Produces: a Next.js App Router application and Vitest browser-like test environment.
- Produces: default `HomePage(): JSX.Element` containing the TalkOS product heading and demo entry control.

- [ ] **Step 1: Add package and test configuration**

Create scripts `dev`, `build`, `start`, `lint`, `typecheck`, and `test`; configure Vitest with `jsdom`, `vitest.setup.ts`, and the `@/*` alias. Add `.env*` to `.gitignore` while preserving `.env.example`.

- [ ] **Step 2: Write the failing page test**

```tsx
import { render, screen } from "@testing-library/react";
import HomePage from "./page";

it("presents TalkOS and a demo entry control", () => {
  render(<HomePage />);
  expect(screen.getByRole("heading", { name: /talkos/i })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /run the demo/i })).toBeInTheDocument();
});
```

- [ ] **Step 3: Run the test and confirm RED**

Run: `npm test -- app/page.test.tsx`

Expected: FAIL because the page implementation and control do not exist.

- [ ] **Step 4: Implement the minimal application shell**

Create semantic `html`/`body` metadata in `layout.tsx`, render the TalkOS heading and disabled-neutral demo button in `page.tsx`, and add a minimal reset in `globals.css`.

- [ ] **Step 5: Run the test and confirm GREEN**

Run: `npm test -- app/page.test.tsx`

Expected: one passing test.

- [ ] **Step 6: Commit**

```powershell
git add -- package.json tsconfig.json next.config.ts vitest.config.ts vitest.setup.ts app .gitignore .env.example
git commit -m "chore: scaffold TalkOS application"
```

### Task 2: Deterministic session reducer and interruption semantics

**Files:**
- Create: `features/session/session.types.ts`
- Create: `features/session/session.reducer.ts`
- Create: `features/session/session.fixtures.ts`
- Create: `features/session/session.reducer.test.ts`

**Interfaces:**
- Produces: `SessionState`, `SessionEvent`, `VoiceState`, `Activity`, `Evidence`, `DecisionBrief`, and `sessionReducer(state, event)`.
- Produces: `initialSessionState` with `mode: "demo"`, `voiceState: "idle"`, empty history, and Browser active.
- Rule: `ACTION_INTERRUPTED` records the action ID in `invalidatedActionIds`; later completion for that ID is ignored.

- [ ] **Step 1: Define the wished-for reducer behavior in failing tests**

```ts
it("interrupts the active action and rejects its stale completion", () => {
  const acting = reduce(initialSessionState, [
    event("ACTION_STARTED", { action: action("search-1", "Searching provider docs") }),
    event("INTERRUPTED", { actionId: "search-1", constraint: "Use official sources only" }),
  ]);
  const stale = sessionReducer(acting, event("ACTION_COMPLETED", { actionId: "search-1" }));
  expect(stale.activities.find(item => item.id === "search-1")?.status).toBe("interrupted");
  expect(stale.constraints).toContain("Use official sources only");
});

it("stores evidence and activates Notes when a brief is written", () => {
  const state = sessionReducer(initialSessionState, event("BRIEF_WRITTEN", { brief: decisionBrief }));
  expect(state.activeWorkspace).toBe("notes");
  expect(state.brief?.recommendation).toMatch(/Supabase/);
});
```

- [ ] **Step 2: Run the reducer tests and confirm RED**

Run: `npm test -- features/session/session.reducer.test.ts`

Expected: FAIL because the reducer modules do not exist.

- [ ] **Step 3: Implement types, fixtures, and the pure reducer**

Use a discriminated `SessionEvent` union for connection, transcript, voice-state, plan, action, evidence, interruption, brief, workspace, reset, and stop events. Keep all state transitions immutable and ignore empty finalized turns.

- [ ] **Step 4: Run the reducer tests and confirm GREEN**

Run: `npm test -- features/session/session.reducer.test.ts`

Expected: all reducer tests pass with no warnings.

- [ ] **Step 5: Commit**

```powershell
git add -- features/session
git commit -m "feat: model interruptible research sessions"
```

### Task 3: Scripted demo transport

**Files:**
- Create: `features/demo/vendor-evidence.ts`
- Create: `features/demo/demo-script.ts`
- Create: `features/demo/demo-controller.ts`
- Create: `features/demo/demo-controller.test.ts`

**Interfaces:**
- Consumes: `SessionEvent` from Task 2.
- Produces: `createDemoController(emit, scheduler)` with `start()`, `interrupt()`, `finish()`, and `dispose()`.
- Produces: curated Supabase/Firebase evidence with valid official-source URLs and an explicit `demoData: true` marker.

- [ ] **Step 1: Write failing controller tests with a fake scheduler**

```ts
it("emits a revised plan after interruption and never completes the cancelled action", () => {
  const events: SessionEvent[] = [];
  const controller = createDemoController(events.push.bind(events), fakeScheduler);
  controller.start();
  fakeScheduler.advanceBy(2600);
  controller.interrupt("Use official sources. Prioritize compliance and pricing under $100.");
  fakeScheduler.runAll();
  expect(events.some(isPlanRevised)).toBe(true);
  expect(events.some(event => completes(event, "search-initial"))).toBe(false);
});
```

- [ ] **Step 2: Run the controller tests and confirm RED**

Run: `npm test -- features/demo/demo-controller.test.ts`

Expected: FAIL because the controller does not exist.

- [ ] **Step 3: Implement one cancellable scripted sequence**

Emit realistic partial transcripts, finalized turns, plan items, actions, official-source evidence, and a decision brief. Store every scheduled handle and cancel pending handles during interruption or disposal.

- [ ] **Step 4: Run the controller tests and confirm GREEN**

Run: `npm test -- features/demo/demo-controller.test.ts`

Expected: all demo controller tests pass.

- [ ] **Step 5: Commit**

```powershell
git add -- features/demo
git commit -m "feat: add reliable interruptible demo sequence"
```

### Task 4: Analyst cockpit interface

**Files:**
- Create: `components/talkos/TalkOSApp.tsx`
- Create: `components/talkos/VoicePanel.tsx`
- Create: `components/talkos/VoiceOrb.tsx`
- Create: `components/talkos/Transcript.tsx`
- Create: `components/talkos/ActivityTimeline.tsx`
- Create: `components/talkos/Workspace.tsx`
- Create: `components/talkos/EvidenceBrowser.tsx`
- Create: `components/talkos/DecisionNotes.tsx`
- Create: `components/talkos/talkos.test.tsx`
- Modify: `app/page.tsx`
- Modify: `app/globals.css`

**Interfaces:**
- Consumes: reducer state and demo controller from Tasks 2–3.
- Produces: accessible controls named `Run the demo`, `Interrupt agent`, `Stop session`, `Browser`, and `Notes`.
- Produces: desktop 30/70 layout and compact stacked layout below 800px.

- [ ] **Step 1: Write failing interaction tests**

```tsx
it("shows the revised constraint after the user interrupts", async () => {
  render(<TalkOSApp controllerFactory={instantDemoController} />);
  await userEvent.click(screen.getByRole("button", { name: /run the demo/i }));
  await userEvent.click(screen.getByRole("button", { name: /interrupt agent/i }));
  expect(await screen.findByText(/official sources/i)).toBeVisible();
  expect(screen.getByText(/plan revised/i)).toBeVisible();
});

it("allows keyboard users to switch between Browser and Notes", async () => {
  render(<TalkOSApp controllerFactory={completedDemoController} />);
  await userEvent.click(screen.getByRole("tab", { name: /notes/i }));
  expect(screen.getByRole("tabpanel", { name: /notes/i })).toBeVisible();
});
```

- [ ] **Step 2: Run the component tests and confirm RED**

Run: `npm test -- components/talkos/talkos.test.tsx`

Expected: FAIL because the cockpit components do not exist.

- [ ] **Step 3: Implement semantic components and reducer wiring**

Render finalized dialogue separately from the live partial transcript. Use `aria-live="polite"` for status and activity changes, proper tab semantics for the workspace, and visible focus states for every interactive control.

- [ ] **Step 4: Apply the approved visual system**

Define CSS custom properties for warm black, ivory, muted gray, citron, warning coral, borders, spacing, and type scale. Use a distinctive display face with a robust system fallback, restrained functional motion, `prefers-reduced-motion`, and no decorative gradients.

- [ ] **Step 5: Run component and reducer tests and confirm GREEN**

Run: `npm test`

Expected: all tests pass with no React accessibility or update warnings.

- [ ] **Step 6: Commit**

```powershell
git add -- app components
git commit -m "feat: build TalkOS analyst cockpit"
```

### Task 5: AssemblyAI live adapter and secure token route

**Files:**
- Create: `features/voice/voice-adapter.types.ts`
- Create: `features/voice/assemblyai-adapter.ts`
- Create: `features/voice/assemblyai-adapter.test.ts`
- Create: `app/api/voice-token/route.ts`
- Create: `app/api/voice-token/route.test.ts`
- Modify: `components/talkos/TalkOSApp.tsx`
- Modify: `.env.example`

**Interfaces:**
- Produces: `VoiceAdapter` with `connect(emit)`, `startListening()`, `stopListening()`, `interrupt()`, and `disconnect()`.
- Produces: `POST /api/voice-token`, returning `{ token: string; expiresInSeconds: number }` or `{ error: "voice_not_configured" }`.
- Consumes: `ASSEMBLYAI_API_KEY` and `ASSEMBLYAI_AGENT_ID` only on the server.

- [ ] **Step 1: Write failing route and event-normalization tests**

```ts
it("returns a typed configuration error without exposing environment values", async () => {
  const response = await POST(new Request("http://localhost/api/voice-token", { method: "POST" }));
  expect(response.status).toBe(503);
  expect(await response.json()).toEqual({ error: "voice_not_configured" });
});

it("maps a final user turn to TALK_TURN_FINALIZED", () => {
  expect(normalizeVoiceEvent({ type: "Turn", role: "user", transcript: "Compare vendors", end_of_turn: true }))
    .toMatchObject({ type: "TALK_TURN_FINALIZED", speaker: "user", text: "Compare vendors" });
});
```

- [ ] **Step 2: Run voice tests and confirm RED**

Run: `npm test -- features/voice/assemblyai-adapter.test.ts app/api/voice-token/route.test.ts`

Expected: FAIL because the adapter and route do not exist.

- [ ] **Step 3: Implement the server route and adapter boundary**

Generate the temporary browser credential through AssemblyAI's current documented endpoint, abort after ten seconds, map non-OK responses to `voice_unavailable`, and never include the API key in logs or responses. Normalize live events before dispatching them to the reducer.

- [ ] **Step 4: Add live/demo mode selection to the UI**

Start in demo mode when configuration is unavailable. When live configuration exists, expose a `Live voice` control, handle microphone denial, and preserve the current session if the adapter disconnects.

- [ ] **Step 5: Run voice and full tests and confirm GREEN**

Run: `npm test`

Expected: all tests pass and the missing-key route test confirms no secret leakage.

- [ ] **Step 6: Commit**

```powershell
git add -- features/voice app/api components/talkos/TalkOSApp.tsx .env.example
git commit -m "feat: connect secure AssemblyAI voice sessions"
```

### Task 6: End-to-end verification and visual QA

**Files:**
- Create: `README.md`
- Modify: UI files only when the bounded visual inspection identifies defects.

**Interfaces:**
- Consumes: the completed application.
- Produces: setup, demo, environment, architecture, and judging-demo instructions.

- [ ] **Step 1: Document exact local and demo operation**

Document `npm install`, `npm run dev`, demo mode, live environment variables, test commands, the 60–90 second judging script, and the read-only safety boundary.

- [ ] **Step 2: Run automated verification**

Run: `npm run lint`

Run: `npm run typecheck`

Run: `npm test -- --run`

Run: `npm run build`

Expected: every command exits 0 with no test failures or TypeScript errors.

- [ ] **Step 3: Perform one desktop/mobile visual inspection**

Run the production-equivalent app and capture the initial, interrupted, and completed states at 1440×900 and 390×844. Check overflow, hierarchy, legibility, focus, motion, empty states, and whether the interruption is understandable without narration.

- [ ] **Step 4: Apply one consolidated defect-fix batch and confirm once**

Change only defects observed in Step 3, rerun affected tests and build, then capture one final desktop/mobile confirmation set.

- [ ] **Step 5: Commit**

```powershell
git add -- README.md app components features
git commit -m "docs: finalize TalkOS demo experience"
```

