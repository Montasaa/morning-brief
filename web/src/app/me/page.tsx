// The Me tab: the Reader's Interest Profile. The account (who is signed in,
// the Owner's Invites, Sign out) sits on top (ticket 06); below it the Topics
// they follow, their language (ticket 04) and their city (ticket 07), and the
// home-screen install and notification settings (ticket 18). Changes are saved
// as they are made. Display (rework ticket 07) has its own screen, Me › Display,
// and so does changing your password (issue #17), Me › Password.
import { getAppContext } from "@/server/app";
import { requireReaderPage } from "@/server/readers/page-session";
import { getProfile } from "@/server/readers/profile";
import { listCatalog } from "@/server/topics/catalog";
import { CREATED_TOPICS_LIMIT, createdTopicCount } from "@/server/topics/reader-topics";
import Link from "next/link";
import { AccountBar } from "../_components/account-bar";
import { Chevron } from "../_components/chevron";
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
      <ul className={`${c.rows} ${c.rowsRuled}`}>
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
            <Chevron to="forward" />
          </Link>
        </li>
        <li>
          <Link href="/me/password" className={c.row}>
            <span className={c.rowText}>
              <span className={c.rowTitle}>
                <T en="Password" ar="كلمة المرور" />
              </span>
              <span className={c.rowSub}>
                <T en="Change the password you sign in with" ar="غيّر كلمة المرور التي تسجّل الدخول بها" />
              </span>
            </span>
            <Chevron to="forward" />
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
