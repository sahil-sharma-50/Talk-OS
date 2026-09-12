# TalkOS Light Workspace Design

## Product decision

TalkOS remains a voice-operated research workspace. The supplied widget-builder screenshot is the interaction and composition reference, not a request to turn the product into a widget generator.

## Experience

The application uses a quiet light shell with a fixed global header, a 32% conversation rail, and a dominant dotted workspace canvas. Live voice is the primary action. The deterministic demo remains available as a fallback and is labeled accordingly.

The conversation rail contains session status, transcript, the current objective and constraints, compact activity history, errors, and an anchored composer/control shelf. The workspace header exposes Preview, Plan, Evidence, Notes, and Settings. Preview shows the active research document inside a measured canvas; the other tabs expose real session state rather than decorative placeholders.

The signature interaction remains interruption: the cancelled action is struck through, a visible “Plan revised” marker appears next, and the replacement action follows.

## Functional scope

- Preserve the existing AssemblyAI Voice Agent connection, browser microphone capture, streamed transcript/audio, barge-in, and client-side tool calls.
- Preserve deterministic fallback mode and the shared normalized reducer.
- Add a complete tabbed workspace for plan, captured evidence, notes, and connection guidance.
- Add a working brief export action when a decision memo exists.
- Keep all controls keyboard accessible with visible focus and responsive behavior.
- Do not claim unrestricted browser control, live web search, or general computer use.

## Visual contract

- White and cool-gray surfaces, fine neutral rules, and a dotted canvas matching the reference composition.
- Green is reserved for the primary live action and active status; blue is reserved for focus and selected workspace state; red is reserved for interruption and errors.
- System UI typography, small radii, restrained shadows only on the central workspace object.
- No gradients, glass, glow, fake metrics, generic card mosaics, oversized headlines, or ornamental icon clusters.

## Verification

Unit/component tests cover navigation, live-first action hierarchy, interruption visibility, fallback access, and export. Final verification includes lint, type checking, full tests, production build, detector output, and one desktop/mobile visual QA pass.
