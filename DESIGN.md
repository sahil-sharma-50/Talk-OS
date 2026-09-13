---
name: TalkOS
description: A precise adaptive workspace for directing everyday work by voice or text.
colors:
  ink: "#151923"
  text: "#202532"
  muted: "#6e7686"
  muted-soft: "#99a1af"
  rule: "#e3e6eb"
  rule-strong: "#d6dae1"
  surface: "#ffffff"
  surface-subtle: "#f7f8fa"
  canvas: "#fbfcfd"
  live: "#16a34a"
  live-hover: "#12823d"
  live-soft: "#eaf8ef"
  selected: "#2563eb"
  selected-soft: "#eef4ff"
  interrupted: "#dc4c4c"
  interrupted-soft: "#fff1f0"
  voice-blue: "#2f6cff"
  voice-cyan: "#28c7ff"
  voice-violet: "#6233f5"
  voice-magenta: "#ff3ce7"
  voice-deep: "#33149a"
  voice-periwinkle: "#b9c8ff"
typography:
  section:
    fontFamily: "Segoe UI Variable Text, Segoe UI, Instrument Sans, system-ui, sans-serif"
    fontSize: "20px"
    fontWeight: 700
    lineHeight: 1.2
  title:
    fontFamily: "Segoe UI Variable Display, Segoe UI, Instrument Sans, system-ui, sans-serif"
    fontSize: "16px"
    fontWeight: 600
    lineHeight: 1.3
  body:
    fontFamily: "Segoe UI Variable Text, Segoe UI, Instrument Sans, system-ui, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.45
  label:
    fontFamily: "Segoe UI Variable Text, Segoe UI, Instrument Sans, system-ui, sans-serif"
    fontSize: "12px"
    fontWeight: 600
    lineHeight: 1.35
  reading:
    fontFamily: "Source Serif 4, Iowan Old Style, Palatino Linotype, Georgia, serif"
    fontSize: "15px"
    fontWeight: 400
    lineHeight: 1.72
  readingHeading:
    fontFamily: "Source Serif 4, Iowan Old Style, Palatino Linotype, Georgia, serif"
    fontSize: "clamp(24px, 3vw, 40px)"
    fontWeight: 600
    lineHeight: 1.12
  readingDisplay:
    fontFamily: "Source Serif 4, Iowan Old Style, Palatino Linotype, Georgia, serif"
    fontSize: "clamp(32px, 3.2vw, 48px)"
    fontWeight: 600
    lineHeight: 1.08
rounded:
  line: "2px"
  tag: "4px"
  small: "6px"
  control: "7px"
  field: "9px"
  large: "12px"
  pill: "999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "20px"
  xxl: "24px"
components:
  button-primary:
    backgroundColor: "{colors.live}"
    textColor: "{colors.surface}"
    rounded: "{rounded.control}"
    height: "38px"
    padding: "0 10px"
  button-secondary:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    rounded: "{rounded.control}"
    height: "38px"
    padding: "0 10px"
  workspace:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.large}"
---

# Design System: TalkOS

## Overview

**Creative North Star: "The Working Canvas"**

TalkOS feels like a calm productivity tool rather than a chat dashboard. A compact direct exchange and reactive agent occupy the left rail; one native-feeling work surface dominates the rest. Conversation history and agent activity stay out of the way until requested.

**Key Characteristics:**

- Cool neutral surfaces, a quiet measured canvas, and restrained state color.
- Humanist interface type with monospaced data only where precision helps.
- Flat application chrome surrounding one gently elevated working object.
- Motion tied to live voice energy, interruption, and drawer transitions.

## Colors

Neutral surfaces carry sustained work. Live Green marks active or committed work, Selected Blue marks navigation and focus, and Interrupted Red is reserved for cancellation, failure, and Stop. The Voice spectrum—blue, cyan, violet, magenta, deep indigo, and periwinkle—is reserved for the organic agent orb.

**The State-Color Rule.** Green, blue, and red explain state; they never decorate empty space.

## Typography

**Interface Font:** Segoe UI Variable Text/Display on Windows for native hinting, with self-hosted Instrument Sans and system fallbacks
**Reading Font:** Source Serif 4, self-hosted through Next.js, reserved for document and research reading surfaces
**Data Font:** Cascadia Mono with SFMono-Regular and Consolas fallbacks

**Character:** Crisp, humanist, and editorial. Instrument Sans keeps the operating system compact and direct; Source Serif 4 gives sustained reading a deliberate, authored texture.

### Hierarchy

- **Section** (700, 20px): voice state and prominent empty-state headings.
- **Title** (600, 16px, 1.3): product and workspace headings.
- **Reading** (400, 15px, 1.72): document copy, source excerpts, and research content, with a 66–68 character measure.
- **Reading heading** (600, 24–40px): research and decision headings; source features may reach 48px.
- **UI** (400–600, 14px, 1.45): conversation, form fields, and working content.
- **Label** (500–700, 12px, 1.35): controls, navigation, and compact secondary copy.
- **Meta/Data** (10px): time, revisions, sheet coordinates, measurements, and uppercase state labels only; numeric data uses tabular figures.

**The Quiet-Type Rule.** Interface labels stay compact but never drop below 12px; only metadata and data may use 10px. Working content receives the room, measure, and contrast.

## Layout

The fixed command rail is 50px tall. Desktop divides the remaining viewport into a 280–310px agent rail and one fluid workspace. Editors pair a roughly 210px artifact list with a dominant canvas; Research uses query, result, and source columns. At 780px the agent and workspace stack, tabs and artifact rails scroll horizontally, and secondary chart/source columns yield to the active task.

## Elevation & Depth

Application chrome is flat and divided by one-pixel rules. Only the active workspace object and temporary drawers or menus receive low neutral shadows. The reactive orb uses dimensional shading and tightly contained colored diffusion because it is the product’s interaction anchor, not a reusable card material.

**The One-Object Rule.** A workspace view lifts one working object; internal sections use rules and tonal surfaces rather than nested cards.

## Shapes

Controls use restrained 6–9px corners, full workspaces use 12px, and compact state chips may use pills. Circular and organic geometry is reserved for the reactive voice agent, status dots, and icon controls. Fine one-pixel borders define structure.

## Components

### Voice agent

The abstract organic orb is the microphone entry point. It never resembles a face or mascot. State changes update its label, hint, shape, signal rings, color energy, and measured motion; real PCM input/output energy drives the subtle response. Reduced-motion users receive stable state styling.

### Conversation and drawers

Only the latest one-to-one exchange stays visible. History and Activity are fixed drawers with clear close controls. The composer accepts text before microphone permission and uses the same session.

### Buttons and fields

Primary actions use Live Green with white text; secondary actions use white or subtle neutral fills with one rule. Focus uses a two-pixel Selected Blue outline or border. Errors use Interrupted Red without removing their labels.

### Workspaces and navigation

Tabs combine a Lucide icon and label; the selected tab uses subtle neutral fill. Every artifact workspace uses the same 220-pixel navigator: a compact heading with count and actions, flat rows with a type icon, 14-pixel native UI titles, 12-pixel metadata, and a restrained one-pixel active marker. On small screens the navigator becomes a horizontal strip. Artifact action menus close on outside click and Escape. Rename replaces the action list with a compact, labeled form and explicit Cancel and Save controls. Canvas uses the neutral dotted work surface for spatial editing. Dashboard uses a responsive four-column data grid whose cards always expose their source and method. Desktop working objects may be resized from their lower-right corner. Research groups exact queries before showing their sources. Agent-driven workspace changes are always followed.

## Do's and Don'ts

### Do:

- **Do** keep the working surface larger than the agent rail.
- **Do** keep interruptions, revision conflicts, coordinated changes, and undo visible.
- **Do** use familiar editor, spreadsheet, schedule, menu, and export affordances.
- **Do** preserve keyboard focus, live announcements, responsive containment, and reduced motion.

### Don't:

- **Don't** introduce glass, fake metrics, decorative dashboard tiles, or colored diffusion outside the voice orb.
- **Don't** keep conversation history, research context, or activity permanently open.
- **Don't** turn human keystrokes into agent activity noise.
- **Don't** imply unrestricted automation or unsupported external integrations.
