const DB_NAME = "openmail-notify-v1";
const STORE = "dismissed";
const DB_VER = 1;

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VER);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "id" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/** IDs the user dismissed from a system notification (synced with service worker). */
export async function readDismissedNotifyIds(): Promise<Set<string>> {
  if (typeof indexedDB === "undefined") return new Set();
  try {
    const db = await openDb();
    if (!db.objectStoreNames.contains(STORE)) {
      db.close();
      return new Set();
    }
    const rows = await new Promise<{ id: string }[]>((resolve, reject) => {
      const tx = db.transaction(STORE, "readonly");
      const q = tx.objectStore(STORE).getAll();
      q.onsuccess = () => resolve((q.result as { id: string }[]) ?? []);
      q.onerror = () => reject(q.error);
    });
    db.close();
    return new Set(rows.map((r) => r.id).filter(Boolean));
  } catch {
    return new Set();
  }
}
