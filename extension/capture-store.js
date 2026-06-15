(function () {
  const DB_NAME = 'panda-capture-store';
  const DB_VERSION = 1;
  const STORE_NAME = 'captures';

  let dbPromise;

  function openDb() {
    if (!dbPromise) {
      dbPromise = new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onupgradeneeded = () => {
          const db = request.result;
          if (!db.objectStoreNames.contains(STORE_NAME)) {
            const store = db.createObjectStore(STORE_NAME, { keyPath: 'key' });
            store.createIndex('createdAt', 'createdAt');
          }
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
        request.onblocked = () => reject(new Error('IndexedDB upgrade was blocked.'));
      });
    }
    return dbPromise;
  }

  async function putCapture(capture) {
    return runWrite((store) => store.put(capture));
  }

  async function getCapture(key) {
    return runRequest('readonly', (store) => store.get(key));
  }

  async function deleteCapture(key) {
    return deleteCaptures([key]);
  }

  async function deleteCaptures(keys) {
    const uniqueKeys = [...new Set(keys)].filter(Boolean);
    if (uniqueKeys.length === 0) return;

    const db = await openDb();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      for (const key of uniqueKeys) {
        store.delete(key);
      }
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error || new Error('IndexedDB transaction was aborted.'));
    });
  }

  async function listCaptures() {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const captures = [];
      const transaction = db.transaction(STORE_NAME, 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.openCursor();

      request.onsuccess = () => {
        const cursor = request.result;
        if (!cursor) {
          resolve(captures);
          return;
        }
        captures.push(cursor.value);
        cursor.continue();
      };
      request.onerror = () => reject(request.error);
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error || new Error('IndexedDB transaction was aborted.'));
    });
  }

  async function runWrite(createRequest) {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readwrite');
      const request = createRequest(transaction.objectStore(STORE_NAME));
      request.onerror = () => reject(request.error);
      transaction.oncomplete = () => resolve(request.result);
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error || new Error('IndexedDB transaction was aborted.'));
    });
  }

  async function runRequest(mode, createRequest) {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, mode);
      const request = createRequest(transaction.objectStore(STORE_NAME));
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error || new Error('IndexedDB transaction was aborted.'));
    });
  }

  globalThis.PandaCaptureStore = {
    deleteCapture,
    deleteCaptures,
    getCapture,
    listCaptures,
    putCapture,
  };
})();
