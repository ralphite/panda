import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);
const BACKGROUND_PATH = new URL('./background.js', import.meta.url).pathname;

test('default action captures only the visible viewport', async () => {
  const { api, captures, metrics, restore, sessionStore } = await loadBackground({}, {
    captureVisibleDataUrl: 'data:image/png;base64,cG5n',
  });
  try {
    await api.onActionClicked({
      id: 55,
      windowId: 1,
      index: 0,
      title: 'Visible page',
      url: 'https://example.test/visible',
    });

    const capture = Object.values(captures)[0];
    assert.equal(metrics.captureVisibleTabCalls, 1);
    assert.equal(metrics.executeScriptCalls, 0);
    assert.equal(capture.pageTitle, 'Visible page');
    assert.equal(capture.sourceUrl, 'https://example.test/visible');
    assert.equal(capture.imageBlob.size, 3);
    assert.deepEqual(Object.keys(sessionStore), ['captureTab:100']);
  } finally {
    restore();
  }
});

test('context menu captures a full page screenshot', async () => {
  const { api, captures, metrics, restore } = await loadBackground({}, {
    captureVisibleDataUrl: 'data:image/png;base64,cG5n',
    metricsResult: {
      url: 'https://example.test/full',
      title: 'Full page',
      scrollWidth: 100,
      scrollHeight: 80,
      viewportWidth: 100,
      viewportHeight: 80,
      originalX: 0,
      originalY: 0,
    },
    scrollResult: { x: 0, y: 0 },
  });
  try {
    await api.initialContextMenu;
    assert.equal(metrics.contextMenuRemoveAllCalls, 1);
    assert.equal(metrics.contextMenuCreateCalls, 1);
    assert.equal(metrics.contextMenuCreateArgs[0].title, 'Full-page Screenshot');

    await api.onContextMenuClicked({ menuItemId: 'panda-full-page-screenshot' }, {
      id: 56,
      windowId: 1,
      index: 0,
      title: 'Tab title',
      url: 'https://example.test/tab',
    });

    const capture = Object.values(captures)[0];
    assert.equal(metrics.captureVisibleTabCalls, 1);
    assert.equal(metrics.executeScriptCalls > 0, true);
    assert.equal(capture.pageTitle, 'Full page');
    assert.equal(capture.sourceUrl, 'https://example.test/full');
    assert.equal(capture.imageBlob.size, 3);
  } finally {
    restore();
  }
});

test('removes a temporary capture when its crop tab closes', async () => {
  const { api, captures, restore, sessionStore } = await loadBackground();
  try {
    Object.assign(captures, {
      'capture:abc': { key: 'capture:abc', imageBlob: { size: 4 }, createdAt: 1000 },
    });
    Object.assign(sessionStore, {
      'captureTab:42': { captureKey: 'capture:abc', createdAt: 1000 },
    });

    await api.cleanupCaptureForClosedTab(42);

    assert.equal(captures['capture:abc'], undefined);
    assert.equal(sessionStore['captureTab:42'], undefined);
  } finally {
    restore();
  }
});

test('cleans expired, stale, and legacy untracked captures', async () => {
  const now = 2_000_000;
  const { api, captures, restore, sessionStore } = await loadBackground({}, { openTabs: [7, 13], now });
  try {
    Object.assign(captures, {
      'capture:expired': { key: 'capture:expired', imageBlob: 'expired', createdAt: now - 31 * 60 * 1000 },
      'capture:fresh': { key: 'capture:fresh', imageBlob: 'fresh', createdAt: now - 60 * 1000 },
      'capture:legacy': { key: 'capture:legacy', imageBlob: 'legacy', createdAt: now - 60 * 1000 },
      'capture:staleTab': { key: 'capture:staleTab', imageBlob: 'stale', createdAt: now - 60 * 1000 },
    });
    Object.assign(sessionStore, {
      'capture:oldSession': { imageData: 'old', createdAt: now - 31 * 60 * 1000 },
      'capture:trackedSession': {
        imageData: 'data:image/png;base64,cG5n',
        createdAt: now - 60 * 1000,
        pageTitle: 'Legacy tracked',
        sourceUrl: 'https://legacy.test',
      },
      'captureTab:7': { captureKey: 'capture:fresh', createdAt: now - 60 * 1000 },
      'captureTab:9': { captureKey: 'capture:staleTab', createdAt: now - 60 * 1000 },
      'captureTab:11': { captureKey: 'capture:missing', createdAt: now - 60 * 1000 },
      'captureTab:13': { captureKey: 'capture:trackedSession', createdAt: now - 60 * 1000 },
    });

    await api.cleanupStaleCaptures({ now, removeUntracked: true });

    assert.equal(captures['capture:expired'], undefined);
    assert.equal(captures['capture:legacy'], undefined);
    assert.equal(captures['capture:staleTab'], undefined);
    assert.equal(sessionStore['capture:oldSession'], undefined);
    assert.equal(sessionStore['capture:trackedSession'], undefined);
    assert.equal(sessionStore['captureTab:9'], undefined);
    assert.equal(sessionStore['captureTab:11'], undefined);
    assert.equal(captures['capture:fresh'].imageBlob, 'fresh');
    assert.equal(sessionStore['captureTab:7'].captureKey, 'capture:fresh');
    assert.equal(captures['capture:trackedSession'].pageTitle, 'Legacy tracked');
    assert.equal(captures['capture:trackedSession'].imageBlob.size, 3);
    assert.equal(sessionStore['captureTab:13'].captureKey, 'capture:trackedSession');
  } finally {
    restore();
  }
});

test('stores temporary image data in IndexedDB only', async () => {
  const now = 3_000_000;
  const imageBlob = new Blob(['png'], { type: 'image/png' });
  const { api, captures, restore, sessionStore } = await loadBackground({}, { now });
  try {
    await api.storeCapture('capture:new', {
      imageBlob,
      title: 'Captured title',
      url: 'https://example.test/page',
    }, {
      title: 'Tab title',
      url: 'https://example.test/tab',
    });

    assert.deepEqual(Object.keys(sessionStore), []);
    assert.equal(captures['capture:new'].imageBlob, imageBlob);
    assert.equal(captures['capture:new'].pageTitle, 'Captured title');
    assert.equal(captures['capture:new'].sourceUrl, 'https://example.test/page');
    assert.equal(captures['capture:new'].createdAt, now);
  } finally {
    restore();
  }
});

async function loadBackground(initialStore, options = {}) {
  const sessionStore = { ...initialStore };
  const captures = {};
  const eventHandlers = {};
  const metrics = {
    captureVisibleTabCalls: 0,
    contextMenuCreateArgs: [],
    contextMenuCreateCalls: 0,
    contextMenuRemoveAllCalls: 0,
    executeScriptCalls: 0,
  };
  const openTabs = new Set(options.openTabs ?? []);
  const originalChrome = globalThis.chrome;
  const originalCreateImageBitmap = globalThis.createImageBitmap;
  const originalOffscreenCanvas = globalThis.OffscreenCanvas;
  const originalCaptureStore = globalThis.PandaCaptureStore;
  const originalTestHook = globalThis.__pandaBackgroundTest;
  const originalDateNow = Date.now;

  globalThis.__pandaBackgroundTest = {};
  Date.now = () => options.now ?? originalDateNow();
  globalThis.createImageBitmap = async () => ({
    close() {},
    height: options.bitmapHeight ?? 80,
    width: options.bitmapWidth ?? 100,
  });
  globalThis.OffscreenCanvas = class {
    constructor(width, height) {
      this.width = width;
      this.height = height;
    }

    getContext() {
      return { drawImage() {} };
    }

    async convertToBlob() {
      return new Blob(['png'], { type: 'image/png' });
    }
  };
  globalThis.PandaCaptureStore = {
    deleteCapture: async (key) => {
      delete captures[key];
    },
    deleteCaptures: async (keys) => {
      for (const key of keys) {
        delete captures[key];
      }
    },
    getCapture: async (key) => captures[key],
    listCaptures: async () => Object.values(captures),
    putCapture: async (capture) => {
      captures[capture.key] = capture;
    },
  };
  globalThis.chrome = {
    action: {
      onClicked: { addListener(handler) { eventHandlers.actionClicked = handler; } },
      setBadgeText: async () => {},
      setBadgeBackgroundColor: async () => {},
    },
    alarms: {
      create: async () => {},
      onAlarm: { addListener() {} },
    },
    contextMenus: {
      create: async (args) => {
        metrics.contextMenuCreateCalls += 1;
        metrics.contextMenuCreateArgs.push(args);
      },
      onClicked: { addListener(handler) { eventHandlers.contextMenuClicked = handler; } },
      removeAll: async () => {
        metrics.contextMenuRemoveAllCalls += 1;
      },
    },
    runtime: {
      getURL: (path) => `chrome-extension://panda/${path}`,
      onInstalled: { addListener() {} },
      onStartup: { addListener() {} },
    },
    scripting: {
      executeScript: async ({ func }) => {
        metrics.executeScriptCalls += 1;
        if (String(func).includes('scrollWidth')) {
          return [{ result: options.metricsResult ?? null }];
        }
        return [{ result: options.scrollResult ?? null }];
      },
    },
    storage: {
      session: {
        get: async (keys) => getStorageValues(sessionStore, keys),
        remove: async (keys) => {
          const list = Array.isArray(keys) ? keys : [keys];
          for (const key of list) delete sessionStore[key];
        },
        set: async (values) => {
          Object.assign(sessionStore, values);
        },
      },
    },
    tabs: {
      captureVisibleTab: async () => {
        metrics.captureVisibleTabCalls += 1;
        return options.captureVisibleDataUrl ?? 'data:image/png;base64,';
      },
      create: async () => ({ id: 100 }),
      get: async (tabId) => {
        if (!openTabs.has(tabId)) throw new Error(`No tab with id ${tabId}`);
        return { id: tabId };
      },
      onRemoved: { addListener() {} },
    },
  };

  delete require.cache[require.resolve(BACKGROUND_PATH)];
  require(BACKGROUND_PATH);
  const api = globalThis.__pandaBackgroundTest.api;
  await api.initialCleanup;
  await api.initialContextMenu;

  return {
    api,
    captures,
    eventHandlers,
    metrics,
    restore: () => {
      globalThis.chrome = originalChrome;
      globalThis.createImageBitmap = originalCreateImageBitmap;
      globalThis.OffscreenCanvas = originalOffscreenCanvas;
      globalThis.PandaCaptureStore = originalCaptureStore;
      globalThis.__pandaBackgroundTest = originalTestHook;
      Date.now = originalDateNow;
    },
    sessionStore,
  };
}

function getStorageValues(store, keys) {
  if (keys === null) return { ...store };
  if (typeof keys === 'string') return { [keys]: store[keys] };
  if (Array.isArray(keys)) {
    return Object.fromEntries(keys.map((key) => [key, store[key]]));
  }
  return Object.fromEntries(
    Object.entries(keys).map(([key, fallback]) => [key, store[key] ?? fallback]),
  );
}
