// Me › Display (rework ticket 07, spec #6): how the Brief looks, saved to the
// Reader's Display so it follows them to every device. This ticket brings
// theme, accent, text size and density; tickets 09 and 11 add Layouts and the
// arranging controls (Topics, Widgets, dock) to this same screen.
import Link from "next/link";
import { requireReaderPage } from "@/server/readers/page-session";
import c from "../../_components/chrome.module.css";
import { DisplaySettings } from "../../_components/display-settings";
import { T } from "../../_components/language";

export const dynamic = "force-dynamic";

export default async function DisplayPage() {
  await requireReaderPage();
  return (
    <main className={c.screen}>
      <Link href="/me" className={c.back}>
        <svg className={c.chevron} viewBox="0 0 24 24" width="18" height="18" aria-hidden>
          <path d="M15 5l-7 7 7 7" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <span>
          <T en="Back to Me" ar="العودة إلى «أنا»" />
        </span>
      </Link>
      <h1>
        <T en="Display" ar="العرض" />
      </h1>
      <p className={c.lede}>
        <T
          en="How your Brief looks, on every device you sign in on. It never changes what's in it."
          ar="شكل موجزك على كل جهاز تسجّل الدخول منه. لا يغيّر شيئًا من محتواه."
        />
      </p>
      <DisplaySettings />
    </main>
  );
}
