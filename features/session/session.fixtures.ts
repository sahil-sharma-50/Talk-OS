import type { DecisionBrief, SessionState } from "./session.types";

export const initialSessionState: SessionState = {
  mode: "demo",
  connected: false,
  voiceState: "idle",
  partialTranscript: null,
  turns: [],
  objective: null,
  constraints: [],
  plan: [],
  planRevision: 0,
  activities: [],
  invalidatedActionIds: [],
  evidence: [],
  brief: null,
  activeWorkspace: "browser",
  notesHasUpdate: false,
  error: null,
};

export const decisionBrief: DecisionBrief = {
  title: "Supabase vs Firebase — vendor decision",
  updatedAt: "2026-09-12T12:00:00.000Z",
  requirements: ["Official sources only", "Prioritize compliance", "Pricing under $100/month"],
  comparison: [
    {
      category: "Pricing",
      supabase: "Predictable Pro plan with usage allowances.",
      firebase: "Usage-based Blaze plan varies by service.",
    },
    {
      category: "Compliance",
      supabase: "SOC 2 Type 2 documentation is published.",
      firebase: "Google Cloud maintains broad compliance coverage.",
    },
  ],
  recommendation: "Choose Supabase for this early-stage SaaS evaluation.",
  rationale: "Its pricing model is easier to forecast while meeting the revised compliance requirement.",
  evidenceIds: ["supabase-pricing", "supabase-security", "firebase-pricing", "firebase-compliance"],
};
