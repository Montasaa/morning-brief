// The Saved & Search tab. Ticket 15 (Saved and Search) fills it in.
import { T } from "../_components/language";
import { Placeholder } from "../_components/placeholder";

export default function SavedPage() {
  return (
    <Placeholder title={<T en="Saved & Search" ar="المحفوظ والبحث" />}>
      <T
        en="Your saved Items, and search across every past Edition, will be here."
        ar="ستجد هنا الأخبار التي حفظتها، والبحث في كل الطبعات السابقة."
      />
    </Placeholder>
  );
}
