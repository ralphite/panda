import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);
const BACKGROUND_PATH = new URL('./background.js', import.meta.url).pathname;

test('removes a temporary capture when its crop tab closes', async () => {
  const { api, restore, store } = await loadBackground();
  try {
    Object.assign(store, {
      'capture:abc': { imageData: 'data:image/png;base64,abc', createdAt: 1000 },
      'captureTab:42': { captureKey: 'capture:abc', createdAt: 1000 },
    });

    await api.cleanupCaptureForClosedTab(42);

    assert.equal(store['capture:abc'], undefined);
    assert.equal(store['captureTab:42'], undefined);
  } finally {
    restore();
  }
});

test('cleans expired, stale, and legacy untracked captures', async () => {
  const now = 2_000_000;
  const { api, restore, store } = await loadBackground({}, { openTabs: [7], now });
  try {
    Object.assign(store, {
      'capture:expired': { imageData: 'expired', createdAt: now - 31 * 60 * 1000 },
      'capture:fresh': { imageData: 'fresh', createdAt: now - 60 * 1000 },
      'capture:legacy': { imageData: 'legacy', createdAt: now - 60 * 1000 },
      'capture:staleTab': { imageData: 'stale', createdAt: now - 60 * 1000 },
      'captureTab:7': { captureKey: 'capture:fresh', createdAt: now - 60 * 1000 },
      'captureTab:9': { captureKey: 'capture:staleTab', createdAt: now - 60 * 1000 },
      'captureTab:11': { captureKey: 'capture:missing', createdAt: now - 60 * 1000 },
    });

    await api.cleanupStaleCaptures({ now, removeUntracked: true });

    assert.equal(store['capture:expired'], undefined);
    assert.equal(store['capture:legacy'], undefined);
    assert.equal(store['capture:staleTab'], undefined);
    assert.equal(store['captureTab:9'], undefined);
    assert.equal(store['captureTab:11'], undefined);
    assert.equal(store['capture:fresh'].imageData, 'fresh');
    assert.equal(store['captureTab:7'].captureKey, 'capture:fresh');
  } finally {
    restore();
  }
});

async function loadBackground(initialStore, options = {}) {
  const store = { ...initialStore };
  const openTabs = new Set(options.openTabs ?? []);
  const originalChrome = globalThis.chrome;
  const originalTestHook = globalThis.__pandaBackgroundTest;
  const originalDateNow = Date.now;

  globalThis.__pandaBackgroundTest = {};
  Date.now = () => options.now ?? originalDateNow();
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
        get: async (keys) => getStorageValues(store, keys),
        remove: async (keys) => {
          const list = Array.isArray(keys) ? keys : [keys];
          for (const key of list) delete store[key];
        },
        set: async (values) => {
          Object.assign(store, values);
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
    restore: () => {
      globalThis.chrome = originalChrome;
      globalThis.__pandaBackgroundTest = originalTestHook;
      Date.now = originalDateNow;
    },
    store,
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
