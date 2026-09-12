import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "TalkOS | Everyday task copilot",
  description: "Turn a conversation into coordinated documents, budgets, schedules, and source-backed research with AssemblyAI voice agents.",
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return <html lang="en"><body>
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
