const SERVER_ORIGIN = 'http://localhost:8086';

chrome.action.onClicked.addListener((tab) => {
  void captureTab(tab);
});

async function captureTab(tab) {
  if (!tab.id || !tab.windowId || tab.url?.startsWith('chrome://') || tab.url?.startsWith('chrome-extension://')) {
    await openErrorTab(tab, 'This page cannot be captured by a Chrome extension.');
    return;
  }

  try {
    await chrome.action.setBadgeText({ text: '...' });
    await chrome.action.setBadgeBackgroundColor({ color: '#2563eb' });

    const capture = await captureFullPage(tab);
    const captureId = crypto.randomUUID();
    await chrome.storage.session.set({
      [`capture:${captureId}`]: {
        imageData: capture.imageData,
        sourceUrl: capture.url || tab.url || '',
        pageTitle: capture.title || tab.title || '',
        serverOrigin: SERVER_ORIGIN,
        createdAt: Date.now(),
      },
    });

    await chrome.tabs.create({
      windowId: tab.windowId,
      index: tab.index,
      active: true,
      url: chrome.runtime.getURL(`capture.html?id=${encodeURIComponent(captureId)}`),
    });
  } catch (error) {
    await openErrorTab(tab, error instanceof Error ? error.message : String(error));
  } finally {
    await chrome.action.setBadgeText({ text: '' });
  }
}

async function captureFullPage(tab) {
  const metrics = await execute(tab.id, () => {
    const doc = document.documentElement;
    const body = document.body;
    return {
      url: location.href,
      title: document.title,
      scrollWidth: Math.max(doc.scrollWidth, body?.scrollWidth || 0, doc.clientWidth),
      scrollHeight: Math.max(doc.scrollHeight, body?.scrollHeight || 0, doc.clientHeight),
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
      originalX: window.scrollX,
      originalY: window.scrollY,
    };
  });

  const positions = [];
  const xs = axisPositions(Math.max(0, metrics.scrollWidth - metrics.viewportWidth), metrics.viewportWidth);
  const ys = axisPositions(Math.max(0, metrics.scrollHeight - metrics.viewportHeight), metrics.viewportHeight);
  for (const y of ys) {
    for (const x of xs) {
      positions.push({ x, y });
    }
  }

  let canvas;
  let ctx;
  let scaleX = 1;
  let scaleY = 1;

  for (const position of uniquePositions(positions)) {
    const actual = await execute(tab.id, (x, y) => new Promise((resolve) => {
      window.scrollTo(x, y);
      requestAnimationFrame(() => {
        setTimeout(() => resolve({ x: window.scrollX, y: window.scrollY }), 80);
      });
    }), [position.x, position.y]);

    const visibleData = await chrome.tabs.captureVisibleTab(tab.windowId, { format: 'png' });
    const bitmap = await dataURLToBitmap(visibleData);

    if (!canvas) {
      scaleX = bitmap.width / metrics.viewportWidth;
      scaleY = bitmap.height / metrics.viewportHeight;
      canvas = new OffscreenCanvas(Math.round(metrics.scrollWidth * scaleX), Math.round(metrics.scrollHeight * scaleY));
      ctx = canvas.getContext('2d');
    }

    const destX = Math.round(actual.x * scaleX);
    const destY = Math.round(actual.y * scaleY);
    const sourceW = Math.min(bitmap.width, Math.round((metrics.scrollWidth - actual.x) * scaleX));
    const sourceH = Math.min(bitmap.height, Math.round((metrics.scrollHeight - actual.y) * scaleY));
    ctx.drawImage(bitmap, 0, 0, sourceW, sourceH, destX, destY, sourceW, sourceH);
    bitmap.close();
  }

  await execute(tab.id, (x, y) => {
    window.scrollTo(x, y);
  }, [metrics.originalX, metrics.originalY]);

  const blob = await canvas.convertToBlob({ type: 'image/png' });
  const imageData = await blobToDataURL(blob);
  return { imageData, url: metrics.url, title: metrics.title };
}

async function execute(tabId, func, args = []) {
  const [result] = await chrome.scripting.executeScript({
    target: { tabId },
    func,
    args,
  });
  return result.result;
}

function uniquePositions(positions) {
  const seen = new Set();
  return positions.filter((position) => {
    const key = `${position.x}:${position.y}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function axisPositions(max, step) {
  if (max <= 0) return [0];
  const values = [];
  for (let value = 0; value < max; value += step) {
    values.push(value);
  }
  values.push(max);
  return [...new Set(values)];
}

async function dataURLToBitmap(dataUrl) {
  const blob = await (await fetch(dataUrl)).blob();
  return createImageBitmap(blob);
}

function blobToDataURL(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

async function openErrorTab(tab, message) {
  const captureId = crypto.randomUUID();
  await chrome.storage.session.set({
    [`capture:${captureId}`]: {
      error: message,
      serverOrigin: SERVER_ORIGIN,
      createdAt: Date.now(),
    },
  });
  await chrome.tabs.create({
    windowId: tab.windowId,
    index: tab.index,
    active: true,
    url: chrome.runtime.getURL(`capture.html?id=${encodeURIComponent(captureId)}`),
  });
}
