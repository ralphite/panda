const SERVER_ORIGIN = 'http://localhost:8086';
const CAPTURE_KEY_PREFIX = 'capture:';
const CAPTURE_TAB_KEY_PREFIX = 'captureTab:';
const CAPTURE_MAX_AGE_MS = 30 * 60 * 1000;
const CLEANUP_ALARM_NAME = 'panda-capture-cleanup';
const CLEANUP_INTERVAL_MINUTES = 5;

void installCleanupAlarm();
const initialCleanup = cleanupStaleCaptures({ removeUntracked: true });
void initialCleanup;

chrome.action.onClicked.addListener((tab) => {
  void captureTab(tab);
});

chrome.runtime.onInstalled.addListener(() => {
  void installCleanupAlarm();
  void cleanupStaleCaptures({ removeUntracked: true });
});

chrome.runtime.onStartup.addListener(() => {
  void installCleanupAlarm();
  void cleanupStaleCaptures({ removeUntracked: true });
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === CLEANUP_ALARM_NAME) {
    void cleanupStaleCaptures();
  }
});

chrome.tabs.onRemoved.addListener((tabId) => {
  void cleanupCaptureForClosedTab(tabId);
});

async function captureTab(tab) {
  if (!tab.id || !tab.windowId || tab.url?.startsWith('chrome://') || tab.url?.startsWith('chrome-extension://')) {
    await openErrorTab(tab, 'This page cannot be captured by a Chrome extension.');
    return;
  }

  let captureKey = null;
  try {
    await cleanupStaleCaptures();
    await chrome.action.setBadgeText({ text: '...' });
    await chrome.action.setBadgeBackgroundColor({ color: '#2563eb' });

    const capture = await captureFullPage(tab);
    const captureId = crypto.randomUUID();
    captureKey = `${CAPTURE_KEY_PREFIX}${captureId}`;
    await chrome.storage.session.set({
      [captureKey]: {
        imageData: capture.imageData,
        sourceUrl: capture.url || tab.url || '',
        pageTitle: capture.title || tab.title || '',
        serverOrigin: SERVER_ORIGIN,
        createdAt: Date.now(),
      },
    });

    const captureTab = await chrome.tabs.create({
      windowId: tab.windowId,
      index: tab.index,
      active: true,
      url: chrome.runtime.getURL(`capture.html?id=${encodeURIComponent(captureId)}`),
    });
    await trackCaptureTab(captureTab.id, captureKey);
    captureKey = null;
  } catch (error) {
    if (captureKey) {
      await chrome.storage.session.remove(captureKey).catch(() => {});
    }
    await openErrorTab(tab, error instanceof Error ? error.message : String(error));
  } finally {
    await chrome.action.setBadgeText({ text: '' });
  }
}

async function installCleanupAlarm() {
  await chrome.alarms.create(CLEANUP_ALARM_NAME, {
    delayInMinutes: CLEANUP_INTERVAL_MINUTES,
    periodInMinutes: CLEANUP_INTERVAL_MINUTES,
  });
}

async function cleanupStaleCaptures(options = {}) {
  const now = options.now ?? Date.now();
  const removeUntracked = options.removeUntracked ?? false;
  const entries = await chrome.storage.session.get(null);
  const keysToRemove = new Set();
  const trackedCaptureKeys = new Set();

  for (const [key, value] of Object.entries(entries)) {
    if (!key.startsWith(CAPTURE_TAB_KEY_PREFIX)) continue;
    const captureKey = captureKeyFromTabRef(value);
    if (captureKey) trackedCaptureKeys.add(captureKey);
  }

  for (const [key, value] of Object.entries(entries)) {
    if (!key.startsWith(CAPTURE_KEY_PREFIX)) continue;
    if (isExpiredCapture(value, now) || (removeUntracked && !trackedCaptureKeys.has(key))) {
      keysToRemove.add(key);
    }
  }

  for (const [key, value] of Object.entries(entries)) {
    if (!key.startsWith(CAPTURE_TAB_KEY_PREFIX)) continue;

    const captureKey = captureKeyFromTabRef(value);
    if (!captureKey || !entries[captureKey]) {
      keysToRemove.add(key);
      continue;
    }

    const tabId = Number(key.slice(CAPTURE_TAB_KEY_PREFIX.length));
    if (captureKey && keysToRemove.has(captureKey)) {
      keysToRemove.add(key);
      continue;
    }

    if (!Number.isInteger(tabId) || !(await tabExists(tabId))) {
      keysToRemove.add(key);
      if (captureKey) keysToRemove.add(captureKey);
    }
  }

  if (keysToRemove.size > 0) {
    await chrome.storage.session.remove([...keysToRemove]);
  }
}

async function cleanupCaptureForClosedTab(tabId) {
  const tabKey = captureTabKey(tabId);
  const entries = await chrome.storage.session.get(tabKey);
  const captureKey = captureKeyFromTabRef(entries[tabKey]);
  const keysToRemove = [tabKey];
  if (captureKey) keysToRemove.push(captureKey);
  await chrome.storage.session.remove(keysToRemove);
}

async function trackCaptureTab(tabId, captureKey) {
  if (!tabId || !captureKey) return;
  await chrome.storage.session.set({
    [captureTabKey(tabId)]: {
      captureKey,
      createdAt: Date.now(),
    },
  });
}

function captureTabKey(tabId) {
  return `${CAPTURE_TAB_KEY_PREFIX}${tabId}`;
}

function captureKeyFromTabRef(value) {
  if (typeof value === 'string') return value;
  if (value && typeof value.captureKey === 'string') return value.captureKey;
  return '';
}

function isExpiredCapture(value, now) {
  const createdAt = value && typeof value.createdAt === 'number' ? value.createdAt : NaN;
  return !Number.isFinite(createdAt) || now - createdAt >= CAPTURE_MAX_AGE_MS;
}

async function tabExists(tabId) {
  try {
    await chrome.tabs.get(tabId);
    return true;
  } catch {
    return false;
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
  const captureKey = `${CAPTURE_KEY_PREFIX}${captureId}`;
  await chrome.storage.session.set({
    [captureKey]: {
      error: message,
      serverOrigin: SERVER_ORIGIN,
      createdAt: Date.now(),
    },
  });
  const captureTab = await chrome.tabs.create({
    windowId: tab.windowId,
    index: tab.index,
    active: true,
    url: chrome.runtime.getURL(`capture.html?id=${encodeURIComponent(captureId)}`),
  });
  await trackCaptureTab(captureTab.id, captureKey);
}

if (globalThis.__pandaBackgroundTest) {
  globalThis.__pandaBackgroundTest.api = {
    cleanupCaptureForClosedTab,
    cleanupStaleCaptures,
    initialCleanup,
  };
}
