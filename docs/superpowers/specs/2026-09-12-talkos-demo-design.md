# TalkOS Winning Demo Design

## Product thesis

TalkOS is a live, voice-operated vendor-research workspace. A user can speak to an AI agent while watching it gather evidence, interrupt the agent at any moment, and see the active plan change before the agent continues. The session ends with an evidence-backed decision brief rather than an opaque answer.

The defining product moment is not voice-controlled browsing by itself. It is immediate, visible replanning after a spoken interruption.

## Hackathon objective

The prototype will optimize for a reliable 60–90 second judged demonstration across the event's four criteria:

- Application of Technology: AssemblyAI powers the live voice session, transcript, turn detection, interruption, and tool-calling loop.
- Presentation: the interface makes listening, speaking, acting, cancellation, and replanning visually legible without narration.
- Business Value: the primary workflow is vendor evaluation for a startup or procurement team.
- Originality: voice keeps the user inside an active computer-use loop instead of requiring a prompt-and-wait interaction.

## Primary demonstration

1. The user says, “Compare Supabase and Firebase for our startup.”
2. TalkOS acknowledges the request, creates a short plan, and begins collecting official-source evidence.
3. While the agent is working or speaking, the user says, “Wait—only use official sources. Prioritize compliance and pricing under $100.”
4. TalkOS stops the active response or action, marks it interrupted, and displays the new constraint.
5. The plan visibly changes and research resumes under the new constraints.
6. The user asks TalkOS to prepare a recommendation.
7. Notes displays a concise comparison with linked evidence and a recommendation; the agent summarizes it aloud.

## Scope

### Required

- Responsive two-panel application shell.
- AssemblyAI Voice Agent API browser integration using short-lived server-generated credentials.
- Explicit voice states: idle, connecting, listening, thinking, acting, speaking, interrupted, and error.
- Partial and final transcript rendering.
- Barge-in that cancels local speech/action presentation and revises the current plan.
- Tool-event protocol for search, opening evidence, extracting a finding, and writing a decision brief.
- Controlled evidence workspace with Browser and Notes views.
- Visible current plan and chronological activity history.
- A deterministic demo mode that exercises the complete interaction without credentials.
- Clear confirmation boundaries for any future consequential action; the prototype itself remains read-only.
- Keyboard-accessible controls and responsive desktop/mobile layouts.

### Excluded

- General desktop control.
- Arbitrary visual clicking.
- Authenticated websites.
- Terminal and file-system tools.
- Multiple agents or long-running autonomous jobs.
- User accounts, billing, and persistent cloud sessions.

## Experience design

### Visual direction

The interface is an “analyst cockpit”: precise, calm, and operational rather than a generic chat dashboard. A warm near-black canvas, restrained ivory text, and an electric citron accent create a recognizable identity. Fine rules, compact status typography, and editorial evidence cards make the product feel closer to a professional research instrument than a consumer chatbot.

The desktop composition dedicates roughly 30% of the viewport to the live voice session and 70% to the evidence workspace. On narrow screens, the workspace becomes the primary surface and the voice panel collapses into a compact top section without removing stop or microphone controls.

### Voice panel

The voice panel contains:

- Product identity and session status.
- A prominent state visualization and concise state label.
- Live partial transcript and finalized conversation turns.
- The current objective and constraints.
- A compact activity stream that distinguishes completed, active, interrupted, and pending work.
- Primary microphone control plus an always-available Stop control.

The user should understand what the agent heard and what changed within one glance. The interface will never expose chain-of-thought; it shows concise plans, tool actions, observations, and user-visible rationale only.

### Workspace

The workspace has two views:

- Browser: a controlled research surface showing queries, selected sources, extracted passages as paraphrased findings, source metadata, and live action focus.
- Notes: a structured decision brief containing requirements, comparison rows, linked evidence, caveats, and recommendation.

Browser is initially active. When the decision brief is written, Notes receives a visible update indicator and becomes active as part of the demo choreography.

### Interruption treatment

An interruption is represented as a first-class event:

- Agent audio and pending presentation timers stop immediately.
- The active action changes to interrupted rather than completed.
- The user's new transcript appears as a constraint update.
- The old plan is retained in history while the revised plan becomes current.
- A short “Plan revised” transition visually connects the spoken correction to the new actions.

Motion will be brief and functional. Reduced-motion preferences disable nonessential movement.

## Architecture

### Application

Use Next.js with TypeScript and React. The app is divided into focused feature modules:

- `voice`: AssemblyAI connection adapter, transcript normalization, and connection controls.
- `session`: deterministic reducer/state machine for conversation, plan, actions, and interruptions.
- `workspace`: Browser and Notes presentations driven entirely by session events.
- `demo`: scripted transport that emits the same normalized events as the live adapter.
- `api`: server-only endpoint for minting short-lived AssemblyAI browser credentials.

UI components consume normalized session state and do not depend directly on AssemblyAI event shapes. This keeps demo mode and live mode behaviorally consistent and makes core behavior testable without a network connection.

### Event model

The session reducer accepts a small discriminated event union, including:

- connection state changed
- partial transcript received
- turn finalized
- agent state changed
- plan created or revised
- tool action started, completed, failed, or interrupted
- evidence added
- decision brief written
- session stopped

Every event includes a stable identifier and timestamp. Reducer output is deterministic; side effects live in adapters and orchestration hooks.

### AssemblyAI integration

The live path uses AssemblyAI's Voice Agent API in the browser. A server route reads `ASSEMBLYAI_API_KEY` and returns only a short-lived credential or session token; the long-lived API key is never shipped to the browser.

AssemblyAI provides the conversational voice loop, turn handling, interruptions, and client/server tool calls. The app maps relevant WebSocket events into the normalized TalkOS event model. Credentials are optional for local UI review because demo mode remains fully operable.

### Controlled research tools

The hackathon build uses a constrained research tool contract rather than arbitrary browser automation:

- `search_sources(query, domains?)`
- `open_source(source_id)`
- `capture_finding(source_id, claim)`
- `write_decision_brief(requirements, findings)`

For the flagship demonstration, a curated provider dataset guarantees credible, repeatable evidence. The UI clearly labels demo data. A live HTTP-backed implementation may be added behind the same contract only if it does not compromise reliability.

## Error handling

- Missing AssemblyAI configuration opens in demo mode and explains how to enable live voice without presenting the app as broken.
- Microphone denial retains keyboard/demo controls and provides a focused recovery action.
- Connection failures preserve session history and offer reconnect or demo mode.
- Tool failures appear in the activity stream, leave completed evidence intact, and allow retry.
- Unsupported speech or empty turns do not revise the plan.
- Stale events from an interrupted action are ignored using action identifiers.

## Testing

- Unit-test the session reducer, especially stale-event rejection and interruption semantics.
- Component-test state visibility, workspace switching, and keyboard-accessible controls.
- Integration-test the full deterministic demo sequence from initial request through revised brief.
- Test the token endpoint's missing-configuration and success/error contracts without exposing secrets.
- Run lint, type checking, tests, and production build.
- Perform one bounded visual QA pass at desktop and mobile widths, apply one consolidated correction batch, then confirm once.

## Success criteria

- A first-time viewer understands “talk, watch, interrupt, redirect” within ten seconds.
- The judged demo completes from start to decision brief in under 90 seconds.
- Interruption feedback begins immediately and no stale action completes afterward.
- AssemblyAI's role is visible in both the running experience and submission explanation.
- The demo works without external research dependencies and degrades cleanly without API credentials.
- The final decision brief contains traceable source links and reflects the revised constraints.

