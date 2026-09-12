import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import { addRetrievedSources, createWorkspace } from "@/features/workspace/workspace-model";
import type { WorkspaceSnapshot } from "@/features/workspace/workspace.types";
import { ResearchWorkspace } from "./ResearchWorkspace";

function fixture() {
  const source = {
    id: "source-1",
    title: "Primary evidence",
    url: "https://example.com/evidence",
    snippet: "A concise excerpt.",
    content: "The full extracted evidence.",
    retrievedAt: "2026-09-12T12:00:00.000Z",
  };
  return addRetrievedSources(createWorkspace(), [source], "Useful evidence");
}

function Harness({ initial }: { initial: WorkspaceSnapshot }) {
  const [workspace, setWorkspace] = useState(initial);
  return <ResearchWorkspace workspace={workspace} onChange={setWorkspace} />;
}

describe("ResearchWorkspace actions", () => {
  it("offers download and delete actions for every saved search and individual result", async () => {
    const user = userEvent.setup();
    render(<Harness initial={fixture()} />);

    await user.click(screen.getByRole("button", { name: "More options for saved search Useful evidence" }));
    expect(screen.getByRole("button", { name: "Download saved search" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Delete saved search" })).toBeVisible();

    await user.click(screen.getByRole("button", { name: "More options for result Primary evidence" }));
    expect(screen.getByRole("button", { name: "Download result" })).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Delete result" }));

    expect(screen.queryByText("Primary evidence")).not.toBeInTheDocument();
    expect(screen.getByText("0 results")).toBeVisible();
  });

  it("deletes a saved search from its action menu", async () => {
    const user = userEvent.setup();
    render(<Harness initial={fixture()} />);

    await user.click(screen.getByRole("button", { name: "More options for saved search Useful evidence" }));
    await user.click(screen.getByRole("button", { name: "Delete saved search" }));

    expect(screen.getByText("No web research yet")).toBeVisible();
  });
});
