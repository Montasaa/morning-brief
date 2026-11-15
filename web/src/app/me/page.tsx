// The Me tab: the Reader's Interest Profile. The account (who is signed in,
// the Owner's Invites, Sign out) sits on top (ticket 06); below it the Topics
// they follow, their language (ticket 04) and their city (ticket 07), and the
// home-screen install and notification settings (ticket 18). Changes are saved
// as they are made.
import { getAppContext } from "@/server/app";
import { requireReaderPage } from "@/server/readers/page-session";
import { getProfile } from "@/server/readers/profile";
import { listCatalog } from "@/server/topics/catalog";
import { CREATED_TOPICS_LIMIT, createdTopicCount } from "@/server/topics/reader-topics";
import { AccountBar } from "../_components/account-bar";
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
