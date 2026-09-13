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
    {children}
  </body></html>;
}
