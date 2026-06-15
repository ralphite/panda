import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);
const BACKGROUND_PATH = new URL('./background.js', import.meta.url).pathname;

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
  const openTabs = new Set(options.openTabs ?? []);
  const originalChrome = globalThis.chrome;
  const originalCaptureStore = globalThis.PandaCaptureStore;
  const originalTestHook = globalThis.__pandaBackgroundTest;
  const originalDateNow = Date.now;

  globalThis.__pandaBackgroundTest = {};
  Date.now = () => options.now ?? originalDateNow();
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
      onClicked: { addListener() {} },
      setBadgeText: async () => {},
      setBadgeBackgroundColor: async () => {},
    },
    alarms: {
      create: async () => {},
      onAlarm: { addListener() {} },
    },
    runtime: {
      getURL: (path) => `chrome-extension://panda/${path}`,
      onInstalled: { addListener() {} },
      onStartup: { addListener() {} },
    },
    scripting: {
      executeScript: async () => [{ result: null }],
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
      captureVisibleTab: async () => 'data:image/png;base64,',
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

  return {
    api,
    captures,
    restore: () => {
      globalThis.chrome = originalChrome;
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
