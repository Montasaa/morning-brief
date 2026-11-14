// The Saved & Search tab. Ticket 15 (Saved and Search) fills it in.
import { requireReaderPage } from "@/server/readers/page-session";
import { T } from "../_components/language";
import { Placeholder } from "../_components/placeholder";

export const dynamic = "force-dynamic";

export default async function SavedPage() {
  await requireReaderPage();
  return (
    <Placeholder title={<T en="Saved & Search" ar="المحفوظ والبحث" />}>
      <T
        en="Your saved Items, and search across every past Edition, will be here."
        ar="ستجد هنا الأخبار التي حفظتها، والبحث في كل الطبعات السابقة."
      />
    </Placeholder>
  );
}
