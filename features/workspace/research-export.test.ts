import { describe, expect, it } from "vitest";
import { exportResearchCollectionMarkdown, exportResearchSourceMarkdown } from "./research-export";
import type { ResearchCollection, RetrievedSource } from "./workspace.types";

const source: RetrievedSource = {
  id: "source-1",
  title: "Primary evidence",
  url: "https://example.com/evidence",
  snippet: "A concise excerpt.",
  content: "The full extracted evidence.",
  retrievedAt: "2026-09-12T12:00:00.000Z",
};

describe("research Markdown exports", () => {
  it("exports an individual source with its link and evidence", () => {
    expect(exportResearchSourceMarkdown(source)).toBe(
      "# Primary evidence\n\nSource: https://example.com/evidence\n\nA concise excerpt.\n\nThe full extracted evidence.\n",
    );
  });

  it("exports a saved search as one report with all of its results", () => {
    const collection: ResearchCollection = {
      id: "research-1",
      query: "Useful evidence",
      summary: "A short synthesis.",
      sourceIds: [source.id],
      status: "complete",
      createdAt: "2026-09-12T12:00:00.000Z",
    };

    expect(exportResearchCollectionMarkdown(collection, [source])).toBe(
      "# Useful evidence\n\nA short synthesis.\n\n## Sources\n\n### Primary evidence\n\nhttps://example.com/evidence\n\nA concise excerpt.\n\nThe full extracted evidence.\n",
    );
  });
});
