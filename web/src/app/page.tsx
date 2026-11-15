// The Brief tab: the Brief built from the latest Edition, for the signed-in Reader,
// in their Layout for this screen (Swipe, Front Page or List).
import { redirect } from "next/navigation";
import { getAppContext } from "@/server/app";
import { composeBrief } from "@/server/brief/compose";
import { requireReaderPage } from "@/server/readers/page-session";
import { isOnboarded } from "@/server/readers/profile";
import { followedTopicIds } from "@/server/topics/catalog";
import { withWidgets } from "@/server/widgets";
import { BriefLayouts } from "./_components/brief-layouts";
import { T } from "./_components/language";
import { Placeholder } from "./_components/placeholder";

export const dynamic = "force-dynamic";

export default async function BriefPage() {
  const reader = await requireReaderPage();
  const ctx = getAppContext();
  // A first-time Reader picks their Topics, language and city before their first Brief.
  if (!isOnboarded(ctx, reader.id)) redirect("/onboarding");
  const brief = await withWidgets(ctx, reader, composeBrief(ctx, reader));

  if (!brief.edition) {
    return (
      <Placeholder title={<T en="Morning Brief" ar="الموجز الصباحي" />}>
        <T
          en="No Edition yet. The next one arrives after the morning gathering run."
          ar="لا توجد طبعة بعد. تصل الطبعة التالية بعد جولة الجمع الصباحية."
        />
      </Placeholder>
    );
  }
  if (followedTopicIds(ctx, reader.id).length === 0) {
    return (
      <Placeholder title={<T en="Morning Brief" ar="الموجز الصباحي" />}>
        <T
          en="You don't follow any Topics, so your Brief is empty. Pick some on the Me tab."
          ar="لا تتابع أي موضوع، لذا موجزك فارغ. اختر بعضها من تبويب «أنا»."
        />
      </Placeholder>
    );
  }
  return <BriefLayouts brief={brief} basePath={ctx.config.basePath} />;
}
