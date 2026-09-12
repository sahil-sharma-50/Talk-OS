# TalkOS workspace polish design

## Goal

Make the workspace feel like one coherent productivity tool: simplify the Sheets and Planner chrome, add useful document formatting without breaking Markdown-based agent edits, introduce a resizable working canvas, and replace the robot avatar with a distinctive voice-state orb.

## Interaction design

- Documents remain Markdown-backed. A compact toolbar inserts or toggles common Markdown formatting and a source/preview switch renders the result. This preserves agent edits, imports, and `.md` exports.
- The canvas can be resized from its lower-right edge on desktop. Its width and height stay within the viewport; compact layouts fall back to the existing full-width responsive surface.
- Sheets retain direct cell editing. The redundant formula bar and format selector are removed. The grid occupies all available width unless a data chart is actually present.
- Planner retains its task list and inline date/schedule controls. The empty secondary Schedule column is removed.
- Documents, Sheets, and Planner use the same two-row artifact-list header: title/count first, actions second.
- History reveals upward from its bottom anchor and dismisses downward.

## Voice agent

- Replace the face-like avatar with an abstract organic orb. It uses a deliberately scoped blue/violet/magenta gradient because the supplied visual reference explicitly calls for that material; gradients remain excluded elsewhere in the product.
- Each agent state has distinct motion: idle breath, listening expansion, thinking rotation/drift, speaking audio-reactive pulses, and connecting sweep. Reduced-motion users receive stable state styling.
- Configure the live session with a general productivity greeting and workspace system prompt before the session becomes ready.
- Join streaming transcript deltas with boundary-aware spacing so word chunks remain readable without inserting spaces before punctuation.

## Accessibility and responsiveness

- Formatting actions expose pressed state, tooltips, and visible focus.
- Preview output uses semantic Markdown rendering with safe, local rendering logic; raw HTML is displayed as text except for the toolbar's underline marker.
- Resize handles meet keyboard and pointer expectations where supported, with a non-resizable mobile layout.
- Voice state remains available as text and does not rely on color or motion alone.

## Verification

- Add regression tests for transcript delta spacing, initial voice session configuration, document formatting controls, simplified Sheet/Planner layouts, and workspace resize affordance.
- Run targeted tests during red/green cycles, then the complete test, lint, typecheck, and production-build suites.
- Inspect desktop/mobile and light/dark renders in the running app, including the orb states, canvas resize behavior, and History transition.
