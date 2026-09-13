import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { EditableArtifactTitle } from "./EditableArtifactTitle";

describe("EditableArtifactTitle", () => {
  it("commits a trimmed title when focus leaves", () => {
    const onCommit = vi.fn();
    render(<EditableArtifactTitle title="Original" ariaLabel="Artifact title" onCommit={onCommit} />);

    fireEvent.change(screen.getByLabelText("Artifact title"), { target: { value: "  Renamed  " } });
    fireEvent.blur(screen.getByLabelText("Artifact title"));

    expect(onCommit).toHaveBeenCalledWith("Renamed");
  });

  it("cancels a pending rename with Escape", () => {
    const onCommit = vi.fn();
    render(<EditableArtifactTitle title="Original" ariaLabel="Artifact title" onCommit={onCommit} />);

    const input = screen.getByLabelText("Artifact title");
    input.focus();
    fireEvent.change(input, { target: { value: "Discard me" } });
    fireEvent.keyDown(input, { key: "Escape" });

    expect(onCommit).not.toHaveBeenCalled();
    expect(input).toHaveValue("Original");
  });
});
