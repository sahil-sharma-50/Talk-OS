import type { DecisionBrief, Evidence } from "./session.types";

export function serializeDecisionBrief(brief: DecisionBrief, evidence: Evidence[]): string {
  const cited = evidence.filter((item) => brief.evidenceIds.includes(item.id));
  const requirements = brief.requirements.map((item) => `- ${item}`).join("\n");
  const comparison = brief.comparison
    .map((row) => `| ${row.category} | ${row.supabase} | ${row.firebase} |`)
    .join("\n");
  const sources = cited.map((item) => `- [${item.sourceLabel}](${item.sourceUrl})`).join("\n");

  return `# ${brief.title}

## Requirements

${requirements}

## Comparison

| Signal | Supabase | Firebase |
| --- | --- | --- |
${comparison}

## Recommendation

**${brief.recommendation}**

${brief.rationale}

## Sources

${sources || "No sources captured."}
`;
}
