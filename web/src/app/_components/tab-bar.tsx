"use client";
// Navigation: Brief · Threads · Saved & Search · Me, in the Reader's language.
// On a phone and an upright tablet they are the bottom tabs; on tablet
// landscape, PC and wide (rework ticket 09) the sidebar, which also lists the
// Reader's Topics with their Item counts while the Brief is open (the Brief
// fills `SIDEBAR_TOPICS` with <SidebarTopics>). CSS shows one or the other.
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import type { Brief } from "@/server/brief/compose";
import { formatNumber, topicName } from "./i18n";
import { Icon } from "./icons";
import { useLanguage } from "./language";
import s from "./tab-bar.module.css";

const TABS = [
  { href: "/", label: "Brief", label_ar: "الموجز", icon: "M5 4h14v16H5zM8 8h8M8 12h8M8 16h5" },
  { href: "/threads", label: "Threads", label_ar: "القصص المتواصلة", icon: "M6 5v14M6 7h7M6 12h10M6 17h6" },
  { href: "/saved", label: "Saved & Search", label_ar: "المحفوظ والبحث", icon: "M7 4h10v16l-5-4-5 4z" },
  { href: "/me", label: "Me", label_ar: "أنا", icon: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 20c1.5-3.5 4.5-5 8-5s6.5 1.5 8 5" },
] as const;

/** The id of the sidebar's Topics slot. */
const SIDEBAR_TOPICS = "sidebar-topics";

export function TabBar() {
  const pathname = usePathname();
  const { t } = useLanguage();
  // Signed out there is nowhere to go yet: the sign-in page has no tabs. Nor does onboarding, which comes first.
  if (pathname === "/sign-in" || pathname === "/onboarding") return null;
  const current = (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));
  const links = (className: string | undefined) =>
    TABS.map((tab) => (
      <Link key={tab.href} href={tab.href} className={className} aria-current={current(tab.href) ? "page" : undefined}>
        <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden>
          <path d={tab.icon} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round" />
        </svg>
        <span>{t(tab.label, tab.label_ar)}</span>
      </Link>
    ));
  return (
    <>
      {/* On the Brief the tabs sit on the dark Brief canvas, whatever the theme. */}
      <nav className={`${s.tabs} ${pathname === "/" ? "brief-canvas" : ""}`} aria-label={t("Tabs", "التبويبات")}>
        {links(s.tab)}
      </nav>
      {/* The sidebar is chrome: it follows the Reader's theme. */}
      <nav className={s.side} aria-label={t("Sidebar", "الشريط الجانبي")}>
        <p className={s.brand}>
          <Icon name="sun" size={26} />
          {t("Morning Brief", "الموجز الصباحي")}
        </p>
        {links(s.sideLink)}
        <div id={SIDEBAR_TOPICS} />
      </nav>
    </>
  );
}

/** The Brief's Topics in the sidebar, in Brief order, each with its Item count; picking one calls `onPick` with the Topic. */
export function SidebarTopics({ brief, onPick }: { brief: Brief; onPick(topic: string): void }) {
  const { lang, t } = useLanguage();
  const [slot, setSlot] = useState<HTMLElement | null>(null);
  useEffect(() => setSlot(document.getElementById(SIDEBAR_TOPICS)), []);
  if (!slot) return null;
  return createPortal(
    <>
      <h2 className={s.sideTitle}>{t("Topics", "المواضيع")}</h2>
      <ul className={s.sideTopics}>
        {brief.groups.flatMap((g) =>
          g.kind === "topic" ? [{ topic: g.topic!, count: g.item_ids.length }] : [],
        ).map(({ topic, count }) => (
          <li key={topic}>
            <button type="button" className={s.sideTopic} onClick={() => onPick(topic)}>
              <span>{topicName(brief, topic, lang)}</span>
              <span className={s.count}>{formatNumber(count, lang)}</span>
            </button>
          </li>
        ))}
      </ul>
    </>,
    slot,
  );
}
