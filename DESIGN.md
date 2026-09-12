---
name: TalkOS
description: An editorial assignment desk for interruptible, evidence-led voice research.
colors:
  desk-black: "#0b0d0c"
  command-black: "#0d100e"
  panel: "#101412"
  panel-raised: "#1d231f"
  paper: "#e9e7df"
  ivory: "#f2f0e8"
  muted: "#929991"
  rule: "#343a35"
  citron: "#dfff4f"
  citron-ink: "#151a08"
  interruption-coral: "#ff756d"
  focus-blue: "#a8c7ff"
typography:
  display:
    fontFamily: "Aptos Display, Arial Narrow, Segoe UI, sans-serif"
    fontSize: "clamp(23px, 2.1vw, 34px)"
    fontWeight: 760
    lineHeight: 1
    letterSpacing: "-0.025em"
  body:
    fontFamily: "Aptos, Segoe UI, system-ui, sans-serif"
    fontSize: "15px"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "Cascadia Mono, SFMono-Regular, Consolas, monospace"
    fontSize: "10px"
    fontWeight: 750
    lineHeight: 1.35
    letterSpacing: "0.095em"
rounded:
  signal: "3px"
  badge: "4px"
  control: "7px"
  workspace: "8px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "16px"
  lg: "24px"
  xl: "32px"
components:
  button-primary:
    backgroundColor: "{colors.citron}"
    textColor: "{colors.citron-ink}"
    rounded: "{rounded.control}"
    height: "41px"
    padding: "0 11px"
  button-live:
    backgroundColor: "{colors.panel-raised}"
    textColor: "{colors.ivory}"
    rounded: "{rounded.control}"
    height: "41px"
    padding: "0 11px"
  button-interrupt:
    backgroundColor: "#211513"
    textColor: "{colors.interruption-coral}"
    rounded: "{rounded.control}"
    height: "41px"
    padding: "0 11px"
  revision-marker:
    backgroundColor: "{colors.citron}"
    textColor: "{colors.citron-ink}"
    rounded: "{rounded.signal}"
    padding: "5px 8px"
---

# Design System: TalkOS

## Overview

**Creative North Star: "The Assignment Desk"**

TalkOS feels like a newsroom assignment desk fused with an incident-command ledger: dense, calm, and accountable. The voice rail records intent and intervention while a dominant paper-like workspace preserves the evidence and decision. It is an analyst's instrument, never a generic chatbot or theatrical sci-fi operating system.

The signature visual sentence is coral cancellation, followed immediately by a citron revision marker, followed by the replacement action. Color is operational rather than decorative, and every high-contrast signal answers what changed, why it changed, or what the user can do next.

**Key Characteristics:**

- Warm-black ruled surfaces surrounding one large ivory evidence plane.
- Compressed editorial display type paired with quiet sans-serif body copy and mono telemetry.
- Citron reserved for live, selected, revised, and primary-action states.
- Coral reserved for interruption, error, and stopping.
- Dense information with generous working space; no dashboard-card mosaic.

## Colors

The palette is an editorial night desk: carbon surfaces, aged paper, ivory type, and two rare signal colors.

### Primary

- **Electric Citron:** Marks the primary action, active navigation, live state, constraints, completed checks, and the plan-revision splice.

### Secondary

- **Interruption Coral:** Marks cancellation, errors, and destructive stop controls; it must not become a general accent.

### Neutral

- **Desk Black:** The application ground and deepest visual field.
- **Command Black:** The persistent command rail and control shelf.
- **Panel / Raised Panel:** Separates transcript, browser chrome, and source rails through tonal layering.
- **Evidence Paper:** The reading and decision surface; it carries dark ink, rules, and restrained link blue.
- **Ivory / Muted / Rule:** Establish the text hierarchy and ledger structure without relying on elevation.

**The Signal Rarity Rule.** Citron and coral communicate state. Do not use either as ambient decoration.

## Typography

**Display Font:** Aptos Display, with Arial Narrow and Segoe UI fallbacks  
**Body Font:** Aptos, with Segoe UI and system-ui fallbacks  
**Label/Mono Font:** Cascadia Mono, with SFMono-Regular and Consolas fallbacks

**Character:** Display type is compressed and decisive; body copy is calm and legible; mono labels make counts, timestamps, and source indices feel operational.

### Hierarchy

- **Display:** Heavy, tightly tracked state words and evidence headlines; use responsive clamps for the major reading surface.
- **Headline:** Decision and source titles with compact leading and editorial balance.
- **Body:** Fifteen-pixel UI copy, with evidence prose limited to roughly 68-70 characters per line.
- **Label:** Nine-to-ten-pixel uppercase metadata with wide tracking; use mono for measurements and sequence numbers.

**The Three-Voice Rule.** Display declares, sans-serif explains, and mono records. Do not swap these roles casually.

## Layout

The 62px command rail spans the viewport. Below it, desktop uses a 30/70 split: a minimum 330px voice-and-action rail and a dominant workspace. The voice rail is vertically partitioned into state, transcript, objective, action ledger, and anchored controls. The workspace uses a tab rail above a browser or notes surface; the browser divides into evidence and a 30% source stack.

Below 980px the source stack collapses. Below 800px the application becomes a single document: voice controls remain sticky, followed by the workspace with familiar tab order. Spacing uses a compact 4/8/16/24/32px rhythm, with larger fluid padding only on paper reading surfaces.

**The Evidence-Dominance Rule.** On desktop, the workspace remains the largest object in the first viewport.

## Elevation & Depth

The system is flat by default. Depth comes from tonal surface changes, one-pixel rules, and the contrast between dark chrome and paper—not card shadows. A soft citron halo appears only around the connected-status dot to confirm a live session.

**The Ruled-Surface Rule.** Prefer borders and tonal adjacency over floating cards or decorative shadows.

## Shapes

The form language is mostly rectilinear: three-pixel signal tags, four-pixel badges, seven-pixel controls, and eight-pixel browser or recommendation containers. Circular geometry is reserved for the voice-state mark, status dot, and compact indicators. One-pixel borders provide structure; large pill shapes and glass panels do not belong.

## Components

### Buttons

- **Shape:** Compact, gently rounded controls with a 41px minimum height.
- **Primary:** Citron fill and dark ink; the rare highest-emphasis action.
- **Live:** Raised charcoal with an outlined edge and ivory text.
- **Interrupt / Stop:** Dark warm-red ground, coral text, and a coral-brown border.
- **Hover / Focus:** Hover changes the surface tone. Keyboard focus uses a visible two-pixel focus-blue outline with a two-pixel offset.

### Chips

- **Style:** Small rectangular operational tags. Constraints and revised requirements use citron or muted citron; provenance uses an outlined dark badge.
- **State:** Tags summarize durable state and must remain readable without animation.

### Cards / Containers

- **Corner Style:** Mostly square internal sections; only complete tools and inset recommendation blocks reach eight pixels.
- **Background:** Dark tonal layers for control surfaces and evidence paper for reading.
- **Shadow Strategy:** No ambient card shadows.
- **Border:** One-pixel graphite rules define structure.

### Navigation

Workspace tabs are quiet icon-and-label controls. Selection is expressed by ivory text and a two-pixel citron underline; updates add a small citron dot. On mobile, the same order and semantics remain intact.

### Interruption Splice

The signature ledger component always orders the cancelled coral action, the persistent citron **Plan revised** marker, and then the replacement action. A brief 220ms horizontal settle may introduce the marker, but clipping must never obscure its label and reduced-motion preferences collapse the animation.

## Do's and Don'ts

### Do:

- **Do** keep plans, actions, evidence, and recommendations visibly connected.
- **Do** make interruption legible at a glance through color, strike-through, order, and plain language.
- **Do** preserve keyboard focus, semantic tab behavior, live-region announcements, and reduced-motion support.
- **Do** label authored evidence as demo data and keep source links inspectable.

### Don't:

- **Don't** introduce gradients, glass effects, neon glow, or sci-fi HUD ornament.
- **Don't** turn the workspace into a grid of generic metric cards.
- **Don't** use coral for ordinary emphasis or citron as background decoration.
- **Don't** hide the revised plan after the replacement action starts.
- **Don't** fabricate customers, performance claims, or live-source results.
