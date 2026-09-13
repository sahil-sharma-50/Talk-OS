import { render, screen, within } from "@testing-library/react";
import { FileText, Plus } from "lucide-react";
import { describe, expect, it, vi } from "vitest";
import { ArtifactNavigator, ArtifactNavigatorItem } from "./ArtifactNavigator";

describe("ArtifactNavigator", () => {
  it("presents creation, count, selection, and metadata as one compact navigator", () => {
    const select = vi.fn();
    render(
      <ArtifactNavigator
        label="Documents"
        count={2}
        countLabel="2 documents"
        actions={<button type="button"><Plus size={14} /> New</button>}
      >
        <ArtifactNavigatorItem
          active
          icon={FileText}
          title="Launch brief"
          meta="Markdown · Revision 3"
          onSelect={select}
          menu={<button type="button" aria-label="More options for Launch brief">Menu</button>}
        />
      </ArtifactNavigator>,
    );

    const navigator = screen.getByRole("complementary", { name: "Documents" });
    expect(within(navigator).getByRole("heading", { name: "Documents" })).toBeVisible();
    expect(within(navigator).getByLabelText("2 documents")).toHaveTextContent("2");
    expect(within(navigator).getByRole("button", { name: "New" })).toBeVisible();
    const item = within(navigator).getByRole("button", { name: "Launch brief, Markdown · Revision 3" });
    expect(item).toHaveAttribute("aria-current", "page");
    expect(within(navigator).getByText("Markdown · Revision 3")).toBeVisible();

    item.click();
    expect(select).toHaveBeenCalledOnce();
  });
});
