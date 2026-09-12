export type CanvasCommitSource = "agent" | "pointer" | "text";

export interface CanvasChangeReceipt<Scene> {
  id: string;
  source: CanvasCommitSource;
  before: Scene;
  after: Scene;
}

export interface CanvasHistory<Scene> {
  scene: Scene;
  undoReceipts: readonly CanvasChangeReceipt<Scene>[];
  redoReceipts: readonly CanvasChangeReceipt<Scene>[];
  changeReceipts: readonly CanvasChangeReceipt<Scene>[];
}

export function createCanvasHistory<Scene>(scene: Scene): CanvasHistory<Scene> {
  return { scene, undoReceipts: [], redoReceipts: [], changeReceipts: [] };
}

export function commitCanvasScene<Scene>(
  history: CanvasHistory<Scene>,
  scene: Scene,
  receipt: Pick<CanvasChangeReceipt<Scene>, "id" | "source">,
): CanvasHistory<Scene> {
  const change = { ...receipt, before: history.scene, after: scene };
  return {
    scene,
    undoReceipts: [...history.undoReceipts, change],
    redoReceipts: [],
    changeReceipts: [...history.changeReceipts, change],
  };
}

/** Updates the rendered editor after an undo, redo, or agent state application without echoing a receipt. */
export function applyExternalCanvasScene<Scene>(history: CanvasHistory<Scene>, scene: Scene): CanvasHistory<Scene> {
  return { ...history, scene };
}

export function undoCanvasScene<Scene>(history: CanvasHistory<Scene>): CanvasHistory<Scene> {
  const receipt = history.undoReceipts.at(-1);
  if (!receipt) return history;
  return {
    ...history,
    scene: receipt.before,
    undoReceipts: history.undoReceipts.slice(0, -1),
    redoReceipts: [...history.redoReceipts, receipt],
  };
}

export function redoCanvasScene<Scene>(history: CanvasHistory<Scene>): CanvasHistory<Scene> {
  const receipt = history.redoReceipts.at(-1);
  if (!receipt) return history;
  return {
    ...history,
    scene: receipt.after,
    undoReceipts: [...history.undoReceipts, receipt],
    redoReceipts: history.redoReceipts.slice(0, -1),
  };
}
