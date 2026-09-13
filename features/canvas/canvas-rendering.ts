export interface CanvasRenderMetrics {
  width: number;
  height: number;
  pixelRatio: number;
}

export function getCanvasRenderMetrics(width: number, height: number, devicePixelRatio: number): CanvasRenderMetrics {
  return {
    width: Math.max(1, Math.round(width)),
    height: Math.max(1, Math.round(height)),
    pixelRatio: Math.max(2, devicePixelRatio || 1),
  };
}
