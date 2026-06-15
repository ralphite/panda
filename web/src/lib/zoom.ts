export const MIN_ZOOM = 0.05;
export const MAX_ZOOM = 2.5;
export const DEFAULT_FIT_MAX_ZOOM = 1;

interface Size {
  width: number;
  height: number;
}

export function normalizeZoom(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_FIT_MAX_ZOOM;
  return Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, Number(value.toFixed(2))));
}

export function fitZoomForBounds(image: Size, viewport: Size, maxZoom = DEFAULT_FIT_MAX_ZOOM): number {
  if (image.width <= 0 || image.height <= 0 || viewport.width <= 0 || viewport.height <= 0) {
    return normalizeZoom(maxZoom);
  }

  const rawZoom = Math.min(maxZoom, viewport.width / image.width, viewport.height / image.height);
  return Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, Math.floor(rawZoom * 100) / 100));
}
