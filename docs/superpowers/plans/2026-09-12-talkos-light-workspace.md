# TalkOS Light Workspace Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild TalkOS as a polished light, split-pane voice workspace while preserving and exposing its real AssemblyAI workflow.

**Architecture:** Keep the existing reducer, demo controller, and AssemblyAI adapter as the source of behavior. Recompose the React shell around a conversation rail and a multi-view workspace, adding only small pure utilities for export and presentation state.

**Tech Stack:** Next.js 16, React 19, TypeScript, Vitest, Testing Library, CSS

**Spec:** `docs/superpowers/specs/2026-09-12-talkos-light-workspace-design.md`

## Global Constraints

- Live voice is the primary action; demo mode is a labeled fallback.
- Preserve interruption, transcript, evidence, notes, and accessible controls.
- Do not claim unrestricted browser automation or live web search.
- No gradients, glass, glow, fake metrics, or generic card mosaics.

---

### Task 1: Workspace behavior

**Files:**
- Modify: `features/session/session.types.ts`
- Modify: `features/session/session.reducer.ts`
- Modify: `components/talkos/Workspace.tsx`
- Test: `components/talkos/talkos.test.tsx`

**Interfaces:**
- Consumes: `SessionState`, `SessionEvent`
- Produces: accessible Preview, Plan, Evidence, Notes, and Settings tabs

- [ ] Add failing component tests for all workspace tabs and state-backed content.
- [ ] Run the focused test and confirm the missing tabs fail.
- [ ] Extend the workspace view union and render each real session view.
- [ ] Run the focused test and confirm it passes.

### Task 2: Live-first shell and export

**Files:**
- Modify: `components/talkos/TalkOSApp.tsx`
- Modify: `components/talkos/VoicePanel.tsx`
- Create: `features/session/export-brief.ts`
- Test: `features/session/export-brief.test.ts`
- Test: `components/talkos/talkos.test.tsx`

**Interfaces:**
- Consumes: `DecisionBrief`, `Evidence[]`
- Produces: `serializeDecisionBrief(brief, evidence): string` and a live-first command surface

- [ ] Add failing tests for Markdown serialization and the live-first/fallback controls.
- [ ] Run the focused tests and confirm expected failures.
- [ ] Implement serialization, browser download, and the revised application shell.
- [ ] Run the focused tests and confirm they pass.

### Task 3: Visual system and responsive behavior

**Files:**
- Modify: `app/globals.css`
- Modify: `app/layout.tsx`
- Modify: `DESIGN.md`
- Modify: `.impeccable/surfaces/app-page-tsx.md`

**Interfaces:**
- Consumes: the semantic class names from Tasks 1–2
- Produces: the reference-matched light desktop and mobile compositions

- [ ] Replace the incumbent dark tokens and layout with the approved light visual contract.
- [ ] Add complete hover, focus, disabled, empty, active, interrupted, error, and reduced-motion states.
- [ ] Update durable design and surface documentation from the shipped result.

### Task 4: Verify and visually inspect

**Files:**
- Inspect: all changed source files
- Artifacts: `output/playwright/`

**Interfaces:**
- Consumes: production build
- Produces: verified desktop/mobile UI and mechanical design report

- [ ] Run lint, type checking, tests, and production build.
- [ ] Run the Impeccable detector once over changed UI targets.
- [ ] Inspect desktop and mobile renders in one bounded browser pass.
- [ ] Apply one consolidated correction batch if needed and confirm once.
