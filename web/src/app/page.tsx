// The Brief tab: the Swipe Brief built from the latest Edition, for the signed-in Reader.
import { getAppContext } from "@/server/app";
import { composeBrief } from "@/server/brief/compose";
import { requireReaderPage } from "@/server/readers/page-session";
import { T } from "./_components/language";
import { Placeholder } from "./_components/placeholder";
import { SwipeBrief } from "./_components/swipe-brief";

export const dynamic = "force-dynamic";

export default async function BriefPage() {
  await requireReaderPage();
  const brief = composeBrief(getAppContext());

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
  return <SwipeBrief brief={brief} basePath={getAppContext().config.basePath} />;
}
