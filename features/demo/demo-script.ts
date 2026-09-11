import type { PlanItem } from "@/features/session/session.types";

export const originalPlan: PlanItem[] = [
  { id: "discover", label: "Scan independent comparisons", status: "active" },
  { id: "compare", label: "Compare developer experience", status: "pending" },
  { id: "recommend", label: "Write a recommendation", status: "pending" },
];

export const revisedPlan: PlanItem[] = [
  { id: "official", label: "Verify official pricing", status: "active" },
  { id: "compliance", label: "Check compliance coverage", status: "pending" },
  { id: "recommend", label: "Draft evidence-backed decision", status: "pending" },
];

export const demoCopy = {
  objective: "Compare Supabase and Firebase for our startup.",
  acknowledgement: "I’ll compare the platforms and build a decision brief.",
  interruption: "Use official sources only. Prioritize compliance and pricing under $100.",
  revisionAcknowledgement: "Understood. I’ve stopped the broad search and narrowed the plan.",
  recommendation: "Supabase is the stronger fit for this brief. I’ve documented the evidence and trade-offs.",
};
