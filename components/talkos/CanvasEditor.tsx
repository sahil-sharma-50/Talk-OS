"use client";

import "@excalidraw/excalidraw/index.css";

import { CaptureUpdateAction, convertToExcalidrawElements, Excalidraw, newElementWith } from "@excalidraw/excalidraw";
import type { BinaryFiles, DataURL } from "@excalidraw/excalidraw/types";
import type { ComponentProps } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  commitCanvasScene,
  createCanvasHistory,
  redoCanvasScene,
  undoCanvasScene,
  type CanvasHistory,
} from "@/features/canvas/canvas-history";

type EditorProps = ComponentProps<typeof Excalidraw>;
type Scene = Parameters<NonNullable<EditorProps["onChange"]>>[0];
type EditorApi = Parameters<NonNullable<EditorProps["excalidrawAPI"]>>[0];
type FileId = BinaryFiles[string]["id"];
type SceneSkeleton = NonNullable<Parameters<typeof convertToExcalidrawElements>[0]>[number];

const imageId = "spike-local-image" as FileId;
const initialScene = convertToExcalidrawElements([
  { id: "start", type: "rectangle", x: 80, y: 90, width: 180, height: 90, label: { text: "Start" } },
  { id: "next", type: "rectangle", x: 380, y: 90, width: 180, height: 90, label: { text: "Next" } },
  { id: "route", type: "arrow", x: 260, y: 135, points: [[0, 0], [120, 0]], start: { id: "start" }, end: { id: "next" } },
  { id: "pen", type: "freedraw", x: 100, y: 270, width: 140, height: 55, points: [[0, 0], [35, 42], [78, 12], [140, 55]], simulatePressure: true } as unknown as SceneSkeleton,
  { id: "image", type: "image", x: 380, y: 250, width: 120, height: 80, fileId: imageId },
]);

const initialFiles: BinaryFiles = {
  [imageId]: {
    id: imageId,
    mimeType: "image/png",
    dataURL: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScL+XQAAAABJRU5ErkJggg==" as DataURL,
    created: 0,
  },
};

/** Development-only feasibility fixture. It uses only the documented component and imperative APIs. */
export default function CanvasEditor() {
  const apiRef = useRef<EditorApi | null>(null);
  const editorReadyRef = useRef(false);
  const pendingSceneRef = useRef<Scene>(initialScene);
  const historyRef = useRef<CanvasHistory<Scene>>(createCanvasHistory(initialScene));
  const [receiptIds, setReceiptIds] = useState<string[]>([]);
  const [theme, setTheme] = useState<"light" | "dark">("light");

  useEffect(() => {
    const root = document.documentElement;
    const updateTheme = () => setTheme(root.dataset.theme === "dark" ? "dark" : "light");
    updateTheme();
    const observer = new MutationObserver(updateTheme);
    observer.observe(root, { attributes: true, attributeFilter: ["data-theme"] });
    return () => observer.disconnect();
  }, []);

  const publish = useCallback((scene: Scene, source: "pointer" | "agent") => {
    const id = `${source}-${historyRef.current.changeReceipts.length + 1}`;
    historyRef.current = commitCanvasScene(historyRef.current, scene, { id, source });
    setReceiptIds(historyRef.current.changeReceipts.map((receipt) => receipt.id));
  }, []);

  const applyHistoryScene = useCallback((scene: Scene) => {
    apiRef.current?.updateScene({ elements: scene, captureUpdate: CaptureUpdateAction.NEVER });
  }, []);

  const applyAgentPatch = useCallback(() => {
    const scene = pendingSceneRef.current.map((element) => (
      element.type === "text" && element.text === "Start"
        ? newElementWith(element, { text: "Welcome" })
        : element
    ));
    pendingSceneRef.current = scene;
    applyHistoryScene(scene);
    publish(scene, "agent");
  }, [applyHistoryScene, publish]);

  const undo = useCallback(() => {
    historyRef.current = undoCanvasScene(historyRef.current);
    pendingSceneRef.current = historyRef.current.scene;
    applyHistoryScene(historyRef.current.scene);
  }, [applyHistoryScene]);

  const redo = useCallback(() => {
    historyRef.current = redoCanvasScene(historyRef.current);
    pendingSceneRef.current = historyRef.current.scene;
    applyHistoryScene(historyRef.current.scene);
  }, [applyHistoryScene]);

  return (
    <section aria-label="Canvas editor feasibility fixture" style={{ height: 620, border: "1px solid var(--line)" }}>
      <header style={{ display: "flex", gap: 8, padding: 8 }}>
        <button type="button" onClick={applyAgentPatch}>Apply agent label patch</button>
        <button type="button" onClick={undo}>TalkOS undo</button>
        <button type="button" onClick={redo}>TalkOS redo</button>
        <output aria-label="Canvas change receipts">{receiptIds.join(", ") || "No committed changes"}</output>
      </header>
      <div style={{ height: 560 }}>
        <Excalidraw
          initialData={{ elements: initialScene, files: initialFiles }}
          excalidrawAPI={(api) => { apiRef.current = api; }}
          onChange={(elements) => {
            if (elements.length > 0 || editorReadyRef.current) {
              editorReadyRef.current = true;
              pendingSceneRef.current = elements;
            }
          }}
          onPointerUp={() => publish(pendingSceneRef.current, "pointer")}
          onPaste={() => false}
          UIOptions={{ tools: { image: true } }}
          theme={theme}
        />
      </div>
    </section>
  );
}
