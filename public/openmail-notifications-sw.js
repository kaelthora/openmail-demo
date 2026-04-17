/* global self, indexedDB */

const API_BASE = "https://openmail-demo-production.up.railway.app";

const DB_NAME = "openmail-notify-v1";
const STORE = "dismissed";

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

function dismissAdd(id) {
  return new Promise((resolve) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "id" });
      }
    };
    req.onerror = () => resolve();
    req.onsuccess = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.close();
        resolve();
        return;
      }
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).put({ id, t: Date.now() });
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => {
        db.close();
        resolve();
      };
    };
  });
}

self.addEventListener("notificationclick", (event) => {
  const n = event.notification;
  const data = n.data || {};
  const mailId = data.mailId;
  const origin = data.origin || self.location.origin;
  n.close();

  if (!mailId) {
    event.waitUntil(Promise.resolve());
    return;
  }

  const action = event.action;

  if (action === "ignore") {
    event.waitUntil(dismissAdd(mailId));
    return;
  }

  if (action === "quick-send") {
    event.waitUntil(
      fetch(`${API_BASE}/api/emails/quick-reply`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mailId }),
        credentials: "include",
      })
        .then((res) => res.json().catch(() => ({})))
        .then((j) => {
          if (j && j.success === true) return dismissAdd(mailId);
          const err = (j && j.error) || "Open OpenMail to reply manually.";
          return self.registration.showNotification("Could not quick send", {
            body: err,
            tag: `openmail-err-${mailId}`,
          });
        })
        .catch(() =>
          self.registration.showNotification("Quick send failed", {
            body: "Open OpenMail when you are online.",
            tag: `openmail-err-${mailId}`,
          })
        )
    );
    return;
  }

  const url = `${origin}/openmail?mail=${encodeURIComponent(mailId)}`;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      for (const c of clientList) {
        if (c.url.includes("/openmail") && "focus" in c) return c.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow(url);
    })
  );
});
