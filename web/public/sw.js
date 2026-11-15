// The Morning Brief service worker (ticket 18). Registered for the app's base
// path only (scope "/brief", served with Service-Worker-Allowed), so it never
// touches the rest of the domain.
// It shows push notifications and opens the app on tap. It does not cache or
// intercept requests: the Brief is always fetched fresh.
/* eslint-disable no-restricted-globals */

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

/** The app's root URL, e.g. https://example.com/brief (the scope, without a trailing slash). */
function appRoot() {
  return self.registration.scope.replace(/\/+$/, "");
}

/** A path inside the app ("/threads/x", "/") as a full URL under this worker's scope. */
function inScope(path) {
  const rest = String(path || "/").replace(/^\/+/, "");
  return rest ? `${appRoot()}/${rest}` : appRoot() || self.registration.scope;
}

// The app sends {title, body, url, tag, lang, dir} (src/server/push/edition-pushes.ts).
self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { body: event.data ? event.data.text() : "" };
  }
  event.waitUntil(
    self.registration.showNotification(data.title || "Morning Brief", {
      body: data.body || "",
      tag: data.tag || undefined,
      lang: data.lang || undefined,
      dir: data.dir || "auto",
      icon: inScope("icons/icon-192.png"),
      badge: inScope("icons/badge-96.png"),
      data: { url: inScope(data.url) },
    }),
  );
});

// Tapping a notification focuses an open Brief window (moving it to the page) or opens one.
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || inScope("/");
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      const open = windows.find((w) => w.url === appRoot() || w.url.startsWith(`${appRoot()}/`));
      if (open) {
        await open.focus();
        if ("navigate" in open) await open.navigate(url);
        return;
      }
      await self.clients.openWindow(url);
    })(),
  );
});

// The browser replaced the subscription (keys rotated or it expired): tell the app about the new one.
self.addEventListener("pushsubscriptionchange", (event) => {
  event.waitUntil(
    (async () => {
      const old = event.oldSubscription;
      const next =
        event.newSubscription ||
        (old && old.options ? await self.registration.pushManager.subscribe(old.options) : null);
      const api = inScope("api/push/subscriptions");
      if (next) {
        await fetch(api, {
          method: "POST",
          credentials: "same-origin",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(next),
        });
      }
      if (old && (!next || old.endpoint !== next.endpoint)) {
        await fetch(api, {
          method: "DELETE",
          credentials: "same-origin",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ endpoint: old.endpoint }),
        });
      }
    })(),
  );
});
