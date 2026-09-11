# TalkOS primary workspace

## Scope and mode

- Target: `app/page.tsx` and the TalkOS cockpit component tree.
- Mode: Operate.
- Audience: startup operators, technical founders, and procurement-minded knowledge workers evaluating software vendors.
- Job: direct live research by voice, see what the agent is doing, interrupt it, and receive a traceable decision brief.
- Primary action: run the demonstration, then interrupt the active research.

## Direction

Assignment Desk: a newsroom assignment desk fused with an incident-command ledger. The workspace stays dominant while the voice transcript, objective, constraints, and action history form a narrow operational rail. The memorable moment is an interrupted action struck through in coral, physically connected to a citron “Plan revised” event and the replacement official-source task.

Approved north-star composition: `.impeccable/mocks/assignment-desk.png`.

The comp is a compositional north star, not literal product data. The implementation must use the approved Supabase/Firebase demonstration, not the logistics example accidentally rendered in the mockup.

## Implementation inventory

| Ingredient | Commitment | Medium |
| --- | --- | --- |
| Global command rail | TalkOS identity, live/demo state, elapsed session time, Stop | Semantic HTML/CSS + Lucide icons |
| Voice state | Large state word, microphone mark, restrained waveform | Semantic HTML/CSS |
| Transcript | Final turns plus visually distinct live partial turn | Semantic list + ARIA live region |
| Objective and constraints | Compact labeled operational blocks | Semantic HTML/CSS |
| Action ledger | Timestamped states with a visible coral interruption and citron revision splice | Semantic ordered list + CSS rules |
| Workspace tabs | Browser and Notes with accessible tab semantics | Buttons + ARIA tab pattern |
| Research browser | Browser-like source header, active source detail, evidence rail | Semantic HTML/CSS; no iframe |
| Evidence content | Four clearly labeled synthetic findings linked to official sources | Authored dataset + anchor elements |
| Decision brief | Requirements, comparison, recommendation, citations | Semantic article/table/list |
| Responsive behavior | 30/70 desktop split; stacked voice/workspace under 800px | CSS media queries |
| Motion | One state-pulse and plan-revision entrance; disabled for reduced motion | CSS animation |

## Constraints

- Warm near-black and graphite carry the page; ivory is the main text; electric citron marks live and revised states; coral is exclusive to interruption/error.
- No decorative gradients, glass effects, neon glow, generic metric cards, or sci-fi HUD styling.
- The browser workspace must remain the largest object in the first viewport.
- Controls remain familiar, keyboard accessible, and visibly focused.
- Do not invent customers, performance benchmarks, or live research claims.

## Unresolved decision

The exact live Voice Agent WebSocket payload will follow AssemblyAI's current API documentation and remain behind the normalized adapter boundary.

