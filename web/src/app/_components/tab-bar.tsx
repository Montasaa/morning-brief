"use client";
// The bottom tabs: Brief · Threads · Saved & Search · Me, in the Reader's language.
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useLanguage } from "./language";
import s from "./tab-bar.module.css";

const TABS = [
  { href: "/", label: "Brief", label_ar: "الموجز", icon: "M5 4h14v16H5zM8 8h8M8 12h8M8 16h5" },
  { href: "/threads", label: "Threads", label_ar: "القصص المتواصلة", icon: "M6 5v14M6 7h7M6 12h10M6 17h6" },
  { href: "/saved", label: "Saved & Search", label_ar: "المحفوظ والبحث", icon: "M7 4h10v16l-5-4-5 4z" },
  { href: "/me", label: "Me", label_ar: "أنا", icon: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 20c1.5-3.5 4.5-5 8-5s6.5 1.5 8 5" },
] as const;

export function TabBar() {
  const pathname = usePathname();
  const { t } = useLanguage();
  // Signed out there is nowhere to go yet: the sign-in page has no tabs.
  if (pathname === "/sign-in") return null;
  const current = (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));
  return (
    <nav className={`${s.tabs} ${pathname === "/" ? s.onBrief : ""}`} aria-label={t("Tabs", "التبويبات")}>
      {TABS.map((tab) => (
        <Link key={tab.href} href={tab.href} className={s.tab} aria-current={current(tab.href) ? "page" : undefined}>
          <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden>
            <path d={tab.icon} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round" />
          </svg>
          <span>{t(tab.label, tab.label_ar)}</span>
        </Link>
      ))}
    </nav>
  );
}
