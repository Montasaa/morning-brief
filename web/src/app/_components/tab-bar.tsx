"use client";
// The bottom tabs: Brief · Threads · Saved & Search · Me.
import Link from "next/link";
import { usePathname } from "next/navigation";
import s from "./tab-bar.module.css";

const TABS = [
  { href: "/", label: "Brief", icon: "M5 4h14v16H5zM8 8h8M8 12h8M8 16h5" },
  { href: "/threads", label: "Threads", icon: "M6 5v14M6 7h7M6 12h10M6 17h6" },
  { href: "/saved", label: "Saved & Search", icon: "M7 4h10v16l-5-4-5 4z" },
  { href: "/me", label: "Me", icon: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 20c1.5-3.5 4.5-5 8-5s6.5 1.5 8 5" },
] as const;

export function TabBar() {
  const pathname = usePathname();
  const current = (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));
  return (
    <nav className={`${s.tabs} ${pathname === "/" ? s.onBrief : ""}`} aria-label="Tabs">
      {TABS.map((t) => (
        <Link key={t.href} href={t.href} className={s.tab} aria-current={current(t.href) ? "page" : undefined}>
          <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden>
            <path d={t.icon} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round" />
          </svg>
          <span>{t.label}</span>
        </Link>
      ))}
    </nav>
  );
}
