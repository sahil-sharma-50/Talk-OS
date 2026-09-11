import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "TalkOS — Voice research workspace",
  description: "Talk, watch, interrupt, and redirect an AI research partner.",
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <template
          data-design-contract="talkos-assignment-desk"
          dangerouslySetInnerHTML={{
            __html: `<!--
THESIS: TalkOS makes spoken interruption visibly rewrite active computer work; it refuses the generic chat beside a card dashboard.
OWN-WORLD: A warm-black assignment desk built from ruled evidence strips, operational timestamps, ivory type, citron live states, and coral interruption marks.
STORY: Watch the agent research, interrupt it, see the plan splice, and inspect the resulting source-backed decision.
FIRST VIEWPORT: A narrow voice-and-action ledger sits left of a dominant evidence browser; Run demo is anchored low and Stop stays in the command rail.
FORM: Assignment Desk, grounded direction seven with incident-command staging; seed 1d46082a.
FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, and DESIGN.md
-->`,
          }}
        />
        {children}
      </body>
    </html>
  );
}
