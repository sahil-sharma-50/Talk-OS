"use client";

import { MoveDiagonal2 } from "lucide-react";
import type { KeyboardEvent, PointerEvent as ReactPointerEvent } from "react";

const MIN_WIDTH = 480;
const MIN_HEIGHT = 360;

function resizeSurface(surface: HTMLElement, width: number, height: number) {
  const parent = surface.parentElement;
  const parentStyle = parent ? getComputedStyle(parent) : null;
  const horizontalInset = parentStyle ? parseFloat(parentStyle.paddingLeft) + parseFloat(parentStyle.paddingRight) : 16;
  const verticalInset = parentStyle ? parseFloat(parentStyle.paddingTop) + parseFloat(parentStyle.paddingBottom) : 24;
  const maxWidth = Math.max(MIN_WIDTH, (parent?.clientWidth || window.innerWidth) - horizontalInset);
  const maxHeight = Math.max(MIN_HEIGHT, (parent?.clientHeight || window.innerHeight) - verticalInset);
  surface.style.width = `${Math.round(Math.min(maxWidth, Math.max(MIN_WIDTH, width)))}px`;
  surface.style.height = `${Math.round(Math.min(maxHeight, Math.max(MIN_HEIGHT, height)))}px`;
}

export function WorkspaceResizeHandle() {
  const onPointerDown = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (event.button !== 0) return;
    event.preventDefault();
    const surface = event.currentTarget.parentElement;
    if (!surface) return;
    const start = surface.getBoundingClientRect();
    const startX = event.clientX;
    const startY = event.clientY;
    const move = (nextEvent: PointerEvent) => resizeSurface(surface, start.width + nextEvent.clientX - startX, start.height + nextEvent.clientY - startY);
    const stop = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", stop);
      window.removeEventListener("pointercancel", stop);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", stop, { once: true });
    window.addEventListener("pointercancel", stop, { once: true });
  };

  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    const surface = event.currentTarget.parentElement;
    if (!surface) return;
    if (event.key === "Home") {
      event.preventDefault();
      surface.style.removeProperty("width");
      surface.style.removeProperty("height");
      return;
    }
    const direction = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[event.key];
    if (!direction) return;
    event.preventDefault();
    const step = event.shiftKey ? 64 : 24;
    const current = surface.getBoundingClientRect();
    resizeSurface(surface, current.width + direction[0] * step, current.height + direction[1] * step);
  };

  return <button
    className="workspace-resize-handle"
    type="button"
    aria-label="Resize workspace canvas"
    aria-keyshortcuts="ArrowUp ArrowDown ArrowLeft ArrowRight Home"
    title="Drag to resize. Use arrow keys for precise resizing; Home resets."
    onPointerDown={onPointerDown}
    onKeyDown={onKeyDown}
  ><MoveDiagonal2 size={14} aria-hidden="true" /></button>;
}
