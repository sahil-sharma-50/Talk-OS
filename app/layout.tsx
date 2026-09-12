import type { Metadata } from "next";
import { Instrument_Sans, Source_Serif_4 } from "next/font/google";
import type { ReactNode } from "react";
import "./globals.css";

const instrumentSans = Instrument_Sans({
  display: "swap",
  subsets: ["latin"],
  variable: "--font-instrument-sans",
  weight: "variable",
});

const sourceSerif = Source_Serif_4({
  axes: ["opsz"],
  display: "swap",
  subsets: ["latin"],
  variable: "--font-source-serif",
  weight: "variable",
});

export const metadata: Metadata = {
  title: "TalkOS | Productivity workspace agent",
  description: "Turn a conversation into coordinated documents, budgets, schedules, and source-backed research with AssemblyAI voice agents.",
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return <html lang="en" className={`${instrumentSans.variable} ${sourceSerif.variable}`}><body>
    <template data-design-contract="talkos-everyday-task-workspace" dangerouslySetInnerHTML={{ __html: `<!--
THESIS: TalkOS turns spoken or typed direction into coordinated, visible work across documents, sheets, plans, and research.
OWN-WORLD: A precise adaptive workspace built from fine rules, a dotted canvas, a personable reactive voice agent, blue selections, green committed work, and red interruption marks.
STORY: Give TalkOS an objective, watch it build connected artifacts, redirect it mid-task, inspect one grouped change receipt, undo safely, then export usable files.
FIRST VIEWPORT: The current one-to-one exchange and reactive agent sit at left; the active work surface owns the rest of the screen. History and activity stay in drawers until requested.
FORM: Two-column light/dark productivity shell with native-feeling editors, grouped research, local persistence, and explicit human control.
VALUE: AssemblyAI makes low-latency interruption and redirection useful. The user can change a constraint while work is happening, and TalkOS prevents stale tool results from overwriting the new direction.
FINISH: unreviewed and undocumented is unfinished; this build ends with verification and visual review.
-->` }} />
    {children}
  </body></html>;
}
