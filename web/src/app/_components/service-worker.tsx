"use client";
// Registers the service worker (public/sw.js, ticket 18) for the app's base
// path on every page, so the Brief can be installed from anywhere in it, and
// keeps the browser's install prompt for the Me tab's "Install" button.
import { useEffect } from "react";

/** The browser's install prompt (Chromium), kept until the Reader asks to install. */
export interface InstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const holder = (typeof window === "undefined" ? {} : window) as { __briefInstallPrompt?: InstallPromptEvent | null };
/** Fired on window when the install prompt becomes available or is used. */
export const INSTALL_PROMPT_EVENT = "brief:install-prompt";

export function installPrompt(): InstallPromptEvent | null {
  return holder.__briefInstallPrompt ?? null;
}

export function clearInstallPrompt(): void {
  holder.__briefInstallPrompt = null;
  window.dispatchEvent(new Event(INSTALL_PROMPT_EVENT));
}

/**
 * The service worker's scope: the base path itself ("/brief", not "/brief/",
 * since the Brief page is "/brief"). It is wider than the worker's folder, so
 * sw.js is served with Service-Worker-Allowed (next.config.ts).
 */
export function serviceWorkerScope(basePath: string): string {
  return basePath || "/";
}

export function ServiceWorkerRegistration({ basePath }: { basePath: string }) {
  useEffect(() => {
    const keep = (event: Event) => {
      event.preventDefault(); // shown from the Me tab instead of the browser's own banner
      holder.__briefInstallPrompt = event as InstallPromptEvent;
      window.dispatchEvent(new Event(INSTALL_PROMPT_EVENT));
    };
    window.addEventListener("beforeinstallprompt", keep);
    window.addEventListener("appinstalled", clearInstallPrompt);
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker
        .register(`${basePath}/sw.js`, { scope: serviceWorkerScope(basePath), updateViaCache: "none" })
        .catch(() => {
          // Not available (a private window, or not https): the app still works, just not installed or pushed to.
        });
    }
    return () => {
      window.removeEventListener("beforeinstallprompt", keep);
      window.removeEventListener("appinstalled", clearInstallPrompt);
    };
  }, [basePath]);
  return null;
}
