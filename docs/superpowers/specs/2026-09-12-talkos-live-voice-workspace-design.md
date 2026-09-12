# TalkOS Live Voice Workspace Design

## Product decision

TalkOS will make the AssemblyAI voice loop the primary visible experience: live speech becomes text, the agent performs work in the existing workspace, and the user can redirect it before stale work lands. The product keeps the existing Documents, Sheets, Planner, Research, and Settings views. It does not add more applications.

The latest request supersedes the earlier choice to hide all conversation text. The left rail shows only the current live exchange; the complete conversation remains in History.

## Experience hierarchy

The desktop layout remains a narrow voice rail beside a dominant workspace canvas. The current oversized robot is replaced by a compact, original circular voice indicator made from layered solid shapes. It responds to microphone and playback levels without copying another product's artwork. Motion distinguishes listening, thinking, acting, speaking, interruption, and error states. Reduced-motion preferences disable nonessential animation.

The voice rail gives most of its height to a live transcript surface. Partial AssemblyAI user and agent transcript events update the current exchange in place. The most recent finalized turn remains visible until the next partial arrives. Older turns appear only in Conversation history.

The canvas remains the visual proof of work. Its dotted background is reduced in contrast, and global controls are limited to theme, setup, Follow Agent, new session, and stop. Contextual exports stay inside their workspace editors.

## Live transcript data flow

AssemblyAI WebSocket events continue to enter through the voice adapter. User and agent transcript deltas are accumulated by speaker rather than replacing one another. A final transcript clears the partial buffer and adds one durable history turn. Empty final transcripts are ignored.

The voice panel receives the current voice state, audio level, partial transcript, and latest finalized turn. It renders:

- a compact animated voice circle and state label;
- a speaker label such as "You" or "TalkOS";
- the current streaming or most recently finalized text;
- a quiet prompt before a session begins;
- the existing error message when connection fails.

## Interruption behavior

Interruption uses a two-stage model aligned with AssemblyAI Voice Agent events:

1. On `input.speech.started` while the agent is speaking or a tool is active, TalkOS immediately stops local audio playback, advances the tool generation, aborts active tool controllers, discards queued results, and marks the visible action as interrupted. This prevents work from the old instruction from being committed after the redirect whenever an abortable action is still in flight.
2. AssemblyAI's interrupted reply signal confirms the semantic interruption. Developer Mode records candidate and confirmed events separately. The finalized user transcript becomes the new authoritative instruction, and the agent replans through the normal conversation and tool loop.

Workspace mutation functions keep their existing abort check immediately before commit. Late results from older generations are ignored. The live system prompt explicitly states that the newest completed user turn overrides conflicting earlier constraints.

## Follow Agent

Follow Agent is a persistent compact toggle in the header and is enabled by default. When a tool call starts, its tool name maps to Documents, Sheets, Planner, or Research, and the matching workspace opens immediately so the user can watch the operation. Settings is never selected automatically.

Selecting a workspace tab manually disables Follow Agent so the interface does not fight the user. Re-enabling it returns to the most recent agent-selected workspace. Completion events do not steal focus a second time.

## AssemblyAI Developer Mode

Developer Mode lives inside the Activity drawer and is off by default. Its toggle remains visible near an "AssemblyAI live" identity label. When enabled, it shows a bounded recent event stream and derived latency metrics:

- session ready and connection state;
- speech start and endpoint detection;
- first streaming user transcript;
- finalized user and agent turns;
- reply start and completion;
- interruption candidate and confirmation;
- tool-call start;
- endpoint-to-final-transcript latency;
- final-user-transcript-to-reply-start latency.

Telemetry is derived only from real AssemblyAI messages and local receipt timestamps. Missing measurements render as unavailable rather than fabricated values. The event buffer is capped so a long session cannot grow memory without bound. Resetting or ending a session clears ephemeral telemetry.

## Activity and History drawers

The Activity button remains inside the workspace canvas and within its height. In light theme it uses a white surface with dark icon; in dark theme it uses a black surface with light icon.

When Activity opens, the same toggle moves to the left side of the drawer header and changes to the close-panel icon. The separate X button is removed. The drawer uses the canvas background and never extends outside the canvas.

Conversation history is contained to the full width and height of the voice rail. It enters from the left edge and exits back through the left edge. The component remains mounted during its short closing animation, then becomes inert and unmounts. The close button retains its accessible label and keyboard behavior.

## Component boundaries

- `VoiceOrb` renders only the circular voice visual and state label.
- `LiveTranscript` renders the current streaming exchange without owning session history.
- `Transcript` continues to own the History control and animated history drawer.
- `voice-telemetry` converts AssemblyAI events and timestamps into bounded developer telemetry.
- `tool-workspace` maps tool names to workspace views.
- `ActivityDrawer` owns its normal activity view and opt-in Developer Mode presentation.
- `TalkOSApp` coordinates adapter listeners, Follow Agent policy, and session-level UI state.

## Accessibility and responsive behavior

Every icon-only control has a stable accessible label and visible focus state. Live transcript text uses polite announcements; interruption status uses an assertive status only when active work is cancelled. Developer telemetry is not announced continuously. Color is never the only indicator of voice or action state.

On narrow screens, the voice rail and workspace stack vertically. Drawers remain contained within their parent surface. The live transcript keeps a readable minimum height, and the header controls collapse to icons without removing their accessible names.

## Error handling

Connection and microphone errors continue to surface in the voice rail. If a telemetry timestamp pair is incomplete, the corresponding latency remains unavailable. Unknown tool names do not force a workspace change. Aborted tools do not emit failure errors or send stale results back to AssemblyAI.

## Verification

Test-first coverage will verify partial transcript accumulation, final-turn replacement, immediate interruption cancellation, stale-result suppression, semantic interruption telemetry, tool-to-workspace mapping, Follow Agent pause and resume, Developer Mode disclosure, Activity toggle behavior, and History entry and exit states.

Final verification includes the full Vitest suite, TypeScript checking, ESLint, a production build, the interface detector, and one bounded desktop and mobile visual pass in both light and dark themes.
