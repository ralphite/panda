const state = {
  capture: null,
  captureKey: null,
  imageUrl: null,
  selection: null,
  dragging: null,
  uploading: false,
};

const stage = document.getElementById('stage');
const image = document.getElementById('screenshot');
const overlay = document.getElementById('overlay');
const message = document.getElementById('message');
const resetButton = document.getElementById('reset');
const uploadButton = document.getElementById('upload');
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

  image.src = imageSource(state.capture);
  await image.decode();
  stage.hidden = false;
  message.hidden = true;
  resizeOverlay();
  drawOverlay();
}

resetButton.addEventListener('click', () => {
  state.selection = null;
  uploadButton.disabled = true;
  drawOverlay();
});

uploadButton.addEventListener('click', () => {
  void uploadSelection();
});

overlay.addEventListener('pointerdown', (event) => {
  const point = localPoint(event);
  state.dragging = { start: point, current: point };
  overlay.setPointerCapture(event.pointerId);
  state.selection = null;
  uploadButton.disabled = true;
  drawOverlay();
});

overlay.addEventListener('pointermove', (event) => {
  if (!state.dragging) return;
  state.dragging.current = localPoint(event);
  drawOverlay();
});

overlay.addEventListener('pointerup', (event) => {
  if (!state.dragging) return;
  overlay.releasePointerCapture(event.pointerId);
  const rect = normalizedRect(state.dragging.start, state.dragging.current);
  state.dragging = null;
  if (rect.w < 12 || rect.h < 12) {
    state.selection = null;
    drawOverlay();
    return;
  }
  state.selection = rect;
  uploadButton.disabled = false;
  drawOverlay();
  void uploadSelection();
});

window.addEventListener('resize', () => {
  resizeOverlay();
  drawOverlay();
});

window.addEventListener('pagehide', () => {
  revokeImageUrl();
});

async function uploadSelection() {
  if (!state.selection || state.uploading) return;
  try {
    state.uploading = true;
    uploadButton.disabled = true;
    uploadButton.textContent = 'Uploading';
    const imageData = cropSelection(state.selection);
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
    uploadButton.disabled = false;
    uploadButton.textContent = 'Upload';
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

function cropSelection(selection) {
  const scaleX = image.naturalWidth / image.clientWidth;
  const scaleY = image.naturalHeight / image.clientHeight;
  const sx = Math.round(selection.x * scaleX);
  const sy = Math.round(selection.y * scaleY);
  const sw = Math.round(selection.w * scaleX);
  const sh = Math.round(selection.h * scaleY);
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
  ctx.fillStyle = 'rgba(15, 23, 42, 0.35)';
  ctx.fillRect(0, 0, overlay.width, overlay.height);

  const selection = state.dragging ? normalizedRect(state.dragging.start, state.dragging.current) : state.selection;
  if (!selection) return;

  ctx.clearRect(selection.x, selection.y, selection.w, selection.h);
  ctx.strokeStyle = '#2563eb';
  ctx.lineWidth = 2;
  ctx.strokeRect(selection.x + 1, selection.y + 1, selection.w - 2, selection.h - 2);
  ctx.fillStyle = '#2563eb';
  ctx.fillRect(selection.x - 3, selection.y - 3, 6, 6);
  ctx.fillRect(selection.x + selection.w - 3, selection.y - 3, 6, 6);
  ctx.fillRect(selection.x - 3, selection.y + selection.h - 3, 6, 6);
  ctx.fillRect(selection.x + selection.w - 3, selection.y + selection.h - 3, 6, 6);
}

function localPoint(event) {
  const rect = overlay.getBoundingClientRect();
  return {
    x: clamp(event.clientX - rect.left, 0, overlay.width),
    y: clamp(event.clientY - rect.top, 0, overlay.height),
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

function showMessage(value) {
  message.textContent = value;
  message.hidden = false;
}
