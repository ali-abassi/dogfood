// File/Blob values stay in IndexedDB, never base64 in localStorage.
const databaseName = 'dogfood-board-drafts-v1';
const storeName = 'projects';
let database;
function failure(error) { return error || new Error('Draft storage is unavailable.'); }
function openDatabase() {
  if (database) return database;
  database = new Promise((resolve, reject) => {
    const request = indexedDB.open(databaseName, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(storeName, { keyPath: 'key' });
    request.onsuccess = () => { request.result.onversionchange = () => { request.result.close(); database = null; }; resolve(request.result); };
    request.onerror = () => { database = null; reject(failure(request.error)); };
    request.onblocked = () => { database = null; reject(new Error('Close an older Dogfood tab to restore draft storage.')); };
  });
  return database;
}
export async function readStoredDraft(key) {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const request = db.transaction(storeName).objectStore(storeName).get(key);
    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(failure(request.error));
  });
}
function compareAndPut(store, previous, record, reject, transaction) {
  const request = store.get(record.key);
  request.onsuccess = () => {
    if ((request.result?.revision || null) !== previous) {
      reject(new Error('This project’s drafts changed in another tab. Copy your unsent changes before reloading; they have not overwritten the other tab.'));
      transaction.abort(); return;
    }
    store.put(record);
  };
}
export async function writeStoredDraft(previous, record) {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(storeName, 'readwrite');
    transaction.oncomplete = () => resolve(record.revision);
    transaction.onerror = () => reject(failure(transaction.error));
    transaction.onabort = () => reject(failure(transaction.error));
    compareAndPut(transaction.objectStore(storeName), previous, record, reject, transaction);
  });
}
