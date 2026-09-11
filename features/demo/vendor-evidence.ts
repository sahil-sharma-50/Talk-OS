import type { DecisionBrief, Evidence } from "@/features/session/session.types";

export const vendorEvidence: Evidence[] = [
  {
    id: "supabase-pricing",
    provider: "Supabase",
    category: "Pricing",
    title: "Pro plan starts with a fixed monthly fee",
    finding: "The Pro organization plan starts at $25 per month, with usage-based overages beyond included quotas.",
    sourceLabel: "Supabase pricing",
    sourceUrl: "https://supabase.com/pricing",
    demoData: true,
  },
  {
    id: "firebase-pricing",
    provider: "Firebase",
    category: "Pricing",
    title: "Blaze uses pay-as-you-go billing",
    finding: "Firebase's Blaze plan prices individual Google Cloud services by usage after no-cost quotas.",
    sourceLabel: "Firebase pricing",
    sourceUrl: "https://firebase.google.com/pricing",
    demoData: true,
  },
  {
    id: "supabase-security",
    provider: "Supabase",
    category: "Compliance",
    title: "SOC 2 Type 2 is available",
    finding: "Supabase publishes SOC 2 Type 2 controls and provides additional compliance guidance for teams.",
    sourceLabel: "Supabase security",
    sourceUrl: "https://supabase.com/security",
    demoData: true,
  },
  {
    id: "firebase-compliance",
    provider: "Firebase",
    category: "Compliance",
    title: "Compliance varies by Firebase service",
    finding: "Firebase services inherit Google Cloud controls, but teams must verify coverage for each product they use.",
    sourceLabel: "Firebase privacy and security",
    sourceUrl: "https://firebase.google.com/support/privacy",
    demoData: true,
  },
];

export function createDecisionBrief(updatedAt: string): DecisionBrief {
  return {
    title: "Backend platform decision",
    updatedAt,
    requirements: [
      "Use official vendor sources only",
      "Prioritize compliance readiness",
      "Keep the initial platform cost under $100/month",
    ],
    comparison: [
      {
        category: "Pricing",
        supabase: "A $25/month starting point makes the first phase easier to forecast.",
        firebase: "Pay-as-you-go can begin cheaply, but costs vary across services and usage.",
      },
      {
        category: "Compliance",
        supabase: "Publishes SOC 2 Type 2 status and a focused security overview.",
        firebase: "Broad Google Cloud controls, with service-level scope to verify.",
      },
    ],
    recommendation: "Choose Supabase for the first release.",
    rationale:
      "It best matches the revised brief: a predictable sub-$100 starting cost and a straightforward compliance story. Reassess Firebase if deep Google Cloud integration becomes the dominant requirement.",
    evidenceIds: vendorEvidence.map((item) => item.id),
  };
}
