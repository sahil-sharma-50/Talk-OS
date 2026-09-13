import { render, screen, within } from "@testing-library/react";
import { expect, it } from "vitest";
import { MarkdownPreview } from "./DocumentWorkspace";
import { createWorkspace } from "@/features/workspace/workspace-model";
import { executeResearchTool } from "@/features/voice/research-tools";

const sourceLinks = [
  ["Video Marketing in 2024: Trends and Statistics", "https://personifycorp.com/blog/video-marketing-in-2024-trends-and-statistics-you-cant-afford-to-ignore"],
  ["Online Video Platform Statistics and Facts (2026)", "https://scoop.market.us/online-video-platform-statistics"],
  ["Short Video Sharing Platform Market Report", "https://www.verifiedmarketresearch.com/product/short-video-sharing-platform-market"],
  ["Online Video Platform Market Size & Future Scope To 2035", "https://www.marketresearchfuture.com/reports/online-video-platform-market-29550"],
  ["Top 11 Video Marketing Trends 2025", "https://www.switcherstudio.com/blog/video-marketing-trends"],
];
const malformedSources = String.raw`\n\n## Research Sources` + sourceLinks.map(([title, url]) => String.raw`\n\* [${title}](${url})`).join("");

it.each([malformedSources, malformedSources.replaceAll("\\n", "\n").replaceAll("\\*", "*")])("renders source links as one readable list with a real heading", (sources) => {
  const { container } = render(<MarkdownPreview content={`# Market research\nKeep the existing paragraph.${sources}`} />);
  expect(screen.getByRole("heading", { name: "Research Sources", level: 2 })).toBeVisible();
  const list = screen.getByRole("list");
  expect(within(list).getAllByRole("listitem")).toHaveLength(5);
  sourceLinks.forEach(([title, url]) => expect(within(list).getByRole("link", { name: title })).toHaveAttribute("href", url));
  expect(container.textContent).not.toContain("\\n");
  expect(screen.getByText("Keep the existing paragraph.")).toBeVisible();
});

it.each(["create_document", "edit_document", "insert_document_content", "apply_workspace_changes"])("stores agent sources as Markdown through %s", async (name) => {
  let workspace = createWorkspace();
  const runtime = { getWorkspace: () => workspace, setWorkspace: (next: typeof workspace) => { workspace = next; }, getTavilyApiKey: () => "" };
  const call = (name: string, args: Record<string, unknown>) => executeResearchTool({ type: "tool.call", call_id: crypto.randomUUID(), name, arguments: args }, runtime);
  const created = await call("create_document", { title: "Market research", content: name === "create_document" ? malformedSources : "Existing paragraph." });
  const id = created.result.document_id;
  if (name !== "create_document") {
    const result = await call(name, name === "apply_workspace_changes" ? { label: "Add sources", changes: [{ kind: "document", artifact_id: id, expected_revision: 1, content: malformedSources }] } : { document_id: id, expected_revision: 1, placement: "end", content: malformedSources });
    expect(result.isError).not.toBe(true);
  }
  const content = workspace.documents.find(document => document.id === id)!.content;
  expect(content).toContain("## Research Sources\n* [Video Marketing");
  expect(content).not.toContain("\\n");
  render(<MarkdownPreview content={content} />);
  expect(within(screen.getByRole("list")).getAllByRole("link")).toHaveLength(5);
});

export const executionPlan = `## Execution Plan

(Managed in Planner)

| Task                                     | Due Date                       |
| :--------------------------------------- | :----------------------------- |
| Initial Setup & Team Alignment           | 2026-10-13                     |
| Beta Testing & Feature Refinement        | 2026-10-20                     |
| Marketing Blitz & Content Rollout        | 2026-10-27                     |
| Official Launch Day                      | 2026-11-12                     |
| Post-Launch Review & Feedback Collection | 2026-11-15<br><br><br><br><br> |

## Next steps
Confirm the owners.`;

it("renders the supplied execution plan as a compact semantic table", () => {
  render(<MarkdownPreview content={executionPlan} />);
  const table = screen.getByRole("table");
  expect(within(table).getAllByRole("columnheader").map(cell => cell.textContent)).toEqual(["Task", "Due Date"]);
  expect(within(table).getAllByRole("row")).toHaveLength(6);
  expect(within(table).getByRole("cell", { name: "2026-11-15" }).querySelectorAll("br")).toHaveLength(0);
  expect(within(table).getByRole("cell", { name: "Post-Launch Review & Feedback Collection" })).toBeVisible();
  expect(screen.getByRole("heading", { name: "Next steps" })).toBeVisible();
  expect(table.textContent).not.toContain(":---");
});

it("keeps table alignment, escaped pipes, formatting and intentional internal line breaks", () => {
  render(<MarkdownPreview content={"Name | Details | Amount\n:--- | :---: | ---:\n**A \\| B** | First<br />Second | `12`\nShort | _Ready_\n\nOutside"} />);
  const cells = within(screen.getByRole("table")).getAllByRole("cell");
  expect(cells[0]).toHaveTextContent("A | B");
  expect(cells[0].querySelector("strong")).not.toBeNull();
  expect(cells[1].querySelectorAll("br")).toHaveLength(1);
  expect(cells[1]).toHaveStyle({ textAlign: "center" });
  expect(cells[2]).toHaveStyle({ textAlign: "right" });
  expect(cells[2].querySelector("code")).toHaveTextContent("12");
  expect(cells[5]).toBeEmptyDOMElement();
  expect(screen.getByText("Outside")).toBeVisible();
});

it("does not interpret a code block or ordinary pipes as a table or execute raw HTML", () => {
  const { container } = render(<MarkdownPreview content={'```md\n| A | B |\n| --- | --- |\n```\n\nA | B\nNot a delimiter\n\n| Safe | Value |\n| --- | --- |\n| <img src=x onerror=alert(1)> | <script>alert(1)</script> |'} />);
  expect(screen.getAllByRole("table")).toHaveLength(1);
  expect(container.querySelectorAll("img,script")).toHaveLength(0);
  expect(container.querySelector("pre")).toHaveTextContent("| A | B |");
});
