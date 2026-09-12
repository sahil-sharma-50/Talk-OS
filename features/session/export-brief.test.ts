import { describe, expect, it } from "vitest";
import { vendorEvidence } from "@/features/demo/vendor-evidence";
import { decisionBrief } from "./session.fixtures";
import { serializeDecisionBrief } from "./export-brief";

describe("serializeDecisionBrief", () => {
  it("exports the recommendation and traceable source links", () => {
    const markdown = serializeDecisionBrief(decisionBrief, [vendorEvidence[0]]);

    expect(markdown).toContain(`# ${decisionBrief.title}`);
    expect(markdown).toContain(decisionBrief.recommendation);
    expect(markdown).toContain(`[${vendorEvidence[0].sourceLabel}](${vendorEvidence[0].sourceUrl})`);
  });
});
