// Me › Display (rework ticket 07, spec #6): how the Brief looks and is
// arranged, saved to the Reader's Display so it follows them to every device:
// theme, accent, text size and density (ticket 07), a Layout per screen
// (ticket 09), and the arranging controls (ticket 11): the Reader's Topics in
// Brief order with move, pin, collapse and blur, the Cover's Widgets and the
// dock.
import Link from "next/link";
import { getAppContext } from "@/server/app";
import { composeBrief, type BriefGroup } from "@/server/brief/compose";
import { requireReaderPage } from "@/server/readers/page-session";
import { followedTopicIds, listCatalog } from "@/server/topics/catalog";
import { Chevron } from "../../_components/chevron";
import c from "../../_components/chrome.module.css";
import { DisplayControls } from "../../_components/display-controls";
import { T } from "../../_components/language";

export const dynamic = "force-dynamic";

export default async function DisplayPage() {
  const reader = await requireReaderPage();
  const ctx = getAppContext();
  const catalog = listCatalog(ctx, reader.id);
  // The Topics as the Brief ranks them (the controls arrange them by the Display on screen). Before the first
  // Edition there is no ranking: the followed Topics in Catalog order.
  const brief = composeBrief(ctx, reader);
  const groups: BriefGroup[] = brief.edition
    ? brief.groups.filter((g) => g.kind === "topic")
    : followedTopicIds(ctx, reader.id).map((topic, i) => ({
        kind: "topic",
        topic,
        pinned: false,
        collapsed: false,
        item_ids: [],
        nothing_qualified: true,
        note: null,
        sensitive: catalog.find((t) => t.id === topic)?.sensitive ?? false,
        rank: i + 1,
      }));
  const names = Object.fromEntries(catalog.map((t) => [t.id, { en: t.name, ar: t.name_ar }]));
  return (
    <main className={c.screen}>
      <Link href="/me" className={c.back}>
        <Chevron to="back" size={18} />
        <span>
          <T en="Back to Me" ar="العودة إلى «أنا»" />
        </span>
      </Link>
      <h1>
        <T en="Display" ar="العرض" />
      </h1>
      <p className={c.lede}>
        <T
          en="How your Brief looks and is arranged, on every device you sign in on. It never changes what's in it or how it ranks."
          ar="شكل موجزك وترتيبه على كل جهاز تسجّل الدخول منه. لا يغيّر شيئًا من محتواه ولا من ترتيب أهميته."
        />
      </p>
      <DisplayControls topicGroups={groups} topicNames={names} />
    </main>
  );
}
