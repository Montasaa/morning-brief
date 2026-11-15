// The Me tab: the Reader's Interest Profile. The account (who is signed in,
// the Owner's Invites, Sign out) sits on top (ticket 06); below it the Topics
// they follow, their language (ticket 04) and their city (ticket 07), and the
// home-screen install and notification settings (ticket 18). Changes are saved
// as they are made. Display (rework ticket 07) has its own screen, Me › Display.
import { getAppContext } from "@/server/app";
import { requireReaderPage } from "@/server/readers/page-session";
import { getProfile } from "@/server/readers/profile";
import { listCatalog } from "@/server/topics/catalog";
import { CREATED_TOPICS_LIMIT, createdTopicCount } from "@/server/topics/reader-topics";
import Link from "next/link";
import { AccountBar } from "../_components/account-bar";
import c from "../_components/chrome.module.css";
import { ProfileSettings } from "../_components/interest-profile";
import s from "../_components/interest-profile.module.css";
import { T } from "../_components/language";
import { NotificationSettings } from "../_components/notifications";
import { YourTopics } from "../_components/your-topics";

export const dynamic = "force-dynamic";

export default async function MePage() {
  const reader = await requireReaderPage();
  const ctx = getAppContext();
  const profile = getProfile(ctx, reader);
  const catalog = listCatalog(ctx, reader.id);
  return (
    <main className={s.screen}>
      <AccountBar reader={reader} basePath={ctx.config.basePath} />
      <h1>
        <T en="Me" ar="أنا" />
      </h1>
      <p className={s.lede}>
        <T
          en="What your Brief covers. Changes apply to your next Brief."
          ar="ما يغطيه موجزك. تسري التغييرات على موجزك التالي."
        />
      </p>
      <ul className={c.rows} style={{ marginTop: 16, borderTop: "1px solid var(--line)" }}>
        <li>
          <Link href="/me/display" className={c.row}>
            <span className={c.rowText}>
              <span className={c.rowTitle}>
                <T en="Display" ar="العرض" />
              </span>
              <span className={c.rowSub}>
                <T en="Theme, accent, text size and density" ar="السمة ولون التمييز وحجم النص والكثافة" />
              </span>
            </span>
            <svg className={c.chevron} viewBox="0 0 24 24" width="20" height="20" aria-hidden>
              <path d="M9 5l7 7-7 7" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </Link>
        </li>
      </ul>
      <ProfileSettings
        key={profile.topics.join(" ")} // a Topic created below is followed: start again from the saved follows
        basePath={ctx.config.basePath}
        topics={catalog}
        initialTopics={profile.topics}
        initialCity={profile.city}
      />
      <YourTopics
        basePath={ctx.config.basePath}
        topics={catalog.filter((t) => t.mine)}
        created={createdTopicCount(ctx, reader.id)}
        limit={reader.role === "owner" ? null : CREATED_TOPICS_LIMIT}
      />
      <NotificationSettings
        basePath={ctx.config.basePath}
        publicKey={ctx.services.push.publicKey}
        initial={profile.notifications}
      />
    </main>
  );
}
