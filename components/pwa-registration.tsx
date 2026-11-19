"use client";

import { useEffect } from "react";

export function PwaRegistration() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    // A cache-first service worker makes local development look like an old
    // deployed build. Clear it here so `npm run dev` always reflects source.
    if (process.env.NODE_ENV !== "production") {
      void navigator.serviceWorker.getRegistrations().then(registrations => Promise.all(registrations.map(registration => registration.unregister())));
      void caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith("solgain-shell-")).map(key => caches.delete(key))));
      return;
    }

    void navigator.serviceWorker.register("/sw.js").catch(() => {
      // Installation remains available even if offline support cannot be registered.
    });
  }, []);

  return null;
}
