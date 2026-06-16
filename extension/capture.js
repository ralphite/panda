const FULL_RECT = { x: 0, y: 0, w: 1, h: 1 };
const DRAG_THRESHOLD_PX = 4;
const MIN_DRAG_PX = 12;

const state = {
  capture: null,
  captureKey: null,
  imageUrl: null,
  elements: [],
  selection: FULL_RECT,
  hover: null,
  pointer: null,
  dragging: null,
  uploading: false,
};

const stage = document.getElementById('stage');
const image = document.getElementById('screenshot');
const overlay = document.getElementById('overlay');
const message = document.getElementById('message');
const hint = document.getElementById('hint');
const ctx = overlay.getContext('2d');

void init();

async function init() {
  const id = new URLSearchParams(location.search).get('id');
  if (!id) {
    showMessage('Missing capture id.');
    return;
  }
  state.captureKey = `capture:${id}`;
  state.capture = await loadCapture(state.captureKey);
  if (!state.capture) {
    showMessage('Capture data was not found.');
    return;
  }
  if (state.capture.error) {
    showMessage(state.capture.error);
    return;
  }

  state.elements = Array.isArray(state.capture.elements) ? state.capture.elements : [];
  image.src = imageSource(state.capture);
  await image.decode();
  stage.hidden = false;
  message.hidden = true;
  showHint();
  resizeOverlay();
  drawOverlay();
}

overlay.addEventListener('pointerdown', (event) => {
  if (state.uploading) return;
  state.pointer = { id: event.pointerId, start: localPoint(event), moved: false };
  try {
    overlay.setPointerCapture(event.pointerId);
  } catch {
    // Pointer capture is a best-effort nicety; ignore if it is unavailable.
  }
});

overlay.addEventListener('pointermove', (event) => {
  if (state.uploading) return;
  const point = localPoint(event);

  if (state.pointer) {
    if (!state.pointer.moved) {
      const dx = point.x - state.pointer.start.x;
      const dy = point.y - state.pointer.start.y;
      if (Math.hypot(dx, dy) <= DRAG_THRESHOLD_PX) return;
      state.pointer.moved = true;
      state.hover = null;
    }
    state.dragging = { start: state.pointer.start, current: point };
    drawOverlay();
    return;
  }

  state.hover = hitTest(toNorm(point));
  drawOverlay();
});

overlay.addEventListener('pointerup', (event) => {
  if (state.uploading) return;
  const pointer = state.pointer;
  if (!pointer) return;
  try {
    overlay.releasePointerCapture(event.pointerId);
  } catch {
    // Ignore: capture may never have been acquired.
  }
  state.pointer = null;

  if (pointer.moved) {
    const rectPx = normalizedRect(pointer.start, localPoint(event));
    state.dragging = null;
    if (rectPx.w < MIN_DRAG_PX || rectPx.h < MIN_DRAG_PX) {
      drawOverlay();
      return;
    }
    void acceptSelection(rectPxToNorm(rectPx));
    return;
  }

  const hit = hitTest(toNorm(localPoint(event)));
  if (hit) {
    void acceptSelection(hit);
  } else {
    drawOverlay();
  }
});

overlay.addEventListener('pointerleave', () => {
  if (state.pointer || state.uploading) return;
  state.hover = null;
  drawOverlay();
});

window.addEventListener('keydown', (event) => {
  if (state.uploading) return;
  if (event.key === 'Enter') {
    event.preventDefault();
    void acceptSelection(activeNorm());
    return;
  }
  if (event.key === 'Escape') {
    event.preventDefault();
    state.pointer = null;
    state.dragging = null;
    state.hover = null;
    state.selection = FULL_RECT;
    drawOverlay();
  }
});

window.addEventListener('resize', () => {
  resizeOverlay();
  drawOverlay();
});

window.addEventListener('pagehide', () => {
  revokeImageUrl();
});

function acceptSelection(norm) {
  state.selection = clampRectNorm(norm);
  state.hover = null;
  state.dragging = null;
  drawOverlay();
  return uploadSelection();
}

async function uploadSelection() {
  const selection = state.selection;
  if (!selection || selection.w <= 0 || selection.h <= 0 || state.uploading) return;
  try {
    state.uploading = true;
    hideHint();
    const imageData = cropSelection(selection);
    const res = await fetch(`${state.capture.serverOrigin}/api/screenshots`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        imageData,
        sourceUrl: state.capture.sourceUrl || '',
        pageTitle: state.capture.pageTitle || '',
      }),
    });
    if (!res.ok) {
      const payload = await res.json().catch(() => null);
      throw new Error(payload?.error?.message || `${res.status} ${res.statusText}`);
    }
    const payload = await res.json();
    if (state.captureKey) {
      await PandaCaptureStore.deleteCapture(state.captureKey);
      await chrome.storage.session.remove(state.captureKey);
    }
    revokeImageUrl();
    location.replace(`${state.capture.serverOrigin}${payload.url}`);
  } catch (error) {
    state.uploading = false;
    showMessage(error instanceof Error ? error.message : String(error));
    message.hidden = false;
  }
}

async function loadCapture(captureKey) {
  const capture = await PandaCaptureStore.getCapture(captureKey);
  if (capture) return capture;

  const payload = await chrome.storage.session.get(captureKey);
  return payload[captureKey];
}

function imageSource(capture) {
  if (capture.imageBlob) {
    revokeImageUrl();
    state.imageUrl = URL.createObjectURL(capture.imageBlob);
    return state.imageUrl;
  }
  return capture.imageData;
}

function revokeImageUrl() {
  if (!state.imageUrl) return;
  URL.revokeObjectURL(state.imageUrl);
  state.imageUrl = null;
}

// hitTest picks the smallest element box that contains the point, mirroring how
// DevTools highlights the most specific element under the cursor.
function hitTest(norm) {
  let best = null;
  let bestArea = Infinity;
  for (const rect of state.elements) {
    if (norm.x < rect.x || norm.y < rect.y || norm.x > rect.x + rect.w || norm.y > rect.y + rect.h) continue;
    const area = rect.w * rect.h;
    if (area < bestArea) {
      bestArea = area;
      best = rect;
    }
  }
  return best;
}

function activeNorm() {
  if (state.dragging) return rectPxToNorm(normalizedRect(state.dragging.start, state.dragging.current));
  if (state.hover) return state.hover;
  return state.selection ?? FULL_RECT;
}

function cropSelection(selection) {
  const sx = Math.round(selection.x * image.naturalWidth);
  const sy = Math.round(selection.y * image.naturalHeight);
  const sw = Math.max(1, Math.round(selection.w * image.naturalWidth));
  const sh = Math.max(1, Math.round(selection.h * image.naturalHeight));
  const canvas = document.createElement('canvas');
  canvas.width = sw;
  canvas.height = sh;
  const cropCtx = canvas.getContext('2d');
  cropCtx.drawImage(image, sx, sy, sw, sh, 0, 0, sw, sh);
  return canvas.toDataURL('image/png');
}

function resizeOverlay() {
  overlay.width = image.clientWidth;
  overlay.height = image.clientHeight;
}

function drawOverlay() {
  ctx.clearRect(0, 0, overlay.width, overlay.height);
  ctx.fillStyle = 'rgba(15, 23, 42, 0.45)';
  ctx.fillRect(0, 0, overlay.width, overlay.height);

  let rect = null;
  if (state.dragging) {
    rect = normalizedRect(state.dragging.start, state.dragging.current);
  } else if (state.hover) {
    rect = rectNormToPx(state.hover);
  } else if (state.selection) {
    rect = rectNormToPx(state.selection);
  }
  if (!rect || rect.w <= 0 || rect.h <= 0) return;

  ctx.clearRect(rect.x, rect.y, rect.w, rect.h);
  ctx.strokeStyle = '#2563eb';
  ctx.lineWidth = 2;
  ctx.strokeRect(rect.x + 1, rect.y + 1, Math.max(0, rect.w - 2), Math.max(0, rect.h - 2));

  ctx.fillStyle = '#2563eb';
  for (const [hx, hy] of [
    [rect.x, rect.y],
    [rect.x + rect.w, rect.y],
    [rect.x, rect.y + rect.h],
    [rect.x + rect.w, rect.y + rect.h],
  ]) {
    ctx.fillRect(hx - 3, hy - 3, 6, 6);
  }
}

function localPoint(event) {
  const rect = overlay.getBoundingClientRect();
  return {
    x: clamp(event.clientX - rect.left, 0, overlay.width),
    y: clamp(event.clientY - rect.top, 0, overlay.height),
  };
}

function toNorm(point) {
  return {
    x: overlay.width ? point.x / overlay.width : 0,
    y: overlay.height ? point.y / overlay.height : 0,
  };
}

function rectNormToPx(rect) {
  return {
    x: rect.x * overlay.width,
    y: rect.y * overlay.height,
    w: rect.w * overlay.width,
    h: rect.h * overlay.height,
  };
}

function rectPxToNorm(rect) {
  return {
    x: overlay.width ? rect.x / overlay.width : 0,
    y: overlay.height ? rect.y / overlay.height : 0,
    w: overlay.width ? rect.w / overlay.width : 0,
    h: overlay.height ? rect.h / overlay.height : 0,
  };
}

function clampRectNorm(rect) {
  const x = clamp(rect.x, 0, 1);
  const y = clamp(rect.y, 0, 1);
  return {
    x,
    y,
    w: clamp(rect.w, 0, 1 - x),
    h: clamp(rect.h, 0, 1 - y),
  };
}

function normalizedRect(a, b) {
  return {
    x: Math.min(a.x, b.x),
    y: Math.min(a.y, b.y),
    w: Math.abs(a.x - b.x),
    h: Math.abs(a.y - b.y),
  };
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function showHint() {
  if (hint) hint.hidden = false;
}

function hideHint() {
  if (hint) hint.hidden = true;
}

function showMessage(value) {
  message.textContent = value;
  message.hidden = false;
}
