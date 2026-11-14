"use client";
// Story Threads in the browser (ticket 14): the Follow button, and the Thread
// chip on a Brief card ("Yemen truce talks · 3", which opens the Thread's
// timeline, next to Follow).
//
// Whether a Thread is followed is kept in one small store for the whole page,
// so following on one card shows on every other card (and list row) of that
// Thread straight away. Each tap is saved at once through
// POST /api/threads/{id}/follow|unfollow, and undone on screen if that fails.
import Link from "next/link";
import { useEffect, useState, useSyncExternalStore } from "react";
import type { ThreadSummary } from "@/server/threads/threads";
import { formatNumber, localized } from "./i18n";
import { useLanguage } from "./language";
import s from "./thread-follow.module.css";

const followed = new Map<string, boolean>();
const listeners = new Set<() => void>();

function setFollowed(id: string, value: boolean): void {
  followed.set(id, value);
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Whether the Reader follows Thread `id`: what they last tapped on this page, else what the server said. */
export function useThreadFollowed(id: string, initial: boolean): boolean {
  return useSyncExternalStore(
    subscribe,
    () => followed.get(id) ?? initial,
    () => initial,
  );
}

/** The button stays disabled until React is running, so an early tap is not lost. */
function useHydrated(): boolean {
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);
  return ready;
}

export function FollowThreadButton({
  thread,
  basePath,
  className,
}: {
  thread: Pick<ThreadSummary, "id" | "followed" | "title" | "title_ar">;
  basePath: string;
  className?: string;
}) {
  const { lang, t } = useLanguage();
  const on = useThreadFollowed(thread.id, thread.followed);
  const ready = useHydrated();
  const [busy, setBusy] = useState(false);

  async function toggle() {
    const next = !on;
    setFollowed(thread.id, next);
    setBusy(true);
    try {
      const res = await fetch(`${basePath}/api/threads/${encodeURIComponent(thread.id)}/${next ? "follow" : "unfollow"}`, {
        method: "POST",
      });
      if (!res.ok) throw new Error(String(res.status));
    } catch {
      setFollowed(thread.id, !next);
    } finally {
      setBusy(false);
    }
  }

  const title = localized(thread, "title", lang);
  return (
    <button
      type="button"
      className={`${s.follow} ${on ? s.on : ""} ${className ?? ""}`}
      aria-pressed={on}
      aria-label={on ? t(`Following ${title}`, `تتابع ${title}`) : t(`Follow ${title}`, `تابع ${title}`)}
      disabled={!ready || busy}
      onClick={toggle}
    >
      {on ? t("Following", "متابَعة") : t("Follow", "تابع")}
    </button>
  );
}

/** On a Brief card: the Thread's name and how many developments it has, opening its timeline, and Follow. */
export function ThreadChip({ thread, basePath }: { thread: ThreadSummary; basePath: string }) {
  const { lang, t } = useLanguage();
  return (
    <div className={s.chipRow}>
      <Link
        href={`/threads/${encodeURIComponent(thread.id)}`}
        className={s.chip}
        data-testid="thread-chip"
        title={t("Open the Story Thread", "افتح القصة المتواصلة")}
      >
        <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden>
          <path d="M6 5v14M6 7h7M6 12h10M6 17h6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
        <span className={s.chipTitle} dir="auto">
          {localized(thread, "title", lang)}
        </span>{" "}
        <span className={s.count}>· {formatNumber(thread.count, lang)}</span>
      </Link>
      <FollowThreadButton thread={thread} basePath={basePath} className={s.onCard} />
    </div>
  );
}
