import { describe, expect, it } from "vitest";
import {
  applyExternalCanvasScene,
  commitCanvasScene,
  createCanvasHistory,
  redoCanvasScene,
  undoCanvasScene,
} from "./canvas-history";

type Scene = readonly string[];

describe("Canvas history spike", () => {
  it("uses one canonical receipt stream for drawing and an agent patch", () => {
    const blank: Scene = [];
    const drawing: Scene = ["rectangle:node", "text:node:Start", "arrow:node:next", "freedraw:pen", "image:paste"];
    const patched: Scene = ["rectangle:node", "text:node:Welcome", "arrow:node:next", "freedraw:pen", "image:paste"];

    let history = createCanvasHistory(blank);
    history = commitCanvasScene(history, drawing, { id: "draw-1", source: "pointer" });
    history = commitCanvasScene(history, patched, { id: "patch-1", source: "agent" });

    expect(history.scene).toEqual(patched);
    expect(history.undoReceipts.map((receipt) => receipt.id)).toEqual(["draw-1", "patch-1"]);

    history = undoCanvasScene(history);
    expect(history.scene).toEqual(drawing);
    expect(history.redoReceipts.map((receipt) => receipt.id)).toEqual(["patch-1"]);

    history = undoCanvasScene(history);
    expect(history.scene).toEqual(blank);

    history = redoCanvasScene(history);
    expect(history.scene).toEqual(drawing);
    history = redoCanvasScene(history);
    expect(history.scene).toEqual(patched);
    expect(history.changeReceipts.map((receipt) => receipt.id)).toEqual(["draw-1", "patch-1"]);
  });

  it("does not create a commit when applying an external editor echo", () => {
    const blank: Scene = [];
    const external: Scene = ["rectangle:node"];
    const edited: Scene = ["rectangle:node", "text:node:Edited label"];

    let history = createCanvasHistory(blank);
    history = applyExternalCanvasScene(history, external);
    expect(history.scene).toEqual(external);
    expect(history.changeReceipts).toEqual([]);

    history = commitCanvasScene(history, edited, { id: "text-1", source: "text" });
    expect(history.undoReceipts).toHaveLength(1);
    expect(undoCanvasScene(history).scene).toEqual(external);
  });
});
